import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { HardDrive, Cpu, ArrowRight, Layers } from "lucide-react";

export const metadata = {
  title: "FUSE Integration - Wormhole Architecture",
  description: "How Wormhole uses FUSE to mount remote filesystems locally.",
};

export default function FuseArchitecturePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/architecture" className="hover:text-white">Architecture</Link>
          <span>/</span>
          <span className="text-zinc-400">FUSE</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          FUSE Integration
        </h1>
        <p className="text-xl text-zinc-400">
          How Wormhole uses Filesystem in Userspace (FUSE) to present remote files as local directories.
        </p>
      </div>

      {/* What is FUSE */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What is FUSE?</h2>
        <p className="text-zinc-300">
          FUSE (Filesystem in Userspace) is a kernel interface that lets non-privileged users
          create their own filesystems without modifying kernel code. When an application
          accesses files on a FUSE mount, the kernel forwards these requests to a userspace
          program (Wormhole) which handles them and returns results.
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center items-center gap-4 text-sm">
                <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded">
                  Application<br/><span className="text-zinc-500 text-xs">(e.g., finder, ls)</span>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-600" />
                <div className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded">
                  Kernel VFS
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-600" />
                <div className="px-4 py-2 bg-green-500/20 border border-green-500/30 rounded">
                  FUSE Module
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-600" />
                <div className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded">
                  Wormhole Daemon
                </div>
              </div>
              <p className="text-zinc-500 text-xs">Request flow from application to Wormhole</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Why FUSE */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why FUSE?</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-400 mb-2">Advantages</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Works with any application (no integration needed)</li>
                <li>- Native file operations (drag-drop, save-as)</li>
                <li>- Standard POSIX semantics</li>
                <li>- No kernel modifications required</li>
                <li>- Cross-platform (macOS, Linux, Windows via WinFSP)</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-yellow-400 mb-2">Challenges</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Context switches between kernel and userspace</li>
                <li>- FUSE callbacks are synchronous</li>
                <li>- Network latency affects file operations</li>
                <li>- Requires FUSE driver installation</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Wormhole FUSE Implementation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Wormhole&apos;s FUSE Implementation</h2>
        <p className="text-zinc-300">
          Wormhole uses the <code className="text-violet-400">fuser</code> crate (Rust bindings for
          libfuse) to implement FUSE operations. The implementation is in{" "}
          <code className="text-violet-400">crates/teleport-daemon/src/fuse.rs</code>.
        </p>

        <h3 className="text-lg font-semibold text-white mt-6">Key Operations</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">FUSE Op</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Wormhole Behavior</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">lookup</td>
                <td className="py-3 px-4">Resolve path to inode</td>
                <td className="py-3 px-4">Query inode map, fetch from host if not cached</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">getattr</td>
                <td className="py-3 px-4">Get file attributes</td>
                <td className="py-3 px-4">Return cached attrs with configured TTL</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">readdir</td>
                <td className="py-3 px-4">List directory contents</td>
                <td className="py-3 px-4">Return cached entries, fetch if expired</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">open</td>
                <td className="py-3 px-4">Open file for read/write</td>
                <td className="py-3 px-4">Create file handle, track open files</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">read</td>
                <td className="py-3 px-4">Read bytes from file</td>
                <td className="py-3 px-4">Return from cache or fetch chunks via QUIC</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">write</td>
                <td className="py-3 px-4">Write bytes to file</td>
                <td className="py-3 px-4">Buffer writes, sync to host (Phase 7)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">release</td>
                <td className="py-3 px-4">Close file handle</td>
                <td className="py-3 px-4">Flush pending writes, cleanup handle</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Async/Sync Bridging */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Async/Sync Bridging</h2>
        <p className="text-zinc-300">
          A key challenge: FUSE callbacks are synchronous, but network operations are async.
          Wormhole uses the ClientActor pattern to bridge this gap:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// In FUSE callback (synchronous context)
fn read(&mut self, req: &Request, ino: u64, fh: u64, offset: i64, size: u32) {
    // Create oneshot channel for response
    let (tx, rx) = tokio::sync::oneshot::channel();

    // Send request to async actor (non-blocking)
    self.actor_tx.blocking_send(ClientRequest::Read {
        inode: ino,
        offset: offset as u64,
        size,
        reply: tx,
    }).expect("actor dead");

    // Block waiting for response
    match rx.blocking_recv() {
        Ok(Ok(data)) => reply.data(&data),
        Ok(Err(e)) => reply.error(libc::EIO),
        Err(_) => reply.error(libc::EIO),
    }
}

// In async ClientActor (async context)
async fn handle_read(&mut self, inode: u64, offset: u64, size: u32) -> Result<Vec<u8>> {
    // Check cache first
    if let Some(data) = self.cache.get(inode, offset, size).await {
        return Ok(data);
    }

    // Fetch from remote host via QUIC
    let chunk = self.connection.fetch_chunk(inode, offset, size).await?;
    self.cache.insert(inode, offset, chunk.clone()).await;
    Ok(chunk)
}`}</code>
            </pre>
          </CardContent>
        </Card>
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-yellow-400 text-sm">
            <strong>Critical Rule:</strong> Never call <code>.await</code> in FUSE callbacks.
            Always use <code>blocking_send</code> / <code>blocking_recv</code> to communicate
            with async code.
          </p>
        </div>
      </section>

      {/* Inode Management */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Inode Management</h2>
        <p className="text-zinc-300">
          FUSE identifies files by inode numbers, not paths. Wormhole maintains a bidirectional
          mapping between paths and inodes:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`pub struct InodeMap {
    // Path -> Inode lookup
    path_to_inode: HashMap<PathBuf, u64>,

    // Inode -> Metadata lookup
    inode_to_entry: HashMap<u64, InodeEntry>,

    // Next available inode number
    next_inode: AtomicU64,
}

pub struct InodeEntry {
    pub path: PathBuf,
    pub attrs: FileAttr,
    pub parent: u64,
    pub children: Option<Vec<u64>>,  // For directories
    pub lookup_count: AtomicU64,     // Reference counting
}

// Inode 1 is always the root directory
const ROOT_INODE: u64 = 1;`}</code>
            </pre>
          </CardContent>
        </Card>
        <p className="text-zinc-300 mt-4">
          The inode map is protected by <code className="text-violet-400">RwLock</code> since
          reads are much more frequent than writes. Inode numbers are assigned incrementally
          and never reused during a session.
        </p>
      </section>

      {/* Attribute Caching */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Attribute Caching</h2>
        <p className="text-zinc-300">
          FUSE calls <code className="text-violet-400">getattr</code> extremely frequently
          (often before every operation). Wormhole caches attributes with a configurable TTL:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`# Default: 1 second attribute cache
wormhole mount WORM-XXXX --attr-timeout 1

# For static content, increase TTL
wormhole mount WORM-XXXX --attr-timeout 60

# For frequently changing files, disable caching
wormhole mount WORM-XXXX --attr-timeout 0`}</code>
            </pre>
          </CardContent>
        </Card>
        <p className="text-zinc-300 mt-4">
          The TTL is returned to the kernel with each <code>getattr</code> response. The kernel
          won&apos;t call <code>getattr</code> again for that inode until the TTL expires.
        </p>
      </section>

      {/* Platform Differences */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Platform Differences</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="h-5 w-5 text-violet-400" />
                <h3 className="font-semibold text-white">macOS</h3>
              </div>
              <ul className="space-y-1 text-zinc-300 text-sm">
                <li>- Uses macFUSE (osxfuse)</li>
                <li>- Requires system extension approval</li>
                <li>- Supports volname for Finder</li>
                <li>- .DS_Store handling needed</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="h-5 w-5 text-green-400" />
                <h3 className="font-semibold text-white">Linux</h3>
              </div>
              <ul className="space-y-1 text-zinc-300 text-sm">
                <li>- Native FUSE in kernel</li>
                <li>- libfuse3 in userspace</li>
                <li>- Best performance</li>
                <li>- /dev/fuse device file</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-white">Windows</h3>
              </div>
              <ul className="space-y-1 text-zinc-300 text-sm">
                <li>- Uses WinFSP</li>
                <li>- Driver installation required</li>
                <li>- Different API surface</li>
                <li>- Coming soon in Wormhole</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Performance Considerations */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Performance Considerations</h2>
        <div className="space-y-4">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h3 className="font-semibold text-white mb-2">Minimize Round Trips</h3>
            <p className="text-zinc-300 text-sm">
              Every FUSE operation that requires network I/O adds latency. Wormhole
              prefetches directory contents and uses read-ahead to minimize round trips.
            </p>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h3 className="font-semibold text-white mb-2">Batch Requests</h3>
            <p className="text-zinc-300 text-sm">
              When listing a directory, Wormhole fetches all child metadata in one request
              rather than making individual requests per file.
            </p>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h3 className="font-semibold text-white mb-2">Cache Aggressively</h3>
            <p className="text-zinc-300 text-sm">
              The two-tier cache (L1 RAM + L2 disk) ensures repeated reads hit cache.
              Directory listings are cached with their modification times.
            </p>
          </div>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/architecture/quic">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              QUIC Protocol
            </Badge>
          </Link>
          <Link href="/docs/architecture/caching">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Caching System
            </Badge>
          </Link>
          <Link href="/docs/troubleshooting/fuse">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              FUSE Troubleshooting
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
