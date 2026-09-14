"""Shared streaming brain, durable conversation memory and cost guardrails."""
import asyncio
import hashlib
from datetime import timedelta
from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from anyio import CancelScope
from openai import AsyncOpenAI
from core import db, gen_id, now_utc, logger
from routers.settings import get_setting
from assistant_audio import openai_key
from assistant_knowledge import catalog, context_text, reply_links

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
    # Shared DB counters also protect multi-worker installations.
    identity = request.client.host if request.client else 'unknown'
    bucket = int(now_utc().timestamp() // 60)
    key = hashlib.sha256(f'{identity}:{bucket}'.encode()).hexdigest()
    doc = await db.assistant_requests.find_one_and_update(
        {'_id': key}, {'$inc': {'count': 1}, '$set': {'expires_at': now_utc() + timedelta(minutes=2)}},
        upsert=True, return_document=ReturnDocument.AFTER, projection={'_id': 0, 'count': 1})
    if doc['count'] > 40:
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


async def reply_stream(sid, message, user=None):
    sid = sid or gen_id()
    await check_limits(sid)
    key = await openai_key()
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
        session = await db.chatbot_sessions.find_one({'id': sid}, {'_id': 0}) or {}
        knowledge = await catalog()
        messages = [{'role': 'system', 'content': context_text(knowledge)}]
        messages.extend({'role': 'assistant' if m['role'] == 'assistant' else 'user', 'content': m['text']}
                        for m in session.get('messages', [])[-16:])
        messages.append({'role': 'user', 'content': message})
        model = await get_setting('assistant_openai_model')
        reply = ''
        async with asyncio.timeout(65):
            async with AsyncOpenAI(api_key=key, timeout=60.0, max_retries=1) as client:
                stream = await client.chat.completions.create(
                    model=model, messages=messages, max_completion_tokens=450, stream=True)
                async with stream:
                    async for chunk in stream:
                        text = chunk.choices[0].delta.content if chunk.choices else None
                        if text:
                            reply += text
                            yield {'type': 'delta', 'text': text, 'session_id': sid}
        if not reply.strip():
            raise HTTPException(502, 'I could not generate an answer. Please try again.')
        links = reply_links(reply, knowledge)
        turns = [{'role': 'visitor', 'text': message, 'at': now.isoformat()},
                 {'role': 'assistant', 'text': reply, 'links': links, 'at': now_utc().isoformat()}]
        await db.chatbot_sessions.update_one({'id': sid, 'lease': lease}, {
            '$push': {'messages': {'$each': turns, '$slice': -40}}, '$inc': {'turns': 1},
            '$set': {'updated_at': now_utc().isoformat(), 'expires_at': now_utc() + timedelta(days=30),
                     'user_id': (user or {}).get('id')}})
        day = now_utc().date().isoformat()
        await db.assistant_usage.update_one({'_id': day}, {'$inc': {'count': 1}, '$set': {'date': day}}, upsert=True)
        yield {'type': 'done', 'session_id': sid, 'reply': reply.strip(), 'links': links}
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