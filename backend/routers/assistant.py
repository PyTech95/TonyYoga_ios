"""Tony's public text/voice assistant and existing admin lead tools."""
import asyncio
import json
import re
from contextlib import aclosing
from typing import Optional
from urllib.parse import quote
from uuid import UUID
from fastapi import Request, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from core import api, db, gen_id, now_utc, logger, require_role, get_optional_user
from routers.settings import get_setting
from assistant_engine import reply_stream, request_guard, check_limits
from assistant_audio import speech, transcribe


class ChatIn(BaseModel):
    session_id: Optional[UUID] = None
    message: str = Field(min_length=1, max_length=2000)


class LinkOut(BaseModel):
    label: str
    href: str


class ReplyOut(BaseModel):
    session_id: str
    reply: str
    links: list[LinkOut] = []
    transcript: Optional[str] = None
    audio_url: Optional[str] = None
    audio_error: Optional[str] = None
    end_conversation: bool = False


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: Optional[str] = None


class LeadIn(BaseModel):
    session_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    channel: Optional[str] = 'whatsapp'
    goal: Optional[str] = None
    interest: Optional[str] = None


@api.get('/assistant/config')
async def assistant_config():
    return {'enabled': await get_setting('assistant_enabled') is not False,
            'greeting': await get_setting('assistant_greeting'),
            'popup_delay': max(10, min(15, int(await get_setting('assistant_popup_delay') or 12))),
            'whatsapp': await get_setting('social_whatsapp') or '', 'ai_disclosure': True}


async def answer(payload, user):
    if not payload.message.strip():
        raise HTTPException(400, 'Please enter a question.')
    result = None
    async for event in reply_stream(str(payload.session_id) if payload.session_id else None, payload.message.strip(), user):
        if event['type'] == 'done':
            result = event
    return result


@api.post('/assistant/chat', response_model=ReplyOut, dependencies=[Depends(request_guard)])
async def assistant_chat(payload: ChatIn, user: Optional[dict] = Depends(get_optional_user)):
    return await answer(payload, user)


@api.post('/assistant/chat/stream', dependencies=[Depends(request_guard)])
async def assistant_chat_stream(payload: ChatIn, user: Optional[dict] = Depends(get_optional_user)):
    if not payload.message.strip():
        raise HTTPException(400, 'Please enter a question.')
    sid = str(payload.session_id) if payload.session_id else gen_id()
    await check_limits(sid)

    async def events():
        try:
            async with aclosing(reply_stream(sid, payload.message.strip(), user)) as stream:
                async for event in stream:
                    yield 'data: ' + json.dumps(event) + '\n\n'
        except HTTPException as exc:
            yield 'data: ' + json.dumps({'type': 'error', 'message': exc.detail}) + '\n\n'
    return StreamingResponse(events(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@api.post('/assistant/tts', dependencies=[Depends(request_guard)])
async def assistant_tts(payload: TTSIn):
    if not payload.text.strip():
        raise HTTPException(400, 'Speech text cannot be empty.')
    return {'audio_url': await speech(payload.text, payload.voice), 'mime': 'audio/mpeg'}


@api.get('/assistant/greeting', dependencies=[Depends(request_guard)])
async def assistant_greeting():
    text = await get_setting('assistant_greeting')
    return {'text': text, 'audio_url': await speech(text), 'mime': 'audio/mpeg'}


@api.get('/assistant/audio/{audio_id}')
async def assistant_audio(audio_id: UUID):
    doc = await db.assistant_audio.find_one({'id': str(audio_id), 'expires_at': {'$gt': now_utc()}}, {'_id': 0, 'audio': 1})
    if not doc:
        raise HTTPException(404, 'This audio has expired. Please start voice again.')
    return Response(bytes(doc['audio']), media_type='audio/mpeg', headers={'Cache-Control': 'private, max-age=3600'})


@api.post('/assistant/voice', response_model=ReplyOut, dependencies=[Depends(request_guard)])
async def assistant_voice(audio: UploadFile = File(...), session_id: Optional[UUID] = Form(None),
                          speak: bool = Form(True), user: Optional[dict] = Depends(get_optional_user)):
    await check_limits(str(session_id) if session_id else None)
    transcript = await transcribe(audio)
    result = await answer(ChatIn(session_id=session_id, message=transcript), user)
    result['transcript'] = transcript
    result['end_conversation'] = bool(re.fullmatch(
        r"(?:bye|goodbye|bye bye|stop|stop listening|end (?:the )?(?:call|conversation)|that'?s all|adiós|hasta luego)[.!\s]*", transcript.strip(), re.I))
    if speak:
        try:
            result['audio_url'] = await speech(result['reply'])
        except HTTPException as exc:
            result['audio_error'] = exc.detail
    return result


@api.get('/admin/assistant/usage')
async def admin_assistant_usage(request: Request):
    from datetime import timedelta
    await require_role(request, ['admin'])
    days = [(now_utc().date() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    docs = await db.assistant_usage.find({'date': {'$in': days}}, {'_id': 0, 'date': 1, 'count': 1}).to_list(7)
    counts = {d['date']: d.get('count', 0) for d in docs}
    return {'date': days[-1], 'count': counts.get(days[-1], 0),
            'limit': int(await get_setting('assistant_daily_limit') or 0),
            'session_limit': int(await get_setting('assistant_session_limit') or 0),
            'history': [{'date': d, 'count': counts.get(d, 0)} for d in days]}


@api.post('/assistant/lead')
async def assistant_lead(payload: LeadIn, user: Optional[dict] = Depends(get_optional_user)):
    if not (payload.name or payload.email or payload.phone):
        raise HTTPException(400, 'Please share your name and a way to reach you.')
    lead = {'id': gen_id(), **payload.model_dump(), 'user_id': (user or {}).get('id'),
            'status': 'new', 'created_at': now_utc().isoformat()}
    await db.ai_leads.insert_one(lead)
    if payload.session_id:
        await db.chatbot_sessions.update_one({'id': payload.session_id}, {'$set': {'lead_id': lead['id'], 'captured': True}})
    if payload.email:
        try:
            from email_service import send_enquiry_ack
            await send_enquiry_ack(payload.email, payload.name, payload.interest)
        except Exception:
            logger.warning('Assistant lead acknowledgment unavailable')
    try:
        if await get_setting('lead_alert_enabled') is not False:
            alert_to = await get_setting('lead_alert_whatsapp') or await get_setting('social_whatsapp')
            if alert_to:
                from whatsapp_service import send_whatsapp
                lines = ["New lead — Tony's Assistant", f"Name: {payload.name or '—'}"]
                for field in ('email', 'phone', 'interest', 'goal'):
                    if getattr(payload, field):
                        lines.append(f'{field.title()}: {getattr(payload, field)}')
                asyncio.create_task(send_whatsapp(alert_to, '\n'.join(lines)))
    except Exception:
        logger.warning('Assistant lead alert unavailable')
    digits = ''.join(ch for ch in (await get_setting('social_whatsapp') or '') if ch.isdigit())
    text = quote(f"Hi Tony! I'm {payload.name or 'a new student'} and I'm interested in {payload.interest or 'your yoga courses'}.")
    return {'ok': True, 'lead_id': lead['id'], 'whatsapp_url': f'https://wa.me/{digits}?text={text}' if digits else ''}


@api.get('/admin/assistant/leads')
async def admin_assistant_leads(request: Request):
    await require_role(request, ['admin'])
    rows = await db.ai_leads.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return {'leads': rows, 'total': len(rows)}


@api.get('/admin/assistant/leads/export.csv')
async def export_leads_csv(request: Request):
    import io
    import csv
    await require_role(request, ['admin'])
    rows = await db.ai_leads.find({}, {'_id': 0}).sort('created_at', -1).to_list(5000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    fields = ['name', 'email', 'phone', 'channel', 'goal', 'interest', 'status', 'created_at']
    writer.writerow(fields)
    for row in rows:
        writer.writerow([row.get(f, '') for f in fields])
    return Response(buf.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="ai_leads.csv"'})