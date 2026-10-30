import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PWAUpdatePrompt } from "../pwa-update-prompt";

const worker = vi.hoisted(() => ({
  needRefresh: true,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
  hookOptions: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (options: unknown) => {
    worker.hookOptions(options);
    const [needRefresh, setNeedRefresh] = useState(worker.needRefresh);
    return {
      needRefresh: [needRefresh, (value: boolean) => { worker.setNeedRefresh(value); setNeedRefresh(value); }],
      updateServiceWorker: worker.updateServiceWorker,
    };
  },
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("PWA update prompt", () => {
  const savedSnapshot = JSON.stringify({
    decks: [{ id: "original-deck", name: "Original audit fixture" }],
    cards: [{ id: "original-card", back: "  Untouched original.\r\n ", reps: 8, archivedAt: "2026-10-31T00:00:00Z" }],
    reviewLogs: [{ id: "original-review" }],
  });

  beforeEach(() => {
    worker.needRefresh = true;
    worker.setNeedRefresh.mockReset();
    worker.updateServiceWorker.mockReset();
    worker.updateServiceWorker.mockResolvedValue(undefined);
    worker.hookOptions.mockReset();
    localStorage.setItem("recall.snapshot.v1", savedSnapshot);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem("recall.snapshot.v1");
  });

  it("does not show a prompt when no update is waiting", () => {
    worker.needRefresh = false;
    render(<PWAUpdatePrompt />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(worker.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("keeps the stable wrapper and existing desktop defaults", () => {
    render(<PWAUpdatePrompt />);
    const prompt = screen.getByRole("alert");
    for (const className of ["pwa-update-prompt", "fixed", "bottom-4", "right-4", "z-50", "max-w-sm", "shadow-lg"]) {
      expect(prompt.classList.contains(className)).toBe(true);
    }
    expect(screen.getByText("Update available")).toBeTruthy();
    expect(worker.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("keeps the registration hook mounted while hidden, without dismissing the update", () => {
    const view = render(<PWAUpdatePrompt hidden />);
    expect(worker.hookOptions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    view.rerender(<PWAUpdatePrompt hidden={false} className="m-pwa-update" />);
    expect(screen.getByRole("alert").classList.contains("m-pwa-update")).toBe(true);
    view.rerender(<PWAUpdatePrompt hidden />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(worker.setNeedRefresh).not.toHaveBeenCalled();
    expect(worker.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("retains an update error and saved data across hidden reader navigation", async () => {
    worker.updateServiceWorker.mockRejectedValueOnce(new Error("Synthetic update failure"));
    const view = render(<PWAUpdatePrompt />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Update" })); });
    view.rerender(<PWAUpdatePrompt hidden />);
    expect(screen.queryByRole("alert")).toBeNull();
    view.rerender(<PWAUpdatePrompt hidden={false} />);
    expect(screen.getByText("Update failed. Please try again or reload the page.")).toBeTruthy();
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
    expect(worker.setNeedRefresh).not.toHaveBeenCalled();
  });

  it("merges a foreground class without dropping the stable wrapper", () => {
    const view = render(<PWAUpdatePrompt className="m-pwa-foreground" />);
    expect(screen.getByRole("alert").classList.contains("m-pwa-foreground")).toBe(true);
    expect(screen.getByRole("alert").classList.contains("fixed")).toBe(true);
    view.rerender(<PWAUpdatePrompt className="relative bottom-auto right-auto m-pwa-foreground" />);
    const prompt = screen.getByRole("alert");
    expect(prompt.classList.contains("pwa-update-prompt")).toBe(true);
    expect(prompt.classList.contains("relative")).toBe(true);
    expect(prompt.classList.contains("fixed")).toBe(false);
    expect(prompt.classList.contains("bottom-4")).toBe(false);
    expect(prompt.classList.contains("right-4")).toBe(false);
  });

  it("gives all three non-submit buttons a minimum 44px width and height", () => {
    render(<PWAUpdatePrompt />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.classList.contains("min-h-[44px]")).toBe(true);
      expect(button.classList.contains("min-w-[44px]")).toBe(true);
      expect(button.getAttribute("type")).toBe("button");
    }
    expect(screen.getByRole("button", { name: "Close" }).classList.contains("shrink-0")).toBe(true);
  });

  it.each(["Dismiss", "Close"])("dismisses with %s without updating or changing saved data", name => {
    render(<PWAUpdatePrompt />);
    fireEvent.click(screen.getByRole("button", { name }));
    expect(worker.setNeedRefresh).toHaveBeenCalledExactlyOnceWith(false);
    expect(worker.updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
  });

  it("starts one update and blocks both dismissal paths even for same-frame repeated clicks", async () => {
    const update = deferred();
    worker.updateServiceWorker.mockReturnValueOnce(update.promise);
    render(<PWAUpdatePrompt />);
    const updateButton = screen.getByRole("button", { name: "Update" });
    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    const closeButton = screen.getByRole("button", { name: "Close" });
    act(() => {
      fireEvent.click(updateButton);
      fireEvent.click(updateButton);
      fireEvent.click(dismissButton);
      fireEvent.click(closeButton);
    });
    expect(worker.updateServiceWorker).toHaveBeenCalledExactlyOnceWith(true);
    expect(worker.setNeedRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Updating…" })).toBeTruthy();
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { update.resolve(); await update.promise; });
    expect(worker.updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
  });

  it("keeps all stored data and the prompt after failure, then allows retry", async () => {
    worker.updateServiceWorker.mockRejectedValueOnce(new Error("Synthetic update failure"));
    const retry = deferred();
    worker.updateServiceWorker.mockReturnValueOnce(retry.promise);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    render(<PWAUpdatePrompt />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Update" })); });
    expect(screen.getByText("Update failed. Please try again or reload the page.")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Update" })); });
    expect(screen.queryByText("Update failed. Please try again or reload the page.")).toBeNull();
    expect(worker.updateServiceWorker).toHaveBeenCalledTimes(2);
    await act(async () => { retry.reject(new Error("Synthetic retry failure")); });
    expect(screen.getByText("Update failed. Please try again or reload the page.")).toBeTruthy();
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("can still dismiss an update failure without discarding cards or progress", async () => {
    worker.updateServiceWorker.mockRejectedValueOnce(new Error("Synthetic update failure"));
    render(<PWAUpdatePrompt />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Update" })); });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(worker.setNeedRefresh).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
  });

  it("replaces polling timers and stops them when the foreground prompt unmounts", () => {
    vi.useFakeTimers();
    const view = render(<PWAUpdatePrompt />);
    const options = worker.hookOptions.mock.calls[0][0] as {
      onRegisteredSW: (url: string, registration?: { update: () => Promise<void> }) => void;
    };
    const previous = { update: vi.fn().mockResolvedValue(undefined) };
    const current = { update: vi.fn().mockResolvedValue(undefined) };
    options.onRegisteredSW("synthetic-sw.js");
    expect(vi.getTimerCount()).toBe(0);
    options.onRegisteredSW("synthetic-sw.js", previous);
    options.onRegisteredSW("synthetic-sw.js", current);
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(<PWAUpdatePrompt hidden />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(<PWAUpdatePrompt hidden={false} />);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(previous.update).not.toHaveBeenCalled();
    expect(current.update).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    options.onRegisteredSW("synthetic-sw.js", current);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(current.update).toHaveBeenCalledTimes(1);
  });

  it("handles a rejected offline polling check without changing stored data", async () => {
    vi.useFakeTimers();
    const error = new Error("Synthetic offline polling failure");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registration = { update: vi.fn().mockRejectedValue(error) };
    render(<PWAUpdatePrompt />);
    const options = worker.hookOptions.mock.calls[0][0] as {
      onRegisteredSW: (url: string, registration: { update: () => Promise<void> }) => void;
    };
    options.onRegisteredSW("synthetic-sw.js", registration);
    await act(async () => { vi.advanceTimersByTime(60 * 60 * 1000); });
    expect(log).toHaveBeenCalledExactlyOnceWith("SW update check error", error);
    expect(worker.updateServiceWorker).not.toHaveBeenCalled();
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("logs registration failures unchanged rather than silently filtering WebKit errors", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("Importing a module script failed");
    render(<PWAUpdatePrompt />);
    const options = worker.hookOptions.mock.calls[0][0] as { onRegisterError: (error: Error) => void };
    options.onRegisterError(error);
    expect(log).toHaveBeenCalledExactlyOnceWith("SW registration error", error);
    expect(localStorage.getItem("recall.snapshot.v1")).toBe(savedSnapshot);
  });
});
