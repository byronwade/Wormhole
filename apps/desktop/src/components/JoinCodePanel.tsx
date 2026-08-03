import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  detectJoinCodeFromClipboard,
  formatJoinCode,
  joinCodeQrPayload,
  makeShareLink,
  speakJoinCode,
} from "@wormhole/shared";
import { IconCheck, IconCopy, IconLink, IconPaste } from "@/components/icons";
import { cn } from "@/lib/utils";

interface JoinCodePanelProps {
  code: string | null;
  showPaste?: boolean;
  showQr?: boolean;
  shareLinkBase?: string;
  onCodeFromClipboard?: (code: string) => void;
  className?: string;
}

/**
 * Join-code ceremony — code + phonetic + copy + optional QR as one composition.
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
    const t = window.setTimeout(() => setCopied(null), 1600);
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
      <div className="join-code-ceremony">
        <p className="portal-label text-center text-zinc-500">Join code</p>
        <div
          key={display}
          className={cn(
            "join-code-hero motion-code-settle mt-3 select-all text-center font-mono-brand text-5xl font-semibold tracking-[0.14em] text-[#8B5CF6] sm:text-6xl",
            !code && "opacity-35",
          )}
          aria-label={code ? `Join code ${display}` : "No join code yet"}
        >
          {display}
        </div>
        {code && (
          <p
            className="motion-peer-in mt-3 text-center text-[11px] leading-relaxed tracking-wide text-zinc-500"
            title="Say this over the phone"
            style={{ animationDelay: "120ms" }}
          >
            {speakJoinCode(code)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={handleCopyCode}
          disabled={!code}
          className={cn(
            "portal-press inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:opacity-45",
            copied === "code"
              ? "border-teal-500/40 bg-teal-500/10 text-teal-200"
              : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]",
          )}
          aria-label="Copy join code"
        >
          {copied === "code" ? (
            <IconCheck className="h-4 w-4" />
          ) : (
            <IconCopy className="h-4 w-4" />
          )}
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        {showQr && code && (
          <button
            type="button"
            onClick={handleCopyLink}
            className={cn(
              "portal-press inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]",
              copied === "link"
                ? "border-teal-500/40 bg-teal-500/10 text-teal-200"
                : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]",
            )}
            aria-label="Copy share link"
          >
            {copied === "link" ? (
              <IconCheck className="h-4 w-4" />
            ) : (
              <IconLink className="h-4 w-4" />
            )}
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
        )}
        {showPaste && (
          <button
            type="button"
            onClick={handlePasteDetect}
            className="portal-press inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
            aria-label="Paste join code from clipboard"
          >
            <IconPaste className="h-4 w-4" />
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
          <div className="rounded-2xl bg-white p-3.5 shadow-[0_20px_50px_-20px_rgba(124,58,237,0.45)] ring-1 ring-white/20">
            <QRCodeSVG
              value={qrPayload}
              size={172}
              level="M"
              includeMargin={false}
              bgColor="#FFFFFF"
              fgColor="#0B0B0C"
              title={`QR code for join code ${display}`}
            />
          </div>
          <p className="max-w-xs text-center text-xs leading-relaxed text-zinc-500">
            Scan with another phone or Wormhole — or open the deep link on that device.
          </p>
        </div>
      )}
    </div>
  );
}
