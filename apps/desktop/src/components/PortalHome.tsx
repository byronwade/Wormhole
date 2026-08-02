import { Download, ExternalLink, Radio, Share2, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MountStatusStrip } from "@/components/MountStatusStrip";
import type { NearbyPeer, PortalSession } from "@/types/portal";
import { cn } from "@/lib/utils";

interface PortalHomeProps {
  deviceName: string;
  sessions: PortalSession[];
  nearby: NearbyPeer[];
  globalSpeed?: string | null;
  onShare: () => void;
  onConnect: () => void;
  onConnectWithCode: (code: string, peerName?: string) => void;
  onOpenFinder: (path: string) => void;
  onStopShare: (id: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
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
  onConnectWithCode,
  onOpenFinder,
  onStopShare,
  onDisconnect,
  onReconnect,
}: PortalHomeProps) {
  const live = sessions.filter((s) => s.status === "live" || s.status === "connecting");
  const others = sessions.filter((s) => s.status !== "live" && s.status !== "connecting");
  const remotePeers = nearby.filter((p) => !p.is_self && p.join_code);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 20% -10%, rgba(124,58,237,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(20,184,166,0.07), transparent 50%), #0F0F0F",
        }}
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <header className="max-w-2xl mb-8">
          <p className="font-mono text-xs tracking-[0.35em] uppercase text-[#7C3AED] mb-3">
            Wormhole · {deviceName}
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#FAFAFA] mb-2">
            Portal
          </h1>
          <p className="text-zinc-400 text-base max-w-lg">
            Share a folder or enter a code. Files open in Finder — this window just runs the tunnel.
          </p>
        </header>

        <div className="flex flex-wrap gap-3 mb-8">
          <Button
            onClick={onShare}
            className="min-h-12 px-6 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
          >
            <Upload className="w-4 h-4 mr-2" aria-hidden />
            Share a folder
          </Button>
          <Button
            onClick={onConnect}
            variant="outline"
            className="min-h-12 px-6 border-zinc-600 hover:border-[#7C3AED]/50 text-zinc-100"
          >
            <Download className="w-4 h-4 mr-2" aria-hidden />
            Enter a code
          </Button>
          {globalSpeed && (
            <span className="inline-flex items-center gap-1.5 text-sm text-zinc-400 ml-auto font-variant-numeric tabular-nums">
              <Zap className="w-4 h-4 text-[#7C3AED]" aria-hidden />
              {globalSpeed}
            </span>
          )}
        </div>

        {live[0]?.kind === "mounted" && live[0].status === "live" && (
          <div className="max-w-xl mb-8">
            <MountStatusStrip
              mountPath={live[0].path}
              peerLabel={live[0].peerName || live[0].joinCode}
              speedLabel={live[0].speedLabel || globalSpeed}
              status="connected"
              onOpenFinder={() => onOpenFinder(live[0].path)}
            />
          </div>
        )}

        {remotePeers.length > 0 && (
          <section className="mb-10 max-w-2xl" aria-labelledby="nearby-heading">
            <h2 id="nearby-heading" className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <Radio className="w-4 h-4 text-teal-400" aria-hidden />
              Nearby on this Wi‑Fi
            </h2>
            <ul className="space-y-2">
              {remotePeers.map((peer) => (
                <li
                  key={peer.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{peer.name}</p>
                    {peer.join_code && (
                      <p className="text-xs font-mono text-[#A78BFA]">{peer.join_code}</p>
                    )}
                  </div>
                  {peer.join_code && (
                    <Button
                      size="sm"
                      className="min-h-10 bg-[#7C3AED] hover:bg-[#6D28D9]"
                      onClick={() => onConnectWithCode(peer.join_code!, peer.name)}
                    >
                      Mount
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="max-w-2xl" aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#7C3AED]" aria-hidden />
            Sessions
          </h2>

          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
              <p className="text-zinc-400 mb-1">No active tunnels</p>
              <p className="text-xs text-zinc-600">
                Tip: use the menu-bar icon to share or enter a code without opening this window first.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {[...live, ...others].map((session) => (
                <SessionRow
                  key={`${session.kind}-${session.id}`}
                  session={session}
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
    </div>
  );
}

function SessionRow({
  session,
  onOpenFinder,
  onStop,
  onReconnect,
}: {
  session: PortalSession;
  onOpenFinder: () => void;
  onStop: () => void;
  onReconnect: () => void;
}) {
  const isLive = session.status === "live" || session.status === "connecting";

  return (
    <li
      className={cn(
        "rounded-xl border px-4 py-3 flex items-center gap-3",
        isLive ? "border-[#7C3AED]/35 bg-zinc-900/80" : "border-zinc-800 bg-zinc-900/40",
      )}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full flex-shrink-0",
          session.status === "live" && "bg-teal-400",
          session.status === "connecting" && "bg-amber-400 motion-safe:animate-pulse",
          session.status === "error" && "bg-red-400",
          (session.status === "idle" || session.status === "expired") && "bg-zinc-600",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-white truncate">{session.title}</p>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {session.kind === "sharing"
              ? session.shareMode === "drop"
                ? "Drop"
                : "Sharing"
              : "Mounted"}
          </span>
          {session.speedLabel && (
            <span className="text-xs text-zinc-400 font-variant-numeric tabular-nums">
              {session.speedLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate">{session.subtitle}</p>
        {session.joinCode && (
          <p className="text-xs font-mono text-[#A78BFA] mt-0.5">{session.joinCode}</p>
        )}
        {session.errorMessage && (
          <p className="text-xs text-red-400 mt-0.5">{session.errorMessage}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isLive && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Open in Finder"
            onClick={onOpenFinder}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        )}
        {isLive ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300 min-h-10"
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
