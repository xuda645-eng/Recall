import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import id from "@/locales/id.json";
import zhCN from "@/locales/zh-CN.json";
const supportedLanguages = ["zh-CN", "en", "id"];
let preferredLanguage = "zh-CN";
try { const saved = localStorage.getItem("recall.ui.language"); if (saved && supportedLanguages.includes(saved)) preferredLanguage = saved; } catch { /* Keep restricted storage usable. */ }
i18n.use(initReactI18next).init({ resources: { en: { translation: en }, id: { translation: id }, "zh-CN": { translation: zhCN } }, lng: preferredLanguage, supportedLngs: supportedLanguages, fallbackLng: "en", interpolation: { escapeValue: false } });
i18n.addResourceBundle("en", "translation", {
  ratingAria: { again: "Rate as Again - forgot completely", hard: "Rate as Hard - remembered with difficulty", good: "Rate as Good - remembered with moderate effort", easy: "Rate as Easy - remembered easily", interval: "Next interval: {{interval}}" },
  colors: { zinc: "Zinc", blue: "Blue", green: "Green", rose: "Rose", amber: "Amber", violet: "Violet", slate: "Slate" },
  common: { xp: "XP", unknownError: "Unknown error" }, achievement: { shareText: "Earned with Recall: spaced repetition flashcards." }, onboarding: { dayLabel: "Day {{day}}", cardsPerDay: "cards/day" }, commandPalette: { commands: { import: "Open Import Hub", focus: "Open Focus Timer" } }, cardBrowser: { emptyTitle: "No cards yet", emptyDescription: "Add cards or change your filters.", unknownDeck: "Unknown deck" }, tagManager: { close: "Close" }, errorBoundary: { somethingWentWrong: "Something went wrong", description: "Your cards are stored locally. Return home or refresh to retry.", refresh: "Refresh App" }, pwa: { newVersionDescription: "A new version of Recall is ready. Update now to get the latest features and fixes.", dismiss: "Dismiss", updating: "Updating…", updateFailed: "Update failed. Please try again or reload the page." }
}, true, false);
if (typeof document !== "undefined") document.documentElement.lang = preferredLanguage;
i18n.on("languageChanged", (lng) => { if (typeof document !== "undefined") document.documentElement.lang = lng; try { localStorage.setItem("recall.ui.language", lng); } catch { /* Keep UI usable. */ } });
export default i18n;
