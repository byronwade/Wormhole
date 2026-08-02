import { Button } from "@/components/ui/button";
import { IconNearby, IconOpen, IconSpeed, IconSpinner } from "@/components/icons";
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
        "flex w-full flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {status === "syncing" ? (
            <IconSpinner className="h-4 w-4 text-amber-400" />
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
            <span className="inline-flex items-center gap-1.5 font-mono-brand text-xs text-zinc-400 tabular-nums">
              <IconSpeed className="h-3.5 w-3.5 text-[#7C3AED]" />
              {speedLabel}
            </span>
          )}
          {peerLabel && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <IconNearby className="h-3.5 w-3.5 text-zinc-500" />
              {peerLabel}
            </span>
          )}
        </div>
        <p className="truncate font-mono-brand text-xs text-zinc-500" title={mountPath}>
          {mountPath}
        </p>
      </div>

      <Button
        type="button"
        onClick={onOpenFinder}
        className="portal-press min-h-11 w-full shrink-0 bg-[#7C3AED] text-white transition-colors duration-200 hover:bg-[#6D28D9] sm:w-auto sm:px-6"
      >
        <IconOpen className="mr-2 h-4 w-4" />
        Open in Finder / Explorer
      </Button>
    </div>
  );
}
