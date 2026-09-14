import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import { getAuthDestination } from "@/lib/authRouting";

export default function MagicLink() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("loading"); // loading | error
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!token) { setStatus("error"); return; }
      try {
        const { data } = await api.post("/auth/magic-link/consume", { token });
        tokenStore.set(data.token);
        await refresh();
        nav(getAuthDestination(data.user), { replace: true });
      } catch {
        setStatus("error");
      }
    })();
  }, [token, nav, refresh]);

  return (
    <div data-testid="magic-link-page">
      <PageHeader eyebrow="Tony Yoga" title="Signing you in." testId="magic-header" showLogo />
      <div className="mx-auto max-w-md px-6 mt-4">
        {status === "loading" ? (
          <Spinner label="Verifying your link" />
        ) : (
          <p className="text-sm text-[#6B7269]" data-testid="magic-error">
            This magic link is invalid or has expired. Request a new one from the{" "}
            <Link to="/login" data-testid="magic-error-login" className="underline text-[#1C221F]">sign-in page</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
