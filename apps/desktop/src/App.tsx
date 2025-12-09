import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

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
import { open } from "@tauri-apps/plugin-dialog";
import {
  Files,
  Upload,
  Download,
  Folder,
  File,
  Settings,
  Grid,
  List,
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
  HardDrive,
  Star,
  Users,
  FolderUp,
  Trash2,
  Share2,
  Link,
} from "lucide-react";
import { SetupWizard } from "@/components/SetupWizard";

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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface Connection {
  name: string;
  path: string;
  type: "host" | "client";
  joinCode?: string;
  shareLink?: string;
  remoteAddress?: string;
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

// Helper to get hostname
async function getHostname(): Promise<string> {
  try {
    const ips = await invoke<string[]>("get_local_ip");
    return ips[0] || "localhost";
  } catch {
    return "localhost";
  }
}

// Left Sidebar Component
function Sidebar({
  activeView,
  onViewChange,
  hostConnection,
  clientConnection,
  activeConnectionType,
  onSelectConnection,
  onDeleteConnection,
}: {
  activeView: NavigationView;
  onViewChange: (view: NavigationView) => void;
  hostConnection: Connection | null;
  clientConnection: Connection | null;
  activeConnectionType: "host" | "client" | null;
  onSelectConnection: (type: "host" | "client") => void;
  onDeleteConnection: (type: "host" | "client") => void;
}) {
  const mainNavItems = [
    { id: "all-files" as NavigationView, icon: Files, label: "All Files" },
    {
      id: "shared-with-me" as NavigationView,
      icon: Users,
      label: "Shared with Me",
    },
    { id: "my-shares" as NavigationView, icon: FolderUp, label: "My Shares" },
    { id: "recent" as NavigationView, icon: Clock, label: "Recent" },
  ];

  const collectionItems = [
    { id: "favorites" as NavigationView, icon: Star, label: "Favorites" },
  ];

  const connections = [
    ...(hostConnection ? [{ ...hostConnection, type: "host" as const }] : []),
    ...(clientConnection ? [{ ...clientConnection, type: "client" as const }] : []),
  ];

  return (
    <div className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col py-4">
      {/* Logo & Brand */}
      <div className="px-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-white">Wormhole</span>
            <Badge className="w-fit bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px] px-1.5 py-0">
              ALPHA
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {mainNavItems.map((item) => (
          <Button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            variant="ghost"
            className={`w-full justify-start gap-3 ${
              activeView === item.id
                ? "bg-violet-500/15 text-violet-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span>{item.label}</span>
          </Button>
        ))}

        {/* Active Connections Section */}
        {connections.length > 0 && (
          <div className="pt-6">
            <div className="px-3 py-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Active Connections
              </span>
            </div>
            <ScrollArea className="max-h-64">
              {connections.map((connection) => (
                <div
                  key={connection.type}
                  className={`group px-3 py-2 rounded-lg transition-all mb-1 ${
                    activeConnectionType === connection.type
                      ? "bg-violet-500/15 text-violet-400"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 justify-start p-0 h-auto hover:bg-transparent"
                      onClick={() => onSelectConnection(connection.type)}
                    >
                      <HardDrive className="w-4 h-4 mr-2 flex-shrink-0" />
                      <span className="text-xs truncate">{connection.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onDeleteConnection(connection.type)}
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </Button>
                  </div>
                  {/* Show share link for host connections */}
                  {connection.type === "host" && connection.shareLink && (
                    <div className="mt-1 ml-6">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(connection.shareLink || "");
                        }}
                        className="text-[10px] text-zinc-500 hover:text-violet-400 truncate block max-w-full text-left transition-colors"
                        title="Click to copy share link"
                      >
                        <Link className="w-3 h-3 inline mr-1" />
                        {connection.shareLink.replace("https://", "")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        {/* Collections Section */}
        <div className="pt-6">
          <div className="px-3 py-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              My Collections
            </span>
          </div>
          {collectionItems.map((item) => (
            <Button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              variant="ghost"
              className={`w-full justify-start gap-3 ${
                activeView === item.id
                  ? "bg-violet-500/15 text-violet-400"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Button>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="px-3 space-y-1 pt-4 border-t border-zinc-800">
        <Button
          onClick={() => onViewChange("settings")}
          variant="ghost"
          className={`w-full justify-start gap-3 ${
            activeView === "settings"
              ? "bg-violet-500/15 text-violet-400"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800"
          }`}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          <span>Settings</span>
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
  const [_focusedIndex, _setFocusedIndex] = useState(0);

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

  useEffect(() => {
    _setFocusedIndex(0);
  }, [filteredFiles.length]);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0a] min-h-0">
      {/* Top Bar */}
      <div className="h-14 border-b border-zinc-800 flex items-center px-6 gap-4 flex-shrink-0">
        {/* Breadcrumbs */}
        <div className="flex-1 flex items-center gap-2 text-sm overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadDirectory(rootPath)}
            className="text-zinc-400 hover:text-white"
          >
            <Home className="w-4 h-4 mr-1.5" />
            Home
          </Button>
          {pathParts.map((part, i) => (
            <div key={i} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-zinc-600" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  loadDirectory(rootPath + "/" + pathParts.slice(0, i + 1).join("/"))
                }
                className="text-zinc-400 hover:text-white"
              >
                {part}
              </Button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 h-9 bg-zinc-900 border-zinc-700 pl-9 text-white placeholder:text-zinc-500"
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
            <div className="sticky top-0 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-zinc-800 px-6 py-2 grid grid-cols-[1fr_120px_100px] gap-4 text-xs text-zinc-500 font-medium">
              <div>Name</div>
              <div>Modified</div>
              <div className="text-right">Size</div>
            </div>
            <div className="px-6 py-2">
              {currentPath !== rootPath && (
                <Button
                  variant="ghost"
                  onClick={goUp}
                  className="w-full grid grid-cols-[1fr_120px_100px] gap-4 items-center justify-start h-auto py-2.5 hover:bg-zinc-900"
                >
                  <div className="flex items-center gap-3">
                    <Folder className="w-5 h-5 text-zinc-500" />
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
                  className={`w-full grid grid-cols-[1fr_120px_100px] gap-4 items-center justify-start h-auto py-2.5 ${
                    selectedFiles.has(file.path)
                      ? "bg-violet-500/20 hover:bg-violet-500/30"
                      : "hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(file.name, file.is_dir)}
                    <span className="text-sm text-zinc-300 truncate">
                      {file.name}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500">
                    {formatDate(file.modified)}
                  </div>
                  <div className="text-sm text-zinc-500 text-right">
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
      <div className="h-10 border-t border-zinc-800 flex items-center justify-between px-6 text-xs text-zinc-500 flex-shrink-0">
        <span>
          {filteredFiles.length} {filteredFiles.length === 1 ? "item" : "items"}
          {selectedFiles.size > 0 && ` • ${selectedFiles.size} selected`}
        </span>
      </div>
    </div>
  );
}

// Share Dialog Component
function ShareDialog({
  isOpen,
  onClose,
  onConnectionCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnectionCreated: (connection: Connection) => void;
}) {
  const [sharePath, setSharePath] = useState("");
  const [port, setPort] = useState(4433);
  const [joinCode, setJoinCode] = useState("");
  const [hostIpAddress, setHostIpAddress] = useState<string>("");
  const [isHosting, setIsHosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hostname, setHostname] = useState("localhost");

  useEffect(() => {
    getHostname().then(setHostname);
  }, []);

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
            const folderName = data.share_path.split("/").pop() || "Shared Folder";
            const newConnection: Connection = {
              name: `${hostname} : ${folderName}`,
              path: data.share_path,
              type: "host",
              joinCode: code,
              shareLink: code ? makeShareLink(code) : undefined,
            };
            onConnectionCreated(newConnection);
          }
          setStatusMessage(`Sharing ${data.share_path}`);
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
  }, [isOpen, onConnectionCreated, hostname]);

  const selectFolder = async (setter: (path: string) => void) => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setter(selected);
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

  const copyJoinCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white">
            {isHosting ? "Sharing Active" : "Share a Folder"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {isHosting
              ? "Share this link with anyone you want to give access"
              : "Choose a folder to share with others"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {!isHosting ? (
            <>
              <div className="space-y-4">
                {sharePath ? (
                  <div>
                    <Label className="text-zinc-400 mb-2">Selected Folder</Label>
                    <div className="flex items-center gap-3 p-4 bg-zinc-800 rounded-xl border border-zinc-700">
                      <Folder className="w-6 h-6 text-violet-400" />
                      <span className="text-white flex-1 truncate">{sharePath}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSharePath("")}
                        className="hover:bg-zinc-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => selectFolder(setSharePath)}
                    className="w-full h-32 border-2 border-dashed border-zinc-700 hover:border-violet-500/50 bg-transparent"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Folder className="w-12 h-12 text-zinc-600" />
                      <span className="text-zinc-400">Click to choose a folder</span>
                    </div>
                  </Button>
                )}

                {showAdvanced && (
                  <div>
                    <Label className="text-zinc-400 mb-2">Port (Advanced)</Label>
                    <Input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value) || 4433)}
                      className="bg-zinc-800 border-zinc-700 text-white"
                    />
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  {showAdvanced ? "Hide" : "Show"} Advanced Options
                </Button>
              </div>

              <Button
                onClick={handleStartHosting}
                disabled={!sharePath}
                className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white"
              >
                Start Sharing
              </Button>
            </>
          ) : (
            <>
              <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-8">
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center gap-2 text-zinc-400">
                    <Link className="w-4 h-4" />
                    <Label>Share Link</Label>
                  </div>
                  <div className="flex items-center justify-center gap-3 bg-zinc-800/50 rounded-lg p-4">
                    <span className="text-lg font-mono text-white break-all">
                      {shareLink}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={copyShareLink}
                      className="bg-zinc-700 hover:bg-zinc-600 flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                  <div className="pt-4 border-t border-zinc-700/50">
                    <div className="flex items-center justify-center gap-4 text-sm">
                      <div className="text-zinc-500">
                        Code: <span className="text-zinc-300 font-mono">{joinCode}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copyJoinCode}
                          className="ml-1 h-6 w-6 p-0 hover:bg-zinc-700"
                        >
                          <Copy className="w-3 h-3 text-zinc-500" />
                        </Button>
                      </div>
                      {hostIpAddress && (
                        <>
                          <span className="text-zinc-700">|</span>
                          <span className="text-zinc-500">
                            LAN: <span className="text-zinc-300 font-mono">{hostIpAddress}:{port}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6">
                <Label className="text-zinc-400 mb-3">Sharing</Label>
                <div className="flex items-center gap-3">
                  <Folder className="w-5 h-5 text-violet-400" />
                  <span className="text-white truncate">{sharePath}</span>
                </div>
              </div>

              <Button
                onClick={handleStopHosting}
                variant="destructive"
                className="w-full"
              >
                Stop Sharing
              </Button>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-zinc-400 text-center bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
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
  onConnectionCreated: (connection: Connection) => void;
  initialCode?: string | null;
}) {
  const [hostAddress, setHostAddress] = useState("");

  // Set initial code when dialog opens with a code
  useEffect(() => {
    if (isOpen && initialCode) {
      setHostAddress(initialCode);
    }
  }, [isOpen, initialCode]);
  const [mountPath, setMountPath] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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

          const mountName = data.mountpoint?.split("/").pop() || "Remote Share";
          const newConnection: Connection = {
            name: `${hostAddress} : ${mountName}`,
            path: data.mountpoint || "",
            type: "client",
            remoteAddress: hostAddress,
          };
          onConnectionCreated(newConnection);
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

  const selectFolder = async (setter: (path: string) => void) => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setter(selected);
      }
    } catch (e) {
      console.error("Failed to open folder dialog:", e);
    }
  };

  const handleConnect = async () => {
    if (!hostAddress || !mountPath) return;

    try {
      // Try to extract join code from URL or use as-is
      const extractedCode = extractJoinCode(hostAddress);

      if (extractedCode) {
        // It's a valid join code or link
        await invoke("connect_with_code", {
          joinCode: extractedCode,
          mountPath,
        });
      } else if (hostAddress.includes(":") && !hostAddress.includes("://")) {
        // It's an IP:port address
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
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white">
            {isConnected ? "Connected!" : "Connect to Shared Folder"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {isConnected
              ? "The shared folder is now mounted and ready to use"
              : "Paste a share link or enter a join code"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {!isConnected ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label className="text-zinc-400 mb-2">
                    <div className="flex items-center gap-2">
                      <Link className="w-4 h-4" />
                      Share Link or Join Code
                    </div>
                  </Label>
                  <Input
                    type="text"
                    value={hostAddress}
                    onChange={(e) => setHostAddress(e.target.value)}
                    placeholder="wormhole.dev/j/ABC-123 or ABC-123"
                    className="bg-zinc-800 border-zinc-700 text-white text-center font-mono placeholder:text-zinc-600"
                  />
                  <p className="text-xs text-zinc-500 mt-2 text-center">
                    Also accepts: IP address (192.168.1.100:4433)
                  </p>
                </div>

                {mountPath ? (
                  <div>
                    <Label className="text-zinc-400 mb-2">Where to Mount</Label>
                    <div className="flex items-center gap-3 p-4 bg-zinc-800 rounded-xl border border-zinc-700">
                      <Folder className="w-6 h-6 text-violet-400" />
                      <span className="text-white flex-1 truncate">{mountPath}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMountPath("")}
                        className="hover:bg-zinc-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-zinc-400 mb-2">Choose Mount Location</Label>
                    <Button
                      variant="outline"
                      onClick={() => selectFolder(setMountPath)}
                      className="w-full h-24 border-2 border-dashed border-zinc-700 hover:border-violet-500/50 bg-transparent"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Folder className="w-8 h-8 text-zinc-600" />
                        <span className="text-zinc-400">Click to choose location</span>
                      </div>
                    </Button>
                  </div>
                )}
              </div>

              <Button
                onClick={handleConnect}
                disabled={!hostAddress || !mountPath}
                className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white"
              >
                Connect Now
              </Button>
            </>
          ) : (
            <>
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6 space-y-4">
                <div>
                  <Label className="text-zinc-500 mb-2">Mounted At</Label>
                  <div className="flex items-center gap-3">
                    <Folder className="w-5 h-5 text-violet-400" />
                    <span className="text-white font-mono">{mountPath}</span>
                  </div>
                </div>
                <Separator className="bg-zinc-700" />
                <div>
                  <Label className="text-zinc-500 mb-2">Connected To</Label>
                  <p className="text-zinc-300 font-mono text-sm">{hostAddress}</p>
                </div>
              </div>

              <Button onClick={handleDisconnect} variant="destructive" className="w-full">
                Disconnect
              </Button>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-zinc-400 text-center bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
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
    <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-hidden">
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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(() => {
    const completed = localStorage.getItem(SETUP_COMPLETE_KEY);
    return completed !== "true";
  });
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);

  // Single host connection and single client connection
  const [hostConnection, setHostConnection] = useState<Connection | null>(null);
  const [clientConnection, setClientConnection] = useState<Connection | null>(null);
  const [activeConnectionType, setActiveConnectionType] = useState<"host" | "client" | null>(null);

  // Handle deep link events
  useEffect(() => {
    const setupDeepLink = async () => {
      try {
        // Listen for deep link events from Tauri
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

  const handleSelectFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setCurrentFolder(selected);
      }
    } catch (e) {
      console.error("Failed to select folder:", e);
    }
  };

  const handleConnectionCreated = useCallback((connection: Connection) => {
    if (connection.type === "host") {
      setHostConnection(connection);
      setActiveConnectionType("host");
      setCurrentFolder(connection.path);
    } else {
      setClientConnection(connection);
      setActiveConnectionType("client");
      setCurrentFolder(connection.path);
    }
    setActiveDialog(null);
  }, []);

  const handleSelectConnection = useCallback((type: "host" | "client") => {
    setActiveConnectionType(type);
    const connection = type === "host" ? hostConnection : clientConnection;
    if (connection) {
      setCurrentFolder(connection.path);
      setActiveView("all-files");
    }
  }, [hostConnection, clientConnection]);

  const handleDeleteConnection = useCallback(async (type: "host" | "client") => {
    try {
      if (type === "host") {
        await invoke("stop_hosting");
        setHostConnection(null);
        if (activeConnectionType === "host") {
          setActiveConnectionType(clientConnection ? "client" : null);
          setCurrentFolder(clientConnection?.path || "");
        }
      } else {
        await invoke("disconnect");
        setClientConnection(null);
        if (activeConnectionType === "client") {
          setActiveConnectionType(hostConnection ? "host" : null);
          setCurrentFolder(hostConnection?.path || "");
        }
      }
    } catch (e) {
      console.error("Failed to delete connection:", e);
    }
  }, [activeConnectionType, hostConnection, clientConnection]);

  const activeConnection = activeConnectionType === "host" ? hostConnection : clientConnection;

  // Show setup wizard on first run
  if (showSetupWizard) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white select-none overflow-hidden">
      {/* Draggable title bar region for macOS */}
      <div
        data-tauri-drag-region
        className="h-8 w-full flex-shrink-0 absolute top-0 left-0 right-0 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {/* Layout - pt-8 accounts for macOS traffic lights in overlay mode */}
      <div className="flex flex-1 min-h-0 pt-8">
        {/* Left Sidebar */}
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          hostConnection={hostConnection}
          clientConnection={clientConnection}
          activeConnectionType={activeConnectionType}
          onSelectConnection={handleSelectConnection}
          onDeleteConnection={handleDeleteConnection}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Global Header */}
          <div className="h-14 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold text-white">
                {activeView === "all-files" &&
                  (activeConnection
                    ? activeConnection.type === "host"
                      ? "Shared Files"
                      : "Remote Files"
                    : "All Files")}
                {activeView === "shared-with-me" && "Shared with Me"}
                {activeView === "my-shares" && "My Shares"}
                {activeView === "recent" && "Recent"}
                {activeView === "favorites" && "Favorites"}
                {activeView === "settings" && "Settings"}
              </h1>
              {activeView === "all-files" && currentFolder && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectFolder}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <Folder className="w-3.5 h-3.5 mr-1.5" />
                  Change Folder
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Connection Badge & Copy Link */}
              {activeConnection && (
                <div className="flex items-center gap-2">
                  <Badge
                    className={`gap-2 ${
                      activeConnection.type === "host"
                        ? "bg-violet-500/20 text-violet-400 border-violet-500/40"
                        : "bg-green-500/20 text-green-400 border-green-500/40"
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full animate-pulse bg-current" />
                    {activeConnection.type === "host" ? "Sharing" : "Connected"}
                  </Badge>
                  {/* Copy Link Button for Host */}
                  {activeConnection.type === "host" && activeConnection.shareLink && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(activeConnection.shareLink || "");
                      }}
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10"
                      title={activeConnection.shareLink}
                    >
                      <Link className="w-3 h-3 mr-1" />
                      Copy Link
                    </Button>
                  )}
                </div>
              )}

              {/* View Mode Toggle */}
              {activeView === "all-files" && currentFolder && (
                <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className={viewMode === "list" ? "bg-zinc-800" : ""}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className={viewMode === "grid" ? "bg-zinc-800" : ""}
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
                <Button
                  variant="outline"
                  onClick={() => setActiveDialog("connect")}
                  className="gap-2 border-zinc-700 hover:bg-zinc-800"
                  disabled={!!clientConnection}
                >
                  <Download className="w-4 h-4" />
                  Connect
                </Button>
                <Button
                  onClick={() => setActiveDialog("share")}
                  className="gap-2 bg-violet-600 hover:bg-violet-700"
                  disabled={!!hostConnection}
                >
                  <Upload className="w-4 h-4" />
                  Share Folder
                </Button>
              </div>
            </div>
          </div>

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
                        disabled={!!clientConnection}
                      >
                        <Download className="w-4 h-4" />
                        Connect to Share
                      </Button>
                      <Button
                        onClick={() => setActiveDialog("share")}
                        variant="outline"
                        className="gap-2 border-zinc-700 hover:bg-zinc-800"
                        disabled={!!hostConnection}
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
            <div className="flex-1 flex items-center justify-center">
              {clientConnection ? (
                <div className="max-w-lg w-full mx-4 space-y-6">
                  {/* Active Connection Card */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Users className="w-6 h-6 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{clientConnection.name}</h3>
                        <p className="text-sm text-zinc-500 truncate">Mounted at: {clientConnection.path}</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/40">
                        <div className="w-2 h-2 rounded-full animate-pulse bg-green-400 mr-1.5" />
                        Connected
                      </Badge>
                    </div>

                    {/* Browse Files Button */}
                    <Button
                      className="w-full mt-6 bg-violet-600 hover:bg-violet-700"
                      onClick={() => {
                        setCurrentFolder(clientConnection.path);
                        setActiveView("all-files");
                      }}
                    >
                      <Folder className="w-4 h-4 mr-2" />
                      Browse Files
                    </Button>

                    {/* Disconnect Button */}
                    <Button
                      variant="destructive"
                      className="w-full mt-2"
                      onClick={() => handleDeleteConnection("client")}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center max-w-md space-y-4">
                  <Users className="w-16 h-16 mx-auto text-zinc-700" />
                  <h2 className="text-xl font-semibold text-white">
                    No Shared Files Yet
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
              )}
            </div>
          )}

          {activeView === "my-shares" && (
            <div className="flex-1 flex items-center justify-center">
              {hostConnection ? (
                <div className="max-w-lg w-full mx-4 space-y-6">
                  {/* Active Share Card */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <FolderUp className="w-6 h-6 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{hostConnection.name}</h3>
                        <p className="text-sm text-zinc-500 truncate">{hostConnection.path}</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/40">
                        <div className="w-2 h-2 rounded-full animate-pulse bg-green-400 mr-1.5" />
                        Active
                      </Badge>
                    </div>

                    {/* Share Link */}
                    {hostConnection.shareLink && (
                      <div className="mt-6 p-4 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
                          <Link className="w-4 h-4" />
                          Share Link
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm font-mono text-white bg-zinc-800/50 px-3 py-2 rounded truncate">
                            {hostConnection.shareLink}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigator.clipboard.writeText(hostConnection.shareLink || "")}
                            className="bg-zinc-800 hover:bg-zinc-700 flex-shrink-0"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">
                          Anyone with this link can access your shared folder
                        </p>
                      </div>
                    )}

                    {/* Stop Sharing Button */}
                    <Button
                      variant="destructive"
                      className="w-full mt-4"
                      onClick={() => handleDeleteConnection("host")}
                    >
                      Stop Sharing
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center max-w-md space-y-4">
                  <FolderUp className="w-16 h-16 mx-auto text-zinc-700" />
                  <h2 className="text-xl font-semibold text-white">
                    No Active Shares
                  </h2>
                  <p className="text-zinc-500">
                    Folders you're currently sharing will appear here
                  </p>
                  <Button
                    onClick={() => setActiveDialog("share")}
                    className="gap-2 bg-violet-600 hover:bg-violet-700"
                  >
                    <Upload className="w-4 h-4" />
                    Share a Folder
                  </Button>
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
        onConnectionCreated={handleConnectionCreated}
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
