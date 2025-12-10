import { useState, useEffect, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ActiveTransfer, TransferStats } from "@/types/transfers";
import type { ShareHistoryItem, ConnectionHistoryItem } from "@/types/history";

// Event payload types from backend
interface TransferStartedEvent {
  id: string;
  fileName: string;
  filePath: string;
  sourceId: string;
  sourceType: "share" | "connection";
  direction: "upload" | "download";
  totalBytes: number;
}

interface TransferProgressEvent {
  id: string;
  bytesTransferred: number;
  totalBytes: number;
}

interface TransferCompletedEvent {
  id: string;
  success: boolean;
  error?: string;
}

export function useTransfers(
  shares: ShareHistoryItem[],
  connections: ConnectionHistoryItem[]
) {
  const [transfers, setTransfers] = useState<ActiveTransfer[]>([]);

  // Listen for transfer events from backend
  useEffect(() => {
    let mounted = true;
    let cleanupFn: (() => void) | null = null;

    const setupListeners = async () => {
      // Listen for transfer started
      const unlistenStart = await listen<TransferStartedEvent>(
        "transfer-started",
        (event) => {
          if (!mounted) return;
          const payload = event.payload;
          setTransfers((prev) => [
            ...prev,
            {
              id: payload.id,
              fileName: payload.fileName,
              filePath: payload.filePath,
              sourceId: payload.sourceId,
              sourceType: payload.sourceType,
              direction: payload.direction,
              status: "active",
              bytesTransferred: 0,
              totalBytes: payload.totalBytes,
              startedAt: Date.now(),
            },
          ]);
        }
      );

      // Listen for transfer progress
      const unlistenProgress = await listen<TransferProgressEvent>(
        "transfer-progress",
        (event) => {
          if (!mounted) return;
          const payload = event.payload;
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === payload.id
                ? {
                    ...t,
                    bytesTransferred: payload.bytesTransferred,
                    totalBytes: payload.totalBytes,
                  }
                : t
            )
          );
        }
      );

      // Listen for transfer completed
      const unlistenComplete = await listen<TransferCompletedEvent>(
        "transfer-completed",
        (event) => {
          if (!mounted) return;
          const payload = event.payload;
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === payload.id
                ? {
                    ...t,
                    status: payload.success ? "completed" : "failed",
                    completedAt: Date.now(),
                    error: payload.error,
                  }
                : t
            )
          );

          // Auto-remove completed transfers after 5 seconds
          setTimeout(() => {
            if (!mounted) return;
            setTransfers((prev) => prev.filter((t) => t.id !== payload.id));
          }, 5000);
        }
      );

      // Store cleanup function
      cleanupFn = () => {
        unlistenStart();
        unlistenProgress();
        unlistenComplete();
      };

      // If component unmounted during setup, cleanup immediately
      if (!mounted && cleanupFn) {
        cleanupFn();
      }
    };

    setupListeners();

    return () => {
      mounted = false;
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []);

  // Clean up transfers when shares/connections are removed
  useEffect(() => {
    const validShareIds = new Set(shares.map((s) => s.id));
    const validConnectionIds = new Set(connections.map((c) => c.id));

    setTransfers((prev) =>
      prev.filter((t) => {
        if (t.sourceType === "share") {
          return validShareIds.has(t.sourceId);
        }
        return validConnectionIds.has(t.sourceId);
      })
    );
  }, [shares, connections]);

  // Get only active (non-completed) transfers
  const activeTransfers = useMemo(
    () => transfers.filter((t) => t.status === "active" || t.status === "pending"),
    [transfers]
  );

  // Calculate stats
  const stats: TransferStats = useMemo(() => {
    const active = activeTransfers;
    const totalBytesTransferred = active.reduce(
      (sum, t) => sum + t.bytesTransferred,
      0
    );

    // Calculate average speed based on time elapsed
    let averageSpeed = 0;
    if (active.length > 0) {
      const now = Date.now();
      const totalElapsed = active.reduce(
        (sum, t) => sum + (now - t.startedAt) / 1000,
        0
      );
      if (totalElapsed > 0) {
        averageSpeed = totalBytesTransferred / totalElapsed;
      }
    }

    return {
      activeCount: active.length,
      totalBytesTransferred,
      averageSpeed,
    };
  }, [activeTransfers]);

  // Cancel a transfer (when backend supports it)
  const cancelTransfer = useCallback((transferId: string) => {
    // TODO: Call backend to cancel transfer
    // For now, just remove from local state
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId
          ? { ...t, status: "failed" as const, error: "Cancelled" }
          : t
      )
    );
  }, []);

  // Pause a transfer (when backend supports it)
  const pauseTransfer = useCallback((transferId: string) => {
    // TODO: Call backend to pause transfer
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId ? { ...t, status: "paused" as const } : t
      )
    );
  }, []);

  // Resume a transfer (when backend supports it)
  const resumeTransfer = useCallback((transferId: string) => {
    // TODO: Call backend to resume transfer
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId ? { ...t, status: "active" as const } : t
      )
    );
  }, []);

  return {
    transfers,
    activeTransfers,
    stats,
    cancelTransfer,
    pauseTransfer,
    resumeTransfer,
  };
}

// Helper to format transfer speed
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  } else if (bytesPerSecond < 1024 * 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
