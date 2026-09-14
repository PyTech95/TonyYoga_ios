import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { api, API_BASE } from "@/lib/api";

const LABELS = { not_configured: "Not configured", unverified: "Not verified", enabled: "Verified · On", disabled: "Verified · Off" };

export const IntegrationStatus = ({ provider, revision }) => {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    api.get("/admin/integrations/status").then(({ data }) => { if (active) setState(data[provider]); })
      .catch(() => { if (active) setState({ state: "unavailable" }); });
    return () => { active = false; };
  }, [provider, revision]);
  const verified = !!state?.verified_at;
  return <div className="space-y-2 text-xs break-words" data-testid={`settings-${provider}-connection-status`} role="status">
    <div className={`flex items-center gap-2 font-semibold ${verified ? "text-[#2F6B44]" : "text-[#8F4535]"}`}>
      {verified ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
      {state ? LABELS[state.state] || "Status unavailable" : "Checking status…"}
      {provider === "stripe" && state?.mode && <span data-testid="settings-stripe-mode">· {state.mode.toUpperCase()}</span>}
    </div>
    {provider === "stripe" && <div className="space-y-2 text-[#545E56]">
      <label className="block">Webhook endpoint
        <input data-testid="settings-stripe-webhook-url" aria-label="Stripe webhook endpoint" className="mt-1 block w-full min-w-0 rounded-lg border p-2 bg-[#FAFAF7] text-xs" readOnly value={`${API_BASE}/webhook/stripe`} />
      </label>
      <p data-testid="settings-stripe-webhook-events">Events: checkout.session.completed and checkout.session.async_payment_succeeded.</p>
      <p data-testid="settings-stripe-webhook-status">{state?.webhook_verified_at ? `Payment webhook confirmed: ${new Date(state.webhook_verified_at).toLocaleString()}` : state?.webhook_received_at ? "Signed webhook received; paid checkout confirmation still pending." : "Webhook delivery not verified yet."}</p>
    </div>}
  </div>;
};