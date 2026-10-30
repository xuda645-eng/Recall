import { afterEach, describe, expect, it } from "vitest";
import i18n from "i18next";
import en from "@/locales/en.json";
import zh from "@/locales/zh-CN.json";
import { localizeInterval, achievementText } from "@/lib/display-language";
function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce<Record<string, string>>((out, [key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return { ...out, ...(typeof item === "string" ? { [path]: item } : leaves(item, path)) };
  }, {});
}
afterEach(() => { void i18n.changeLanguage("en"); });
describe("Chinese interface contract", () => {
  it("covers every English key and preserves interpolation names", () => {
    const english = leaves(en); const chinese = leaves(zh);
    for (const [key, text] of Object.entries(english)) {
      expect(chinese[key], key).toBeDefined();
      expect(chinese[key].match(/{{.*?}}/g)?.sort() ?? [], key).toEqual(text.match(/{{.*?}}/g)?.sort() ?? []);
    }
  });
  it("translates core actions and units without changing scheduling", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(i18n.t("study.reveal")).toBe("显示答案"); expect(i18n.t("study.exit")).toBe("退出");
    expect(localizeInterval("10m")).toBe("10 分钟"); expect(localizeInterval("8d")).toBe("8 天"); expect(localizeInterval("<1m")).toBe("不足 1 分钟");
    await i18n.changeLanguage("en"); expect(localizeInterval("10m")).toBe("10m");
  });
  it("localizes stored achievement labels without mutating the record", async () => {
    await i18n.changeLanguage("zh-CN");
    const original = { id: "first_steps", title: "First Steps", description: "Complete your first review session", icon: "", unlockedAt: null };
    expect(achievementText(original).title).toBe("第一步"); expect(original.title).toBe("First Steps");
  });
});
