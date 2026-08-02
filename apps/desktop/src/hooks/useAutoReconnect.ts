import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionHistoryItem } from "@/types/history";
import { resolveDefaultMountPath } from "@/lib/paths";
import {
  friendlyError,
  peerOfflineMessage,
  reconnectingMessage,
} from "@/lib/friendly-error";

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2_000;

type StatusSetter = (
  id: string,
  status: "connected" | "disconnected" | "connecting" | "error",
  errorMessage?: string,
) => void;

/**
 * Silently remount when a live tunnel drops (sleep, Wi‑Fi blip, peer restart).
 */
export function useAutoReconnect(opts: {
  connections: ConnectionHistoryItem[];
  setConnectionStatus: StatusSetter;
  onReconnected?: (conn: ConnectionHistoryItem) => void;
  onGiveUp?: (conn: ConnectionHistoryItem, message: string) => void;
  /** User explicitly stopped — don't fight them. */
  suppressedIds?: Set<string>;
}) {
  const attempts = useRef<Map<string, number>>(new Map());
  const inflight = useRef<Set<string>>(new Set());
  const prevStatus = useRef<Map<string, string>>(new Map());
  const connectionsRef = useRef(opts.connections);
  connectionsRef.current = opts.connections;
  const suppressedRef = useRef(opts.suppressedIds);
  suppressedRef.current = opts.suppressedIds;

  const tryReconnect = async (conn: ConnectionHistoryItem, reason: string) => {
    if (suppressedRef.current?.has(conn.id)) return;
    if (inflight.current.has(conn.id)) return;

    const n = attempts.current.get(conn.id) ?? 0;
    if (n >= MAX_ATTEMPTS) {
      const msg = peerOfflineMessage(conn.remoteHost || conn.name);
      opts.setConnectionStatus(conn.id, "error", msg);
      opts.onGiveUp?.(conn, msg);
      return;
    }

    inflight.current.add(conn.id);
    attempts.current.set(conn.id, n + 1);
    opts.setConnectionStatus(
      conn.id,
      "connecting",
      reconnectingMessage(conn.remoteHost || conn.name),
    );

    const delay = BASE_DELAY_MS * Math.min(8, 2 ** Math.max(0, n - 1));
    if (n > 0) {
      await new Promise((r) => window.setTimeout(r, delay));
    }

    try {
      const mountPath =
        conn.mountPoint || (await resolveDefaultMountPath(conn.joinCode));
      // Best-effort clear stale backend handle
      try {
        await invoke("disconnect_by_id", { id: conn.id });
      } catch {
        /* ignore */
      }
      await invoke("connect_with_code_and_id", {
        id: conn.id,
        joinCode: conn.joinCode,
        mountPath,
      });
      attempts.current.set(conn.id, 0);
      opts.setConnectionStatus(conn.id, "connected");
      opts.onReconnected?.(conn);
    } catch (e) {
      const msg =
        n + 1 >= MAX_ATTEMPTS
          ? peerOfflineMessage(conn.remoteHost || conn.name)
          : friendlyError(e, "mount");
      opts.setConnectionStatus(
        conn.id,
        n + 1 >= MAX_ATTEMPTS ? "error" : "disconnected",
        msg,
      );
      if (n + 1 >= MAX_ATTEMPTS) {
        opts.onGiveUp?.(conn, msg);
      } else {
        // Schedule another attempt via status watch
        window.setTimeout(() => {
          const latest = connectionsRef.current.find((c) => c.id === conn.id);
          if (
            latest &&
            latest.status !== "connected" &&
            !suppressedRef.current?.has(conn.id)
          ) {
            void tryReconnect(latest, reason);
          }
        }, delay);
      }
    } finally {
      inflight.current.delete(conn.id);
    }
  };

  // Detect connected → disconnected transitions from sync
  useEffect(() => {
    for (const conn of opts.connections) {
      const prev = prevStatus.current.get(conn.id);
      prevStatus.current.set(conn.id, conn.status);

      if (
        prev === "connected" &&
        conn.status === "disconnected" &&
        !suppressedRef.current?.has(conn.id)
      ) {
        void tryReconnect(conn, "sync-drop");
      }

      if (conn.status === "connected") {
        attempts.current.set(conn.id, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional watch of status edges
  }, [opts.connections]);

  // Backend mount thread ended
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ id: string; join_code?: string }>("mount-dropped", (event) => {
      const id = event.payload?.id;
      if (!id || suppressedRef.current?.has(id)) return;
      const conn = connectionsRef.current.find((c) => c.id === id);
      if (!conn) return;
      opts.setConnectionStatus(
        id,
        "disconnected",
        peerOfflineMessage(conn.remoteHost || conn.name),
      );
      void tryReconnect(conn, "mount-dropped");
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
