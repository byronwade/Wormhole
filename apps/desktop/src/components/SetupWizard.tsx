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

  const steps: WizardStep[] = [
    { id: "welcome", title: "Welcome" },
    { id: "requirements", title: "Requirements" },
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
        helpText: "macFUSE is required to mount remote folders as local drives. Install it via Homebrew or download from the official website.",
        installCommand: "brew install --cask macfuse",
      },
      {
        id: "kernel-extensions",
        name: "System Extension",
        description: "macFUSE kernel extension must be approved",
        status: "pending",
        required: true,
        platform: "macos",
        helpText: "After installing macFUSE, open System Settings → Privacy & Security → scroll down and click \"Allow\" next to the macFUSE extension. You may need to restart your Mac.",
      },

      // Windows specific
      {
        id: "winfsp",
        name: "WinFSP",
        description: "Enables mounting remote folders in Explorer",
        status: "pending",
        required: true,
        platform: "windows",
        helpUrl: "https://winfsp.dev/rel/",
        helpText: "WinFSP (Windows File System Proxy) allows Wormhole to show remote folders in File Explorer. Download and install from the official website.",
      },
      {
        id: "windows-firewall",
        name: "Firewall Access",
        description: "Wormhole needs to accept incoming connections",
        status: "pending",
        required: true,
        platform: "windows",
        helpText: "When Windows prompts you, click \"Allow access\" for both private and public networks. You can also manually add Wormhole in Windows Defender Firewall.",
      },

      // Linux specific
      {
        id: "fuse-linux",
        name: "FUSE3",
        description: "Filesystem in Userspace support",
        status: "pending",
        required: true,
        platform: "linux",
        helpText: "FUSE3 is required to mount remote folders. Install using your package manager.",
        installCommand: "sudo apt install fuse3  # Debian/Ubuntu\nsudo dnf install fuse3  # Fedora\nsudo pacman -S fuse3   # Arch",
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
          // These are runtime checks, assume passed for now
          return true;

        default:
          return true;
      }
    } catch {
      return false;
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
      // Fallback to window.open
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
        Share folders instantly between computers. No cloud, no uploads, just direct connections.
      </p>

      <div className="grid grid-cols-3 gap-4 w-full max-w-md">
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
    </div>
  );

  // Step 2: Requirements
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
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{check.description}</p>

                    {/* Show help for failed checks */}
                    {check.status === "failed" && (
                      <div className="mt-2 p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                        <p className="text-xs text-zinc-300 mb-2">{check.helpText}</p>

                        {/* Install command */}
                        {check.installCommand && (
                          <div className="mb-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                              <Terminal className="w-3 h-3" />
                              Install command:
                            </div>
                            <div className="relative">
                              <pre className="text-xs text-violet-300 bg-zinc-900 rounded p-2 pr-8 overflow-x-auto font-mono">
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
                  : "Install the missing components above and click Re-check"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Step 3: Ready
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
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden pt-8">
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
                    className={`w-12 h-0.5 mx-2 rounded-full transition-colors ${
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
