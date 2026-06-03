import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ShareHistoryItem, ConnectionHistoryItem } from "@/types/history";

// Index entry matching backend structure
export interface IndexEntry {
  name: string;
  name_lower: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified?: number;
  root_path: string;
  root_name: string;
  root_type: "share" | "connection";
}

interface UseFileIndexReturn {
  // Full index
  index: IndexEntry[];

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: IndexEntry[];

  // Index management
  isIndexing: boolean;
  indexedSources: string[];
  refreshIndex: () => Promise<void>;

  // Stats
  totalFiles: number;
  totalFolders: number;
}

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useFileIndex(
  shares: ShareHistoryItem[],
  connections: ConnectionHistoryItem[]
): UseFileIndexReturn {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexedSources, setIndexedSources] = useState<string[]>([]);

  // Debounce search query by 150ms for better performance
  const debouncedSearchQuery = useDebounce(searchQuery, 150);

  // Keep track of what we've indexed to avoid re-indexing
  const indexedPathsRef = useRef<Set<string>>(new Set());

  // Get active shares and connections
  const activeShares = useMemo(
    () => shares.filter((s) => s.status === "active"),
    [shares]
  );

  const activeConnections = useMemo(
    () => connections.filter((c) => c.status === "connected"),
    [connections]
  );

  // Index a single directory
  const indexDirectory = useCallback(
    async (
      path: string,
      rootName: string,
      rootType: "share" | "connection"
    ): Promise<IndexEntry[]> => {
      try {
        const entries = await invoke<IndexEntry[]>("index_directory", {
          path,
          rootName,
          rootType,
          maxDepth: 10,
        });
        return entries;
      } catch (e) {
        console.error(`Failed to index ${path}:`, e);
        return [];
      }
    },
    []
  );

  // Refresh the entire index
  const refreshIndex = useCallback(async () => {
    setIsIndexing(true);
    const newIndex: IndexEntry[] = [];
    const sources: string[] = [];
    const indexedPaths = new Set<string>();

    // Index all active shares
    for (const share of activeShares) {
      const folderName = share.path.split("/").pop() || "Shared Folder";
      const entries = await indexDirectory(share.path, folderName, "share");
      newIndex.push(...entries);
      sources.push(share.path);
      indexedPaths.add(share.path);
    }

    // Index all active connections
    for (const conn of activeConnections) {
      const mountName = conn.mountPoint.split("/").pop() || "Remote Share";
      const entries = await indexDirectory(conn.mountPoint, mountName, "connection");
      newIndex.push(...entries);
      sources.push(conn.mountPoint);
      indexedPaths.add(conn.mountPoint);
    }

    setIndex(newIndex);
    setIndexedSources(sources);
    indexedPathsRef.current = indexedPaths;
    setIsIndexing(false);
  }, [activeShares, activeConnections, indexDirectory]);

  // Auto-index when shares/connections change
  useEffect(() => {
    let cancelled = false;

    // Check if we need to re-index
    const currentPaths = new Set([
      ...activeShares.map((s) => s.path),
      ...activeConnections.map((c) => c.mountPoint),
    ]);

    const needsReindex =
      currentPaths.size !== indexedPathsRef.current.size ||
      [...currentPaths].some((p) => !indexedPathsRef.current.has(p));

    if (needsReindex) {
      // Wrap refreshIndex to check cancellation
      const doRefresh = async () => {
        setIsIndexing(true);
        const newIndex: IndexEntry[] = [];
        const sources: string[] = [];
        const indexedPaths = new Set<string>();

        // Index all active shares
        for (const share of activeShares) {
          if (cancelled) return;
          const folderName = share.path.split("/").pop() || "Shared Folder";
          const entries = await indexDirectory(share.path, folderName, "share");
          newIndex.push(...entries);
          sources.push(share.path);
          indexedPaths.add(share.path);
        }

        // Index all active connections
        for (const conn of activeConnections) {
          if (cancelled) return;
          const mountName = conn.mountPoint.split("/").pop() || "Remote Share";
          const entries = await indexDirectory(conn.mountPoint, mountName, "connection");
          newIndex.push(...entries);
          sources.push(conn.mountPoint);
          indexedPaths.add(conn.mountPoint);
        }

        // Only update state if not cancelled
        if (!cancelled) {
          setIndex(newIndex);
          setIndexedSources(sources);
          indexedPathsRef.current = indexedPaths;
          setIsIndexing(false);
        }
      };

      doRefresh();
    }

    return () => {
      cancelled = true;
    };
  }, [activeShares, activeConnections, indexDirectory]);

  // Fast search using pre-computed lowercase names (with debouncing)
  const searchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return [];
    }

    const query = debouncedSearchQuery.toLowerCase().trim();

    // Fast filter - uses pre-computed lowercase names
    return index.filter((entry) => entry.name_lower.includes(query));
  }, [index, debouncedSearchQuery]);

  // Stats
  const totalFiles = useMemo(
    () => index.filter((e) => !e.is_dir).length,
    [index]
  );

  const totalFolders = useMemo(
    () => index.filter((e) => e.is_dir).length,
    [index]
  );

  return {
    index,
    searchQuery,
    setSearchQuery,
    searchResults,
    isIndexing,
    indexedSources,
    refreshIndex,
    totalFiles,
    totalFolders,
  };
}
