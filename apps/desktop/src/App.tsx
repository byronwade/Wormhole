import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import {
  Files,
  Upload,
  Download,
  Folder,
  FolderOpen,
  File,
  Settings,
  Search,
  ChevronRight,
  Clock,
  X,
  Check,
  Copy,
  Loader2,
  AlertCircle,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  Code,
  Star,
  Users,
  FolderUp,
  Share2,
  Trash2,
  Play,
  RefreshCw,
  ExternalLink,
  Eye,
  Timer,
  Link2,
  ChevronDown,
  IconBack,
  IconDrive,
  IconDrop,
} from "@/components/icons";
import { SetupWizard } from "@/components/SetupWizard";
import { PortalHome } from "@/components/PortalHome";
import { TransferPanel } from "@/components/TransferProgress";
import { JoinCodePanel } from "@/components/JoinCodePanel";
import { MountStatusStrip } from "@/components/MountStatusStrip";
import { ToastStack, type ToastMessage } from "@/components/Toast";
import { extractJoinCode, detectJoinCodeFromClipboard, formatJoinCode } from "@/lib/join-code";
import { resolveDefaultMountPath, folderDisplayName } from "@/lib/paths";
import { friendlyError } from "@/lib/friendly-error";
import { formatDeviceName } from "@/lib/device-name";
import { useWormholeHistory } from "@/hooks/useWormholeHistory";
import { useNearbyPeers } from "@/hooks/useNearbyPeers";
import { useSessionThroughput } from "@/hooks/useSessionThroughput";
import { useClipboardJoinOffer } from "@/hooks/useClipboardJoinOffer";
import { useAutoReconnect } from "@/hooks/useAutoReconnect";
import { sessionsFromHistory } from "@/types/portal";
import type { ShareMode } from "@/types/history";
import { writeClipboardText } from "@wormhole/shared";
import { useFileIndex, type IndexEntry } from "@/hooks/useFileIndex";
import { useRecentFiles } from "@/hooks/useRecentFiles";
import { useFavorites } from "@/hooks/useFavorites";
import { useProjects } from "@/hooks/useProjects";
import { useTransfers } from "@/hooks/useTransfers";
import { useTelemetry } from "@/hooks/useTelemetry";
import {
  TELEMETRY_COLLECTED_DATA,
  TELEMETRY_NEVER_COLLECTED,
} from "@/types/telemetry";
import type { Project } from "@/types/projects";
import type { ShareHistoryItem, ConnectionHistoryItem, ShareStatus, ConnectionStatus, ExpirationOption } from "@/types/history";
import { expirationToMs } from "@/types/history";

// Cross-platform path utilities
const pathSeparatorRegex = /[/\\]/;

function getFileName(path: string): string {
  // Handle both forward and backslashes for cross-platform compatibility
  const parts = path.split(pathSeparatorRegex).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function getParentPath(path: string, rootPath: string): string {
  // Normalize separators for comparison
  const parts = path.split(pathSeparatorRegex).filter(Boolean);
  if (parts.length <= 1) return rootPath;

  // Check if we're on Windows (path starts with drive letter)
  const isWindows = /^[a-zA-Z]:/.test(path);
  const separator = isWindows ? "\\" : "/";
  const prefix = isWindows ? "" : "/";

  parts.pop();
  const parent = prefix + parts.join(separator);

  // Don't go above root path
  if (parent.length < rootPath.length) return rootPath;
  return parent;
}

function joinPath(...parts: string[]): string {
  const isWindows = parts.some(p => /^[a-zA-Z]:/.test(p));
  const separator = isWindows ? "\\" : "/";
  return parts.filter(Boolean).join(separator);
}

function getRelativePath(fullPath: string, rootPath: string): string[] {
  // Remove root from path and split into parts
  const relative = fullPath.replace(rootPath, "");
  return relative.split(pathSeparatorRegex).filter(Boolean);
}

// shadcn components
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// Wormhole base URL for share links
const WORMHOLE_BASE_URL = "https://wormhole.byronwade.com";

type ViewMode = "list" | "grid";
type NavigationView =
  | "all-files"
  | "shared-with-me"
  | "my-shares"
  | "recent"
  | "favorites"
  | "settings";
type DialogType = "share" | "connect" | null;
type MediaFilter = "all" | "video" | "image" | "audio";

// Media file extensions for quick filters
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv", ".mpg", ".mpeg"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tiff", ".tif", ".ico", ".heic", ".heif"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".aiff", ".alac"]);

// Get media type from file name
function getMediaType(fileName: string): MediaFilter {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "all";
}

interface ServiceEvent {
  type: "HostStarted" | "ClientConnected" | "MountReady" | "Error";
  port?: number;
  share_path?: string;
  join_code?: string;
  peer_addr?: string;
  mountpoint?: string;
  message?: string;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified?: number;
}

// Helper to format file sizes - AGENTS.md: Non-breaking spaces between number and unit
function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)}\u00A0${units[i]}`;
}

// Helper to format dates
function formatDate(timestamp?: number): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

// Format relative time for history items (milliseconds)
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Format expiration countdown (returns time remaining or "Expired")
function formatExpirationCountdown(expiresAt: number | null): string | null {
  if (!expiresAt) return null; // Forever

  const now = Date.now();
  const diff = expiresAt - now;

  if (diff <= 0) return "Expired";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

// Helper to get file icon based on extension
function getFileIcon(name: string, isDir: boolean, className = "w-5 h-5") {
  if (isDir) return <Folder className={`${className} text-emerald-400`} />;

  const ext = name.split(".").pop()?.toLowerCase() || "";

  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "ico"].includes(ext)) {
    return <Image className={`${className} text-pink-400`} />;
  }
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return <Film className={`${className} text-emerald-400`} />;
  }
  if (["mp3", "wav", "flac", "aac", "m4a"].includes(ext)) {
    return <Music className={`${className} text-green-400`} />;
  }
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
    return <Archive className={`${className} text-amber-400`} />;
  }
  if (
    ["js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "cpp", "c", "h"].includes(ext)
  ) {
    return <Code className={`${className} text-cyan-400`} />;
  }
  if (["txt", "md", "json", "yaml", "yml", "xml", "html", "css"].includes(ext)) {
    return <FileText className={`${className} text-zinc-400`} />;
  }

  return <File className={`${className} text-zinc-500`} />;
}


// Status Badge Component
function StatusBadge({ status }: { status: ShareStatus | ConnectionStatus }) {
  const config: Record<string, { bg: string; text: string; label: string; pulse: boolean }> = {
    active: { bg: "bg-green-500/20", text: "text-green-400", label: "Active", pulse: true },
    connected: { bg: "bg-green-500/20", text: "text-green-400", label: "Connected", pulse: true },
    paused: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Paused", pulse: false },
    connecting: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Connecting", pulse: true },
    inactive: { bg: "bg-zinc-500/20", text: "text-zinc-400", label: "Inactive", pulse: false },
    disconnected: { bg: "bg-zinc-500/20", text: "text-zinc-400", label: "Disconnected", pulse: false },
    error: { bg: "bg-red-500/20", text: "text-red-400", label: "Error", pulse: false },
    expired: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Expired", pulse: false },
  };

  const c = config[status] || config.inactive;

  return (
    <Badge className={`${c.bg} ${c.text} border-transparent text-xs`}>
      {c.pulse && <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} animate-pulse mr-1.5`} />}
      {c.label}
    </Badge>
  );
}

// Share Card Component - Compact file-viewer style
function ShareCard({
  share,
  onResume,
  onStop,
  onDelete,
  onBrowse,
}: {
  share: ShareHistoryItem;
  onResume: () => void;
  onStop: () => void;
  onDelete: () => void;
  onBrowse: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = share.status === "active";
  const isExpired = share.status === "expired";
  const folderName = getFileName(share.path) || "Shared Folder";

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Update countdown every second for expiring shares
  useEffect(() => {
    if (!share.expiresAt || !isActive) {
      setCountdown(null);
      return;
    }

    const update = () => {
      setCountdown(formatExpirationCountdown(share.expiresAt));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [share.expiresAt, isActive]);

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(share.shareLink);
      setCopied(true);
      // Clear any existing timeout before setting a new one
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div
      className={`group rounded-lg transition-colors ${
        isActive ? "hover:bg-emerald-500/5" : isExpired ? "hover:bg-amber-500/5" : "hover:bg-zinc-800/30"
      }`}
    >
      {/* Main row - clickable to browse */}
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer"
        onClick={isActive ? onBrowse : undefined}
      >
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isActive ? "bg-emerald-500/20" : isExpired ? "bg-amber-500/20" : "bg-zinc-700/50"
        }`}>
          <FolderUp className={`w-4 h-4 ${isActive ? "text-emerald-400" : isExpired ? "text-amber-400" : "text-zinc-500"}`} />
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{folderName}</span>
            <StatusBadge status={share.status} />
            {/* Expiration countdown */}
            {countdown && isActive && (
              <Badge className="bg-amber-500/20 text-amber-400 border-transparent text-[10px] px-1.5 py-0">
                <Timer className="w-2.5 h-2.5 mr-1" />
                {countdown}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {share.port && <span>Port {share.port}</span>}
            {share.lastActiveAt && <span>{formatRelativeTime(share.lastActiveAt)}</span>}
          </div>
        </div>

        {/* Actions - Right side icons - AGENTS.md: aria-hidden on decorative icons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isActive ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onBrowse(); }}
                className="h-7 w-7 hover:bg-zinc-700"
                aria-label="Browse files"
              >
                <Folder className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onStop(); }}
                className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400"
                aria-label="Stop sharing"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onResume(); }}
                className="h-7 w-7 hover:bg-green-500/20 hover:text-green-400"
                aria-label="Resume sharing"
              >
                <Play className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400"
                aria-label="Remove from history"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Share Link Row - Always visible for active shares */}
      {isActive && share.shareLink && (
        <div className="flex items-center gap-2 px-3 pb-2 ml-11">
          <div
            onClick={copyLink}
            className="flex-1 flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-md cursor-pointer transition-colors group/link"
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <code className="text-xs text-emerald-300 truncate flex-1 font-mono">
              {share.shareLink}
            </code>
            <div className="flex items-center gap-1 text-xs">
              {copied ? (
                <span className="text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Copied!
                </span>
              ) : (
                <span className="text-zinc-500 group-hover/link:text-zinc-300 flex items-center gap-1">
                  <Copy className="w-3 h-3" />
                  Copy
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoized ShareCard for performance
const MemoizedShareCard = React.memo(ShareCard);

// Connection Card Component - Compact file-viewer style
function ConnectionCard({
  connection,
  onReconnect,
  onDisconnect,
  onRemove,
  onBrowse,
  onOpenFinder,
}: {
  connection: ConnectionHistoryItem;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onBrowse: () => void;
  onOpenFinder: () => void;
}) {
  const isConnected = connection.status === "connected";
  const isConnecting = connection.status === "connecting";
  const mountName = getFileName(connection.mountPoint) || "Remote Share";

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isConnected ? "hover:bg-teal-500/10" : "hover:bg-zinc-800/50"
      }`}
      onClick={isConnected ? onBrowse : undefined}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isConnected ? "bg-teal-500/20" : isConnecting ? "bg-[#7C3AED]/20" : "bg-zinc-700/50"
      }`}>
        {isConnecting ? (
          <Loader2 className="w-4 h-4 text-[#7C3AED] motion-safe:animate-spin" />
        ) : (
          <Download className={`w-4 h-4 ${isConnected ? "text-teal-400" : "text-zinc-500"}`} />
        )}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{mountName}</span>
          <StatusBadge status={connection.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {connection.joinCode && <code className="text-[#7C3AED] font-medium font-mono">{connection.joinCode}</code>}
          {isConnected && connection.mountPoint && <span className="truncate max-w-[200px]">{connection.mountPoint}</span>}
          {connection.lastConnectedAt && <span>{formatRelativeTime(connection.lastConnectedAt)}</span>}
        </div>
        {/* Error message inline */}
        {connection.status === "error" && connection.errorMessage && (
          <p className="text-xs text-red-400 truncate">{connection.errorMessage}</p>
        )}
      </div>

      {/* Actions - Right side icons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {isConnected ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onOpenFinder(); }}
              className="h-8 w-8 hover:bg-[#7C3AED]/20 hover:text-[#7C3AED]"
              aria-label="Open in Finder or Explorer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onBrowse(); }}
              className="h-8 w-8 hover:bg-zinc-700"
              aria-label="Browse files"
            >
              <Folder className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
              className="h-8 w-8 hover:bg-red-500/20 hover:text-red-400"
              aria-label="Disconnect"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : isConnecting ? (
          <Button
            variant="ghost"
            size="icon"
            disabled
            className="h-8 w-8"
            aria-label="Connecting…"
          >
            <Loader2 className="w-3.5 h-3.5 text-[#7C3AED] motion-safe:animate-spin" />
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onReconnect(); }}
              className="h-8 w-8 hover:bg-teal-500/20 hover:text-teal-400"
              aria-label="Reconnect"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="h-8 w-8 hover:bg-red-500/20 hover:text-red-400"
              aria-label="Remove from history"
            >
              <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Memoized ConnectionCard for performance
const MemoizedConnectionCard = React.memo(ConnectionCard);

// Active Transfer type for sidebar display
interface SidebarTransfer {
  id: string;
  fileName: string;
  direction: "upload" | "download";
  progress: number; // 0-100
}

// Left Sidebar — Share / Mounts / Settings first (power-user library buried)
function Sidebar({
  activeView,
  onViewChange,
  shareCount,
  connectionCount,
  activeTransfers,
}: {
  activeView: NavigationView;
  onViewChange: (view: NavigationView) => void;
  shareCount: number;
  connectionCount: number;
  recentCount: number;
  favoritesCount: number;
  mediaFilter: MediaFilter;
  onMediaFilterChange: (filter: MediaFilter) => void;
  projects: Project[];
  onCreateProject: (name: string) => void;
  activeTransfers: SidebarTransfer[];
}) {
  const mainNavItems = [
    { id: "all-files" as NavigationView, icon: Share2, label: "Portal", count: shareCount + connectionCount },
  ];

  return (
    <div className="flex w-44 flex-col border-r border-white/[0.06] bg-[#0F0F0F] py-4">
      <div className="mb-8 px-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#7C3AED]">
            <Share2 className="h-3.5 w-3.5 text-white" aria-hidden />
          </div>
          <span className="font-display text-sm font-semibold tracking-tight text-[#FAFAFA]">
            Wormhole
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2" aria-label="Main">
        {mainNavItems.map((item) => (
          <Button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            variant="ghost"
            className={`h-10 min-h-10 w-full justify-start gap-2.5 ${
              activeView === item.id
                ? "bg-[#7C3AED]/15 text-[#A78BFA]"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="flex-1 text-left text-sm">{item.label}</span>
            {item.count > 0 && (
              <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono-brand text-[10px] tabular-nums text-zinc-400">
                {item.count}
              </span>
            )}
          </Button>
        ))}

        {activeTransfers.length > 0 && (
          <div className="pt-4">
            <span className="px-2.5 font-mono-brand text-[10px] uppercase tracking-wider text-zinc-600">
              Transfers
            </span>
            <div className="mt-2 space-y-1">
              {activeTransfers.slice(0, 3).map((transfer) => (
                <div key={transfer.id} className="px-2.5 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    {transfer.direction === "upload" ? (
                      <Upload className="h-3 w-3 flex-shrink-0 text-teal-400" aria-hidden />
                    ) : (
                      <Download className="h-3 w-3 flex-shrink-0 text-[#7C3AED]" aria-hidden />
                    )}
                    <span className="flex-1 truncate text-zinc-400">{transfer.fileName}</span>
                    <span className="tabular-nums text-zinc-500">{transfer.progress}%</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-[width] ${
                        transfer.direction === "upload" ? "bg-teal-500" : "bg-[#7C3AED]"
                      }`}
                      style={{ width: `${transfer.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="space-y-0.5 px-2">
        <details className="group">
          <summary className="cursor-pointer list-none rounded-md px-2.5 py-2 font-mono-brand text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]">
            More…
          </summary>
          <div className="mt-1 space-y-0.5">
            <Button
              onClick={() => onViewChange("my-shares")}
              variant="ghost"
              className={`h-9 w-full justify-start gap-2.5 ${
                activeView === "my-shares"
                  ? "bg-[#7C3AED]/15 text-[#A78BFA]"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <FolderUp className="h-4 w-4" aria-hidden />
              <span className="text-sm">Sharing</span>
            </Button>
            <Button
              onClick={() => onViewChange("shared-with-me")}
              variant="ghost"
              className={`h-9 w-full justify-start gap-2.5 ${
                activeView === "shared-with-me"
                  ? "bg-[#7C3AED]/15 text-[#A78BFA]"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <Download className="h-4 w-4" aria-hidden />
              <span className="text-sm">Mounts</span>
            </Button>
          </div>
        </details>
        <Button
          onClick={() => onViewChange("settings")}
          variant="ghost"
          className={`h-10 min-h-10 w-full justify-start gap-2.5 ${
            activeView === "settings"
              ? "bg-[#7C3AED]/15 text-[#A78BFA]"
              : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
          }`}
        >
          <Settings className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span className="text-sm">Settings</span>
        </Button>
      </div>
    </div>
  );
}

// File Browser Component
function FileBrowserLegacy({
  rootPath,
  rootName,
  viewMode,
  sourceId,
  sourceType,
  onToggleFavorite,
  isFavorite,
  onBackToAllFiles,
}: {
  rootPath: string;
  rootName: string;
  viewMode: ViewMode;
  sourceId: string;
  sourceType: "share" | "connection";
  onToggleFavorite: (file: { path: string; name: string; sourceId: string; sourceType: "share" | "connection"; isDir: boolean; size?: number }) => void;
  isFavorite: (path: string) => boolean;
  onBackToAllFiles: () => void;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<FileEntry | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const entries = await invoke<FileEntry[]>("list_directory", { path });
      setFiles(entries);
      setCurrentPath(path);
      setSelectedFiles(new Set());
    } catch (e) {
      setError(String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath);
    }
  }, [rootPath, loadDirectory]);

  const handleFileClick = (file: FileEntry, isDoubleClick = false) => {
    if (file.is_dir && isDoubleClick) {
      loadDirectory(file.path);
    } else if (!file.is_dir && isDoubleClick) {
      // Open file with default app on double-click
      handleOpenFile(file);
    } else {
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(file.path)) {
        newSelected.delete(file.path);
      } else {
        newSelected.add(file.path);
      }
      setSelectedFiles(newSelected);
    }
  };

  const goUp = () => {
    const parent = getParentPath(currentPath, rootPath);
    if (parent.length >= rootPath.length) {
      loadDirectory(parent);
    }
  };

  // File operations
  const handleOpenFile = async (file: FileEntry) => {
    try {
      await invoke("open_file", { path: file.path });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  };

  const handleRevealInFinder = async (file: FileEntry) => {
    try {
      await invoke("reveal_in_explorer", { path: file.path });
    } catch (e) {
      console.error("Failed to reveal in Finder:", e);
    }
  };

  const handleDeleteFile = async (file: FileEntry) => {
    try {
      await invoke("delete_path", { path: file.path });
      // Refresh the directory
      loadDirectory(currentPath);
      setDeleteConfirm(null);
    } catch (e) {
      console.error("Failed to delete:", e);
      setError(String(e));
    }
  };

  const pathParts = getRelativePath(currentPath, rootPath);

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle native drag start for file export
  const handleDragStart = async (e: React.DragEvent, file: FileEntry) => {
    e.preventDefault();
    // Start native drag with the file path
    try {
      await startDrag({
        item: [file.path],
        icon: file.path, // Use file itself as icon (system will generate preview)
      });
    } catch (err) {
      console.error("Drag failed:", err);
    }
  };

  // Render a file item with context menu
  const renderFileItem = (file: FileEntry, isGridView: boolean) => {
    const isSelected = selectedFiles.has(file.path);

    const content = isGridView ? (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, file)}
        className={`flex flex-col items-center gap-2 p-4 h-auto rounded-md cursor-grab active:cursor-grabbing ${
          isSelected
            ? "bg-emerald-500/20"
            : "hover:bg-zinc-800/50"
        }`}
        onClick={() => handleFileClick(file, false)}
        onDoubleClick={() => handleFileClick(file, true)}
      >
        {getFileIcon(file.name, file.is_dir, "w-12 h-12")}
        <span className="text-xs text-zinc-300 truncate w-full text-center">
          {file.name}
        </span>
        {!file.is_dir && (
          <span className="text-xs text-zinc-600">
            {formatSize(file.size)}
          </span>
        )}
      </div>
    ) : (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, file)}
        className={`w-full grid grid-cols-[1fr_100px_80px] gap-4 items-center h-auto py-2 px-2 rounded-md cursor-grab active:cursor-grabbing ${
          isSelected
            ? "bg-emerald-500/20"
            : "hover:bg-zinc-800/50"
        }`}
        onClick={() => handleFileClick(file, false)}
        onDoubleClick={() => handleFileClick(file, true)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {getFileIcon(file.name, file.is_dir)}
          <span className="text-sm text-zinc-300 truncate">
            {file.name}
          </span>
        </div>
        <div className="text-xs text-zinc-500">
          {formatDate(file.modified)}
        </div>
        <div className="text-xs text-zinc-500 text-right">
          {file.is_dir ? "—" : formatSize(file.size)}
        </div>
      </div>
    );

    return (
      <ContextMenu key={file.path}>
        <ContextMenuTrigger asChild>
          {content}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => handleOpenFile(file)}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open
            <ContextMenuShortcut>⌘O</ContextMenuShortcut>
          </ContextMenuItem>
          {file.is_dir && (
            <ContextMenuItem onClick={() => loadDirectory(file.path)}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Open Folder
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onToggleFavorite({
              path: file.path,
              name: file.name,
              sourceId,
              sourceType,
              isDir: file.is_dir,
              size: file.size,
            })}
            className={isFavorite(file.path) ? "text-amber-400" : ""}
          >
            <Star
              className={`w-4 h-4 mr-2 ${isFavorite(file.path) ? "text-amber-400" : ""}`}
              weight={isFavorite(file.path) ? "fill" : "duotone"}
            />
            {isFavorite(file.path) ? "Remove from Favorites" : "Add to Favorites"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleRevealInFinder(file)}>
            <Eye className="w-4 h-4 mr-2" />
            Show in Finder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setDeleteConfirm(file)}
            className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
      {/* Top Bar */}
      <div className="h-12 flex items-center px-5 gap-3 flex-shrink-0">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          {/* All Files (root) - AGENTS.md: Icon-only buttons need aria-label */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToAllFiles}
            className="text-zinc-400 hover:text-white h-7 px-2"
            aria-label="All Files"
          >
            <Files className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
          {/* Current share/connection root */}
          <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadDirectory(rootPath)}
            className={`h-7 px-2 text-sm ${currentPath === rootPath ? "text-white" : "text-zinc-400 hover:text-white"}`}
          >
            {rootName}
          </Button>
          {/* Sub-paths within the share */}
          {pathParts.map((part, i) => (
            <div key={i} className="flex items-center">
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  loadDirectory(joinPath(rootPath, ...pathParts.slice(0, i + 1)))
                }
                className={`h-7 px-2 text-sm ${i === pathParts.length - 1 ? "text-white" : "text-zinc-400 hover:text-white"}`}
              >
                {part}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search - AGENTS.md: spellcheck, autocomplete, aria-label */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
          <Input
            type="search"
            name="search-files"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 h-8 bg-zinc-800 border-0 pl-8 text-sm text-white placeholder:text-zinc-500 rounded-md"
            aria-label="Search files"
          />
        </div>
      </div>

      {/* File List/Grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <AlertCircle className="w-12 h-12 text-red-400/50 mb-3" />
            <p className="text-sm text-red-400/70">{error}</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Folder className="w-12 h-12 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {searchQuery ? "No files match your search" : "This folder is empty"}
            </p>
          </div>
        ) : viewMode === "list" ? (
          <div>
            <div className="sticky top-0 bg-zinc-900 px-5 py-2 grid grid-cols-[1fr_100px_80px] gap-4 text-xs text-zinc-500">
              <div>Name</div>
              <div>Modified</div>
              <div className="text-right">Size</div>
            </div>
            <div className="px-5 py-1">
              {currentPath !== rootPath && (
                <div
                  onClick={goUp}
                  className="w-full grid grid-cols-[1fr_100px_80px] gap-4 items-center h-auto py-2 px-2 hover:bg-zinc-800/50 rounded-md cursor-default"
                >
                  <div className="flex items-center gap-2.5">
                    <Folder className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">..</span>
                  </div>
                </div>
              )}
              {filteredFiles.map((file) => renderFileItem(file, false))}
            </div>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {currentPath !== rootPath && (
              <div
                onClick={goUp}
                className="flex flex-col items-center gap-2 p-4 h-auto hover:bg-zinc-800/50 rounded-md cursor-default"
              >
                <Folder className="w-12 h-12 text-zinc-500" />
                <span className="text-xs text-zinc-400">..</span>
              </div>
            )}
            {filteredFiles.map((file) => renderFileItem(file, true))}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="h-8 flex items-center justify-between px-5 text-xs text-zinc-500 flex-shrink-0">
        <span>
          {filteredFiles.length} {filteredFiles.length === 1 ? "item" : "items"}
          {selectedFiles.size > 0 && ` • ${selectedFiles.size} selected`}
        </span>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirm?.is_dir ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"?
              {deleteConfirm?.is_dir && " This will delete all contents inside."}
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteConfirm && handleDeleteFile(deleteConfirm)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// All Files View Component - Shows all root folders together like a file browser
function AllFilesViewLegacy({
  shares,
  connections,
  searchQuery,
  setSearchQuery,
  searchResults,
  isIndexing,
  totalFiles,
  totalFolders,
  onRefreshIndex,
  onBrowseShare,
  onBrowseConnection,
  onOpenShareDialog,
  onOpenConnectDialog,
  mediaFilter,
}: {
  shares: ShareHistoryItem[];
  connections: ConnectionHistoryItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: IndexEntry[];
  isIndexing: boolean;
  totalFiles: number;
  totalFolders: number; // Keep for future use
  onRefreshIndex: () => Promise<void>;
  onBrowseShare: (path: string) => void;
  onBrowseConnection: (mountPoint: string) => void;
  onOpenShareDialog: () => void;
  onOpenConnectDialog: () => void;
  mediaFilter: MediaFilter;
}) {
  // Note: totalFolders available for future use
  void totalFolders;
  const activeShares = shares.filter((s) => s.status === "active");
  const activeConnections = connections.filter((c) => c.status === "connected");
  const hasActiveSources = activeShares.length > 0 || activeConnections.length > 0;

  // Combine all sources into a single list of "root folders"
  const allRootFolders = [
    ...activeShares.map((share) => ({
      id: share.id,
      name: getFileName(share.path) || "Shared Folder",
      path: share.path,
      type: "share" as const,
      code: share.joinCode,
      isDir: true,
    })),
    ...activeConnections.map((conn) => ({
      id: conn.id,
      name: getFileName(conn.mountPoint) || "Remote Share",
      path: conn.mountPoint,
      type: "connection" as const,
      code: conn.joinCode,
      isDir: true,
    })),
  ];

  // Apply media filter to search results
  const filteredSearchResults = useMemo(() => {
    if (mediaFilter === "all") return searchResults;
    return searchResults.filter((entry) => {
      // Always include directories when filtering
      if (entry.is_dir) return true;
      // Filter files by media type
      return getMediaType(entry.name) === mediaFilter;
    });
  }, [searchResults, mediaFilter]);

  // Open file handler for search results
  const handleOpenFile = async (path: string) => {
    try {
      await invoke("open_file", { path });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  };

  // Handle clicking a root folder
  const handleRootFolderClick = (folder: typeof allRootFolders[0]) => {
    if (folder.type === "share") {
      onBrowseShare(folder.path);
    } else {
      onBrowseConnection(folder.path);
    }
  };

  // Handle clicking a search result
  const handleSearchResultClick = (entry: IndexEntry) => {
    if (entry.is_dir) {
      // Navigate to folder
      if (entry.root_type === "share") {
        onBrowseShare(entry.path);
      } else {
        onBrowseConnection(entry.path);
      }
    } else {
      // Open file
      handleOpenFile(entry.path);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
      {/* Search Bar - AGENTS.md: spellcheck, autocomplete, aria-label */}
      <div className="h-12 flex items-center px-5 gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
          <Input
            type="search"
            name="search-all-files"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasActiveSources ? `Search ${totalFiles.toLocaleString()} files…` : "Search files…"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 bg-zinc-800 border-0 pl-9 pr-8 text-sm text-white placeholder:text-zinc-500 rounded-md"
            aria-label="Search all files"
          />
          {isIndexing && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 animate-spin" />
          )}
          {!isIndexing && searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchQuery("")}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-zinc-700"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {searchQuery || mediaFilter !== "all" ? (
        // Search Results (also shown when media filter is active)
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-2 text-xs text-zinc-500">
            {filteredSearchResults.length} results{searchQuery ? ` for "${searchQuery}"` : ""}
            {mediaFilter !== "all" && ` (${mediaFilter} files)`}
          </div>
          {filteredSearchResults.length > 0 ? (
            <div className="px-3 py-1">
              {filteredSearchResults.slice(0, 100).map((entry) => (
                <div
                  key={entry.path}
                  className="group flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                  onClick={() => handleSearchResultClick(entry)}
                >
                  {getFileIcon(entry.name, entry.is_dir)}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-300">{entry.name}</span>
                  </div>
                  <Badge className={`text-[10px] px-1.5 py-0 ${
                    entry.root_type === "share"
                      ? "bg-emerald-500/20 text-emerald-400 border-transparent"
                      : "bg-green-500/20 text-green-400 border-transparent"
                  }`}>
                    {entry.root_name}
                  </Badge>
                  {!entry.is_dir && (
                    <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                  )}
                </div>
              ))}
              {filteredSearchResults.length > 100 && (
                <p className="text-xs text-zinc-500 text-center py-3">
                  Showing 100 of {filteredSearchResults.length} results
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-12">
                <Search className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No files found</p>
              </div>
            </div>
          )}
        </div>
      ) : hasActiveSources ? (
        // All Root Folders - File browser style
        <>
          {/* Column Headers */}
          <div className="px-5 py-2 grid grid-cols-[1fr_100px_80px] gap-4 text-xs text-zinc-500">
            <div>Name</div>
            <div>Type</div>
            <div className="text-right">Code</div>
          </div>

          {/* Folder List */}
          <div className="flex-1 overflow-y-auto px-3 py-1">
            {allRootFolders.map((folder) => (
              <div
                key={folder.id}
                className="group grid grid-cols-[1fr_100px_80px] gap-4 items-center px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                onClick={() => handleRootFolderClick(folder)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-5 h-5 flex items-center justify-center ${
                    folder.type === "share" ? "text-emerald-400" : "text-green-400"
                  }`}>
                    <Folder className="w-5 h-5" />
                  </div>
                  <span className="text-sm text-zinc-300 truncate">{folder.name}</span>
                </div>
                <div className="text-xs">
                  <Badge className={`text-[10px] px-1.5 py-0 ${
                    folder.type === "share"
                      ? "bg-emerald-500/20 text-emerald-400 border-transparent"
                      : "bg-green-500/20 text-green-400 border-transparent"
                  }`}>
                    {folder.type === "share" ? "My Share" : "Shared"}
                  </Badge>
                </div>
                <div className="text-right">
                  <code className="text-xs text-zinc-500">{folder.code}</code>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        // Empty State
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md space-y-6">
            <Files className="w-20 h-20 text-zinc-700 mx-auto" />
            <h2 className="text-xl font-semibold text-white">
              No Files to Browse
            </h2>
            <p className="text-zinc-500">
              Connect to a shared folder or share your own to get started
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={onOpenConnectDialog}
                className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]"
              >
                <Download className="w-4 h-4" aria-hidden />
                Enter a code
              </Button>
              <Button
                onClick={onOpenShareDialog}
                variant="outline"
                className="gap-2 border-zinc-700 hover:bg-zinc-800"
              >
                <Upload className="w-4 h-4" aria-hidden />
                Share a folder
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Status Bar */}
      {hasActiveSources && !searchQuery && (
        <div className="h-8 flex items-center justify-between px-5 text-xs text-zinc-500 flex-shrink-0 border-t border-zinc-800">
          <span>
            {allRootFolders.length} {allRootFolders.length === 1 ? "folder" : "folders"}
            {" • "}{totalFiles.toLocaleString()} files indexed
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshIndex}
            disabled={isIndexing}
            className="h-6 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isIndexing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}

// Share Dialog Component
function ShareDialog({
  isOpen,
  onClose,
  onShareCreated,
  initialPath,
  previewMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onShareCreated: (path: string, joinCode: string, port: number, shareId: string, expirationOption: ExpirationOption, expiresAt: number | null, shareMode: ShareMode) => void;
  initialPath?: string | null;
  previewMode?: string | null;
}) {
  const [sharePath, setSharePath] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [shareId, setShareId] = useState("");
  const [port, setPort] = useState<number>(4433);
  const [hostIpAddress, setHostIpAddress] = useState<string>("");
  const [isHosting, setIsHosting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [expirationOption, setExpirationOption] = useState<ExpirationOption>("forever");
  const [shareMode, setShareMode] = useState<ShareMode>("mount");

  // Seed success UI for screenshot/demo deep-links
  useEffect(() => {
    if (!isOpen || previewMode !== "share-success") return;
    setSharePath("/Users/alex/Renders");
    setJoinCode("7KJMXB");
    setShareId("preview-share-1");
    setPort(4433);
    setHostIpAddress("192.168.1.42");
    setIsHosting(true);
    setShareMode("mount");
  }, [isOpen, previewMode]);

  useEffect(() => {
    if (!isOpen || previewMode !== "share-drop") return;
    setSharePath("/Users/alex/Desktop/RoughCuts");
    setShareMode("drop");
    setExpirationOption("24h");
    setIsHosting(false);
    setJoinCode("");
  }, [isOpen, previewMode]);

  useEffect(() => {
    if (!isOpen || previewMode !== "share") return;
    setSharePath("/Users/alex/Renders");
    setShareMode("mount");
    setIsHosting(false);
    setJoinCode("");
  }, [isOpen, previewMode]);

  useEffect(() => {
    if (!isOpen || !initialPath) return;
    setSharePath(initialPath);
    setIsHosting(false);
    setJoinCode("");
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen) return;

    let unlistenHost: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenHost = await listen<ServiceEvent>("host-event", (event) => {
        const data = event.payload;
        if (data.type === "Error") {
          setStatusMessage(friendlyError(data.message, "generic"));
          setIsStarting(false);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenHost) {
        unlistenHost();
      }
    };
  }, [isOpen]);

  const selectFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setSharePath(selected);
      }
    } catch (e) {
      console.error("Failed to open folder dialog:", e);
    }
  };

  const applyDroppedPath = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0] as File & { path?: string };
    // Tauri injects absolute path on dropped File objects
    if (file.path) {
      setSharePath(file.path);
      setStatusMessage("");
    } else {
      setStatusMessage("Drop a folder from Finder/Explorer (web drops have no path).");
    }
  };

  const handleStartHosting = async () => {
    if (!sharePath || isStarting) return;

    setIsStarting(true);
    setStatusMessage("");
    try {
      const newShareId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setShareId(newShareId);

      const ips = await invoke<string[]>("get_local_ip");
      if (ips && ips.length > 0) {
        setHostIpAddress(ips[0]);
      }

      const effectiveExpiration = shareMode === "drop" && expirationOption === "forever" ? "24h" : expirationOption;
      const expiresInMs = expirationToMs(effectiveExpiration);
      const expiresAt = expiresInMs ? Date.now() + expiresInMs : null;

      const result = await invoke<{ id: string; share_path: string; port: number; join_code: string; host_name?: string; share_mode?: string }>(
        "start_hosting_with_expiration",
        { id: newShareId, path: sharePath, port: null, expiresInMs, shareMode }
      );

      setJoinCode(result.join_code);
      setPort(result.port);
      setIsHosting(true);
      onShareCreated(result.share_path, result.join_code, result.port, result.id, effectiveExpiration, expiresAt, shareMode);
    } catch (e) {
      setStatusMessage(friendlyError(e, "generic"));
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopHosting = async () => {
    try {
      if (shareId) {
        await invoke("stop_hosting_by_id", { id: shareId });
      } else {
        await invoke("stop_hosting");
      }
      setIsHosting(false);
      setJoinCode("");
      setShareId("");
      setSharePath("");
      setPort(4433);
      setHostIpAddress("");
      onClose();
    } catch (e) {
      setStatusMessage(friendlyError(e, "generic"));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-white">
            {isHosting ? "You’re sharing" : "Share a folder"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            {isHosting
              ? "Copy the code or let them scan the QR. Finder stays the file browser."
              : "Drop a folder or pick one. They mount it with your code."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!isHosting ? (
            <>
              <div className="space-y-3">
                {sharePath ? (
                  <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                    <Folder className="w-4 h-4 text-[#7C3AED] flex-shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{folderDisplayName(sharePath)}</p>
                      <p className="text-xs text-zinc-500 truncate">{sharePath}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSharePath("")}
                      className="h-8 w-8 hover:bg-zinc-700"
                      aria-label="Clear folder"
                    >
                      <X className="w-3 h-3" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={selectFolder}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      applyDroppedPath(e.dataTransfer.files);
                    }}
                    className={`w-full min-h-28 rounded-xl border-2 border-dashed px-4 py-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] ${
                      isDragging
                        ? "border-[#7C3AED] bg-[#7C3AED]/10"
                        : "border-zinc-700/60 hover:border-[#7C3AED]/50 bg-transparent"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <FolderUp className={`w-8 h-8 ${isDragging ? "text-[#7C3AED]" : "text-zinc-600"}`} aria-hidden />
                      <span className="text-sm text-zinc-300">
                        {isDragging ? "Drop folder to share" : "Drop a folder here"}
                      </span>
                      <span className="text-xs text-zinc-500">or click to browse…</span>
                    </div>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs text-zinc-400">Mode</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Share mode">
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={shareMode === "mount"}
                    onClick={() => setShareMode("mount")}
                    className={`portal-press min-h-11 ${shareMode === "mount" ? "border-[#7C3AED] bg-[#7C3AED]/25 text-white ring-1 ring-[#7C3AED]/40" : "border-zinc-700 text-zinc-400"}`}
                  >
                    <IconDrive className="mr-1.5 h-4 w-4" />
                    Mount
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={shareMode === "drop"}
                    onClick={() => { setShareMode("drop"); if (expirationOption === "forever") setExpirationOption("24h"); }}
                    className={`portal-press min-h-11 ${shareMode === "drop" ? "border-[#7C3AED] bg-[#7C3AED]/25 text-white ring-1 ring-[#7C3AED]/40" : "border-zinc-700 text-zinc-400"}`}
                  >
                    <IconDrop className="mr-1.5 h-4 w-4" />
                    Drop
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {shareMode === "drop"
                    ? "Drop = expires in 24h. One-off handoffs, then it’s gone."
                    : "Mount = stay connected until you stop sharing."}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="share-expiration" className="text-xs text-zinc-400">
                  Link expiration
                </label>
                <Select
                  value={expirationOption}
                  onValueChange={(value) => setExpirationOption(value as ExpirationOption)}
                >
                  <SelectTrigger id="share-expiration" className="w-full bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select expiration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forever">Forever (no expiration)</SelectItem>
                    <SelectItem value="1h">1 Hour</SelectItem>
                    <SelectItem value="24h">24 Hours</SelectItem>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="30d">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleStartHosting}
                disabled={!sharePath || isStarting}
                className="portal-press w-full min-h-11 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                aria-busy={isStarting}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2" />
                    Starting…
                  </>
                ) : (
                  "Start sharing"
                )}
              </Button>
            </>
          ) : (
            <>
              <JoinCodePanel code={joinCode} showQr shareLinkBase={WORMHOLE_BASE_URL} />

              {hostIpAddress && (
                <p className="text-xs text-zinc-500 text-center">
                  Same Wi‑Fi tip:{" "}
                  <code className="text-zinc-300 font-mono">
                    {hostIpAddress}:{port}
                  </code>
                </p>
              )}

              <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                <Folder className="w-4 h-4 text-[#7C3AED] flex-shrink-0" aria-hidden />
                <span className="text-sm text-zinc-300 truncate">{sharePath}</span>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={onClose}
                  className="flex-1 min-h-11 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  Done
                </Button>
                <Button
                  onClick={handleStopHosting}
                  variant="destructive"
                  className="flex-1 min-h-11"
                >
                  Stop sharing
                </Button>
              </div>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-zinc-400 text-center bg-zinc-800 rounded-xl px-4 py-3" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Connect Dialog — one field, auto-mount under ~/Wormhole, Open Finder CTA
function ConnectDialog({
  isOpen,
  onClose,
  onConnectionCreated,
  initialCode,
  initialPeerName,
  previewMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnectionCreated: (
    joinCode: string,
    mountPoint: string,
    connectionId: string,
    peerName?: string | null,
  ) => void;
  initialCode?: string | null;
  initialPeerName?: string | null;
  previewMode?: string | null;
}) {
  const [hostAddress, setHostAddress] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [showAdvancedMount, setShowAdvancedMount] = useState(false);

  const extractedPreview = extractJoinCode(hostAddress);
  const isValidCode =
    hostAddress.trim().length > 0 &&
    (extractedPreview !== null ||
      (hostAddress.includes(":") && !hostAddress.includes("://")));

  // Seed mounted UI for screenshot/demo deep-links
  useEffect(() => {
    if (!isOpen || previewMode !== "connect-success") return;
    setHostAddress("7KJMXB");
    setMountPath("/home/preview/Wormhole/7KJMXB");
    setConnectionId("preview-conn-1");
    setIsConnected(true);
  }, [isOpen, previewMode]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialCode) {
      setHostAddress(initialCode);
      return;
    }

    // Auto-detect clipboard join code when opening empty
    let cancelled = false;
    (async () => {
      const found = await detectJoinCodeFromClipboard();
      if (!cancelled && found && !hostAddress) {
        setHostAddress(found);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [isOpen, initialCode]);

  useEffect(() => {
    if (!isOpen) return;

    let unlistenMount: (() => void) | null = null;
    let hasEmitted = false;

    const setupListeners = async () => {
      unlistenMount = await listen<ServiceEvent>("mount-event", (event) => {
        const data = event.payload;
        if (data.type === "MountReady" && !hasEmitted) {
          hasEmitted = true;
          setIsConnected(true);
          setIsConnecting(false);
          setMountPath(data.mountpoint || "");
          setStatusMessage("");

          const extractedCode = extractJoinCode(hostAddress);
          onConnectionCreated(
            extractedCode || hostAddress,
            data.mountpoint || "",
            connectionId,
            initialPeerName,
          );
        } else if (data.type === "Error") {
          setIsConnected(false);
          setIsConnecting(false);
          setStatusMessage(friendlyError(data.message, "generic"));
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenMount) {
        unlistenMount();
      }
    };
  }, [isOpen, hostAddress, connectionId, onConnectionCreated, initialPeerName]);

  const selectFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setMountPath(selected);
        setShowAdvancedMount(true);
      }
    } catch (e) {
      console.error("Failed to open folder dialog:", e);
    }
  };

  const handleConnect = async () => {
    if (!hostAddress || isConnecting) return;

    setIsConnecting(true);
    setStatusMessage("");
    try {
      const extractedCode = extractJoinCode(hostAddress);
      const newConnectionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setConnectionId(newConnectionId);

      let path = mountPath.trim();
      if (!path) {
        path = await resolveDefaultMountPath(extractedCode || hostAddress);
        setMountPath(path);
      }

      if (extractedCode) {
        const result = await invoke<{
          id: string;
          mount_point: string;
          join_code: string;
          peer_name?: string | null;
        }>("connect_with_code_and_id", {
          id: newConnectionId,
          joinCode: extractedCode,
          mountPath: path,
        });
        setIsConnected(true);
        setMountPath(result.mount_point);
        onConnectionCreated(
          result.join_code,
          result.mount_point,
          result.id,
          result.peer_name || initialPeerName,
        );
      } else if (hostAddress.includes(":") && !hostAddress.includes("://")) {
        await invoke("connect_to_peer", { hostAddress, mountPath: path });
      } else {
        setStatusMessage("Enter a valid share link, join code, or host:port");
        setIsConnecting(false);
        return;
      }
    } catch (e) {
      setStatusMessage(friendlyError(e, "generic"));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (connectionId) {
        await invoke("disconnect_by_id", { id: connectionId });
      } else {
        await invoke("disconnect");
      }
      setIsConnected(false);
      setConnectionId("");
      setMountPath("");
      setHostAddress("");
      onClose();
    } catch (e) {
      setStatusMessage(`Disconnected (${e})`);
    }
  };

  const openFinder = async () => {
    if (!mountPath) return;
    try {
      await invoke("open_file", { path: mountPath });
    } catch {
      try {
        await invoke("reveal_in_explorer", { path: mountPath });
      } catch (e) {
        setStatusMessage(`Could not open folder: ${e}`);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg text-white">
            {isConnected ? "Mounted" : "Enter a code"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            {isConnected
              ? "Files are live in Finder. This window just keeps the tunnel open."
              : "Paste a join code or share link. Mounts under ~/Wormhole — Finder opens automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!isConnected ? (
            <>
              <div className="space-y-3">
                <JoinCodePanel
                  code={extractedPreview}
                  showPaste
                  showQr={false}
                  onCodeFromClipboard={(c) => setHostAddress(c)}
                />

                <div className="space-y-1.5">
                  <Input
                    type="text"
                    name="join-code"
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="text"
                    autoFocus
                    value={hostAddress}
                    onChange={(e) => setHostAddress(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isValidCode && !isConnecting) {
                        e.preventDefault();
                        void handleConnect();
                      }
                    }}
                    placeholder="7KJM-XBCD or paste link…"
                    className={`bg-zinc-800 border text-white text-center font-mono text-base min-h-12 placeholder:text-zinc-500 ${
                      hostAddress.trim().length === 0
                        ? "border-transparent"
                        : isValidCode
                        ? "border-teal-500/50"
                        : "border-red-500/50"
                    }`}
                    aria-label="Share link or join code"
                    aria-describedby={
                      hostAddress.trim().length > 0 && !isValidCode ? "join-code-error" : "mount-hint"
                    }
                  />
                  {hostAddress.trim().length > 0 && !isValidCode && (
                    <p id="join-code-error" className="text-xs text-red-400 text-center" role="alert" aria-live="polite">
                      Enter a valid share link or join code (ABC-123)
                    </p>
                  )}
                  <p id="mount-hint" className="text-xs text-zinc-500 text-center">
                    Auto-mounts to ~/Wormhole/{extractedPreview || "…"}
                  </p>
                </div>

                <details
                  className="text-xs text-zinc-500"
                  open={showAdvancedMount}
                  onToggle={(e) => setShowAdvancedMount((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="cursor-pointer hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] rounded px-1">
                    Advanced: choose mount folder…
                  </summary>
                  <div className="mt-2">
                    {mountPath && showAdvancedMount ? (
                      <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                        <Folder className="w-4 h-4 text-[#7C3AED] flex-shrink-0" aria-hidden />
                        <span className="text-sm text-white flex-1 truncate">{mountPath}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setMountPath("")}
                          className="h-8 w-8 hover:bg-zinc-700"
                          aria-label="Clear mount path"
                        >
                          <X className="w-3 h-3" aria-hidden />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={selectFolder}
                        className="w-full min-h-11 border-zinc-700"
                      >
                        Choose folder…
                      </Button>
                    )}
                  </div>
                </details>
              </div>

              <Button
                onClick={handleConnect}
                disabled={!isValidCode || isConnecting}
                className="portal-press w-full min-h-11 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                aria-busy={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2" />
                    Connecting…
                  </>
                ) : (
                  "Connect & mount"
                )}
              </Button>
            </>
          ) : (
            <>
              <MountStatusStrip
                mountPath={mountPath}
                peerLabel={extractedPreview || hostAddress}
                status="connected"
                onOpenFinder={() => { void openFinder(); }}
              />
              <div className="flex gap-2">
                <Button
                  onClick={onClose}
                  className="flex-1 min-h-11 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  Done
                </Button>
                <Button onClick={handleDisconnect} variant="destructive" className="flex-1 min-h-11">
                  Disconnect
                </Button>
              </div>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-zinc-400 text-center bg-zinc-800 rounded-xl px-4 py-3" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Settings Page Component
// Current app version (should match Cargo.toml)
const APP_VERSION = "0.1.0";

// Update info from GitHub releases
interface UpdateInfo {
  version: string;
  release_url: string;
  release_notes: string;
  published_at: string;
}

const FIRST_MOUNT_KEY = "wormhole_first_mount_done";
const SHELL_AUTORUN_KEY = "wormhole_shell_integration_offered";

function SettingsPage({
  onRunSetupWizard,
  onOpenSharing,
  onOpenMounts,
}: {
  onRunSetupWizard: () => void;
  onOpenSharing: () => void;
  onOpenMounts: () => void;
}) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);
  const [shellInstalled, setShellInstalled] = useState(false);
  const [shellDetail, setShellDetail] = useState("");
  const [integrationBusy, setIntegrationBusy] = useState(false);

  const { settings: telemetrySettings, updateSettings: updateTelemetrySettings, enableAll, disableAll } = useTelemetry();

  useEffect(() => {
    void (async () => {
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setAutostartOn(await isEnabled());
      } catch {
        // Browser preview / missing plugin
      }
      try {
        const status = await invoke<{ installed: boolean; detail: string }>("shell_integration_status");
        setShellInstalled(status.installed);
        setShellDetail(status.detail);
      } catch {
        // ignore
      }
    })();
  }, []);

  const toggleAutostart = async (next: boolean) => {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (next) await enable();
      else await disable();
      setAutostartOn(next);
    } catch (e) {
      console.error("Autostart toggle failed:", e);
    }
  };

  const toggleShellIntegration = async () => {
    setIntegrationBusy(true);
    try {
      const status = shellInstalled
        ? await invoke<{ installed: boolean; detail: string }>("uninstall_shell_integration")
        : await invoke<{ installed: boolean; detail: string }>("install_shell_integration");
      setShellInstalled(status.installed);
      setShellDetail(status.detail);
    } catch (e) {
      setShellDetail(String(e));
    } finally {
      setIntegrationBusy(false);
    }
  };

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const result = await invoke<UpdateInfo | null>("check_for_updates", {
        currentVersion: APP_VERSION,
      });
      setUpdateInfo(result);
      setLastChecked(Date.now());
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const openReleasePage = () => {
    if (updateInfo?.release_url) {
      // Open in default browser
      invoke("open_file", { path: updateInfo.release_url }).catch(console.error);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-900 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* About Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">About</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-emerald-700 rounded-2xl flex items-center justify-center">
                  <Share2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Wormhole</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-zinc-500">Version {APP_VERSION}</span>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs">
                      ALPHA
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="text-sm text-zinc-400">
                Mount remote folders locally with peer-to-peer file sharing. No
                cloud uploads required.
              </p>
            </div>
          </div>

          {/* Updates Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Updates</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-white">Check for Updates</h3>
                  <p className="text-sm text-zinc-500">
                    {updateInfo
                      ? `New version ${updateInfo.version} available!`
                      : lastChecked
                        ? `Last checked: ${new Date(lastChecked).toLocaleTimeString()}`
                        : "Click to check for the latest version"}
                  </p>
                  {updateError && (
                    <p className="text-sm text-red-400 mt-1">
                      {updateError}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {updateInfo && (
                    <Button
                      onClick={openReleasePage}
                      className="gap-2 bg-emerald-700 hover:bg-emerald-800"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Download
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={checkForUpdates}
                    disabled={checkingUpdate}
                    className="gap-2 border-zinc-700 hover:bg-zinc-800"
                  >
                    {checkingUpdate ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {checkingUpdate ? "Checking..." : "Check Now"}
                  </Button>
                </div>
              </div>
              {updateInfo && (
                <div className="pt-3 border-t border-zinc-800">
                  <h4 className="text-sm font-medium text-white mb-2">Release Notes</h4>
                  <p className="text-sm text-zinc-400 whitespace-pre-wrap">{updateInfo.release_notes || "No release notes available."}</p>
                  <p className="text-xs text-zinc-600 mt-2">
                    Published: {new Date(updateInfo.published_at).toLocaleDateString()}
                  </p>
                </div>
              )}
              {lastChecked && !updateInfo && !updateError && (
                <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
                  <Check className="w-4 h-4 text-green-400" />
                  <p className="text-sm text-zinc-400">You're running the latest version!</p>
                </div>
              )}
            </div>
          </div>

          {/* Background & OS Integration */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Background &amp; OS</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">Keep running in the background</h3>
                  <p className="text-sm text-zinc-500">
                    Closing the window hides Wormhole to the tray. Quit from the tray menu to exit.
                  </p>
                </div>
                <span className="text-xs font-medium text-teal-400 whitespace-nowrap">Always on</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">Start at login</h3>
                  <p className="text-sm text-zinc-500">
                    Launch Wormhole hidden in the tray when you sign in.
                  </p>
                </div>
                <Switch
                  checked={autostartOn}
                  onCheckedChange={(v) => { void toggleAutostart(v); }}
                  aria-label="Start Wormhole at login"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">Share from Finder / Explorer</h3>
                  <p className="text-sm text-zinc-500">
                    {shellDetail || "Right-click a folder → Share with Wormhole."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={integrationBusy}
                  onClick={() => { void toggleShellIntegration(); }}
                  className="gap-2 border-zinc-700 hover:bg-zinc-800 min-h-10"
                >
                  {integrationBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {shellInstalled ? "Remove" : "Install"}
                </Button>
              </div>
            </div>
          </div>

          {/* History — reachable from Settings (no sidebar) */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">History</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <button
                type="button"
                onClick={onOpenSharing}
                className="portal-press flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              >
                <div>
                  <p className="text-sm font-medium text-white">Sharing</p>
                  <p className="text-xs text-zinc-500">Folders you’ve shared</p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              </button>
              <button
                type="button"
                onClick={onOpenMounts}
                className="portal-press flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              >
                <div>
                  <p className="text-sm font-medium text-white">Mounts</p>
                  <p className="text-xs text-zinc-500">Folders you’ve mounted</p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              </button>
            </div>
          </div>

          {/* System Setup Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">System Setup</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Setup Wizard</h3>
                  <p className="text-sm text-zinc-500">
                    Check system requirements and permissions
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={onRunSetupWizard}
                  className="gap-2 border-zinc-700 hover:bg-zinc-800"
                >
                  <Settings className="w-4 h-4" />
                  Run Setup
                </Button>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Security</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white">End-to-End Encryption</h3>
                  <p className="text-sm text-zinc-500">
                    All file transfers are encrypted with AES-256-GCM
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white">No Cloud Storage</h3>
                  <p className="text-sm text-zinc-500">
                    Files are transferred directly between computers
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white">No Account Required</h3>
                  <p className="text-sm text-zinc-500">
                    No sign-up, no tracking, no data collection
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Telemetry Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Privacy & Telemetry</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-white">Help Improve Wormhole</h3>
                  <p className="text-sm text-zinc-500">
                    Optionally share anonymous usage data to help us make Wormhole better
                  </p>
                </div>
                <div className="flex gap-2">
                  {telemetrySettings.enabled ? (
                    <Button
                      variant="outline"
                      onClick={disableAll}
                      className="gap-2 border-zinc-700 hover:bg-zinc-800"
                    >
                      <X className="w-4 h-4" />
                      Opt Out
                    </Button>
                  ) : (
                    <Button
                      onClick={enableAll}
                      className="gap-2 bg-emerald-700 hover:bg-emerald-800"
                    >
                      <Check className="w-4 h-4" />
                      Opt In
                    </Button>
                  )}
                </div>
              </div>

              {/* Telemetry status */}
              <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-zinc-800/50">
                <div className={`w-2 h-2 rounded-full ${telemetrySettings.enabled ? "bg-green-400" : "bg-zinc-500"}`} />
                <span className="text-sm text-zinc-400">
                  Telemetry is currently <span className={telemetrySettings.enabled ? "text-green-400" : "text-zinc-300"}>{telemetrySettings.enabled ? "enabled" : "disabled"}</span>
                </span>
              </div>

              {/* Toggle details button */}
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-zinc-400 hover:text-white"
                onClick={() => setShowTelemetryDetails(!showTelemetryDetails)}
              >
                {showTelemetryDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {showTelemetryDetails ? "Hide details" : "What data is collected?"}
              </Button>

              {/* Details panel */}
              {showTelemetryDetails && (
                <div className="pt-3 border-t border-zinc-800 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">We collect:</h4>
                    <ul className="text-sm text-zinc-400 space-y-1">
                      {TELEMETRY_COLLECTED_DATA.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">We NEVER collect:</h4>
                    <ul className="text-sm text-zinc-400 space-y-1">
                      {TELEMETRY_NEVER_COLLECTED.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Granular controls when enabled */}
              {telemetrySettings.enabled && (
                <div className="pt-3 border-t border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-white">Usage Analytics</h4>
                      <p className="text-xs text-zinc-500">Share feature usage counts</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateTelemetrySettings({ shareUsageData: !telemetrySettings.shareUsageData })}
                      className={`h-6 w-10 rounded-full p-0 ${telemetrySettings.shareUsageData ? "bg-emerald-700" : "bg-zinc-700"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${telemetrySettings.shareUsageData ? "translate-x-2" : "-translate-x-2"}`} />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-white">Error Reports</h4>
                      <p className="text-xs text-zinc-500">Share anonymous error types</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateTelemetrySettings({ shareErrorReports: !telemetrySettings.shareErrorReports })}
                      className={`h-6 w-10 rounded-full p-0 ${telemetrySettings.shareErrorReports ? "bg-emerald-700" : "bg-zinc-700"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${telemetrySettings.shareErrorReports ? "translate-x-2" : "-translate-x-2"}`} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Check if setup has been completed
const SETUP_COMPLETE_KEY = "wormhole_setup_complete";

function App() {
  const [activeView, setActiveView] = useState<NavigationView>("all-files");
  const [_viewMode] = useState<ViewMode>("list");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [_currentFolderSource, setCurrentFolderSource] = useState<{ id: string; type: "share" | "connection" } | null>(null);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(() => {
    const completed = localStorage.getItem(SETUP_COMPLETE_KEY);
    return completed !== "true";
  });
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [pendingPeerName, setPendingPeerName] = useState<string | null>(null);
  const [pendingSharePath, setPendingSharePath] = useState<string | null>(null);
  const [localIp, setLocalIp] = useState<string>("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  /** Browser-preview deep links: ?preview=share|share-drop|share-success|connect|connect-success|sessions|settings|sharing|mounts */
  const [uiPreview, setUiPreview] = useState<string | null>(null);

  const pushToast = useCallback((toast: Omit<ToastMessage, "id"> | string, tone: ToastMessage["tone"] = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: ToastMessage =
      typeof toast === "string" ? { id, text: toast, tone } : { id, ...toast };
    setToasts((prev) => [...prev.slice(-3), next]);
  }, []);

  const suppressedReconnect = useRef<Set<string>>(new Set());

  // Fetch local IP on mount
  useEffect(() => {
    invoke<string[]>("get_local_ip")
      .then((ips) => {
        if (ips.length > 0) {
          setLocalIp(ips[0]);
        }
      })
      .catch((e) => console.error("Failed to get local IP:", e));
  }, []);

  // Screenshot / demo deep-links (browser preview only)
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("preview");
    if (!preview) return;
    setUiPreview(preview);
    localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    setShowSetupWizard(false);
    if (preview === "share" || preview === "share-drop" || preview === "share-success") {
      setActiveDialog("share");
    } else if (preview === "connect" || preview === "connect-success") {
      setPendingJoinCode("7KJMXB");
      setActiveDialog("connect");
    } else if (preview === "sharing") {
      setActiveView("my-shares");
    } else if (preview === "mounts") {
      setActiveView("shared-with-me");
    } else if (preview === "settings") {
      setActiveView("settings");
    } else if (preview === "sessions" || preview === "portal") {
      setActiveView("all-files");
    }
  }, []);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "share" | "connection";
    id: string;
    name: string;
  } | null>(null);

  // Use the history hook for managing shares and connections
  const {
    shares,
    connections,
    addShare,
    removeShare,
    setShareStatus,
    addConnection,
    updateConnection,
    removeConnection,
    setConnectionStatus,
    syncWithBackend,
  } = useWormholeHistory();

  // File index retained for search in buried history views
  const {
    searchQuery: _globalSearchQuery,
    setSearchQuery: _setGlobalSearchQuery,
    searchResults: _searchResults,
    isIndexing: _isIndexing,
    totalFiles: _totalFiles,
    totalFolders: _totalFolders,
    refreshIndex: _refreshIndex,
  } = useFileIndex(shares, connections);
  void _globalSearchQuery;
  void _setGlobalSearchQuery;
  void _searchResults;
  void _isIndexing;
  void _totalFiles;
  void _totalFolders;
  void _refreshIndex;

  // Use recent files hook
  const {
    recentFiles,
    groupedRecentFiles,
    // Note: addRecentFile available for future file access tracking
    totalRecent,
  } = useRecentFiles(shares, connections);

  // Use favorites hook
  const {
    favorites,
    removeFavorite,
    toggleFavorite: _toggleFavorite,
    isFavorite: _isFavorite,
    totalFavorites,
  } = useFavorites(shares, connections);
  void _toggleFavorite;
  void _isFavorite;

  // Use projects hook
  const {
    projects,
    createProject,
    // Note: updateProject, deleteProject, addToProject, removeFromProject available
  } = useProjects(shares, connections);

  // Use transfers hook
  const { activeTransfers } = useTransfers(shares, connections);

  // Convert active transfers to sidebar format
  const sidebarTransfers = useMemo(
    () =>
      activeTransfers.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        direction: t.direction,
        progress: t.totalBytes > 0 ? Math.round((t.bytesTransferred / t.totalBytes) * 100) : 0,
      })),
    [activeTransfers]
  );

  // Handle deep link events
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    const setupDeepLink = async () => {
      try {
        const unlisten = await onOpenUrl((urls: string[]) => {
          if (!isMounted) return;
          for (const url of urls) {
            const code = extractJoinCode(url);
            if (code) {
              console.log("Received deep link with code:", code);
              setPendingJoinCode(code);
              setActiveDialog("connect");
            }
          }
        });
        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          // Component unmounted before setup completed, clean up immediately
          unlisten();
        }
      } catch (e) {
        console.error("Failed to setup deep link handler:", e);
      }
    };

    setupDeepLink();
    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, []);

  // Also listen for backend-emitted deep link events
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    const setup = async () => {
      try {
        const unlisten = await listen<{ join_code: string; url: string }>("deep-link-join", (event) => {
          if (!isMounted) return;
          const { join_code } = event.payload;
          console.log("Received deep-link-join event:", join_code);
          setPendingJoinCode(join_code);
          setActiveDialog("connect");
        });
        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          unlisten();
        }
      } catch (e) {
        console.error("Failed to setup deep-link-join listener:", e);
      }
    };

    setup();
    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, []);

  // Periodic sync with backend to keep state accurate
  useEffect(() => {
    // Sync immediately on mount
    syncWithBackend();

    // Sync every 5 seconds to catch external state changes (e.g., share stopped from CLI)
    // Most updates are handled optimistically, so this is just a safety net
    const interval = setInterval(() => {
      syncWithBackend();
    }, 5000);

    return () => clearInterval(interval);
  }, [syncWithBackend]);

  const { peers: nearbyPeers, deviceName } = useNearbyPeers();
  const { speedById, globalSpeed } = useSessionThroughput();
  const portalSessions = sessionsFromHistory(shares, connections, speedById);

  const openInFinder = useCallback((path: string) => {
    void invoke("open_file", { path }).catch(() =>
      invoke("reveal_in_explorer", { path })
    );
  }, []);

  const handleStopShareRef = useRef<(id: string) => Promise<void>>(async () => {});
  const handleDisconnectRef = useRef<(id: string) => Promise<void>>(async () => {});
  const handleQuickMountRef = useRef<(code: string, peerName?: string) => Promise<void>>(
    async () => {},
  );

  // Legacy browse requests → open OS file manager (Portal is not a file browser)
  useEffect(() => {
    if (!currentFolder) return;
    openInFinder(currentFolder);
    setCurrentFolder("");
    setCurrentFolderSource(null);
  }, [currentFolder, openInFinder]);

  // Tray → primary product surface
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ action: string; code?: string; id?: string; path?: string }>(
      "tray-action",
      (event) => {
        const { action, code, id, path } = event.payload ?? {};
        if (action === "share") {
          setActiveView("all-files");
          setActiveDialog("share");
        } else if (action === "connect") {
          setActiveView("all-files");
          setActiveDialog("connect");
        } else if (action === "portal") {
          setActiveView("all-files");
        } else if (action === "copy-code" && code) {
          void writeClipboardText(formatJoinCode(code)).then((ok) => {
            if (ok) pushToast(`Copied ${formatJoinCode(code)}`);
          });
        } else if (action === "stop-share" && id) {
          void handleStopShareRef.current(id);
        } else if (action === "stop-mount" && id) {
          suppressedReconnect.current.add(id);
          void handleDisconnectRef.current(id);
        } else if (action === "open-mount" && path) {
          openInFinder(path);
        }
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [openInFinder, pushToast]);

  // CLI / shell integration / deep-link launch actions
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ action: string; path?: string; code?: string }>("launch-action", (event) => {
      const payload = event.payload;
      if (!payload?.action) return;
      if (payload.action === "share" && payload.path) {
        setPendingSharePath(payload.path);
        setActiveView("all-files");
        setActiveDialog("share");
      } else if (payload.action === "connect" && payload.code) {
        setPendingJoinCode(payload.code);
        setActiveView("all-files");
        setActiveDialog("connect");
      } else if (payload.action === "portal") {
        setActiveView("all-files");
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // share-expired → mark inactive
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ id: string }>("share-expired", (event) => {
      if (event.payload?.id) setShareStatus(event.payload.id, "expired");
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [setShareStatus]);

  const handleSetupComplete = useCallback(() => {
    localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    setShowSetupWizard(false);
    // Quiet default: offer Finder/Explorer share once after setup
    if (localStorage.getItem(SHELL_AUTORUN_KEY) !== "1") {
      localStorage.setItem(SHELL_AUTORUN_KEY, "1");
      void invoke<{ installed: boolean }>("install_shell_integration")
        .then(() => {
          pushToast({
            text: "Right-click any folder → Share with Wormhole",
            tone: "info",
            durationMs: 8_000,
          });
        })
        .catch(() => {
          /* opt-in still available in Settings */
        });
    }
  }, [pushToast]);

  // Share operations — keep Share dialog open on success (code + QR stay visible)
  const handleShareCreated = useCallback((path: string, joinCode: string, port: number, shareId: string, expirationOption: ExpirationOption, expiresAt: number | null, shareMode: ShareMode = "mount") => {
    addShare(path, joinCode, port, undefined, shareId, expirationOption, expiresAt, shareMode);
    setActiveView("all-files");
  }, [addShare]);

  const handleStopShare = useCallback(async (shareId: string) => {
    setShareStatus(shareId, "inactive");
    try {
      await invoke("stop_hosting_by_id", { id: shareId });
    } catch (e) {
      pushToast({ text: friendlyError(e, "share"), tone: "error" });
      await syncWithBackend();
    }
  }, [setShareStatus, syncWithBackend, pushToast]);

  const handleResumeShare = useCallback(async (share: ShareHistoryItem) => {
    setShareStatus(share.id, "active");
    try {
      await invoke<{ id: string; share_path: string; port: number; join_code: string }>(
        "start_hosting_with_id",
        { id: share.id, path: share.path, port: share.port }
      );
      setCurrentFolder(share.path);
      setCurrentFolderSource({ id: share.id, type: "share" });
    } catch (e) {
      pushToast({ text: friendlyError(e, "share"), tone: "error" });
      await syncWithBackend();
    }
  }, [setShareStatus, syncWithBackend, pushToast]);

  const handleDeleteShare = useCallback(async (shareId: string) => {
    // Stop the share if it's active before removing
    try {
      await invoke("stop_hosting_by_id", { id: shareId });
    } catch {
      // Ignore error if not active
    }
    removeShare(shareId);
    setDeleteConfirm(null);
  }, [removeShare]);

  // Show delete confirmation for share
  const confirmDeleteShare = useCallback((share: ShareHistoryItem) => {
    const folderName = getFileName(share.path) || "Shared Folder";
    setDeleteConfirm({ type: "share", id: share.id, name: folderName });
  }, []);

  // Connection operations — keep Connect dialog open for Open Finder CTA
  const handleConnectionCreated = useCallback((
    joinCode: string,
    mountPoint: string,
    connectionId: string,
    peerName?: string | null,
  ) => {
    const displayName =
      formatDeviceName(peerName) || peerName?.trim() || undefined;
    const conn = addConnection(joinCode, mountPoint, displayName, connectionId);
    if (displayName) {
      updateConnection(conn.id, { remoteHost: displayName, name: displayName });
    }
    setConnectionStatus(conn.id, "connected");
    setActiveView("all-files");
    suppressedReconnect.current.delete(connectionId);
    // Auto-open Finder/Explorer (backend also opens; this covers preview + race)
    void invoke("open_file", { path: mountPoint }).catch(() =>
      invoke("reveal_in_explorer", { path: mountPoint })
    );
    const who = displayName || "share";
    const first = localStorage.getItem(FIRST_MOUNT_KEY) !== "1";
    if (first) {
      localStorage.setItem(FIRST_MOUNT_KEY, "1");
      pushToast({
        text: `You're in — ${who} is open in Finder`,
        tone: "success",
        durationMs: 6_500,
      });
    } else {
      pushToast(`Opened in Finder — ${who}`);
    }
  }, [addConnection, setConnectionStatus, updateConnection, pushToast]);

  /** One-tap Nearby / clipboard mount — skip the code dialog. */
  const handleQuickMount = useCallback(async (code: string, peerName?: string) => {
    const clean = extractJoinCode(code) || code.trim();
    if (!clean) return;
    try {
      const connectionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const mountPath = await resolveDefaultMountPath(clean);
      const result = await invoke<{
        id: string;
        mount_point: string;
        join_code: string;
        peer_name?: string | null;
      }>("connect_with_code_and_id", {
        id: connectionId,
        joinCode: clean,
        mountPath,
      });
      handleConnectionCreated(
        result.join_code,
        result.mount_point,
        result.id,
        result.peer_name || peerName,
      );
      setActiveDialog(null);
    } catch (e) {
      pushToast({
        text: friendlyError(e, "mount"),
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            void handleQuickMountRef.current(clean, peerName);
          },
        },
      });
      setPendingJoinCode(clean);
      setPendingPeerName(peerName ?? null);
    }
  }, [handleConnectionCreated, pushToast]);

  const handleDisconnect = useCallback(async (connectionId: string) => {
    suppressedReconnect.current.add(connectionId);
    setConnectionStatus(connectionId, "disconnected");
    try {
      await invoke("disconnect_by_id", { id: connectionId });
    } catch (e) {
      console.error("Failed to disconnect:", e);
      await syncWithBackend();
    }
  }, [setConnectionStatus, syncWithBackend]);

  const handleReconnect = useCallback(async (connection: ConnectionHistoryItem) => {
    suppressedReconnect.current.delete(connection.id);
    setConnectionStatus(connection.id, "connecting");
    try {
      const mountPath =
        connection.mountPoint ||
        (await resolveDefaultMountPath(connection.joinCode));
      try {
        await invoke("disconnect_by_id", { id: connection.id });
      } catch {
        /* ignore */
      }
      await invoke("connect_with_code_and_id", {
        id: connection.id,
        joinCode: connection.joinCode,
        mountPath,
      });
      setConnectionStatus(connection.id, "connected");
      setCurrentFolder(mountPath);
      setCurrentFolderSource({ id: connection.id, type: "connection" });
      pushToast(`Back online — ${formatDeviceName(connection.remoteHost || connection.name) || "share"}`);
    } catch (e) {
      const msg = friendlyError(e, "mount");
      setConnectionStatus(connection.id, "error", msg);
      pushToast({ text: msg, tone: "error" });
    }
  }, [setConnectionStatus, pushToast]);

  handleStopShareRef.current = handleStopShare;
  handleDisconnectRef.current = handleDisconnect;
  handleQuickMountRef.current = handleQuickMount;

  // Clipboard → one-tap mount toast
  const ignoreClipboardCodes = useMemo(() => {
    const codes = connections
      .filter((c) => c.status === "connected" || c.status === "connecting")
      .map((c) => extractJoinCode(c.joinCode) || c.joinCode);
    return codes;
  }, [connections]);

  const { offer: clipboardOffer, dismiss: dismissClipboardOffer } = useClipboardJoinOffer({
    enabled: !showSetupWizard && activeDialog === null,
    ignoreCodes: ignoreClipboardCodes,
  });

  useEffect(() => {
    if (!clipboardOffer) return;
    const formatted = formatJoinCode(clipboardOffer);
    pushToast({
      text: `Join code ${formatted} is on your clipboard`,
      tone: "info",
      action: {
        label: "Mount",
        onClick: () => {
          dismissClipboardOffer();
          void handleQuickMountRef.current(clipboardOffer);
        },
      },
      durationMs: 14_000,
    });
    dismissClipboardOffer();
  }, [clipboardOffer, dismissClipboardOffer, pushToast]);

  useAutoReconnect({
    connections,
    setConnectionStatus,
    suppressedIds: suppressedReconnect.current,
    onReconnected: (conn) => {
      const who = formatDeviceName(conn.remoteHost || conn.name) || "share";
      pushToast(`Reconnected — ${who}`);
    },
    onGiveUp: (_conn, message) => {
      pushToast({
        text: message,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            const c = connections.find((x) => x.id === _conn.id);
            if (c) void handleReconnect(c);
          },
        },
      });
    },
  });

  const handleRemoveConnection = useCallback((connectionId: string) => {
    removeConnection(connectionId);
    setDeleteConfirm(null);
  }, [removeConnection]);

  // Show delete confirmation for connection
  const confirmRemoveConnection = useCallback((connection: ConnectionHistoryItem) => {
    const mountName = getFileName(connection.mountPoint) || "Remote Share";
    setDeleteConfirm({ type: "connection", id: connection.id, name: mountName });
  }, []);

  // Note: getActiveShare() and getActiveConnection() are available from useWormholeHistory
  // for future use if needed (e.g., showing active status in header)

  // Sidebar retired — keep hooks warm for buried history views / future tray summary
  void sidebarTransfers;
  void totalRecent;
  void totalFavorites;
  void projects;
  void createProject;
  void mediaFilter;
  void setMediaFilter;

  // Show setup wizard on first run
  if (showSetupWizard) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className="h-screen flex flex-col bg-[#0F0F0F] text-white select-none overflow-hidden">
      {/* Title bar background */}
      <div className="h-8 w-full flex-shrink-0 bg-zinc-900 absolute top-0 left-0 right-0 z-40" />
      {/* Draggable title bar region for macOS */}
      <div
        data-tauri-drag-region
        className="h-8 w-full flex-shrink-0 absolute top-0 left-0 right-0 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {/* Full-bleed content — no sidebar; Portal is the shell */}
      <div className="flex flex-1 min-h-0 flex-col pt-8">
          {activeView !== "all-files" && (
            <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-6 md:px-10">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveView("all-files")}
                  className="portal-press min-h-10 text-zinc-400 hover:text-white"
                >
                  <IconBack className="mr-1.5 h-4 w-4" />
                  Portal
                </Button>
                <h1 className="font-display text-base font-medium text-white">
                  {activeView === "shared-with-me" && "Mounts"}
                  {activeView === "my-shares" && "Sharing"}
                  {activeView === "recent" && "Recent"}
                  {activeView === "favorites" && "Favorites"}
                  {activeView === "settings" && "Settings"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveDialog("connect")}
                  className="portal-press min-h-9 text-zinc-400 hover:text-white"
                >
                  Enter code
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveDialog("share")}
                  className="portal-press min-h-9 bg-[#7C3AED] hover:bg-[#6D28D9]"
                >
                  Share
                </Button>
              </div>
            </div>
          )}

          {activeView === "all-files" && (
              <PortalHome
                deviceName={formatDeviceName(deviceName) || deviceName}
                sessions={portalSessions}
                nearby={nearbyPeers.map((p) => ({
                  ...p,
                  name: formatDeviceName(p.name) || p.name,
                }))}
                globalSpeed={globalSpeed}
                onShare={() => setActiveDialog("share")}
                onConnect={() => setActiveDialog("connect")}
                onOpenSettings={() => setActiveView("settings")}
                onQuickMount={(code, peerName) => { void handleQuickMount(code, peerName); }}
                onOpenFinder={openInFinder}
                onStopShare={(id) => { void handleStopShare(id); }}
                onDisconnect={(id) => { void handleDisconnect(id); }}
                onReconnect={(id) => {
                  const conn = connections.find((c) => c.id === id);
                  if (conn) void handleReconnect(conn);
                }}
                onFolderDropped={(path) => {
                  setPendingSharePath(path);
                  setActiveDialog("share");
                }}
              />
          )}

          {activeView === "shared-with-me" && (
            <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
              {connections.length > 0 ? (
                <>
                  {(() => {
                    const live = connections.find((c) => c.status === "connected");
                    if (!live) return null;
                    return (
                      <div className="px-4 pt-3">
                        <MountStatusStrip
                          mountPath={live.mountPoint}
                          peerLabel={live.remoteHost || live.name || live.joinCode}
                          status="connected"
                          onOpenFinder={() => {
                            void invoke("open_file", { path: live.mountPoint }).catch(() =>
                              invoke("reveal_in_explorer", { path: live.mountPoint })
                            );
                          }}
                        />
                      </div>
                    );
                  })()}
                  {/* Connection List */}
                  <div className="flex-1 overflow-y-auto px-2 py-2">
                    {connections.map((conn) => (
                      <MemoizedConnectionCard
                        key={conn.id}
                        connection={conn}
                        onReconnect={() => handleReconnect(conn)}
                        onDisconnect={() => handleDisconnect(conn.id)}
                        onRemove={() => confirmRemoveConnection(conn)}
                        onBrowse={() => {
                          setCurrentFolder(conn.mountPoint);
                          setCurrentFolderSource({ id: conn.id, type: "connection" });
                          setActiveView("all-files");
                        }}
                        onOpenFinder={() => {
                          void invoke("open_file", { path: conn.mountPoint }).catch(() =>
                            invoke("reveal_in_explorer", { path: conn.mountPoint })
                          );
                        }}
                      />
                    ))}
                  </div>

                  {/* Bottom Status Bar */}
                  <div className="h-8 flex items-center justify-between px-5 text-xs text-zinc-500 flex-shrink-0 border-t border-zinc-800">
                    <span>
                      {connections.filter(c => c.status === "connected").length} connected
                      <span className="text-zinc-600 mx-2">•</span>
                      {connections.length} total
                    </span>
                    <Button
                      onClick={() => setActiveDialog("connect")}
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-[#A78BFA] hover:text-white hover:bg-[#7C3AED]/15"
                    >
                      <Download className="w-3 h-3 mr-1" aria-hidden />
                      Enter a code
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md space-y-4">
                    <Download className="w-16 h-16 mx-auto text-zinc-700" />
                    <h2 className="text-xl font-semibold text-white">
                      No mounts yet
                    </h2>
                    <p className="text-zinc-500">
                      Paste a join code — the folder mounts under ~/Wormhole
                    </p>
                    <Button
                      onClick={() => setActiveDialog("connect")}
                      className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]"
                    >
                      <Download className="w-4 h-4" aria-hidden />
                      Enter a code
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "my-shares" && (
            <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
              {/* Network Info Banner - show when there are active shares */}
              {shares.some(s => s.status === "active") && (
                <div className="mx-4 mt-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">Your IP:</span>
                        <code className="text-sm text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                          {localIp || "Detecting..."}
                        </code>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Others can connect using the join code. On the same network, they connect directly to your IP.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {shares.length > 0 ? (
                <>
                  {/* Share List */}
                  <div className="flex-1 overflow-y-auto px-2 py-2">
                    {shares.map((share) => (
                      <MemoizedShareCard
                        key={share.id}
                        share={share}
                        onResume={() => handleResumeShare(share)}
                        onStop={() => handleStopShare(share.id)}
                        onDelete={() => confirmDeleteShare(share)}
                        onBrowse={() => {
                          setCurrentFolder(share.path);
                          setCurrentFolderSource({ id: share.id, type: "share" });
                          setActiveView("all-files");
                        }}
                      />
                    ))}
                  </div>

                  {/* Bottom Status Bar */}
                  <div className="h-8 flex items-center justify-between px-5 text-xs text-zinc-500 flex-shrink-0 border-t border-zinc-800">
                    <span>
                      {shares.filter(s => s.status === "active").length} active
                      <span className="text-zinc-600 mx-2">•</span>
                      {shares.length} total
                    </span>
                    <Button
                      onClick={() => setActiveDialog("share")}
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-[#A78BFA] hover:text-white hover:bg-[#7C3AED]/15"
                    >
                      <Upload className="w-3 h-3 mr-1" aria-hidden />
                      New share
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md space-y-4">
                    <FolderUp className="w-16 h-16 mx-auto text-zinc-700" />
                    <h2 className="text-xl font-semibold text-white">
                      No shares yet
                    </h2>
                    <p className="text-zinc-500">
                      Drop a folder, get a code, keep editing while they mount
                    </p>
                    <Button
                      onClick={() => setActiveDialog("share")}
                      className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]"
                    >
                      <Upload className="w-4 h-4" aria-hidden />
                      Share a folder
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "recent" && (
            <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
              {recentFiles.length > 0 ? (
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  {/* Today */}
                  {groupedRecentFiles.today.length > 0 && (
                    <div className="mb-4">
                      <h3 className="px-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Today</h3>
                      {groupedRecentFiles.today.map((entry) => (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                          onClick={() => invoke("open_file", { path: entry.path })}
                        >
                          {getFileIcon(entry.name, entry.isDir)}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-zinc-300 truncate block">{entry.name}</span>
                            <span className="text-xs text-zinc-600">{entry.path}</span>
                          </div>
                          {entry.size && !entry.isDir && (
                            <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Yesterday */}
                  {groupedRecentFiles.yesterday.length > 0 && (
                    <div className="mb-4">
                      <h3 className="px-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Yesterday</h3>
                      {groupedRecentFiles.yesterday.map((entry) => (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                          onClick={() => invoke("open_file", { path: entry.path })}
                        >
                          {getFileIcon(entry.name, entry.isDir)}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-zinc-300 truncate block">{entry.name}</span>
                          </div>
                          {entry.size && !entry.isDir && (
                            <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* This Week */}
                  {groupedRecentFiles.thisWeek.length > 0 && (
                    <div className="mb-4">
                      <h3 className="px-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">This Week</h3>
                      {groupedRecentFiles.thisWeek.map((entry) => (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                          onClick={() => invoke("open_file", { path: entry.path })}
                        >
                          {getFileIcon(entry.name, entry.isDir)}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-zinc-300 truncate block">{entry.name}</span>
                          </div>
                          {entry.size && !entry.isDir && (
                            <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Earlier */}
                  {groupedRecentFiles.earlier.length > 0 && (
                    <div className="mb-4">
                      <h3 className="px-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Earlier</h3>
                      {groupedRecentFiles.earlier.map((entry) => (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                          onClick={() => invoke("open_file", { path: entry.path })}
                        >
                          {getFileIcon(entry.name, entry.isDir)}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-zinc-300 truncate block">{entry.name}</span>
                          </div>
                          {entry.size && !entry.isDir && (
                            <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md space-y-4">
                    <div className="w-16 h-16 mx-auto bg-zinc-800 rounded-2xl flex items-center justify-center">
                      <Clock className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">No Recent Files</h2>
                    <p className="text-zinc-500">
                      Files you open will appear here for quick access
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setActiveView("all-files")}
                      className="text-zinc-400 border-zinc-700 hover:bg-zinc-800"
                    >
                      Browse All Files
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "favorites" && (
            <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
              {favorites.length > 0 ? (
                <>
                  {/* Column Headers */}
                  <div className="px-5 py-2 flex items-center">
                    <div className="flex-1 grid grid-cols-[1fr_100px_80px] gap-4 text-xs text-zinc-500">
                      <div>Name</div>
                      <div>Source</div>
                      <div className="text-right">Size</div>
                    </div>
                    <div className="w-8" /> {/* Space for star icon */}
                  </div>

                  {/* Favorites List */}
                  <div className="flex-1 overflow-y-auto px-3 py-1">
                    {favorites.map((entry) => (
                      <div
                        key={entry.id}
                        className="group grid grid-cols-[1fr_100px_80px] gap-4 items-center px-2 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
                        onClick={() => {
                          if (entry.isDir) {
                            // Navigate to folder
                            setCurrentFolder(entry.path);
                            setCurrentFolderSource({ id: entry.sourceId, type: entry.sourceType });
                            setActiveView("all-files");
                          } else {
                            invoke("open_file", { path: entry.path });
                          }
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getFileIcon(entry.name, entry.isDir)}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-zinc-300 truncate block">{entry.name}</span>
                            <span className="text-xs text-zinc-600 truncate block">{entry.path}</span>
                          </div>
                        </div>
                        <div className="text-xs">
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            entry.sourceType === "share"
                              ? "bg-emerald-500/20 text-emerald-400 border-transparent"
                              : "bg-green-500/20 text-green-400 border-transparent"
                          }`}>
                            {entry.sourceType === "share" ? "My Share" : "Shared"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {entry.size && !entry.isDir && (
                            <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                          )}
                          {entry.isDir && <span className="text-xs text-zinc-500">—</span>}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavorite(entry.id);
                            }}
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-amber-500/20 hover:text-amber-400"
                            aria-label="Remove from favorites"
                          >
                            <Star className="w-3.5 h-3.5 text-amber-400" weight="fill" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Status Bar */}
                  <div className="h-8 flex items-center justify-between px-5 text-xs text-zinc-500 flex-shrink-0 border-t border-zinc-800">
                    <span>
                      {favorites.length} {favorites.length === 1 ? "favorite" : "favorites"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md space-y-4">
                    <div className="w-16 h-16 mx-auto bg-zinc-800 rounded-2xl flex items-center justify-center">
                      <Star className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">No Favorites Yet</h2>
                    <p className="text-zinc-500">
                      Star files and folders from the file browser to save them here for quick access
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setActiveView("all-files")}
                      className="text-zinc-400 border-zinc-700 hover:bg-zinc-800"
                    >
                      Browse All Files
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "settings" && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SettingsPage
                onRunSetupWizard={() => setShowSetupWizard(true)}
                onOpenSharing={() => setActiveView("my-shares")}
                onOpenMounts={() => setActiveView("shared-with-me")}
              />
            </div>
          )}
      </div>

      {/* Dialogs */}
      <ShareDialog
        isOpen={activeDialog === "share"}
        onClose={() => {
          setActiveDialog(null);
          setPendingSharePath(null);
        }}
        onShareCreated={handleShareCreated}
        initialPath={pendingSharePath}
        previewMode={uiPreview}
      />
      <ConnectDialog
        isOpen={activeDialog === "connect"}
        onClose={() => {
          setActiveDialog(null);
          setPendingJoinCode(null);
          setPendingPeerName(null);
        }}
        onConnectionCreated={handleConnectionCreated}
        initialCode={pendingJoinCode}
        initialPeerName={pendingPeerName}
        previewMode={uiPreview}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg text-white">
              Remove {deleteConfirm?.type === "share" ? "Share" : "Connection"}?
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-400">
              Are you sure you want to remove <span className="font-medium text-zinc-300">{deleteConfirm?.name}</span> from your history?
              {deleteConfirm?.type === "share" && " This will also stop sharing if currently active."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.type === "share") {
                  handleDeleteShare(deleteConfirm.id);
                } else if (deleteConfirm?.type === "connection") {
                  handleRemoveConnection(deleteConfirm.id);
                }
              }}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer progress panel - shows active file transfers */}
      <TransferPanel />
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

// Legacy chrome retained for gradual extraction (Portal is the shell; Finder is the browser)
void Sidebar;
void FileBrowserLegacy;
void AllFilesViewLegacy;

export default App;
