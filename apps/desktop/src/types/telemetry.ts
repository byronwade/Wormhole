// Opt-in telemetry types for anonymous usage analytics

export interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: number;
  platform: string;
  appVersion: string;
  sessionId: string;
  data?: Record<string, unknown>;
}

export type TelemetryEventType =
  | "app_launched"
  | "share_started"
  | "share_stopped"
  | "connection_started"
  | "connection_stopped"
  | "transfer_completed"
  | "error_occurred"
  | "setup_completed"
  | "feature_used";

export interface TelemetrySettings {
  enabled: boolean;
  shareUsageData: boolean; // Share anonymous usage stats
  shareErrorReports: boolean; // Share crash/error reports
  consentGivenAt?: number; // When user gave consent
}

export const DEFAULT_TELEMETRY_SETTINGS: TelemetrySettings = {
  enabled: false,
  shareUsageData: false,
  shareErrorReports: false,
};

export const TELEMETRY_STORAGE_KEY = "wormhole_telemetry_settings";

// What we collect (for transparency)
export const TELEMETRY_COLLECTED_DATA = [
  "App version and platform (macOS/Windows/Linux)",
  "Anonymous session ID (resets each launch)",
  "Feature usage counts (shares, connections)",
  "Error types (not file names or paths)",
  "Performance metrics (connection times)",
];

// What we NEVER collect
export const TELEMETRY_NEVER_COLLECTED = [
  "File names or contents",
  "Folder paths",
  "IP addresses",
  "Join codes",
  "Any personally identifiable information",
];
