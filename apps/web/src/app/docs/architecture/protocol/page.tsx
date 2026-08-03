import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Wire Protocol — Wormhole Docs",
  description: "Binary bincode messages between Wormhole host and client over QUIC.",
};

export default function ProtocolArchitecturePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Architecture", href: "/docs/architecture" }}
        title="Wire protocol"
        description="serde + bincode messages defined in teleport-core. Compact, typed, additive versioning."
      />

      <section>
        <h2>Overview</h2>
        <p>
          All peer messages live in{" "}
          <code>crates/teleport-core/src/protocol.rs</code>. Payloads are binary
          (not JSON) for file data. Changes must stay additive — new fields use{" "}
          <code>Option&lt;T&gt;</code>.
        </p>
      </section>

      <section>
        <h2>Request messages (client → host)</h2>
        <DocsCode>{`#[derive(Serialize, Deserialize, Debug)]
pub enum Request {
    GetAttr { inode: u64 },
    Lookup { parent: u64, name: String },
    ReadDir { inode: u64, offset: u64 },
    ReadChunk { inode: u64, offset: u64, size: u32 },
    // Writes (Phase 7+)
    WriteChunk { inode: u64, offset: u64, data: Vec<u8> },
    Create { parent: u64, name: String, mode: u32 },
    Mkdir { parent: u64, name: String, mode: u32 },
    Remove { parent: u64, name: String },
    Rename { old_parent: u64, old_name: String, new_parent: u64, new_name: String },
    Ping { timestamp: u64 },
    Hello { version: u32, capabilities: Vec<String> },
}`}</DocsCode>
      </section>

      <section>
        <h2>Response messages (host → client)</h2>
        <DocsCode>{`#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Attr(FileAttr),
    Entry(DirEntry),
    DirEntries(Vec<DirEntry>),
    Data(Vec<u8>),
    Ok,
    Error(ErrorCode),
    NotFound,
    PermissionDenied,
    IoError(String),
    Pong { timestamp: u64, server_time: u64 },
    Welcome {
        version: u32,
        share_name: String,
        root_inode: u64,
        capabilities: Vec<String>,
    },
}`}</DocsCode>
      </section>

      <section>
        <h2>Notifications</h2>
        <p>Unidirectional host → client messages for cache invalidation and tree changes.</p>
        <DocsCode>{`pub enum Notification {
    Invalidate { inode: u64 },
    InvalidateAll,
    FileModified { inode: u64, new_size: u64, mtime: u64 },
    FileCreated { parent: u64, name: String, inode: u64 },
    FileDeleted { parent: u64, name: String, inode: u64 },
    FileRenamed { old_parent: u64, old_name: String, new_parent: u64, new_name: String },
    Disconnect { reason: String },
    Shutdown,
}`}</DocsCode>
      </section>

      <section>
        <h2>Core types</h2>
        <DocsTable
          headers={["Type", "Role"]}
          rows={[
            ["FileAttr", "Size, times, kind, mode, uid/gid"],
            ["DirEntry", "inode, name, kind (+ optional attrs)"],
            ["ErrorCode", "Maps to errno-style values (ENOENT, EACCES, …)"],
          ]}
        />
      </section>

      <section>
        <h2>Message flow</h2>
        <ol>
          <li>
            Handshake: client <code>Hello</code> → host <code>Welcome</code>{" "}
            (share name, root inode, capabilities).
          </li>
          <li>
            Lookup: <code>Lookup</code> → <code>Entry</code>.
          </li>
          <li>
            Read: <code>ReadChunk</code> (typically 128&nbsp;KB) → <code>Data</code>.
          </li>
        </ol>
      </section>

      <section>
        <h2>Wire format</h2>
        <p>
          Each frame is a big-endian <code>u32</code> length followed by a bincode
          payload. Chunk size constant: <code>128 * 1024</code> bytes.
        </p>
        <DocsNote title="Versioning">
          Negotiate the highest common version. Unknown variants should be ignored
          gracefully; never remove or renumber existing fields.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/quic">QUIC transport</Link>
          </li>
          <li>
            <Link href="/docs/api/messages">API messages</Link>
          </li>
          <li>
            <Link href="/docs/security/encryption">Encryption</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
