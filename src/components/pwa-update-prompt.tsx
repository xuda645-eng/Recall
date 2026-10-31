import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { cn } from "@/lib/utils";
import { typeClass } from "@/lib/surface";
import { APP_BUILD } from "@/lib/app-build";
import { refreshMemoryPWA } from "@/services/pwa-refresh";

export interface PWAUpdatePromptProps {
  className?: string;
  hidden?: boolean;
}

interface PWAUpdateState {
  needRefresh: boolean;
  setNeedRefresh: (value: boolean) => void;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  reloadPage: () => void;
}

const PWAUpdateContext = createContext<PWAUpdateState | null>(null);

export function PWAAppVersion({ disabled = false }: { disabled?: boolean }): JSX.Element {
  const state = useContext(PWAUpdateContext);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  if (!state) throw new Error('PWAAppVersion requires PWAUpdateProvider');
  const { updateServiceWorker, reloadPage, needRefresh } = state;
  async function refresh(): Promise<void> {
    if (lock.current || disabled) return;
    lock.current = true;
    setRefreshing(true);
    setError('');
    try { await refreshMemoryPWA(updateServiceWorker, APP_BUILD.version, reloadPage); }
    catch (failure) {
      lock.current = false;
      setRefreshing(false);
      setError(failure instanceof Error && /[\u4e00-\u9fff]/.test(failure.message) ? failure.message : '无法检查更新，请联网后重试。本机数据未改动。');
    }
  }
  return <><div className="m-app-version"><small aria-label="当前版本" title="构建时间使用北京时间，精确到分钟">Recall · <span data-app-version={APP_BUILD.version}>{APP_BUILD.version}</span></small><button className="m-version-refresh" type="button" aria-label={refreshing ? '正在检查更新' : '检查更新并刷新'} title="检查更新并刷新" disabled={disabled || refreshing} onClick={() => void refresh()}>{refreshing ? <Loader2 size={15} className="animate-spin" aria-hidden="true"/> : <RefreshCw size={15} aria-hidden="true"/>}</button></div>{error ? <small className="m-version-message" role="status">{error}</small> : needRefresh && <small className="m-version-message" role="status">有新版本，点击右侧图标刷新。</small>}</>;
}

export function PWAUpdateProvider({ children }: { children: ReactNode }): JSX.Element {
  const mounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reloadRequested = useRef(false);
  const reloadPage = () => {
    if (reloadRequested.current) return;
    reloadRequested.current = true;
    window.location.reload();
  };

  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      mounted.current = false;
      if (pollTimer.current !== null) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };
    return () => cancel();
  }, []);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedReload: reloadPage,
    onRegisteredSW(_swUrl, r) {
      if (r && mounted.current) {
        if (pollTimer.current !== null) clearInterval(pollTimer.current);
        pollTimer.current = setInterval(() => {
          void r.update().catch(error => console.error("SW update check error", error));
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  return <PWAUpdateContext.Provider value={{ needRefresh, setNeedRefresh, updateServiceWorker, reloadPage }}>{children}</PWAUpdateContext.Provider>;
}

export function PWAUpdatePrompt({ className, hidden = false }: PWAUpdatePromptProps = {}): JSX.Element {
  const { t } = useTranslation();
  const state = useContext(PWAUpdateContext);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const updateLock = useRef(false);
  if (!state) throw new Error("PWAUpdatePrompt requires PWAUpdateProvider");
  const { needRefresh, setNeedRefresh, updateServiceWorker } = state;

  async function handleUpdate(): Promise<void> {
    if (updateLock.current) return;
    updateLock.current = true;
    setUpdating(true);
    setUpdateError(false);
    try {
      await updateServiceWorker(true);
    } catch {
      updateLock.current = false;
      setUpdateError(true);
      setUpdating(false);
    }
  }

  function handleDismiss(): void {
    if (updateLock.current) return;
    setNeedRefresh(false);
  }

  if (hidden || !needRefresh) return <></>;

  return (
    <div
      className={cn("pwa-update-prompt fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-lg", className)}
      role="alert"
      aria-live="polite"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Download className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <p className={cn(typeClass["label-lg"], "text-text-primary")}>
          {t("pwa.updateAvailable", "Update available")}
        </p>
        <p className={cn(typeClass.caption, "mt-0.5 text-on-surface-variant")}>
          {t("pwa.newVersionDescription", "A new version of Recall is ready. Update now to get the latest features and fixes.")}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={updating}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {t("pwa.dismiss", "Dismiss")}
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {updating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {t("pwa.updating", "Updating…")}
              </>
            ) : (
              t("pwa.update", "Update")
            )}
          </button>
        </div>
        {updateError && (
          <p className={cn(typeClass.caption, "mt-2 text-destructive")}>
            {t("pwa.updateFailed", "Update failed. Please try again or reload the page.")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        disabled={updating}
        className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full p-1 text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
        aria-label={t("common.close")}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
