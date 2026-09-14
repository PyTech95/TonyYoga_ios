import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Inline registration form for the marketing site homepage. */
export default function InlineSignup() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error(t("join.pw_short")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", form);
      tokenStore.set(data.token);
      await refresh();
      toast.success(t("join.welcome"));
      nav("/home");
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("join.failed"));
    } finally { setBusy(false); }
  };
  return (
    <section id="join" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24" data-testid="marketing-signup">
      <div className="rounded-2xl sm:rounded-3xl bg-[#F2F2EC] p-6 sm:p-10 lg:p-14 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        <div>
          <div className="eyebrow mb-3">{t("join.eyebrow")}</div>
          <h2 className="serif text-3xl sm:text-4xl leading-tight mb-3">{t("join.title")}</h2>
          <p className="text-[#545E56] leading-relaxed max-w-md text-sm sm:text-base">
            {t("join.sub")}
          </p>
          <ul className="mt-6 space-y-2 text-sm text-[#1C221F]">
            {[t("join.b1"), t("join.b2"), t("join.b3")].map(x => <li key={x}>· {x}</li>)}
          </ul>
        </div>
        <form onSubmit={submit} className="space-y-3" data-testid="signup-form">
          <input required data-testid="signup-name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder={t("join.name")} className="w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
          <input required type="email" data-testid="signup-email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder={t("join.email")} className="w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
          <input required type="password" minLength={8} data-testid="signup-password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} placeholder={t("join.password")} className="w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
          <button type="submit" disabled={busy} data-testid="signup-submit" className="pill pill-primary w-full">
            {busy ? t("join.submitting") : t("join.submit")} <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-[11px] text-[#6B7269] text-center">{t("join.terms")}</p>
        </form>
      </div>
    </section>
  );
}
