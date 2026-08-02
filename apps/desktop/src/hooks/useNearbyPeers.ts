import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NearbyPeer } from "@/types/portal";

export function useNearbyPeers(pollMs = 4000) {
  const [peers, setPeers] = useState<NearbyPeer[]>([]);
  const [deviceName, setDeviceName] = useState<string>("this device");

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<NearbyPeer[]>("list_nearby_peers");
      setPeers(list);
      const self = list.find((p) => p.is_self);
      if (self?.name) setDeviceName(self.name.replace(/\s*\(this device\)\s*$/i, ""));
    } catch {
      // Browser preview / missing command
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => window.clearInterval(t);
  }, [refresh, pollMs]);

  return { peers, deviceName, refresh };
}
