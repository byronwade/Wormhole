import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Terminal,
  Download,
  ArrowRight,
  Info,
  AlertTriangle,
  Apple,
  Monitor,
  Cpu,
  Package,
  Github,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

export const metadata = {
  title: "Installation - Wormhole Documentation",
  description: "Download and install Wormhole on macOS, Linux, or from source. Step-by-step installation guide.",
};

export default function InstallationPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
          Getting Started
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Installation
        </h1>
        <p className="text-xl text-zinc-400">
          Download and install Wormhole on your system. Choose between the desktop app, CLI-only installation, or build from source.
        </p>
      </div>

      {/* Installation Options */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Installation Options</h2>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="bg-wormhole-hunter/10 border-wormhole-hunter/30">
            <CardContent className="p-6 text-center">
              <Download className="w-10 h-10 text-wormhole-hunter-light mx-auto mb-4" />
              <h3 className="font-semibold text-white mb-2">Desktop App</h3>
              <p className="text-sm text-zinc-400 mb-4">Full GUI with system tray, visual status, and easy controls.</p>
              <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light">Recommended</Badge>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Terminal className="w-10 h-10 text-zinc-400 mx-auto mb-4" />
              <h3 className="font-semibold text-white mb-2">CLI Only</h3>
              <p className="text-sm text-zinc-400 mb-4">Lightweight command-line tool. Perfect for servers and automation.</p>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">Headless</Badge>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Github className="w-10 h-10 text-zinc-400 mx-auto mb-4" />
              <h3 className="font-semibold text-white mb-2">From Source</h3>
              <p className="text-sm text-zinc-400 mb-4">Build from source for development or custom configurations.</p>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">Advanced</Badge>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Platform Installation */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Platform Installation</h2>

        <Tabs defaultValue="macos" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="macos" className="data-[state=active]:bg-wormhole-hunter">
              <Apple className="w-4 h-4 mr-2" />
              macOS
            </TabsTrigger>
            <TabsTrigger value="linux" className="data-[state=active]:bg-wormhole-hunter">
              <Cpu className="w-4 h-4 mr-2" />
              Linux
            </TabsTrigger>
            <TabsTrigger value="windows" className="data-[state=active]:bg-wormhole-hunter">
              <Monitor className="w-4 h-4 mr-2" />
              Windows
            </TabsTrigger>
          </TabsList>

          <TabsContent value="macos" className="space-y-6 mt-6">
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Info className="h-4 w-4 text-blue-400" />
              <AlertTitle className="text-blue-400">macFUSE Required</AlertTitle>
              <AlertDescription className="text-zinc-400">
                Wormhole uses FUSE for mounting. Install macFUSE before installing Wormhole.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Step 1: Install macFUSE</h3>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Using Homebrew (recommended)
brew install macfuse

# Or download from https://osxfuse.github.io/`}
                    </code>
                  </pre>
                </CardContent>
              </Card>
              <Alert className="bg-amber-500/10 border-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertTitle className="text-amber-400">System Extension Approval</AlertTitle>
                <AlertDescription className="text-zinc-400">
                  macOS will ask you to approve the macFUSE system extension in System Preferences → Security & Privacy. A reboot may be required.
                </AlertDescription>
              </Alert>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Step 2: Install Wormhole</h3>

              <h4 className="font-medium text-white">Option A: Desktop App (DMG)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <ol className="list-decimal list-inside space-y-2 text-zinc-400 text-sm">
                    <li>Download <code className="bg-zinc-800 px-1 rounded">Wormhole.dmg</code> from the <Link href="https://github.com/byronwade/wormhole/releases" className="text-wormhole-hunter-light hover:underline">releases page</Link></li>
                    <li>Open the DMG and drag Wormhole to Applications</li>
                    <li>Launch Wormhole from Applications or Spotlight</li>
                    <li>The CLI will be available at <code className="bg-zinc-800 px-1 rounded">/Applications/Wormhole.app/Contents/MacOS/wormhole</code></li>
                  </ol>
                </CardContent>
              </Card>

              <h4 className="font-medium text-white">Option B: CLI Only (Homebrew)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Install via Homebrew
brew install byronwade/tap/wormhole

# Verify installation
wormhole version`}
                    </code>
                  </pre>
                </CardContent>
              </Card>

              <h4 className="font-medium text-white">Option C: CLI Only (Direct Download)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Download latest release
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-darwin-amd64.tar.gz | tar xz

# For Apple Silicon (M1/M2/M3)
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-darwin-arm64.tar.gz | tar xz

# Move to PATH
sudo mv wormhole /usr/local/bin/
sudo chmod +x /usr/local/bin/wormhole

# Verify
wormhole version`}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="linux" className="space-y-6 mt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Step 1: Install FUSE3</h3>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Ubuntu/Debian
sudo apt update
sudo apt install libfuse3-dev fuse3 pkg-config

# Fedora/RHEL/CentOS
sudo dnf install fuse3 fuse3-devel

# Arch Linux
sudo pacman -S fuse3`}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Step 2: Install Wormhole</h3>

              <h4 className="font-medium text-white">Option A: DEB Package (Ubuntu/Debian)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Download and install
curl -LO https://github.com/byronwade/wormhole/releases/latest/download/wormhole_amd64.deb
sudo dpkg -i wormhole_amd64.deb

# Verify
wormhole version`}
                    </code>
                  </pre>
                </CardContent>
              </Card>

              <h4 className="font-medium text-white">Option B: RPM Package (Fedora/RHEL)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Download and install
curl -LO https://github.com/byronwade/wormhole/releases/latest/download/wormhole.x86_64.rpm
sudo rpm -i wormhole.x86_64.rpm

# Verify
wormhole version`}
                    </code>
                  </pre>
                </CardContent>
              </Card>

              <h4 className="font-medium text-white">Option C: AppImage (Universal)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Download AppImage
curl -LO https://github.com/byronwade/wormhole/releases/latest/download/Wormhole.AppImage
chmod +x Wormhole.AppImage

# Run
./Wormhole.AppImage`}
                    </code>
                  </pre>
                </CardContent>
              </Card>

              <h4 className="font-medium text-white">Option D: Binary (CLI Only)</h4>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Download and install
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-linux-amd64.tar.gz | tar xz
sudo mv wormhole /usr/local/bin/
sudo chmod +x /usr/local/bin/wormhole

# Verify
wormhole version`}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Enable User Mounting</h3>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <pre className="p-4 text-sm overflow-x-auto">
                    <code className="text-zinc-300">
{`# Add user to fuse group (may require logout/login)
sudo usermod -a -G fuse $USER

# Or allow all users to mount
sudo sh -c 'echo "user_allow_other" >> /etc/fuse.conf'`}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="windows" className="space-y-6 mt-6">
            <Alert className="bg-amber-500/10 border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertTitle className="text-amber-400">Coming Soon</AlertTitle>
              <AlertDescription className="text-zinc-400">
                Windows support is in development. It will use WinFSP for mounting. Join our <Link href="https://github.com/byronwade/wormhole/issues" className="text-wormhole-hunter-light hover:underline">GitHub issues</Link> to track progress.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Planned Installation</h3>
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4 text-zinc-400">
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Install WinFSP from <a href="https://winfsp.dev" className="text-wormhole-hunter-light hover:underline">winfsp.dev</a></li>
                    <li>Download <code className="bg-zinc-800 px-1 rounded">Wormhole-Setup.exe</code></li>
                    <li>Run the installer</li>
                    <li>Wormhole will be available in Start Menu and PATH</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Build from Source */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Build from Source</h2>
        <p className="text-zinc-400">
          For development, custom builds, or unsupported platforms.
        </p>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Prerequisites</h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span><strong className="text-white">Rust 1.75+</strong> - Install via <a href="https://rustup.rs" className="text-wormhole-hunter-light hover:underline">rustup.rs</a></span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span><strong className="text-white">FUSE development headers</strong> - libfuse3-dev (Linux) or macFUSE (macOS)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span><strong className="text-white">pkg-config</strong> - For finding FUSE libraries</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span><strong className="text-white">Node.js 18+</strong> - Only for desktop app builds</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold text-white">Build Commands</h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <pre className="p-4 text-sm overflow-x-auto">
                <code className="text-zinc-300">
{`# Clone the repository
git clone https://github.com/byronwade/wormhole.git
cd wormhole

# Build CLI only (release mode)
cargo build --release -p teleport-daemon

# Install CLI
sudo cp target/release/wormhole /usr/local/bin/

# Build signal server
cargo build --release -p teleport-signal
sudo cp target/release/wormhole-signal /usr/local/bin/

# Build desktop app (requires Node.js + pnpm)
cd apps/desktop
pnpm install
pnpm tauri build`}
                </code>
              </pre>
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold text-white">Development Mode</h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <pre className="p-4 text-sm overflow-x-auto">
                <code className="text-zinc-300">
{`# Run CLI in development mode
cargo run -p teleport-daemon -- host ~/test-folder

# Run tests
cargo test

# Run with verbose logging
RUST_LOG=debug cargo run -p teleport-daemon -- host ~/test-folder`}
                </code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Headless/Server Installation */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Headless / Server Installation</h2>
        <p className="text-zinc-400">
          For servers without a GUI, install the CLI-only binary and optionally run the signal server.
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Download CLI binary
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-linux-amd64.tar.gz | tar xz
sudo mv wormhole /usr/local/bin/

# Create systemd service for hosting
sudo tee /etc/systemd/system/wormhole-host.service << 'EOF'
[Unit]
Description=Wormhole File Host
After=network.target

[Service]
Type=simple
User=wormhole
ExecStart=/usr/local/bin/wormhole host /srv/shared --daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable wormhole-host
sudo systemctl start wormhole-host`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Verify Installation */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Verify Installation</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Check version
$ wormhole version
wormhole 0.1.0 (abc1234)
Built: 2024-12-09
Rust: 1.75.0
Platform: darwin-arm64

# Run diagnostics
$ wormhole doctor
✓ FUSE installed and working
✓ Network connectivity
✓ Signal server reachable
✓ Cache directory writable
✓ All systems go!`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Next Steps */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">Next Steps</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark">
            <Link href="/docs/quickstart">
              Quick Start Guide
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <Link href="/docs/requirements">
              System Requirements
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
