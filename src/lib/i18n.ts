import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import id from "@/locales/id.json";
import zhCN from "@/locales/zh-CN.json";

// A separate preference prevents an old upstream detector cache from keeping
// this personal deployment in English. It never touches the card snapshot.
const supportedLanguages = ["zh-CN", "en", "id"];
let preferredLanguage = "zh-CN";
try {
  const saved = localStorage.getItem("recall.ui.language");
  if (saved && supportedLanguages.includes(saved)) preferredLanguage = saved;
} catch { /* Storage can be unavailable in private/restricted contexts. */ }

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    id: { translation: id },
    "zh-CN": { translation: zhCN },
  },
  lng: preferredLanguage,
  supportedLngs: supportedLanguages,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") document.documentElement.lang = preferredLanguage;
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
  try { localStorage.setItem("recall.ui.language", lng); } catch { /* Keep UI usable. */ }
});
export default i18n;
