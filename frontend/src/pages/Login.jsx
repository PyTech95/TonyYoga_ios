import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import LanguageToggle from "@/components/LanguageToggle";
import { getAuthDestination } from "@/lib/authRouting";

export default function Login() {
  const nav = useNavigate();
  const { login, user, ready } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const signedInUser = await login(email.trim(), password, remember);
      toast.success(t("login.welcome_back"));
      nav(getAuthDestination(signedInUser), { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("login.failed"));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return toast.error("Enter your email first, then tap 'Forgot password'.");
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      toast.success("If that email exists, a reset link is on its way.");
    } catch { toast.error("Could not start password reset."); }
  };

  const magicLink = async () => {
    if (!email.trim()) return toast.error("Enter your email first, then tap 'Email me a magic link'.");
    try {
      const { data } = await api.post("/auth/magic-link/request", { email: email.trim(), type: "login" });
      if (data.magic_url) {
        // Email delivery is off — open the link directly so the flow still works.
        toast.success("Opening your magic link…");
        nav(data.magic_url.replace(/^https?:\/\/[^/]+/, ""));
      } else {
        toast.success("Check your inbox for a sign-in link.");
      }
    } catch { toast.error("Could not send magic link."); }
  };

  if (!ready) return <p data-testid="login-session-loading" className="p-6 text-sm">Checking session…</p>;
  if (user) return <Navigate to={getAuthDestination(user)} replace />;

  return (
    <div data-testid="login-page">
      <div className="flex justify-end px-6 pt-4"><LanguageToggle /></div>
      <PageHeader eyebrow={t("login.eyebrow")} title={t("login.title")} back testId="login-header" showLogo />
      <form onSubmit={submit} className="mx-auto max-w-md px-6 mt-4 space-y-4">
        <label className="block">
          <span className="eyebrow">{t("login.email")}</span>
          <input
            type="email"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mt-2 w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45] focus:border-transparent"
          />
        </label>
        <label className="block">
          <span className="eyebrow">{t("login.password")}</span>
          <input
            type="password"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45] focus:border-transparent"
          />
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="login-remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-[#C9CBBF] text-[#B25A45] focus:ring-[#B25A45]"
          />
          <span className="text-[13px] text-[#545E56]">{t("login.remember")}</span>
        </label>

        <button
          type="submit"
          disabled={busy}
          data-testid="login-submit"
          className="pill pill-primary w-full mt-2"
        >
          {busy ? t("login.submitting") : t("login.submit")}
        </button>

        <p className="text-center text-[13px] text-[#6B7269]">
          {t("login.new_here")}{" "}
          <Link to="/register" data-testid="login-link-register" className="underline text-[#1C221F]">{t("login.create_account")}</Link>
        </p>

        <div className="flex items-center justify-center gap-4 text-[13px]">
          <button type="button" onClick={forgot} data-testid="login-forgot" className="text-[#B25A45] hover:underline">{t("login.forgot")}</button>
          <span className="text-[#D8D9D1]">·</span>
          <button type="button" onClick={magicLink} data-testid="login-magic-link" className="text-[#B25A45] hover:underline">{t("login.magic")}</button>
        </div>

      </form>
    </div>
  );
}
