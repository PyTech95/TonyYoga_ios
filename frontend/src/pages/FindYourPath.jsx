import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Sparkles, Compass, Check, RotateCcw, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

const STEPS = [
  {
    key: "goal",
    title: "What are you here to do?",
    sub: "Your main goal right now.",
    options: [
      { value: "foundations", label: "Build strong foundations", hint: "Learn the essentials, the right way" },
      { value: "fitness", label: "Get fit & strong", hint: "Energetic, full-body practice" },
      { value: "flexibility", label: "Improve flexibility", hint: "Open tight hips, hamstrings, spine" },
      { value: "calm", label: "Reduce stress & find calm", hint: "Breath, stillness, restoration" },
      { value: "mastery", label: "Master the full system", hint: "Go deep — all 84 asanas" },
    ],
  },
  {
    key: "level",
    title: "Where are you in your practice?",
    sub: "Be honest — we'll meet you there.",
    options: [
      { value: "beginner", label: "Just starting", hint: "New or returning after a long break" },
      { value: "intermediate", label: "Comfortable", hint: "I practise semi-regularly" },
      { value: "advanced", label: "Experienced", hint: "Strong, consistent practice" },
    ],
  },
  {
    key: "days_per_week",
    title: "How often can you practise?",
    sub: "Pick a realistic rhythm.",
    options: [
      { value: 2, label: "1–2 days a week", hint: "Gentle, flexible schedule" },
      { value: 3, label: "3–4 days a week", hint: "A steady habit" },
      { value: 6, label: "5+ days a week", hint: "All-in, most days" },
    ],
  },
  {
    key: "focus",
    title: "Where do you want to feel it most?",
    sub: "Optional — pick what matters now.",
    options: [
      { value: "", label: "No preference", hint: "Surprise me" },
      { value: "strength", label: "Strength", hint: "" },
      { value: "flexibility", label: "Flexibility", hint: "" },
      { value: "balance", label: "Balance", hint: "" },
      { value: "back care", label: "Back & spine care", hint: "" },
      { value: "energy", label: "Energy & focus", hint: "" },
    ],
  },
  {
    key: "minutes",
    title: "How long is a session for you?",
    sub: "Typical time you can give.",
    options: [
      { value: 20, label: "About 20 minutes", hint: "Short & sweet" },
      { value: 45, label: "Around 45 minutes", hint: "A proper practice" },
      { value: 75, label: "60+ minutes", hint: "The full journey" },
    ],
  },
];

export default function FindYourPath() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const sendResult = async (e) => {
    e?.preventDefault?.();
    if (!email.trim() || emailBusy) return;
    setEmailBusy(true);
    try {
      const { data } = await api.post("/quiz/lead", {
        email: email.trim(),
        answers,
        origin_url: window.location.origin,
      });
      setEmailSent(true);
      toast.success(data.emailed ? "Sent — check your inbox for your plan." : "Saved — we'll be in touch with your plan.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send — please try again.");
    } finally { setEmailBusy(false); }
  };

  const current = STEPS[step];
  const progress = result ? 100 : Math.round((step / STEPS.length) * 100);

  const choose = async (value) => {
    const next = { ...answers, [current.key]: value };
    setAnswers(next);
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setLoading(true);
      try {
        const { data } = await api.post("/quiz/recommend", next);
        setResult(data);
      } catch {
        setResult({ program: null, membership: null, reasons: [] });
      } finally { setLoading(false); }
    }
  };

  const restart = () => { setStep(0); setAnswers({}); setResult(null); };

  return (
    <div data-testid="find-your-path-page" className="min-h-[80vh] bg-[#FAFAF7]">
      {/* progress */}
      <div className="sticky top-0 z-10 bg-[#FAFAF7]/90 backdrop-blur border-b border-[#EDEDE4]">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center gap-3">
          <Compass className="h-5 w-5 text-[#B25A45]" />
          <div className="eyebrow">Find your path</div>
          <div className="ml-auto text-xs text-[#9AA096] font-semibold" data-testid="quiz-progress">
            {result ? "Done" : `${step + 1} / ${STEPS.length}`}
          </div>
        </div>
        <div className="h-1 bg-[#EDEDE4]">
          <div className="h-full bg-[#B25A45] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-8">
        {!result && (
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28 }}
            >
              <h1 className="serif text-3xl sm:text-4xl leading-tight" data-testid="quiz-question">{current.title}</h1>
              <p className="text-sm text-[#6B7269] mt-2">{current.sub}</p>

              <div className="mt-6 space-y-3">
                {current.options.map((opt, i) => (
                  <motion.button
                    key={String(opt.value)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    onClick={() => choose(opt.value)}
                    disabled={loading}
                    data-testid={`quiz-option-${current.key}-${String(opt.value) || "any"}`}
                    className="group w-full text-left rounded-2xl border border-[#E5E6DF] bg-white px-5 py-4 hover:border-[#B25A45] hover:shadow-[0_4px_20px_rgba(178,90,69,0.08)] transition-all flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-[#1C221F]">{opt.label}</div>
                      {opt.hint && <div className="text-xs text-[#9AA096] mt-0.5">{opt.hint}</div>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#D6C9B8] group-hover:text-[#B25A45] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </motion.button>
                ))}
              </div>

              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  data-testid="quiz-back"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm text-[#6B7269] hover:text-[#1C221F]"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {loading && (
          <div className="text-center py-16" data-testid="quiz-loading">
            <Sparkles className="h-8 w-8 text-[#B25A45] mx-auto animate-pulse" />
            <p className="text-sm text-[#6B7269] mt-3">Finding your path…</p>
          </div>
        )}

        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid="quiz-result"
          >
            <div className="eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#B25A45]" /> Your recommendation</div>
            <h1 className="serif text-3xl sm:text-4xl mt-2 leading-tight">Here's where to begin.</h1>

            {result.reasons?.length > 0 && (
              <ul className="mt-5 space-y-2">
                {result.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px] text-[#4A524B]">
                    <Check className="h-4 w-4 text-[#839682] mt-0.5 shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            )}

            {result.program && (
              <div className="mt-7 rounded-3xl overflow-hidden border border-[#E5E6DF] bg-white" data-testid="quiz-program-card">
                {result.program.cover_image && (
                  <div className="h-44 w-full overflow-hidden bg-[#F2F2EC]">
                    <img src={result.program.cover_image} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-5">
                  <div className="eyebrow">Recommended program</div>
                  <div className="serif text-2xl mt-1">{result.program.title}</div>
                  <p className="text-sm text-[#6B7269] mt-2 line-clamp-3">{result.program.description}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => nav(`/programs/${result.program.id}`)}
                      data-testid="quiz-cta-program"
                      className="pill pill-primary"
                    >
                      Explore this program <ArrowRight className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-[#9AA096] capitalize">{result.program.level}</span>
                  </div>
                </div>
              </div>
            )}

            {result.membership && (
              <div className="mt-4 rounded-3xl border border-[#E5E6DF] bg-[#1C221F] text-[#FAFAF7] p-5" data-testid="quiz-membership-card">
                <div className="eyebrow !text-[#E0A38F]">Best membership for you</div>
                <div className="serif text-2xl mt-1">{t(result.membership.name)}</div>
                <p className="text-sm text-[#B7BEB4] mt-1">
                  {result.membership.price != null && (
                    <span className="text-[#FAFAF7] font-semibold" data-testid="quiz-membership-price">
                      {(result.membership.currency || "eur").toUpperCase() === "USD" ? "$" : "€"}{Number(result.membership.price).toFixed(0)}
                    </span>
                  )}
                  <span className="capitalize"> {result.membership.price != null ? "· " : ""}{(result.membership.billing_cycle || "monthly")} plan</span>
                </p>
                <button
                  onClick={() => nav("/memberships")}
                  data-testid="quiz-cta-membership"
                  className="pill mt-4 !bg-[#B25A45] !text-white hover:!bg-[#9c4c39]"
                >
                  See membership plans <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {!result.program && !result.membership && (
              <p className="mt-6 text-sm text-[#6B7269]">
                We couldn't find a match right now. <Link to="/programs" className="text-[#B25A45] underline">Browse all programs</Link>.
              </p>
            )}

            {!user && (
              <div className="mt-6 rounded-3xl border border-[#E0D3B8] bg-[#FBF6EC] p-5" data-testid="quiz-email-capture">
                {emailSent ? (
                  <div className="flex items-start gap-3" data-testid="quiz-email-sent">
                    <Check className="h-5 w-5 text-[#839682] mt-0.5 shrink-0" />
                    <div>
                      <div className="serif text-lg">Your plan is on its way.</div>
                      <p className="text-sm text-[#6B7269] mt-1">Create your free account to save it and start practising.</p>
                      <button onClick={() => nav(`/register?email=${encodeURIComponent(email)}`)} data-testid="quiz-signup-cta" className="pill pill-primary mt-3">
                        Create free account <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-[#5C5346]">
                      <Mail className="h-4 w-4 text-[#B25A45]" />
                      <span className="text-[15px] font-semibold">Email me my plan</span>
                    </div>
                    <p className="text-sm text-[#6B7269] mt-1">We'll send your program + membership match and help you get started — no pressure.</p>
                    <form onSubmit={sendResult} className="mt-3 flex gap-2 flex-col sm:flex-row">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        data-testid="quiz-email-input"
                        className="flex-1 rounded-full border border-[#E0D3B8] bg-white px-5 py-3 text-[15px] focus:outline-none focus:border-[#B25A45]"
                      />
                      <button type="submit" disabled={emailBusy} data-testid="quiz-email-submit" className="pill pill-primary shrink-0">
                        {emailBusy ? "Sending…" : "Send my plan"} <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}

            <button onClick={restart} data-testid="quiz-restart" className="mt-8 inline-flex items-center gap-1.5 text-sm text-[#6B7269] hover:text-[#1C221F]">
              <RotateCcw className="h-4 w-4" /> Retake the quiz
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
