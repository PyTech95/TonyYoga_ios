import { useAuth } from "@/lib/auth";
export default function AuthLoading() {
  const { networkError, refresh } = useAuth();
  return <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 bg-[#FAFAF7]" role="status"><h1 className="serif text-2xl">TonYoga</h1><p>{networkError ? "We could not connect. Please check your internet connection." : "Opening your practice…"}</p>{networkError && <button className="pill pill-primary" onClick={refresh}>Try again</button>}</div>;
}
