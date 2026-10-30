import i18n from "@/lib/i18n";
import type { Achievement } from "@/types";

export function formatUiDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(i18n.language, options).format(date);
}

/** Translate display units only; FSRS scheduling values remain unchanged. */
export function localizeInterval(interval: string): string {
  if (!i18n.language.startsWith("zh")) return interval;
  if (interval === "<1m") return "不足 1 分钟";
  const match = interval.match(/^(\d+(?:\.\d+)?)(mo|m|h|d|y)$/);
  if (!match) return interval;
  const units: Record<string, string> = { m: "分钟", h: "小时", d: "天", mo: "个月", y: "年" };
  return `${new Intl.NumberFormat(i18n.language).format(Number(match[1]))} ${units[match[2]]}`;
}

/** Stored achievements are not rewritten when the UI language changes. */
export function achievementText(achievement: Achievement): { title: string; description: string } {
  return {
    title: i18n.t(`achievementNames.${achievement.id}.title`, { defaultValue: achievement.title }),
    description: i18n.t(`achievementNames.${achievement.id}.description`, { defaultValue: achievement.description }),
  };
}
