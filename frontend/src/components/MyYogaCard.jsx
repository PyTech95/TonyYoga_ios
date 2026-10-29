import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flower2, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useCommerceRefresh } from "@/lib/useCommerceRefresh";

function fmtDate(iso) {
  if (!iso) return "";
  if (String(iso).startsWith("2099")) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Short summary of what the member has, linking to the full My Yoga page (Profile + Home). */
export default function MyYogaCard({ compact = false }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const load = useCallback(() => { api.get("/me/library").then(({ data }) => setData(data)).catch(() => setData(false)); }, []);
  useEffect(() => { load(); }, [load]);
  useCommerceRefresh(load);
  if (data === false) return null;

  const active = data?.memberships?.find((m) => m.state === "active");
  const courses = (data?.courses || []).filter((c) => c.has_access).length;
  const toChoose = data?.choose_courses?.[0];
  const pending = data?.pending_payments?.length > 0;
  const lines = [];
  if (active) lines.push(`${active.plan_name}${fmtDate(active.end_date) ? ` · ${t("myyoga.until", "Until")} ${fmtDate(active.end_date)}` : ""}`);
  if (courses) lines.push(t("myyoga.n_courses", "{{n}} course(s)", { n: courses }));
  if (data?.credits) lines.push(t("myyoga.n_credits", "{{n}} class credit(s)", { n: data.credits }));
  if (data?.upcoming_bookings?.length) lines.push(t("myyoga.n_booked", "{{n}} class(es) booked", { n: data.upcoming_bookings.length }));

  return (
    <Link to="/my-yoga" data-testid="my-yoga-card"
      className={`block rounded-3xl ${toChoose ? "bg-[#1C221F] text-[#FAFAF7]" : "bg-white border border-[#E5E6DF]"} ${compact ? "p-4" : "p-5"} hover:shadow-md transition`}>
      <div className="flex items-center gap-3">
        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${toChoose ? "bg-white/10" : "bg-[#F7EDE8]"}`}>
          {pending ? <Loader2 className="h-5 w-5 text-[#B25A45] animate-spin" /> : toChoose ? <Sparkles className="h-5 w-5 text-[#E8B8A8]" /> : <Flower2 className="h-5 w-5 text-[#B25A45]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] uppercase tracking-[0.2em] font-semibold ${toChoose ? "text-[#E8B8A8]" : "text-[#839682]"}`}>{t("myyoga.title", "My Yoga")}</div>
          <div className="text-[15px] font-semibold leading-snug truncate">
            {data === null ? "…" : toChoose ? t("myyoga.choose_cta", "Choose your included course") :
              pending ? t("myyoga.pending_title", "We're confirming your payment") :
              lines.length ? lines.join(" · ") : t("myyoga.empty_short", "Your courses, classes and orders")}
          </div>
        </div>
        <ArrowRight className={`h-5 w-5 shrink-0 ${toChoose ? "text-white" : "text-[#B25A45]"}`} />
      </div>
    </Link>
  );
}
