import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { User, Landmark, Save } from "lucide-react";
import { api } from "@/lib/api";
import { Label, LabelText, Section, errText, fromList, inputCls, toList } from "../teacherShared";

export default function ProfileTab({ me, reload }) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    display_name: me.display_name || "", headline: me.headline || "", bio: me.bio || "", photo: me.photo || "", city: me.city || "",
    country: me.country || "", country_code: me.country_code || "", languages: fromList(me.languages), styles: fromList(me.styles),
    online: !!me.online, in_person: !!me.in_person, website: me.website || "", instagram: me.instagram || "",
  });
  const tax0 = me.tax || {};
  const [tax, setTax] = useState({
    legal_name: tax0.legal_name || "", entity: tax0.entity || "individual", tax_id: tax0.tax_id || "", vat_number: tax0.vat_number || "",
    date_of_birth: tax0.date_of_birth || "", address: tax0.address || "", country_of_residence: tax0.country_of_residence || me.country || "",
  });
  const [busy, setBusy] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setT = (k, v) => setTax((x) => ({ ...x, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy("profile");
    try {
      await api.patch("/teacher/me", {
        display_name: f.display_name.trim(), headline: f.headline.trim(), bio: f.bio, photo: f.photo.trim() || null, city: f.city.trim(), country: f.country.trim(),
        country_code: f.country_code.trim() ? f.country_code.trim().toUpperCase() : null, languages: toList(f.languages), styles: toList(f.styles),
        online: f.online, in_person: f.in_person, website: f.website.trim() || null, instagram: f.instagram.trim() || null,
      });
      toast.success(t("hub.profile_saved", "Profile saved."));
      reload();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(null); }
  };

  const saveTax = async (e) => {
    e.preventDefault();
    if (tax.entity === "individual" && !tax.date_of_birth) { toast.error(t("hub.dob_needed", "Date of birth is required for individuals.")); return; }
    setBusy("tax");
    try {
      await api.put("/teacher/me/tax", { ...tax, vat_number: tax.vat_number || null, date_of_birth: tax.date_of_birth || null });
      toast.success(t("hub.tax_saved", "Tax details saved."));
      reload();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6" data-testid="hub-profile">
      <Section icon={User} title={t("hub.profile", "Public profile")}>
        <form onSubmit={save} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="profile-form">
          <Label><LabelText>{t("teachers.f_name", "Name students see")}</LabelText><input required minLength={2} value={f.display_name} onChange={(e) => set("display_name", e.target.value)} className={inputCls} data-testid="profile-name" /></Label>
          <Label><LabelText>{t("teachers.f_headline", "One line about your teaching")}</LabelText><input value={f.headline} maxLength={120} onChange={(e) => set("headline", e.target.value)} className={inputCls} data-testid="profile-headline" /></Label>
          <Label><LabelText>{t("teachers.f_bio", "About you")}</LabelText><textarea rows={5} value={f.bio} onChange={(e) => set("bio", e.target.value)} className={inputCls} data-testid="profile-bio" /></Label>
          <Label hint={t("hub.photo_hint", "A square photo works best.")}><LabelText>{t("hub.photo", "Photo link")}</LabelText><input value={f.photo} onChange={(e) => set("photo", e.target.value)} className={inputCls} placeholder="https://" data-testid="profile-photo" /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label><LabelText>{t("teachers.f_city", "City")}</LabelText><input value={f.city} onChange={(e) => set("city", e.target.value)} className={inputCls} /></Label>
            <Label><LabelText>{t("teachers.f_country", "Country")}</LabelText><input value={f.country} onChange={(e) => set("country", e.target.value)} className={inputCls} /></Label>
          </div>
          <Label hint={t("teachers.f_cc_hint", "Two letters (ES, IT, US…), used to set up your payouts.")}><LabelText>{t("teachers.f_cc", "Country code")}</LabelText>
            <input value={f.country_code} onChange={(e) => set("country_code", e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2))} className={inputCls} /></Label>
          <Label hint={t("teachers.comma", "Separate with commas.")}><LabelText>{t("teachers.f_languages", "Languages you teach in")}</LabelText><input value={f.languages} onChange={(e) => set("languages", e.target.value)} className={inputCls} /></Label>
          <Label hint={t("teachers.comma", "Separate with commas.")}><LabelText>{t("teachers.f_styles", "Styles")}</LabelText><input value={f.styles} onChange={(e) => set("styles", e.target.value)} className={inputCls} /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label><LabelText>{t("teachers.f_website", "Website")}</LabelText><input value={f.website} onChange={(e) => set("website", e.target.value)} className={inputCls} placeholder="https://" /></Label>
            <Label><LabelText>{t("teachers.f_instagram", "Instagram")}</LabelText><input value={f.instagram} onChange={(e) => set("instagram", e.target.value)} className={inputCls} placeholder="@" /></Label>
          </div>
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.online} onChange={(e) => set("online", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />{t("teachers.f_online", "I teach online")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.in_person} onChange={(e) => set("in_person", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />{t("teachers.f_in_person", "I teach in person")}</label>
          </div>
          <button type="submit" disabled={busy === "profile"} className="pill pill-primary" data-testid="profile-save"><Save className="h-4 w-4" />{t("hub.save", "Save")}</button>
        </form>
      </Section>

      <Section icon={Landmark} title={t("hub.tax", "Tax details (private)")}>
        <form onSubmit={saveTax} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="tax-form">
          <p className="text-[12px] text-[#6B7269] leading-relaxed">
            {t("hub.tax_intro", "EU rules (DAC7) require Tony Yoga to report, once a year, what teachers were paid through the platform. Only Tony Yoga's admins see these details. They are never shown on your profile.")}
          </p>
          {me.tax?.updated_at && <p className="text-[12px] text-[#3E7C57] font-semibold" data-testid="tax-saved">{t("hub.tax_on_file", "Details on file.")}</p>}
          <div className="flex flex-wrap gap-1.5">
            {[["individual", t("hub.individual", "Individual")], ["company", t("hub.company", "Company")]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setT("entity", v)} data-testid={`tax-entity-${v}`}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${tax.entity === v ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>{label}</button>
            ))}
          </div>
          <Label><LabelText>{t("hub.legal_name", "Legal name")}</LabelText><input required minLength={2} value={tax.legal_name} onChange={(e) => setT("legal_name", e.target.value)} className={inputCls} data-testid="tax-legal-name" /></Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Label><LabelText>{t("hub.tax_id", "Tax ID (NIF, Codice fiscale…)")}</LabelText><input required minLength={3} value={tax.tax_id} onChange={(e) => setT("tax_id", e.target.value)} className={inputCls} data-testid="tax-id" /></Label>
            <Label><LabelText>{t("hub.vat", "VAT number (if any)")}</LabelText><input value={tax.vat_number} onChange={(e) => setT("vat_number", e.target.value)} className={inputCls} /></Label>
          </div>
          {tax.entity === "individual" && (
            <Label><LabelText>{t("hub.dob", "Date of birth")}</LabelText><input type="date" value={tax.date_of_birth} onChange={(e) => setT("date_of_birth", e.target.value)} className={inputCls} data-testid="tax-dob" /></Label>
          )}
          <Label><LabelText>{t("hub.address", "Address")}</LabelText><textarea required minLength={5} rows={2} value={tax.address} onChange={(e) => setT("address", e.target.value)} className={inputCls} data-testid="tax-address" /></Label>
          <Label><LabelText>{t("hub.residence", "Country of residence")}</LabelText><input required minLength={2} value={tax.country_of_residence} onChange={(e) => setT("country_of_residence", e.target.value)} className={inputCls} data-testid="tax-country" /></Label>
          <button type="submit" disabled={busy === "tax"} className="pill pill-primary" data-testid="tax-save"><Save className="h-4 w-4" />{t("hub.save_tax", "Save tax details")}</button>
        </form>
      </Section>
    </div>
  );
}
