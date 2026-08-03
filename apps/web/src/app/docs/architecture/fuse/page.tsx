import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "FUSE — Wormhole Docs",
  description: "How Wormhole mounts remote folders via FUSE / WinFSP.",
};

export default function FuseArchitecturePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Architecture", href: "/docs/architecture" }}
        title="FUSE filesystem"
        description="The OS sees a local drive. The kernel forwards ops to the Wormhole daemon, which fetches metadata and chunks over QUIC."
      />

      <section>
        <h2>Request path</h2>
        <p>
          Application → kernel VFS → FUSE module → Wormhole daemon. Any app that
          speaks POSIX files works without plugins.
        </p>
      </section>

      <section>
        <h2>Why FUSE</h2>
        <ul>
          <li>Native open/save/drag-drop in existing tools</li>
          <li>No kernel patches</li>
          <li>Cross-platform: Linux FUSE3, macFUSE, Windows WinFSP</li>
        </ul>
        <p>
          Tradeoffs: kernel↔userspace context switches, sync FUSE callbacks vs
          async networking, and a required FUSE/WinFSP install.
        </p>
      </section>

      <section>
        <h2>Operations</h2>
        <DocsTable
          headers={["Op", "Behavior"]}
          rows={[
            ["lookup", "Resolve name → inode; fetch if uncached"],
            ["getattr", "Return attrs with TTL (called constantly)"],
            ["readdir", "List entries; batch metadata when possible"],
            ["open", "Create handle; track open files"],
            ["read", "Serve from cache or fetch 128 KB chunks"],
            ["write", "Buffered sync to host (Phase 7+)"],
            ["release", "Flush pending work; drop handle"],
          ]}
        />
        <p>
          Implementation: <code>fuser</code> in{" "}
          <code>crates/teleport-daemon/src/fuse.rs</code>.
        </p>
      </section>

      <section>
        <h2>Async/sync bridge</h2>
        <p>
          FUSE methods are synchronous. Networking runs on Tokio. Bridge with a
          oneshot channel — never <code>.await</code> inside a FUSE callback.
        </p>
        <DocsCode>{`fn read(&mut self, /* ... */) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    self.actor_tx.blocking_send(ClientRequest::Read {
        inode: ino,
        offset: offset as u64,
        size,
        reply: tx,
    }).ok();
    match rx.blocking_recv() {
        Ok(Ok(data)) => reply.data(&data),
        _ => reply.error(libc::EIO),
    }
}`}</DocsCode>
        <DocsNote tone="warn" title="Critical">
          Use <code>blocking_send</code> / <code>blocking_recv</code> only. Creating
          a new Tokio runtime inside FUSE is wrong.
        </DocsNote>
      </section>

      <section>
        <h2>Inodes and attr TTL</h2>
        <p>
          Files are keyed by inode, not path. An <code>InodeMap</code> (under{" "}
          <code>RwLock</code>) maps path ↔ inode. Root is inode&nbsp;1. Numbers are
          assigned for the session and not reused.
        </p>
        <DocsCode>{`# Attr cache TTL (seconds) returned to the kernel
wormhole mount WORM-XXXX --attr-timeout 1   # default
wormhole mount WORM-XXXX --attr-timeout 60  # static trees
wormhole mount WORM-XXXX --attr-timeout 0   # always refresh`}</DocsCode>
      </section>

      <section>
        <h2>Platforms</h2>
        <DocsTable
          headers={["OS", "Driver", "Notes"]}
          rows={[
            ["macOS", "macFUSE", "System extension approval; volname for Finder"],
            ["Linux", "FUSE 3", "libfuse3; typically best performance"],
            ["Windows", "WinFSP", "Driver install; API differs from POSIX FUSE"],
          ]}
        />
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/caching">Caching</Link>
          </li>
          <li>
            <Link href="/docs/architecture/quic">QUIC</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/fuse">FUSE troubleshooting</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
