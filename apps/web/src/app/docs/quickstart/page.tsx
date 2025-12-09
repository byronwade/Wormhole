import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Terminal,
  Download,
  ArrowRight,
  CheckCircle2,
  Copy,
  Info,
  AlertTriangle,
  Apple,
  Monitor,
  Cpu,
} from "lucide-react";

export const metadata = {
  title: "Quick Start - Wormhole Documentation",
  description: "Get Wormhole running in 5 minutes. Learn how to host and mount remote folders with simple commands.",
};

export default function QuickStartPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">
          Getting Started
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Quick Start Guide
        </h1>
        <p className="text-xl text-zinc-400">
          Get Wormhole running in 5 minutes. Share folders and mount remote directories like a local drive.
        </p>
      </div>

      {/* Prerequisites */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Prerequisites</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Apple className="w-8 h-8 text-zinc-400" />
              <div>
                <div className="font-medium text-white">macOS</div>
                <div className="text-xs text-zinc-500">10.13+ with macFUSE</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Cpu className="w-8 h-8 text-zinc-400" />
              <div>
                <div className="font-medium text-white">Linux</div>
                <div className="text-xs text-zinc-500">Kernel 4.18+ with FUSE3</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 opacity-60">
            <CardContent className="p-4 flex items-center gap-3">
              <Monitor className="w-8 h-8 text-zinc-400" />
              <div>
                <div className="font-medium text-white">Windows</div>
                <div className="text-xs text-zinc-500">Coming soon</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 1: Install */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
            1
          </div>
          <h2 className="text-2xl font-bold text-white">Install Wormhole</h2>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">macOS</h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                <span className="text-xs text-zinc-500 font-mono">Terminal</span>
              </div>
              <pre className="p-4 text-sm overflow-x-auto">
                <code className="text-zinc-300">
{`# Install macFUSE first (required for mounting)
brew install macfuse

# Install Wormhole
brew install byronwade/tap/wormhole

# Or download from releases
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-macos.tar.gz | tar xz
sudo mv wormhole /usr/local/bin/`}
                </code>
              </pre>
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold text-white">Linux</h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                <span className="text-xs text-zinc-500 font-mono">Terminal</span>
              </div>
              <pre className="p-4 text-sm overflow-x-auto">
                <code className="text-zinc-300">
{`# Install FUSE3 (Ubuntu/Debian)
sudo apt install libfuse3-dev fuse3

# Install FUSE3 (Fedora/RHEL)
sudo dnf install fuse3 fuse3-devel

# Download and install Wormhole
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-linux.tar.gz | tar xz
sudo mv wormhole /usr/local/bin/
sudo chmod +x /usr/local/bin/wormhole`}
                </code>
              </pre>
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold text-white">Build from Source</h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                <span className="text-xs text-zinc-500 font-mono">Terminal</span>
              </div>
              <pre className="p-4 text-sm overflow-x-auto">
                <code className="text-zinc-300">
{`# Clone the repository
git clone https://github.com/byronwade/wormhole.git
cd wormhole

# Build with Cargo (requires Rust 1.75+)
cargo build --release

# Install
sudo cp target/release/wormhole /usr/local/bin/`}
                </code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <Alert className="bg-zinc-900/50 border-zinc-700">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertTitle className="text-white">Verify Installation</AlertTitle>
          <AlertDescription className="text-zinc-400">
            Run <code className="bg-zinc-800 px-1 rounded">wormhole version</code> to verify the installation was successful.
          </AlertDescription>
        </Alert>
      </section>

      {/* Step 2: Host a Folder */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
            2
          </div>
          <h2 className="text-2xl font-bold text-white">Host a Folder</h2>
        </div>

        <p className="text-zinc-400">
          On the machine with the files you want to share, run the <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-400">host</code> command:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Host Machine</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`$ wormhole host ~/Projects/video-project

Scanning folder... 47.3 GB in 1,247 files
Starting QUIC server on 0.0.0.0:4433...

╔════════════════════════════════════════════╗
║  Join Code: WORM-7X9K-BETA                 ║
║                                            ║
║  Share this code with anyone who needs     ║
║  to access this folder.                    ║
╚════════════════════════════════════════════╝

Waiting for connections...`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="font-medium text-white mb-2">Common Options</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li><code className="text-violet-400">--port 5000</code> - Use a different port</li>
                <li><code className="text-violet-400">--allow-write</code> - Enable write access</li>
                <li><code className="text-violet-400">--daemon</code> - Run in background</li>
                <li><code className="text-violet-400">--copy-code</code> - Copy code to clipboard</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="font-medium text-white mb-2">Security Options</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li><code className="text-violet-400">--password</code> - Require password</li>
                <li><code className="text-violet-400">--allow-ips</code> - IP whitelist</li>
                <li><code className="text-violet-400">--expire-after 2h</code> - Auto-expire</li>
                <li><code className="text-violet-400">--max-connections 5</code> - Limit peers</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 3: Mount on Another Machine */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
            3
          </div>
          <h2 className="text-2xl font-bold text-white">Mount on Another Machine</h2>
        </div>

        <p className="text-zinc-400">
          On the machine that needs to access the files, use the join code:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Client Machine</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`$ wormhole mount WORM-7X9K-BETA ~/mnt/project

Connecting to signal server...
Found peer at 192.168.1.42:4433
Establishing QUIC connection...
Authenticating with PAKE...

✓ Mounted at /Users/you/mnt/project

Files are now accessible. Open Finder or use the terminal:
$ ls ~/mnt/project
$ open ~/mnt/project`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="font-medium text-white mb-2">Mount Options</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li><code className="text-violet-400">--read-only</code> - Read-only mount</li>
                <li><code className="text-violet-400">--cache-mode hybrid</code> - Caching strategy</li>
                <li><code className="text-violet-400">--ram-cache-mb 1024</code> - RAM cache size</li>
                <li><code className="text-violet-400">--prefetch</code> - Enable prefetching</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="font-medium text-white mb-2">Connection Options</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li><code className="text-violet-400">--signal ws://...</code> - Custom signal server</li>
                <li><code className="text-violet-400">--auto-reconnect</code> - Auto-reconnect</li>
                <li><code className="text-violet-400">--offline-mode</code> - Serve from cache</li>
                <li><code className="text-violet-400">--timeout 60</code> - Connection timeout</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 4: Work with Files */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
            4
          </div>
          <h2 className="text-2xl font-bold text-white">Work with Files</h2>
        </div>

        <p className="text-zinc-400">
          The mounted folder behaves like any local directory. Use your normal tools:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# List files
$ ls -la ~/mnt/project
total 47384832
drwxr-xr-x  12 user  staff      384 Dec  9 10:00 .
drwxr-xr-x   3 user  staff       96 Dec  9 10:00 ..
-rw-r--r--   1 user  staff  5242880 Dec  9 09:30 render_v1.mp4
-rw-r--r--   1 user  staff  8388608 Dec  9 09:45 render_v2.mp4

# Open in default application
$ open ~/mnt/project/render_v2.mp4

# Copy a file locally
$ cp ~/mnt/project/render_v2.mp4 ~/Desktop/

# Stream directly with ffplay
$ ffplay ~/mnt/project/render_v2.mp4`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Step 5: Unmount */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
            5
          </div>
          <h2 className="text-2xl font-bold text-white">Unmount When Done</h2>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Unmount gracefully
$ wormhole unmount ~/mnt/project

# Or force unmount if busy
$ wormhole unmount --force ~/mnt/project

# Unmount all mounts
$ wormhole unmount --all`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* LAN Mode */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Direct LAN Connection</h2>
        <p className="text-zinc-400">
          For maximum speed on the same network, you can skip the signal server and connect directly via IP:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Direct Connection</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Host (note: --no-signal skips signal server)
$ wormhole host ~/Projects --no-signal
Listening on 0.0.0.0:4433
Your IP: 192.168.1.42

# Mount directly via IP
$ wormhole mount 192.168.1.42:4433 ~/mnt/project`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-400">LAN Mode Security</AlertTitle>
          <AlertDescription className="text-zinc-400">
            Direct IP connections are still encrypted via TLS, but don&apos;t benefit from PAKE join code authentication. Use on trusted networks only, or add <code className="bg-zinc-800 px-1 rounded">--password</code>.
          </AlertDescription>
        </Alert>
      </section>

      {/* What's Next */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">What&apos;s Next?</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/docs/cli">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <Terminal className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold text-white mb-1">CLI Reference</h3>
                <p className="text-sm text-zinc-400">Complete command-line documentation</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/performance">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <CheckCircle2 className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold text-white mb-1">Performance Tuning</h3>
                <p className="text-sm text-zinc-400">Optimize for your use case</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/security">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <CheckCircle2 className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold text-white mb-1">Security Guide</h3>
                <p className="text-sm text-zinc-400">Encryption, authentication, and more</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/self-hosting">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <CheckCircle2 className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold text-white mb-1">Self-Hosting</h3>
                <p className="text-sm text-zinc-400">Run your own signal server</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
