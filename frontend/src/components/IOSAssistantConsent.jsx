import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

function consentStored() { try { return sessionStorage.getItem("tonyoga_ai_consent_v1") === "yes"; } catch { return false; } }
function saveConsent(value) { try { if (value) sessionStorage.setItem("tonyoga_ai_consent_v1", "yes"); else sessionStorage.removeItem("tonyoga_ai_consent_v1"); } catch {} }

export default function IOSAssistantConsent({ children }) {
  const { user } = useAuth();
  const identity = user?.id || "guest";
  useEffect(() => {
    try {
      if (sessionStorage.getItem("tonyoga_ai_account") !== identity) {
        ["tonyoga_ai_consent_v1", "ty_assistant_messages", "ty_assistant_session", "ty_assistant_seen"].forEach(k => sessionStorage.removeItem(k));
        sessionStorage.setItem("tonyoga_ai_account", identity);
        setConsented(false); setShow(false);
      }
    } catch { setConsented(false); }
  }, [identity]);
  const [consented, setConsented] = useState(consentStored);
  const [show, setShow] = useState(false);
  let sameAccount = false;
  try { sameAccount = sessionStorage.getItem("tonyoga_ai_account") === identity; } catch {}
  if (consented && sameAccount) return <><button className="ios-ai-consent-reset" onClick={() => { saveConsent(false); setConsented(false); setShow(false); }}>Turn off AI assistant</button>{children}</>;
  return <><button className="ios-ai-consent-open pill pill-ghost" onClick={() => setShow(true)}>Ask the AI assistant</button>{show && <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="AI privacy consent"><div className="max-w-md rounded-3xl bg-[#FAFAF7] p-6 space-y-4"><h2 className="serif text-2xl">Before using the AI assistant</h2><p className="text-sm">Your questions and relevant conversation context are sent to TonYoga's server and OpenAI to generate answers. Choosing voice mode also sends your microphone audio for transcription and a spoken response. Do not share sensitive health information, payment details or passwords.</p><p className="text-sm">This is AI, not Tony or a medical professional. Its responses can be incorrect. You can decline and continue using TonYoga.</p><Link className="underline text-sm" to="/privacy" onClick={() => setShow(false)}>Read our privacy policy</Link><button className="pill pill-primary w-full" onClick={() => { saveConsent(true); setConsented(true); }}>Agree and enable assistant</button><button className="pill pill-ghost w-full" onClick={() => setShow(false)}>Not now</button></div></div>}</>;
}
