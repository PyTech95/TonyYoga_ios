import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LifeBuoy, CheckCircle2, Clock } from "lucide-react";
import { api } from "@/lib/api";

const fmt = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** My Yoga: messages the student sent to Tony's team (through the assistant) and the answers.
 *  Renders nothing when there are none. */
export default function HelpMessagesSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    api.get("/me/help-requests").then(({ data }) => { if (live) setRows(data?.requests || []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (rows.length && window.location.hash === "#help") document.getElementById("help")?.scrollIntoView({ behavior: "smooth" });
  }, [rows.length]);
  if (!rows.length) return null;
  return (
    <section id="help" className="scroll-mt-24" data-testid="my-yoga-help">
      <div className="flex items-center gap-2 mb-3">
        <LifeBuoy className="h-4 w-4 text-[#B25A45]" />
        <h2 className="eyebrow !text-[11px]">{t("myyoga.help_title", "Messages with Tony’s team")}</h2>
      </div>
      <div className="space-y-2">
        {rows.slice(0, 6).map((r) => (
          <div key={r.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`my-help-${r.ref}`}>
            <div className="flex items-center gap-2 text-[11px] text-[#6B7269]">
              <span className="font-mono font-bold text-[#1C221F]">{r.ref}</span>
              <span>· {fmt(r.created_at)}</span>
              <span className={`ml-auto inline-flex items-center gap-1 font-bold uppercase tracking-widest text-[10px] ${r.status === "resolved" ? "text-[#3E7C57]" : "text-[#B25A45]"}`}>
                {r.status === "resolved" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {r.status === "resolved" ? t("myyoga.help_answered", "Answered") : t("myyoga.help_open", "With the team")}
              </span>
            </div>
            <p className="text-[14px] text-[#1C221F] mt-1.5">{r.summary}</p>
            {(r.replies || []).map((x, i) => (
              <div key={i} className="mt-2 rounded-xl bg-[#F2F7F3] border border-[#DCEBDF] p-3 text-[13px]" data-testid="my-help-reply">
                <div className="text-[11px] text-[#5B7A63] mb-1">{x.by} · {fmt(x.at)}</div>
                <p className="whitespace-pre-line">{x.text}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
