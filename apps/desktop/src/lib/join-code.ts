/**
 * Desktop join-code helpers (mirrored from @wormhole/shared for Tauri bundling).
 * Keep in sync with packages/shared/src/join-code.ts
 */

export function normalizeJoinCode(input: string): string {
  return input.trim().replace(/[-\s]/g, "").toUpperCase();
}

export function formatJoinCode(code: string): string {
  const n = normalizeJoinCode(code);
  if (n.length <= 3) return n;
  return `${n.slice(0, 3)}-${n.slice(3)}`;
}

export function isValidJoinCode(input: string): boolean {
  const n = normalizeJoinCode(input);
  return /^[2-9A-HJ-NP-Z]{6}$/.test(n);
}

export function extractJoinCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const deep = trimmed.match(
    /^(?:wormhole:\/\/(?:join\/|j\/)?)([2-9A-HJ-NP-Za-z-]{6,})/i,
  );
  if (deep?.[1] && isValidJoinCode(deep[1])) {
    return normalizeJoinCode(deep[1]);
  }

  const web = trimmed.match(/\/j\/([2-9A-HJ-NP-Za-z-]{6,})/i);
  if (web?.[1] && isValidJoinCode(web[1])) {
    return normalizeJoinCode(web[1]);
  }

  if (isValidJoinCode(trimmed)) {
    return normalizeJoinCode(trimmed);
  }

  return null;
}

export function joinCodeQrPayload(code: string): string {
  return `wormhole://join/${formatJoinCode(code)}`;
}

export async function detectJoinCodeFromClipboard(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null;
  }
  try {
    const text = await navigator.clipboard.readText();
    return extractJoinCode(text);
  } catch {
    return null;
  }
}
