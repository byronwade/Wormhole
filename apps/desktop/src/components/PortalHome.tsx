import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MountStatusStrip } from "@/components/MountStatusStrip";
import {
  IconConnect,
  IconMount,
  IconNearby,
  IconOpen,
  IconSettings,
  IconShare,
  IconSpeed,
  IconSpinner,
} from "@/components/icons";
import {
  filterFreshPeers,
  peerFreshnessLabel,
  type NearbyPeer,
  type PortalSession,
} from "@/types/portal";
import { cn } from "@/lib/utils";

interface PortalHomeProps {
  deviceName: string;
  sessions: PortalSession[];
  nearby: NearbyPeer[];
  globalSpeed?: string | null;
  onShare: () => void;
  onConnect: () => void;
  onOpenSettings: () => void;
  onQuickMount: (code: string, peerName?: string) => void;
  onOpenFinder: (path: string) => void;
  onStopShare: (id: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  onFolderDropped?: (path: string) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Portal home — tunnels and nearby peers; Finder stays the file browser.
 */
export function PortalHome({
  deviceName,
  sessions,
  nearby,
  globalSpeed,
  onShare,
  onConnect,
  onOpenSettings,
  onQuickMount,
  onOpenFinder,
  onStopShare,
  onDisconnect,
  onReconnect,
  onFolderDropped,
}: PortalHomeProps) {
  const [now, setNow] = useState(() => Date.now());
  const [mountingId, setMountingId] = useState<string | null>(null);
  const [draggingFolder, setDraggingFolder] = useState(false);
  const [, startTransition] = useTransition();
  const dragDepth = useRef(0);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 4000);
    return () => window.clearInterval(t);
  }, []);

  const takeDroppedPath = (files: FileList | null): string | null => {
    if (!files?.length) return null;
    const file = files[0] as File & { path?: string };
    if (file?.path) return file.path;
    return null;
  };

  const live = sessions.filter((s) => s.status === "live" || s.status === "connecting");
  const others = sessions.filter((s) => s.status !== "live" && s.status !== "connecting");
  const liveMount = live.find((s) => s.kind === "mounted" && s.status === "live");
  const remotePeers = filterFreshPeers(nearby, 45_000, now).filter((p) => !p.is_self && p.join_code);
  const empty = sessions.length === 0;
  const showPrimaryCtas = !liveMount;
  const compact = live.length >= 3;

  const handleQuickMount = (code: string, peerId: string, peerName?: string) => {
    setMountingId(peerId);
    startTransition(() => {
      onQuickMount(code, peerName);
    });
    window.setTimeout(() => setMountingId(null), 2400);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        if (dragDepth.current === 1) setDraggingFolder(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDraggingFolder(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDraggingFolder(false);
        const path = takeDroppedPath(e.dataTransfer.files);
        if (path && onFolderDropped) onFolderDropped(path);
      }}
    >
      {draggingFolder && (
        <div
          className="portal-drop-magnet pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center gap-2 rounded-xl"
          aria-hidden
        >
          <IconShare className="h-7 w-7 text-[#A78BFA]" />
          <p className="text-sm font-medium text-zinc-100">Drop folder to share</p>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 px-5 pb-5 pt-5 md:px-8">
          <div className="min-w-0 flex-1">
            <p className="portal-label mb-1">
              {deviceName}
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#FAFAFA]">
              Portal
            </h1>
            <p className="mt-1 max-w-md text-sm text-zinc-500">
              {liveMount
                ? "Files are open in Finder. Keep this connected."
                : "Share a folder or enter a code. Files open in Finder."}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {showPrimaryCtas && (
              <>
                <Button
                  onClick={onShare}
                  className="portal-press portal-cta-primary min-h-10 px-4 text-white"
                >
                  <IconShare className="mr-1.5 h-4 w-4" />
                  Share
                </Button>
                <Button
                  onClick={onConnect}
                  variant="outline"
                  className="portal-press min-h-10 border-white/10 bg-transparent px-4 text-zinc-200 hover:bg-white/[0.04]"
                >
                  <IconConnect className="mr-1.5 h-4 w-4" />
                  Enter code
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="portal-press h-10 w-10 text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
              aria-label="Settings"
              title="Settings"
            >
              <IconSettings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div
          className={cn(
            "flex flex-1 flex-col px-5 md:px-8",
            compact ? "gap-4 pb-5" : "gap-6 pb-8",
          )}
        >
          {liveMount && (
            <MountStatusStrip
              mountPath={liveMount.path}
              peerLabel={liveMount.peerName || liveMount.joinCode}
              speedLabel={liveMount.speedLabel || globalSpeed}
              status={liveMount.speedLabel ? "syncing" : "connected"}
              onOpenFinder={() => onOpenFinder(liveMount.path)}
            />
          )}

          <div
            className={cn(
              "grid w-full flex-1 grid-cols-1 lg:grid-cols-2",
              compact ? "gap-5" : "gap-6 lg:gap-8",
            )}
          >
            <section className="min-w-0" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="portal-label mb-2.5 flex items-center gap-1.5">
                <IconNearby className="h-3.5 w-3.5 text-zinc-500" />
                Nearby
              </h2>
              {remotePeers.length === 0 ? (
                <div className="portal-surface-quiet rounded-xl px-4 py-5">
                  <p className="text-sm text-zinc-400">No one nearby yet</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Peers on this Wi‑Fi appear here for one-tap Mount.
                  </p>
                </div>
              ) : (
                <ul className="portal-surface divide-y divide-white/[0.05] overflow-hidden rounded-xl">
                  {remotePeers.map((peer) => (
                    <li
                      key={peer.id}
                      className="portal-row flex items-center gap-3 px-3.5 py-3 sm:px-4"
                    >
                      <span
                        className="portal-avatar portal-avatar-live h-8 w-8 flex-shrink-0 text-[11px]"
                        aria-hidden
                      >
                        {initials(peer.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#FAFAFA]">
                          {peer.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                          <span className="font-mono-brand text-zinc-400">{peer.join_code}</span>
                          <span className="text-zinc-700" aria-hidden>
                            ·
                          </span>
                          <span>{peerFreshnessLabel(peer.last_seen_ms, now)}</span>
                        </p>
                      </div>
                      {peer.join_code && (
                        <Button
                          size="sm"
                          disabled={mountingId === peer.id}
                          className="portal-press portal-cta-primary min-h-9 px-3 text-white disabled:opacity-70"
                          onClick={() => handleQuickMount(peer.join_code!, peer.id, peer.name)}
                          aria-busy={mountingId === peer.id}
                        >
                          {mountingId === peer.id ? (
                            <IconSpinner className="mr-1.5 h-3.5 w-3.5" />
                          ) : (
                            <IconMount className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {mountingId === peer.id ? "Opening…" : "Mount"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="min-w-0" aria-labelledby="sessions-heading">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 id="sessions-heading" className="portal-label">
                  Tunnels
                </h2>
                {globalSpeed && (
                  <span className="inline-flex items-center gap-1.5 font-mono-brand text-xs text-zinc-500 tabular-nums">
                    <IconSpeed className="h-3.5 w-3.5" />
                    {globalSpeed}
                  </span>
                )}
              </div>

              {empty ? (
                <div className="portal-surface-quiet rounded-xl px-4 py-6">
                  <p className="text-sm font-medium text-zinc-300">No tunnels yet</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
                    Share a folder or enter a code. Wormhole stays in the menu bar when you close this window.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      onClick={onShare}
                      size="sm"
                      className="portal-press portal-cta-primary min-h-9 px-3 text-white"
                    >
                      <IconShare className="mr-1.5 h-3.5 w-3.5" />
                      Share
                    </Button>
                    <Button
                      onClick={onConnect}
                      size="sm"
                      variant="outline"
                      className="portal-press min-h-9 border-white/10 bg-transparent px-3 text-zinc-300"
                    >
                      Enter code
                    </Button>
                  </div>
                </div>
              ) : (
                <ul className="portal-surface divide-y divide-white/[0.05] overflow-hidden rounded-xl">
                  {[...live, ...others].map((session, i) => (
                    <SessionRow
                      key={`${session.kind}-${session.id}`}
                      session={session}
                      index={i}
                      compact={compact}
                      emphasizeOpen={session.id === liveMount?.id}
                      onOpenFinder={() => onOpenFinder(session.path)}
                      onStop={() =>
                        session.kind === "sharing"
                          ? onStopShare(session.id)
                          : onDisconnect(session.id)
                      }
                      onReconnect={() => onReconnect(session.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          {liveMount && (
            <div className="flex flex-wrap gap-1 border-t border-white/[0.05] pt-5">
              <Button
                onClick={onShare}
                variant="ghost"
                size="sm"
                className="portal-press min-h-9 text-zinc-500 hover:text-zinc-200"
              >
                <IconShare className="mr-1.5 h-3.5 w-3.5" />
                Share another…
              </Button>
              <Button
                onClick={onConnect}
                variant="ghost"
                size="sm"
                className="portal-press min-h-9 text-zinc-500 hover:text-zinc-200"
              >
                <IconConnect className="mr-1.5 h-3.5 w-3.5" />
                Enter a code…
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusDotClass(status: PortalSession["status"]): string {
  switch (status) {
    case "live":
      return "bg-teal-400";
    case "connecting":
      return "bg-amber-400";
    case "error":
      return "bg-red-400";
    default:
      return "bg-zinc-600";
  }
}

function SessionRow({
  session,
  index,
  compact,
  emphasizeOpen,
  onOpenFinder,
  onStop,
  onReconnect,
}: {
  session: PortalSession;
  index: number;
  compact: boolean;
  emphasizeOpen: boolean;
  onOpenFinder: () => void;
  onStop: () => void;
  onReconnect: () => void;
}) {
  const isLive = session.status === "live" || session.status === "connecting";
  const modeLabel =
    session.kind === "sharing"
      ? session.shareMode === "drop"
        ? "Drop"
        : "Sharing"
      : "Mounted";

  void index;

  return (
    <li
      className={cn(
        "portal-row flex items-center gap-3 sm:px-4",
        compact ? "px-3 py-2" : "px-3.5 py-2.5",
      )}
    >
      {session.kind === "mounted" ? (
        <span
          className={cn(
            "portal-avatar h-8 w-8 flex-shrink-0 text-[11px]",
            session.status === "live" && "portal-avatar-live",
          )}
          aria-hidden
        >
          {initials(session.title)}
        </span>
      ) : (
        <span
          className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", statusDotClass(session.status))}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-medium text-[#FAFAFA]">{session.title}</p>
          <span className="text-[11px] text-zinc-500">{modeLabel}</span>
          {session.speedLabel && (
            <span className="inline-flex items-center gap-1 font-mono-brand text-xs text-zinc-400 tabular-nums">
              <IconSpeed className="h-3.5 w-3.5" />
              {session.speedLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{session.subtitle}</p>
        {session.joinCode && (
          <p className="font-mono-brand mt-0.5 text-xs text-zinc-600">{session.joinCode}</p>
        )}
        {(session.errorMessage || session.status === "connecting") && (
          <p
            className={cn(
              "mt-1 text-xs",
              session.status === "error" ? "text-red-400" : "text-amber-400/90",
            )}
          >
            {session.errorMessage ||
              (session.status === "connecting" ? "Reconnecting…" : null)}
          </p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-0.5">
        {isLive && session.kind === "mounted" && (
          <Button
            size={emphasizeOpen ? "sm" : "icon"}
            className={cn(
              "portal-press min-h-9",
              emphasizeOpen
                ? "portal-cta-primary px-3 text-white"
                : "bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
            aria-label="Open in Finder"
            onClick={onOpenFinder}
          >
            {emphasizeOpen ? (
              <>
                <IconOpen className="mr-1.5 h-3.5 w-3.5" />
                Open
              </>
            ) : (
              <IconOpen className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        {isLive && session.kind === "sharing" && (
          <Button
            variant="ghost"
            size="icon"
            className="portal-press h-9 w-9 text-zinc-400 hover:text-white"
            aria-label="Reveal shared folder"
            onClick={onOpenFinder}
          >
            <IconOpen className="h-3.5 w-3.5" />
          </Button>
        )}
        {isLive ? (
          <Button
            variant="ghost"
            size="sm"
            className="portal-press min-h-9 text-zinc-500 hover:text-red-300"
            onClick={onStop}
          >
            Stop
          </Button>
        ) : session.kind === "mounted" ? (
          <Button
            variant="ghost"
            size="sm"
            className="portal-press min-h-9"
            onClick={onReconnect}
          >
            Reconnect
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export default PortalHome;
