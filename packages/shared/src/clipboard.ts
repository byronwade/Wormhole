import { extractJoinCode } from "./join-code";

/** Read clipboard text (browser / Tauri webview). */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** If clipboard holds a join code / share link, return the normalized code. */
export async function detectJoinCodeFromClipboard(): Promise<string | null> {
  const text = await readClipboardText();
  if (!text) return null;
  return extractJoinCode(text);
}

/** Copy text to clipboard. */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
