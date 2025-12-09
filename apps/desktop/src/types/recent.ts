// Wormhole Recent Files Types
// Track recently accessed files for quick access

export interface RecentFileEntry {
  id: string;
  path: string;
  name: string;
  sourceId: string; // Share or connection ID this file belongs to
  sourceType: "share" | "connection";
  accessedAt: number; // Unix timestamp
  size?: number;
  isDir: boolean;
}

export const RECENT_STORAGE_KEY = "wormhole_recent_files";
export const MAX_RECENT_FILES = 100;

// Generate unique ID for recent file entry
export function generateRecentId(): string {
  return `recent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Load recent files from localStorage
export function loadRecentFiles(): RecentFileEntry[] {
  try {
    const stored = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored) as RecentFileEntry[];
  } catch (e) {
    console.error("Failed to load recent files:", e);
    return [];
  }
}

// Save recent files to localStorage
export function saveRecentFiles(entries: RecentFileEntry[]): void {
  try {
    // Keep only the most recent MAX_RECENT_FILES entries
    const trimmed = entries.slice(0, MAX_RECENT_FILES);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error("Failed to save recent files:", e);
  }
}

// Group recent files by time period
export interface GroupedRecentFiles {
  today: RecentFileEntry[];
  yesterday: RecentFileEntry[];
  thisWeek: RecentFileEntry[];
  earlier: RecentFileEntry[];
}

export function groupRecentFilesByTime(entries: RecentFileEntry[]): GroupedRecentFiles {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneWeekMs = 7 * oneDayMs;

  // Get start of today (midnight)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();

  const yesterdayStart = todayStart - oneDayMs;
  const weekStart = todayStart - oneWeekMs;

  const grouped: GroupedRecentFiles = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  for (const entry of entries) {
    if (entry.accessedAt >= todayStart) {
      grouped.today.push(entry);
    } else if (entry.accessedAt >= yesterdayStart) {
      grouped.yesterday.push(entry);
    } else if (entry.accessedAt >= weekStart) {
      grouped.thisWeek.push(entry);
    } else {
      grouped.earlier.push(entry);
    }
  }

  return grouped;
}
