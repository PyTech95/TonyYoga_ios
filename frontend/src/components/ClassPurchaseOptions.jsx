import { useState } from "react";
import { Link } from "react-router-dom";
import { Video, CalendarRange } from "lucide-react";
import PaymentButtons from "./PaymentButtons";
import { AccessTermSummary } from "./AccessTerm";

export const ClassPurchaseOptions = ({ instance, user }) => {
  const config = instance.purchase_options;
  const [choice, setChoice] = useState("one_time");
  if (!config || config.mode === "free" || instance.viewer?.can_book) return null;
  const mode = config.mode === "both" ? choice : config.mode;
  const sub = mode === "subscription";
  const price = sub ? config.subscription_price : config.one_time_price;
  const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: config.currency }).format(price);
  const term = config.term;
  const fixed = term?.mode === "fixed";
  const unavailable = sub && fixed && (new Date(term.ends_at) <= Date.now() || new Date(instance.start_time) < new Date(term.starts_at) || new Date(instance.end_time) > new Date(term.ends_at));
  const rollingOut = sub && !fixed && new Date(instance.end_time).getTime() > Date.now() + (term?.duration_days || 30) * 86400000;
  return <section data-testid="class-purchase-options" className="space-y-4 py-5 border-y border-[#E5E6DF]">
    <h2 className="serif text-lg">Choose your practice</h2>
    {config.mode === "both" && <div className="grid grid-cols-2 gap-3">
      {["one_time", "subscription"].map((m) => <button type="button" key={m} onClick={() => setChoice(m)} data-testid={`class-purchase-${m}`} aria-pressed={mode === m} className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-sm transition-colors ${mode === m ? "border-[#B25A45] bg-[#FBF1EE] text-[#B25A45]" : "border-[#E5E6DF] hover:border-[#B25A45]"}`}>
        {m === "one_time" ? <Video className="h-5 w-5" /> : <CalendarRange className="h-5 w-5" />}{m === "one_time" ? "One class" : "Subscription"}
      </button>)}
    </div>}
    <div className="space-y-2"><p data-testid="class-purchase-price" className="serif text-3xl">{amount}</p>
      {sub ? <><p data-testid="class-subscription-scope" className="text-sm text-[#545E56]">{instance.title} · all classes in this series during your term</p><AccessTermSummary term={term} prefix="class-purchase" /></> : <p data-testid="class-single-scope" className="text-xs text-[#545E56]">One-time payment · {new Date(instance.start_time).toLocaleString()}</p>}
    </div>
    {(unavailable || rollingOut) && <p data-testid="class-term-unavailable" role="alert" className="text-sm text-[#B25A45]">This subscription period does not cover the selected class.</p>}
    {user ? <PaymentButtons itemType={sub ? "class_subscription" : "class_one_time"} itemId={sub ? instance.template_id : instance.id} disabled={unavailable || rollingOut} stripeLabel={`Pay ${amount}`} testIdPrefix="class-payment" /> : <Link data-testid="class-purchase-login" className="pill pill-primary w-full" to="/login">Sign in to purchase</Link>}
  </section>;
};
