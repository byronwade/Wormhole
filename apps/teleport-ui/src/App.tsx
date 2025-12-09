import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Upload,
  Download,
  Folder,
  File,
  Server,
  Plug,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  HardDrive,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  Code,
  X,
} from "lucide-react";

type Tab = "host" | "connect";
type Status = "idle" | "connecting" | "connected" | "error";

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

// Helper to get file icon based on extension
function getFileIcon(name: string, isDir: boolean) {
  if (isDir) return <Folder className="w-4 h-4 text-blue-400" />;

  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return <Image className="w-4 h-4 text-pink-400" />;
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return <Film className="w-4 h-4 text-purple-400" />;
  }
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) {
    return <Music className="w-4 h-4 text-green-400" />;
  }
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
    return <Archive className="w-4 h-4 text-yellow-400" />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h'].includes(ext)) {
    return <Code className="w-4 h-4 text-cyan-400" />;
  }
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml', 'html', 'css'].includes(ext)) {
    return <FileText className="w-4 h-4 text-gray-400" />;
  }

  return <File className="w-4 h-4 text-gray-500" />;
}

// File Browser Component
function FileBrowser({
  rootPath,
  title,
  icon: Icon,
  accentColor = "violet"
}: {
  rootPath: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor?: string;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const entries = await invoke<FileEntry[]>("list_directory", { path });
      setFiles(entries);
      setCurrentPath(path);
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

  const handleFileClick = (file: FileEntry) => {
    if (file.is_dir) {
      loadDirectory(file.path);
    }
  };

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    if (parent.length >= rootPath.length) {
      loadDirectory(parent);
    }
  };

  const pathParts = currentPath.replace(rootPath, '').split('/').filter(Boolean);

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-${accentColor}-500/20 flex items-center justify-center`}>
            <Icon className={`w-4 h-4 text-${accentColor}-400`} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">{title}</h3>
            <p className="text-xs text-white/50 truncate max-w-[200px]">{rootPath}</p>
          </div>
        </div>
        <button
          onClick={() => loadDirectory(currentPath)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-white/50 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Breadcrumbs */}
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-1 text-xs overflow-x-auto">
        <button
          onClick={() => loadDirectory(rootPath)}
          className="text-white/70 hover:text-white transition-colors flex items-center gap-1"
        >
          <HardDrive className="w-3 h-3" />
          root
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-white/30" />
            <button
              onClick={() => loadDirectory(rootPath + '/' + pathParts.slice(0, i + 1).join('/'))}
              className="text-white/70 hover:text-white transition-colors"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File List */}
      <div className="max-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <AlertCircle className="w-8 h-8 text-red-400/50 mb-2" />
            <p className="text-sm text-red-400/70">{error}</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="w-8 h-8 text-white/20 mb-2" />
            <p className="text-sm text-white/40">Empty folder</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {currentPath !== rootPath && (
              <button
                onClick={goUp}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
              >
                <Folder className="w-4 h-4 text-white/40" />
                <span className="text-sm text-white/60">..</span>
              </button>
            )}
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => handleFileClick(file)}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left group"
              >
                {getFileIcon(file.name, file.is_dir)}
                <span className="flex-1 text-sm text-white/80 truncate group-hover:text-white transition-colors">
                  {file.name}
                </span>
                <span className="text-xs text-white/30">
                  {file.is_dir ? '' : formatSize(file.size)}
                </span>
                {file.is_dir && (
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-xs text-white/40">
        <span>{files.length} items</span>
        <span>{formatSize(files.reduce((acc, f) => acc + (f.is_dir ? 0 : f.size), 0))}</span>
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("host");

  // Host state
  const [sharePath, setSharePath] = useState("");
  const [port, setPort] = useState(4433);
  const [joinCode, setJoinCode] = useState("");
  const [isHosting, setIsHosting] = useState(false);
  const [hostStatus, setHostStatus] = useState<Status>("idle");
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  // Connect state
  const [hostAddress, setHostAddress] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectStatus, setConnectStatus] = useState<Status>("idle");

  // Status message
  const [statusMessage, setStatusMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenHost = await listen<ServiceEvent>("host-event", (event) => {
        const data = event.payload;
        if (data.type === "HostStarted") {
          setJoinCode(data.join_code || "");
          setHostStatus("connected");
          setStatusMessage(`Sharing ${data.share_path}`);
        } else if (data.type === "ClientConnected") {
          setConnectedPeers(prev => [...prev, data.peer_addr || "unknown"]);
          setStatusMessage(`Peer connected: ${data.peer_addr}`);
        } else if (data.type === "Error") {
          setHostStatus("error");
          setStatusMessage(`Error: ${data.message}`);
        }
      });

      const unlistenMount = await listen<ServiceEvent>("mount-event", (event) => {
        const data = event.payload;
        if (data.type === "MountReady") {
          setConnectStatus("connected");
          setIsConnected(true);
          setMountPath(data.mountpoint || "");
          setStatusMessage(`Mounted at ${data.mountpoint}`);
        } else if (data.type === "Error") {
          setConnectStatus("error");
          setIsConnected(false);
          setStatusMessage(`Error: ${data.message}`);
        }
      });

      return () => {
        unlistenHost();
        unlistenMount();
      };
    };

    setupListeners();
  }, []);

  const selectFolder = async (setter: (path: string) => void) => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setter(selected);
      }
    } catch (e) {
      console.error("Failed to open folder dialog:", e);
      setStatusMessage(`Failed to open folder dialog: ${e}`);
    }
  };

  const handleStartHosting = async () => {
    if (!sharePath) return;

    try {
      setHostStatus("connecting");
      setStatusMessage("Starting host...");
      await invoke("start_hosting", { path: sharePath, port });
      setIsHosting(true);
    } catch (e) {
      setHostStatus("error");
      setStatusMessage(`Error: ${e}`);
    }
  };

  const handleStopHosting = async () => {
    try {
      await invoke("stop_hosting");
      setIsHosting(false);
      setHostStatus("idle");
      setJoinCode("");
      setConnectedPeers([]);
      setStatusMessage("Host stopped");
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
    }
  };

  const handleConnect = async () => {
    if (!hostAddress || !mountPath) return;

    try {
      setConnectStatus("connecting");
      setStatusMessage("Connecting...");
      await invoke("connect_to_peer", {
        hostAddress,
        mountPath,
      });
    } catch (e) {
      setConnectStatus("error");
      setIsConnected(false);
      setStatusMessage(`Error: ${e}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke("disconnect");
      setIsConnected(false);
      setConnectStatus("idle");
      setStatusMessage("Disconnected");
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
    <div className="min-h-screen bg-[#0a0a0f] text-white select-none">
      {/* Gradient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Wormhole</h1>
              <p className="text-sm text-white/50">Mount Any Folder. Any Computer.</p>
            </div>
          </div>

          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2">
            {(isHosting || isConnected) ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">
                  {isHosting ? "Hosting" : "Connected"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                <div className="w-2 h-2 bg-white/30 rounded-full" />
                <span className="text-xs text-white/50 font-medium">Idle</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-xl w-fit">
          <button
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "host"
                ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
            onClick={() => setTab("host")}
          >
            <Upload className="w-4 h-4" />
            Host
          </button>
          <button
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "connect"
                ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
            onClick={() => setTab("connect")}
          >
            <Download className="w-4 h-4" />
            Connect
          </button>
        </div>

        {/* Main Content */}
        <div className="grid gap-6">
          {/* Host Tab */}
          {tab === "host" && (
            <>
              {/* Setup Card */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-violet-400" />
                  Share a Folder
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">
                      Folder to Share
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={sharePath}
                        onChange={(e) => setSharePath(e.target.value)}
                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                        placeholder="/path/to/share"
                        disabled={isHosting}
                      />
                      <button
                        onClick={() => selectFolder(setSharePath)}
                        className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                        disabled={isHosting}
                      >
                        <Folder className="w-5 h-5 text-white/60" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-white/60 mb-2">Port</label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value) || 4433)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                        disabled={isHosting}
                      />
                    </div>
                    <div className="flex items-end">
                      {!isHosting ? (
                        <button
                          onClick={handleStartHosting}
                          disabled={!sharePath || hostStatus === "connecting"}
                          className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
                        >
                          {hostStatus === "connecting" ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Starting...
                            </>
                          ) : (
                            <>
                              <Upload className="w-5 h-5" />
                              Start Hosting
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={handleStopHosting}
                          className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <X className="w-5 h-5" />
                          Stop Hosting
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Join Code Card */}
              {joinCode && (
                <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 backdrop-blur-sm border border-violet-500/20 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white/60">Join Code</h3>
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-emerald-400">Live</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-mono font-bold tracking-[0.2em] text-white">
                      {joinCode}
                    </span>
                    <button
                      onClick={copyJoinCode}
                      className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Copy className="w-5 h-5 text-white/60" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-white/40 mt-3">
                    Share this code with others to let them connect
                  </p>

                  {/* Connected Peers */}
                  {connectedPeers.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">Connected peers:</p>
                      <div className="flex flex-wrap gap-2">
                        {connectedPeers.map((peer, i) => (
                          <span key={i} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg">
                            {peer}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* File Browser for Hosted Folder */}
              {isHosting && sharePath && (
                <FileBrowser
                  rootPath={sharePath}
                  title="Shared Files"
                  icon={Upload}
                  accentColor="violet"
                />
              )}
            </>
          )}

          {/* Connect Tab */}
          {tab === "connect" && (
            <>
              {/* Connection Card */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Plug className="w-5 h-5 text-blue-400" />
                  Connect to Share
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">
                      Host Address or Join Code
                    </label>
                    <input
                      type="text"
                      value={hostAddress}
                      onChange={(e) => setHostAddress(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      placeholder="192.168.1.100:4433 or ABC-123"
                      disabled={connectStatus === "connecting" || connectStatus === "connected"}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-white/60 mb-2">
                      Mount Point
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mountPath}
                        onChange={(e) => setMountPath(e.target.value)}
                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        placeholder="/tmp/wormhole"
                        disabled={connectStatus === "connecting" || connectStatus === "connected"}
                      />
                      <button
                        onClick={() => selectFolder(setMountPath)}
                        className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                        disabled={connectStatus === "connecting" || connectStatus === "connected"}
                      >
                        <Folder className="w-5 h-5 text-white/60" />
                      </button>
                    </div>
                  </div>

                  {connectStatus === "idle" || connectStatus === "error" ? (
                    <button
                      onClick={handleConnect}
                      disabled={!hostAddress || !mountPath}
                      className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
                    >
                      <Plug className="w-5 h-5" />
                      Connect
                    </button>
                  ) : connectStatus === "connecting" ? (
                    <button
                      onClick={handleDisconnect}
                      className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30 px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnect}
                      className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <WifiOff className="w-5 h-5" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Connection Info Card */}
              {isConnected && mountPath && (
                <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 backdrop-blur-sm border border-blue-500/20 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white/60">Mounted at</h3>
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-emerald-400">Connected</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-6 h-6 text-blue-400" />
                    <span className="text-lg font-mono text-white">{mountPath}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mountPath);
                      }}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors ml-auto"
                    >
                      <ExternalLink className="w-4 h-4 text-white/60" />
                    </button>
                  </div>
                </div>
              )}

              {/* File Browser for Mounted Folder */}
              {isConnected && mountPath && (
                <FileBrowser
                  rootPath={mountPath}
                  title="Remote Files"
                  icon={Download}
                  accentColor="blue"
                />
              )}
            </>
          )}
        </div>

        {/* Status Bar */}
        <div
          className={`mt-6 p-4 rounded-xl text-sm flex items-center gap-3 ${
            hostStatus === "error" || connectStatus === "error"
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-white/5 border border-white/10 text-white/60"
          }`}
        >
          {hostStatus === "error" || connectStatus === "error" ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Server className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="truncate">{statusMessage || "Ready to share or connect"}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
