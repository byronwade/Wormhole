import { useEffect, useRef, useState } from "react";
import { detectJoinCodeFromClipboard } from "@/lib/join-code";

const POLL_MS = 2500;
const COOLDOWN_MS = 90_000;

/**
 * When the app is focused/visible, watch the clipboard for a join code.
 * Returns an offer the UI can toast once (Mount CTA).
 */
export function useClipboardJoinOffer(opts: {
  enabled: boolean;
  /** Codes we already know about (active mounts / dismissed). */
  ignoreCodes: Set<string> | string[];
}) {
  const [offer, setOffer] = useState<string | null>(null);
  const lastOffered = useRef<string | null>(null);
  const lastOfferAt = useRef(0);
  const ignoreRef = useRef(opts.ignoreCodes);
  ignoreRef.current = opts.ignoreCodes;

  useEffect(() => {
    if (!opts.enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      // Don't steal focus from an open dialog's own paste UX mid-type
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const code = await detectJoinCodeFromClipboard();
      if (!code || cancelled) return;

      const ignore = ignoreRef.current;
      const ignored =
        ignore instanceof Set ? ignore.has(code) : ignore.includes(code);
      if (ignored) return;

      const now = Date.now();
      if (
        lastOffered.current === code &&
        now - lastOfferAt.current < COOLDOWN_MS
      ) {
        return;
      }

      lastOffered.current = code;
      lastOfferAt.current = now;
      setOffer(code);
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    const onFocus = () => {
      void tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [opts.enabled]);

  const dismiss = () => setOffer(null);

  return { offer, dismiss };
}
