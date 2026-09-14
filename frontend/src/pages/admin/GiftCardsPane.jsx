import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";

function GiftCardsPane() {
  const [cards, setCards] = useState(null);
  const [amount, setAmount] = useState(50);
  const [currency, setCurrency] = useState("eur");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/gift-cards").then(({ data }) => setCards(data)).catch(() => setCards(false));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Enter a positive amount.");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/gift-cards", { amount: Number(amount), currency, note: note || null });
      toast.success(`Created ${data.code}`);
      setNote("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create"); }
    finally { setBusy(false); }
  };

  const deactivate = async (code) => {
    try { await api.post(`/admin/gift-cards/${code}/deactivate`); load(); }
    catch { toast.error("Failed"); }
  };

  const sym = (c) => (c === "usd" ? "$" : "€");
  const ic = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]";

  return (
    <div className="space-y-4" data-testid="giftcards-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
        <div className="eyebrow">Issue a gift card</div>
        <div className="flex gap-2">
          <input data-testid="giftcard-amount" type="number" min="1" className={ic} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
          <select data-testid="giftcard-currency" className={ic + " max-w-[110px]"} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="eur">EUR €</option>
            <option value="usd">USD $</option>
          </select>
        </div>
        <input data-testid="giftcard-note" className={ic} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. Holiday promo" />
        <button onClick={create} disabled={busy} data-testid="giftcard-create" className="pill pill-primary w-full">{busy ? "Creating…" : "Create gift card"}</button>
      </div>

      <div className="eyebrow">Issued cards {cards?.length ? `(${cards.length})` : ""}</div>
      {cards === null ? <Spinner /> : cards === false ? (
        <p className="text-sm text-[#6B7269]">Could not load gift cards.</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No gift cards yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="giftcards-list">
          {cards.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex items-center justify-between gap-3" data-testid={`giftcard-row-${c.code}`}>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold tracking-wide">{c.code}</div>
                <div className="text-xs text-[#6B7269]">{sym(c.currency)}{c.amount} · balance {sym(c.currency)}{c.balance}{c.note ? ` · ${c.note}` : ""}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] uppercase tracking-widest font-bold rounded-full px-2 py-1" style={{ background: c.status === "active" ? "#EEF1EC" : "#F2F2EC", color: c.status === "active" ? "#839682" : "#6B7269" }}>{c.status}</span>
                {c.status === "active" && (
                  <button onClick={() => deactivate(c.code)} data-testid={`giftcard-deactivate-${c.code}`} className="text-xs text-[#B25A45] hover:underline">Disable</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


export default GiftCardsPane;
