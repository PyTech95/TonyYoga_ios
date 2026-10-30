import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpeech, getFillers, voiceStream, assistantError } from './assistantApi';
import { recordTurn } from './assistantRecorder';

const audioUrl = path => `${process.env.REACT_APP_BACKEND_URL}${path}`;
// 44-byte silent WAV: played once inside the tap so iPhones allow this audio element to play later.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/**
 * Voice conversation. Each turn streams: the visitor's words appear at once, a short
 * "okay, one moment" plays immediately, the answer is written as it arrives and its first
 * sentence is spoken as soon as it is ready (the rest follows in order).
 *
 * Callbacks: onTurn(transcript) · onDelta(text) · onDone(doneEvent) · onError(message)
 */
export const useAssistantVoice = ({ sessionId, greeting, onTurn, onDelta, onDone, onError }) => {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState('idle');
  const run = useRef(null), stream = useRef(null), context = useRef(null), audio = useRef(null);
  const playbackEnd = useRef(null), fillers = useRef([]), fillerTurn = useRef(0);
  const callbacks = useRef({ onTurn, onDelta, onDone, onError });
  callbacks.current = { onTurn, onDelta, onDone, onError };
  const session = useRef(sessionId);
  session.current = sessionId;
  const player = useRef(null);
  // One audio element for the whole conversation, unlocked in the tap that starts voice (iOS Safari
  // and the iPhone app only let an element play sound after a tap has played it once).
  const element = () => { if (!player.current) player.current = new Audio(); return player.current; };
  const unlock = () => {
    const el = element();
    try { el.src = SILENCE; const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch { /* not supported */ }
  };

  const stop = useCallback(() => {
    run.current?.abort(); run.current = null;
    audio.current?.pause();
    playbackEnd.current?.(false); playbackEnd.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (context.current) context.current.close().catch(() => {});
    context.current = null;
    setActive(false); setMode('idle');
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const onHidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [stop]);

  const play = useCallback(async (path, signal) => {
    if (signal?.aborted || !path) return false;
    audio.current?.pause();
    playbackEnd.current?.(false);
    const player = element();
    player.src = audioUrl(path);
    audio.current = player;
    return new Promise(resolve => {
      let timer;
      const done = result => {
        clearTimeout(timer);
        player.pause(); player.onended = null; player.onerror = null;
        signal?.removeEventListener('abort', cancel);
        if (playbackEnd.current === done) playbackEnd.current = null;
        resolve(result);
      };
      const cancel = () => done(false);
      playbackEnd.current = done;
      player.onended = () => done(true);
      player.onerror = () => done(false);
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, 90000);
      player.play().then(() => { if (!signal?.aborted) setMode('speaking'); }).catch(() => done(false));
    });
  }, []);

  const greet = useCallback(async (path) => {
    stop();
    const controller = new AbortController(); run.current = controller;
    const played = await play(path, controller.signal);
    if (!controller.signal.aborted) { setMode('idle'); run.current = null; }
    return played;
  }, [play, stop]);

  const replay = async (message) => {
    stop();
    unlock();
    const controller = new AbortController(); run.current = controller;
    setMode('thinking');
    try {
      const path = message.audio_url || await getSpeech(message.text, controller.signal);
      if (!await play(path, controller.signal) && !controller.signal.aborted)
        callbacks.current.onError('Audio could not play. Please tap the speaker to try again.');
    } catch (error) { if (!controller.signal.aborted) callbacks.current.onError(assistantError(error)); }
    finally { if (!controller.signal.aborted) { setMode('idle'); run.current = null; } }
  };

  // One spoken turn. Resolves {ended, audioOk}.
  const speakTurn = async (blob, signal) => {
    const pick = fillers.current.length ? fillers.current[fillerTurn.current++ % fillers.current.length] : null;
    // The filler starts at once; answer audio waits for it, then plays piece by piece.
    let queue = pick ? play(pick.audio_url, signal) : Promise.resolve(true);
    let pieces = 0, played = 0, audioFailed = false, ended = false;
    await voiceStream(blob, session.current, signal, event => {
      if (event.type === 'transcript') callbacks.current.onTurn(event.text);
      else if (event.type === 'delta') callbacks.current.onDelta(event.text);
      else if (event.type === 'done') { ended = !!event.end_conversation; callbacks.current.onDone(event); }
      else if (event.type === 'audio') {
        pieces += 1;
        queue = queue.then(() => signal.aborted ? false : play(event.url, signal)).then(ok => { if (ok) played += 1; return ok; });
      } else if (event.type === 'audio_error') audioFailed = true;
    });
    if (!signal.aborted) setMode(m => (m === 'speaking' ? m : 'thinking'));
    await queue;
    return { ended, audioOk: !audioFailed && (pieces === 0 || played > 0) };
  };

  const start = async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      callbacks.current.onError('This browser does not support microphone recording. Please type your question.'); return;
    }
    unlock();
    const controller = new AbortController(); run.current = controller;
    const { signal } = controller;
    setActive(true); setMode('permission');
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context.current = new AudioContext();
      await context.current.resume();
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (signal.aborted) { mic.getTracks().forEach(track => track.stop()); return; }
      stream.current = mic;
      mic.getAudioTracks().forEach(track => { track.enabled = false; });
      setMode('thinking');
      // Greeting and the short "one moment" phrases load together.
      getFillers(signal).then(list => { fillers.current = list; }).catch(() => {});
      const hello = await getSpeech(greeting, signal);
      if (!await play(hello, signal)) {
        if (!signal.aborted) callbacks.current.onError('Audio is blocked. You can type below or try the voice button again.');
        return;
      }
      while (!signal.aborted) {
        setMode('listening');
        const blob = await recordTurn(mic, context.current, signal);
        if (signal.aborted) break;
        if (!blob) { callbacks.current.onError('No speech heard. Voice is paused; tap the microphone when you’re ready.'); break; }
        setMode('thinking');
        const { ended, audioOk } = await speakTurn(blob, signal);
        if (signal.aborted) break;
        if (!audioOk) { callbacks.current.onError('Audio could not play. Your answer is available in the conversation.'); break; }
        if (ended) break;
      }
    } catch (error) {
      if (!signal.aborted) callbacks.current.onError(
        ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
          ? 'Microphone access was denied. Allow microphone access in your browser’s site settings, or type below.'
          : error.name === 'NotFoundError' ? 'No microphone was found. Connect one or type your question.' : assistantError(error));
    } finally { if (!signal.aborted) stop(); }
  };
  return { active, mode, start, stop, greet, replay };
};
