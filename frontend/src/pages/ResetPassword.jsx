import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getAuthDestination } from "@/lib/authRouting";
import AuthHero from "@/components/AuthHero";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const welcome = params.get("welcome") === "1";
  const { refresh } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pw !== pw2) return toast.error("Passwords don't match.");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, new_password: pw });
      setDone(true);
      if (data?.token) {
        tokenStore.set(data.token);
        await refresh();
        toast.success(welcome ? "Welcome to Tony Yoga!" : "Password updated — you're signed in.");
        nav(data.user?.role === "student" || !data.user ? "/my-yoga" : getAuthDestination(data.user), { replace: true });
      } else {
        toast.success("Password updated. You can sign in now.");
        setTimeout(() => nav("/login"), 1500);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid or expired reset link.");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="reset-password-page">
      <AuthHero eyebrow="Tony Yoga" title={welcome ? "Choose your password." : "Reset password."} testId="reset-header" />
      <div className="mx-auto max-w-md px-6 mt-6">
        {welcome && token && !done && <p className="text-sm text-[#545E56] mb-4">Your Tony Yoga account is ready. Choose a password and you'll go straight to your classes and courses.</p>}
        {!token ? (
          <p className="text-sm text-[#6B7269]">This reset link is missing its token. Request a new one from the <Link to="/login" className="underline text-[#1C221F]">sign-in page</Link>.</p>
        ) : done ? (
          <p className="text-sm text-[#6B7269]" data-testid="reset-done">Password saved — signing you in…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="eyebrow">New password</span>
              <input type="password" data-testid="reset-pw" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password"
                className="mt-2 w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            </label>
            <label className="block">
              <span className="eyebrow">Confirm password</span>
              <input type="password" data-testid="reset-pw2" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password"
                className="mt-2 w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            </label>
            <button type="submit" disabled={busy} data-testid="reset-submit" className="pill pill-primary w-full">{busy ? "Saving…" : welcome ? "Save and start" : "Update password"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
