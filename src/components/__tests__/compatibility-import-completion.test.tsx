import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnkiImportDialog } from "@/components/anki-import-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { ImportHub, type ImportCompletionReceipt } from "@/components/import-hub";
import { MarkdownImportDialog } from "@/components/markdown-import-dialog";
import { RecallImportDialog } from "@/components/recall-import-dialog";
import type { AnkiCard } from "@/services/anki-import";

const mocks = vi.hoisted(() => ({
  createCard: vi.fn(),
  createDeck: vi.fn(),
  showDashboard: vi.fn(),
  parseAnkiApkg: vi.fn(),
  openRecallPackage: vi.fn(),
  restorePackageImages: vi.fn(),
  openFile: vi.fn(),
  readTextFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/stores/recall-store", () => ({
  useRecallStore: (selector: (state: unknown) => unknown) => selector({
    decks: [{ id: "existing-deck", name: "Existing Deck" }],
    createCard: mocks.createCard,
    createDeck: mocks.createDeck,
    showDashboard: mocks.showDashboard,
  }),
}));
vi.mock("@/services/anki-import", () => ({ parseAnkiApkg: mocks.parseAnkiApkg }));
vi.mock("@/services/import-export", () => ({
  openRecallPackage: mocks.openRecallPackage,
  restorePackageImages: mocks.restorePackageImages,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.openFile }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: mocks.readTextFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select value={value} onChange={event => onValueChange(event.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const markdown = "Q: First\nA: One\n\nQ: Second\nA: Two";
const csvFile = () => new File(["front,back\nFirst,One\nSecond,Two\ninvalid"], "cards.csv", { type: "text/csv" });

function ankiCard(deckName: string, front: string): AnkiCard {
  return { deck_name: deckName, front, back: "Answer", tags: ["tag"], state: "review", stability: 10, difficulty: 5, reps: 3, lapses: 1, days_until_next: 7, has_fsrs_state: true };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createCard.mockResolvedValue("persisted-card");
  mocks.createDeck.mockResolvedValueOnce("new-deck-1").mockResolvedValue("new-deck-2");
  mocks.openFile.mockResolvedValue("/tmp/cards.apkg");
  mocks.readTextFile.mockResolvedValue(markdown);
  mocks.restorePackageImages.mockResolvedValue({ processed: 1, failed: [], warnings: ["Image warning"] });
  mocks.openRecallPackage.mockResolvedValue({
    pkg: {
      metadata: { deckName: "Existing Deck", cardCount: 99 },
      payload: { cards: [{ front: "First", back: "One", tags: [] }, { front: "Second", back: "Two", tags: [] }] },
      images: {},
    },
  });
  mocks.parseAnkiApkg.mockResolvedValue({
    cards: [ankiCard("First Deck", "First"), ankiCard("Second Deck", "Second")],
    cards_detected: 3,
    cards_imported: 2,
    warnings: ["Unsupported model warning"],
    media_imported: 1,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function startCsv(onComplete?: (receipt: ImportCompletionReceipt) => void) {
  const onClose = vi.fn();
  render(<CsvImportDialog open deckId="existing-deck" file={csvFile()} onClose={onClose} onComplete={onComplete} />);
  fireEvent.click(await screen.findByRole("button", { name: "Import 2 cards" }));
  return onClose;
}

async function startRecall(onComplete?: (receipt: ImportCompletionReceipt) => void, target = "existing-deck") {
  render(<RecallImportDialog onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Import .recall" }));
  const select = await screen.findByRole("combobox");
  fireEvent.change(select, { target: { value: target } });
  fireEvent.click(screen.getByRole("button", { name: /Import 99 cards/ }));
}

async function startAnki(onComplete?: (receipt: ImportCompletionReceipt) => void) {
  render(<AnkiImportDialog onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Import from Anki" }));
  fireEvent.click(screen.getByRole("button", { name: "Browse" }));
  await waitFor(() => expect((screen.getByLabelText("Anki File (.apkg)") as HTMLInputElement).value).toBe("cards.apkg"));
  fireEvent.click(screen.getByRole("button", { name: "Import Cards" }));
}

describe("CSV completion receipts", () => {
  it("waits for every write, reports actual valid/skipped rows and closes before notifying", async () => {
    const lastWrite = deferred();
    mocks.createCard.mockResolvedValueOnce("first").mockReturnValueOnce(lastWrite.promise);
    const onComplete = vi.fn();
    const onClose = await startCsv(onComplete);
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => lastWrite.resolve("second"));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "CSV", added: 2, updated: 0, skipped: 1, deckIds: ["existing-deck"] });
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onComplete.mock.invocationCallOrder[0]);
  });

  it("retains the preview and retry after partial persistence without a success receipt", async () => {
    mocks.createCard.mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("Disk full"));
    const onComplete = vi.fn();
    const onClose = await startCsv(onComplete);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("First")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import 2 cards" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps default success and close behavior without a callback", async () => {
    const onClose = await startCsv();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.toast.success).toHaveBeenLastCalledWith("Imported 2 cards to Existing Deck");
  });
});

describe("Markdown completion receipts", () => {
  it("waits for persistence and closes the controlled dialog before reporting", async () => {
    const lastWrite = deferred();
    mocks.createCard.mockResolvedValueOnce("first").mockReturnValueOnce(lastWrite.promise);
    const onOpenChange = vi.fn();
    const onComplete = vi.fn();
    render(<MarkdownImportDialog open deckId="existing-deck" initialText={markdown} onOpenChange={onOpenChange} onComplete={onComplete} />);
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 cards" }));
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => lastWrite.resolve("second"));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "Markdown", added: 2, updated: 0, skipped: 0, deckIds: ["existing-deck"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(onComplete.mock.invocationCallOrder[0]);
  });

  it.each([true, false])("preserves the partial warning and existing close behavior (callback: %s)", async enabled => {
    mocks.createCard.mockRejectedValueOnce(new Error("Disk full")).mockResolvedValueOnce("second");
    const onOpenChange = vi.fn();
    const onComplete = vi.fn();
    render(<MarkdownImportDialog open deckId="existing-deck" initialText={markdown} onOpenChange={onOpenChange} onComplete={enabled ? onComplete : undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 cards" }));
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith("Imported 1 of 2 cards. 1 card(s) failed"));
    expect(mocks.createCard).toHaveBeenCalledTimes(2);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Recall package completion receipts", () => {
  it.each(["existing-deck", "__new__"])("uses completed writes, not package metadata, for target %s", async target => {
    const lastWrite = deferred();
    mocks.createCard.mockResolvedValueOnce("first").mockReturnValueOnce(lastWrite.promise);
    const onComplete = vi.fn();
    await startRecall(onComplete, target);
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => lastWrite.resolve("second"));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "Recall", added: 2, updated: 0, skipped: 0, deckIds: [target === "__new__" ? "new-deck-1" : target] });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createCard.mock.calls[0][0]).toEqual({ deckId: target === "__new__" ? "new-deck-1" : target, front: "First", back: "One", hint: "", source: "", tags: [] });
  });

  it("does not report success for individual write failures", async () => {
    mocks.createCard.mockRejectedValueOnce(new Error("Disk full"));
    const onComplete = vi.fn();
    await startRecall(onComplete);
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not report success when new-deck persistence fails", async () => {
    mocks.createDeck.mockReset().mockRejectedValue(new Error("Disk full"));
    const onComplete = vi.fn();
    await startRecall(onComplete, "__new__");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.createCard).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("preserves background image warnings and default success behavior", async () => {
    const result = await mocks.openRecallPackage();
    result.pkg.images = { "image.png": "encoded" };
    mocks.openRecallPackage.mockResolvedValue(result);
    await startRecall();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.restorePackageImages).toHaveBeenCalledWith({ "image.png": "encoded" });
    expect(mocks.toast.warning).toHaveBeenCalledWith("Image warning");
    expect(mocks.toast.success).toHaveBeenCalledWith("Imported 2 of 2 cards");
  });
});

describe("Anki completion receipts", () => {
  it("retains warnings and scheduling report before Done forwards the successful receipt", async () => {
    const lastWrite = deferred();
    mocks.createCard.mockResolvedValueOnce("first").mockReturnValueOnce(lastWrite.promise);
    const onComplete = vi.fn();
    await startAnki(onComplete);
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => lastWrite.resolve("second"));
    expect(await screen.findByText("Unsupported model warning")).toBeTruthy();
    expect(mocks.createCard.mock.calls[0][0].scheduling).toEqual({ state: "review", stability: 10, difficulty: 5, reps: 3, lapses: 1, daysUntilNext: 7 });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "Anki", added: 2, updated: 0, skipped: 1, deckIds: ["new-deck-1", "new-deck-2"] });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import from Anki" }));
    expect(screen.queryByText("Unsupported model warning")).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("retains the failed-card report and does not turn failures into skipped successes", async () => {
    mocks.createCard.mockRejectedValueOnce(new Error("Disk full"));
    const onComplete = vi.fn();
    await startAnki(onComplete);
    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.getByText("Unsupported model warning")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps the report and Done behavior unchanged without a callback", async () => {
    await startAnki();
    expect(await screen.findByText("Unsupported model warning")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not report success if deck creation fails", async () => {
    mocks.createDeck.mockReset().mockRejectedValue(new Error("Disk full"));
    const onComplete = vi.fn();
    await startAnki(onComplete);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.createCard).not.toHaveBeenCalled();
  });
});

describe("ImportHub callback wiring", () => {
  async function startManual(onComplete?: (receipt: ImportCompletionReceipt) => void) {
    render(<ImportHub onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /^Manual Entry/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "existing-deck" } });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: markdown } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 cards" }));
  }

  it("waits for manual writes and forwards its receipt after closing", async () => {
    const lastWrite = deferred();
    mocks.createCard.mockResolvedValueOnce("first").mockReturnValueOnce(lastWrite.promise);
    const onComplete = vi.fn();
    await startManual(onComplete);
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => lastWrite.resolve("second"));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "Manual Entry", added: 2, updated: 0, skipped: 0, deckIds: ["existing-deck"] });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.showDashboard).not.toHaveBeenCalled();
  });

  it("preserves manual text and retry after partial failure without a receipt", async () => {
    mocks.createCard.mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("Disk full"));
    const onComplete = vi.fn();
    await startManual(onComplete);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(markdown);
    fireEvent.click(screen.getByRole("button", { name: "Import 2 cards" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("preserves manual success and default dashboard navigation without a callback", async () => {
    await startManual();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.toast.success).toHaveBeenCalledWith("Successfully imported 2 cards");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.showDashboard).toHaveBeenCalledTimes(1);
  });

  it.each(["CSV", "Markdown"])("forwards dropped %s receipts and clears the successful controlled dialog", async source => {
    const onComplete = vi.fn();
    const view = render(<ImportHub onComplete={onComplete} />);
    const file = source === "CSV" ? csvFile() : new File([markdown], "cards.md");
    fireEvent.drop(view.container.querySelector(".border-dashed")!, { dataTransfer: { files: [file] } });
    const button = await screen.findByRole("button", { name: "Import 2 cards" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "existing-deck" } });
    fireEvent.click(button);
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source, added: 2, updated: 0, skipped: source === "CSV" ? 1 : 0, deckIds: ["existing-deck"] }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("forwards Recall receipts through the existing dialog", async () => {
    const onComplete = vi.fn();
    render(<ImportHub onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: "Import .recall" }));
    fireEvent.click(await screen.findByRole("button", { name: /Import 99 cards/ }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "Recall", added: 2, updated: 0, skipped: 0, deckIds: ["existing-deck"] }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("forwards Anki only after the warnings report is acknowledged", async () => {
    const onComplete = vi.fn();
    render(<ImportHub onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: "Import from Anki" }));
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect((screen.getByLabelText("Anki File (.apkg)") as HTMLInputElement).value).toBe("cards.apkg"));
    fireEvent.click(screen.getByRole("button", { name: "Import Cards" }));
    expect(await screen.findByText("Unsupported model warning")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ source: "Anki", added: 2, updated: 0, skipped: 1, deckIds: ["new-deck-1", "new-deck-2"] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
