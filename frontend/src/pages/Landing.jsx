import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";

const HERO = "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/6b55c6a0-8c26-4670-8cb7-68a45f7371fb/TonySanchez-head-to-knee.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAFAF7]" data-testid="landing-page">
      <div className="relative overflow-hidden">
        <div className="relative h-[70vh] min-h-[520px]">
          <img
            src={HERO}
            alt="Tony Sanchez"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1C221F]/10 via-[#1C221F]/30 to-[#1C221F]/80" />
          <div className="grain absolute inset-0" />
          <div className="absolute top-4 sm:top-6 left-4 sm:left-6 z-10">
            <Logo className="h-16 w-16 sm:h-20 sm:w-20" />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 text-[#FAFAF7]">
            <div className="mx-auto max-w-2xl">
              <div className="eyebrow !text-[#E5E6DF] mb-3 animate-fade-up">Since 1986 · Ghosh Lineage</div>
              <h1 className="serif text-5xl sm:text-6xl leading-[0.98] font-medium mb-4 animate-fade-up animate-delay-1">
                Slow down.<br/>Breathe in.<br/>Begin again.
              </h1>
              <p className="text-[15px] sm:text-base text-white/80 leading-relaxed max-w-md animate-fade-up animate-delay-2">
                Live classes with Tony Sanchez, on-demand programs, and workshops rooted in 50+ years of practice.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10 animate-fade-up animate-delay-3">
        <div className="grid gap-3">
          <Link
            to="/register"
            data-testid="landing-cta-create"
            className="pill pill-primary w-full"
          >
            Create account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            data-testid="landing-cta-signin"
            className="pill pill-ghost w-full"
          >
            Sign in
          </Link>
          <Link
            to="/home"
            data-testid="landing-cta-explore"
            className="text-center py-3 text-sm text-[#6B7269] hover:text-[#1C221F] transition"
          >
            Explore without signing in →
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-6 text-center">
          {[
            ["50+", "years"],
            ["3", "programs"],
            ["4", "retreats"],
          ].map(([n, l]) => (
            <div key={l}>
              <div className="serif text-3xl">{n}</div>
              <div className="eyebrow mt-1">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
