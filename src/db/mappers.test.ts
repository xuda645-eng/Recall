import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/data/seed";
import { DEFAULT_FIXED_INTERVALS } from "@/services/memory-review";
import type { CardRow, DeckRow, ReviewLogRow, StudySessionRow } from "@/db/mappers";
import {
  cardFromRow,
  cardToRow,
  deckFromRow,
  deckToRow,
  reviewLogFromRow,
  reviewLogToRow,
  settingsFromRows,
  settingsToRows,
  studySessionFromRow,
  studySessionToRow,
} from "@/db/mappers";
import type { Card, Deck, MemoryReviewPlan, RecallSettings, ReviewLog, StudySession } from "@/types";

describe("database mappers", () => {
  it("round-trips card rows with JSON tags and nullable review date", () => {
    const card: Card = {
      id: "card-1",
      deckId: "deck-1",
      front: "Question",
      back: "Answer",
      hint: "",
      source: "",
      tags: ["sqlite", "tauri"],
      cardType: "basic",
      state: "new",
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0, learningSteps: 0,
      lastReviewDate: null,
      nextReviewDate: "2026-06-01T00:00:00.000Z",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };

    const row = cardToRow(card);
    expect(row.tags).toBe('["sqlite","tauri"]');
    expect(row.last_review_date).toBeNull();
    expect(cardFromRow(row)).toEqual(card);
  });

  it("round-trips deck, session, review log, and settings rows", () => {
    const deck: Deck = {
      id: "deck-1",
      name: "SQLite",
      description: "Local data",
      color: "green",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const session: StudySession = {
      id: "session-1",
      deckId: null,
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:15:00.000Z",
      cardsStudied: 2,
    };
    const reviewLog: ReviewLog = {
      id: "review-1",
      cardId: "card-1",
      rating: "good",
      reviewDate: "2026-06-01T00:10:00.000Z",
      stability: 1.0,
      difficulty: 5.0,
      elapsedDays: 0,
      scheduledDays: 1,
    };
    const settings: RecallSettings = {
      theme: "dark",
      accentColor: "zinc",
      dyslexiaFont: false,
      seededAt: "2026-06-01T00:00:00.000Z",
      dailyNewCardLimit: 20,
      leechThreshold: 5,
      onboardingComplete: true,
      xp: 0,
      achievements: [],
      dailyGoal: 20,
      notificationsEnabled: false,
      soundVolume: 100,
      allowHtml: false,
desiredRetention: 0.9,
      backupFolder: null,
      backupSchedule: "never",
      lastBackupAt: null,
            syncFolder: null,
            syncEnabled: false, syncCode: null, syncRelayUrl: null, syncLastAt: null, syncAutoInterval: 0,
            ttsEnabled: false,
          ttsAutoRead: false,
          ttsSpeed: 1,
          fsrsWeights: null,
          voiceInputEnabled: true, swipeGestures: true,
          colorBlindMode: false,
          shortcuts: null,
    };

    expect(deckFromRow(deckToRow(deck) as DeckRow)).toEqual(deck);
    expect(studySessionFromRow(studySessionToRow(session) as StudySessionRow)).toEqual(session);
    expect(reviewLogFromRow(reviewLogToRow(reviewLog) as ReviewLogRow)).toEqual(reviewLog);
    expect(settingsFromRows(settingsToRows(settings))).toEqual({
      ...settings, studyPreferences: { newCardRatio: 0.3, batchSize: 10, sessionMinutes: 30 },
    });
    expect(settingsToRows(settings)).toContainEqual({ key: "schema_version", value: "9" });
  });

  it("rejects invalid card state and review rating rows", () => {
    const cardRow: CardRow = {
      id: "card-1",
      deck_id: "deck-1",
      front: "Question",
      back: "Answer",
      hint: "",
      source: "",
      tags: "[]",
      card_type: "basic",
      state: "bad",
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0, learning_steps: 0,
      last_review_date: null,
      next_review_date: "2026-06-01T00:00:00.000Z",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
    };
    const reviewLogRow: ReviewLogRow = {
      id: "review-1",
      card_id: "card-1",
      rating: "bad",
      review_date: "2026-06-01T00:10:00.000Z",
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
    };

    expect(() => cardFromRow(cardRow)).toThrow("Invalid card state");
    expect(() => reviewLogFromRow(reviewLogRow)).toThrow("Invalid review rating");
  });
});

describe("review plan settings rows", () => {
  const minute = 60_000;
  const day = 86_400_000;
  const defaults = { mode: "smart", intervals: DEFAULT_FIXED_INTERVALS };
  const settings = createSeedSnapshot(new Date("2026-10-31T04:00:00.000Z")).settings;

  it.each(["smart", "fixed"] as const)("round-trips a custom %s plan without changing other settings", mode => {
    const reviewPlan = { mode, intervals: { again: minute, hard: 90 * minute, good: 30 * day, easy: 365 * day } };
    const source = { ...settings, reviewPlan, desiredRetention: 0.95, fsrsWeights: [1, 2, 3] };
    const before = structuredClone(source);
    const rows = settingsToRows(source);
    expect(rows).toContainEqual({ key: "review_plan", value: JSON.stringify(reviewPlan) });
    const restored = settingsFromRows(rows);
    expect(restored.reviewPlan).toEqual(reviewPlan);
    expect(restored.desiredRetention).toBe(source.desiredRetention);
    expect(restored.fsrsWeights).toEqual(source.fsrsWeights);
    expect(source).toEqual(before);
    expect(settingsToRows(restored)).toEqual(rows);
  });

  it("keeps legacy missing rows and explicitly absent plans undefined", () => {
    expect(settingsFromRows([]).reviewPlan).toBeUndefined();
    const rows = settingsToRows({ ...settings, reviewPlan: undefined });
    expect(rows).toContainEqual({ key: "review_plan", value: "" });
    expect(settingsFromRows(rows).reviewPlan).toBeUndefined();
  });

  it("clears an existing plan when settings are upserted with an absent plan", () => {
    const existing = settingsToRows({ ...settings, reviewPlan: { mode: "fixed", intervals: DEFAULT_FIXED_INTERVALS } });
    const upserted = new Map(existing.map(row => [row.key, row.value]));
    for (const row of settingsToRows({ ...settings, reviewPlan: undefined })) upserted.set(row.key, row.value);
    expect(settingsFromRows(Array.from(upserted, ([key, value]) => ({ key, value }))).reviewPlan).toBeUndefined();
  });

  it.each(["{broken", "undefined", " ", '{"mode":"fixed"'])("falls back safely for invalid JSON %j", value => {
    const rows = settingsToRows({ ...settings, desiredRetention: 0.95 }).filter(row => row.key !== "review_plan");
    const restored = settingsFromRows([...rows, { key: "review_plan", value }]);
    expect(restored.reviewPlan).toEqual(defaults);
    expect(restored.desiredRetention).toBe(0.95);
  });

  it.each([null, [], true, "fixed", { mode: "unknown" }])("normalizes invalid persisted plan shapes %j", plan => {
    expect(settingsFromRows([{ key: "review_plan", value: JSON.stringify(plan) }]).reviewPlan).toEqual(defaults);
  });

  it.each([
    { again: minute - 1 }, { again: minute + 0.5 }, { hard: minute },
    { easy: 365 * day + 1 }, { hard: "86400000" }, { hard: undefined },
  ])("uses fixed defaults for invalid persisted intervals %j", invalid => {
    const plan = { mode: "fixed", intervals: { ...DEFAULT_FIXED_INTERVALS, ...invalid } };
    expect(settingsFromRows([{ key: "review_plan", value: JSON.stringify(plan) }]).reviewPlan)
      .toEqual({ mode: "fixed", intervals: DEFAULT_FIXED_INTERVALS });
  });

  it("normalizes outgoing invalid plans without mutating the caller", () => {
    const reviewPlan = { mode: "fixed", intervals: { ...DEFAULT_FIXED_INTERVALS, hard: minute } } as MemoryReviewPlan;
    const source = { ...settings, reviewPlan };
    const before = structuredClone(source);
    const rows = settingsToRows(source);
    expect(JSON.parse(rows.find(row => row.key === "review_plan")!.value))
      .toEqual({ mode: "fixed", intervals: DEFAULT_FIXED_INTERVALS });
    expect(source).toEqual(before);
  });
});
