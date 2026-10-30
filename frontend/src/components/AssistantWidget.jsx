import { isNativeApp } from "@/lib/platform";
import { isIOSApp } from "@/lib/iosPlatform";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, X, Send, Mic, PhoneOff, Volume2, RotateCcw, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { assistantError, sessionRead, sessionWrite, streamAnswer } from '@/lib/assistantApi';
import { useAssistantVoice } from '@/lib/useAssistantVoice';
import { AssistantLead } from './assistant/AssistantLead';
import './assistant/assistant.css';
import { uuid } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

// Public pages plus the student's own pages (My Yoga, classes, learning, payments) and Support,
// so a student with an access or payment problem can ask right where they notice it.
const publicRoute = path => /^\/(?:$|home$|programs(?:\/|$)|shop(?:\/|$)|schedule(?:\/|$)|memberships$|workshops(?:\/|$)|find-your-path$|meditations$|asanas$|news$|teacher-training$|discover$|passes$|support$|my-yoga$|my-classes$|my-learning$|my-payments$|my-plan$|private-sessions$|gift$|redeem$)/.test(path);
const newId = () => uuid();
const WAIT_LINES = ['One moment, let me check…', 'Okay, looking into it…', 'Sure, just a second…'];
const updateLast = (list, change) => {
  if (!list.length || list[list.length - 1].role !== 'assistant') return list;
  const next = [...list];
  next[next.length - 1] = change(next[next.length - 1]);
  return next;
};

export default function AssistantWidget() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const userId = auth?.user?.id || null;
  const [cfg, setCfg] = useState(null), [open, setOpen] = useState(false), [teaser, setTeaser] = useState(false);
  const [messages, setMessages] = useState(() => sessionRead('ty_assistant_messages', []).filter(message => !message.pending));
  const [sessionId, setSessionId] = useState(() => sessionRead('ty_assistant_session') || newId());
  const [input, setInput] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const scroll = useRef(null), request = useRef(null), intro = useRef(null), panel = useRef(null);
  // In the app, "/" is the welcome screen with its own buttons; keep it clean.
  const visible = publicRoute(pathname) && !(pathname === '/' && isNativeApp()), greeted = useRef(false), openRef = useRef(false);
  const greeting = cfg?.greeting || "I'm Tony's assistant. How can I help you?";
  // Voice turns stream into the conversation exactly like typed ones.
  const onVoiceTurn = useCallback(text => setMessages(old => [...old, { role: 'visitor', text }, { role: 'assistant', text: '', pending: true }]), []);
  const onVoiceDelta = useCallback(text => setMessages(old => updateLast(old, last => ({ ...last, text: (last.text || '') + text }))), []);
  const adoptSession = useCallback(id => { if (id) setSessionId(current => (current === id ? current : id)); }, []);
  const onVoiceDone = useCallback(event => {
    adoptSession(event.session_id);
    setMessages(old => updateLast(old, last => ({ ...last, text: event.reply, links: event.links, handoff: event.handoff, pending: false })));
  }, [adoptSession]);
  const onVoiceError = useCallback(message => {
    setError(message);
    // A turn that stopped half-way keeps what was written; an empty one is removed.
    setMessages(old => old.filter(m => !(m.pending && !m.text)).map(m => (m.pending ? { ...m, pending: false } : m)));
  }, []);
  const voice = useAssistantVoice({ sessionId, greeting, onTurn: onVoiceTurn, onDelta: onVoiceDelta, onDone: onVoiceDone, onError: onVoiceError });
  const { stop, greet } = voice;
  // A voice turn ended early (End conversation) leaves no half-open message behind.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !voice.active)
      setMessages(old => old.filter(m => !(m.pending && !m.text)).map(m => (m.pending ? { ...m, pending: false } : m)));
    wasActive.current = voice.active;
  }, [voice.active]);
  // The conversation belongs to whoever was signed in when it started: a different account (or
  // signing out) starts a fresh one, so nobody sees someone else's questions or account details.
  useEffect(() => {
    if (auth && !auth.ready) return;
    const owner = sessionRead('ty_assistant_owner', null);
    if (owner && owner !== userId) {
      request.current?.abort(); stop(); setSending(false); setError('');
      setSessionId(newId()); setMessages([]);
    }
    sessionWrite('ty_assistant_owner', userId);
  }, [userId, auth, stop]);

  useEffect(() => { api.get('/assistant/config').then(({ data }) => setCfg(data)).catch(() => setCfg(null)); }, []);
  useEffect(() => { sessionWrite('ty_assistant_session', sessionId); }, [sessionId]);
  useEffect(() => { sessionWrite('ty_assistant_messages', messages.slice(-40)); scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    openRef.current = open;
    document.body.dataset.assistantOpen = open ? 'true' : 'false';
    if (open) panel.current?.focus();
    return () => { delete document.body.dataset.assistantOpen; };
  }, [open]);
  useEffect(() => {
    if (!visible) { stop(); request.current?.abort(); setOpen(false); setTeaser(false); }
  }, [visible, stop]);
  useEffect(() => () => { request.current?.abort(); intro.current?.abort(); }, []);
  // Pages add extra bottom space while the floating button is shown so it never
  // covers the last card or button on the screen.
  const launcherShown = !!cfg?.enabled && visible;
  useEffect(() => {
    document.body.classList.toggle('ty-assistant-visible', launcherShown);
    return () => document.body.classList.remove('ty-assistant-visible');
  }, [launcherShown]);
  useEffect(() => {
    const pause = () => { intro.current?.abort(); stop(); setTeaser(false); };
    window.addEventListener('tony-pause-assistant', pause);
    return () => window.removeEventListener('tony-pause-assistant', pause);
  }, [stop]);

  useEffect(() => {
    if (!cfg?.enabled || !visible || sessionRead('ty_assistant_seen') || greeted.current) return;
    let ready = false;
    const controller = new AbortController(); intro.current = controller;
    const show = async () => {
      if (!ready || document.hidden || greeted.current || openRef.current || sessionRead('ty_assistant_seen')) return;
      greeted.current = true; sessionWrite('ty_assistant_seen', true); setTeaser(true);
      try {
        const { data } = await api.get('/assistant/greeting', { signal: controller.signal, timeout: 45000 });
        if (controller.signal.aborted || openRef.current) return;
        const played = await greet(data.audio_url);
        if (!controller.signal.aborted) setAudioBlocked(!played);
      } catch { if (!controller.signal.aborted) setAudioBlocked(true); }
    };
    const timer = setTimeout(() => { ready = true; show(); }, cfg.popup_delay * 1000);
    document.addEventListener('visibilitychange', show);
    return () => { clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', show); };
  }, [cfg, visible, greet]);

  const seed = () => { setMessages(old => old.length ? old : [{ role: 'assistant', text: greeting }]); };
  const showPanel = () => { intro.current?.abort(); stop(); sessionWrite('ty_assistant_seen', true); setTeaser(false); setOpen(true); seed(); };
  const close = () => {
    intro.current?.abort(); request.current?.abort(); stop(); setOpen(false); setTeaser(false); setSending(false);
    sessionWrite('ty_assistant_seen', true);
  };
  const start = () => { setError(''); voice.start(); };
  const reset = () => {
    request.current?.abort(); stop(); setSending(false); setInput(''); setError(''); setSessionId(newId());
    setMessages([{ role: 'assistant', text: greeting }]);
  };
  const send = async text => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    stop(); setError(''); setInput(''); setSending(true);
    const controller = new AbortController(); request.current = controller;
    setMessages(old => [...old, { role: 'visitor', text: content }, { role: 'assistant', text: '', pending: true }]);
    try {
      await streamAnswer(content, sessionId, controller.signal, event => {
        if (event.type !== 'delta' && event.type !== 'done') return;
        setMessages(old => updateLast(old, last => event.type === 'delta'
          ? { ...last, text: (last.text || '') + event.text }
          : { ...last, text: event.reply, links: event.links, handoff: event.handoff, pending: false }));
        if (event.type === 'done') adoptSession(event.session_id);
      });
    } catch (err) {
      if (!controller.signal.aborted) { setError(assistantError(err)); setInput(content); }
      if (request.current === controller) setMessages(old => old.filter(message => !message.pending));
    } finally { if (request.current === controller) { setSending(false); request.current = null; } }
  };
  if (!cfg?.enabled || !visible) return null;
  const mode = sending ? 'thinking' : voice.mode;
  const status = { idle: 'Here to help', permission: 'Waiting for microphone permission…', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[mode];

  return <div className={`ty-assistant ${pathname === '/' ? '' : 'ty-assistant-above-nav'}`} data-testid="assistant-widget">
    {open && <section ref={panel} tabIndex={-1} role="dialog" aria-label="Tony’s AI assistant" className="ty-assistant-panel" data-testid="assistant-panel" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <header className="ty-assistant-header">
        <div className="ty-assistant-avatar" aria-hidden="true"><Mic size={20} /></div>
        <div className="ty-assistant-title"><strong data-testid="assistant-title">Tony’s assistant</strong><span data-testid="assistant-disclosure">AI voice guide</span></div>
        <button onClick={reset} disabled={sending || voice.active} title="Start a new conversation" aria-label="New conversation" data-testid="assistant-reset"><RotateCcw size={17} /></button>
        <button onClick={close} title="Close assistant" aria-label="Close assistant" data-testid="assistant-close"><X size={20} /></button>
      </header>
      <div className="ty-assistant-status" role="status" data-testid="assistant-status"><span className={`ty-status-dot ty-status-${mode}`} />{status}</div>
      <div ref={scroll} className="ty-assistant-conversation" role="log" aria-live="polite" aria-relevant="additions" data-testid="assistant-conversation">
        {messages.map((message, index) => <div key={index} className={`ty-assistant-message ty-message-${message.role}`} data-testid={`assistant-message-${index}`}>
          {message.text
            ? <p data-testid={`assistant-message-text-${index}`}>{message.text}</p>
            : <p data-testid={`assistant-message-text-${index}`} className="ty-assistant-typing" aria-label="Tony’s assistant is preparing an answer"><span className="ty-assistant-dots" aria-hidden="true"><i /><i /><i /></span>{WAIT_LINES[index % WAIT_LINES.length]}</p>}
          {message.handoff && <div className={`ty-assistant-handoff ${message.handoff.ok ? '' : 'is-warn'}`} role="status" data-testid={`assistant-handoff-${index}`}>
            {message.handoff.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{message.handoff.ok
              ? <>{message.handoff.updated ? 'Added to your message for Tony’s team' : 'Sent to Tony’s team'} · ref <strong data-testid={`assistant-handoff-ref-${index}`}>{message.handoff.ref}</strong>. You’ll get an answer by email.</>
              : 'Not sent to the team yet.'}</span>
          </div>}
          {message.links?.length > 0 && <div className="ty-assistant-links">{message.links.filter(link => !isIOSApp() || (/^\/(?!\/)/.test(link.href) && !/^\/(?:checkout|referrals)/.test(link.href))).map((link, n) => <Link key={link.href} to={link.href} data-testid={`assistant-link-${index}-${n}`} onClick={() => { stop(); if (window.innerWidth < 640) setOpen(false); }}>{link.label}<ArrowUpRight size={13} /></Link>)}</div>}
          {message.role === 'assistant' && message.text && !message.pending && <button disabled={sending || voice.active} onClick={() => { setError(''); voice.replay(message); }} title="Listen to this answer" aria-label="Listen to this answer" className="ty-assistant-replay" data-testid={`assistant-replay-${index}`}><Volume2 size={14} /></button>}
        </div>)}
        {messages.length <= 1 && <div className="ty-assistant-suggestions">{['Find a beginner course', 'Explore memberships', 'Help with my account or a purchase'].map((label, n) => <button key={label} onClick={() => send(label)} disabled={sending || voice.active} data-testid={`assistant-suggestion-${n}`}>{label}<ArrowUpRight size={14} /></button>)}</div>}
        {messages.length >= 5 && <AssistantLead sessionId={sessionId} />}
      </div>
      {error && <div className="ty-assistant-error" role="alert" data-testid="assistant-error">{error}<button aria-label="Dismiss message" onClick={() => setError('')} data-testid="assistant-error-dismiss"><X size={14} /></button></div>}
      <div className="ty-assistant-controls">
        <div className="ty-assistant-voice-row">
          {voice.active ? <button onClick={stop} className="ty-assistant-talk ty-assistant-end" data-testid="assistant-voice-stop"><PhoneOff size={17} /> End conversation</button>
            : <button onClick={start} disabled={sending} className="ty-assistant-talk" data-testid="assistant-voice-start"><Mic size={17} /> Talk to Tony</button>}
          {!voice.active && mode === 'speaking' && <button onClick={stop} aria-label="Stop audio" title="Stop audio" data-testid="assistant-audio-stop"><PhoneOff size={18} /></button>}
        </div>
        <p className="ty-assistant-note" data-testid="assistant-privacy-note">{voice.active ? 'Microphone on · audio is processed for your reply' : 'Microphone stays off until you choose to talk'}</p>
        <form onSubmit={e => { e.preventDefault(); send(); }} className="ty-assistant-compose" data-testid="assistant-form">
          <input aria-label="Your question" placeholder="Type your question…" value={input} onChange={e => setInput(e.target.value)} maxLength={2000} disabled={voice.active} data-testid="assistant-input" />
          <button type="submit" aria-label="Send question" title="Send question" disabled={!input.trim() || sending || voice.active} data-testid="assistant-send"><Send size={18} /></button>
        </form>
      </div>
    </section>}
    {!open && <>
      {teaser && <aside className="ty-assistant-teaser" data-testid="assistant-teaser">
        <button onClick={close} aria-label="Dismiss invitation" className="ty-assistant-dismiss" data-testid="assistant-teaser-close"><X size={16} /></button>
        <span className="ty-assistant-eyebrow" data-testid="assistant-teaser-disclosure">TONY’S AI ASSISTANT</span>
        <p data-testid="assistant-teaser-greeting">{greeting}</p>
        <button onClick={() => { showPanel(); setError(''); voice.start(); }} data-testid="assistant-teaser-open"><Mic size={15} />{audioBlocked ? 'Talk to Tony' : 'Let’s talk'}<ArrowUpRight size={15} /></button>
      </aside>}
      <button className="ty-assistant-launcher" onClick={showPanel} aria-label="Open Tony’s assistant" title="Ask Tony’s assistant" data-testid="assistant-launcher"><MessageCircle size={23} /><span className="ty-assistant-launcher-label">Ask Tony</span></button>
    </>}
  </div>;
}