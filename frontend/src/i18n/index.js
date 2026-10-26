import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { isIOSApp } from "../lib/iosPlatform";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import de from "./locales/de.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import hi from "./locales/hi.json";
import ar from "./locales/ar.json";
import sa from "./locales/sa.json";

// Language metadata used by the picker. `dir` drives RTL layout (Arabic).
const ALL_LANGUAGES = [
  { code: "en", native: "English", label: "English" },
  { code: "es", native: "Español", label: "Spanish" },
  { code: "fr", native: "Français", label: "French" },
  { code: "it", native: "Italiano", label: "Italian" },
  { code: "pt", native: "Português", label: "Portuguese" },
  { code: "de", native: "Deutsch", label: "German" },
  { code: "nl", native: "Nederlands", label: "Dutch" },
  { code: "pl", native: "Polski", label: "Polish" },
  { code: "ru", native: "Русский", label: "Russian" },
  { code: "zh", native: "简体中文", label: "Chinese" },
  { code: "ja", native: "日本語", label: "Japanese" },
  { code: "hi", native: "हिन्दी", label: "Hindi" },
  { code: "ar", native: "العربية", label: "Arabic", dir: "rtl" },
  { code: "sa", native: "संस्कृतम्", label: "Sanskrit" },
];

// The iPhone / iPad app is listed and reviewed in English and Spanish only.
const IOS_APP = isIOSApp();
export const LANGUAGES = IOS_APP ? ALL_LANGUAGES.filter((l) => l.code === "en" || l.code === "es") : ALL_LANGUAGES;

const RTL = new Set(LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code));

// Keep <html lang> and text direction in sync with the active language.
function applyDir(lng) {
  const code = (lng || "en").split("-")[0];
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", code);
    document.documentElement.setAttribute("dir", RTL.has(code) ? "rtl" : "ltr");
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en }, es: { translation: es }, fr: { translation: fr },
      it: { translation: it }, pt: { translation: pt }, de: { translation: de },
      nl: { translation: nl }, pl: { translation: pl }, ru: { translation: ru },
      zh: { translation: zh }, ja: { translation: ja }, hi: { translation: hi },
      ar: { translation: ar }, sa: { translation: sa },
    },
    fallbackLng: "en",
    supportedLngs: LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // en-US -> en, pt-BR -> pt, zh-CN -> zh
    load: "languageOnly",
    // Keys are flat literal strings (e.g. "i18n:memb.plan.essential.name", "nav.home"),
    // so disable namespace/key separators to avoid unintended nesting.
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    detection: {
      // First visit: use the browser language; after that, the saved choice wins.
      order: IOS_APP ? ["localStorage"] : ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "ty_lang",
    },
  });

applyDir(i18n.resolvedLanguage || i18n.language);
i18n.on("languageChanged", applyDir);

export default i18n;
