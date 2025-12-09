import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  Folder,
  Monitor,
  Settings,
  Info,
  CheckCircle2,
  XCircle,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// Types for system checks
interface SystemCheck {
  id: string;
  name: string;
  description: string;
  status: "pending" | "checking" | "passed" | "failed" | "warning" | "skipped";
  required: boolean;
  helpUrl?: string;
  helpText?: string;
  fixAction?: () => Promise<void>;
  platform: "all" | "macos" | "windows" | "linux";
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
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

// Setup Wizard Component
export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [platform] = useState<Platform>(detectPlatform);
  const [checks, setChecks] = useState<SystemCheck[]>([]);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [allChecksPassed, setAllChecksPassed] = useState(false);

  const steps: WizardStep[] = [
    {
      id: "welcome",
      title: "Welcome to Wormhole",
      description: "Let's make sure everything is ready",
    },
    {
      id: "requirements",
      title: "System Requirements",
      description: "Checking your system compatibility",
    },
    {
      id: "permissions",
      title: "Permissions",
      description: "Grant necessary access for file sharing",
    },
    {
      id: "security",
      title: "Security & Privacy",
      description: "Your security settings explained",
    },
    {
      id: "ready",
      title: "You're All Set!",
      description: "Wormhole is ready to use",
    },
  ];

  // Initialize system checks based on platform
  const initializeChecks = useCallback(() => {
    const platformChecks: SystemCheck[] = [
      // Universal checks
      {
        id: "network",
        name: "Network Access",
        description: "Wormhole needs network access for peer-to-peer connections",
        status: "pending",
        required: true,
        platform: "all",
        helpText: "Wormhole uses your local network to connect directly to other computers. No data goes through external servers.",
      },

      // macOS specific
      {
        id: "fuse-macos",
        name: "macFUSE Installed",
        description: "Required for mounting remote folders as local drives",
        status: "pending",
        required: true,
        platform: "macos",
        helpUrl: "https://osxfuse.github.io/",
        helpText: "macFUSE allows Wormhole to show remote folders in Finder. Download from osxfuse.github.io",
      },
      {
        id: "full-disk-access",
        name: "Full Disk Access",
        description: "Optional: Allows sharing any folder on your Mac",
        status: "pending",
        required: false,
        platform: "macos",
        helpText: "Without this, you can only share folders in your Documents, Downloads, and Desktop. Go to System Settings > Privacy & Security > Full Disk Access",
      },
      {
        id: "kernel-extensions",
        name: "System Extensions Allowed",
        description: "macFUSE requires system extension approval",
        status: "pending",
        required: true,
        platform: "macos",
        helpText: "After installing macFUSE, go to System Settings > Privacy & Security and click 'Allow' for the system extension",
      },

      // Windows specific
      {
        id: "winfsp",
        name: "WinFSP Installed",
        description: "Required for mounting remote folders as local drives",
        status: "pending",
        required: true,
        platform: "windows",
        helpUrl: "https://winfsp.dev/",
        helpText: "WinFSP allows Wormhole to show remote folders in File Explorer. Download from winfsp.dev",
      },
      {
        id: "windows-firewall",
        name: "Windows Firewall Exception",
        description: "Wormhole needs to receive incoming connections",
        status: "pending",
        required: true,
        platform: "windows",
        helpText: "When Windows asks, click 'Allow access' for Wormhole. You can also add it manually in Windows Defender Firewall settings.",
      },

      // Linux specific
      {
        id: "fuse-linux",
        name: "FUSE Installed",
        description: "Required for mounting remote folders",
        status: "pending",
        required: true,
        platform: "linux",
        helpText: "Install with: sudo apt install fuse3 (Debian/Ubuntu) or sudo dnf install fuse3 (Fedora)",
      },
      {
        id: "fuse-group",
        name: "User in fuse Group",
        description: "Your user needs permission to use FUSE",
        status: "pending",
        required: true,
        platform: "linux",
        helpText: "Run: sudo usermod -aG fuse $USER, then log out and back in",
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

  // Run system checks
  const runSystemChecks = async () => {
    setIsRunningChecks(true);
    const updatedChecks = [...checks];

    for (let i = 0; i < updatedChecks.length; i++) {
      const check = updatedChecks[i];
      check.status = "checking";
      setChecks([...updatedChecks]);

      // Simulate check delay for UX
      await new Promise((resolve) => setTimeout(resolve, 500));

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
          // Check if we can get local IP
          const ips = await invoke<string[]>("get_local_ip");
          return ips && ips.length > 0;

        case "fuse-macos":
          // Check if macFUSE is installed
          const macfuseResult = await invoke<boolean>("check_fuse_installed");
          return macfuseResult;

        case "full-disk-access":
          // This is optional, always pass for now
          return true;

        case "kernel-extensions":
          // Check if kernel extensions are allowed (tied to FUSE working)
          const kextResult = await invoke<boolean>("check_fuse_installed");
          return kextResult;

        case "winfsp":
          // Check if WinFSP is installed
          const winfspResult = await invoke<boolean>("check_fuse_installed");
          return winfspResult;

        case "windows-firewall":
          // Firewall check - we'll handle this when needed
          return true;

        case "fuse-linux":
          // Check if FUSE is installed on Linux
          const linuxFuseResult = await invoke<boolean>("check_fuse_installed");
          return linuxFuseResult;

        case "fuse-group":
          // Check if user is in fuse group
          return true; // Will be checked at runtime

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

  // Step content renderers
  const renderWelcome = () => (
    <div className="text-center space-y-8 py-8">
      <div className="w-24 h-24 mx-auto rounded-2xl bg-violet-600 flex items-center justify-center">
        <HardDrive className="w-12 h-12 text-white" />
      </div>

      <div className="space-y-4">
        <h2 className="text-3xl font-bold text-white">Welcome to Wormhole</h2>
        <p className="text-lg text-zinc-400 max-w-md mx-auto">
          Share folders instantly between computers. No cloud uploads, no waiting.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <Wifi className="w-8 h-8 text-violet-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-300">Direct P2P</p>
          <p className="text-xs text-zinc-500">No middleman</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-300">Encrypted</p>
          <p className="text-xs text-zinc-500">End-to-end</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <Lock className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-300">Your Control</p>
          <p className="text-xs text-zinc-500">You decide who</p>
        </div>
      </div>

      <div className="bg-zinc-800/30 border border-zinc-700 rounded-xl p-4 max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-400 text-left">
            This wizard will check your system and guide you through any needed setup.
            <span className="text-zinc-300"> No changes will be made without your approval.</span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderRequirements = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">System Checks</h3>
          <p className="text-sm text-zinc-400">
            Detected platform: <Badge variant="secondary" className="ml-1">{platform}</Badge>
          </p>
        </div>
        <Button
          onClick={runSystemChecks}
          disabled={isRunningChecks}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isRunningChecks ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {isRunningChecks ? "Checking..." : "Run Checks"}
        </Button>
      </div>

      <ScrollArea className="h-[320px]">
        <div className="space-y-3 pr-4">
          {checks.map((check) => (
            <Card
              key={check.id}
              className={`bg-zinc-900 border-zinc-800 ${
                check.status === "failed"
                  ? "border-red-500/50"
                  : check.status === "passed"
                  ? "border-green-500/30"
                  : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-0.5">
                    {renderCheckIcon(check.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{check.name}</span>
                      {check.required ? (
                        <Badge variant="destructive" className="text-xs">Required</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{check.description}</p>

                    {/* Show help text for failed/warning checks */}
                    {(check.status === "failed" || check.status === "warning") && check.helpText && (
                      <div className="mt-3 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                        <p className="text-sm text-zinc-300">{check.helpText}</p>
                        {check.helpUrl && (
                          <Button
                            variant="link"
                            size="sm"
                            className="mt-2 h-auto p-0 text-violet-400"
                            onClick={() => window.open(check.helpUrl, "_blank")}
                          >
                            Download / Learn more
                            <ExternalLink className="w-3 h-3 ml-1" />
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
      </ScrollArea>

      {/* Summary */}
      {!isRunningChecks && checks.some((c) => c.status !== "pending") && (
        <div className={`p-4 rounded-xl border ${
          allChecksPassed
            ? "bg-green-500/10 border-green-500/30"
            : "bg-amber-500/10 border-amber-500/30"
        }`}>
          <div className="flex items-center gap-3">
            {allChecksPassed ? (
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            )}
            <div>
              <p className={`font-medium ${allChecksPassed ? "text-green-300" : "text-amber-300"}`}>
                {allChecksPassed
                  ? "All required checks passed!"
                  : "Some requirements need attention"}
              </p>
              <p className="text-sm text-zinc-400">
                {allChecksPassed
                  ? "Your system is ready for Wormhole"
                  : "Install missing components and run checks again"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPermissions = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Shield className="w-16 h-16 text-violet-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white">Permissions Overview</h3>
        <p className="text-zinc-400 mt-2">
          Wormhole needs minimal permissions to work. Here's what each one does:
        </p>
      </div>

      <div className="space-y-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Wifi className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">Network Access</h4>
                <p className="text-sm text-zinc-400 mt-1">
                  Required to connect to other computers on your network.
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-zinc-300">No data sent to external servers</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-zinc-300">Only connects to computers you approve</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Folder className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">Folder Access</h4>
                <p className="text-sm text-zinc-400 mt-1">
                  Only accesses folders you explicitly choose to share.
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-zinc-300">You pick exactly what to share</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-zinc-300">No access to other files on your computer</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {platform === "macos" && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h4 className="font-medium text-white">System Extension (macFUSE)</h4>
                  <p className="text-sm text-zinc-400 mt-1">
                    Required to mount remote folders in Finder.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-zinc-300">Open source and widely used</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-zinc-300">Can be uninstalled anytime</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="bg-zinc-800/30 border border-zinc-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">
            <span className="font-medium">We never ask for:</span> Admin/root password,
            access to system files, firewall changes, or any permissions beyond what's needed.
          </p>
        </div>
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Lock className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white">Your Privacy & Security</h3>
        <p className="text-zinc-400 mt-2">
          Wormhole is designed with your security as the top priority.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-400" />
            </div>
            <h4 className="font-medium text-white">No Cloud Storage</h4>
          </div>
          <p className="text-sm text-zinc-400 pl-11">
            Your files never leave your computer. They're streamed directly to whoever you share with.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-400" />
            </div>
            <h4 className="font-medium text-white">End-to-End Encryption</h4>
          </div>
          <p className="text-sm text-zinc-400 pl-11">
            All data is encrypted using AES-256. Only you and the recipient can see the files.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-400" />
            </div>
            <h4 className="font-medium text-white">Join Codes Expire</h4>
          </div>
          <p className="text-sm text-zinc-400 pl-11">
            Share codes are temporary and only work while you're actively sharing.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-400" />
            </div>
            <h4 className="font-medium text-white">No Account Required</h4>
          </div>
          <p className="text-sm text-zinc-400 pl-11">
            No sign-up, no tracking, no data collection. Just share and connect.
          </p>
        </div>
      </div>

      <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">
            <span className="font-medium">Firewall notice:</span> Wormhole doesn't require
            disabling your firewall. If prompted, allow Wormhole to accept incoming connections
            only on your private network.
          </p>
        </div>
      </div>
    </div>
  );

  const renderReady = () => (
    <div className="text-center space-y-8 py-8">
      <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center">
        <Check className="w-12 h-12 text-green-400" />
      </div>

      <div className="space-y-4">
        <h2 className="text-3xl font-bold text-white">You're Ready!</h2>
        <p className="text-lg text-zinc-400 max-w-md mx-auto">
          Wormhole is set up and ready to use. Start sharing folders instantly.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 text-left">
          <h4 className="font-medium text-white mb-2">To Share</h4>
          <p className="text-sm text-zinc-400">
            Click "Share Folder", select a folder, and share the join code.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 text-left">
          <h4 className="font-medium text-white mb-2">To Connect</h4>
          <p className="text-sm text-zinc-400">
            Click "Connect", enter the join code, and pick where to mount.
          </p>
        </div>
      </div>

      <Button
        onClick={onComplete}
        size="lg"
        className="bg-violet-600 hover:bg-violet-700 text-white px-8"
      >
        Get Started
        <ChevronRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  );

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case "welcome":
        return renderWelcome();
      case "requirements":
        return renderRequirements();
      case "permissions":
        return renderPermissions();
      case "security":
        return renderSecurity();
      case "ready":
        return renderReady();
      default:
        return null;
    }
  };

  const canProceed = () => {
    if (steps[currentStep].id === "requirements") {
      // Can only proceed if checks were run and all required passed
      return allChecksPassed || checks.every((c) => c.status === "pending");
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header with progress */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                <Settings className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Setup Wizard</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onComplete}
              className="text-zinc-400 hover:text-white"
            >
              Skip Setup
            </Button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    index <= currentStep ? "bg-violet-500" : "bg-zinc-700"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-zinc-500">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-xs text-zinc-400">{steps[currentStep].title}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {renderStepContent()}
        </div>
      </div>

      {/* Footer with navigation */}
      {steps[currentStep].id !== "ready" && (
        <div className="border-t border-zinc-800 bg-zinc-900/50">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>

            <Button
              onClick={() => setCurrentStep((s) => Math.min(steps.length - 1, s + 1))}
              disabled={!canProceed()}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              {currentStep === steps.length - 2 ? "Finish" : "Continue"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SetupWizard;
