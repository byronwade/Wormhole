import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  WormholeHistory,
  ShareHistoryItem,
  ConnectionHistoryItem,
  ShareStatus,
  ConnectionStatus,
  ExpirationOption,
  loadHistory,
  saveHistory,
  generateId,
  addShareToHistory,
  addConnectionToHistory,
  updateShareInHistory,
  updateConnectionInHistory,
  removeShareFromHistory,
  removeConnectionFromHistory,
} from "@/types/history";

// Wormhole base URL for share links
const WORMHOLE_BASE_URL = "https://wormhole.dev";

function makeShareLink(joinCode: string): string {
  return `${WORMHOLE_BASE_URL}/j/${joinCode}`;
}

interface UseWormholeHistoryReturn {
  // State
  shares: ShareHistoryItem[];
  connections: ConnectionHistoryItem[];

  // Share operations
  addShare: (path: string, joinCode: string, port: number, name?: string, id?: string, expirationOption?: ExpirationOption, expiresAt?: number | null) => ShareHistoryItem;
  updateShare: (id: string, updates: Partial<ShareHistoryItem>) => void;
  removeShare: (id: string) => void;
  setShareStatus: (id: string, status: ShareStatus) => void;
  getActiveShare: () => ShareHistoryItem | undefined;

  // Connection operations
  addConnection: (joinCode: string, mountPoint: string, name?: string, id?: string) => ConnectionHistoryItem;
  updateConnection: (id: string, updates: Partial<ConnectionHistoryItem>) => void;
  removeConnection: (id: string) => void;
  setConnectionStatus: (id: string, status: ConnectionStatus, errorMessage?: string) => void;
  getActiveConnection: () => ConnectionHistoryItem | undefined;

  // Sync with backend
  syncWithBackend: () => Promise<void>;
}

export function useWormholeHistory(): UseWormholeHistoryReturn {
  const [history, setHistory] = useState<WormholeHistory>(() => loadHistory());

  // Save to localStorage whenever history changes
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // Sync with backend on mount to get actual active states
  const syncWithBackend = useCallback(async () => {
    try {
      // Get all active hosts from backend (new multi-share API)
      const activeHosts = await invoke<{ id: string; share_path: string; port: number; join_code: string }[]>("get_active_hosts");

      // Get all active mounts from backend (new multi-connection API)
      const activeMounts = await invoke<{ id: string; mount_point: string; join_code: string }[]>("get_active_mounts");

      // Create sets for quick lookup
      const activeHostPaths = new Set(activeHosts.map(h => h.share_path));
      const activeMountPoints = new Set(activeMounts.map(m => m.mount_point));

      setHistory((prev) => {
        let updated = { ...prev };

        // Update share statuses based on backend state
        updated.shares = prev.shares.map((share) => {
          const isActive = activeHostPaths.has(share.path);
          if (isActive) {
            // Find the matching host info to update join code if needed
            const hostInfo = activeHosts.find(h => h.share_path === share.path);
            return {
              ...share,
              status: "active" as const,
              lastActiveAt: Date.now(),
              ...(hostInfo ? { joinCode: hostInfo.join_code, port: hostInfo.port } : {}),
            };
          }
          return { ...share, status: "inactive" as const };
        });

        // Update connection statuses based on backend state
        updated.connections = prev.connections.map((conn) => {
          if (activeMountPoints.has(conn.mountPoint)) {
            return { ...conn, status: "connected" as const, lastConnectedAt: Date.now() };
          }
          return { ...conn, status: "disconnected" as const };
        });

        return updated;
      });
    } catch (e) {
      console.error("Failed to sync with backend:", e);
    }
  }, []);

  // Sync on mount
  useEffect(() => {
    syncWithBackend();
  }, [syncWithBackend]);

  // Share operations
  const addShare = useCallback(
    (path: string, joinCode: string, port: number, name?: string, id?: string, expirationOption?: ExpirationOption, expiresAt?: number | null): ShareHistoryItem => {
      const folderName = path.split("/").pop() || "Shared Folder";
      const displayName = name || folderName;
      const shareId = id || generateId();

      const newShare: ShareHistoryItem = {
        id: shareId,
        name: displayName,
        path,
        joinCode,
        shareLink: makeShareLink(joinCode),
        port,
        status: "active",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expirationOption: expirationOption || "forever",
        expiresAt: expiresAt ?? null,
      };

      setHistory((prev) => addShareToHistory(prev, newShare));
      return newShare;
    },
    []
  );

  const updateShare = useCallback((id: string, updates: Partial<ShareHistoryItem>) => {
    setHistory((prev) => updateShareInHistory(prev, id, updates));
  }, []);

  const removeShare = useCallback((id: string) => {
    setHistory((prev) => removeShareFromHistory(prev, id));
  }, []);

  const setShareStatus = useCallback((id: string, status: ShareStatus) => {
    setHistory((prev) =>
      updateShareInHistory(prev, id, {
        status,
        ...(status === "active" ? { lastActiveAt: Date.now() } : {}),
      })
    );
  }, []);

  const getActiveShare = useCallback((): ShareHistoryItem | undefined => {
    return history.shares.find((s) => s.status === "active");
  }, [history.shares]);

  // Connection operations
  const addConnection = useCallback(
    (joinCode: string, mountPoint: string, name?: string, id?: string): ConnectionHistoryItem => {
      const mountName = mountPoint.split("/").pop() || "Remote Share";
      const displayName = name || `${joinCode} : ${mountName}`;

      const newConnection: ConnectionHistoryItem = {
        id: id || generateId(),
        name: displayName,
        joinCode,
        mountPoint,
        status: "connecting",
        createdAt: Date.now(),
        lastConnectedAt: Date.now(),
      };

      setHistory((prev) => addConnectionToHistory(prev, newConnection));
      return newConnection;
    },
    []
  );

  const updateConnection = useCallback(
    (id: string, updates: Partial<ConnectionHistoryItem>) => {
      setHistory((prev) => updateConnectionInHistory(prev, id, updates));
    },
    []
  );

  const removeConnection = useCallback((id: string) => {
    setHistory((prev) => removeConnectionFromHistory(prev, id));
  }, []);

  const setConnectionStatus = useCallback(
    (id: string, status: ConnectionStatus, errorMessage?: string) => {
      setHistory((prev) =>
        updateConnectionInHistory(prev, id, {
          status,
          errorMessage,
          ...(status === "connected" ? { lastConnectedAt: Date.now() } : {}),
        })
      );
    },
    []
  );

  const getActiveConnection = useCallback((): ConnectionHistoryItem | undefined => {
    return history.connections.find((c) => c.status === "connected" || c.status === "connecting");
  }, [history.connections]);

  return {
    shares: history.shares,
    connections: history.connections,
    addShare,
    updateShare,
    removeShare,
    setShareStatus,
    getActiveShare,
    addConnection,
    updateConnection,
    removeConnection,
    setConnectionStatus,
    getActiveConnection,
    syncWithBackend,
  };
}
