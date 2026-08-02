import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { formatSpeedBps } from "@/types/portal";

interface TransferProgressPayload {
  transfer_id?: string;
  speed_bps?: number;
  file_name?: string;
}

/**
 * Live speed labels keyed by transfer/session id (export + mount FUSE reads).
 */
export function useSessionThroughput() {
  const [speedById, setSpeedById] = useState<Record<string, string>>({});
  const [globalSpeed, setGlobalSpeed] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;

    void listen<TransferProgressPayload>("transfer-progress", (event) => {
      const bps = event.payload.speed_bps ?? 0;
      if (bps <= 0) {
        setGlobalSpeed(null);
        return;
      }
      const label = formatSpeedBps(bps);
      setGlobalSpeed(label);
      const id = event.payload.transfer_id;
      if (id) {
        setSpeedById((prev) => ({ ...prev, [id]: label }));
      }
    }).then((fn) => {
      unlisten = fn;
    });

    void listen("transfer-completed", () => {
      setGlobalSpeed(null);
      setSpeedById({});
    }).then((fn) => {
      unlistenDone = fn;
    });

    return () => {
      unlisten?.();
      unlistenDone?.();
    };
  }, []);

  return { speedById, globalSpeed };
}
