// Active transfer tracking types

export type TransferDirection = "upload" | "download";
export type TransferStatus = "pending" | "active" | "paused" | "completed" | "failed";

export interface ActiveTransfer {
  id: string;
  fileName: string;
  filePath: string;
  sourceId: string; // Share or connection ID
  sourceType: "share" | "connection";
  direction: TransferDirection;
  status: TransferStatus;
  bytesTransferred: number;
  totalBytes: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface TransferStats {
  activeCount: number;
  totalBytesTransferred: number;
  averageSpeed: number; // bytes per second
}

export const TRANSFERS_STORAGE_KEY = "wormhole_transfers";
