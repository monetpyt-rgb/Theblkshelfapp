import { APP_RELEASE } from "./app-release";

export function watchAppUpdates({ canRefresh, refreshContent }: {
  canRefresh: () => boolean;
  refreshContent: () => void;
}) {
  let stopped = false;
  let checking = false;
  let pending = false;
  let refreshPending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  async function check(refresh = false) {
    refreshPending ||= refresh;
    if (stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
    if (checking) { pending = true; return; }
    if (!canRefresh()) {
      if (!timer) timer = setTimeout(() => { timer = undefined; void check(); }, 1500);
      return;
    }
    checking = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await fetch(`/api/app-version?check=${Date.now()}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Update check unavailable");
      const { version } = await response.json();
      if (stopped || document.visibilityState !== "visible") return;
      if (!canRefresh()) { pending = true; return; }
      if (typeof version === "string" && version && APP_RELEASE !== "development" && version !== APP_RELEASE) {
        const destination = new URL(window.location.href);
        // A fresh URL avoids restoring an older HTML document from browser cache.
        // Do not clear localStorage: reader login remains available after updating.
        destination.searchParams.set("_app_release", version);
        stopped = true;
        window.location.replace(destination.href);
        return;
      }
      if (refreshPending) {
        refreshPending = false;
        refreshContent();
      }
    } catch {
      // Keep the current app usable if offline or the update endpoint is unavailable.
      // A later reopen or reconnection will try again.
    } finally {
      clearTimeout(timeout);
      checking = false;
      if (pending && !stopped) {
        pending = false;
        if (!timer) timer = setTimeout(() => { timer = undefined; void check(); }, 1500);
      }
    }
  }

  const resume = () => { void check(true); };
  const onVisible = () => { if (document.visibilityState === "visible") resume(); };
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", resume);
  void check();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", resume);
  };
}
