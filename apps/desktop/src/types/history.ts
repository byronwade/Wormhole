// Wormhole History Types
// Persistent storage for share and connection history

export type ShareStatus = "active" | "paused" | "inactive";
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

// Share history item - represents a folder being shared
export interface ShareHistoryItem {
  id: string;
  name: string; // Display name (e.g., "MacBook Pro : Documents")
  path: string; // Local folder path being shared
  joinCode: string; // The join code for this share
  shareLink: string; // Full share URL
  port: number; // Port being used
  status: ShareStatus; // Current status
  createdAt: number; // Unix timestamp
  lastActiveAt: number; // Last time it was active
}

// Connection history item - represents a connection to a remote share
export interface ConnectionHistoryItem {
  id: string;
  name: string; // Display name
  joinCode: string; // The code used to connect
  mountPoint: string; // Where it's mounted locally
  remoteHost?: string; // Remote host info if available
  status: ConnectionStatus; // Current status
  createdAt: number; // Unix timestamp
  lastConnectedAt: number; // Last successful connection
  errorMessage?: string; // Last error if any
}

// Complete stored history
export interface WormholeHistory {
  shares: ShareHistoryItem[];
  connections: ConnectionHistoryItem[];
  version: number;
}

// Storage constants
export const HISTORY_STORAGE_KEY = "wormhole_history";
export const HISTORY_VERSION = 1;

// Generate unique ID for shares/connections
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Load history from localStorage
export function loadHistory(): WormholeHistory {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) {
      return { shares: [], connections: [], version: HISTORY_VERSION };
    }

    const parsed = JSON.parse(stored) as WormholeHistory;

    // Handle version migrations if needed
    if (parsed.version < HISTORY_VERSION) {
      // Future: add migration logic here
      return { shares: [], connections: [], version: HISTORY_VERSION };
    }

    // Reset all statuses to inactive/disconnected on load
    // (actual status will be synced with backend)
    return {
      shares: parsed.shares.map((s) => ({ ...s, status: "inactive" as const })),
      connections: parsed.connections.map((c) => ({
        ...c,
        status: "disconnected" as const,
      })),
      version: parsed.version,
    };
  } catch (e) {
    console.error("Failed to load history:", e);
    return { shares: [], connections: [], version: HISTORY_VERSION };
  }
}

// Save history to localStorage
export function saveHistory(history: WormholeHistory): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

// Update a single share in history
export function updateShareInHistory(
  history: WormholeHistory,
  id: string,
  updates: Partial<ShareHistoryItem>
): WormholeHistory {
  return {
    ...history,
    shares: history.shares.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    ),
  };
}

// Update a single connection in history
export function updateConnectionInHistory(
  history: WormholeHistory,
  id: string,
  updates: Partial<ConnectionHistoryItem>
): WormholeHistory {
  return {
    ...history,
    connections: history.connections.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    ),
  };
}

// Add a new share to history
export function addShareToHistory(
  history: WormholeHistory,
  share: ShareHistoryItem
): WormholeHistory {
  // Check if share with same path already exists
  const existingIndex = history.shares.findIndex((s) => s.path === share.path);
  if (existingIndex >= 0) {
    // Update existing share
    const updated = [...history.shares];
    updated[existingIndex] = { ...share, id: history.shares[existingIndex].id };
    return { ...history, shares: updated };
  }
  return { ...history, shares: [share, ...history.shares] };
}

// Add a new connection to history
export function addConnectionToHistory(
  history: WormholeHistory,
  connection: ConnectionHistoryItem
): WormholeHistory {
  // Check if connection with same joinCode already exists
  const existingIndex = history.connections.findIndex(
    (c) => c.joinCode === connection.joinCode
  );
  if (existingIndex >= 0) {
    // Update existing connection
    const updated = [...history.connections];
    updated[existingIndex] = {
      ...connection,
      id: history.connections[existingIndex].id,
    };
    return { ...history, connections: updated };
  }
  return { ...history, connections: [connection, ...history.connections] };
}

// Remove a share from history
export function removeShareFromHistory(
  history: WormholeHistory,
  id: string
): WormholeHistory {
  return {
    ...history,
    shares: history.shares.filter((s) => s.id !== id),
  };
}

// Remove a connection from history
export function removeConnectionFromHistory(
  history: WormholeHistory,
  id: string
): WormholeHistory {
  return {
    ...history,
    connections: history.connections.filter((c) => c.id !== id),
  };
}
