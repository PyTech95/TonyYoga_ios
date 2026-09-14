import { API_BASE, api, tokenStore } from './api';

export const assistantError = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : error?.message || 'Something went wrong. Please try again.';
};

export async function streamAnswer(message, sessionId, signal, onEvent) {
  const token = tokenStore.get();
  const response = await fetch(`${API_BASE}/assistant/chat/stream`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Please try again.');
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
        if (data.type === 'done') completed = true;
        onEvent(data);
      }
    }
    if (!completed) throw new Error('The connection was interrupted. Please try again.');
  } finally { reader.releaseLock(); }
}

export const getSpeech = async (text, signal) =>
  (await api.post('/assistant/tts', { text }, { signal, timeout: 45000 })).data.audio_url;

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