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
        "rounded-xl border border-[#7C3AED]/40 bg-zinc-900/80 px-4 py-3 space-y-3",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {status === "syncing" ? (
          <Loader2 className="h-4 w-4 text-amber-400 motion-safe:animate-spin" aria-hidden />
        ) : (
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              status === "connected" ? "bg-teal-400" : "bg-zinc-500",
            )}
            aria-hidden
          />
        )}
        <span className="text-sm font-medium text-white">{statusText}</span>
        {speedLabel && (
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400 ml-auto font-variant-numeric tabular-nums">
            <Zap className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden />
            {speedLabel}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-500 truncate" title={mountPath}>
        {mountPath}
      </p>

      {peerLabel && (
        <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <Radio className="h-3.5 w-3.5" aria-hidden />
          {peerLabel}
        </p>
      )}

      <Button
        type="button"
        onClick={onOpenFinder}
        className="w-full min-h-11 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
      >
        <ExternalLink className="w-4 h-4 mr-2" aria-hidden />
        Open in Finder / Explorer
      </Button>
    </div>
  );
}
