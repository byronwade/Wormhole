import { ExternalLink, Loader2, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MountStatusStripProps {
  mountPath: string;
  peerLabel?: string | null;
  speedLabel?: string | null;
  status?: "connected" | "syncing" | "idle";
  onOpenFinder: () => void;
  className?: string;
}

/**
 * Post-mount “it’s working” strip — speed, peer, Open in Finder.
 * Status via dot + label only — no left accent bars.
 */
export function MountStatusStrip({
  mountPath,
  peerLabel,
  speedLabel,
  status = "connected",
  onOpenFinder,
  className,
}: MountStatusStripProps) {
  const statusText =
    status === "syncing" ? "Syncing…" : status === "idle" ? "Mounted" : "Live";

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5">
        {status === "syncing" ? (
          <Loader2 className="h-4 w-4 text-amber-400 motion-safe:animate-spin" aria-hidden />
        ) : (
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status === "connected" ? "bg-teal-400" : "bg-zinc-500",
            )}
            aria-hidden
          />
        )}
        <span className="text-sm font-medium text-[#FAFAFA]">{statusText}</span>
        {speedLabel && (
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono-brand text-xs text-zinc-400 tabular-nums">
            <Zap className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden />
            {speedLabel}
          </span>
        )}
      </div>

      <p className="truncate font-mono-brand text-xs text-zinc-500" title={mountPath}>
        {mountPath}
      </p>

      {peerLabel && (
        <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <Radio className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          {peerLabel}
        </p>
      )}

      <Button
        type="button"
        onClick={onOpenFinder}
        className="min-h-11 w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
      >
        <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
        Open in Finder / Explorer
      </Button>
    </div>
  );
}
