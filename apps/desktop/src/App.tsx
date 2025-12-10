import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
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
} from "lucide-react";
import { SetupWizard } from "@/components/SetupWizard";
import { useWormholeHistory } from "@/hooks/useWormholeHistory";
import { useFileIndex, type IndexEntry } from "@/hooks/useFileIndex";
import { useRecentFiles } from "@/hooks/useRecentFiles";
import { useFavorites } from "@/hooks/useFavorites";
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
const WORMHOLE_BASE_URL = "https://wormhole.dev";

// Extract join code from URL or return as-is
function extractJoinCode(input: string): string | null {
  const trimmed = input.trim();

  // Handle wormhole:// deep links
  if (trimmed.startsWith("wormhole://") || trimmed.startsWith("wormhole:")) {
    const path = trimmed.replace(/^wormhole:\/?\/?/, "").replace(/^(join|j)\//, "");
    const code = path.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (code.length >= 6) {
      return formatJoinCode(code.replace(/-/g, ""));
    }
    return null;
  }

  // Handle https:// web links
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const match = trimmed.match(/\/(?:j|join)\/([A-Za-z0-9-]+)/);
    if (match) {
      const code = match[1].toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length >= 6) {
        return formatJoinCode(code);
      }
    }
    return null;
  }

  // Handle plain codes
  const normalized = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length === 6) {
    return formatJoinCode(normalized);
  }

  // Already formatted code
  if (/^[A-Z0-9]{3}-[A-Z0-9]{3}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
}

// Format a normalized join code with dash
function formatJoinCode(normalized: string): string {
  if (normalized.length === 6) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  return normalized;
}

// Generate share link from join code
function makeShareLink(joinCode: string): string {
  return `${WORMHOLE_BASE_URL}/j/${joinCode}`;
}

type ViewMode = "list" | "grid";
type NavigationView =
  | "all-files"
  | "shared-with-me"
  | "my-shares"
  | "recent"
  | "favorites"
  | "settings";
type DialogType = "share" | "connect" | null;

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

// Helper to format file sizes
function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
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
  if (isDir) return <Folder className={`${className} text-violet-400`} />;

  const ext = name.split(".").pop()?.toLowerCase() || "";

  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "ico"].includes(ext)) {
    return <Image className={`${className} text-pink-400`} />;
  }
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return <Film className={`${className} text-purple-400`} />;
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
  const isActive = share.status === "active";
  const isExpired = share.status === "expired";
  const folderName = getFileName(share.path) || "Shared Folder";

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
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? "hover:bg-violet-500/10" : isExpired ? "hover:bg-amber-500/10" : "hover:bg-zinc-800/50"
      }`}
      onClick={isActive ? onBrowse : undefined}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isActive ? "bg-violet-500/20" : isExpired ? "bg-amber-500/20" : "bg-zinc-700/50"
      }`}>
        <FolderUp className={`w-4 h-4 ${isActive ? "text-violet-400" : isExpired ? "text-amber-400" : "text-zinc-500"}`} />
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
          {share.joinCode && <code className="text-violet-400 font-medium">{share.joinCode}</code>}
          {share.port && <span>Port {share.port}</span>}
          {share.lastActiveAt && <span>{formatRelativeTime(share.lastActiveAt)}</span>}
        </div>
        {/* Share link - truncated */}
        {share.shareLink && (
          <div className="text-xs text-zinc-600 truncate mt-0.5">
            {share.shareLink}
          </div>
        )}
      </div>

      {/* Actions - Right side icons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isActive ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={copyLink}
              className="h-7 w-7 hover:bg-zinc-700"
              aria-label={copied ? "Copied!" : "Copy share link"}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onBrowse(); }}
              className="h-7 w-7 hover:bg-zinc-700"
              aria-label="Browse files"
            >
              <Folder className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onStop(); }}
              className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400"
              aria-label="Stop sharing"
            >
              <X className="w-3.5 h-3.5" />
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
              <Play className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400"
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

// Memoized ShareCard for performance
const MemoizedShareCard = React.memo(ShareCard);

// Connection Card Component - Compact file-viewer style
function ConnectionCard({
  connection,
  onReconnect,
  onDisconnect,
  onRemove,
  onBrowse,
}: {
  connection: ConnectionHistoryItem;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onBrowse: () => void;
}) {
  const isConnected = connection.status === "connected";
  const isConnecting = connection.status === "connecting";
  const mountName = getFileName(connection.mountPoint) || "Remote Share";

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isConnected ? "hover:bg-green-500/10" : "hover:bg-zinc-800/50"
      }`}
      onClick={isConnected ? onBrowse : undefined}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isConnected ? "bg-green-500/20" : isConnecting ? "bg-blue-500/20" : "bg-zinc-700/50"
      }`}>
        {isConnecting ? (
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
        ) : (
          <Download className={`w-4 h-4 ${isConnected ? "text-green-400" : "text-zinc-500"}`} />
        )}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{mountName}</span>
          <StatusBadge status={connection.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {connection.joinCode && <code className="text-green-400 font-medium">{connection.joinCode}</code>}
          {isConnected && connection.mountPoint && <span className="truncate max-w-[200px]">{connection.mountPoint}</span>}
          {connection.lastConnectedAt && <span>{formatRelativeTime(connection.lastConnectedAt)}</span>}
        </div>
        {/* Error message inline */}
        {connection.status === "error" && connection.errorMessage && (
          <p className="text-xs text-red-400 truncate">{connection.errorMessage}</p>
        )}
      </div>

      {/* Actions - Right side icons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isConnected ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onBrowse(); }}
              className="h-7 w-7 hover:bg-zinc-700"
              aria-label="Browse files"
            >
              <Folder className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
              className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400"
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
            className="h-7 w-7"
            aria-label="Connecting..."
          >
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onReconnect(); }}
              className="h-7 w-7 hover:bg-green-500/20 hover:text-green-400"
              aria-label="Reconnect"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400"
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

// Left Sidebar Component
function Sidebar({
  activeView,
  onViewChange,
  shareCount,
  connectionCount,
  recentCount,
  favoritesCount,
}: {
  activeView: NavigationView;
  onViewChange: (view: NavigationView) => void;
  shareCount: number;
  connectionCount: number;
  recentCount: number;
  favoritesCount: number;
}) {
  const mainNavItems = [
    { id: "all-files" as NavigationView, icon: Files, label: "All Files", count: 0 },
    { id: "my-shares" as NavigationView, icon: FolderUp, label: "My Shares", count: shareCount },
    { id: "shared-with-me" as NavigationView, icon: Users, label: "Shared with Me", count: connectionCount },
  ];

  const libraryItems = [
    { id: "recent" as NavigationView, icon: Clock, label: "Recent", count: recentCount },
    { id: "favorites" as NavigationView, icon: Star, label: "Favorites", count: favoritesCount },
  ];

  return (
    <div className="w-52 bg-zinc-900 flex flex-col py-4">
      {/* Logo & Brand */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Share2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-white">Wormhole</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {mainNavItems.map((item) => (
          <Button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            variant="ghost"
            className={`w-full justify-start gap-3 h-9 ${
              activeView === item.id
                ? "bg-violet-500/15 text-violet-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm flex-1 text-left">{item.label}</span>
            {item.count > 0 && (
              <span className="text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded">{item.count}</span>
            )}
          </Button>
        ))}

        {/* Quick Filters - Media Types */}
        <div className="pt-4">
          <span className="px-3 text-[10px] uppercase text-zinc-600 font-medium tracking-wider">Quick Filters</span>
          <div className="flex gap-1 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-xs text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10"
              aria-label="Videos"
            >
              <Film className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-xs text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10"
              aria-label="Images"
            >
              <Image className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-xs text-zinc-500 hover:text-green-400 hover:bg-green-500/10"
              aria-label="Audio"
            >
              <Music className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Library */}
        <div className="pt-4">
          <span className="px-3 text-[10px] uppercase text-zinc-600 font-medium tracking-wider">Library</span>
          <div className="mt-2 space-y-0.5">
            {libraryItems.map((item) => (
              <Button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                variant="ghost"
                className={`w-full justify-start gap-3 h-9 ${
                  activeView === item.id
                    ? "bg-violet-500/15 text-violet-400"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm flex-1 text-left">{item.label}</span>
                {item.count > 0 && (
                  <span className="text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded">{item.count}</span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="px-3">
        <Button
          onClick={() => onViewChange("settings")}
          variant="ghost"
          className={`w-full justify-start gap-3 h-9 ${
            activeView === "settings"
              ? "bg-violet-500/15 text-violet-400"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800"
          }`}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Settings</span>
        </Button>
      </div>
    </div>
  );
}

// File Browser Component
function FileBrowser({
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

  // Render a file item with context menu
  const renderFileItem = (file: FileEntry, isGridView: boolean) => {
    const isSelected = selectedFiles.has(file.path);

    const content = isGridView ? (
      <div
        className={`flex flex-col items-center gap-2 p-4 h-auto rounded-md cursor-default ${
          isSelected
            ? "bg-violet-500/20"
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
        className={`w-full grid grid-cols-[1fr_100px_80px] gap-4 items-center h-auto py-2 px-2 rounded-md cursor-default ${
          isSelected
            ? "bg-violet-500/20"
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
            <Star className={`w-4 h-4 mr-2 ${isFavorite(file.path) ? "fill-amber-400" : ""}`} />
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
          {/* All Files (root) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToAllFiles}
            className="text-zinc-400 hover:text-white h-7 px-2"
          >
            <Files className="w-3.5 h-3.5" />
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 h-8 bg-zinc-800 border-0 pl-8 text-sm text-white placeholder:text-zinc-500 rounded-md"
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
function AllFilesView({
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
      {/* Search Bar */}
      <div className="h-12 flex items-center px-5 gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            type="text"
            placeholder={hasActiveSources ? `Search ${totalFiles.toLocaleString()} files...` : "Search files..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 bg-zinc-800 border-0 pl-9 pr-8 text-sm text-white placeholder:text-zinc-500 rounded-md"
          />
          {isIndexing && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-violet-400 animate-spin" />
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
      {searchQuery ? (
        // Search Results
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-2 text-xs text-zinc-500">
            {searchResults.length} results for "{searchQuery}"
          </div>
          {searchResults.length > 0 ? (
            <div className="px-3 py-1">
              {searchResults.slice(0, 100).map((entry) => (
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
                      ? "bg-violet-500/20 text-violet-400 border-transparent"
                      : "bg-green-500/20 text-green-400 border-transparent"
                  }`}>
                    {entry.root_name}
                  </Badge>
                  {!entry.is_dir && (
                    <span className="text-xs text-zinc-500">{formatSize(entry.size)}</span>
                  )}
                </div>
              ))}
              {searchResults.length > 100 && (
                <p className="text-xs text-zinc-500 text-center py-3">
                  Showing 100 of {searchResults.length} results
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
                    folder.type === "share" ? "text-violet-400" : "text-green-400"
                  }`}>
                    <Folder className="w-5 h-5" />
                  </div>
                  <span className="text-sm text-zinc-300 truncate">{folder.name}</span>
                </div>
                <div className="text-xs">
                  <Badge className={`text-[10px] px-1.5 py-0 ${
                    folder.type === "share"
                      ? "bg-violet-500/20 text-violet-400 border-transparent"
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
                className="gap-2 bg-violet-600 hover:bg-violet-700"
              >
                <Download className="w-4 h-4" />
                Connect to Share
              </Button>
              <Button
                onClick={onOpenShareDialog}
                variant="outline"
                className="gap-2 border-zinc-700 hover:bg-zinc-800"
              >
                <Upload className="w-4 h-4" />
                Share a Folder
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onShareCreated: (path: string, joinCode: string, port: number, shareId: string, expirationOption: ExpirationOption, expiresAt: number | null) => void;
}) {
  const [sharePath, setSharePath] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [shareId, setShareId] = useState("");
  const [port, setPort] = useState<number>(4433);
  const [hostIpAddress, setHostIpAddress] = useState<string>("");
  const [isHosting, setIsHosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [expirationOption, setExpirationOption] = useState<ExpirationOption>("forever");

  useEffect(() => {
    if (!isOpen) return;

    let unlistenHost: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenHost = await listen<ServiceEvent>("host-event", (event) => {
        const data = event.payload;
        // Only handle errors here - share creation is handled by the direct invoke result
        // This avoids stale closure issues with shareId
        if (data.type === "Error") {
          setStatusMessage(`Error: ${data.message}`);
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

  const handleStartHosting = async () => {
    if (!sharePath) return;

    try {
      // Generate a unique ID for this share
      const newShareId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setShareId(newShareId);

      const ips = await invoke<string[]>("get_local_ip");
      if (ips && ips.length > 0) {
        setHostIpAddress(ips[0]);
      }

      // Calculate expiration
      const expiresInMs = expirationToMs(expirationOption);
      const expiresAt = expiresInMs ? Date.now() + expiresInMs : null;

      // Use the expiration-aware command
      const result = await invoke<{ id: string; share_path: string; port: number; join_code: string }>(
        "start_hosting_with_expiration",
        { id: newShareId, path: sharePath, port: null, expiresInMs }
      );

      setJoinCode(result.join_code);
      setPort(result.port);
      setIsHosting(true);
      onShareCreated(result.share_path, result.join_code, result.port, result.id, expirationOption, expiresAt);
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
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
      setPort(4433);
      setHostIpAddress("");
      onClose();
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
    }
  };

  const shareLink = joinCode ? makeShareLink(joinCode) : "";

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg text-white">
            {isHosting ? "Sharing Active" : "Share a Folder"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            {isHosting
              ? "Share this link with anyone you want to give access"
              : "Choose a folder to share with others"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!isHosting ? (
            <>
              <div className="space-y-3">
                {sharePath ? (
                  <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                    <Folder className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <span className="text-sm text-white flex-1 truncate">{sharePath}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSharePath("")}
                      className="h-6 w-6 hover:bg-zinc-700"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={selectFolder}
                    className="w-full h-24 border-2 border-dashed border-zinc-700/50 hover:border-violet-500/50 bg-transparent"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Folder className="w-8 h-8 text-zinc-600" />
                      <span className="text-sm text-zinc-400">Click to choose a folder</span>
                    </div>
                  </Button>
                )}
              </div>

              {/* Expiration dropdown */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Link Expiration</label>
                <Select
                  value={expirationOption}
                  onValueChange={(value) => setExpirationOption(value as ExpirationOption)}
                >
                  <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
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
                disabled={!sharePath}
                className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white"
              >
                Start Sharing
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-3">
                  <code className="flex-1 text-sm font-mono text-white truncate">
                    {shareLink}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyShareLink}
                    className="h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>Code: <code className="text-zinc-300">{joinCode}</code></span>
                  {hostIpAddress && (
                    <>
                      <span className="text-zinc-700">•</span>
                      <span>LAN: <code className="text-zinc-300">{hostIpAddress}:{port}</code></span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                <Folder className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span className="text-sm text-zinc-300 truncate">{sharePath}</span>
              </div>

              <Button
                onClick={handleStopHosting}
                variant="destructive"
                className="w-full h-10"
              >
                Stop Sharing
              </Button>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-zinc-400 text-center bg-zinc-800 rounded-xl px-4 py-3">
              {statusMessage}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Connect Dialog Component
function ConnectDialog({
  isOpen,
  onClose,
  onConnectionCreated,
  initialCode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnectionCreated: (joinCode: string, mountPoint: string, connectionId: string) => void;
  initialCode?: string | null;
}) {
  const [hostAddress, setHostAddress] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Validate join code/link as user types
  const isValidCode = hostAddress.trim().length > 0 && (
    extractJoinCode(hostAddress) !== null ||
    (hostAddress.includes(":") && !hostAddress.includes("://"))
  );

  // Set initial code when dialog opens with a code
  useEffect(() => {
    if (isOpen && initialCode) {
      setHostAddress(initialCode);
    }
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
          setMountPath(data.mountpoint || "");
          setStatusMessage(`Mounted at ${data.mountpoint}`);

          const extractedCode = extractJoinCode(hostAddress);
          onConnectionCreated(extractedCode || hostAddress, data.mountpoint || "", connectionId);
        } else if (data.type === "Error") {
          setIsConnected(false);
          setStatusMessage(`Error: ${data.message}`);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenMount) {
        unlistenMount();
      }
    };
  }, [isOpen, hostAddress, connectionId, onConnectionCreated]);

  const selectFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setMountPath(selected);
      }
    } catch (e) {
      console.error("Failed to open folder dialog:", e);
    }
  };

  const handleConnect = async () => {
    if (!hostAddress || !mountPath) return;

    try {
      const extractedCode = extractJoinCode(hostAddress);

      // Generate a unique ID for this connection
      const newConnectionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setConnectionId(newConnectionId);

      if (extractedCode) {
        // Use the new ID-based command for multi-connection support
        const result = await invoke<{ id: string; mount_point: string; join_code: string }>(
          "connect_with_code_and_id",
          {
            id: newConnectionId,
            joinCode: extractedCode,
            mountPath,
          }
        );
        setIsConnected(true);
        setMountPath(result.mount_point);
        onConnectionCreated(result.join_code, result.mount_point, result.id);
      } else if (hostAddress.includes(":") && !hostAddress.includes("://")) {
        // Direct IP connection (legacy, still uses default ID)
        await invoke("connect_to_peer", { hostAddress, mountPath });
      } else {
        setStatusMessage("Please enter a valid share link, join code, or address");
        return;
      }
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
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
      onClose();
    } catch (e) {
      setStatusMessage(`Disconnected (${e})`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg text-white">
            {isConnected ? "Connected" : "Connect to Share"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            {isConnected
              ? "The shared folder is mounted and ready"
              : "Paste a share link or join code"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!isConnected ? (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Input
                    type="text"
                    value={hostAddress}
                    onChange={(e) => setHostAddress(e.target.value)}
                    placeholder="Paste link or code..."
                    className={`bg-zinc-800 border text-white text-center font-mono text-sm placeholder:text-zinc-500 ${
                      hostAddress.trim().length === 0
                        ? "border-transparent"
                        : isValidCode
                        ? "border-green-500/50"
                        : "border-red-500/50"
                    }`}
                  />
                  {hostAddress.trim().length > 0 && !isValidCode && (
                    <p className="text-xs text-red-400 text-center">
                      Enter a valid share link (wormhole.dev/j/...) or join code (ABC-123)
                    </p>
                  )}
                </div>

                {mountPath ? (
                  <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                    <Folder className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <span className="text-sm text-white flex-1 truncate">{mountPath}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMountPath("")}
                      className="h-6 w-6 hover:bg-zinc-700"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={selectFolder}
                    className="w-full h-20 border-2 border-dashed border-zinc-700/50 hover:border-violet-500/50 bg-transparent"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Folder className="w-6 h-6 text-zinc-600" />
                      <span className="text-xs text-zinc-400">Choose mount location</span>
                    </div>
                  </Button>
                )}
              </div>

              <Button
                onClick={handleConnect}
                disabled={!hostAddress || !mountPath}
                className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white"
              >
                Connect
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                  <Folder className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <span className="text-sm text-white truncate">{mountPath}</span>
                </div>
                <div className="text-xs text-zinc-500 px-1">
                  Connected to: <code className="text-zinc-400">{hostAddress}</code>
                </div>
              </div>

              <Button onClick={handleDisconnect} variant="destructive" className="w-full h-10">
                Disconnect
              </Button>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-zinc-400 text-center bg-zinc-800 rounded-xl px-4 py-3">
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

function SettingsPage({ onRunSetupWizard }: { onRunSetupWizard: () => void }) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

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
                <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center">
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
                      className="gap-2 bg-violet-600 hover:bg-violet-700"
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
        </div>
      </div>
    </div>
  );
}

// Check if setup has been completed
const SETUP_COMPLETE_KEY = "wormhole_setup_complete";

function App() {
  const [activeView, setActiveView] = useState<NavigationView>("all-files");
  const [viewMode] = useState<ViewMode>("list");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [currentFolderSource, setCurrentFolderSource] = useState<{ id: string; type: "share" | "connection" } | null>(null);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(() => {
    const completed = localStorage.getItem(SETUP_COMPLETE_KEY);
    return completed !== "true";
  });
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [_localIp, setLocalIp] = useState<string>("");

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
    removeConnection,
    setConnectionStatus,
    syncWithBackend,
  } = useWormholeHistory();

  // Use the file index hook for instant search
  const {
    searchQuery: globalSearchQuery,
    setSearchQuery: setGlobalSearchQuery,
    searchResults,
    isIndexing,
    totalFiles,
    totalFolders,
    refreshIndex,
  } = useFileIndex(shares, connections);

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
    // Note: addFavorite available - toggleFavorite is used via FileBrowser
    removeFavorite,
    toggleFavorite,
    isFavorite,
    totalFavorites,
  } = useFavorites(shares, connections);

  // Handle deep link events
  useEffect(() => {
    const setupDeepLink = async () => {
      try {
        const unlisten = await onOpenUrl((urls: string[]) => {
          for (const url of urls) {
            const code = extractJoinCode(url);
            if (code) {
              console.log("Received deep link with code:", code);
              setPendingJoinCode(code);
              setActiveDialog("connect");
            }
          }
        });

        return unlisten;
      } catch (e) {
        console.error("Failed to setup deep link handler:", e);
      }
    };

    const cleanupPromise = setupDeepLink();
    return () => {
      cleanupPromise.then((unlisten) => unlisten?.());
    };
  }, []);

  // Also listen for backend-emitted deep link events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await listen<{ join_code: string; url: string }>("deep-link-join", (event) => {
        const { join_code } = event.payload;
        console.log("Received deep-link-join event:", join_code);
        setPendingJoinCode(join_code);
        setActiveDialog("connect");
      });
    };

    setup();
    return () => unlisten?.();
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

  const handleSetupComplete = useCallback(() => {
    localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    setShowSetupWizard(false);
  }, []);

  // Share operations
  const handleShareCreated = useCallback((path: string, joinCode: string, port: number, shareId: string, expirationOption: ExpirationOption, expiresAt: number | null) => {
    addShare(path, joinCode, port, undefined, shareId, expirationOption, expiresAt);
    setCurrentFolder(path);
    setCurrentFolderSource({ id: shareId, type: "share" });
    setActiveDialog(null);
  }, [addShare]);

  const handleStopShare = useCallback(async (shareId: string) => {
    // Optimistic update - immediately show as inactive
    setShareStatus(shareId, "inactive");
    try {
      // Then call backend
      await invoke("stop_hosting_by_id", { id: shareId });
    } catch (e) {
      console.error("Failed to stop share:", e);
      // Revert on error by syncing with actual backend state
      await syncWithBackend();
    }
  }, [setShareStatus, syncWithBackend]);

  const handleResumeShare = useCallback(async (share: ShareHistoryItem) => {
    // Optimistic update - immediately show as active
    setShareStatus(share.id, "active");
    try {
      // Then call backend
      await invoke<{ id: string; share_path: string; port: number; join_code: string }>(
        "start_hosting_with_id",
        { id: share.id, path: share.path, port: share.port }
      );
      setCurrentFolder(share.path);
      setCurrentFolderSource({ id: share.id, type: "share" });
    } catch (e) {
      console.error("Failed to resume share:", e);
      // Revert on error by syncing with actual backend state
      await syncWithBackend();
    }
  }, [setShareStatus, syncWithBackend]);

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

  // Connection operations
  const handleConnectionCreated = useCallback((joinCode: string, mountPoint: string, connectionId: string) => {
    const conn = addConnection(joinCode, mountPoint, undefined, connectionId);
    setConnectionStatus(conn.id, "connected");
    setCurrentFolder(mountPoint);
    setCurrentFolderSource({ id: conn.id, type: "connection" });
    setActiveDialog(null);
  }, [addConnection, setConnectionStatus]);

  const handleDisconnect = useCallback(async (connectionId: string) => {
    // Optimistic update - immediately show as disconnected
    setConnectionStatus(connectionId, "disconnected");
    try {
      // Then call backend
      await invoke("disconnect_by_id", { id: connectionId });
    } catch (e) {
      console.error("Failed to disconnect:", e);
      // Revert on error by syncing with actual backend state
      await syncWithBackend();
    }
  }, [setConnectionStatus, syncWithBackend]);

  const handleReconnect = useCallback(async (connection: ConnectionHistoryItem) => {
    // Optimistic update - show as connecting
    setConnectionStatus(connection.id, "connecting");
    try {
      // Need to select a mount path again
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        // Use ID-based connect for multi-connection support
        await invoke("connect_with_code_and_id", {
          id: connection.id,
          joinCode: connection.joinCode,
          mountPath: selected,
        });
        // Optimistic update - show as connected
        setConnectionStatus(connection.id, "connected");
      } else {
        setConnectionStatus(connection.id, "disconnected");
      }
    } catch (e) {
      console.error("Failed to reconnect:", e);
      setConnectionStatus(connection.id, "error", String(e));
    }
  }, [setConnectionStatus]);

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

  // Show setup wizard on first run
  if (showSetupWizard) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-900 text-white select-none overflow-hidden">
      {/* Title bar background */}
      <div className="h-8 w-full flex-shrink-0 bg-zinc-900 absolute top-0 left-0 right-0 z-40" />
      {/* Draggable title bar region for macOS */}
      <div
        data-tauri-drag-region
        className="h-8 w-full flex-shrink-0 absolute top-0 left-0 right-0 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {/* Layout */}
      <div className="flex flex-1 min-h-0 pt-8">
        {/* Left Sidebar */}
        <Sidebar
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            // Reset folder navigation when switching to all-files view
            if (view === "all-files") {
              setCurrentFolder("");
              setCurrentFolderSource(null);
            }
          }}
          shareCount={shares.length}
          connectionCount={connections.length}
          recentCount={totalRecent}
          favoritesCount={totalFavorites}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Minimal Header - only show when not in file browser */}
          {activeView !== "all-files" && (
            <div className="h-12 flex items-center justify-between px-6 flex-shrink-0">
              <h1 className="text-base font-medium text-white">
                {activeView === "shared-with-me" && "Shared with Me"}
                {activeView === "my-shares" && "My Shares"}
                {activeView === "recent" && "Recent"}
                {activeView === "favorites" && "Favorites"}
                {activeView === "settings" && "Settings"}
              </h1>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveDialog("connect")}
                  className="text-zinc-400 hover:text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Connect
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveDialog("share")}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          )}

          {/* View Content */}
          {activeView === "all-files" && (
            <>
              {currentFolder ? (
                <FileBrowser
                  rootPath={currentFolder}
                  rootName={getFileName(currentFolder) || "Folder"}
                  viewMode={viewMode}
                  sourceId={currentFolderSource?.id || ""}
                  sourceType={currentFolderSource?.type || "share"}
                  onToggleFavorite={toggleFavorite}
                  isFavorite={isFavorite}
                  onBackToAllFiles={() => {
                    setCurrentFolder("");
                    setCurrentFolderSource(null);
                  }}
                />
              ) : (
                <AllFilesView
                  shares={shares}
                  connections={connections}
                  searchQuery={globalSearchQuery}
                  setSearchQuery={setGlobalSearchQuery}
                  searchResults={searchResults}
                  isIndexing={isIndexing}
                  totalFiles={totalFiles}
                  totalFolders={totalFolders}
                  onRefreshIndex={refreshIndex}
                  onBrowseShare={(path) => {
                    const share = shares.find(s => s.path === path);
                    setCurrentFolder(path);
                    if (share) setCurrentFolderSource({ id: share.id, type: "share" });
                  }}
                  onBrowseConnection={(mountPoint) => {
                    const conn = connections.find(c => c.mountPoint === mountPoint);
                    setCurrentFolder(mountPoint);
                    if (conn) setCurrentFolderSource({ id: conn.id, type: "connection" });
                  }}
                  onOpenShareDialog={() => setActiveDialog("share")}
                  onOpenConnectDialog={() => setActiveDialog("connect")}
                />
              )}
            </>
          )}

          {activeView === "shared-with-me" && (
            <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
              {connections.length > 0 ? (
                <>
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
                      className="h-6 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      New Connection
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md space-y-4">
                    <Users className="w-16 h-16 mx-auto text-zinc-700" />
                    <h2 className="text-xl font-semibold text-white">
                      No Connections Yet
                    </h2>
                    <p className="text-zinc-500">
                      Files that others share with you will appear here
                    </p>
                    <Button
                      onClick={() => setActiveDialog("connect")}
                      className="gap-2 bg-violet-600 hover:bg-violet-700"
                    >
                      <Download className="w-4 h-4" />
                      Connect to Share
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "my-shares" && (
            <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
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
                      className="h-6 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                    >
                      <Upload className="w-3 h-3 mr-1" />
                      New Share
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md space-y-4">
                    <FolderUp className="w-16 h-16 mx-auto text-zinc-700" />
                    <h2 className="text-xl font-semibold text-white">
                      No Shares Yet
                    </h2>
                    <p className="text-zinc-500">
                      Folders you share will appear here
                    </p>
                    <Button
                      onClick={() => setActiveDialog("share")}
                      className="gap-2 bg-violet-600 hover:bg-violet-700"
                    >
                      <Upload className="w-4 h-4" />
                      Share a Folder
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
                              ? "bg-violet-500/20 text-violet-400 border-transparent"
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
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
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

          {activeView === "settings" && <SettingsPage onRunSetupWizard={() => setShowSetupWizard(true)} />}
        </div>
      </div>

      {/* Dialogs */}
      <ShareDialog
        isOpen={activeDialog === "share"}
        onClose={() => setActiveDialog(null)}
        onShareCreated={handleShareCreated}
      />
      <ConnectDialog
        isOpen={activeDialog === "connect"}
        onClose={() => {
          setActiveDialog(null);
          setPendingJoinCode(null);
        }}
        onConnectionCreated={handleConnectionCreated}
        initialCode={pendingJoinCode}
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
    </div>
  );
}

export default App;
