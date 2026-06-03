import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { X, Download, Upload, CheckCircle2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

// Simple progress bar component
function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`w-full bg-zinc-700 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-emerald-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

interface TransferProgressEvent {
  transfer_id: string;
  file_name: string;
  bytes_transferred: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds: number | null;
}

interface TransferCompletedEvent {
  transfer_id: string;
  success: boolean;
  bytes_transferred: number;
  duration_ms: number;
  error: string | null;
}

interface ActiveTransfer {
  id: string;
  fileName: string;
  bytesTransferred: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  direction: "upload" | "download";
  startTime: number;
}

interface CompletedTransfer {
  id: string;
  fileName: string;
  success: boolean;
  bytesTransferred: number;
  durationMs: number;
  error: string | null;
  completedAt: number;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// Format speed to human readable
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "—";
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

// Format ETA to human readable
function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// Single transfer item component
function TransferItem({
  transfer,
  onCancel,
}: {
  transfer: ActiveTransfer;
  onCancel?: () => void;
}) {
  const progress = transfer.totalBytes > 0
    ? (transfer.bytesTransferred / transfer.totalBytes) * 100
    : 0;

  return (
    <div className="group p-3 hover:bg-zinc-800/30 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          transfer.direction === "upload"
            ? "bg-emerald-500/20"
            : "bg-blue-500/20"
        }`}>
          {transfer.direction === "upload" ? (
            <Upload className="w-4 h-4 text-emerald-400" />
          ) : (
            <Download className="w-4 h-4 text-blue-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white truncate">
              {transfer.fileName}
            </span>
            {onCancel && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancel}
                className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-zinc-700"
                aria-label="Cancel transfer"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-1.5 mt-2" />

          {/* Stats row */}
          <div className="flex items-center justify-between mt-1.5 text-xs text-zinc-500">
            <span>
              {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.totalBytes)}
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {formatSpeed(transfer.speedBps)}
              </span>
              {transfer.etaSeconds !== null && (
                <span>{formatEta(transfer.etaSeconds)} left</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Completed transfer notification
function CompletedNotification({
  transfer,
  onDismiss,
}: {
  transfer: CompletedTransfer;
  onDismiss: () => void;
}) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border animate-in slide-in-from-right ${
        transfer.success
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-red-500/10 border-red-500/20"
      }`}
    >
      {transfer.success ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {transfer.fileName}
        </p>
        <p className={`text-xs ${transfer.success ? "text-emerald-400" : "text-red-400"}`}>
          {transfer.success
            ? `Completed in ${(transfer.durationMs / 1000).toFixed(1)}s`
            : transfer.error || "Transfer failed"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        className="h-6 w-6 hover:bg-zinc-700"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

// Main transfer panel component
export function TransferPanel() {
  const [activeTransfers, setActiveTransfers] = useState<Map<string, ActiveTransfer>>(new Map());
  const [completedTransfers, setCompletedTransfers] = useState<CompletedTransfer[]>([]);

  // Listen for transfer progress events
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenCompleted: (() => void) | undefined;

    const setup = async () => {
      unlistenProgress = await listen<TransferProgressEvent>("transfer-progress", (event) => {
        const data = event.payload;
        setActiveTransfers((prev) => {
          const next = new Map(prev);
          const existing = next.get(data.transfer_id);
          next.set(data.transfer_id, {
            id: data.transfer_id,
            fileName: data.file_name,
            bytesTransferred: data.bytes_transferred,
            totalBytes: data.total_bytes,
            speedBps: data.speed_bps,
            etaSeconds: data.eta_seconds,
            direction: existing?.direction || "download",
            startTime: existing?.startTime || Date.now(),
          });
          return next;
        });
      });

      unlistenCompleted = await listen<TransferCompletedEvent>("transfer-completed", (event) => {
        const data = event.payload;

        // Remove from active
        setActiveTransfers((prev) => {
          const next = new Map(prev);
          const transfer = next.get(data.transfer_id);
          next.delete(data.transfer_id);

          // Add to completed notifications
          setCompletedTransfers((old) => [
            ...old,
            {
              id: data.transfer_id,
              fileName: transfer?.fileName || "Unknown file",
              success: data.success,
              bytesTransferred: data.bytes_transferred,
              durationMs: data.duration_ms,
              error: data.error,
              completedAt: Date.now(),
            },
          ]);

          return next;
        });
      });
    };

    setup();

    return () => {
      unlistenProgress?.();
      unlistenCompleted?.();
    };
  }, []);

  const dismissCompleted = (id: string) => {
    setCompletedTransfers((prev) => prev.filter((t) => t.id !== id));
  };

  const activeArray = Array.from(activeTransfers.values());

  // Don't render if nothing to show
  if (activeArray.length === 0 && completedTransfers.length === 0) {
    return null;
  }

  // Calculate aggregate stats
  const totalSpeed = activeArray.reduce((sum, t) => sum + t.speedBps, 0);
  const totalBytes = activeArray.reduce((sum, t) => sum + t.totalBytes, 0);
  const transferredBytes = activeArray.reduce((sum, t) => sum + t.bytesTransferred, 0);
  const overallProgress = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0;

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50 space-y-2">
      {/* Completed notifications */}
      {completedTransfers.map((transfer) => (
        <CompletedNotification
          key={transfer.id}
          transfer={transfer}
          onDismiss={() => dismissCompleted(transfer.id)}
        />
      ))}

      {/* Active transfers panel */}
      {activeArray.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden">
          {/* Header with aggregate stats */}
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">
                {activeArray.length} {activeArray.length === 1 ? "transfer" : "transfers"}
              </span>
              <span className="text-sm text-emerald-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {formatSpeed(totalSpeed)}
              </span>
            </div>
            {activeArray.length > 1 && (
              <Progress value={overallProgress} className="h-1 mt-2" />
            )}
          </div>

          {/* Transfer list */}
          <div className="max-h-64 overflow-y-auto">
            {activeArray.map((transfer) => (
              <TransferItem key={transfer.id} transfer={transfer} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TransferPanel;
