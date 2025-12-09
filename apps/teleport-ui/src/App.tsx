import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Upload,
  Download,
  Folder,
  Server,
  Plug,
  Copy,
  Check,
  AlertCircle,
  Loader2,
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

function App() {
  const [tab, setTab] = useState<Tab>("host");

  // Host state
  const [sharePath, setSharePath] = useState("");
  const [port, setPort] = useState(4433);
  const [joinCode, setJoinCode] = useState("");
  const [isHosting, setIsHosting] = useState(false);
  const [hostStatus, setHostStatus] = useState<Status>("idle");

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
          setStatusMessage(`Hosting ${data.share_path}`);
        } else if (data.type === "ClientConnected") {
          setStatusMessage(`Client connected: ${data.peer_addr}`);
        } else if (data.type === "Error") {
          setHostStatus("error");
          setStatusMessage(`Error: ${data.message}`);
        }
      });

      const unlistenMount = await listen<ServiceEvent>("mount-event", (event) => {
        const data = event.payload;
        if (data.type === "MountReady") {
          setConnectStatus("connected");
          setStatusMessage(`Mounted at ${data.mountpoint}`);
        } else if (data.type === "Error") {
          setConnectStatus("error");
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
      setIsConnected(true);
    } catch (e) {
      setConnectStatus("error");
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
    <div className="min-h-screen bg-slate-900 text-white p-6 select-none">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-wormhole-purple rounded-lg flex items-center justify-center">
          <Server className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Wormhole</h1>
          <p className="text-sm text-slate-400">Mount Any Folder. Any Computer.</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 bg-slate-800 rounded-lg p-1">
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
            tab === "host"
              ? "bg-wormhole-purple text-white"
              : "text-slate-400 hover:text-white"
          }`}
          onClick={() => setTab("host")}
        >
          <Upload className="w-4 h-4" />
          Host
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
            tab === "connect"
              ? "bg-wormhole-purple text-white"
              : "text-slate-400 hover:text-white"
          }`}
          onClick={() => setTab("connect")}
        >
          <Download className="w-4 h-4" />
          Connect
        </button>
      </div>

      {/* Host Tab */}
      {tab === "host" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Folder to Share
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sharePath}
                onChange={(e) => setSharePath(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-wormhole-purple"
                placeholder="/path/to/share"
                disabled={isHosting}
              />
              <button
                onClick={() => selectFolder(setSharePath)}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2.5 rounded-lg transition-colors"
                disabled={isHosting}
              >
                <Folder className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 4433)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-wormhole-purple"
              disabled={isHosting}
            />
          </div>

          {joinCode && (
            <div className="bg-slate-800 border border-wormhole-purple/30 rounded-lg p-4">
              <label className="block text-sm text-slate-300 mb-2">
                Join Code
              </label>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold tracking-wider text-wormhole-purple-light">
                  {joinCode}
                </span>
                <button
                  onClick={copyJoinCode}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-slate-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Share this code with others to let them connect
              </p>
            </div>
          )}

          {!isHosting ? (
            <button
              onClick={handleStartHosting}
              disabled={!sharePath || hostStatus === "connecting"}
              className="w-full bg-wormhole-purple hover:bg-wormhole-purple-dark disabled:bg-slate-700 disabled:text-slate-500 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
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
              className="w-full bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              Stop Hosting
            </button>
          )}
        </div>
      )}

      {/* Connect Tab */}
      {tab === "connect" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Host Address
            </label>
            <input
              type="text"
              value={hostAddress}
              onChange={(e) => setHostAddress(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-wormhole-purple"
              placeholder="192.168.1.100:4433 or join code"
              disabled={isConnected}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Mount Point
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mountPath}
                onChange={(e) => setMountPath(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-wormhole-purple"
                placeholder="/tmp/wormhole"
                disabled={isConnected}
              />
              <button
                onClick={() => selectFolder(setMountPath)}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2.5 rounded-lg transition-colors"
                disabled={isConnected}
              >
                <Folder className="w-5 h-5" />
              </button>
            </div>
          </div>

          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={
                !hostAddress || !mountPath || connectStatus === "connecting"
              }
              className="w-full bg-wormhole-purple hover:bg-wormhole-purple-dark disabled:bg-slate-700 disabled:text-slate-500 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {connectStatus === "connecting" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plug className="w-5 h-5" />
                  Connect
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="w-full bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {/* Status Bar */}
      <div
        className={`mt-6 p-3 rounded-lg text-sm flex items-center gap-2 ${
          (hostStatus === "error" || connectStatus === "error")
            ? "bg-red-900/30 border border-red-800 text-red-300"
            : "bg-slate-800 border border-slate-700 text-slate-300"
        }`}
      >
        {(hostStatus === "error" || connectStatus === "error") ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <Server className="w-4 h-4" />
        )}
        {statusMessage || "Ready"}
      </div>
    </div>
  );
}

export default App;
