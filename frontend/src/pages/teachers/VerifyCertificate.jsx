import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { fmtDate } from "./teacherShared";

export default function VerifyCertificate() {
  const { certId } = useParams();
  const { t } = useTranslation();
  const [c, setC] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.get(`/teachers/verify/${encodeURIComponent(certId)}`).then(({ data }) => setC(data)).catch(() => setMissing(true));
  }, [certId]);

  return (
    <div data-testid="verify-page" className="pb-24">
      <PageHeader back eyebrow={t("teachers.verify_eyebrow", "Certificate check")} title={t("teachers.verify_title", "Verify a teacher")} />
      <div className="mx-auto max-w-md px-5">
        {!c && !missing && <div className="h-48 rounded-3xl bg-[#F2F2EC] animate-pulse" aria-busy="true" />}
        {missing && (
          <div className="rounded-3xl bg-white border border-[#EED9D2] p-8 text-center" data-testid="verify-missing">
            <ShieldAlert className="h-9 w-9 text-[#B25A45] mx-auto" />
            <div className="serif text-2xl mt-3">{t("teachers.verify_none", "No certificate found")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("teachers.verify_none_body", "No teacher holds certificate {{id}}. Check the number and try again.", { id: certId })}</p>
          </div>
        )}
        {c && (
          <div className={`rounded-3xl border p-7 text-center ${c.valid ? "bg-white border-[#CFE3D5]" : "bg-white border-[#EED9D2]"}`} data-testid={c.valid ? "verify-valid" : "verify-expired"}>
            {c.valid ? <BadgeCheck className="h-10 w-10 text-[#3E7C57] mx-auto" /> : <ShieldAlert className="h-10 w-10 text-[#B25A45] mx-auto" />}
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold mt-3" style={{ color: c.valid ? "#3E7C57" : "#B25A45" }}>
              {c.valid ? t("teachers.verify_ok", "Valid {{label}} certificate", { label: c.label }) : t("teachers.verify_expired", "Not currently valid")}
            </div>
            <div className="serif text-3xl mt-2" data-testid="verify-name">{c.name}</div>
            {c.level && <div className="text-[14px] text-[#545E56] mt-1">{c.level}</div>}
            <dl className="mt-5 grid grid-cols-3 gap-2 text-[12px]">
              <div><dt className="text-[#9AA096]">{t("teachers.cert_number", "Number")}</dt><dd className="font-semibold">{c.id}</dd></div>
              <div><dt className="text-[#9AA096]">{t("teachers.issued", "Issued")}</dt><dd className="font-semibold">{fmtDate(c.issued_at)}</dd></div>
              <div><dt className="text-[#9AA096]">{t("teachers.renews", "Renews")}</dt><dd className="font-semibold">{fmtDate(c.renews_at)}</dd></div>
            </dl>
            {c.slug && (
              <Link to={`/teachers/${c.slug}`} className="mt-6 inline-flex items-center gap-1 text-[13px] font-semibold text-[#B25A45]" data-testid="verify-profile">
                {t("teachers.see_profile", "See their classes")} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
