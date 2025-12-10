import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { RefreshCw, Play, Pause, AlertTriangle, History, RotateCcw } from "lucide-react";

export const metadata = {
  title: "wormhole sync - Wormhole CLI Reference",
  description: "Bidirectional file synchronization commands.",
};

export default function SyncCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">sync</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
            wormhole sync
          </h1>
          <Badge variant="outline" className="border-wormhole-hunter/50 text-wormhole-hunter-light">
            Phase 7
          </Badge>
        </div>
        <p className="text-xl text-zinc-400">
          Bidirectional file synchronization for writable mounts.
        </p>
      </div>

      {/* Phase Notice */}
      <div className="p-4 bg-wormhole-hunter/10 border border-wormhole-hunter/20 rounded-lg">
        <p className="text-wormhole-hunter-light text-sm">
          <strong>Phase 7 Feature:</strong> Sync commands require a mount created with
          <code className="mx-1 text-wormhole-hunter-light">--allow-write</code> on the host side. This
          enables bidirectional synchronization with conflict detection and resolution.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-green-400">wormhole sync</code>
              <code className="text-zinc-400"> &lt;COMMAND&gt; [SHARE] [OPTIONS]</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-300">
          When a share is configured for write access, Wormhole provides bidirectional
          synchronization. Changes made on either side are automatically propagated to the
          other. The sync command lets you monitor sync status, force synchronization,
          and resolve conflicts when they occur.
        </p>
      </section>

      {/* Subcommands */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Subcommands</h2>

        {/* status */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-wormhole-hunter-light" />
            sync status
          </h3>
          <p className="text-zinc-300">Show synchronization status for shares.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync status [SHARE] [OPTIONS]

OPTIONS:
  --pending       Show pending changes only`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole sync status
Sync Status
──────────────────────────────────────────────────────────────────
Share           Status      Pending     Conflicts   Last Sync
project-files   synced      0           0           2 min ago
team-docs       syncing     12 files    0           in progress
shared-media    paused      47 files    2           1 hour ago
──────────────────────────────────────────────────────────────────

$ wormhole sync status project-files --pending
Share: project-files
Status: synced
No pending changes.

$ wormhole sync status team-docs --pending
Share: team-docs
Status: syncing (42%)

Pending uploads (5):
  → src/components/Button.tsx (modified)
  → src/utils/helpers.ts (modified)
  → docs/README.md (new)
  → assets/logo.png (new)
  → package.json (modified)

Pending downloads (7):
  ← src/api/client.ts (modified by alice)
  ← tests/unit/api.test.ts (new by alice)
  ...`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* now */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Play className="h-5 w-5 text-green-400" />
            sync now
          </h3>
          <p className="text-zinc-300">Force immediate synchronization.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync now [SHARE] [OPTIONS]

OPTIONS:
  --wait          Wait for sync to complete before returning

# Examples
$ wormhole sync now project-files
Synchronization started for project-files

$ wormhole sync now --wait
Synchronizing all shares...
  project-files: 5 files uploaded, 7 files downloaded
  team-docs: 12 files uploaded, 0 files downloaded
Sync complete.`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* pause */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Pause className="h-5 w-5 text-yellow-400" />
            sync pause
          </h3>
          <p className="text-zinc-300">Pause automatic synchronization.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync pause [SHARE]

# Examples
$ wormhole sync pause shared-media
Paused synchronization for shared-media

$ wormhole sync pause
Paused synchronization for all shares`}</code>
              </pre>
            </CardContent>
          </Card>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> Pausing sync does not disconnect the mount. You can
              still read files, but changes won&apos;t be uploaded until you resume.
            </p>
          </div>
        </div>

        {/* resume */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Play className="h-5 w-5 text-green-400" />
            sync resume
          </h3>
          <p className="text-zinc-300">Resume paused synchronization.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync resume [SHARE]

# Examples
$ wormhole sync resume shared-media
Resumed synchronization for shared-media
47 pending changes will be synced.`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* conflicts */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            sync conflicts
          </h3>
          <p className="text-zinc-300">Show files with sync conflicts.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole sync conflicts shared-media
Conflicts in shared-media
──────────────────────────────────────────────────────────────────

1. video/project.mp4
   Local:  Modified 10:30 AM by you (2.4 GB)
   Remote: Modified 10:25 AM by alice (2.1 GB)
   Reason: Both modified since last sync

2. exports/final.mov
   Local:  Modified 9:15 AM by you (847 MB)
   Remote: Deleted by bob at 9:20 AM
   Reason: Local modified, remote deleted

──────────────────────────────────────────────────────────────────
2 conflicts found. Use 'wormhole sync resolve' to resolve.`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* resolve */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-green-400" />
            sync resolve
          </h3>
          <p className="text-zinc-300">Resolve a sync conflict.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync resolve <CONFLICT_ID> <STRATEGY>

STRATEGIES:
  local         Keep local version, overwrite remote
  remote        Keep remote version, overwrite local
  both          Keep both (rename local with .conflict suffix)
  merge         Attempt automatic merge (text files only)

# Examples
$ wormhole sync resolve 1 local
Resolved: video/project.mp4
  → Kept local version (2.4 GB)
  → Remote will be overwritten on next sync

$ wormhole sync resolve 2 both
Resolved: exports/final.mov
  → Kept local as exports/final.mov
  → Remote deletion acknowledged
  → Created exports/final.mov.conflict.local

$ wormhole sync resolve 1 remote
Resolved: video/project.mp4
  → Downloading remote version (2.1 GB)
  → Local changes will be lost`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* reset */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-400" />
            sync reset
          </h3>
          <p className="text-zinc-300">Reset sync state (use with caution).</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync reset [SHARE] [OPTIONS]

OPTIONS:
  --force       Skip confirmation

# Examples
$ wormhole sync reset project-files
WARNING: This will reset sync state. All pending changes will be
re-evaluated on next sync, which may cause conflicts.

Reset sync state for project-files? (y/N) y
Sync state reset for project-files.`}</code>
              </pre>
            </CardContent>
          </Card>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">
              <strong>Warning:</strong> Resetting sync state should only be used when
              sync is stuck or corrupted. It may cause files to be re-uploaded or
              re-downloaded unnecessarily.
            </p>
          </div>
        </div>

        {/* log */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <History className="h-5 w-5 text-wormhole-hunter-light" />
            sync log
          </h3>
          <p className="text-zinc-300">Show sync history.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole sync log [SHARE] [OPTIONS]

OPTIONS:
  --limit <N>     Number of entries (default: 50)

# Example
$ wormhole sync log project-files --limit 10`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole sync log project-files --limit 5
Sync History: project-files
──────────────────────────────────────────────────────────────────
Time              Direction   Files    Size       Status
10:45:32          ↑ upload    3        12.4 MB    completed
10:42:15          ↓ download  7        847 KB     completed
10:30:00          ↑ upload    1        2.4 GB     completed
10:15:22          ↓ download  12       156 MB     completed
09:58:47          ↑ upload    5        28.3 MB    completed
──────────────────────────────────────────────────────────────────
Total: 847 syncs, 48.2 GB transferred`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Conflict Resolution Strategies */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Conflict Resolution</h2>
        <p className="text-zinc-300">
          Conflicts occur when the same file is modified on both sides since the last sync.
          Wormhole detects conflicts automatically and pauses sync for affected files until
          you resolve them.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Strategy</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Use When</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">local</td>
                <td className="py-3 px-4">Keep your version, overwrite remote</td>
                <td className="py-3 px-4">Your changes are more important</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">remote</td>
                <td className="py-3 px-4">Keep remote version, discard local</td>
                <td className="py-3 px-4">Remote changes are more important</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">both</td>
                <td className="py-3 px-4">Keep both with different names</td>
                <td className="py-3 px-4">Need to review both versions</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">merge</td>
                <td className="py-3 px-4">Auto-merge (text files only)</td>
                <td className="py-3 px-4">Code files with non-overlapping changes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Automatic vs Manual Sync */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Sync Modes</h2>
        <p className="text-zinc-300">
          By default, Wormhole syncs automatically when files change. You can configure
          different sync behaviors:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`# Automatic sync (default) - changes sync immediately
wormhole mount WORM-XXXX --allow-write

# Manual sync - only sync when you run 'sync now'
wormhole mount WORM-XXXX --allow-write --sync-mode manual

# Periodic sync - sync every N minutes
wormhole mount WORM-XXXX --allow-write --sync-interval 5`}</code>
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
          <Link href="/docs/cli/mount">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              wormhole mount
            </Badge>
          </Link>
          <Link href="/docs/architecture">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Architecture
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
