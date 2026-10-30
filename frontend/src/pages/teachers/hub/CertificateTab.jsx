import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Printer, Plus, Trash2, GraduationCap, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { publicOrigin } from "@/lib/platform";
import Logo from "@/components/Logo";
import { Label, LabelText, Section, errText, fmtDate, inputCls } from "../teacherShared";

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  .ty-print-area, .ty-print-area * { visibility: visible !important; }
  .ty-print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
}`;

export default function CertificateTab({ me, reload }) {
  const { t } = useTranslation();
  const [ce, setCe] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ date: today, hours: "", title: "", provider: "", certificate_url: "" });
  const [busy, setBusy] = useState(false);
  const cert = me.certificate || {};
  const year = String(new Date().getFullYear());

  const load = useCallback(() => { api.get("/teacher/ce").then(({ data }) => setCe(data || [])).catch(() => setCe([])); }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/teacher/ce", { date: f.date, hours: Number(f.hours), title: f.title.trim(), provider: f.provider.trim() || null, certificate_url: f.certificate_url.trim() || null });
      toast.success(t("hub.ce_added", "Hours logged."));
      setF({ date: today, hours: "", title: "", provider: "", certificate_url: "" });
      load(); reload?.();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    try { await api.delete(`/teacher/ce/${id}`); load(); reload?.(); }
    catch (err) { toast.error(errText(err)); }
  };

  const hoursYear = (ce || []).filter((x) => String(x.date).startsWith(year)).reduce((s, x) => s + Number(x.hours || 0), 0);
  const need = Number(me.ce_hours_required || 0);
  const pct = need ? Math.min(100, Math.round((hoursYear * 100) / need)) : 100;
  const verifyUrl = cert.id ? `${publicOrigin()}/teachers/verify/${cert.id}` : "";

  return (
    <div className="space-y-6" data-testid="hub-certificate">
      <style>{PRINT_CSS}</style>
      {cert.id ? (
        <div className="space-y-3">
          <div className="ty-print-area rounded-3xl bg-white border-2 border-[#E0D3B8] p-8 text-center" data-testid="certificate-card">
            <Logo className="h-14 w-14 mx-auto" />
            <div className="text-[11px] uppercase tracking-[0.3em] text-[#839682] font-semibold mt-4">{me.label}</div>
            <div className="serif text-[34px] leading-tight mt-3" data-testid="certificate-name">{me.display_name}</div>
            <div className="text-[15px] text-[#545E56] mt-2">{cert.level}</div>
            <div className="mt-6 grid grid-cols-3 gap-2 text-[12px] max-w-md mx-auto">
              <div><div className="text-[#9AA096]">{t("teachers.cert_number", "Number")}</div><div className="font-semibold" data-testid="certificate-id">{cert.id}</div></div>
              <div><div className="text-[#9AA096]">{t("teachers.issued", "Issued")}</div><div className="font-semibold">{fmtDate(cert.issued_at)}</div></div>
              <div><div className="text-[#9AA096]">{t("teachers.renews", "Renews")}</div><div className="font-semibold">{fmtDate(cert.renews_at)}</div></div>
            </div>
            <div className="text-[11px] text-[#9AA096] mt-6 break-all">{t("hub.verify_at", "Verify at")} {verifyUrl}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="certificate-print"><Printer className="h-3.5 w-3.5" />{t("hub.print", "Print or save as PDF")}</button>
            <a href={`/teachers/verify/${cert.id}`} className="pill pill-ghost !py-2 !px-4 !text-xs"><ExternalLink className="h-3.5 w-3.5" />{t("hub.verify_page", "Public check page")}</a>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 flex gap-3 text-[13px] text-[#545E56]"><BadgeCheck className="h-5 w-5 text-[#839682] shrink-0" />{t("hub.cert_after", "Your certificate is issued when Tony's team approves your profile.")}</div>
      )}

      <Section icon={GraduationCap} title={t("hub.ce", "Continuing education")}>
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4">
          <div>
            <div className="flex items-baseline justify-between"><span className="text-[14px] font-semibold" data-testid="ce-progress">{t("hub.ce_year", "{{done}} of {{need}} hours in {{year}}", { done: hoursYear, need, year })}</span><span className="text-[12px] text-[#6B7269]">{pct}%</span></div>
            <div className="h-2 rounded-full bg-[#EEF1EC] overflow-hidden mt-2"><div className="h-full bg-[#B25A45]" style={{ width: `${pct}%` }} /></div>
            <p className="text-[11px] text-[#9AA096] mt-1">{t("hub.ce_hint", "Log workshops, trainings and courses you take. Tony's team verifies them at renewal.")}</p>
          </div>
          {ce === null ? <div className="h-12 rounded-xl bg-[#F2F2EC] animate-pulse" /> : ce.length > 0 && (
            <ul className="divide-y divide-[#F0F0EA]" data-testid="ce-list">
              {ce.map((x) => (
                <li key={x.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{x.title}</div>
                    <div className="text-[11px] text-[#6B7269]">{fmtDate(x.date)} · {x.hours} h{x.provider ? ` · ${x.provider}` : ""}
                      {x.certificate_url && <> · <a href={x.certificate_url} target="_blank" rel="noopener noreferrer" className="text-[#B25A45]">{t("hub.proof", "certificate")}</a></>}</div>
                  </div>
                  {x.status === "verified" ? <span className="text-[10px] uppercase tracking-widest font-bold text-[#3E7C57]">{t("hub.verified", "Verified")}</span>
                    : <button type="button" onClick={() => remove(x.id)} aria-label={t("hub.remove", "Remove")} className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center" data-testid={`ce-remove-${x.id}`}><Trash2 className="h-4 w-4 text-[#B25A45]" /></button>}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="space-y-3 border-t border-[#F0F0EA] pt-4" data-testid="ce-form">
            <div className="grid grid-cols-2 gap-3">
              <Label><LabelText>{t("hub.date", "Date")}</LabelText><input type="date" required value={f.date} max={today} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} className={inputCls} data-testid="ce-date" /></Label>
              <Label><LabelText>{t("hub.hours", "Hours")}</LabelText><input type="number" required min={0.5} max={200} step="0.5" value={f.hours} onChange={(e) => setF((x) => ({ ...x, hours: e.target.value }))} className={inputCls} data-testid="ce-hours" /></Label>
            </div>
            <Label><LabelText>{t("hub.what", "What you studied")}</LabelText><input required minLength={2} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} className={inputCls} data-testid="ce-title" /></Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Label><LabelText>{t("hub.provider", "With / provider")}</LabelText><input value={f.provider} onChange={(e) => setF((x) => ({ ...x, provider: e.target.value }))} className={inputCls} /></Label>
              <Label><LabelText>{t("hub.proof_link", "Certificate link")}</LabelText><input value={f.certificate_url} onChange={(e) => setF((x) => ({ ...x, certificate_url: e.target.value }))} className={inputCls} placeholder="https://" /></Label>
            </div>
            <button type="submit" disabled={busy} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="ce-add"><Plus className="h-3.5 w-3.5" />{t("hub.log_hours", "Log hours")}</button>
          </form>
        </div>
      </Section>
    </div>
  );
}
