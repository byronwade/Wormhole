import { useState, useEffect, useCallback } from "react";
import type { ShareHistoryItem, ConnectionHistoryItem } from "@/types/history";
import {
  FavoriteEntry,
  loadFavorites,
  saveFavorites,
  generateFavoriteId,
} from "@/types/favorites";

interface UseFavoritesReturn {
  // Favorites list
  favorites: FavoriteEntry[];

  // Operations
  addFavorite: (file: Omit<FavoriteEntry, "id" | "addedAt">) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (file: Omit<FavoriteEntry, "id" | "addedAt">) => void;
  clearFavorites: () => void;

  // Queries
  isFavorite: (path: string) => boolean;
  getFavoriteByPath: (path: string) => FavoriteEntry | undefined;

  // Stats
  totalFavorites: number;
}

export function useFavorites(
  shares: ShareHistoryItem[],
  connections: ConnectionHistoryItem[]
): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(() =>
    loadFavorites()
  );

  // Save to localStorage whenever favorites changes
  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  // Auto-cleanup: Remove entries when their source share/connection is removed
  useEffect(() => {
    const validSourceIds = new Set([
      ...shares.map((s) => s.id),
      ...connections.map((c) => c.id),
    ]);

    setFavorites((prev) => {
      const filtered = prev.filter((entry) =>
        validSourceIds.has(entry.sourceId)
      );
      // Only update if something was actually removed
      if (filtered.length !== prev.length) {
        return filtered;
      }
      return prev;
    });
  }, [shares, connections]);

  // Add a file to favorites
  const addFavorite = useCallback(
    (file: Omit<FavoriteEntry, "id" | "addedAt">) => {
      setFavorites((prev) => {
        // Check if this path already exists
        if (prev.some((f) => f.path === file.path)) {
          return prev;
        }

        const newEntry: FavoriteEntry = {
          ...file,
          id: generateFavoriteId(),
          addedAt: Date.now(),
        };

        return [newEntry, ...prev];
      });
    },
    []
  );

  // Remove a specific favorite
  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Toggle favorite status for a file
  const toggleFavorite = useCallback(
    (file: Omit<FavoriteEntry, "id" | "addedAt">) => {
      setFavorites((prev) => {
        const existingIndex = prev.findIndex((f) => f.path === file.path);

        if (existingIndex >= 0) {
          // Remove from favorites
          return prev.filter((_, i) => i !== existingIndex);
        }

        // Add to favorites
        const newEntry: FavoriteEntry = {
          ...file,
          id: generateFavoriteId(),
          addedAt: Date.now(),
        };

        return [newEntry, ...prev];
      });
    },
    []
  );

  // Clear all favorites
  const clearFavorites = useCallback(() => {
    setFavorites([]);
  }, []);

  // Check if a path is favorited
  const isFavorite = useCallback(
    (path: string) => {
      return favorites.some((f) => f.path === path);
    },
    [favorites]
  );

  // Get favorite entry by path
  const getFavoriteByPath = useCallback(
    (path: string) => {
      return favorites.find((f) => f.path === path);
    },
    [favorites]
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    clearFavorites,
    isFavorite,
    getFavoriteByPath,
    totalFavorites: favorites.length,
  };
}
