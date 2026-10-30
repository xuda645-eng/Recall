import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zhCN from "@/locales/zh-CN.json";
i18n.use(initReactI18next).init({
  lng: "en", fallbackLng: "en",
  resources: { en: { translation: { ...en, common: { ...en.common, xp: "XP" }, ratingAria: { again: "Rate as Again - forgot completely", hard: "Rate as Hard - remembered with difficulty", good: "Rate as Good - remembered with moderate effort", easy: "Rate as Easy - remembered easily", interval: "Next interval: {{interval}}" } } }, "zh-CN": { translation: zhCN } },
  interpolation: { escapeValue: false }
});
