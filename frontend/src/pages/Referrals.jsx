import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, Send, Gift } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

export default function Referrals() {
  const [stats, setStats] = useState(null);
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/referrals/mine"); setStats(data); }
    catch { setStats(false); }
  };

  useEffect(() => { load(); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stats.share_url);
      toast.success("Link copied.");
    } catch { toast.error("Could not copy"); }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tony Yoga",
          text: "Come practice with Tony — your first class is free.",
          url: stats.share_url,
        });
      } catch {}
    } else {
      copy();
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    const list = emails.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.includes("@"));
    if (list.length === 0) { toast.error("Add at least one email"); return; }
    setSending(true);
    try {
      const { data } = await api.post("/referrals/invite", { emails: list, personal_note: note || undefined });
      toast.success(`Sent ${data.sent.length} invite${data.sent.length === 1 ? "" : "s"}.`);
      setEmails(""); setNote("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send invites");
    } finally { setSending(false); }
  };

  if (stats === null) return <><PageHeader back /><Spinner /></>;
  if (stats === false) return <><PageHeader back title="Sign in required" /></>;

  return (
    <div data-testid="referrals-page" className="pb-6">
      <PageHeader eyebrow="Share the practice" title="Invite a friend" back testId="referrals-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6">
          <div className="flex items-start gap-3 mb-2">
            <Gift className="h-5 w-5 text-[#B25A45]" />
            <span className="eyebrow !text-[#B25A45]">Give a class, get a month</span>
          </div>
          <h3 className="serif text-2xl leading-tight mb-3">Your friend's first class is free.</h3>
          <p className="text-sm text-white/70 leading-relaxed">
            When they join a membership, you get a free month added to yours. No cap — invite everyone who could use a little more breath.
          </p>
        </div>

        {/* Share link */}
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5" data-testid="referrals-link-card">
          <div className="eyebrow mb-2">Your share link</div>
          <div className="flex items-center gap-2 rounded-xl bg-[#F2F2EC] px-3 py-2 text-xs font-mono text-[#545E56] break-all">
            {stats.share_url}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={copy} data-testid="referrals-copy" className="pill pill-ghost !text-[13px]">
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button onClick={share} data-testid="referrals-share" className="pill pill-primary !text-[13px]">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 text-center">
            <div className="serif text-2xl" data-testid="referrals-signups">{stats.total_signups}</div>
            <div className="eyebrow mt-1 !text-[10px]">Sign-ups</div>
          </div>
          <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 text-center">
            <div className="serif text-2xl" data-testid="referrals-converted">{stats.total_converted}</div>
            <div className="eyebrow mt-1 !text-[10px]">Converted</div>
          </div>
          <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 text-center">
            <div className="serif text-2xl text-[#B25A45]" data-testid="referrals-credit-days">{stats.pending_credits_days}</div>
            <div className="eyebrow mt-1 !text-[10px]">Free days</div>
          </div>
        </div>

        {/* Invite form */}
        <form onSubmit={invite} className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3">
          <div className="eyebrow">Invite by email</div>
          <textarea
            data-testid="referrals-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            rows={3}
            className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45] focus:border-transparent"
          />
          <input
            data-testid="referrals-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Personal note (optional)"
            className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45] focus:border-transparent"
          />
          <button type="submit" disabled={sending} data-testid="referrals-send" className="pill pill-primary w-full">
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send invites"}
          </button>
        </form>
      </div>
    </div>
  );
}
