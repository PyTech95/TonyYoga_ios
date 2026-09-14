import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpeech, voiceAnswer, assistantError } from './assistantApi';
import { recordTurn } from './assistantRecorder';

const audioUrl = path => `${process.env.REACT_APP_BACKEND_URL}${path}`;

export const useAssistantVoice = ({ sessionId, greeting, onReply, onError }) => {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState('idle');
  const run = useRef(null), stream = useRef(null), context = useRef(null), audio = useRef(null);
  const playbackEnd = useRef(null), callbacks = useRef({ onReply, onError });
  callbacks.current = { onReply, onError };

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
    if (signal?.aborted) return false;
    audio.current?.pause();
    playbackEnd.current?.(false);
    const player = new Audio(audioUrl(path));
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
    const controller = new AbortController(); run.current = controller;
    setMode('thinking');
    try {
      const path = message.audio_url || await getSpeech(message.text, controller.signal);
      if (!await play(path, controller.signal) && !controller.signal.aborted)
        callbacks.current.onError('Audio could not play. Please tap the speaker to try again.');
    } catch (error) { if (!controller.signal.aborted) callbacks.current.onError(assistantError(error)); }
    finally { if (!controller.signal.aborted) { setMode('idle'); run.current = null; } }
  };

  const start = async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      callbacks.current.onError('This browser does not support microphone recording. Please type your question.'); return;
    }
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
        const data = await voiceAnswer(blob, sessionId, signal);
        if (signal.aborted) break;
        callbacks.current.onReply(data);
        if (data.audio_error) { callbacks.current.onError(data.audio_error); break; }
        if (!data.audio_url || !await play(data.audio_url, signal)) {
          if (!signal.aborted) callbacks.current.onError('Audio could not play. Your answer is available in the conversation.');
          break;
        }
        if (data.end_conversation) break;
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