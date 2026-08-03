/**
 * Turn hostnames into something a human would say.
 * "Alexs-MacBook" → "Alex's MacBook"
 * "jordan-mbp.local" → "Jordan Mbp"
 */

export function formatDeviceName(raw?: string | null): string {
  if (!raw?.trim()) return "";
  let s = raw.trim();

  // Drop .local / domain
  s = s.replace(/\.local$/i, "");
  if (s.includes(".")) {
    s = s.split(".")[0] ?? s;
  }

  // Common hostname patterns: Name's-MacBook-Pro, Name-MBP
  s = s.replace(/[_]+/g, "-");
  const parts = s.split("-").filter(Boolean);
  if (parts.length === 0) return s;

  const titled = parts.map((p, i) => {
    const lower = p.toLowerCase();
    if (lower === "mbp") return "MacBook Pro";
    if (lower === "mba") return "MacBook Air";
    if (lower === "macbook") return "MacBook";
    if (lower === "pro" && i > 0) return "Pro";
    if (lower === "air" && i > 0) return "Air";
    // Possessive: Alexs → Alex's when followed by Mac*
    if (
      i === 0 &&
      parts.length > 1 &&
      /^[A-Za-z]+s$/i.test(p) &&
      /mac|book|imac|pc|desktop/i.test(parts[1] ?? "")
    ) {
      const base = p.slice(0, -1);
      return `${titleWord(base)}'s`;
    }
    return titleWord(p);
  });

  return titled.join(" ").replace(/\s+/g, " ").trim();
}

function titleWord(w: string): string {
  if (!w) return w;
  if (/^\d/.test(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}
