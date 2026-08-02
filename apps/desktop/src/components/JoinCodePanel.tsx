import { useEffect, useState } from "react";
import { Copy, ClipboardPaste, QrCode } from "lucide-react";
import {
  detectJoinCodeFromClipboard,
  formatJoinCode,
  joinCodeQrPayload,
} from "@/lib/join-code";
import { cn } from "@/lib/utils";

interface JoinCodePanelProps {
  code: string | null;
  onCodeFromClipboard?: (code: string) => void;
  className?: string;
}

/**
 * Huge join-code display + copy + clipboard paste + QR payload for scanning.
 */
export function JoinCodePanel({
  code,
  onCodeFromClipboard,
  className,
}: JoinCodePanelProps) {
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  const display = code ? formatJoinCode(code) : "———-———";
  const qrPayload = code ? joinCodeQrPayload(code) : "";

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    if (!code || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(formatJoinCode(code));
    setCopied(true);
  }

  async function handlePasteDetect() {
    const found = await detectJoinCodeFromClipboard();
    if (found) {
      setPasteHint(`Found ${formatJoinCode(found)}`);
      onCodeFromClipboard?.(found);
    } else {
      setPasteHint("No join code in clipboard");
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-sm text-muted-foreground">Join code</p>
      <div
        className="font-mono text-5xl font-medium tracking-wider text-center select-all"
        style={{ color: "#7C3AED" }}
        aria-label={code ? `Join code ${display}` : "No join code yet"}
      >
        {display}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!code}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-md border border-border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
          aria-label="Copy join code"
        >
          <Copy className="h-4 w-4" aria-hidden />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={handlePasteDetect}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-md border border-border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Paste join code from clipboard"
        >
          <ClipboardPaste className="h-4 w-4" aria-hidden />
          Paste from clipboard…
        </button>
      </div>

      {pasteHint && (
        <p className="text-sm text-center text-muted-foreground" aria-live="polite">
          {pasteHint}
        </p>
      )}

      {code && (
        <div className="rounded-md border border-dashed border-border p-4 text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-sm font-medium">
            <QrCode className="h-4 w-4" aria-hidden />
            Scan / deep link
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">{qrPayload}</p>
          <p className="text-xs text-muted-foreground">
            Point another device’s camera or Wormhole app at this payload.
          </p>
        </div>
      )}
    </div>
  );
}
