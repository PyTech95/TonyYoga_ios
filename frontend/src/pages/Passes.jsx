import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import PaymentButtons from "@/components/PaymentButtons";

export default function Passes() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [mine, setMine] = useState(null);

  const load = async () => {
    try {
      const [cat, my] = await Promise.all([
        api.get("/passes/catalog"),
        user ? api.get("/passes/mine") : Promise.resolve({ data: null }),
      ]);
      setCatalog(cat.data);
      setMine(my.data);
    } catch { setMine(false); }
  };
  useEffect(() => { load(); }, [user]);

  const guardSignedIn = async () => {
    if (!user) { toast("Sign in to buy passes."); nav("/login"); return false; }
    return true;
  };

  return (
    <div data-testid="passes-page" className="pb-6">
      <PageHeader eyebrow="Pay-as-you-go" title="Class passes" back testId="passes-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {mine === null ? <Spinner /> : mine && (
          <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6 flex items-center gap-4" data-testid="passes-remaining-card">
            <div className="h-14 w-14 rounded-2xl bg-[#B25A45] flex items-center justify-center">
              <Ticket className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow !text-[#B25A45]">Passes remaining</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="serif text-4xl" data-testid="passes-remaining">{mine.remaining}</span>
                <span className="text-xs text-white/60">credit{mine.remaining === 1 ? "" : "s"}</span>
              </div>
              <div className="text-[11px] text-white/60 mt-1">Auto-used when Tony checks you in.</div>
            </div>
          </div>
        )}

        {catalog.length === 0 ? <Spinner /> : (
          <ul className="space-y-3" data-testid="passes-catalog">
            {catalog.map((c) => {
              const isPack = c.id === "class_pack";
              return (
                <li key={c.id}>
                  <div className={`rounded-3xl p-6 relative ${isPack ? "bg-white border-2 border-[#B25A45]" : "bg-white border border-[#E5E6DF]"}`}>
                    {isPack && (
                      <div className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-[#B25A45] text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1">
                        Best value
                      </div>
                    )}
                    <div className="eyebrow">{c.credits} credit{c.credits === 1 ? "" : "s"}</div>
                    <div className="serif text-2xl mt-1">{c.title}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="serif text-4xl">€{Math.round(c.price)}</span>
                      {isPack && <span className="text-xs text-[#B25A45] font-semibold ml-2">save €11</span>}
                    </div>
                    <p className="text-sm text-[#545E56] mt-3 leading-relaxed">{c.description}</p>
                    <div className="mt-5">
                      <PaymentButtons
                        itemType={c.id}
                        itemId={c.id}
                        stripeLabel={`Buy ${c.title.toLowerCase()}`}
                        onBeforeCheckout={guardSignedIn}
                        testIdPrefix={`pass-buy-${c.id}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {mine && mine.recent_usage?.length > 0 && (
          <section>
            <div className="eyebrow mb-2">Recent</div>
            <ul className="space-y-2" data-testid="passes-usage">
              {mine.recent_usage.slice(0, 5).map((u) => (
                <li key={u.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 text-sm flex justify-between">
                  <span className="text-[#545E56]">Class checked in</span>
                  <span className="text-xs text-[#6B7269]">{new Date(u.used_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
