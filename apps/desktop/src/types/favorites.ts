// Wormhole Favorites Types
// Track starred files and folders for quick access

export interface FavoriteEntry {
  id: string;
  path: string;
  name: string;
  sourceId: string; // Share or connection ID this file belongs to
  sourceType: "share" | "connection";
  addedAt: number; // Unix timestamp
  isDir: boolean;
  size?: number; // File size in bytes (optional, only for files)
}

export const FAVORITES_STORAGE_KEY = "wormhole_favorites";

// Generate unique ID for favorite entry
export function generateFavoriteId(): string {
  return `fav-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Load favorites from localStorage
export function loadFavorites(): FavoriteEntry[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored) as FavoriteEntry[];
  } catch (e) {
    console.error("Failed to load favorites:", e);
    return [];
  }
}

// Save favorites to localStorage
export function saveFavorites(entries: FavoriteEntry[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Failed to save favorites:", e);
  }
}
