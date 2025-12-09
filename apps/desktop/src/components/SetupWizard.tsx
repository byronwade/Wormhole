import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  Check,
  Loader2,
  Shield,
  HardDrive,
  Wifi,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Lock,
  CheckCircle2,
  XCircle,
  Circle,
  Download,
  Terminal,
  Copy,
  Info,
  ShieldCheck,
  ShieldAlert,
  MonitorSmartphone,
  Folder,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Types for system checks
interface SystemCheck {
  id: string;
  name: string;
  description: string;
  status: "pending" | "checking" | "passed" | "failed" | "warning" | "skipped";
  required: boolean;
  helpUrl?: string;
  helpText?: string;
  installCommand?: string;
  platform: "all" | "macos" | "windows" | "linux";
  whyNeeded?: string;
  securityNote?: string;
  steps?: string[];
  canAutoInstall?: boolean;
}

interface WizardStep {
  id: string;
  title: string;
}

type Platform = "macos" | "windows" | "linux" | "unknown";

// Detect current platform
function detectPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "macos";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

// Copy to clipboard helper
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Setup Wizard Component
export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [platform] = useState<Platform>(detectPlatform);
  const [checks, setChecks] = useState<SystemCheck[]>([]);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [allChecksPassed, setAllChecksPassed] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [isAutoInstalling, setIsAutoInstalling] = useState<string | null>(null);

  const steps: WizardStep[] = [
    { id: "welcome", title: "Welcome" },
    { id: "requirements", title: "Requirements" },
    { id: "security", title: "Security Info" },
    { id: "ready", title: "Ready" },
  ];

  // Initialize system checks based on platform
  const initializeChecks = useCallback(() => {
    const platformChecks: SystemCheck[] = [
      // Universal checks
      {
        id: "network",
        name: "Network Access",
        description: "Required for peer-to-peer connections",
        status: "pending",
        required: true,
        platform: "all",
        helpText: "Check your firewall settings and ensure Wormhole is allowed to access the network.",
        whyNeeded: "Wormhole creates direct encrypted connections between computers. Network access is essential for discovering peers and transferring files.",
        securityNote: "Wormhole only connects to peers you explicitly approve via join codes. No data is sent to external servers.",
      },

      // macOS specific
      {
        id: "fuse-macos",
        name: "macFUSE",
        description: "Enables mounting remote folders in Finder",
        status: "pending",
        required: true,
        platform: "macos",
        helpUrl: "https://osxfuse.github.io/",
        helpText: "macFUSE is an open-source project that allows non-kernel software to create file systems on macOS.",
        installCommand: "brew install --cask macfuse",
        whyNeeded: "macFUSE allows Wormhole to show remote folders as if they were local drives in Finder. Without it, you'd need to manually download each file.",
        securityNote: "macFUSE is a widely-used, open-source kernel extension trusted by millions of developers. It's maintained by the same team that built the original FUSE for macOS. Apple requires you to approve kernel extensions for your security.",
        steps: [
          "Open Terminal (Applications → Utilities → Terminal)",
          "Run: brew install --cask macfuse",
          "Or download from osxfuse.github.io and run the installer",
          "After installation, you'll need to approve the kernel extension (next step)",
        ],
        canAutoInstall: true,
      },
      {
        id: "kernel-extensions",
        name: "Approve System Extension",
        description: "macFUSE kernel extension must be approved in System Settings",
        status: "pending",
        required: true,
        platform: "macos",
        helpText: "macOS requires you to manually approve kernel extensions for security. This is a one-time setup.",
        whyNeeded: "Apple's security model requires explicit user approval for any software that extends the kernel. This protects you from malicious software installing itself silently.",
        securityNote: "This is a standard macOS security feature, not a workaround. By approving macFUSE, you're telling macOS you trust this well-known open-source software. You can revoke this permission anytime in System Settings.",
        steps: [
          "Open System Settings (Apple menu → System Settings)",
          "Go to Privacy & Security",
          "Scroll down to the Security section",
          "You should see a message about blocked software from 'Benjamin Fleischer' (macFUSE developer)",
          "Click 'Allow' next to the message",
          "Enter your password when prompted",
          "Restart your Mac to complete the setup",
        ],
      },

      // Windows specific
      {
        id: "winfsp",
        name: "WinFSP",
        description: "Enables mounting remote folders in File Explorer",
        status: "pending",
        required: true,
        platform: "windows",
        helpUrl: "https://winfsp.dev/rel/",
        helpText: "WinFSP (Windows File System Proxy) is the Windows equivalent of FUSE - it allows programs to create virtual drives.",
        whyNeeded: "WinFSP allows Wormhole to show remote folders as drive letters (like W:) in File Explorer. This makes accessing remote files feel just like local files.",
        securityNote: "WinFSP is an open-source project created by a Microsoft employee. It's used by major software including SSHFS-Win, rclone, and many cloud storage tools. It's been audited and is considered safe.",
        steps: [
          "Download WinFSP from winfsp.dev/rel/",
          "Run the installer (winfsp-x.x.xxxxx.msi)",
          "Click 'Next' through the installation wizard",
          "Accept the default options",
          "No restart required",
        ],
        canAutoInstall: false, // Requires manual download
      },
      {
        id: "windows-firewall",
        name: "Firewall Access",
        description: "Allow Wormhole through Windows Firewall",
        status: "pending",
        required: true,
        platform: "windows",
        helpText: "Windows Firewall protects your computer. Wormhole needs permission to accept incoming connections from peers.",
        whyNeeded: "To receive files and connections from other computers, Wormhole needs to accept incoming network connections. Windows Firewall blocks these by default.",
        securityNote: "When you see the firewall prompt, you're allowing Wormhole (and only Wormhole) to receive connections. This doesn't expose other programs or your files. Only people with your join code can connect.",
        steps: [
          "When you first share a folder, Windows will show a firewall prompt",
          "Check both 'Private networks' and 'Public networks'",
          "Click 'Allow access'",
          "If you missed the prompt: open Windows Security → Firewall → Allow an app → Add Wormhole",
        ],
      },
      {
        id: "smartscreen",
        name: "Windows SmartScreen",
        description: "App signature verification (one-time)",
        status: "pending",
        required: false,
        platform: "windows",
        helpText: "Windows may show a SmartScreen warning because Wormhole is new and doesn't have an expensive code-signing certificate yet.",
        whyNeeded: "Microsoft charges $200-400/year for certificates that prevent SmartScreen warnings. As an open-source project, we're working on getting one.",
        securityNote: "SmartScreen warnings don't mean software is dangerous - they mean it's not commonly downloaded yet. Wormhole is open-source (github.com/byronwade/Wormhole), so you can verify the code yourself. This warning will go away once more users download Wormhole.",
        steps: [
          "When you see 'Windows protected your PC' - click 'More info'",
          "Click 'Run anyway'",
          "This is a one-time prompt per version",
          "You can verify Wormhole is safe by checking our open-source code on GitHub",
        ],
      },

      // Linux specific
      {
        id: "fuse-linux",
        name: "FUSE3",
        description: "Filesystem in Userspace support",
        status: "pending",
        required: true,
        platform: "linux",
        helpText: "FUSE3 is the standard Linux mechanism for user-space filesystems. Most distributions include it by default.",
        installCommand: "# Debian/Ubuntu:\nsudo apt install fuse3\n\n# Fedora:\nsudo dnf install fuse3\n\n# Arch:\nsudo pacman -S fuse3\n\n# openSUSE:\nsudo zypper install fuse3",
        whyNeeded: "FUSE (Filesystem in Userspace) is a Linux kernel feature that allows Wormhole to create mountable filesystems without requiring root privileges for every operation.",
        securityNote: "FUSE is a core Linux technology, included in the kernel since 2005. It's used by countless applications including SSHFS, NTFS-3G, and cloud storage tools. Installing it via your package manager is completely safe.",
        steps: [
          "Open a terminal",
          "Run the command for your distribution (see above)",
          "Enter your password when prompted",
          "No restart required",
        ],
        canAutoInstall: true,
      },
      {
        id: "fuse-group",
        name: "FUSE Permissions",
        description: "User must have permission to use FUSE",
        status: "pending",
        required: true,
        platform: "linux",
        helpText: "Your user needs to be in the 'fuse' group to mount filesystems without sudo.",
        installCommand: "sudo usermod -aG fuse $USER && newgrp fuse",
        whyNeeded: "Linux uses groups to manage permissions. The 'fuse' group grants permission to mount user-space filesystems. This avoids needing sudo for every mount operation.",
        securityNote: "Adding yourself to the 'fuse' group is a standard Linux administration task. It only grants permission to create FUSE mounts - it doesn't give elevated privileges elsewhere.",
        steps: [
          "Open a terminal",
          "Run: sudo usermod -aG fuse $USER",
          "Enter your password",
          "Run: newgrp fuse (or log out and back in)",
          "The change persists across reboots",
        ],
        canAutoInstall: true,
      },
    ];

    // Filter checks for current platform
    const relevantChecks = platformChecks.filter(
      (check) => check.platform === "all" || check.platform === platform
    );

    setChecks(relevantChecks);
  }, [platform]);

  useEffect(() => {
    initializeChecks();
  }, [initializeChecks]);

  // Auto-run checks when reaching requirements step
  useEffect(() => {
    if (currentStep === 1 && checks.length > 0 && checks.every(c => c.status === "pending")) {
      runSystemChecks();
    }
  }, [currentStep, checks.length]);

  // Run system checks
  const runSystemChecks = async () => {
    setIsRunningChecks(true);
    const updatedChecks = [...checks];

    for (let i = 0; i < updatedChecks.length; i++) {
      const check = updatedChecks[i];
      check.status = "checking";
      setChecks([...updatedChecks]);

      // Small delay for UX
      await new Promise((resolve) => setTimeout(resolve, 300));

      try {
        const result = await performCheck(check.id);
        check.status = result ? "passed" : check.required ? "failed" : "warning";
      } catch {
        check.status = check.required ? "failed" : "warning";
      }

      setChecks([...updatedChecks]);
    }

    setIsRunningChecks(false);

    // Check if all required checks passed
    const allRequired = updatedChecks
      .filter((c) => c.required)
      .every((c) => c.status === "passed");
    setAllChecksPassed(allRequired);
  };

  // Perform individual check
  const performCheck = async (checkId: string): Promise<boolean> => {
    try {
      switch (checkId) {
        case "network":
          const ips = await invoke<string[]>("get_local_ip");
          return ips && ips.length > 0;

        case "fuse-macos":
        case "kernel-extensions":
        case "winfsp":
        case "fuse-linux":
          return await invoke<boolean>("check_fuse_installed");

        case "windows-firewall":
        case "fuse-group":
        case "smartscreen":
          // These are runtime checks or user acknowledgment, assume passed for now
          return true;

        default:
          return true;
      }
    } catch {
      return false;
    }
  };

  // Auto-install handler (for systems with package managers)
  const handleAutoInstall = async (check: SystemCheck) => {
    if (!check.canAutoInstall || !check.installCommand) return;

    setIsAutoInstalling(check.id);

    try {
      // For now, just copy the command - in future we could run it via shell
      await copyToClipboard(check.installCommand.split('\n')[0]);
      setCopiedCommand(check.installCommand);

      // Open terminal with the command
      if (platform === "macos") {
        // On macOS, we can try to open Terminal with the command
        const cmd = check.installCommand.split('\n')[0];
        await open(`terminal://run?cmd=${encodeURIComponent(cmd)}`);
      }
    } catch (e) {
      console.error("Auto-install failed:", e);
    } finally {
      setIsAutoInstalling(null);
    }
  };

  // Render check status icon
  const renderCheckIcon = (status: SystemCheck["status"]) => {
    switch (status) {
      case "pending":
        return <Circle className="w-5 h-5 text-zinc-500" />;
      case "checking":
        return <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />;
      case "passed":
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-400" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "skipped":
        return <Circle className="w-5 h-5 text-zinc-600" />;
    }
  };

  const handleCopyCommand = async (command: string) => {
    const success = await copyToClipboard(command);
    if (success) {
      setCopiedCommand(command);
      setTimeout(() => setCopiedCommand(null), 2000);
    }
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await open(url);
    } catch (e) {
      console.error("Failed to open URL:", e);
      window.open(url, "_blank");
    }
  };

  // Step 1: Welcome
  const renderWelcome = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
        <HardDrive className="w-10 h-10 text-white" />
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">Welcome to Wormhole</h2>
      <p className="text-zinc-400 text-center max-w-md mb-8">
        Share folders instantly between computers. No cloud, no uploads, just direct encrypted connections.
      </p>

      <div className="grid grid-cols-3 gap-4 w-full max-w-md mb-8">
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-center">
          <Wifi className="w-6 h-6 text-violet-400 mx-auto mb-2" />
          <p className="text-xs text-zinc-300 font-medium">Direct P2P</p>
          <p className="text-[10px] text-zinc-500">No middleman</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-center">
          <Shield className="w-6 h-6 text-green-400 mx-auto mb-2" />
          <p className="text-xs text-zinc-300 font-medium">Encrypted</p>
          <p className="text-[10px] text-zinc-500">End-to-end</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-center">
          <Lock className="w-6 h-6 text-amber-400 mx-auto mb-2" />
          <p className="text-xs text-zinc-300 font-medium">Private</p>
          <p className="text-[10px] text-zinc-500">You control access</p>
        </div>
      </div>

      {/* Quick setup note */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 max-w-md">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-300 font-medium">Quick Setup Required</p>
            <p className="text-xs text-blue-200/70 mt-1">
              Wormhole needs a small system component to show remote folders as local drives.
              We'll guide you through the 2-minute setup on the next screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Step 2: Requirements with detailed guides
  const renderRequirements = () => {
    const failedChecks = checks.filter(c => c.status === "failed");
    const passedChecks = checks.filter(c => c.status === "passed");

    return (
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">System Requirements</h3>
            <p className="text-sm text-zinc-400">
              Platform: <Badge variant="secondary" className="ml-1 text-xs">{platform}</Badge>
            </p>
          </div>
          <Button
            onClick={runSystemChecks}
            disabled={isRunningChecks}
            variant="outline"
            size="sm"
            className="gap-2 border-zinc-700"
          >
            {isRunningChecks ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {isRunningChecks ? "Checking..." : "Re-check"}
          </Button>
        </div>

        {/* Checks List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mr-2">
          {checks.map((check) => (
            <Card
              key={check.id}
              className={`bg-zinc-900/50 border-zinc-800 transition-colors ${
                check.status === "failed" ? "border-red-500/30" :
                check.status === "passed" ? "border-green-500/20" : ""
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {renderCheckIcon(check.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-white">{check.name}</span>
                      {check.required && check.status !== "passed" && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Required</Badge>
                      )}
                      {check.status !== "pending" && check.status !== "checking" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] text-zinc-500 hover:text-white"
                          onClick={() => setExpandedCheck(expandedCheck === check.id ? null : check.id)}
                        >
                          {expandedCheck === check.id ? "Hide details" : "Show details"}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{check.description}</p>

                    {/* Expanded details for any check */}
                    {expandedCheck === check.id && check.status === "passed" && (
                      <div className="mt-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                        <p className="text-xs text-green-300">{check.whyNeeded}</p>
                      </div>
                    )}

                    {/* Show help for failed checks */}
                    {(check.status === "failed" || expandedCheck === check.id) && check.status !== "passed" && (
                      <div className="mt-2 p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 space-y-3">
                        {/* Why it's needed */}
                        {check.whyNeeded && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mb-1">
                              <Info className="w-3 h-3" />
                              Why is this needed?
                            </div>
                            <p className="text-xs text-zinc-300">{check.whyNeeded}</p>
                          </div>
                        )}

                        {/* Security note */}
                        {check.securityNote && (
                          <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                            <div className="flex items-center gap-1.5 text-[10px] text-green-400 mb-1">
                              <ShieldCheck className="w-3 h-3" />
                              Security Note
                            </div>
                            <p className="text-xs text-green-300/90">{check.securityNote}</p>
                          </div>
                        )}

                        {/* Step-by-step instructions */}
                        {check.steps && check.steps.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mb-2">
                              <MonitorSmartphone className="w-3 h-3" />
                              Step-by-step guide:
                            </div>
                            <ol className="space-y-1.5">
                              {check.steps.map((step, i) => (
                                <li key={i} className="flex gap-2 text-xs text-zinc-300">
                                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-violet-600/30 text-violet-300 flex items-center justify-center text-[10px]">
                                    {i + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Install command */}
                        {check.installCommand && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                <Terminal className="w-3 h-3" />
                                Install command:
                              </div>
                              {check.canAutoInstall && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-2 text-[10px] text-violet-400 hover:text-violet-300 gap-1"
                                  onClick={() => handleAutoInstall(check)}
                                  disabled={isAutoInstalling === check.id}
                                >
                                  {isAutoInstalling === check.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                  Copy & Run
                                </Button>
                              )}
                            </div>
                            <div className="relative">
                              <pre className="text-xs text-violet-300 bg-zinc-900 rounded p-2 pr-8 overflow-x-auto font-mono whitespace-pre-wrap">
                                {check.installCommand}
                              </pre>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1 h-6 w-6 hover:bg-zinc-700"
                                onClick={() => handleCopyCommand(check.installCommand!)}
                              >
                                {copiedCommand === check.installCommand ? (
                                  <Check className="w-3 h-3 text-green-400" />
                                ) : (
                                  <Copy className="w-3 h-3 text-zinc-400" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Download link */}
                        {check.helpUrl && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-violet-400 gap-1"
                            onClick={() => handleOpenUrl(check.helpUrl!)}
                          >
                            <Download className="w-3 h-3" />
                            Download / Learn more
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary */}
        {!isRunningChecks && checks.some((c) => c.status !== "pending") && (
          <div className={`mt-4 p-3 rounded-xl border flex items-center gap-3 ${
            allChecksPassed
              ? "bg-green-500/10 border-green-500/30"
              : "bg-amber-500/10 border-amber-500/30"
          }`}>
            {allChecksPassed ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${allChecksPassed ? "text-green-300" : "text-amber-300"}`}>
                {allChecksPassed
                  ? `All ${passedChecks.length} checks passed!`
                  : `${failedChecks.length} requirement${failedChecks.length > 1 ? "s" : ""} need${failedChecks.length === 1 ? "s" : ""} attention`}
              </p>
              <p className="text-xs text-zinc-400">
                {allChecksPassed
                  ? "Your system is ready"
                  : "Follow the guides above, then click Re-check"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Step 3: Security Information
  const renderSecurityInfo = () => (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto">
      <div className="max-w-lg mx-auto w-full space-y-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-xl font-semibold text-white">Understanding the Security Prompts</h3>
          <p className="text-sm text-zinc-400 mt-2">
            You may see security warnings during setup. Here's what they mean and why they appear.
          </p>
        </div>

        {/* macOS Gatekeeper */}
        {platform === "macos" && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-400 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-white text-sm">macOS Gatekeeper Warning</h4>
                  <p className="text-xs text-zinc-400 mt-1">
                    "Wormhole.app cannot be opened because it is from an unidentified developer"
                  </p>
                  <div className="mt-3 p-2 rounded bg-zinc-800/50">
                    <p className="text-xs text-zinc-300 mb-2">
                      <strong>Why this appears:</strong> Apple charges $99/year for developer certificates.
                      We use ad-hoc signing which is secure but not recognized by Apple.
                    </p>
                    <p className="text-xs text-zinc-300 mb-2">
                      <strong>Is it safe?</strong> Yes! Wormhole is open-source. You can verify the code
                      yourself at github.com/byronwade/Wormhole
                    </p>
                    <p className="text-xs text-zinc-300">
                      <strong>How to open:</strong> Right-click the app → Open → Click "Open" in the dialog
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Windows SmartScreen */}
        {platform === "windows" && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-blue-400 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-white text-sm">Windows SmartScreen Warning</h4>
                  <p className="text-xs text-zinc-400 mt-1">
                    "Windows protected your PC - Microsoft Defender SmartScreen prevented an unrecognized app from starting"
                  </p>
                  <div className="mt-3 p-2 rounded bg-zinc-800/50">
                    <p className="text-xs text-zinc-300 mb-2">
                      <strong>Why this appears:</strong> SmartScreen warns about apps that aren't commonly
                      downloaded yet. Code signing certificates cost $200-400/year.
                    </p>
                    <p className="text-xs text-zinc-300 mb-2">
                      <strong>Is it safe?</strong> Yes! Wormhole is open-source and the binaries are built
                      automatically by GitHub Actions with full transparency.
                    </p>
                    <p className="text-xs text-zinc-300">
                      <strong>How to proceed:</strong> Click "More info" → Click "Run anyway"
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* General security info */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Folder className="w-6 h-6 text-violet-400 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white text-sm">Your Data Stays Private</h4>
                <div className="mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-zinc-300">
                      <strong>No cloud servers</strong> - Files transfer directly between computers
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-zinc-300">
                      <strong>End-to-end encryption</strong> - All data is encrypted using QUIC/TLS
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-zinc-300">
                      <strong>Join code access</strong> - Only people with your code can connect
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-zinc-300">
                      <strong>Open source</strong> - Full code available for review on GitHub
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open source badge */}
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-zinc-700 text-zinc-400"
            onClick={() => handleOpenUrl("https://github.com/byronwade/Wormhole")}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Source Code on GitHub
          </Button>
        </div>
      </div>
    </div>
  );

  // Step 4: Ready
  const renderReady = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center mb-6">
        <Check className="w-10 h-10 text-green-400" />
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">You're All Set!</h2>
      <p className="text-zinc-400 text-center max-w-md mb-8">
        Wormhole is configured and ready. Start sharing folders instantly.
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
          <h4 className="font-medium text-white text-sm mb-1">To Share</h4>
          <p className="text-xs text-zinc-400">
            Click "Share Folder", pick a folder, and share the join code
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
          <h4 className="font-medium text-white text-sm mb-1">To Connect</h4>
          <p className="text-xs text-zinc-400">
            Click "Connect", enter the code, and pick a mount location
          </p>
        </div>
      </div>

      <Button
        onClick={onComplete}
        size="lg"
        className="bg-violet-600 hover:bg-violet-700 text-white px-8 gap-2"
      >
        Get Started
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case "welcome":
        return renderWelcome();
      case "requirements":
        return renderRequirements();
      case "security":
        return renderSecurityInfo();
      case "ready":
        return renderReady();
      default:
        return null;
    }
  };

  const canProceed = () => {
    if (steps[currentStep].id === "requirements") {
      // Can proceed if all required checks passed OR user skips
      return allChecksPassed;
    }
    return true;
  };

  return (
    <div className="h-screen bg-zinc-900 flex flex-col overflow-hidden pt-8">
      {/* Draggable title bar region for macOS */}
      <div
        data-tauri-drag-region
        className="h-8 w-full flex-shrink-0 absolute top-0 left-0 right-0 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {/* Progress Header */}
      <div className="bg-zinc-900/50 px-6 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    index < currentStep
                      ? "bg-violet-600 text-white"
                      : index === currentStep
                      ? "bg-violet-600 text-white ring-2 ring-violet-400/50"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {index < currentStep ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-8 h-0.5 mx-1 rounded-full transition-colors ${
                      index < currentStep ? "bg-violet-600" : "bg-zinc-800"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onComplete}
            className="text-zinc-500 hover:text-white text-xs"
          >
            Skip Setup
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">{steps[currentStep].title}</span>
          <span className="text-xs text-zinc-500">
            Step {currentStep + 1} of {steps.length}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {renderStepContent()}
      </div>

      {/* Footer Navigation */}
      {steps[currentStep].id !== "ready" && (
        <div className="bg-zinc-900/50 px-6 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {steps[currentStep].id === "requirements" && !allChecksPassed && (
              <Button
                variant="ghost"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="text-zinc-500 hover:text-white"
              >
                Skip for now
              </Button>
            )}
            <Button
              onClick={() => setCurrentStep((s) => Math.min(steps.length - 1, s + 1))}
              disabled={steps[currentStep].id === "requirements" && isRunningChecks}
              className={`gap-2 ${
                canProceed() ? "bg-violet-600 hover:bg-violet-700" : "bg-zinc-700"
              }`}
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SetupWizard;
