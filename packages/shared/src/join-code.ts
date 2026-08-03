/** Normalize join codes (strip dashes/spaces, uppercase). */
export function normalizeJoinCode(input: string): string {
  return input
    .trim()
    .replace(/[-\s]/g, "")
    .toUpperCase();
}

/** Format as XXX-XXX for display. */
export function formatJoinCode(code: string): string {
  const n = normalizeJoinCode(code);
  if (n.length <= 3) return n;
  return `${n.slice(0, 3)}-${n.slice(3)}`;
}

/** Basic shape check for Wormhole join codes. */
export function isValidJoinCode(input: string): boolean {
  const n = normalizeJoinCode(input);
  return /^[2-9A-HJ-NP-Z]{6}$/.test(n);
}

/** Extract join code from URL, deep link, or plain text. */
export function extractJoinCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const deep = trimmed.match(/^(?:wormhole:\/\/(?:join\/|j\/)?)([2-9A-HJ-NP-Za-z-]{6,})/i);
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

/** Build a shareable web link. */
export function makeShareLink(code: string, baseUrl = "https://wormhole.byronwade.com"): string {
  return `${baseUrl.replace(/\/$/, "")}/j/${formatJoinCode(code)}`;
}

/** QR payload — prefer deep link for native apps. */
export function joinCodeQrPayload(code: string): string {
  return `wormhole://join/${formatJoinCode(code)}`;
}

/** Phonetic alphabet for reading codes over the phone (unambiguous chars only). */
const PHONETIC: Record<string, string> = {
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  A: "alpha",
  B: "bravo",
  C: "charlie",
  D: "delta",
  E: "echo",
  F: "foxtrot",
  G: "golf",
  H: "hotel",
  J: "juliet",
  K: "kilo",
  M: "mike",
  N: "november",
  P: "papa",
  Q: "quebec",
  R: "romeo",
  S: "sierra",
  T: "tango",
  U: "uniform",
  V: "victor",
  W: "whiskey",
  X: "xray",
  Y: "yankee",
  Z: "zulu",
};

/**
 * Speakable form for phone calls: "seven · kilo · juliet — mike · xray · bravo"
 */
export function speakJoinCode(code: string): string {
  const n = normalizeJoinCode(code);
  if (!n) return "";
  const words = n.split("").map((ch) => PHONETIC[ch] ?? ch.toLowerCase());
  if (words.length === 6) {
    return `${words.slice(0, 3).join(" · ")} — ${words.slice(3).join(" · ")}`;
  }
  return words.join(" · ");
}
