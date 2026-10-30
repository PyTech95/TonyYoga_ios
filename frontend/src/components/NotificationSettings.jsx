import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Mail, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Switch({ on, onChange, tid, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} data-testid={tid} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${on ? "bg-[#B25A45]" : "bg-[#D8D9D1]"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Member's choice: account emails and phone/browser notifications (the bell always works). */
export default function NotificationSettings() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [values, setValues] = useState(null);
  const current = values || { notify_email: user?.notify_email !== false, notify_push: user?.notify_push !== false };

  const save = async (patch) => {
    const next = { ...current, ...patch };
    setValues(next);
    try {
      await api.patch("/me/notification-settings", patch);
      refresh?.();
    } catch {
      setValues(current);
      toast.error(t("notify.save_failed", "Could not save your choice."));
    }
  };

  return (
    <section data-testid="notification-settings" className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4">
      <div className="text-sm font-semibold">{t("notify.title", "Notifications")}</div>
      <div className="flex items-center gap-3">
        <Mail className="h-5 w-5 text-[#B25A45] shrink-0" />
        <div className="flex-1 text-[13px] text-[#545E56]">{t("notify.email", "Email me about my account — purchases, classes, membership and orders")}</div>
        <Switch on={current.notify_email} onChange={(v) => save({ notify_email: v })} tid="notify-email-toggle" label="Email" />
      </div>
      <div className="flex items-center gap-3">
        <Smartphone className="h-5 w-5 text-[#B25A45] shrink-0" />
        <div className="flex-1 text-[13px] text-[#545E56]">{t("notify.push", "Phone and browser notifications")}</div>
        <Switch on={current.notify_push} onChange={(v) => save({ notify_push: v })} tid="notify-push-toggle" label="Push" />
      </div>
      <p className="text-[11px] text-[#9AA096]">{t("notify.bell", "Everything also appears under the bell at the top of the app.")}</p>
    </section>
  );
}
