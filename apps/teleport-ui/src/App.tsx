import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
} from "lucide-react";

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
  if (isDir) return <Folder className={`${className} text-blue-500`} />;

  const ext = name.split(".").pop()?.toLowerCase() || "";

  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "ico"].includes(ext)) {
    return <Image className={`${className} text-pink-500`} />;
  }
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return <Film className={`${className} text-purple-500`} />;
  }
  if (["mp3", "wav", "flac", "aac", "m4a"].includes(ext)) {
    return <Music className={`${className} text-green-500`} />;
  }
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
    return <Archive className={`${className} text-yellow-500`} />;
  }
  if (
    ["js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "cpp", "c", "h"].includes(ext)
  ) {
    return <Code className={`${className} text-cyan-500`} />;
  }
  if (["txt", "md", "json", "yaml", "yml", "xml", "html", "css"].includes(ext)) {
    return <FileText className={`${className} text-gray-400`} />;
  }

  return <File className={`${className} text-gray-500`} />;
}

// Helper to get hostname
async function getHostname(): Promise<string> {
  try {
    // Try to get local IPs which usually contains hostname info
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
    <div className="w-56 bg-[#0c0c14] border-r border-white/5 flex flex-col py-4">
      {/* Logo & Brand */}
      <div className="px-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <HardDrive className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
            Wormhole
          </span>
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
                : "text-white/60 hover:text-white hover:bg-white/5"
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
              <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Active Connections
              </span>
            </div>
            <ScrollArea className="max-h-64">
              {connections.map((connection) => (
                <div
                  key={connection.type}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-all mb-1 ${
                    activeConnectionType === connection.type
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
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
              ))}
            </ScrollArea>
          </div>
        )}

        {/* Collections Section */}
        <div className="pt-6">
          <div className="px-3 py-2">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
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
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Button>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="px-3 space-y-1 pt-4 border-t border-white/5">
        <Button
          onClick={() => onViewChange("settings")}
          variant="ghost"
          className={`w-full justify-start gap-3 ${
            activeView === "settings"
              ? "bg-violet-500/15 text-violet-400"
              : "text-white/60 hover:text-white hover:bg-white/5"
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
  const [focusedIndex, setFocusedIndex] = useState(0);

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
    setFocusedIndex(0);
  }, [filteredFiles.length]);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0f] min-h-0">
      {/* Top Bar */}
      <div className="h-14 border-b border-white/5 flex items-center px-6 gap-4 flex-shrink-0">
        {/* Breadcrumbs */}
        <div className="flex-1 flex items-center gap-2 text-sm overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadDirectory(rootPath)}
            className="text-white/70 hover:text-white"
          >
            <Home className="w-4 h-4 mr-1.5" />
            Home
          </Button>
          {pathParts.map((part, i) => (
            <div key={i} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-white/30" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  loadDirectory(rootPath + "/" + pathParts.slice(0, i + 1).join("/"))
                }
                className="text-white/70 hover:text-white"
              >
                {part}
              </Button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 h-9 bg-white/5 border-white/10 pl-9 text-white placeholder:text-white/30"
          />
        </div>
      </div>

      {/* File List/Grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <AlertCircle className="w-12 h-12 text-red-400/50 mb-3" />
            <p className="text-sm text-red-400/70">{error}</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Folder className="w-12 h-12 text-white/20 mb-3" />
            <p className="text-sm text-white/40">
              {searchQuery ? "No files match your search" : "This folder is empty"}
            </p>
          </div>
        ) : viewMode === "list" ? (
          <div>
            <div className="sticky top-0 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/5 px-6 py-2 grid grid-cols-[1fr_120px_100px] gap-4 text-xs text-white/40 font-medium">
              <div>Name</div>
              <div>Modified</div>
              <div className="text-right">Size</div>
            </div>
            <div className="px-6 py-2">
              {currentPath !== rootPath && (
                <Button
                  variant="ghost"
                  onClick={goUp}
                  className="w-full grid grid-cols-[1fr_120px_100px] gap-4 items-center justify-start h-auto py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Folder className="w-5 h-5 text-white/40" />
                    <span className="text-sm text-white/60">..</span>
                  </div>
                </Button>
              )}
              {filteredFiles.map((file, index) => (
                <Button
                  key={file.path}
                  variant="ghost"
                  onClick={() => handleFileClick(file, false)}
                  onDoubleClick={() => handleFileClick(file, true)}
                  className={`w-full grid grid-cols-[1fr_120px_100px] gap-4 items-center justify-start h-auto py-2.5 ${
                    selectedFiles.has(file.path)
                      ? "bg-violet-500/20 hover:bg-violet-500/30"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(file.name, file.is_dir)}
                    <span className="text-sm text-white/80 truncate">
                      {file.name}
                    </span>
                  </div>
                  <div className="text-sm text-white/40">
                    {formatDate(file.modified)}
                  </div>
                  <div className="text-sm text-white/40 text-right">
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
                className="flex flex-col items-center gap-2 p-4 h-auto"
              >
                <Folder className="w-12 h-12 text-white/40" />
                <span className="text-xs text-white/60">..</span>
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
                    : "hover:bg-white/5"
                }`}
              >
                {getFileIcon(file.name, file.is_dir, "w-12 h-12")}
                <span className="text-xs text-white/80 truncate w-full text-center">
                  {file.name}
                </span>
                {!file.is_dir && (
                  <span className="text-xs text-white/30">
                    {formatSize(file.size)}
                  </span>
                )}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="h-10 border-t border-white/5 flex items-center justify-between px-6 text-xs text-white/40 flex-shrink-0">
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

  // Get hostname on mount
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
          setJoinCode(data.join_code || "");
          setIsHosting(true);
          if (data.share_path) {
            setSharePath(data.share_path);
            const folderName = data.share_path.split("/").pop() || "Shared Folder";
            // Create connection with hostname:foldername format
            const newConnection: Connection = {
              name: `${hostname} : ${folderName}`,
              path: data.share_path,
              type: "host",
              joinCode: data.join_code,
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

  const copyJoinCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#0c0c14] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {isHosting ? "Sharing Active" : "Share a Folder"}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {isHosting
              ? "Share this code with anyone you want to give access"
              : "Choose a folder to share with others"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {!isHosting ? (
            <>
              <div className="space-y-4">
                {sharePath ? (
                  <div>
                    <Label className="text-white/60 mb-2">Selected Folder</Label>
                    <div className="flex items-center gap-3 p-4 bg-black/30 rounded-xl border border-white/10">
                      <Folder className="w-6 h-6 text-violet-400" />
                      <span className="text-white flex-1 truncate">{sharePath}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSharePath("")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => selectFolder(setSharePath)}
                    className="w-full h-32 border-2 border-dashed border-white/20 hover:border-violet-500/50"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Folder className="w-12 h-12 text-white/30" />
                      <span className="text-white/60">Click to choose a folder</span>
                    </div>
                  </Button>
                )}

                {showAdvanced && (
                  <div>
                    <Label className="text-white/60 mb-2">Port (Advanced)</Label>
                    <Input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value) || 4433)}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-white/40 hover:text-white/80"
                >
                  {showAdvanced ? "Hide" : "Show"} Advanced Options
                </Button>
              </div>

              <Button
                onClick={handleStartHosting}
                disabled={!sharePath}
                className="w-full h-12 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                Start Sharing
              </Button>
            </>
          ) : (
            <>
              <div className="bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 rounded-xl p-8">
                <div className="text-center space-y-4">
                  <Label className="text-white/60">Join Code</Label>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-5xl font-mono font-bold tracking-[0.3em] text-white">
                      {joinCode}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={copyJoinCode}
                      className="bg-white/10 hover:bg-white/20"
                    >
                      {copied ? (
                        <Check className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <Copy className="w-6 h-6" />
                      )}
                    </Button>
                  </div>
                  {hostIpAddress && (
                    <div className="pt-4 border-t border-white/20">
                      <Label className="text-white/40">Local Network Address</Label>
                      <p className="text-white/80 font-mono text-sm mt-2">
                        {hostIpAddress}:{port}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <Label className="text-white/60 mb-3">Sharing</Label>
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
            <p className="text-sm text-white/60 text-center bg-white/5 border border-white/10 rounded-xl px-4 py-3">
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnectionCreated: (connection: Connection) => void;
}) {
  const [hostAddress, setHostAddress] = useState("");
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
          // Create connection
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
      const isJoinCode = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/i.test(hostAddress.trim());

      if (isJoinCode) {
        await invoke("connect_with_code", {
          joinCode: hostAddress.trim().toUpperCase(),
          mountPath,
        });
      } else {
        await invoke("connect_to_peer", { hostAddress, mountPath });
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
      <DialogContent className="max-w-2xl bg-[#0c0c14] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {isConnected ? "Connected!" : "Connect to Shared Folder"}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {isConnected
              ? "The shared folder is now mounted and ready to use"
              : "Enter a join code or network address"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {!isConnected ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label className="text-white/60 mb-2">
                    Join Code or Address
                  </Label>
                  <Input
                    type="text"
                    value={hostAddress}
                    onChange={(e) => setHostAddress(e.target.value)}
                    placeholder="ABC-123 or 192.168.1.100:4433"
                    className="bg-black/30 border-white/10 text-white text-center font-mono"
                  />
                </div>

                {mountPath ? (
                  <div>
                    <Label className="text-white/60 mb-2">Where to Mount</Label>
                    <div className="flex items-center gap-3 p-4 bg-black/30 rounded-xl border border-white/10">
                      <Folder className="w-6 h-6 text-blue-400" />
                      <span className="text-white flex-1 truncate">{mountPath}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMountPath("")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-white/60 mb-2">Choose Mount Location</Label>
                    <Button
                      variant="outline"
                      onClick={() => selectFolder(setMountPath)}
                      className="w-full h-24 border-2 border-dashed border-white/20 hover:border-blue-500/50"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Folder className="w-8 h-8 text-white/30" />
                        <span className="text-white/60">Click to choose location</span>
                      </div>
                    </Button>
                  </div>
                )}
              </div>

              <Button
                onClick={handleConnect}
                disabled={!hostAddress || !mountPath}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
              >
                Connect Now
              </Button>
            </>
          ) : (
            <>
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                <div>
                  <Label className="text-white/40 mb-2">Mounted At</Label>
                  <div className="flex items-center gap-3">
                    <Folder className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-mono">{mountPath}</span>
                  </div>
                </div>
                <Separator className="bg-white/10" />
                <div>
                  <Label className="text-white/40 mb-2">Connected To</Label>
                  <p className="text-white/80 font-mono text-sm">{hostAddress}</p>
                </div>
              </div>

              <Button onClick={handleDisconnect} variant="destructive" className="w-full">
                Disconnect
              </Button>
            </>
          )}

          {statusMessage && (
            <p className="text-sm text-white/60 text-center bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              {statusMessage}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Settings Page Component
function SettingsPage() {
  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0f] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">About</h2>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <HardDrive className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Wormhole</h3>
                  <p className="text-sm text-white/40">Version 0.1.0</p>
                </div>
              </div>
              <p className="text-sm text-white/60">
                Mount remote folders locally with peer-to-peer file sharing. No
                cloud uploads required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useState<NavigationView>("all-files");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);

  // Single host connection and single client connection (backend only supports one of each)
  const [hostConnection, setHostConnection] = useState<Connection | null>(null);
  const [clientConnection, setClientConnection] = useState<Connection | null>(null);
  const [activeConnectionType, setActiveConnectionType] = useState<"host" | "client" | null>(null);

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

  return (
    <div className="h-screen flex bg-[#0a0a0f] text-white select-none overflow-hidden">
      {/* Gradient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Layout */}
      <div className="relative z-10 flex w-full h-full">
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
          <div className="h-14 bg-[#0c0c14]/95 backdrop-blur-sm border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">
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
                  className="text-white/40 hover:text-white/80"
                >
                  <Folder className="w-3.5 h-3.5 mr-1.5" />
                  Change Folder
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Connection Badge */}
              {activeConnection && (
                <Badge
                  variant={activeConnection.type === "host" ? "secondary" : "default"}
                  className="gap-2"
                >
                  <div className="w-2 h-2 rounded-full animate-pulse bg-current" />
                  {activeConnection.type === "host" ? "Sharing" : "Connected"}
                </Badge>
              )}

              {/* View Mode Toggle */}
              {activeView === "all-files" && currentFolder && (
                <div className="flex items-center gap-1 border-l border-white/10 pl-3">
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 border-l border-white/10 pl-3">
                <Button
                  variant="outline"
                  onClick={() => setActiveDialog("connect")}
                  className="gap-2"
                  disabled={!!clientConnection}
                >
                  <Download className="w-4 h-4" />
                  Connect
                </Button>
                <Button
                  onClick={() => setActiveDialog("share")}
                  className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
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
                    <Files className="w-20 h-20 text-white/30 mx-auto" />
                    <h2 className="text-xl font-semibold text-white">
                      No Files to Browse
                    </h2>
                    <p className="text-white/50">
                      Connect to a shared folder or share your own to get started
                    </p>
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={() => setActiveDialog("connect")}
                        className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                        disabled={!!clientConnection}
                      >
                        <Download className="w-4 h-4" />
                        Connect to Share
                      </Button>
                      <Button
                        onClick={() => setActiveDialog("share")}
                        className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
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
              <div className="text-center max-w-md space-y-4">
                <Users className="w-16 h-16 mx-auto text-white/30" />
                <h2 className="text-xl font-semibold text-white">
                  No Shared Files Yet
                </h2>
                <p className="text-white/50">
                  Files that others share with you will appear here
                </p>
                <Button
                  onClick={() => setActiveDialog("connect")}
                  className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                  disabled={!!clientConnection}
                >
                  <Download className="w-4 h-4" />
                  Connect to Share
                </Button>
              </div>
            </div>
          )}

          {activeView === "my-shares" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <FolderUp className="w-16 h-16 mx-auto text-white/30" />
                <h2 className="text-xl font-semibold text-white">
                  No Active Shares
                </h2>
                <p className="text-white/50">
                  Folders you're currently sharing will appear here
                </p>
                <Button
                  onClick={() => setActiveDialog("share")}
                  className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                  disabled={!!hostConnection}
                >
                  <Upload className="w-4 h-4" />
                  Share a Folder
                </Button>
              </div>
            </div>
          )}

          {activeView === "recent" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <Clock className="w-16 h-16 mx-auto text-white/30" />
                <h2 className="text-xl font-semibold text-white">No Recent Files</h2>
                <p className="text-white/50">
                  Your recently accessed files will appear here
                </p>
              </div>
            </div>
          )}

          {activeView === "favorites" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <Star className="w-16 h-16 mx-auto text-white/30" />
                <h2 className="text-xl font-semibold text-white">
                  No Favorites Yet
                </h2>
                <p className="text-white/50">
                  Star your favorite files and folders to find them quickly
                </p>
              </div>
            </div>
          )}

          {activeView === "settings" && <SettingsPage />}
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
        onClose={() => setActiveDialog(null)}
        onConnectionCreated={handleConnectionCreated}
      />
    </div>
  );
}

export default App;
