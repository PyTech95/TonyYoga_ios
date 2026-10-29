import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { api, tokenStore } from "@/lib/api";

/** Profile → change my password (signs out other devices, keeps this one signed in). */
export default function ChangePassword() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (next.length < 8) { toast.error(t("password.short", "Use at least 8 characters.")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/me/password", { current_password: current, new_password: next });
      if (data?.token) tokenStore.set(data.token, true);
      toast.success(t("password.changed", "Password changed. Other devices are signed out."));
      setCurrent(""); setNext(""); setOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("password.failed", "Couldn't change the password."));
    } finally { setBusy(false); }
  };

  const input = "w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";
  return (
    <section data-testid="change-password" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#B25A45]" />
          <h2 className="text-[15px] font-semibold">{t("password.title", "Password")}</h2>
        </div>
        {!open && <button data-testid="change-password-open" onClick={() => setOpen(true)} className="pill pill-ghost !py-2 !px-4 !text-xs">{t("password.change", "Change password")}</button>}
      </div>
      {open && (
        <form onSubmit={save} className="mt-4 space-y-3">
          <input data-testid="change-password-current" type={show ? "text" : "password"} autoComplete="current-password" required value={current}
            onChange={(e) => setCurrent(e.target.value)} placeholder={t("password.current", "Current password")} className={input} />
          <div className="relative">
            <input data-testid="change-password-new" type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} value={next}
              onChange={(e) => setNext(e.target.value)} placeholder={t("password.new", "New password (8+ characters)")} className={`${input} pr-12`} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("password.hide", "Hide") : t("password.show", "Show")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7269]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <div className="flex gap-2">
            <button data-testid="change-password-save" disabled={busy} className="pill pill-primary !py-2.5 !px-5 !text-sm">{busy ? "…" : t("password.save", "Save new password")}</button>
            <button type="button" onClick={() => { setOpen(false); setCurrent(""); setNext(""); }} className="pill pill-ghost !py-2.5 !px-5 !text-sm">{t("common.cancel", "Cancel")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
