"""Short-lived generated speech; uploaded recordings are never persisted."""
import asyncio
import hashlib
import io
import os
import re
from datetime import timedelta
from fastapi import HTTPException
from openai import AsyncOpenAI
from core import db, gen_id, now_utc, logger
from routers.settings import get_setting

VOICES = {'alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'}


async def openai_key():
    # get_setting preserves the encrypted Admin key -> OPENAI_API_KEY precedence.
    # Resolve on feature use, never on import or application startup.
    key = (await get_setting('openai_api_key') or '').strip()
    if not key:
        raise HTTPException(503, 'The assistant is not configured. An OpenAI API key is required.')
    return key


async def speech(text, voice=None):
    voice = voice or await get_setting('assistant_voice') or 'nova'
    if voice not in VOICES:
        raise HTTPException(422, 'Unsupported voice.')
    key = await openai_key()
    text = re.sub(r'https?://\S+|[*_#`~]', '', text).strip()[:2000]
    cache_key = hashlib.sha256(f'{text}|{voice}|tts-1|1.0|mp3'.encode()).hexdigest()
    cached = await db.assistant_audio.find_one({'cache_key': cache_key, 'expires_at': {'$gt': now_utc()}}, {'_id': 0, 'id': 1})
    if cached:
        return '/api/assistant/audio/' + cached['id']
    try:
        async with asyncio.timeout(35):
            async with AsyncOpenAI(api_key=key, timeout=30.0, max_retries=1) as client:
                async with client.audio.speech.with_streaming_response.create(
                        input=text, model='tts-1', voice=voice, response_format='mp3') as response:
                    audio = await response.read()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Assistant speech failed (%s)', type(exc).__name__)
        raise HTTPException(502, 'Voice playback is unavailable. You can still read and type messages.')
    if not audio:
        raise HTTPException(502, 'Voice playback is unavailable. Please try again.')
    audio_id = gen_id()
    await db.assistant_audio.insert_one({'id': audio_id, 'cache_key': cache_key, 'audio': audio,
                                         'expires_at': now_utc() + timedelta(hours=24)})
    return '/api/assistant/audio/' + audio_id


async def transcribe(upload):
    allowed = {'.webm', '.mp3', '.mp4', '.m4a', '.wav', '.mpeg', '.mpga'}
    extension = os.path.splitext(upload.filename or '')[1].lower()
    if extension not in allowed:
        raise HTTPException(415, 'Please use a WebM, MP4, WAV or MP3 recording.')
    raw = await upload.read(6 * 1024 * 1024 + 1)
    await upload.close()
    if not raw:
        raise HTTPException(400, 'Empty recording. Please try speaking again.')
    if len(raw) > 6 * 1024 * 1024:
        raise HTTPException(413, 'Recording is too large. Please keep it under 30 seconds.')
    recording = io.BytesIO(raw)
    recording.name = 'voice' + extension
    try:
        key = await openai_key()
        async with asyncio.timeout(40):
            async with AsyncOpenAI(api_key=key, timeout=35.0, max_retries=1) as client:
                result = await client.audio.transcriptions.create(
                    file=recording, model='whisper-1', response_format='json')
                text = (result.text or '').strip()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Assistant transcription failed (%s)', type(exc).__name__)
        raise HTTPException(502, 'I could not understand that recording. Please try again or type your question.')
    finally:
        recording.close()
    if not text:
        raise HTTPException(400, 'No speech detected. Please try again.')
    return text[:2000]