import { useEffect, useState } from "react";
import { Download, ExternalLink, Radio, Settings, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MountStatusStrip } from "@/components/MountStatusStrip";
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
}

/**
 * Session-first Portal — Finder is the file browser; this is the tunnel controller.
 * Full-width layout — content spans the main pane.
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
}: PortalHomeProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 4000);
    return () => window.clearInterval(t);
  }, []);

  const live = sessions.filter((s) => s.status === "live" || s.status === "connecting");
  const others = sessions.filter((s) => s.status !== "live" && s.status !== "connecting");
  const liveMount = live.find((s) => s.kind === "mounted" && s.status === "live");
  const remotePeers = filterFreshPeers(nearby, 45_000, now).filter((p) => !p.is_self && p.join_code);
  const empty = sessions.length === 0;
  const showPrimaryCtas = !liveMount;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 0% 0%, rgba(124,58,237,0.2), transparent 50%), radial-gradient(ellipse 45% 30% at 100% 100%, rgba(167,139,250,0.05), transparent 40%), #0F0F0F",
        }}
      />
      <div className="portal-grain pointer-events-none absolute inset-0 opacity-35" aria-hidden />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Full-width header bar */}
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
                  className="min-h-12 px-7 bg-[#7C3AED] text-white shadow-[0_0_40px_rgba(124,58,237,0.18)] hover:bg-[#6D28D9]"
                >
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                  Share a folder
                </Button>
                <Button
                  onClick={onConnect}
                  variant="outline"
                  className="min-h-12 border-white/10 bg-white/[0.02] px-7 text-zinc-100 hover:border-[#7C3AED]/40 hover:bg-white/[0.04]"
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden />
                  Enter a code
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-12 w-12 text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" aria-hidden />
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

          {/* Full-width two-column on desktop */}
          <div className="grid w-full flex-1 grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
            <section className="min-w-0" aria-labelledby="nearby-heading">
              <h2
                id="nearby-heading"
                className="mb-4 flex items-center gap-2 font-mono-brand text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500"
              >
                <Radio className="h-3.5 w-3.5 text-teal-400/90" aria-hidden />
                Nearby on this Wi‑Fi
              </h2>
              {remotePeers.length === 0 ? (
                <p className="text-sm text-zinc-600">No peers on this network yet.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  {remotePeers.map((peer, i) => (
                    <li
                      key={peer.id}
                      className="motion-peer-in flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
                      style={{ animationDelay: `${i * 50}ms` }}
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
                          className="min-h-10 bg-[#7C3AED] px-4 hover:bg-[#6D28D9]"
                          onClick={() => onQuickMount(peer.join_code!, peer.name)}
                        >
                          Mount
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
                    <Zap className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden />
                    {globalSpeed}
                  </span>
                )}
              </div>

              {empty ? (
                <div className="rounded-2xl border border-dashed border-white/[0.06] px-5 py-10">
                  <p className="text-sm text-zinc-400">No active tunnels</p>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-600">
                    Tip: use the menu-bar icon to share or enter a code without opening this window.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02]">
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
                className="min-h-10 text-zinc-500 hover:text-zinc-200"
              >
                Share another…
              </Button>
              <Button
                onClick={onConnect}
                variant="ghost"
                size="sm"
                className="min-h-10 text-zinc-500 hover:text-zinc-200"
              >
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
      className="motion-peer-in flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
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
            <span className="font-mono-brand text-xs text-[#A78BFA] tabular-nums">
              {session.speedLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{session.subtitle}</p>
        {session.joinCode && (
          <p className="font-mono-brand mt-1 text-xs text-zinc-600">{session.joinCode}</p>
        )}
        {session.errorMessage && (
          <p className="mt-1 text-xs text-red-400">{session.errorMessage}</p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {isLive && session.kind === "mounted" && (
          <Button
            size={emphasizeOpen ? "sm" : "icon"}
            className={cn(
              "min-h-10",
              emphasizeOpen
                ? "bg-[#7C3AED] px-3 hover:bg-[#6D28D9]"
                : "bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
            aria-label="Open in Finder"
            onClick={onOpenFinder}
          >
            {emphasizeOpen ? (
              <>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Open
              </>
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
          </Button>
        )}
        {isLive && session.kind === "sharing" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-zinc-400"
            aria-label="Reveal shared folder"
            onClick={onOpenFinder}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        {isLive ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10 text-zinc-500 hover:text-red-300"
            onClick={onStop}
          >
            Stop
          </Button>
        ) : session.kind === "mounted" ? (
          <Button variant="ghost" size="sm" className="min-h-10" onClick={onReconnect}>
            Reconnect
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export default PortalHome;
