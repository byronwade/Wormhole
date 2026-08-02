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
  /** One-tap mount from Nearby (no code dialog). */
  onQuickMount: (code: string, peerName?: string) => void;
  onOpenFinder: (path: string) => void;
  onStopShare: (id: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  /** Drop a folder anywhere on Portal → share. */
  onFolderDropped?: (path: string) => void;
}

/**
 * Session-first Portal — Finder is the file browser; this is the tunnel controller.
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
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 0% 0%, rgba(124,58,237,0.2), transparent 50%), radial-gradient(ellipse 45% 30% at 100% 100%, rgba(167,139,250,0.05), transparent 40%), #0F0F0F",
        }}
      />
      <div className="portal-grain pointer-events-none absolute inset-0 opacity-35" aria-hidden />

      {draggingFolder && (
        <div
          className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#7C3AED]/70 bg-[#7C3AED]/10 backdrop-blur-sm"
          aria-hidden
        >
          <p className="font-display text-lg font-medium text-[#FAFAFA]">Drop folder to share</p>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-white/[0.06] px-6 py-8 md:px-10">
          <div className="min-w-0 flex-1">
            <p className="font-mono-brand mb-3 text-[11px] uppercase tracking-[0.4em] text-[#A78BFA]/90">
              Wormhole · {deviceName}
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[#FAFAFA] sm:text-5xl">
              Portal
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-400">
              {liveMount
                ? "Files are live in Finder. This window just keeps the tunnel open."
                : "Share a folder or enter a code. Files open in Finder — this is the tunnel."}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            {showPrimaryCtas && (
              <>
                <Button
                  onClick={onShare}
                  className="portal-press min-h-12 px-7 bg-[#7C3AED] text-white shadow-[0_0_40px_rgba(124,58,237,0.18)] transition-colors duration-200 hover:bg-[#6D28D9]"
                >
                  <IconShare className="mr-2 h-[1.125rem] w-[1.125rem]" />
                  Share a folder
                </Button>
                <Button
                  onClick={onConnect}
                  variant="outline"
                  className="portal-press min-h-12 border-white/10 bg-white/[0.02] px-7 text-zinc-100 transition-colors duration-200 hover:border-[#7C3AED]/40 hover:bg-white/[0.04]"
                >
                  <IconConnect className="mr-2 h-[1.125rem] w-[1.125rem]" />
                  Enter a code
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="portal-press h-12 w-12 text-zinc-500 transition-colors duration-200 hover:bg-white/[0.04] hover:text-[#A78BFA]"
              aria-label="Settings"
              title="Settings"
            >
              <IconSettings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-8 px-6 py-8 md:px-10">
          {liveMount && (
            <div className="motion-peer-in w-full">
              <MountStatusStrip
                mountPath={liveMount.path}
                peerLabel={liveMount.peerName || liveMount.joinCode}
                speedLabel={liveMount.speedLabel || globalSpeed}
                status={liveMount.speedLabel ? "syncing" : "connected"}
                onOpenFinder={() => onOpenFinder(liveMount.path)}
              />
            </div>
          )}

          <div className="grid w-full flex-1 grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
            <section className="min-w-0" aria-labelledby="nearby-heading">
              <h2
                id="nearby-heading"
                className="mb-4 flex items-center gap-2 font-mono-brand text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500"
              >
                <IconNearby className="h-4 w-4 text-teal-400/90" />
                Nearby on this Wi‑Fi
              </h2>
              {remotePeers.length === 0 ? (
                <p className="text-sm text-zinc-600">No peers on this network yet.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  {remotePeers.map((peer, i) => (
                    <li
                      key={peer.id}
                      className="portal-row motion-peer-in flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <span
                        className="motion-status-pulse h-2 w-2 flex-shrink-0 rounded-full bg-teal-400"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#FAFAFA]">{peer.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span className="font-mono-brand text-[#A78BFA]">{peer.join_code}</span>
                          <span aria-hidden>·</span>
                          <span>{peerFreshnessLabel(peer.last_seen_ms, now)}</span>
                        </p>
                      </div>
                      {peer.join_code && (
                        <Button
                          size="sm"
                          disabled={mountingId === peer.id}
                          className="portal-press min-h-10 bg-[#7C3AED] px-4 transition-all duration-200 hover:bg-[#6D28D9] disabled:opacity-70"
                          onClick={() => handleQuickMount(peer.join_code!, peer.id, peer.name)}
                          aria-busy={mountingId === peer.id}
                        >
                          {mountingId === peer.id ? (
                            <IconSpinner className="mr-1.5 h-4 w-4" />
                          ) : (
                            <IconMount className="mr-1.5 h-4 w-4" />
                          )}
                          {mountingId === peer.id ? "Mounting…" : "Mount"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="min-w-0" aria-labelledby="sessions-heading">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2
                  id="sessions-heading"
                  className="font-mono-brand text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500"
                >
                  Tunnels
                </h2>
                {globalSpeed && (
                  <span className="inline-flex items-center gap-1.5 font-mono-brand text-xs text-zinc-400 tabular-nums">
                    <IconSpeed className="h-4 w-4 text-[#7C3AED]" />
                    {globalSpeed}
                  </span>
                )}
              </div>

              {empty ? (
                <div className="rounded-2xl border border-dashed border-white/[0.06] px-5 py-10">
                  <IconNearby className="mb-3 h-7 w-7 text-zinc-700" />
                  <p className="text-sm text-zinc-400">No active tunnels</p>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-600">
                    Tip: use the menu-bar icon to share or enter a code without opening this window.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  {[...live, ...others].map((session, i) => (
                    <SessionRow
                      key={`${session.kind}-${session.id}`}
                      session={session}
                      index={i}
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
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-6">
              <Button
                onClick={onShare}
                variant="ghost"
                size="sm"
                className="portal-press min-h-10 text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <IconShare className="mr-1.5 h-4 w-4" />
                Share another…
              </Button>
              <Button
                onClick={onConnect}
                variant="ghost"
                size="sm"
                className="portal-press min-h-10 text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <IconConnect className="mr-1.5 h-4 w-4" />
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
      return "bg-amber-400 motion-status-pulse";
    case "error":
      return "bg-red-400";
    default:
      return "bg-zinc-600";
  }
}

function SessionRow({
  session,
  index,
  emphasizeOpen,
  onOpenFinder,
  onStop,
  onReconnect,
}: {
  session: PortalSession;
  index: number;
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

  return (
    <li
      className="portal-row motion-peer-in flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span
        className={cn("h-2 w-2 flex-shrink-0 rounded-full", statusDotClass(session.status))}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-medium text-[#FAFAFA]">{session.title}</p>
          <span className="font-mono-brand text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            {modeLabel}
          </span>
          {session.speedLabel && (
            <span className="inline-flex items-center gap-1 font-mono-brand text-xs text-[#A78BFA] tabular-nums">
              <IconSpeed className="h-3.5 w-3.5" />
              {session.speedLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{session.subtitle}</p>
        {session.joinCode && (
          <p className="font-mono-brand mt-1 text-xs text-zinc-600">{session.joinCode}</p>
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
      <div className="flex flex-shrink-0 items-center gap-1">
        {isLive && session.kind === "mounted" && (
          <Button
            size={emphasizeOpen ? "sm" : "icon"}
            className={cn(
              "portal-press min-h-10 transition-colors duration-200",
              emphasizeOpen
                ? "bg-[#7C3AED] px-3 hover:bg-[#6D28D9]"
                : "bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
            aria-label="Open in Finder"
            onClick={onOpenFinder}
          >
            {emphasizeOpen ? (
              <>
                <IconOpen className="mr-1.5 h-4 w-4" />
                Open
              </>
            ) : (
              <IconOpen className="h-4 w-4" />
            )}
          </Button>
        )}
        {isLive && session.kind === "sharing" && (
          <Button
            variant="ghost"
            size="icon"
            className="portal-press h-10 w-10 text-zinc-400 transition-colors hover:text-white"
            aria-label="Reveal shared folder"
            onClick={onOpenFinder}
          >
            <IconOpen className="h-4 w-4" />
          </Button>
        )}
        {isLive ? (
          <Button
            variant="ghost"
            size="sm"
            className="portal-press min-h-10 text-zinc-500 transition-colors hover:text-red-300"
            onClick={onStop}
          >
            Stop
          </Button>
        ) : session.kind === "mounted" ? (
          <Button
            variant="ghost"
            size="sm"
            className="portal-press min-h-10 transition-colors"
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
