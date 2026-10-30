import { API_BASE, api, tokenStore } from './api';
import i18n from '@/i18n';

export const assistantError = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : error?.message || 'Something went wrong. Please try again.';
};

export const siteLang = () => String(i18n?.language || document.documentElement.lang || 'en').slice(0, 5);

// Reads a text/event-stream response and calls onEvent for every `data:` event.
async function readEvents(response, onEvent, finalType) {
  if (!response.ok) {
    let detail = 'Please try again.';
    try { const data = await response.json(); if (typeof data.detail === 'string') detail = data.detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop();
      for (const event of events) {
        if (!event.startsWith('data: ')) continue;
        const data = JSON.parse(event.slice(6));
        if (data.type === 'error') throw new Error(data.message);
        if (data.type === finalType) completed = true;
        onEvent(data);
      }
    }
    if (!completed) throw new Error('The connection was interrupted. Please try again.');
  } finally { reader.releaseLock(); }
}

const authHeaders = () => {
  const token = tokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function streamAnswer(message, sessionId, signal, onEvent, mode = 'text') {
  const response = await fetch(`${API_BASE}/assistant/chat/stream`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, session_id: sessionId, mode, lang: siteLang() }),
  });
  await readEvents(response, onEvent, 'done');
}

// One spoken turn: transcript → answer text as it is written → audio pieces → end.
export async function voiceStream(blob, sessionId, signal, onEvent) {
  const form = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  form.append('audio', blob, `voice.${extension}`);
  form.append('session_id', sessionId);
  form.append('speak', 'true');
  form.append('lang', siteLang());
  const response = await fetch(`${API_BASE}/assistant/voice/stream`, {
    method: 'POST', signal, headers: authHeaders(), body: form,
  });
  await readEvents(response, onEvent, 'end');
}

export const getSpeech = async (text, signal) =>
  (await api.post('/assistant/tts', { text }, { signal, timeout: 45000 })).data.audio_url;

export const getFillers = async (signal) =>
  (await api.get('/assistant/fillers', { params: { lang: siteLang() }, signal, timeout: 45000 })).data.fillers || [];

export const voiceAnswer = async (blob, sessionId, signal) => {
  const form = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  form.append('audio', blob, `voice.${extension}`);
  form.append('session_id', sessionId);
  form.append('speak', 'true');
  return (await api.post('/assistant/voice', form, { signal, timeout: 120000 })).data;
};

export const sessionRead = (key, fallback = null) => {
  try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const sessionWrite = (key, value) => {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private storage can be unavailable */ }
};
