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
import assistant_gemini as gemini

VOICES = {'alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'}


async def provider():
    """'gemini' or 'openai' — Admin → Settings → AI provider ('auto' = Gemini when its key is set)."""
    choice = (await get_setting('assistant_provider') or 'auto').strip().lower()
    if choice in ('openai', 'gemini'):
        return choice
    return 'gemini' if (await get_setting('gemini_api_key') or '').strip() else 'openai'


async def openai_key():
    # get_setting preserves the encrypted Admin key -> OPENAI_API_KEY precedence.
    # Resolve on feature use, never on import or application startup.
    key = (await get_setting('openai_api_key') or '').strip()
    if not key:
        raise HTTPException(503, 'The assistant is not configured. Add an OpenAI or Gemini API key in Admin → Settings.')
    return key


async def audio_mime():
    return 'audio/wav' if await provider() == 'gemini' else 'audio/mpeg'


async def speech(text, voice=None):
    text = re.sub(r'https?://\S+|[*_#`~]', '', text).strip()[:2000]
    if await provider() == 'gemini':
        return await _gemini_speech(text, voice)
    voice = voice or await get_setting('assistant_voice') or 'nova'
    if voice not in VOICES:
        raise HTTPException(422, 'Unsupported voice.')
    key = await openai_key()
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
    return await _store_audio(cache_key, audio, 'audio/mpeg')


async def _store_audio(cache_key, audio, mime):
    audio_id = gen_id()
    await db.assistant_audio.insert_one({'id': audio_id, 'cache_key': cache_key, 'audio': audio, 'mime': mime,
                                         'expires_at': now_utc() + timedelta(hours=24)})
    return '/api/assistant/audio/' + audio_id


async def _gemini_speech(text, voice=None):
    if voice not in gemini.GEMINI_VOICES:
        voice = await get_setting('assistant_gemini_voice') or gemini.DEFAULT_VOICE
    if voice not in gemini.GEMINI_VOICES:
        voice = gemini.DEFAULT_VOICE
    model = await get_setting('assistant_gemini_tts_model') or gemini.DEFAULT_TTS_MODEL
    cache_key = hashlib.sha256(f'{text}|{voice}|{model}|wav'.encode()).hexdigest()
    cached = await db.assistant_audio.find_one({'cache_key': cache_key, 'expires_at': {'$gt': now_utc()}}, {'_id': 0, 'id': 1})
    if cached:
        return '/api/assistant/audio/' + cached['id']
    try:
        async with asyncio.timeout(50):
            audio = await gemini.speak(text, voice, model)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Assistant speech (Gemini) failed (%s)', type(exc).__name__)
        raise HTTPException(502, 'Voice playback is unavailable. You can still read and type messages.')
    return await _store_audio(cache_key, audio, 'audio/wav')


async def read_upload(upload):
    """(bytes, extension) of a voice recording, validated. Read inside the request (not while streaming)."""
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
    return raw, extension


async def transcribe(upload):
    raw, extension = await read_upload(upload)
    return await transcribe_raw(raw, extension)


async def transcribe_raw(raw, extension):
    if await provider() == 'gemini':
        try:
            model = await get_setting('assistant_gemini_model') or gemini.DEFAULT_MODEL
            async with asyncio.timeout(45):
                text = await gemini.transcribe(raw, extension, model)
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning('Assistant transcription (Gemini) failed (%s)', type(exc).__name__)
            raise HTTPException(502, 'I could not understand that recording. Please try again or type your question.')
        if not text:
            raise HTTPException(400, 'No speech detected. Please try again.')
        return text[:2000]
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
