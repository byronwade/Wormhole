import { useState, useEffect, useCallback, useMemo } from "react";
import type { ShareHistoryItem, ConnectionHistoryItem } from "@/types/history";
import {
  RecentFileEntry,
  GroupedRecentFiles,
  loadRecentFiles,
  saveRecentFiles,
  generateRecentId,
  groupRecentFilesByTime,
  MAX_RECENT_FILES,
} from "@/types/recent";

interface UseRecentFilesReturn {
  // Recent files list
  recentFiles: RecentFileEntry[];
  groupedRecentFiles: GroupedRecentFiles;

  // Operations
  addRecentFile: (file: Omit<RecentFileEntry, "id" | "accessedAt">) => void;
  removeRecentFile: (id: string) => void;
  clearRecentFiles: () => void;

  // Stats
  totalRecent: number;
}

export function useRecentFiles(
  shares: ShareHistoryItem[],
  connections: ConnectionHistoryItem[]
): UseRecentFilesReturn {
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() =>
    loadRecentFiles()
  );

  // Save to localStorage whenever recentFiles changes
  useEffect(() => {
    saveRecentFiles(recentFiles);
  }, [recentFiles]);

  // Auto-cleanup: Remove entries when their source share/connection is removed
  useEffect(() => {
    const validSourceIds = new Set([
      ...shares.map((s) => s.id),
      ...connections.map((c) => c.id),
    ]);

    setRecentFiles((prev) => {
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

  // Add a file to recent files
  const addRecentFile = useCallback(
    (file: Omit<RecentFileEntry, "id" | "accessedAt">) => {
      setRecentFiles((prev) => {
        // Check if this file path already exists
        const existingIndex = prev.findIndex((f) => f.path === file.path);

        if (existingIndex >= 0) {
          // Update existing entry's accessedAt time and move to front
          const updated = [...prev];
          const [existing] = updated.splice(existingIndex, 1);
          return [
            { ...existing, accessedAt: Date.now() },
            ...updated,
          ].slice(0, MAX_RECENT_FILES);
        }

        // Add new entry at the front
        const newEntry: RecentFileEntry = {
          ...file,
          id: generateRecentId(),
          accessedAt: Date.now(),
        };

        return [newEntry, ...prev].slice(0, MAX_RECENT_FILES);
      });
    },
    []
  );

  // Remove a specific recent file
  const removeRecentFile = useCallback((id: string) => {
    setRecentFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Clear all recent files
  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
  }, []);

  // Group files by time period
  const groupedRecentFiles = useMemo(
    () => groupRecentFilesByTime(recentFiles),
    [recentFiles]
  );

  return {
    recentFiles,
    groupedRecentFiles,
    addRecentFile,
    removeRecentFile,
    clearRecentFiles,
    totalRecent: recentFiles.length,
  };
}
