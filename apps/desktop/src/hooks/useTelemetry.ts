import { useState, useEffect, useCallback, useRef } from "react";
import type {
  TelemetrySettings,
  TelemetryEvent,
  TelemetryEventType,
} from "@/types/telemetry";
import {
  DEFAULT_TELEMETRY_SETTINGS,
  TELEMETRY_STORAGE_KEY,
} from "@/types/telemetry";

// Generate a random session ID (resets each app launch)
function generateSessionId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Detect platform
function detectPlatform(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "macos";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

// Get app version (would come from package.json in production)
function getAppVersion(): string {
  // In production, this would be injected at build time
  return "0.1.0";
}

export function useTelemetry() {
  const [settings, setSettings] = useState<TelemetrySettings>(
    DEFAULT_TELEMETRY_SETTINGS
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const sessionIdRef = useRef<string>(generateSessionId());
  const eventQueueRef = useRef<TelemetryEvent[]>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as TelemetrySettings;
        setSettings(parsed);
      } catch {
        // Invalid stored data, use defaults
      }
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  // Flush event queue to server
  const flushEvents = useCallback(async () => {
    if (!settings.enabled || eventQueueRef.current.length === 0) {
      return;
    }

    const events = [...eventQueueRef.current];
    eventQueueRef.current = [];

    // In production, this would send to a telemetry endpoint
    // For now, just log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log("[Telemetry] Would send events:", events);
    }

    // Example of what the actual implementation would look like:
    // try {
    //   await fetch("https://telemetry.wormhole.app/v1/events", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ events }),
    //   });
    // } catch (e) {
    //   // Silently fail - telemetry should never interrupt the user
    //   eventQueueRef.current = [...events, ...eventQueueRef.current];
    // }
  }, [settings.enabled]);

  // Schedule a flush (debounced)
  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(flushEvents, 5000); // Flush after 5s of inactivity
  }, [flushEvents]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      // Flush remaining events synchronously on unmount
      if (settings.enabled && eventQueueRef.current.length > 0) {
        flushEvents();
      }
    };
  }, [settings.enabled, flushEvents]);

  // Track an event
  const track = useCallback(
    (type: TelemetryEventType, data?: Record<string, unknown>) => {
      if (!settings.enabled) {
        return;
      }

      // Filter based on settings
      const isError = type === "error_occurred";
      const isUsage = !isError;

      if (isError && !settings.shareErrorReports) {
        return;
      }
      if (isUsage && !settings.shareUsageData) {
        return;
      }

      const event: TelemetryEvent = {
        type,
        timestamp: Date.now(),
        platform: detectPlatform(),
        appVersion: getAppVersion(),
        sessionId: sessionIdRef.current,
        data,
      };

      eventQueueRef.current.push(event);
      scheduleFlush();
    },
    [settings, scheduleFlush]
  );

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<TelemetrySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };

      // If enabling for the first time, record consent timestamp
      if (updated.enabled && !prev.enabled && !prev.consentGivenAt) {
        updated.consentGivenAt = Date.now();
      }

      return updated;
    });
  }, []);

  // Enable all telemetry
  const enableAll = useCallback(() => {
    updateSettings({
      enabled: true,
      shareUsageData: true,
      shareErrorReports: true,
    });
    track("app_launched"); // Track that user opted in
  }, [updateSettings, track]);

  // Disable all telemetry
  const disableAll = useCallback(() => {
    updateSettings({
      enabled: false,
      shareUsageData: false,
      shareErrorReports: false,
    });
    // Clear any queued events
    eventQueueRef.current = [];
  }, [updateSettings]);

  // Convenience tracking methods
  const trackShareStarted = useCallback(() => {
    track("share_started");
  }, [track]);

  const trackShareStopped = useCallback(() => {
    track("share_stopped");
  }, [track]);

  const trackConnectionStarted = useCallback(() => {
    track("connection_started");
  }, [track]);

  const trackConnectionStopped = useCallback(() => {
    track("connection_stopped");
  }, [track]);

  const trackTransferCompleted = useCallback(
    (bytesTransferred: number, durationMs: number) => {
      track("transfer_completed", {
        bytesTransferred,
        durationMs,
        // Don't include any identifying info like file names
      });
    },
    [track]
  );

  const trackError = useCallback(
    (errorType: string) => {
      track("error_occurred", {
        errorType, // Generic error type, not the full message
      });
    },
    [track]
  );

  const trackSetupCompleted = useCallback(() => {
    track("setup_completed");
  }, [track]);

  const trackFeatureUsed = useCallback(
    (feature: string) => {
      track("feature_used", { feature });
    },
    [track]
  );

  return {
    settings,
    isLoaded,
    updateSettings,
    enableAll,
    disableAll,
    track,
    trackShareStarted,
    trackShareStopped,
    trackConnectionStarted,
    trackConnectionStopped,
    trackTransferCompleted,
    trackError,
    trackSetupCompleted,
    trackFeatureUsed,
  };
}
