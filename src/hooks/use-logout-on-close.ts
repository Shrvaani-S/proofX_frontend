import { useEffect } from "react";
import { logoutBeacon } from "@/lib/api";

/**
 * Releases the backend single-session lock when the active, authenticated tab is
 * closed — but NOT on a page refresh.
 *
 * The token lives in sessionStorage, so a refresh already keeps the user signed
 * in locally; the only thing we must avoid on a refresh is releasing the server
 * lock early. The browser fires the same unload event for "close" and "reload",
 * with no reliable synchronous way to tell them apart — so we watch for the
 * keyboard reload shortcuts (F5 / Ctrl+R / Cmd+R) and suppress the logout when a
 * reload was just requested. Whatever slips past (e.g. a reload-button click)
 * errs on the safe side: `logoutBeacon` leaves the local token intact, so the
 * user stays signed in; at worst the lock is released a beat early, and the
 * existing single-tab guard still blocks any second tab.
 *
 * Pass `enabled` as "this tab is the authenticated holder" so a blocked second
 * tab closing never tears down the holder's session.
 */
export function useLogoutOnClose(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let reloading = false;
    let resetTimer: number | undefined;

    const markReload = () => {
      reloading = true;
      // If the reload doesn't actually follow, let a later close still log out.
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => { reloading = false; }, 1000);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) {
        markReload();
      }
    };

    const onPageHide = () => {
      if (!reloading) logoutBeacon();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled]);
}
