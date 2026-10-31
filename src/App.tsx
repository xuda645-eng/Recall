import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { PWAUpdatePrompt, PWAUpdateProvider } from "@/components/pwa-update-prompt";
import { useState, useEffect, lazy, Suspense } from "react";
import { isTauriRuntime } from "@/db/client";
const MemoryWorkspace = lazy(() => import("@/components/memory-workspace").then(m => ({ default: m.MemoryWorkspace })));
const AppShell = lazy(() => import("@/components/app-shell").then(module => ({ default: module.AppShell })));
const Dashboard = lazy(() => import("@/components/dashboard").then(module => ({ default: module.Dashboard })));
const QuickAddDialog = lazy(() => import("@/components/quick-add").then(module => ({ default: module.QuickAddDialog })));
import { useRecallStore } from "@/stores/recall-store";
import { toast } from "sonner";
import { startCloudSync } from '@/services/cloud-sync';

const DeckBrowser = lazy(() => import("@/components/deck-browser").then(m => ({ default: m.DeckBrowser })));
const DeckDetail = lazy(() => import("@/components/deck-detail").then(m => ({ default: m.DeckDetail })));
const CardBrowser = lazy(() => import("@/components/card-browser").then(m => ({ default: m.CardBrowser })));
const MatchGame = lazy(() => import("@/components/match-game").then(m => ({ default: m.MatchGame })));
const Onboarding = lazy(() => import("@/components/onboarding").then(m => ({ default: m.Onboarding })));
const Settings = lazy(() => import("@/components/settings").then(m => ({ default: m.Settings })));
const ShortcutHelp = lazy(() => import("@/components/shortcut-help").then(m => ({ default: m.ShortcutHelp })));
const Stats = lazy(() => import("@/components/stats").then(m => ({ default: m.Stats })));
const StudyMode = lazy(() => import("@/components/study-mode").then(m => ({ default: m.StudyMode })));
const TagManager = lazy(() => import("@/components/tag-manager").then(m => ({ default: m.TagManager })));
const ImportHub = lazy(() => import("@/components/import-hub").then(m => ({ default: m.ImportHub })));
const FocusTimer = lazy(() => import("@/components/focus-timer").then(m => ({ default: m.FocusTimer })));

export function App(): JSX.Element {
  return <PWAUpdateProvider><Application /></PWAUpdateProvider>;
}

function Application(): JSX.Element {
  const { t } = useTranslation();
  const view = useRecallStore((state) => state.view);
  const isLoading = useRecallStore((state) => state.isLoading);
  const error = useRecallStore((state) => state.error);
  const initialize = useRecallStore((state) => state.initialize);
  const showDashboard = useRecallStore((state) => state.showDashboard);
  const showImportHub = useRecallStore((state) => state.showImportHub);
  const startReview = useRecallStore((state) => state.startReview);
  const recoverToDashboard = () => showDashboard();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (isTauriRuntime() || isLoading || error) return;
    return startCloudSync();
  }, [isLoading, error]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    function handleKeyDown(event: KeyboardEvent): void {
      // Ignore if typing in an input/textarea
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Press 'R' to start review from dashboard or deck view
            if (event.key.toLowerCase() === "r" && view !== "study" && view !== "match") {
              event.preventDefault();
              if (!startReview(null)) {
                toast.info(t("app.noCardsDue"));
              }
            }

            // Ctrl+N to quick-add card
            if (event.ctrlKey && event.key.toLowerCase() === "n") {
              event.preventDefault();
              setShowQuickAdd(true);
            }

            // Press 'I' to open Import Hub
            if (event.key.toLowerCase() === "i" && view !== "study" && view !== "match") {
              event.preventDefault();
              showImportHub();
            }

            // ? to show keyboard shortcuts
            if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              setShowShortcuts((prev) => !prev);
            }
    }

    window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
      }, [t, view, startReview]);

      // Listen for global shortcut (Ctrl+Shift+N) from Tauri - works even when app is in background
      useEffect(() => {
        if (!isTauriRuntime()) return;
        let unlisten: (() => void) | undefined;
        void (async () => {
          try {
            const { listen } = await import("@tauri-apps/api/event");
            unlisten = await listen("quick-add-shortcut", () => {
              setShowQuickAdd(true);
            });
          } catch {
            // Browser / Tauri unavailable - fallback to keyboard shortcut only
          }
        })();
        return () => { unlisten?.(); };
      }, []);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="text-lg font-semibold">Recall</div>
          <div className="mt-2 text-sm text-muted-foreground">{t("app.loading")}</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center">
          <div className="font-semibold">{t("app.couldNotLoad")}</div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!isTauriRuntime()) {
    return <ErrorBoundary><Suspense fallback={<main className="p-6">正在加载</main>}><MemoryWorkspace /></Suspense><Toaster richColors closeButton position="top-right" mobileOffset={{top:"calc(max(24px, env(safe-area-inset-top)) + 72px)",left:"16px",right:"16px"}}/></ErrorBoundary>;
  }

  return (
      <ErrorBoundary>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground">{t("app.loadingView")}</div>}>
          {view === "study" || view === "match" ? (
            <main className="focus-page min-h-screen bg-background px-4 text-foreground sm:px-6 lg:px-8">
              {view === "study" ? (
                <ErrorBoundary viewName="StudyMode" onRecover={recoverToDashboard}>
                  <StudyMode />
                </ErrorBoundary>
              ) : null}
              {view === "match" ? (
                <ErrorBoundary viewName="MatchGame" onRecover={recoverToDashboard}>
                  <MatchGame />
                </ErrorBoundary>
              ) : null}
            </main>
          ) : (
            <AppShell>
              {view === "dashboard" ? (
                <ErrorBoundary viewName="Dashboard" onRecover={recoverToDashboard}>
                  <Dashboard />
                </ErrorBoundary>
              ) : null}
              {view === "deck" ? (
                <ErrorBoundary viewName="DeckDetail" onRecover={recoverToDashboard}>
                  <DeckDetail />
                </ErrorBoundary>
              ) : null}
              {view === "settings" ? (
                <ErrorBoundary viewName="Settings" onRecover={recoverToDashboard}>
                  <Settings />
                </ErrorBoundary>
              ) : null}
              {view === "stats" ? (
                <ErrorBoundary viewName="Stats" onRecover={recoverToDashboard}>
                  <Stats />
                </ErrorBoundary>
              ) : null}
              {view === "browser" ? (
                <ErrorBoundary viewName="CardBrowser" onRecover={recoverToDashboard}>
                  <CardBrowser />
                </ErrorBoundary>
              ) : null}
              {view === "tags" ? (
                <ErrorBoundary viewName="TagManager" onRecover={recoverToDashboard}>
                  <TagManager />
                </ErrorBoundary>
              ) : null}
              {view === "deck-browser" ? (
                <ErrorBoundary viewName="DeckBrowser" onRecover={recoverToDashboard}>
                  <DeckBrowser />
                </ErrorBoundary>
              ) : null}
              {view === "onboarding" ? (
                <ErrorBoundary viewName="Onboarding" onRecover={recoverToDashboard}>
                  <Onboarding />
                </ErrorBoundary>
              ) : null}
              {view === "import-hub" ? (
                <ErrorBoundary viewName="ImportHub" onRecover={recoverToDashboard}>
                  <ImportHub />
                </ErrorBoundary>
              ) : null}
              {view === "focus-timer" ? (
                <ErrorBoundary viewName="FocusTimer" onRecover={recoverToDashboard}>
                  <div className="flex items-center justify-center min-h-full p-8">
                    <div className="w-full max-w-md">
                      <FocusTimer />
                    </div>
                  </div>
                </ErrorBoundary>
              ) : null}
            </AppShell>
          )}
        </Suspense>
        <Toaster richColors closeButton position="top-right" offset={{ top: "calc(max(24px, env(safe-area-inset-top, 0px)) + 72px)", right: "16px" }} mobileOffset={{ top: "calc(max(24px, var(--recall-safe-top)) + 72px)", right: "16px", left: "16px" }} />
        <Suspense fallback={null}>
          <QuickAddDialog open={showQuickAdd} onClose={() => setShowQuickAdd(false)} />
          <ShortcutHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        </Suspense>
        <PWAUpdatePrompt />
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {view === "dashboard" && t("app.dashboardView")}
          {view === "deck" && t("app.deckDetailView")}
          {view === "study" && t("app.studyModeView")}
          {view === "match" && t("app.matchGameView")}
          {view === "browser" && t("app.browserView")}
          {view === "tags" && t("app.tagsView")}
          {view === "stats" && t("app.statsView")}
          {view === "settings" && t("app.settingsView")}
          {view === "deck-browser" && t("app.deckBrowserView")}
          {view === "onboarding" && t("app.onboardingView")}
          {view === "import-hub" && t("app.importHubView")}
          {view === "focus-timer" && t("app.focusTimerView")}
        </div>
      </ErrorBoundary>
    );
}
