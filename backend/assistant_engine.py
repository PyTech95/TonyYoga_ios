"""Shared streaming brain, durable conversation memory and cost guardrails."""
import asyncio
import hashlib
import re
from datetime import timedelta
from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from anyio import CancelScope
from openai import AsyncOpenAI
from core import db, gen_id, now_utc, logger, client_ip, is_local_ip
from routers.settings import get_setting
from assistant_audio import openai_key, provider
import assistant_gemini as gemini
from assistant_knowledge import catalog, context_text, reply_links, account_context

_indexes_ready = False
_index_lock = asyncio.Lock()


async def ensure_indexes():
    global _indexes_ready
    async with _index_lock:
        if _indexes_ready:
            return
        await db.assistant_audio.create_index('expires_at', expireAfterSeconds=0)
        await db.assistant_requests.create_index('expires_at', expireAfterSeconds=0)
        await db.chatbot_sessions.create_index('expires_at', expireAfterSeconds=0)
        await db.chatbot_sessions.create_index('id', unique=True, name='assistant_session_id_unique')
        _indexes_ready = True


async def request_guard(request: Request):
    if await get_setting('assistant_enabled') is False:
        raise HTTPException(403, 'The assistant is currently disabled.')
    await ensure_indexes()
    # Shared DB counters also protect multi-worker installations. Per visitor IP (behind nginx the
    # direct peer is always 127.0.0.1, so client_ip reads the proxy's header).
    identity = client_ip(request)
    bucket = int(now_utc().timestamp() // 60)
    key = hashlib.sha256(f'{identity}:{bucket}'.encode()).hexdigest()
    doc = await db.assistant_requests.find_one_and_update(
        {'_id': key}, {'$inc': {'count': 1}, '$set': {'expires_at': now_utc() + timedelta(minutes=2)}},
        upsert=True, return_document=ReturnDocument.AFTER, projection={'_id': 0, 'count': 1})
    # Without a client IP header every visitor looks like 127.0.0.1: then this is a site-wide cap.
    if doc['count'] > (400 if is_local_ip(identity) else 40):
        raise HTTPException(429, 'Please wait a minute before trying again.')


async def check_limits(sid):
    daily = int(await get_setting('assistant_daily_limit') or 0)
    per_session = int(await get_setting('assistant_session_limit') or 0)
    day = now_utc().date().isoformat()
    usage = await db.assistant_usage.find_one({'_id': day}, {'_id': 0, 'count': 1}) or {}
    session = await db.chatbot_sessions.find_one({'id': sid}, {'_id': 0, 'turns': 1}) or {}
    if daily > 0 and usage.get('count', 0) >= daily:
        raise HTTPException(429, 'Tony’s assistant has reached today’s limit. Please visit Support or try tomorrow.')
    if per_session > 0 and session.get('turns', 0) >= per_session:
        raise HTTPException(429, 'This conversation has reached its limit. Please visit Support for more help.')


# ---------------------------------------------------------------------------
# [[TEAM|category|summary|email]] — the assistant's "write to the team" action. Removed from the
# text before anything reaches the visitor (stream, saved history, speech).

_TAG_START = re.compile(r'\[\[\s*TEAM\s*[|:]', re.I)
# A buffer that ends with something that could still become "[[TEAM|" is held back.
_TAG_PARTIAL = re.compile(r'\[(?:\[\s*(?:T(?:E(?:A(?:M\s*)?)?)?)?)?$', re.I)


class TagFilter:
    """Removes the [[TEAM|…]] line from streamed text. The tag runs from "[[TEAM|" to the end of
    its line (the prompt puts it alone on the last line), so "]]" or "|" inside it, or a single "]"
    at its end, can't make part of it show. Any other "[[…]]" text is left alone."""

    def __init__(self):
        self.buf = ''
        self.tags = []

    def feed(self, text):
        self.buf += text
        out = ''
        while True:
            m = _TAG_START.search(self.buf)
            if not m:
                p = _TAG_PARTIAL.search(self.buf)
                cut = p.start() if p else len(self.buf)
                out, self.buf = out + self.buf[:cut], self.buf[cut:]
                return out
            out += self.buf[:m.start()]
            rest = self.buf[m.start():]
            nl = rest.find('\n')
            if nl == -1:
                self.buf = rest   # wait for the end of the line (or of the answer)
                return out
            self.tags.append(rest[2:nl])
            self.buf = rest[nl + 1:]

    def flush(self):
        rest, self.buf = self.buf, ''
        m = _TAG_START.search(rest)
        if m:
            self.tags.append(rest[m.start() + 2:])
            return rest[:m.start()]
        return rest


def parse_tag(inner):
    body = re.sub(r'^\s*TEAM\s*[|:]', '', inner, flags=re.I).strip()
    body = re.sub(r'\]+\s*$', '', body).strip()
    parts = [x.strip() for x in body.split('|')]
    category = parts[0].lower() if parts and parts[0].lower() in ('access', 'payment', 'login', 'order', 'class', 'other') else 'other'
    email = ''
    middle = parts[1:]
    if len(middle) >= 2 and '@' in middle[-1] and ' ' not in middle[-1]:
        email = middle.pop()
    elif len(middle) >= 2 and not middle[-1]:
        middle.pop()
    return {'category': category, 'summary': ' | '.join(x for x in middle if x), 'email': email}


# ---------------------------------------------------------------------------
# Provider calls

_openai_clients: dict = {}
_reasoning_ok: dict = {}       # model -> reasoning_effort that model accepted ('' = none accepted)
_REASONING_TRY = ['none', 'minimal', 'low']


def _openai(key):
    client = _openai_clients.get(key)
    if client is None:
        if len(_openai_clients) > 4:
            _openai_clients.clear()
        client = _openai_clients[key] = AsyncOpenAI(api_key=key, timeout=60.0, max_retries=1)
    return client


def _bad_reasoning(exc):
    text = str(exc).lower()
    return type(exc).__name__ in ('BadRequestError', 'UnprocessableEntityError') and 'reasoning' in text


async def _openai_stream(key, model, messages, max_tokens):
    """Answer text from OpenAI as it arrives, with the shortest reasoning the model accepts."""
    client = _openai(key)
    tries = [_reasoning_ok[model]] if model in _reasoning_ok else _REASONING_TRY + ['']
    for effort in tries:
        kwargs = {'reasoning_effort': effort} if effort else {}
        try:
            stream = await client.chat.completions.create(model=model, messages=messages, max_completion_tokens=max_tokens,
                                                          stream=True, **kwargs)
        except Exception as exc:
            if effort and _bad_reasoning(exc):
                continue
            raise
        _reasoning_ok[model] = effort
        async with stream:
            async for chunk in stream:
                text = chunk.choices[0].delta.content if chunk.choices else None
                if text:
                    yield text
        return


class _NewSession(Exception):
    """The conversation belongs to another account: continue in a fresh one."""


# ---------------------------------------------------------------------------

async def reply_stream(sid, message, user=None, mode='text', ctx=None):
    """Events: {'type': 'delta', text} … then {'type': 'done', reply, links, handoff?}."""
    ctx = ctx or {}
    mode = 'voice' if mode == 'voice' else 'text'
    sid = sid or gen_id()
    await check_limits(sid)
    ai = await provider()
    key = await (gemini.gemini_key() if ai == 'gemini' else openai_key())
    now = now_utc()
    try:
        await db.chatbot_sessions.update_one({'id': sid}, {'$setOnInsert': {
            'id': sid, 'messages': [], 'turns': 0, 'created_at': now.isoformat(),
            'expires_at': now + timedelta(days=30)}}, upsert=True)
    except DuplicateKeyError:
        pass  # Another worker created the same conversation first.
    # A per-conversation lease prevents simultaneous turns overwriting history.
    lease = gen_id()
    result = await db.chatbot_sessions.update_one(
        {'id': sid, '$or': [{'busy_until': {'$lt': now}}, {'busy_until': {'$exists': False}}]},
        {'$set': {'busy_until': now + timedelta(seconds=100), 'lease': lease}})
    if not result.matched_count:
        raise HTTPException(409, 'Please wait for the current answer before sending another question.')
    try:
        session, knowledge, account = await asyncio.gather(
            db.chatbot_sessions.find_one({'id': sid}, {'_id': 0}),
            catalog(), account_context(user))
        session = session or {}
        owner = session.get('owner_id')
        me = (user or {}).get('id')
        if owner and owner != me:
            # A conversation started by a signed-in student stays theirs: anyone else in the same
            # browser (signed out, or another account) starts a new one and never sees it.
            raise _NewSession()
        if me and not owner:
            await db.chatbot_sessions.update_one({'id': sid, 'lease': lease}, {'$set': {'owner_id': me}})
        system = context_text(knowledge, account, mode, bool(user))
        history = [{'role': 'assistant' if m['role'] == 'assistant' else 'user', 'content': m['text']}
                   for m in session.get('messages', [])[-16:] if m.get('text')]
        history.append({'role': 'user', 'content': message})
        reply, tags = '', TagFilter()
        max_tokens = 380 if mode == 'voice' else 650
        if ai == 'gemini':
            model = await get_setting('assistant_gemini_model') or gemini.DEFAULT_MODEL
            source = gemini.stream_chat(system, history, model, max_tokens=max_tokens)
        else:
            model = await get_setting('assistant_openai_model')
            source = _openai_stream(key, model, [{'role': 'system', 'content': system}, *history], max_tokens)
        loop = asyncio.get_running_loop()
        deadline = loop.time() + 65
        chunks = source.__aiter__()
        try:
            while True:
                left = deadline - loop.time()
                if left <= 0:
                    raise TimeoutError()
                try:
                    text = await asyncio.wait_for(chunks.__anext__(), left)
                except StopAsyncIteration:
                    break
                safe = tags.feed(text)
                if safe:
                    reply += safe
                    yield {'type': 'delta', 'text': safe, 'session_id': sid}
        finally:
            with CancelScope(shield=True):
                try:
                    await chunks.aclose()
                except Exception:
                    pass
        rest = tags.flush()
        if rest:
            reply += rest
            yield {'type': 'delta', 'text': rest, 'session_id': sid}
        reply = reply.strip()
        if not reply and not tags.tags:
            raise HTTPException(502, 'I could not generate an answer. Please try again.')
        handoff = None
        if tags.tags:
            from routers.helpdesk import create_help_request
            fields = parse_tag(tags.tags[0])
            transcript = [{'role': m.get('role'), 'text': m.get('text'), 'at': m.get('at')} for m in session.get('messages', [])[-22:]]
            transcript += [{'role': 'visitor', 'text': message, 'at': now.isoformat()},
                           {'role': 'assistant', 'text': reply, 'at': now_utc().isoformat()}]
            try:
                handoff = await create_help_request(category=fields['category'], summary=fields['summary'], user=user,
                                                    email=fields['email'], session_id=sid, transcript=transcript,
                                                    ip=ctx.get('ip', ''), language=ctx.get('lang', ''))
            except Exception as exc:
                logger.warning('Assistant hand-off failed (%s)', type(exc).__name__)
                handoff = {'ok': False, 'reason': 'error', 'message': 'I could not send your message. Please use the Support page.'}
            note = ''
            if not handoff.get('ok'):
                note = handoff.get('message') or 'I could not send your message. Please use the Support page.'
            elif not reply:
                note = 'I’ve sent your message to Tony’s team. You’ll get an answer by email.'
            if note:
                # Streamed like the rest of the answer, so it is shown and spoken (voice) too.
                text = ('\n' if reply else '') + note
                reply = (reply + text).strip()
                yield {'type': 'delta', 'text': text, 'session_id': sid}
        links = reply_links(reply, knowledge)
        if handoff and not handoff.get('ok') and all(l['href'] != '/support' for l in links):
            links = (links + [{'label': 'Contact the team', 'href': '/support'}])[:3]
        turns = [{'role': 'visitor', 'text': message, 'at': now.isoformat()},
                 {'role': 'assistant', 'text': reply, 'links': links, 'at': now_utc().isoformat(),
                  **({'handoff_ref': handoff.get('ref')} if handoff and handoff.get('ok') else {})}]
        await db.chatbot_sessions.update_one({'id': sid, 'lease': lease}, {
            '$push': {'messages': {'$each': turns, '$slice': -40}}, '$inc': {'turns': 1},
            '$set': {'updated_at': now_utc().isoformat(), 'expires_at': now_utc() + timedelta(days=30),
                     'user_id': (user or {}).get('id')}})
        day = now_utc().date().isoformat()
        await db.assistant_usage.update_one({'_id': day}, {'$inc': {'count': 1}, '$set': {'date': day}}, upsert=True)
        done = {'type': 'done', 'session_id': sid, 'reply': reply, 'links': links}
        if handoff:
            done['handoff'] = {k: handoff.get(k) for k in ('ok', 'ref', 'updated', 'reason', 'message') if handoff.get(k) is not None}
        yield done
    except _NewSession:
        new_sid = gen_id()
        async for event in reply_stream(new_sid, message, user, mode, ctx):
            yield event
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Assistant reply failed (%s)', type(exc).__name__)
        raise HTTPException(502, 'I’m having trouble answering right now. Please try again in a moment.')
    finally:
        # A disconnected SSE client must not leave a session locked until lease expiry.
        with CancelScope(shield=True):
            async with asyncio.timeout(5):
                await db.chatbot_sessions.update_one({'id': sid, 'lease': lease}, {'$unset': {'busy_until': '', 'lease': ''}})
