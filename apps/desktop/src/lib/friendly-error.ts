/**
 * Map raw backend / network errors to short, human copy.
 * Creatives should never see EIO or anyhow chains.
 */

export function friendlyError(raw: unknown, context: "mount" | "share" | "generic" = "generic"): string {
  const msg = stringify(raw);

  if (/already active|already in use/i.test(msg)) {
    return context === "mount"
      ? "That folder is already mounted."
      : "That share is already running.";
  }
  if (/timed out|timeout/i.test(msg)) {
    return context === "mount"
      ? "They didn’t answer in time. Are they still sharing?"
      : "That took too long. Check your network and try again.";
  }
  if (/connection refused|failed to connect|unreachable|network/i.test(msg)) {
    return context === "mount"
      ? "Couldn’t reach them. Same Wi‑Fi? Still sharing?"
      : "Network hiccup. Try again in a moment.";
  }
  if (/not found|no peer|unknown join|invalid.*code/i.test(msg)) {
    return "That join code isn’t live right now.";
  }
  if (/permission|eacces|denied/i.test(msg)) {
    return "Permission denied. Check folder access and try again.";
  }
  if (/fuse|winfsp|macfuse/i.test(msg)) {
    return "Filesystem driver missing. Run Setup from Settings.";
  }
  if (/cancelled|canceled|abort/i.test(msg)) {
    return "Cancelled.";
  }

  // Strip noisy prefixes
  const cleaned = msg
    .replace(/^Error:\s*/i, "")
    .replace(/^Connection error:\s*/i, "")
    .replace(/^Failed to [^:]+:\s*/i, "")
    .trim();

  if (cleaned.length > 0 && cleaned.length < 120 && !/[{\\[|]/.test(cleaned)) {
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }

  return context === "mount"
    ? "Something went wrong mounting. We’ll keep trying if they come back."
    : "Something went wrong. Try again.";
}

function stringify(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message;
  try {
    return String(raw);
  } catch {
    return "";
  }
}

/** Peer went away — copy for auto-reconnect UI. */
export function peerOfflineMessage(peerName?: string | null): string {
  const who = peerName?.trim() || "They";
  if (who === "They") {
    return "They went offline. We’ll remount when they’re back.";
  }
  return `${who} went offline. We’ll remount when they’re back.`;
}

export function reconnectingMessage(peerName?: string | null): string {
  const who = peerName?.trim();
  return who ? `Reconnecting to ${who}…` : "Reconnecting…";
}
