import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Square, Copy } from "lucide-react";
import { useState, useEffect } from "react";

interface WindowControlsProps {
  className?: string;
}

export function WindowControls({ className = "" }: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState<"macos" | "windows" | "linux">("macos");

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) {
      setPlatform("macos");
    } else if (ua.includes("win")) {
      setPlatform("windows");
    } else {
      setPlatform("linux");
    }

    // Check if window is maximized
    const checkMaximized = async () => {
      const maximized = await getCurrentWindow().isMaximized();
      setIsMaximized(maximized);
    };
    checkMaximized();

    // Listen for window state changes
    const unlisten = getCurrentWindow().onResized(async () => {
      const maximized = await getCurrentWindow().isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = async () => {
    await getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  };

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  // macOS-style traffic light buttons (left side)
  if (platform === "macos") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={handleClose}
          className="group w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 flex items-center justify-center transition-colors"
          title="Close"
        >
          <X className="w-2 h-2 text-[#4a0002] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleMinimize}
          className="group w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 flex items-center justify-center transition-colors"
          title="Minimize"
        >
          <Minus className="w-2 h-2 text-[#985700] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleMaximize}
          className="group w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 flex items-center justify-center transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="w-1.5 h-1.5 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity rotate-90" />
          ) : (
            <div className="w-1.5 h-1.5 border border-[#006500] opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>
    );
  }

  // Windows/Linux-style buttons (right side)
  return (
    <div className={`flex items-center ${className}`}>
      <button
        onClick={handleMinimize}
        className="w-11 h-8 flex items-center justify-center hover:bg-zinc-700/50 transition-colors"
        title="Minimize"
      >
        <Minus className="w-4 h-4 text-zinc-400" />
      </button>
      <button
        onClick={handleMaximize}
        className="w-11 h-8 flex items-center justify-center hover:bg-zinc-700/50 transition-colors"
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          <Copy className="w-3.5 h-3.5 text-zinc-400 rotate-90" />
        ) : (
          <Square className="w-3.5 h-3.5 text-zinc-400" />
        )}
      </button>
      <button
        onClick={handleClose}
        className="w-11 h-8 flex items-center justify-center hover:bg-red-600 transition-colors group"
        title="Close"
      >
        <X className="w-4 h-4 text-zinc-400 group-hover:text-white" />
      </button>
    </div>
  );
}

// Title bar with drag region
interface TitleBarProps {
  children?: React.ReactNode;
  className?: string;
}

export function TitleBar({ children, className = "" }: TitleBarProps) {
  const [platform, setPlatform] = useState<"macos" | "windows" | "linux">("macos");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) {
      setPlatform("macos");
    } else if (ua.includes("win")) {
      setPlatform("windows");
    } else {
      setPlatform("linux");
    }
  }, []);

  return (
    <div
      data-tauri-drag-region
      className={`h-10 flex items-center select-none ${className}`}
    >
      {/* macOS: controls on left */}
      {platform === "macos" && (
        <div className="pl-4 pr-4">
          <WindowControls />
        </div>
      )}

      {/* Content fills the middle */}
      <div className="flex-1 flex items-center justify-center" data-tauri-drag-region>
        {children}
      </div>

      {/* Windows/Linux: controls on right */}
      {platform !== "macos" && (
        <WindowControls />
      )}
    </div>
  );
}
