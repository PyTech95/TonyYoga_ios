import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import { Label, LabelText, NotOpen, errText, inputCls, money, toList } from "./teacherShared";

const STATUS_TEXT = {
  applied: ["Application received", "Tony's team is reviewing it. We'll email you as soon as you're approved."],
  approved: ["You're approved", "Open your Teacher Hub to set up your profile, plan and first class."],
  paused: ["Your profile is paused", "Please contact Tony Yoga."],
  removed: ["Your profile was removed", "Please contact Tony Yoga if you have questions."],
};

export default function TeacherApply() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    display_name: user?.name || "", headline: "", bio: "", city: "", country: "", country_code: "", trainings: "",
    experience_years: "", languages: "", styles: "", online: true, in_person: false, website: "", instagram: "", tier_id: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.get("/teachers/info").then(({ data }) => {
      setInfo(data);
      setF((x) => ({ ...x, tier_id: x.tier_id || data?.tiers?.[0]?.id || "" }));
    }).catch((e) => { if (e?.response?.status === 404) setClosed(true); else setInfo({ tiers: [] }); });
  }, []);

  if (closed) return <NotOpen />;

  const submit = async (e) => {
    e.preventDefault();
    if (f.bio.trim().length < 20) { toast.error(t("teachers.bio_short", "Tell students a little more about you (at least 20 characters).")); return; }
    setBusy(true);
    try {
      await api.post("/teachers/apply", {
        display_name: f.display_name.trim(), headline: f.headline.trim() || null, bio: f.bio.trim(), city: f.city.trim(), country: f.country.trim(),
        country_code: f.country_code.trim() ? f.country_code.trim().toUpperCase() : null, trainings: f.trainings.trim(),
        experience_years: f.experience_years === "" ? null : Number(f.experience_years), languages: toList(f.languages), styles: toList(f.styles),
        online: f.online, in_person: f.in_person, website: f.website.trim() || null, instagram: f.instagram.trim() || null, tier_id: f.tier_id || null,
      });
      setDone(true);
      toast.success(t("teachers.applied", "Application sent."));
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const mine = done ? { status: "applied" } : info?.mine;
  if (mine && mine.status !== "declined") {
    const [title, body] = STATUS_TEXT[mine.status] || STATUS_TEXT.applied;
    return (
      <div data-testid="teacher-apply-status" className="pb-24">
        <PageHeader back eyebrow={t("teachers.for_teachers", "For teachers")} title={t("teachers.apply_title", "Teach on Tony Yoga")} />
        <div className="mx-auto max-w-2xl px-5">
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            {mine.status === "approved" ? <CheckCircle2 className="h-9 w-9 text-[#3E7C57] mx-auto" /> : <Clock className="h-9 w-9 text-[#B25A45] mx-auto" />}
            <div className="serif text-2xl mt-3" data-testid="teacher-apply-status-title">{t(`teachers.status_${mine.status}`, title)}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t(`teachers.status_${mine.status}_body`, body)}</p>
            <Link to="/teach" className="pill pill-primary mt-5" data-testid="teacher-apply-open-hub">{t("teachers.open_hub", "Open Teacher Hub")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="teacher-apply-page" className="pb-24">
      <PageHeader back eyebrow={t("teachers.for_teachers", "For teachers")} title={t("teachers.apply_title", "Teach on Tony Yoga")} testId="teacher-apply-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-6">
        <p className="text-[15px] text-[#545E56] leading-relaxed -mt-2">
          {t("teachers.apply_intro", "For teachers who trained with Tony and colleagues he approves. You get a verified {{label}} badge, your own schedule, courses and students, and payments straight to your bank.", { label: info?.label || "Tony-Certified" })}
        </p>

        {info?.tiers?.length > 0 && (
          <div>
            <LabelText>{t("teachers.choose_plan", "Choose your plan (you can change it later)")}</LabelText>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="teacher-apply-tiers">
              {info.tiers.map((tier) => (
                <button type="button" key={tier.id} onClick={() => set("tier_id", tier.id)} data-testid={`teacher-tier-${tier.id}`}
                  className={`text-left rounded-3xl border p-4 transition ${f.tier_id === tier.id ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`}>
                  <div className="flex items-center justify-between"><span className="serif text-xl">{tier.name}</span>{f.tier_id === tier.id && <BadgeCheck className="h-5 w-5 text-[#B25A45]" />}</div>
                  <div className="text-[14px] font-semibold mt-1">{Number(tier.price) > 0 ? `${money(tier.price, tier.currency)} / ${t("teachers.month", "month")}` : t("teachers.free", "Free")}</div>
                  <ul className="mt-2 space-y-1">{(tier.features || []).map((x) => <li key={x} className="text-[12px] text-[#545E56] flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#839682] shrink-0 mt-0.5" />{x}</li>)}</ul>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#9AA096] mt-2">{t("teachers.tier_note", "Nothing is charged now. You start the plan after you're approved.")}</p>
          </div>
        )}

        <form onSubmit={submit} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="teacher-apply-form">
          <Label><LabelText>{t("teachers.f_name", "Name students see")}</LabelText>
            <input required minLength={2} value={f.display_name} onChange={(e) => set("display_name", e.target.value)} className={inputCls} data-testid="apply-name" /></Label>
          <Label><LabelText>{t("teachers.f_headline", "One line about your teaching")}</LabelText>
            <input value={f.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} className={inputCls} placeholder={t("teachers.f_headline_ph", "Hot 26 and yin in Madrid")} data-testid="apply-headline" /></Label>
          <Label hint={t("teachers.f_bio_hint", "At least 20 characters. Your story, your training and how you teach.")}><LabelText>{t("teachers.f_bio", "About you")}</LabelText>
            <textarea required rows={5} value={f.bio} onChange={(e) => set("bio", e.target.value)} className={inputCls} data-testid="apply-bio" /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label><LabelText>{t("teachers.f_city", "City")}</LabelText><input required value={f.city} onChange={(e) => set("city", e.target.value)} className={inputCls} data-testid="apply-city" /></Label>
            <Label><LabelText>{t("teachers.f_country", "Country")}</LabelText><input required minLength={2} value={f.country} onChange={(e) => set("country", e.target.value)} className={inputCls} data-testid="apply-country" /></Label>
          </div>
          <Label hint={t("teachers.f_cc_hint", "Two letters (ES, IT, US…), used to set up your payouts.")}><LabelText>{t("teachers.f_cc", "Country code")}</LabelText>
            <input value={f.country_code} onChange={(e) => set("country_code", e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2))} className={inputCls} data-testid="apply-country-code" /></Label>
          <Label hint={t("teachers.f_trainings_hint", "Which of Tony's trainings you completed, and when.")}><LabelText>{t("teachers.f_trainings", "Training with Tony")}</LabelText>
            <textarea required rows={2} value={f.trainings} onChange={(e) => set("trainings", e.target.value)} className={inputCls} data-testid="apply-trainings" /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label><LabelText>{t("teachers.f_years", "Years teaching")}</LabelText><input type="number" min={0} max={70} value={f.experience_years} onChange={(e) => set("experience_years", e.target.value)} className={inputCls} data-testid="apply-years" /></Label>
            <Label><LabelText>{t("teachers.f_instagram", "Instagram")}</LabelText><input value={f.instagram} onChange={(e) => set("instagram", e.target.value)} className={inputCls} placeholder="@" /></Label>
          </div>
          <Label hint={t("teachers.comma", "Separate with commas.")}><LabelText>{t("teachers.f_languages", "Languages you teach in")}</LabelText>
            <input value={f.languages} onChange={(e) => set("languages", e.target.value)} className={inputCls} placeholder="English, Spanish" data-testid="apply-languages" /></Label>
          <Label hint={t("teachers.comma", "Separate with commas.")}><LabelText>{t("teachers.f_styles", "Styles")}</LabelText>
            <input value={f.styles} onChange={(e) => set("styles", e.target.value)} className={inputCls} placeholder="Hot 26, Yin, Pranayama" data-testid="apply-styles" /></Label>
          <Label><LabelText>{t("teachers.f_website", "Website")}</LabelText><input type="url" value={f.website} onChange={(e) => set("website", e.target.value)} className={inputCls} placeholder="https://" /></Label>
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.online} onChange={(e) => set("online", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" data-testid="apply-online" />{t("teachers.f_online", "I teach online")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.in_person} onChange={(e) => set("in_person", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" data-testid="apply-in-person" />{t("teachers.f_in_person", "I teach in person")}</label>
          </div>
          <button type="submit" disabled={busy} className="pill pill-primary w-full" data-testid="apply-submit">{busy ? "…" : t("teachers.send_application", "Send application")}</button>
        </form>
      </div>
    </div>
  );
}
