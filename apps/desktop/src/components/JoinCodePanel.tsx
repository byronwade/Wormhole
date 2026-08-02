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
    <div className={cn("space-y-4", className)}>
      <p className="text-sm text-zinc-400 text-center">Join code</p>
      <div
        className="font-mono text-5xl sm:text-6xl font-medium tracking-wider text-center select-all text-[#7C3AED]"
        aria-label={code ? `Join code ${display}` : "No join code yet"}
      >
        {display}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={handleCopyCode}
          disabled={!code}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:opacity-50 text-sm text-white"
          aria-label="Copy join code"
        >
          <Copy className="h-4 w-4" aria-hidden />
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        {showQr && code && (
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] text-sm text-white"
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
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] text-sm text-white"
            aria-label="Paste join code from clipboard"
          >
            <ClipboardPaste className="h-4 w-4" aria-hidden />
            Paste…
          </button>
        )}
      </div>

      {pasteHint && (
        <p className="text-sm text-center text-zinc-400" aria-live="polite">
          {pasteHint}
        </p>
      )}

      {showQr && code && (
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="rounded-xl bg-white p-3 shadow-sm" aria-hidden={false}>
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
          <p className="text-xs text-zinc-500 text-center max-w-xs">
            Scan with another phone or Wormhole app — or open the deep link on that device.
          </p>
        </div>
      )}
    </div>
  );
}
