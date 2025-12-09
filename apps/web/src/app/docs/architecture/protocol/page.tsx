import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { FileCode, ArrowRight, Package, Lock } from "lucide-react";

export const metadata = {
  title: "Wire Protocol - Wormhole Architecture",
  description: "The binary protocol used for communication between Wormhole peers.",
};

export default function ProtocolArchitecturePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/architecture" className="hover:text-white">Architecture</Link>
          <span>/</span>
          <span className="text-zinc-400">Wire Protocol</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Wire Protocol
        </h1>
        <p className="text-xl text-zinc-400">
          The binary protocol used for peer-to-peer communication in Wormhole.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Overview</h2>
        <p className="text-zinc-300">
          Wormhole uses a binary protocol built on <code className="text-violet-400">serde</code>{" "}
          + <code className="text-violet-400">bincode</code> for efficient serialization. All
          protocol messages are defined in{" "}
          <code className="text-violet-400">crates/teleport-core/src/protocol.rs</code>.
        </p>
        <div className="grid gap-4 md:grid-cols-3 mt-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Package className="h-8 w-8 text-violet-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Compact</h3>
              <p className="text-zinc-400 text-sm mt-1">Binary format, no JSON overhead</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <FileCode className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Type-Safe</h3>
              <p className="text-zinc-400 text-sm mt-1">Rust enums, automatic (de)serialization</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Lock className="h-8 w-8 text-blue-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Versioned</h3>
              <p className="text-zinc-400 text-sm mt-1">Additive changes only, backward compatible</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Message Types */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Message Types</h2>

        <h3 className="text-lg font-semibold text-white mt-6">Request Messages (Client → Host)</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`#[derive(Serialize, Deserialize, Debug)]
pub enum Request {
    // Metadata operations
    GetAttr { inode: u64 },
    Lookup { parent: u64, name: String },
    ReadDir { inode: u64, offset: u64 },

    // Data operations
    ReadChunk {
        inode: u64,
        offset: u64,
        size: u32,
    },

    // Write operations (Phase 7)
    WriteChunk {
        inode: u64,
        offset: u64,
        data: Vec<u8>,
    },
    Create {
        parent: u64,
        name: String,
        mode: u32,
    },
    Mkdir {
        parent: u64,
        name: String,
        mode: u32,
    },
    Remove { parent: u64, name: String },
    Rename {
        old_parent: u64,
        old_name: String,
        new_parent: u64,
        new_name: String,
    },

    // Control messages
    Ping { timestamp: u64 },
    Hello { version: u32, capabilities: Vec<String> },
}`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">Response Messages (Host → Client)</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    // Success responses
    Attr(FileAttr),
    Entry(DirEntry),
    DirEntries(Vec<DirEntry>),
    Data(Vec<u8>),
    Ok,

    // Error responses
    Error(ErrorCode),
    NotFound,
    PermissionDenied,
    IoError(String),

    // Control responses
    Pong { timestamp: u64, server_time: u64 },
    Welcome {
        version: u32,
        share_name: String,
        root_inode: u64,
        capabilities: Vec<String>,
    },
}`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">Notification Messages (Host → Client, Unidirectional)</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`#[derive(Serialize, Deserialize, Debug)]
pub enum Notification {
    // Cache invalidation
    Invalidate { inode: u64 },
    InvalidateAll,

    // File change notifications
    FileModified { inode: u64, new_size: u64, mtime: u64 },
    FileCreated { parent: u64, name: String, inode: u64 },
    FileDeleted { parent: u64, name: String, inode: u64 },
    FileRenamed {
        old_parent: u64,
        old_name: String,
        new_parent: u64,
        new_name: String,
    },

    // Connection status
    Disconnect { reason: String },
    Shutdown,
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Data Types */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Data Types</h2>

        <h3 className="text-lg font-semibold text-white mt-4">FileAttr</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileAttr {
    pub inode: u64,
    pub size: u64,
    pub blocks: u64,
    pub atime: SystemTime,      // Access time
    pub mtime: SystemTime,      // Modification time
    pub ctime: SystemTime,      // Change time (metadata)
    pub crtime: SystemTime,     // Creation time
    pub kind: FileType,
    pub perm: u16,              // Unix permissions
    pub nlink: u32,             // Number of hard links
    pub uid: u32,               // Owner user ID
    pub gid: u32,               // Owner group ID
    pub rdev: u32,              // Device ID (for special files)
    pub blksize: u32,           // Block size
    pub flags: u32,             // Platform-specific flags
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum FileType {
    RegularFile,
    Directory,
    Symlink,
    BlockDevice,
    CharDevice,
    Fifo,
    Socket,
}`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">DirEntry</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DirEntry {
    pub inode: u64,
    pub name: String,
    pub kind: FileType,
    pub attr: FileAttr,         // Full attributes (optional optimization)
}`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">Error Codes</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum ErrorCode {
    NotFound = 2,           // ENOENT
    PermissionDenied = 13,  // EACCES
    FileExists = 17,        // EEXIST
    NotDirectory = 20,      // ENOTDIR
    IsDirectory = 21,       // EISDIR
    InvalidArgument = 22,   // EINVAL
    NoSpace = 28,           // ENOSPC
    ReadOnly = 30,          // EROFS
    NameTooLong = 63,       // ENAMETOOLONG
    NotEmpty = 66,          // ENOTEMPTY
    IoError = 5,            // EIO (catch-all)
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Message Flow */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Message Flow</h2>

        <h3 className="text-lg font-semibold text-white mt-4">Connection Handshake</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center gap-4">
                <span className="text-blue-400 w-20">Client</span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
                <span className="text-violet-400 w-20">Host</span>
                <span className="text-zinc-500">Hello &#123; version: 1, capabilities: [...] &#125;</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-violet-400 w-20">Host</span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
                <span className="text-blue-400 w-20">Client</span>
                <span className="text-zinc-500">Welcome &#123; share_name: &quot;...&quot;, root_inode: 1 &#125;</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">File Read Operation</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center gap-4">
                <span className="text-blue-400 w-20">Client</span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
                <span className="text-violet-400 w-20">Host</span>
                <span className="text-zinc-500">Lookup &#123; parent: 1, name: &quot;file.txt&quot; &#125;</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-violet-400 w-20">Host</span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
                <span className="text-blue-400 w-20">Client</span>
                <span className="text-zinc-500">Entry &#123; inode: 42, attr: ... &#125;</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-blue-400 w-20">Client</span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
                <span className="text-violet-400 w-20">Host</span>
                <span className="text-zinc-500">ReadChunk &#123; inode: 42, offset: 0, size: 131072 &#125;</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-violet-400 w-20">Host</span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
                <span className="text-blue-400 w-20">Client</span>
                <span className="text-zinc-500">Data([128KB of bytes])</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Wire Format */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Wire Format</h2>
        <p className="text-zinc-300">
          Messages are serialized using bincode with a length prefix:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`┌────────────────┬──────────────────────────────────┐
│ Length (4 bytes)│ Payload (bincode serialized)     │
│ big-endian u32  │                                  │
└────────────────┴──────────────────────────────────┘

Example: ReadChunk request
┌────────────────┬────┬──────────┬──────────┬────────┐
│ 0x00 0x00 0x00 │ 03 │ inode    │ offset   │ size   │
│     0x15 (21)  │    │ (8 bytes)│ (8 bytes)│(4 bytes│
└────────────────┴────┴──────────┴──────────┴────────┘
                   │
                   └── Variant tag (ReadChunk = 3)`}</code>
            </pre>
          </CardContent>
        </Card>
        <p className="text-zinc-300 mt-4">
          The length prefix allows the receiver to know exactly how many bytes to read
          before deserializing. This is important for streaming protocols like QUIC.
        </p>
      </section>

      {/* Protocol Versioning */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Protocol Versioning</h2>
        <p className="text-zinc-300">
          The protocol version is exchanged during the handshake. Wormhole follows these rules:
        </p>
        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
          <li><strong>Additive only:</strong> New message types can be added without breaking compatibility</li>
          <li><strong>Optional fields:</strong> New fields use <code className="text-violet-400">Option&lt;T&gt;</code></li>
          <li><strong>Unknown variants:</strong> Receivers ignore unknown enum variants gracefully</li>
          <li><strong>Version negotiation:</strong> Host and client agree on highest common version</li>
        </ul>
        <Card className="bg-zinc-900 border-zinc-800 mt-4">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Version 1 message
pub struct ReadChunk {
    pub inode: u64,
    pub offset: u64,
    pub size: u32,
}

// Version 2 addition (backward compatible)
pub struct ReadChunk {
    pub inode: u64,
    pub offset: u64,
    pub size: u32,
    pub priority: Option<u8>,  // New in v2, None for v1 clients
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Chunking */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Chunk Size</h2>
        <p className="text-zinc-300">
          Wormhole uses a fixed chunk size of 128KB (131,072 bytes) for data transfer:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`// In crates/teleport-core/src/types.rs
pub const CHUNK_SIZE: usize = 128 * 1024;  // 128 KB

// Why 128KB?
// - Large enough to amortize per-request overhead
// - Small enough for fine-grained caching
// - Aligns with common filesystem block sizes
// - Good balance for both LAN and WAN`}</code>
            </pre>
          </CardContent>
        </Card>
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
          <Link href="/docs/security/encryption">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Encryption
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
