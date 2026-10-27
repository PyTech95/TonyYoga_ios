"""Google Gemini for Tony's assistant: streaming chat, spoken replies and voice transcription.

Plain HTTPS calls to the Gemini API (httpx), so no extra package is needed. The key comes from
Admin → Settings (stored encrypted) or the server's GEMINI_API_KEY.
"""
import base64
import io
import json
import os
import re
import wave

import httpx
from fastapi import HTTPException

from core import logger
from routers.settings import get_setting

BASE = os.environ.get("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta")
DEFAULT_MODEL = "gemini-3.5-flash-lite"       # fast, low-cost chat + transcription
DEFAULT_TTS_MODEL = "gemini-3.8-flash-lite-tts"
DEFAULT_VOICE = "Kore"
GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash"]
GEMINI_TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"]
GEMINI_VOICES = [
    "Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Autonoe", "Despina", "Erinome", "Laomedeia",
    "Achernar", "Gacrux", "Pulcherrima", "Vindemiatrix", "Sulafat", "Puck", "Charon", "Fenrir",
    "Orus", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Algenib", "Rasalgethi", "Alnilam",
    "Schedar", "Achird", "Zubenelgenubi", "Sadachbia", "Sadaltager",
]
AUDIO_MIME = {
    ".webm": "audio/webm", ".mp3": "audio/mp3", ".mpeg": "audio/mpeg", ".mpga": "audio/mpeg",
    ".wav": "audio/wav", ".m4a": "audio/m4a", ".mp4": "audio/m4a",
}
TRANSCRIBE_PROMPT = (
    "Transcribe this voice message exactly, in the language that is spoken. "
    "Reply with only the spoken words: no labels, quotes, translation or notes. "
    "If there is no speech, reply with nothing."
)


async def gemini_key():
    # get_setting keeps the Admin key -> GEMINI_API_KEY precedence; resolved only when used.
    key = (await get_setting("gemini_api_key") or "").strip()
    if not key:
        raise HTTPException(503, "The assistant is not configured. Add a Gemini API key in Admin → Settings.")
    return key


def _headers(key):
    return {"x-goog-api-key": key, "Content-Type": "application/json"}


def _thinking(model):
    """Keep reasoning short: answers are 1–3 spoken sentences and must arrive quickly."""
    m = model.lower()
    if "tts" in m:
        return None
    if "lite" in m:
        return {"thinkingLevel": "minimal"}
    if m.startswith(("gemini-3", "gemini-4")):
        return {"thinkingLevel": "low"}
    return None


def _error_text(resp):
    try:
        data = resp.json()
        err = data[0].get("error") if isinstance(data, list) and data else data.get("error")
        return str((err or {}).get("message") or resp.text)[:400]
    except Exception:
        return (resp.text or "")[:400]


def _fail(resp, what):
    message = _error_text(resp)
    logger.warning("Gemini %s failed: HTTP %s %s", what, resp.status_code, message[:200])
    low = message.lower()
    if resp.status_code in (401, 403) or "api key" in low or "api_key" in low:
        raise HTTPException(502, "The Gemini API key was rejected. Check it in Admin → Settings.")
    if resp.status_code == 429:
        raise HTTPException(429, "The AI service is busy right now. Please try again in a minute.")
    if resp.status_code == 404 or "not found" in low or "not supported" in low:
        raise HTTPException(502, "This Gemini model isn't available for your key. Pick another model in Admin → Settings.")
    if "location" in low and "not supported" in low:
        raise HTTPException(502, "Gemini isn't available from the server's region.")
    raise HTTPException(502, "I'm having trouble answering right now. Please try again in a moment.")


def _thinking_rejected(resp):
    return resp.status_code == 400 and "thinking" in _error_text(resp).lower()


def _texts(payload):
    """Answer text from a generateContent response (thought parts skipped)."""
    out = []
    for cand in (payload or {}).get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            if part.get("text") and not part.get("thought"):
                out.append(part["text"])
    return "".join(out)


async def stream_chat(system, history, model):
    """Yield answer text as it arrives. history: [{'role': 'user'|'assistant', 'content': str}]."""
    key = await gemini_key()
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                for m in history if m.get("content")]
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
            "generationConfig": {"maxOutputTokens": 1500}}
    thinking = _thinking(model)
    url = f"{BASE}/models/{model}:streamGenerateContent?alt=sse"
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        for attempt in range(2):
            if thinking and attempt == 0:
                body["generationConfig"]["thinkingConfig"] = thinking
            else:
                body["generationConfig"].pop("thinkingConfig", None)
            async with client.stream("POST", url, headers=_headers(key), json=body) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    if attempt == 0 and thinking and _thinking_rejected(resp):
                        continue  # this model has other reasoning levels: ask again without the setting
                    _fail(resp, "chat")
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except ValueError:
                        continue
                    if chunk.get("error"):
                        logger.warning("Gemini chat stream error: %s", str(chunk["error"].get("message", ""))[:200])
                        raise HTTPException(502, "I'm having trouble answering right now. Please try again in a moment.")
                    text = _texts(chunk)
                    if text:
                        yield text
                return


async def _generate(client, key, model, body, what):
    thinking = _thinking(model)
    url = f"{BASE}/models/{model}:generateContent"
    for attempt in range(2):
        if thinking and attempt == 0:
            body.setdefault("generationConfig", {})["thinkingConfig"] = thinking
        else:
            body.get("generationConfig", {}).pop("thinkingConfig", None)
        resp = await client.post(url, headers=_headers(key), json=body)
        if resp.status_code == 200:
            return resp.json()
        if attempt == 0 and thinking and _thinking_rejected(resp):
            continue
        _fail(resp, what)


async def transcribe(raw, extension, model):
    key = await gemini_key()
    body = {"contents": [{"role": "user", "parts": [
        {"text": TRANSCRIBE_PROMPT},
        {"inlineData": {"mimeType": AUDIO_MIME.get(extension, "audio/webm"),
                        "data": base64.b64encode(raw).decode("ascii")}},
    ]}], "generationConfig": {"maxOutputTokens": 1024}}
    async with httpx.AsyncClient(timeout=httpx.Timeout(40.0, connect=10.0)) as client:
        payload = await _generate(client, key, model, body, "transcription")
    return _texts(payload).strip().strip('"').strip()


def _find_audio(node):
    """First audio payload anywhere in a Gemini response → (bytes, mime)."""
    if isinstance(node, dict):
        inline = node.get("inlineData") or node.get("inline_data")
        if isinstance(inline, dict) and inline.get("data"):
            mime = inline.get("mimeType") or inline.get("mime_type") or ""
            if not mime or mime.startswith("audio"):
                return base64.b64decode(inline["data"]), mime
        if node.get("type") == "audio" and isinstance(node.get("data"), str):
            return base64.b64decode(node["data"]), node.get("mime_type") or node.get("mimeType") or ""
        for value in node.values():
            found = _find_audio(value)
            if found:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_audio(value)
            if found:
                return found
    return None


def _as_wav(raw, mime):
    """Gemini returns WAV, or raw 16-bit mono PCM (24 kHz) from older endpoints: wrap that as WAV."""
    if raw[:4] == b"RIFF":
        return raw
    rate = re.search(r"rate=(\d+)", mime or "")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(int(rate.group(1)) if rate else 24000)
        out.writeframes(raw)
    return buf.getvalue()


async def speak(text, voice, model):
    """Spoken reply as WAV bytes."""
    key = await gemini_key()
    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
        # Current Gemini speech API.
        resp = await client.post(f"{BASE}/interactions", headers=_headers(key), json={
            "model": model,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]},
            "store": False,
        })
        found = _find_audio(resp.json()) if resp.status_code == 200 else None
        if found is None:
            if resp.status_code in (401, 403, 429):
                _fail(resp, "speech")
            # Same models through generateContent (raw PCM).
            legacy = await client.post(f"{BASE}/models/{model}:generateContent", headers=_headers(key), json={
                "contents": [{"role": "user", "parts": [{"text": text}]}],
                "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}},
            })
            if legacy.status_code != 200:
                _fail(legacy if legacy.status_code != 404 or resp.status_code == 200 else resp, "speech")
            found = _find_audio(legacy.json())
    if not found or not found[0]:
        raise HTTPException(502, "Voice playback is unavailable. You can still read and type messages.")
    return _as_wav(*found)
