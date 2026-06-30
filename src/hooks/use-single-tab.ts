import { useEffect, useRef, useState } from "react";

/**
 * Enforces a single active app tab per browser via BroadcastChannel.
 *
 * The first tab becomes the "holder". Any other tab — a fresh tab, or even a
 * duplicated tab that copied sessionStorage — probes on mount, hears the
 * holder's CLAIM, and is marked "blocked" so the app can show a "logged in
 * elsewhere" screen instead of rendering a second usable session.
 *
 *  - "checking": brief (<=250ms) window while probing for an existing holder.
 *  - "active":   this tab may render normally.
 *  - "blocked":  another tab owns the session.
 *
 * When the holder tab closes it broadcasts RELEASE so a blocked tab can re-contest
 * and take over. Falls back to "active" where BroadcastChannel is unavailable.
 */
export type TabStatus = "checking" | "active" | "blocked";

const CHANNEL_NAME = "proofx-single-tab";
const PROBE_TIMEOUT_MS = 250;

export function useSingleTab(authed: boolean): TabStatus {
  const [status, setStatus] = useState<TabStatus>("checking");
  const statusRef = useRef<TabStatus>("checking");
  const authedRef = useRef(authed);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const idRef = useRef<string>(Math.random().toString(36).slice(2));
  authedRef.current = authed;

  const apply = (s: TabStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      apply("active");
      return;
    }

    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;
    const me = idRef.current;
    let probeTimer: number | undefined;

    // A tab "holds" the session only once it's both authenticated and active.
    const isHolder = () => authedRef.current && statusRef.current === "active";

    const probe = () => {
      apply("checking");
      ch.postMessage({ type: "PROBE", from: me });
      window.clearTimeout(probeTimer);
      probeTimer = window.setTimeout(() => {
        if (statusRef.current === "checking") apply("active");
      }, PROBE_TIMEOUT_MS);
    };

    ch.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.from === me) return; // ignore our own broadcasts
      if (msg.type === "PROBE") {
        if (isHolder()) ch.postMessage({ type: "CLAIM", from: me });
      } else if (msg.type === "CLAIM") {
        window.clearTimeout(probeTimer);
        apply("blocked");
      } else if (msg.type === "RELEASE") {
        if (statusRef.current === "blocked") probe();
      }
    };

    probe();

    const onUnload = () => {
      if (isHolder()) ch.postMessage({ type: "RELEASE", from: me });
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.clearTimeout(probeTimer);
      window.removeEventListener("beforeunload", onUnload);
      if (isHolder()) ch.postMessage({ type: "RELEASE", from: me });
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // When this tab logs in, announce ownership so an already-open tab (e.g. one
  // sitting on the login screen) immediately flips to "blocked".
  useEffect(() => {
    if (authed && statusRef.current === "active") {
      channelRef.current?.postMessage({ type: "CLAIM", from: idRef.current });
    }
  }, [authed]);

  return status;
}
