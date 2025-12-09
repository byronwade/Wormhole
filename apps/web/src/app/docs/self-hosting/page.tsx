import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Server,
  Terminal,
  Settings,
  Shield,
  ArrowRight,
  Info,
  AlertTriangle,
  CheckCircle2,
  Globe,
} from "lucide-react";

export const metadata = {
  title: "Self-Hosting - Wormhole Documentation",
  description: "Run your own Wormhole signal server. Docker deployment, production setup, and monitoring.",
};

export default function SelfHostingPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">
          Self-Hosting
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Self-Host Your Signal Server
        </h1>
        <p className="text-xl text-zinc-400">
          Run your own signal server for complete control over peer discovery and NAT traversal.
        </p>
      </div>

      {/* Why Self-Host */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Why Self-Host?</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Shield className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">Privacy</h3>
              <p className="text-sm text-zinc-400">No connection metadata leaves your network</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Settings className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">Control</h3>
              <p className="text-sm text-zinc-400">Customize rate limits, expiry, and policies</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Globe className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">Reliability</h3>
              <p className="text-sm text-zinc-400">Not dependent on our infrastructure</p>
            </CardContent>
          </Card>
        </div>

        <Alert className="bg-blue-500/10 border-blue-500/30">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertTitle className="text-blue-400">The Signal Server Doesn&apos;t See Your Files</AlertTitle>
          <AlertDescription className="text-zinc-400">
            Even when using our public signal server, your files are end-to-end encrypted. The signal server only facilitates peer discovery and NAT traversal - it never sees file content or metadata.
          </AlertDescription>
        </Alert>
      </section>

      {/* Quick Start */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Quick Start</h2>

        <h3 className="text-lg font-semibold text-white">Option 1: Binary</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Download signal server binary
curl -L https://github.com/byronwade/wormhole/releases/latest/download/wormhole-signal-linux-amd64.tar.gz | tar xz
sudo mv wormhole-signal /usr/local/bin/

# Run the signal server
wormhole-signal --port 8080

# Or using the main CLI
wormhole signal --port 8080`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white">Option 2: Docker</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Run with Docker
docker run -d \\
  --name wormhole-signal \\
  -p 8080:8080 \\
  -v wormhole-data:/data \\
  wormhole/signal:latest

# With persistence
docker run -d \\
  --name wormhole-signal \\
  -p 8080:8080 \\
  -e DB_PATH=/data/signal.db \\
  -v ./data:/data \\
  wormhole/signal:latest`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white">Option 3: Docker Compose</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">docker-compose.yml</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`version: '3.8'

services:
  signal:
    image: wormhole/signal:latest
    container_name: wormhole-signal
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - WORMHOLE_SIGNAL_PORT=8080
      - WORMHOLE_SIGNAL_DB_PATH=/data/signal.db
      - WORMHOLE_LOG_LEVEL=info
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Configuration */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Signal Server Options</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Default</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--port &lt;PORT&gt;</td>
                    <td className="py-2">WebSocket listening port</td>
                    <td className="py-2">8080</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--bind &lt;ADDR&gt;</td>
                    <td className="py-2">Bind address</td>
                    <td className="py-2">0.0.0.0</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--db &lt;PATH&gt;</td>
                    <td className="py-2">SQLite database for persistence</td>
                    <td className="py-2">in-memory</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--max-connections</td>
                    <td className="py-2">Max concurrent connections</td>
                    <td className="py-2">1000</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--code-expiry &lt;SECS&gt;</td>
                    <td className="py-2">Join code expiration time</td>
                    <td className="py-2">3600 (1 hour)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--rate-limit</td>
                    <td className="py-2">Enable rate limiting</td>
                    <td className="py-2">false</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--rate-limit-rpm</td>
                    <td className="py-2">Requests per minute per IP</td>
                    <td className="py-2">60</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--tls-cert &lt;PATH&gt;</td>
                    <td className="py-2">TLS certificate file (for WSS)</td>
                    <td className="py-2">none</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--tls-key &lt;PATH&gt;</td>
                    <td className="py-2">TLS key file</td>
                    <td className="py-2">none</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--metrics</td>
                    <td className="py-2">Enable Prometheus metrics</td>
                    <td className="py-2">false</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-violet-400">--metrics-port</td>
                    <td className="py-2">Metrics endpoint port</td>
                    <td className="py-2">9090</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Production Setup */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Production Setup</h2>

        <h3 className="text-lg font-semibold text-white">With TLS (Recommended)</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Using Let's Encrypt with Caddy as reverse proxy
# Caddyfile
signal.example.com {
    reverse_proxy localhost:8080
}

# Start Caddy
caddy run --config Caddyfile

# Start signal server (no TLS - Caddy handles it)
wormhole signal --port 8080 --db /var/lib/wormhole/signal.db`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white">Systemd Service</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">/etc/systemd/system/wormhole-signal.service</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`[Unit]
Description=Wormhole Signal Server
After=network.target

[Service]
Type=simple
User=wormhole
Group=wormhole
ExecStart=/usr/local/bin/wormhole-signal \\
    --port 8080 \\
    --db /var/lib/wormhole/signal.db \\
    --rate-limit \\
    --rate-limit-rpm 60 \\
    --max-connections 1000
Restart=always
RestartSec=10
Environment="RUST_LOG=info"

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/wormhole

[Install]
WantedBy=multi-user.target`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Create user and directories
sudo useradd -r -s /bin/false wormhole
sudo mkdir -p /var/lib/wormhole
sudo chown wormhole:wormhole /var/lib/wormhole

# Install and enable
sudo cp wormhole-signal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable wormhole-signal
sudo systemctl start wormhole-signal

# Check status
sudo systemctl status wormhole-signal`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Client Configuration */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Configure Clients</h2>
        <p className="text-zinc-400">
          Point your Wormhole clients to your self-hosted signal server:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Using CLI flags
wormhole host ~/folder --signal-server wss://signal.example.com
wormhole mount CODE ~/mnt --signal wss://signal.example.com

# Or set in config file (~/.config/wormhole/config.toml)
[network]
signal_server = "wss://signal.example.com"

# Or use environment variable
export WORMHOLE_SIGNAL_SERVER=wss://signal.example.com
wormhole host ~/folder`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Health Check & Monitoring */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Health Check & Monitoring</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Health check endpoint
$ curl http://localhost:8080/health
{"status":"healthy","version":"0.1.0","uptime_secs":3600}

# If metrics are enabled
$ curl http://localhost:9090/metrics
# HELP wormhole_signal_active_rooms Current number of active signaling rooms
# TYPE wormhole_signal_active_rooms gauge
wormhole_signal_active_rooms 42

# HELP wormhole_signal_connections_total Total connections since start
# TYPE wormhole_signal_connections_total counter
wormhole_signal_connections_total 1847`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Link href="/docs/self-hosting/monitoring" className="inline-flex items-center text-violet-400 hover:underline">
          Full monitoring guide with Prometheus & Grafana
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>

      {/* Security Considerations */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Security Considerations</h2>

        <div className="space-y-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                Recommended Practices
              </h3>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li>• Always use TLS (WSS) in production</li>
                <li>• Enable rate limiting to prevent abuse</li>
                <li>• Run as non-root user with minimal permissions</li>
                <li>• Use firewall rules to restrict access if internal-only</li>
                <li>• Regularly update to latest version</li>
                <li>• Monitor logs for suspicious activity</li>
              </ul>
            </CardContent>
          </Card>

          <Alert className="bg-amber-500/10 border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-amber-400">Firewall Rules</AlertTitle>
            <AlertDescription className="text-zinc-400">
              The signal server only needs port 8080 (or your chosen port) exposed. The actual file transfer happens directly between peers on port 4433 - the signal server is not involved.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">Learn More</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/docs/self-hosting/docker">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">Docker Deployment</h3>
                <p className="text-sm text-zinc-400">Complete Docker and Kubernetes guides</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/self-hosting/production">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">Production Checklist</h3>
                <p className="text-sm text-zinc-400">Everything you need for a production deployment</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
