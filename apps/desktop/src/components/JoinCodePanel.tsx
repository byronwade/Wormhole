import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ClipboardPaste, Link2 } from "lucide-react";
import {
  detectJoinCodeFromClipboard,
  formatJoinCode,
  joinCodeQrPayload,
  makeShareLink,
} from "@wormhole/shared";
import { cn } from "@/lib/utils";

interface JoinCodePanelProps {
  code: string | null;
  /** Show clipboard paste (connect flow). */
  showPaste?: boolean;
  /** Show copy-link + QR (share success flow). */
  showQr?: boolean;
  shareLinkBase?: string;
  onCodeFromClipboard?: (code: string) => void;
  className?: string;
}

/**
 * Huge join-code display + copy + optional paste + scannable QR.
 */
export function JoinCodePanel({
  code,
  showPaste = false,
  showQr = true,
  shareLinkBase,
  onCodeFromClipboard,
  className,
}: JoinCodePanelProps) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  const display = code ? formatJoinCode(code) : "———-———";
  const qrPayload = code ? joinCodeQrPayload(code) : "";
  const shareLink = code ? makeShareLink(code, shareLinkBase) : "";

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function handleCopyCode() {
    if (!code || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(formatJoinCode(code));
    setCopied("code");
  }

  async function handleCopyLink() {
    if (!shareLink || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied("link");
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
    <div className={cn("space-y-5", className)}>
      <p className="text-center font-mono-brand text-[11px] uppercase tracking-[0.28em] text-zinc-500">
        Join code
      </p>
      <div
        key={display}
        className={cn(
          "join-code-hero motion-code-settle select-all text-center font-mono-brand text-5xl font-semibold tracking-[0.12em] text-[#7C3AED] sm:text-6xl",
          !code && "opacity-40",
        )}
        aria-label={code ? `Join code ${display}` : "No join code yet"}
      >
        {display}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={handleCopyCode}
          disabled={!code}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:opacity-50"
          aria-label="Copy join code"
        >
          <Copy className="h-4 w-4" aria-hidden />
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        {showQr && code && (
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
            aria-label="Copy share link"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
        )}
        {showPaste && (
          <button
            type="button"
            onClick={handlePasteDetect}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
            aria-label="Paste join code from clipboard"
          >
            <ClipboardPaste className="h-4 w-4" aria-hidden />
            Paste…
          </button>
        )}
      </div>

      {pasteHint && (
        <p className="text-center text-sm text-zinc-400" aria-live="polite">
          {pasteHint}
        </p>
      )}

      {showQr && code && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <QRCodeSVG
              value={qrPayload}
              size={168}
              level="M"
              includeMargin={false}
              bgColor="#FFFFFF"
              fgColor="#0F0F0F"
              title={`QR code for join code ${display}`}
            />
          </div>
          <p className="max-w-xs text-center text-xs text-zinc-500">
            Scan with another phone or Wormhole app — or open the deep link on that device.
          </p>
        </div>
      )}
    </div>
  );
}
