import { useState } from 'react';
import { api } from '@/lib/api';
import { assistantError } from '@/lib/assistantApi';

export const AssistantLead = ({ sessionId }) => {
  const [form, setForm] = useState({ name: '', email: '' });
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setState('saving'); setError('');
    try {
      await api.post('/assistant/lead', { ...form, session_id: sessionId, channel: 'email' });
      setState('saved');
    } catch (err) { setError(assistantError(err)); setState('idle'); }
  };
  if (state === 'saved') return <p className="ty-assistant-note" data-testid="assistant-lead-confirmation">Your details are saved for Tony’s team.</p>;
  return <details className="ty-assistant-lead" data-testid="assistant-lead-details">
    <summary data-testid="assistant-lead-toggle">Ask Tony’s team to contact me</summary>
    <form onSubmit={submit} data-testid="assistant-lead-form">
      <label>Your name<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="assistant-lead-name" autoComplete="name" /></label>
      <label>Email<input required type="email" maxLength={200} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="assistant-lead-email" autoComplete="email" /></label>
      {error && <p role="alert" data-testid="assistant-lead-error">{error}</p>}
      <button type="submit" disabled={state === 'saving'} data-testid="assistant-lead-submit">{state === 'saving' ? 'Saving…' : 'Send my details'}</button>
    </form>
  </details>;
};