// Wormhole History Types
// Persistent storage for share and connection history

export type ShareStatus = "active" | "paused" | "inactive" | "expired";
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";
export type ExpirationOption = "forever" | "1h" | "24h" | "7d" | "30d";

// Convert expiration option to milliseconds (null = forever)
export function expirationToMs(option: ExpirationOption): number | null {
  switch (option) {
    case "forever":
      return null;
    case "1h":
      return 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
  }
}

// Get human-readable label for expiration option
export function expirationLabel(option: ExpirationOption): string {
  switch (option) {
    case "forever":
      return "Forever";
    case "1h":
      return "1 Hour";
    case "24h":
      return "24 Hours";
    case "7d":
      return "7 Days";
    case "30d":
      return "30 Days";
  }
}

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
  expirationOption: ExpirationOption; // Selected expiration option
  expiresAt: number | null; // Unix timestamp when share expires, null = never
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
    // Update existing share - keep the NEW id from backend to maintain sync
    const updated = [...history.shares];
    updated[existingIndex] = { ...share }; // Use new share data including new ID
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
    // Update existing connection - keep the NEW id from backend to maintain sync
    const updated = [...history.connections];
    updated[existingIndex] = { ...connection }; // Use new connection data including new ID
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
