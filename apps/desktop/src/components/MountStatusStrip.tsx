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
 * Compact live-mount status bar — speed, peer, Open in Finder.
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
    status === "syncing" ? "Syncing" : status === "idle" ? "Mounted" : "Live";

  return (
    <div
      className={cn(
        "portal-instrument flex w-full flex-col gap-3 rounded-xl px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2">
            {status === "syncing" ? (
              <IconSpinner className="h-3.5 w-3.5 text-amber-300" />
            ) : (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  status === "connected" ? "bg-teal-400" : "bg-zinc-500",
                )}
                aria-hidden
              />
            )}
            <span className="text-sm font-medium text-[#FAFAFA]">{statusText}</span>
          </span>

          {speedLabel && (
            <span className="inline-flex items-center gap-1 font-mono-brand text-xs text-zinc-400 tabular-nums">
              <IconSpeed className="h-3.5 w-3.5" />
              {speedLabel}
            </span>
          )}

          {peerLabel && (
            <span className="inline-flex items-center gap-1 text-sm text-zinc-400">
              <IconNearby className="h-3.5 w-3.5" />
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
        className="portal-press portal-cta-primary min-h-9 w-full shrink-0 text-sm text-white sm:w-auto sm:px-4"
      >
        <IconOpen className="mr-1.5 h-4 w-4" />
        Open in Finder
      </Button>
    </div>
  );
}
