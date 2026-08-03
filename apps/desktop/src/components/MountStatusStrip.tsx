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
 * Live tunnel instrument — speed, peer, Open in Finder.
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
        "portal-instrument flex w-full flex-col gap-5 rounded-3xl px-6 py-5 sm:flex-row sm:items-center sm:gap-8 sm:px-7 sm:py-6",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative z-10 min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2">
            {status === "syncing" ? (
              <IconSpinner className="h-4 w-4 text-amber-300" />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  status === "connected"
                    ? "bg-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.65)]"
                    : "bg-zinc-500",
                )}
                aria-hidden
              />
            )}
            <span className="text-sm font-medium tracking-tight text-[#FAFAFA]">
              {statusText}
            </span>
          </span>

          {speedLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 font-mono-brand text-xs text-[#E9D5FF] tabular-nums">
              <IconSpeed className="h-3.5 w-3.5 text-[#A78BFA]" />
              {speedLabel}
            </span>
          )}

          {peerLabel && (
            <span className="inline-flex items-center gap-1.5 text-sm text-zinc-300">
              <IconNearby className="h-3.5 w-3.5 text-teal-400/80" />
              {peerLabel}
            </span>
          )}
        </div>
        <p
          className="truncate font-mono-brand text-xs tracking-wide text-zinc-500"
          title={mountPath}
        >
          {mountPath}
        </p>
      </div>

      <Button
        type="button"
        onClick={onOpenFinder}
        className="portal-press portal-cta-primary relative z-10 min-h-12 w-full shrink-0 text-white sm:w-auto sm:px-7"
      >
        <IconOpen className="mr-2 h-4 w-4" />
        Open in Finder / Explorer
      </Button>
    </div>
  );
}
