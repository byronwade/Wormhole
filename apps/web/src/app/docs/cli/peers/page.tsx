import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Users, UserPlus, UserMinus, Shield, Eye, Ban, CheckCircle } from "lucide-react";

export const metadata = {
  title: "wormhole peers - Wormhole CLI Reference",
  description: "Manage known peers and trust relationships.",
};

export default function PeersCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">peers</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole peers
        </h1>
        <p className="text-xl text-zinc-400">
          Manage known peers, trust relationships, and access control.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-green-400">wormhole peers</code>
              <code className="text-zinc-400"> &lt;COMMAND&gt; [OPTIONS]</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-300">
          Wormhole maintains a database of peers you&apos;ve connected with. The peers command
          lets you manage this database, including adding trusted peers, blocking unwanted
          connections, and setting trust levels.
        </p>
        <p className="text-zinc-300">
          Trusted peers can connect without requiring a new join code each time, enabling
          persistent sharing relationships.
        </p>
      </section>

      {/* Subcommands */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Subcommands</h2>

        {/* list */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-wormhole-hunter-light" />
            peers list
          </h3>
          <p className="text-zinc-300">List all known peers.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole peers list [OPTIONS]

OPTIONS:
  --all         Include blocked peers
  --online      Show only currently online peers`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole peers list
Known Peers
──────────────────────────────────────────────────────────────────
Name           Peer ID              Trust      Last Seen       Status
alice          abc123...def4        full       2 hours ago     online
bob            xyz789...uvw0        standard   1 day ago       offline
carol          mno456...pqr7        limited    3 days ago      offline
──────────────────────────────────────────────────────────────────
Total: 3 peers (1 online)

$ wormhole peers list --all
Known Peers (including blocked)
──────────────────────────────────────────────────────────────────
Name           Peer ID              Trust      Last Seen       Status
alice          abc123...def4        full       2 hours ago     online
bob            xyz789...uvw0        standard   1 day ago       offline
carol          mno456...pqr7        limited    3 days ago      offline
spammer        bad000...bad0        BLOCKED    1 week ago      -
──────────────────────────────────────────────────────────────────`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* add */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-green-400" />
            peers add
          </h3>
          <p className="text-zinc-300">Add a new trusted peer manually.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole peers add <PEER_ID> [OPTIONS]

OPTIONS:
  --name <NAME>     Friendly name for this peer

# Examples
$ wormhole peers add abc123def456 --name "Alice's MacBook"
Added peer "Alice's MacBook" (abc123def456)

# Add from a peer string (shared by the other person)
$ wormhole peers add "wormhole://peer/abc123def456?name=Alice"
Added peer "Alice" (abc123def456)`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* remove */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <UserMinus className="h-5 w-5 text-red-400" />
            peers remove
          </h3>
          <p className="text-zinc-300">Remove a peer from your known peers list.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole peers remove <PEER> [OPTIONS]

OPTIONS:
  --force       Skip confirmation

# Examples
$ wormhole peers remove alice
Remove peer "alice"? (y/N) y
Removed peer "alice"

$ wormhole peers remove abc123def456 --force
Removed peer "abc123def456"`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* show */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-wormhole-hunter-light" />
            peers show
          </h3>
          <p className="text-zinc-300">Show detailed information about a peer.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole peers show alice
Peer: alice
──────────────────────────────────────────────────────────────────
Peer ID:        abc123def456789012345678901234567890
Name:           Alice's MacBook
Trust Level:    full
Status:         online
Last Seen:      2 hours ago
First Seen:     2024-01-01 09:30:00

Connection History:
  Total connections:     47
  Last connection:       192.168.1.42:4433
  Average latency:       2.1ms

Transfer Statistics:
  Data sent:             12.4 GB
  Data received:         8.7 GB
  Files transferred:     1,247

Certificate:
  Fingerprint:    SHA256:ab12cd34ef56...
  Valid until:    2025-01-01
  Issuer:         self-signed`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* block */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-400" />
            peers block
          </h3>
          <p className="text-zinc-300">Block a peer from connecting.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole peers block <PEER>

# Examples
$ wormhole peers block spammer
Blocked peer "spammer". They can no longer connect to your shares.

$ wormhole peers block xyz789uvw0
Blocked peer "xyz789uvw0"`}</code>
              </pre>
            </CardContent>
          </Card>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> Blocked peers are disconnected immediately and cannot
              reconnect, even with a valid join code.
            </p>
          </div>
        </div>

        {/* unblock */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" />
            peers unblock
          </h3>
          <p className="text-zinc-300">Unblock a previously blocked peer.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`$ wormhole peers unblock spammer
Unblocked peer "spammer". They can connect again with a valid code.`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* trust */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-wormhole-hunter-light" />
            peers trust
          </h3>
          <p className="text-zinc-300">Set trust level for a peer.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole peers trust <PEER> [OPTIONS]

OPTIONS:
  --level <LEVEL>     Trust level: limited, standard, full

# Examples
$ wormhole peers trust alice --level full
Set trust level for "alice" to full

$ wormhole peers trust bob --level limited
Set trust level for "bob" to limited`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* rename */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-wormhole-hunter-light" />
            peers rename
          </h3>
          <p className="text-zinc-300">Rename a peer for easier identification.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole peers rename <PEER> <NAME>

# Examples
$ wormhole peers rename abc123def456 "Alice's Work Laptop"
Renamed peer to "Alice's Work Laptop"`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Trust Levels */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Trust Levels</h2>
        <p className="text-zinc-300">
          Trust levels control what peers can do when connecting to your shares:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Level</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Read</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Write</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Auto-Connect</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-yellow-400">limited</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4 text-red-400">No</td>
                <td className="py-3 px-4 text-red-400">No</td>
                <td className="py-3 px-4">Read-only access, requires code each time</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-blue-400">standard</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4 text-yellow-400">If allowed</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4">Default level, can reconnect without code</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">full</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4">Full access to all shares, auto-connect</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-400 text-sm">
            <strong>Tip:</strong> New peers start with &quot;limited&quot; trust. Use <code>peers trust</code>
            to upgrade trusted colleagues to &quot;standard&quot; or &quot;full&quot; access.
          </p>
        </div>
      </section>

      {/* Sharing Your Peer ID */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Sharing Your Peer ID</h2>
        <p className="text-zinc-300">
          To let others add you as a trusted peer, share your peer string:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`$ wormhole peers whoami
Your Peer ID: abc123def456789012345678901234567890
Your Name: Byron's MacBook Pro

Share this with others:
  wormhole://peer/abc123def456?name=Byron

Or as QR code:
  wormhole peers whoami --qr`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* JSON Output */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">JSON Output</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`$ wormhole peers list --format json
{
  "peers": [
    {
      "id": "abc123def456789012345678901234567890",
      "name": "Alice's MacBook",
      "trust_level": "full",
      "status": "online",
      "last_seen": "2024-01-15T09:30:00Z",
      "first_seen": "2024-01-01T09:30:00Z",
      "stats": {
        "connections": 47,
        "bytes_sent": 13313931264,
        "bytes_received": 9341632512
      }
    }
  ],
  "total": 3,
  "online": 1
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/host">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              wormhole host
            </Badge>
          </Link>
          <Link href="/docs/security">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Security
            </Badge>
          </Link>
          <Link href="/docs/security/access-control">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Access Control
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
