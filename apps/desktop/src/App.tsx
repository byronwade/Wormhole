import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Files,
  Upload,
  Download,
  Folder,
  File,
  Settings,
  Search,
  ChevronRight,
  Home,
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
  Link,
  Trash2,
  Play,
  RefreshCw,
} from "lucide-react";
import { SetupWizard } from "@/components/SetupWizard";
import { useWormholeHistory } from "@/hooks/useWormholeHistory";
import type { ShareHistoryItem, ConnectionHistoryItem, ShareStatus, ConnectionStatus } from "@/types/history";

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
  };

  const c = config[status] || config.inactive;

  return (
    <Badge className={`${c.bg} ${c.text} border-transparent text-xs`}>
      {c.pulse && <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} animate-pulse mr-1.5`} />}
      {c.label}
    </Badge>
  );
}

// Share Card Component
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
  const isActive = share.status === "active";
  const folderName = share.path.split("/").pop() || "Shared Folder";

  const copyLink = () => {
    navigator.clipboard.writeText(share.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isActive ? "bg-violet-500/20" : "bg-zinc-700/50"
        }`}>
          <FolderUp className={`w-5 h-5 ${isActive ? "text-violet-400" : "text-zinc-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">{folderName}</h3>
            <StatusBadge status={share.status} />
          </div>
          <p className="text-xs text-zinc-500 truncate">{share.path}</p>
        </div>
      </div>

      {/* Share Link */}
      {isActive && (
        <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg p-2">
          <Link className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <code className="flex-1 text-xs font-mono text-zinc-300 truncate">{share.shareLink}</code>
          <Button
            variant="ghost"
            size="icon"
            onClick={copyLink}
            className="h-6 w-6 hover:bg-zinc-700"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      )}

      {/* Info Row */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>Code: <code className="text-zinc-400">{share.joinCode}</code></span>
        <span>Port: <code className="text-zinc-400">{share.port}</code></span>
        <span className="ml-auto">{formatRelativeTime(share.lastActiveAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {isActive ? (
          <>
            <Button
              size="sm"
              onClick={onBrowse}
              className="flex-1 h-8 bg-violet-600 hover:bg-violet-700"
            >
              <Folder className="w-3.5 h-3.5 mr-1.5" />
              Browse
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onStop}
              className="h-8 border-zinc-700 hover:bg-zinc-700"
            >
              Stop
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={onResume}
              className="flex-1 h-8 bg-violet-600 hover:bg-violet-700"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-8 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Connection Card Component
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
  const mountName = connection.mountPoint.split("/").pop() || "Remote Share";

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isConnected ? "bg-green-500/20" : "bg-zinc-700/50"
        }`}>
          <Users className={`w-5 h-5 ${isConnected ? "text-green-400" : "text-zinc-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">{mountName}</h3>
            <StatusBadge status={connection.status} />
          </div>
          <p className="text-xs text-zinc-500 truncate">
            Code: <code className="text-zinc-400">{connection.joinCode}</code>
          </p>
        </div>
      </div>

      {/* Mount Point */}
      {isConnected && (
        <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg p-2">
          <Folder className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="flex-1 text-xs text-zinc-300 truncate">{connection.mountPoint}</span>
        </div>
      )}

      {/* Error message */}
      {connection.status === "error" && connection.errorMessage && (
        <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          {connection.errorMessage}
        </p>
      )}

      {/* Info Row */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>{formatRelativeTime(connection.lastConnectedAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {isConnected ? (
          <>
            <Button
              size="sm"
              onClick={onBrowse}
              className="flex-1 h-8 bg-violet-600 hover:bg-violet-700"
            >
              <Folder className="w-3.5 h-3.5 mr-1.5" />
              Browse
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDisconnect}
              className="h-8 border-zinc-700 hover:bg-zinc-700"
            >
              Disconnect
            </Button>
          </>
        ) : isConnecting ? (
          <Button size="sm" disabled className="flex-1 h-8">
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Connecting...
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              onClick={onReconnect}
              className="flex-1 h-8 bg-violet-600 hover:bg-violet-700"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="h-8 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Left Sidebar Component
function Sidebar({
  activeView,
  onViewChange,
  shareCount,
  connectionCount,
}: {
  activeView: NavigationView;
  onViewChange: (view: NavigationView) => void;
  shareCount: number;
  connectionCount: number;
}) {
  const mainNavItems = [
    { id: "all-files" as NavigationView, icon: Files, label: "All Files", count: 0 },
    { id: "shared-with-me" as NavigationView, icon: Users, label: "Shared with Me", count: connectionCount },
    { id: "my-shares" as NavigationView, icon: FolderUp, label: "My Shares", count: shareCount },
    { id: "recent" as NavigationView, icon: Clock, label: "Recent", count: 0 },
  ];

  const collectionItems = [
    { id: "favorites" as NavigationView, icon: Star, label: "Favorites" },
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

        {/* Favorites */}
        <div className="pt-4">
          {collectionItems.map((item) => (
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
              <span className="text-sm">{item.label}</span>
            </Button>
          ))}
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
  viewMode,
}: {
  rootPath: string;
  viewMode: ViewMode;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

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
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    if (parent.length >= rootPath.length) {
      loadDirectory(parent);
    }
  };

  const pathParts = currentPath.replace(rootPath, "").split("/").filter(Boolean);

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-zinc-900 min-h-0">
      {/* Top Bar */}
      <div className="h-12 flex items-center px-5 gap-3 flex-shrink-0">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadDirectory(rootPath)}
            className="text-zinc-400 hover:text-white h-7 px-2"
          >
            <Home className="w-3.5 h-3.5" />
          </Button>
          {pathParts.map((part, i) => (
            <div key={i} className="flex items-center">
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  loadDirectory(rootPath + "/" + pathParts.slice(0, i + 1).join("/"))
                }
                className="text-zinc-400 hover:text-white h-7 px-2 text-sm"
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
                <Button
                  variant="ghost"
                  onClick={goUp}
                  className="w-full grid grid-cols-[1fr_100px_80px] gap-4 items-center justify-start h-auto py-2 hover:bg-zinc-800/50 rounded-md"
                >
                  <div className="flex items-center gap-2.5">
                    <Folder className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">..</span>
                  </div>
                </Button>
              )}
              {filteredFiles.map((file) => (
                <Button
                  key={file.path}
                  variant="ghost"
                  onClick={() => handleFileClick(file, false)}
                  onDoubleClick={() => handleFileClick(file, true)}
                  className={`w-full grid grid-cols-[1fr_100px_80px] gap-4 items-center justify-start h-auto py-2 rounded-md ${
                    selectedFiles.has(file.path)
                      ? "bg-violet-500/20 hover:bg-violet-500/30"
                      : "hover:bg-zinc-800/50"
                  }`}
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
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {currentPath !== rootPath && (
              <Button
                variant="ghost"
                onClick={goUp}
                className="flex flex-col items-center gap-2 p-4 h-auto hover:bg-zinc-900"
              >
                <Folder className="w-12 h-12 text-zinc-500" />
                <span className="text-xs text-zinc-400">..</span>
              </Button>
            )}
            {filteredFiles.map((file) => (
              <Button
                key={file.path}
                variant="ghost"
                onClick={() => handleFileClick(file, false)}
                onDoubleClick={() => handleFileClick(file, true)}
                className={`flex flex-col items-center gap-2 p-4 h-auto ${
                  selectedFiles.has(file.path)
                    ? "bg-violet-500/20 hover:bg-violet-500/30"
                    : "hover:bg-zinc-900"
                }`}
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
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="h-8 flex items-center justify-between px-5 text-xs text-zinc-500 flex-shrink-0">
        <span>
          {filteredFiles.length} {filteredFiles.length === 1 ? "item" : "items"}
        </span>
      </div>
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
  onShareCreated: (path: string, joinCode: string, port: number) => void;
}) {
  const [sharePath, setSharePath] = useState("");
  const [port] = useState(4433);
  const [joinCode, setJoinCode] = useState("");
  const [hostIpAddress, setHostIpAddress] = useState<string>("");
  const [isHosting, setIsHosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    let unlistenHost: (() => void) | null = null;
    let hasEmitted = false;

    const setupListeners = async () => {
      unlistenHost = await listen<ServiceEvent>("host-event", (event) => {
        const data = event.payload;
        if (data.type === "HostStarted" && !hasEmitted) {
          hasEmitted = true;
          const code = data.join_code || "";
          setJoinCode(code);
          setIsHosting(true);
          if (data.share_path) {
            setSharePath(data.share_path);
            onShareCreated(data.share_path, code, data.port || port);
          }
          setStatusMessage("");
        } else if (data.type === "Error") {
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
  }, [isOpen, onShareCreated, port]);

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
      const ips = await invoke<string[]>("get_local_ip");
      if (ips && ips.length > 0) {
        setHostIpAddress(ips[0]);
      }

      await invoke("start_hosting", { path: sharePath, port });
      setIsHosting(true);
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
    }
  };

  const handleStopHosting = async () => {
    try {
      await invoke("stop_hosting");
      setIsHosting(false);
      setJoinCode("");
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
  onConnectionCreated: (joinCode: string, mountPoint: string) => void;
  initialCode?: string | null;
}) {
  const [hostAddress, setHostAddress] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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
          onConnectionCreated(extractedCode || hostAddress, data.mountpoint || "");
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
  }, [isOpen, hostAddress, onConnectionCreated]);

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

      if (extractedCode) {
        await invoke("connect_with_code", {
          joinCode: extractedCode,
          mountPath,
        });
      } else if (hostAddress.includes(":") && !hostAddress.includes("://")) {
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
      await invoke("disconnect");
      setIsConnected(false);
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
                <Input
                  type="text"
                  value={hostAddress}
                  onChange={(e) => setHostAddress(e.target.value)}
                  placeholder="Paste link or code..."
                  className="bg-zinc-800 border-0 text-white text-center font-mono text-sm placeholder:text-zinc-500"
                />

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
function SettingsPage({ onRunSetupWizard }: { onRunSetupWizard: () => void }) {
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
                    <span className="text-sm text-zinc-500">Version 0.1.0</span>
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
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(() => {
    const completed = localStorage.getItem(SETUP_COMPLETE_KEY);
    return completed !== "true";
  });
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);

  // Use the history hook
  const {
    shares,
    connections,
    addShare,
    removeShare,
    setShareStatus,
    getActiveShare,
    addConnection,
    removeConnection,
    setConnectionStatus,
    getActiveConnection,
  } = useWormholeHistory();

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

  const handleSetupComplete = useCallback(() => {
    localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    setShowSetupWizard(false);
  }, []);

  // Share operations
  const handleShareCreated = useCallback((path: string, joinCode: string, port: number) => {
    addShare(path, joinCode, port);
    setCurrentFolder(path);
    setActiveDialog(null);
  }, [addShare]);

  const handleStopShare = useCallback(async (shareId: string) => {
    try {
      await invoke("stop_hosting");
      setShareStatus(shareId, "inactive");
    } catch (e) {
      console.error("Failed to stop share:", e);
    }
  }, [setShareStatus]);

  const handleResumeShare = useCallback(async (share: ShareHistoryItem) => {
    try {
      await invoke("start_hosting", { path: share.path, port: share.port });
      setShareStatus(share.id, "active");
      setCurrentFolder(share.path);
    } catch (e) {
      console.error("Failed to resume share:", e);
    }
  }, [setShareStatus]);

  const handleDeleteShare = useCallback((shareId: string) => {
    removeShare(shareId);
  }, [removeShare]);

  // Connection operations
  const handleConnectionCreated = useCallback((joinCode: string, mountPoint: string) => {
    const conn = addConnection(joinCode, mountPoint);
    setConnectionStatus(conn.id, "connected");
    setCurrentFolder(mountPoint);
    setActiveDialog(null);
  }, [addConnection, setConnectionStatus]);

  const handleDisconnect = useCallback(async (connectionId: string) => {
    try {
      await invoke("disconnect");
      setConnectionStatus(connectionId, "disconnected");
    } catch (e) {
      console.error("Failed to disconnect:", e);
    }
  }, [setConnectionStatus]);

  const handleReconnect = useCallback(async (connection: ConnectionHistoryItem) => {
    setConnectionStatus(connection.id, "connecting");
    try {
      // Need to select a mount path again
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        await invoke("connect_with_code", {
          joinCode: connection.joinCode,
          mountPath: selected,
        });
        // The mount-event listener will update the status
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
  }, [removeConnection]);

  // Get active items for determining if buttons should be disabled
  const activeShare = getActiveShare();
  const activeConnection = getActiveConnection();

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
          onViewChange={setActiveView}
          shareCount={shares.length}
          connectionCount={connections.length}
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
                  disabled={!!activeConnection}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Connect
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveDialog("share")}
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={!!activeShare}
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
                <FileBrowser rootPath={currentFolder} viewMode={viewMode} />
              ) : (
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
                        onClick={() => setActiveDialog("connect")}
                        className="gap-2 bg-violet-600 hover:bg-violet-700"
                        disabled={!!activeConnection}
                      >
                        <Download className="w-4 h-4" />
                        Connect to Share
                      </Button>
                      <Button
                        onClick={() => setActiveDialog("share")}
                        variant="outline"
                        className="gap-2 border-zinc-700 hover:bg-zinc-800"
                        disabled={!!activeShare}
                      >
                        <Upload className="w-4 h-4" />
                        Share a Folder
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeView === "shared-with-me" && (
            <div className="flex-1 overflow-y-auto p-6">
              {connections.length > 0 ? (
                <div className="max-w-2xl mx-auto space-y-4">
                  <p className="text-sm text-zinc-500 mb-4">
                    {connections.length} connection{connections.length !== 1 ? "s" : ""} in history
                  </p>
                  {connections.map((conn) => (
                    <ConnectionCard
                      key={conn.id}
                      connection={conn}
                      onReconnect={() => handleReconnect(conn)}
                      onDisconnect={() => handleDisconnect(conn.id)}
                      onRemove={() => handleRemoveConnection(conn.id)}
                      onBrowse={() => {
                        setCurrentFolder(conn.mountPoint);
                        setActiveView("all-files");
                      }}
                    />
                  ))}
                </div>
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
            <div className="flex-1 overflow-y-auto p-6">
              {shares.length > 0 ? (
                <div className="max-w-2xl mx-auto space-y-4">
                  <p className="text-sm text-zinc-500 mb-4">
                    {shares.length} share{shares.length !== 1 ? "s" : ""} in history
                  </p>
                  {shares.map((share) => (
                    <ShareCard
                      key={share.id}
                      share={share}
                      onResume={() => handleResumeShare(share)}
                      onStop={() => handleStopShare(share.id)}
                      onDelete={() => handleDeleteShare(share.id)}
                      onBrowse={() => {
                        setCurrentFolder(share.path);
                        setActiveView("all-files");
                      }}
                    />
                  ))}
                </div>
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <Clock className="w-16 h-16 mx-auto text-zinc-700" />
                <h2 className="text-xl font-semibold text-white">No Recent Files</h2>
                <p className="text-zinc-500">
                  Your recently accessed files will appear here
                </p>
              </div>
            </div>
          )}

          {activeView === "favorites" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <Star className="w-16 h-16 mx-auto text-zinc-700" />
                <h2 className="text-xl font-semibold text-white">
                  No Favorites Yet
                </h2>
                <p className="text-zinc-500">
                  Star your favorite files and folders to find them quickly
                </p>
              </div>
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
    </div>
  );
}

export default App;
