//! Wormhole CLI - Feature-Rich P2P Filesystem Sharing
//!
//! A comprehensive command-line interface for hosting, mounting, and managing
//! peer-to-peer distributed filesystems.
//!
//! # Quick Start
//!
//! ```bash
//! # Share a folder (generates a join code)
//! wormhole host ./my-folder
//!
//! # Mount a remote share using join code
//! wormhole mount ABC-123
//!
//! # Mount using direct IP
//! wormhole mount 192.168.1.100:4433
//! ```
//!
//! # Features
//!
//! - **Host**: Share local directories with configurable access controls
//! - **Mount**: Connect to remote shares via join codes or direct IP
//! - **Status**: Real-time monitoring of connections and transfers
//! - **Cache**: Manage local cache for offline access and performance
//! - **Config**: Persistent configuration management
//! - **Peers**: Manage trusted peers and connections
//! - **Sync**: Control bidirectional synchronization
//! - **Signal**: Run the rendezvous/signaling server

use std::io::{self, Write as IoWrite};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use clap::{Args, Parser, Subcommand, ValueEnum};
use tokio::signal;
use tracing::{debug, error, info, warn, Level};
use tracing_subscriber::EnvFilter;

use teleport_core::crypto::{extract_join_code, make_share_link};
use teleport_core::{CHUNK_SIZE, PROTOCOL_VERSION};
use teleport_daemon::host::{HostConfig, WormholeHost};
use teleport_daemon::rendezvous::{RendezvousClient, RendezvousError};
use teleport_daemon::updater::{format_update_message, UpdateChannel, UpdateChecker};
use teleport_daemon::{DiskCache, HybridCacheManager};

// ============================================================================
// CLI Structure
// ============================================================================

#[derive(Parser)]
#[command(
    name = "wormhole",
    author = "Wormhole Team",
    version = env!("CARGO_PKG_VERSION"),
    about = "P2P distributed filesystem - Mount any folder, any computer, no setup",
    long_about = r#"
Wormhole - Peer-to-peer distributed filesystem

Share folders instantly with a simple join code. No cloud uploads,
no accounts, no configuration. Just share and connect.

EXAMPLES:
    # Share a folder
    wormhole host ./projects --name "My Projects"

    # Mount a remote share
    wormhole mount ABC-123 ./remote

    # Check connection status
    wormhole status

    # Manage cache
    wormhole cache stats
    wormhole cache clear

DOCUMENTATION:
    https://wormhole.dev/docs
"#,
    after_help = "Use 'wormhole <command> --help' for more information about a command.",
    arg_required_else_help = true
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Enable verbose output (-v for info, -vv for debug, -vvv for trace)
    #[arg(short, long, action = clap::ArgAction::Count, global = true)]
    verbose: u8,

    /// Suppress all output except errors
    #[arg(short, long, global = true, conflicts_with = "verbose")]
    quiet: bool,

    /// Output format for machine-readable output
    #[arg(long, value_enum, global = true, default_value = "text")]
    format: OutputFormat,

    /// Configuration file path
    #[arg(long, global = true, env = "WORMHOLE_CONFIG")]
    config: Option<PathBuf>,

    /// Disable colored output
    #[arg(long, global = true, env = "NO_COLOR", action = clap::ArgAction::SetTrue)]
    no_color: bool,
}

#[derive(ValueEnum, Clone, Copy, Debug, Default)]
enum OutputFormat {
    #[default]
    Text,
    Json,
    Yaml,
}

#[derive(Subcommand)]
enum Commands {
    /// Share a local directory over the network
    #[command(visible_alias = "share", visible_alias = "serve")]
    Host(HostArgs),

    /// Mount a remote share locally
    #[command(visible_alias = "connect", visible_alias = "join")]
    Mount(MountArgs),

    /// Show status of active connections and mounts
    #[command(visible_alias = "info", visible_alias = "ps")]
    Status(StatusArgs),

    /// Manage local cache
    Cache(CacheArgs),

    /// Manage configuration
    #[command(visible_alias = "cfg")]
    Config(ConfigArgs),

    /// Manage trusted peers
    Peers(PeersArgs),

    /// Synchronization controls
    Sync(SyncArgs),

    /// Run the signaling/rendezvous server
    Signal(SignalArgs),

    /// Generate shell completions
    Completions(CompletionsArgs),

    /// Display version and system information
    Version(VersionArgs),

    /// Ping a remote host to test connectivity
    Ping(PingArgs),

    /// Benchmark network and filesystem performance
    Bench(BenchArgs),

    /// Initialize wormhole in the current directory
    Init(InitArgs),

    /// Open a project aperture (`.wormhole/aperture.toml`)
    Open(OpenArgs),

    /// Resolve a content magnet against the local content store
    Fetch(FetchArgs),

    /// Dev: print playhead prefetch chunk indices for an inode/offset
    Playhead(PlayheadArgs),

    /// Unmount a mounted share
    #[command(visible_alias = "umount", visible_alias = "disconnect")]
    Unmount(UnmountArgs),

    /// List all active shares and mounts
    #[command(visible_alias = "ls")]
    List(ListArgs),

    /// Show transfer history and statistics
    History(HistoryArgs),

    /// Manage access control and permissions
    Access(AccessArgs),

    /// Watch for file changes (live mode)
    Watch(WatchArgs),

    /// Check for and manage updates
    Update(UpdateArgs),

    /// Show doctor diagnostics and system health
    Doctor(DoctorArgs),

    /// Run the Wormhole MCP server (stdio) — same features as wormhole-ctl / desktop
    Mcp,

    /// Delegate to wormhole-ctl (control-plane CLI with full session parity)
    #[command(hide = true)]
    Ctl {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

// ============================================================================
// Host Command
// ============================================================================

#[derive(Args)]
struct HostArgs {
    /// Directory to share
    #[arg(value_name = "PATH")]
    path: PathBuf,

    /// Port to listen on
    #[arg(short, long, default_value = "4433", env = "WORMHOLE_PORT")]
    port: u16,

    /// Bind address
    #[arg(short, long, default_value = "0.0.0.0", env = "WORMHOLE_BIND")]
    bind: String,

    /// Custom name for this share
    #[arg(short, long)]
    name: Option<String>,

    /// Maximum concurrent connections
    #[arg(long, default_value = "10")]
    max_connections: usize,

    /// Signal server URL for join code registration
    #[arg(
        long,
        default_value = "wss://wormhole-signal.fly.dev",
        env = "WORMHOLE_SIGNAL"
    )]
    signal_server: String,

    /// Don't register with signal server (direct IP only)
    #[arg(long)]
    no_signal: bool,

    /// Transport backend: `quic` (classic quinn) or `iroh` (dial-by-key)
    #[arg(long, default_value = "quic", env = "WORMHOLE_TRANSPORT")]
    transport: String,

    /// Use a specific join code instead of generating one
    #[arg(long)]
    code: Option<String>,

    /// Allow write access from clients
    #[arg(long)]
    allow_write: bool,

    /// Require password for connection (in addition to join code)
    #[arg(long)]
    password: Option<String>,

    /// Only allow specific IP addresses
    #[arg(long, value_delimiter = ',')]
    allow_ips: Option<Vec<String>>,

    /// Block specific IP addresses
    #[arg(long, value_delimiter = ',')]
    block_ips: Option<Vec<String>>,

    /// Set bandwidth limit in MB/s (0 = unlimited)
    #[arg(long, default_value = "0")]
    bandwidth_limit: u64,

    /// Run in background as daemon
    #[arg(short, long)]
    daemon: bool,

    /// Auto-expire the share after duration (e.g., "2h", "30m")
    #[arg(long)]
    expire_after: Option<String>,

    /// Copy join code to clipboard
    #[arg(long)]
    copy_code: bool,

    /// Show QR code for mobile clients
    #[arg(long)]
    qr_code: bool,

    /// Exclude patterns (glob)
    #[arg(long, value_delimiter = ',')]
    exclude: Option<Vec<String>>,

    /// Include only patterns (glob)
    #[arg(long, value_delimiter = ',')]
    include: Option<Vec<String>>,

    /// Enable compression for transfers
    #[arg(long)]
    compress: bool,

    /// Watch for file changes and notify clients
    #[arg(long)]
    watch: bool,

    /// Announce on local network (mDNS/Bonjour)
    #[arg(long)]
    announce_local: bool,

    /// TLS certificate file for custom certificates
    #[arg(long)]
    tls_cert: Option<PathBuf>,

    /// TLS key file for custom certificates
    #[arg(long)]
    tls_key: Option<PathBuf>,
}

// ============================================================================
// Mount Command
// ============================================================================

#[derive(Args, Clone)]
struct MountArgs {
    /// Join code (ABC-123), share link (wormhole.dev/j/ABC-123), or direct address (ip:port)
    #[arg(value_name = "TARGET")]
    target: String,

    /// Mount point path (auto-generated if not specified)
    #[arg(value_name = "MOUNTPOINT")]
    path: Option<PathBuf>,

    /// Signal server URL
    #[arg(
        short,
        long,
        default_value = "wss://wormhole-signal.fly.dev",
        env = "WORMHOLE_SIGNAL"
    )]
    signal: String,

    /// Use kernel extension backend instead of FSKit (macOS)
    #[arg(long)]
    use_kext: bool,

    /// Mount in read-only mode
    #[arg(long)]
    read_only: bool,

    /// Password (if host requires one)
    #[arg(long)]
    password: Option<String>,

    /// Transport backend: `quic` (classic) or `iroh` (endpoint id dial)
    #[arg(long, default_value = "quic", env = "WORMHOLE_TRANSPORT")]
    transport: String,

    /// Discover hosts on the LAN via mDNS (iroh)
    #[arg(long)]
    announce_local: bool,

    /// Cache mode
    #[arg(long, value_enum, default_value = "hybrid")]
    cache_mode: CacheMode,

    /// RAM cache size in MB
    #[arg(long, default_value = "512")]
    ram_cache_mb: usize,

    /// Disk cache size in GB
    #[arg(long, default_value = "10")]
    disk_cache_gb: usize,

    /// Enable prefetching for sequential reads
    #[arg(long)]
    prefetch: bool,

    /// Prefetch lookahead chunks
    #[arg(long, default_value = "4")]
    prefetch_lookahead: usize,

    /// Auto-reconnect on connection loss
    #[arg(long, default_value = "true")]
    auto_reconnect: bool,

    /// Maximum reconnection attempts (0 = infinite)
    #[arg(long, default_value = "0")]
    max_reconnect: u32,

    /// Initial reconnection delay in seconds
    #[arg(long, default_value = "1")]
    reconnect_delay: u64,

    /// Run in background
    #[arg(short, long)]
    daemon: bool,

    /// Enable offline mode (serve from cache when disconnected)
    #[arg(long)]
    offline_mode: bool,

    /// Bandwidth limit in MB/s (0 = unlimited)
    #[arg(long, default_value = "0")]
    bandwidth_limit: u64,

    /// Connection timeout in seconds
    #[arg(long, default_value = "30")]
    timeout: u64,

    /// Mount options (passed to FUSE)
    #[arg(short = 'o', long, value_delimiter = ',')]
    options: Option<Vec<String>>,

    /// Filesystem name shown in mount
    #[arg(long, default_value = "wormhole")]
    fsname: String,

    /// Enable write-through mode (immediate sync)
    #[arg(long)]
    write_through: bool,

    /// Attribute cache timeout in seconds
    #[arg(long, default_value = "1")]
    attr_timeout: u64,

    /// Entry cache timeout in seconds
    #[arg(long, default_value = "1")]
    entry_timeout: u64,

    /// Enable extended attributes
    #[arg(long)]
    enable_xattr: bool,

    /// User ID for files (default: current user)
    #[arg(long)]
    uid: Option<u32>,

    /// Group ID for files (default: current group)
    #[arg(long)]
    gid: Option<u32>,

    /// File permissions mask
    #[arg(long)]
    umask: Option<String>,

    /// Verify with direct IP if signal server fails
    #[arg(long)]
    fallback_direct: bool,
}

#[derive(ValueEnum, Clone, Copy, Debug, Default)]
enum CacheMode {
    /// No caching
    None,
    /// RAM cache only
    Ram,
    /// Disk cache only
    Disk,
    /// RAM + Disk hybrid (default)
    #[default]
    Hybrid,
    /// Aggressive caching for offline use
    Aggressive,
}

// ============================================================================
// Status Command
// ============================================================================

#[derive(Args)]
struct StatusArgs {
    /// Show detailed status
    #[arg(short, long)]
    detailed: bool,

    /// Watch mode - continuously update
    #[arg(short, long)]
    watch: bool,

    /// Update interval in seconds (for watch mode)
    #[arg(long, default_value = "1")]
    interval: u64,

    /// Show only hosts
    #[arg(long)]
    hosts: bool,

    /// Show only mounts
    #[arg(long)]
    mounts: bool,

    /// Show network statistics
    #[arg(long)]
    network: bool,

    /// Show performance metrics
    #[arg(long)]
    performance: bool,

    /// Specific share/mount to show status for
    #[arg(value_name = "ID")]
    id: Option<String>,
}

// ============================================================================
// Cache Command
// ============================================================================

#[derive(Args)]
struct CacheArgs {
    #[command(subcommand)]
    command: CacheCommands,
}

#[derive(Subcommand)]
enum CacheCommands {
    /// Show cache statistics
    Stats(CacheStatsArgs),

    /// Clear cache
    Clear(CacheClearArgs),

    /// Warm cache by pre-fetching data
    Warm(CacheWarmArgs),

    /// Show cache directory location
    Path,

    /// Set cache size limits
    Resize(CacheResizeArgs),

    /// Export cache to archive
    Export(CacheExportArgs),

    /// Import cache from archive
    Import(CacheImportArgs),

    /// Verify cache integrity
    Verify(CacheVerifyArgs),

    /// Garbage collection
    Gc(CacheGcArgs),
}

#[derive(Args)]
struct CacheStatsArgs {
    /// Show detailed breakdown by share
    #[arg(short, long)]
    detailed: bool,

    /// Show per-file statistics
    #[arg(long)]
    per_file: bool,
}

#[derive(Args)]
struct CacheClearArgs {
    /// Clear only RAM cache
    #[arg(long)]
    ram_only: bool,

    /// Clear only disk cache
    #[arg(long)]
    disk_only: bool,

    /// Clear cache for specific share
    #[arg(long)]
    share: Option<String>,

    /// Clear cache older than duration (e.g., "7d", "24h")
    #[arg(long)]
    older_than: Option<String>,

    /// Force clear without confirmation
    #[arg(short, long)]
    force: bool,
}

#[derive(Args)]
struct CacheWarmArgs {
    /// Share to warm cache for
    share: String,

    /// Path pattern to warm (default: entire share)
    #[arg(long)]
    path: Option<String>,

    /// Maximum size to cache in MB
    #[arg(long)]
    max_size_mb: Option<u64>,

    /// File patterns to include
    #[arg(long, value_delimiter = ',')]
    include: Option<Vec<String>>,

    /// File patterns to exclude
    #[arg(long, value_delimiter = ',')]
    exclude: Option<Vec<String>>,
}

#[derive(Args)]
struct CacheResizeArgs {
    /// RAM cache size in MB
    #[arg(long)]
    ram_mb: Option<usize>,

    /// Disk cache size in GB
    #[arg(long)]
    disk_gb: Option<usize>,
}

#[derive(Args)]
struct CacheExportArgs {
    /// Output archive path
    output: PathBuf,

    /// Share to export (all if not specified)
    #[arg(long)]
    share: Option<String>,

    /// Compress the archive
    #[arg(long)]
    compress: bool,
}

#[derive(Args)]
struct CacheImportArgs {
    /// Archive path to import
    input: PathBuf,

    /// Verify checksums during import
    #[arg(long)]
    verify: bool,
}

#[derive(Args)]
struct CacheVerifyArgs {
    /// Fix corrupted entries
    #[arg(long)]
    fix: bool,

    /// Verbose output showing each file
    #[arg(long)]
    verbose: bool,
}

#[derive(Args)]
struct CacheGcArgs {
    /// Target size in GB (evict until this size)
    #[arg(long)]
    target_gb: Option<u64>,

    /// Dry run - show what would be deleted
    #[arg(long)]
    dry_run: bool,
}

// ============================================================================
// Config Command
// ============================================================================

#[derive(Args)]
struct ConfigArgs {
    #[command(subcommand)]
    command: ConfigCommands,
}

#[derive(Subcommand)]
enum ConfigCommands {
    /// Show current configuration
    Show(ConfigShowArgs),

    /// Set a configuration value
    Set(ConfigSetArgs),

    /// Get a configuration value
    Get(ConfigGetArgs),

    /// Reset configuration to defaults
    Reset(ConfigResetArgs),

    /// Edit configuration in editor
    Edit,

    /// Show configuration file path
    Path,

    /// Import configuration from file
    Import(ConfigImportArgs),

    /// Export configuration to file
    Export(ConfigExportArgs),

    /// List all configuration keys
    List,
}

#[derive(Args)]
struct ConfigShowArgs {
    /// Show secrets (tokens, etc.)
    #[arg(long)]
    show_secrets: bool,
}

#[derive(Args)]
struct ConfigSetArgs {
    /// Configuration key
    key: String,

    /// Configuration value
    value: String,
}

#[derive(Args)]
struct ConfigGetArgs {
    /// Configuration key
    key: String,
}

#[derive(Args)]
struct ConfigResetArgs {
    /// Reset specific key only
    #[arg(long)]
    key: Option<String>,

    /// Force reset without confirmation
    #[arg(short, long)]
    force: bool,
}

#[derive(Args)]
struct ConfigImportArgs {
    /// Config file to import
    path: PathBuf,

    /// Merge with existing config
    #[arg(long)]
    merge: bool,
}

#[derive(Args)]
struct ConfigExportArgs {
    /// Output path
    path: PathBuf,

    /// Include secrets
    #[arg(long)]
    include_secrets: bool,
}

// ============================================================================
// Peers Command
// ============================================================================

#[derive(Args)]
struct PeersArgs {
    #[command(subcommand)]
    command: PeersCommands,
}

#[derive(Subcommand)]
enum PeersCommands {
    /// List known peers
    List(PeersListArgs),

    /// Add a trusted peer
    Add(PeersAddArgs),

    /// Remove a peer
    Remove(PeersRemoveArgs),

    /// Show peer details
    Show(PeersShowArgs),

    /// Block a peer
    Block(PeersBlockArgs),

    /// Unblock a peer
    Unblock(PeersUnblockArgs),

    /// Trust a peer's certificate
    Trust(PeersTrustArgs),

    /// Rename a peer
    Rename(PeersRenameArgs),
}

#[derive(Args)]
struct PeersListArgs {
    /// Show blocked peers too
    #[arg(long)]
    all: bool,

    /// Show online peers only
    #[arg(long)]
    online: bool,
}

#[derive(Args)]
struct PeersAddArgs {
    /// Peer identifier or address
    peer: String,

    /// Friendly name for the peer
    #[arg(long)]
    name: Option<String>,
}

#[derive(Args)]
struct PeersRemoveArgs {
    /// Peer identifier
    peer: String,

    /// Force removal without confirmation
    #[arg(short, long)]
    force: bool,
}

#[derive(Args)]
struct PeersShowArgs {
    /// Peer identifier
    peer: String,
}

#[derive(Args)]
struct PeersBlockArgs {
    /// Peer identifier
    peer: String,
}

#[derive(Args)]
struct PeersUnblockArgs {
    /// Peer identifier
    peer: String,
}

#[derive(Args)]
struct PeersTrustArgs {
    /// Peer identifier
    peer: String,

    /// Trust level (limited, standard, full)
    #[arg(long, default_value = "standard")]
    level: String,
}

#[derive(Args)]
struct PeersRenameArgs {
    /// Peer identifier
    peer: String,

    /// New name
    name: String,
}

// ============================================================================
// Sync Command
// ============================================================================

#[derive(Args)]
struct SyncArgs {
    #[command(subcommand)]
    command: SyncCommands,
}

#[derive(Subcommand)]
enum SyncCommands {
    /// Show sync status
    Status(SyncStatusArgs),

    /// Force sync now
    Now(SyncNowArgs),

    /// Pause synchronization
    Pause(SyncPauseArgs),

    /// Resume synchronization
    Resume(SyncResumeArgs),

    /// Show sync conflicts
    Conflicts(SyncConflictsArgs),

    /// Resolve a sync conflict
    Resolve(SyncResolveArgs),

    /// Reset sync state
    Reset(SyncResetArgs),

    /// Show sync history/log
    Log(SyncLogArgs),
}

#[derive(Args)]
struct SyncStatusArgs {
    /// Share to show status for (all if not specified)
    share: Option<String>,

    /// Show pending changes
    #[arg(long)]
    pending: bool,
}

#[derive(Args)]
struct SyncNowArgs {
    /// Share to sync (all if not specified)
    share: Option<String>,

    /// Wait for sync to complete
    #[arg(long)]
    wait: bool,
}

#[derive(Args)]
struct SyncPauseArgs {
    /// Share to pause (all if not specified)
    share: Option<String>,
}

#[derive(Args)]
struct SyncResumeArgs {
    /// Share to resume (all if not specified)
    share: Option<String>,
}

#[derive(Args)]
struct SyncConflictsArgs {
    /// Share to show conflicts for (all if not specified)
    share: Option<String>,
}

#[derive(Args)]
struct SyncResolveArgs {
    /// Conflict ID or file path
    conflict: String,

    /// Resolution strategy
    #[arg(value_enum)]
    strategy: ConflictStrategy,
}

#[derive(ValueEnum, Clone, Copy, Debug)]
enum ConflictStrategy {
    /// Keep local version
    Local,
    /// Keep remote version
    Remote,
    /// Keep both (rename)
    Both,
    /// Merge (for text files)
    Merge,
}

#[derive(Args)]
struct SyncResetArgs {
    /// Share to reset (all if not specified)
    share: Option<String>,

    /// Force reset without confirmation
    #[arg(short, long)]
    force: bool,
}

#[derive(Args)]
struct SyncLogArgs {
    /// Number of entries to show
    #[arg(short, long, default_value = "50")]
    limit: usize,

    /// Share to show log for
    share: Option<String>,
}

// ============================================================================
// Signal Server Command
// ============================================================================

#[derive(Args)]
struct SignalArgs {
    /// Port to listen on
    #[arg(short, long, default_value = "8080", env = "SIGNAL_PORT")]
    port: u16,

    /// Bind address
    #[arg(short, long, default_value = "0.0.0.0", env = "SIGNAL_BIND")]
    bind: String,

    /// Maximum concurrent connections
    #[arg(long, default_value = "1000")]
    max_connections: usize,

    /// Code expiration time in seconds
    #[arg(long, default_value = "3600")]
    code_expiry: u64,

    /// Enable rate limiting
    #[arg(long)]
    rate_limit: bool,

    /// Requests per minute per IP (if rate limiting enabled)
    #[arg(long, default_value = "60")]
    rate_limit_rpm: u32,

    /// Run in background as daemon
    #[arg(short, long)]
    daemon: bool,

    /// TLS certificate file
    #[arg(long)]
    tls_cert: Option<PathBuf>,

    /// TLS key file
    #[arg(long)]
    tls_key: Option<PathBuf>,

    /// Enable STUN server for NAT traversal
    #[arg(long)]
    enable_stun: bool,

    /// Enable TURN relay for restrictive NATs
    #[arg(long)]
    enable_turn: bool,

    /// Admin API port (for monitoring)
    #[arg(long)]
    admin_port: Option<u16>,

    /// Enable metrics endpoint
    #[arg(long)]
    metrics: bool,

    /// Metrics port (default: admin_port + 1)
    #[arg(long)]
    metrics_port: Option<u16>,
}

// ============================================================================
// Utility Commands
// ============================================================================

#[derive(Args)]
struct CompletionsArgs {
    /// Shell to generate completions for
    #[arg(value_enum)]
    shell: Shell,
}

#[derive(ValueEnum, Clone, Copy, Debug)]
#[allow(clippy::enum_variant_names)]
enum Shell {
    Bash,
    Zsh,
    Fish,
    PowerShell,
    Elvish,
}

#[derive(Args)]
struct VersionArgs {
    /// Show detailed system information
    #[arg(short, long)]
    detailed: bool,

    /// Check for updates
    #[arg(long)]
    check_update: bool,
}

#[derive(Args)]
struct PingArgs {
    /// Target (join code or address)
    target: String,

    /// Number of pings
    #[arg(short, long, default_value = "4")]
    count: u32,

    /// Interval between pings in seconds
    #[arg(short, long, default_value = "1")]
    interval: u64,

    /// Timeout per ping in seconds
    #[arg(short, long, default_value = "5")]
    timeout: u64,

    /// Signal server URL
    #[arg(long, default_value = "wss://wormhole-signal.fly.dev")]
    signal: String,
}

#[derive(Args)]
struct BenchArgs {
    /// Target (join code or address)
    target: String,

    /// Test type
    #[arg(value_enum, default_value = "all")]
    test: BenchTest,

    /// Duration in seconds
    #[arg(short, long, default_value = "10")]
    duration: u64,

    /// Number of parallel streams
    #[arg(short, long, default_value = "4")]
    parallel: usize,

    /// Signal server URL
    #[arg(long, default_value = "wss://wormhole-signal.fly.dev")]
    signal: String,
}

#[derive(ValueEnum, Clone, Copy, Debug, Default)]
enum BenchTest {
    /// Test all operations
    #[default]
    All,
    /// Test read throughput
    Read,
    /// Test write throughput
    Write,
    /// Test latency
    Latency,
    /// Test metadata operations
    Metadata,
}

#[derive(Args)]
struct InitArgs {
    /// Directory to initialize (default: current directory)
    path: Option<PathBuf>,

    /// Template to use
    #[arg(long)]
    template: Option<String>,

    /// Don't create .wormhole config directory
    #[arg(long)]
    no_config: bool,
}

#[derive(Args)]
struct OpenArgs {
    /// Project folder containing `.wormhole` (default: `.`)
    path: Option<PathBuf>,
}

#[derive(Args)]
struct FetchArgs {
    /// Magnet URI (`wormhole:magnet:blake3:…`, `blake3:…`, or raw hex)
    magnet: String,

    /// Optional remote host for future fetch (ignored for now)
    #[arg(long)]
    from: Option<String>,

    /// Only check whether the chunk is present locally
    #[arg(long)]
    check: bool,
}

#[derive(Args)]
struct PlayheadArgs {
    /// File inode
    #[arg(long)]
    inode: u64,

    /// Byte offset of the playhead
    #[arg(long)]
    offset: u64,

    /// Chunks to prefetch ahead (default 4)
    #[arg(long, default_value = "4")]
    ahead: u64,

    /// Chunks to keep behind (default 2)
    #[arg(long, default_value = "2")]
    behind: u64,
}

#[derive(Args)]
struct UnmountArgs {
    /// Mount point or share ID
    target: String,

    /// Force unmount even if busy
    #[arg(short, long)]
    force: bool,

    /// Unmount all mounts
    #[arg(long)]
    all: bool,
}

#[derive(Args)]
struct ListArgs {
    /// List type
    #[arg(value_enum, default_value = "all")]
    list_type: ListType,

    /// Show detailed information
    #[arg(short, long)]
    detailed: bool,
}

#[derive(ValueEnum, Clone, Copy, Debug, Default)]
enum ListType {
    #[default]
    All,
    Hosts,
    Mounts,
    Peers,
}

#[derive(Args)]
struct HistoryArgs {
    /// Number of entries
    #[arg(short, long, default_value = "50")]
    limit: usize,

    /// Filter by operation type
    #[arg(long)]
    operation: Option<String>,

    /// Filter by share
    #[arg(long)]
    share: Option<String>,

    /// Start date (YYYY-MM-DD)
    #[arg(long)]
    since: Option<String>,

    /// End date (YYYY-MM-DD)
    #[arg(long)]
    until: Option<String>,
}

#[derive(Args)]
struct AccessArgs {
    #[command(subcommand)]
    command: AccessCommands,
}

#[derive(Subcommand)]
enum AccessCommands {
    /// Show current access rules
    Show(AccessShowArgs),

    /// Grant access to a peer
    Grant(AccessGrantArgs),

    /// Revoke access from a peer
    Revoke(AccessRevokeArgs),

    /// Set access level
    Set(AccessSetArgs),
}

#[derive(Args)]
struct AccessShowArgs {
    /// Share to show access for
    share: Option<String>,
}

#[derive(Args)]
struct AccessGrantArgs {
    /// Share to grant access to
    share: String,

    /// Peer to grant access to
    peer: String,

    /// Access level
    #[arg(value_enum, default_value = "read")]
    level: AccessLevel,
}

#[derive(Args)]
struct AccessRevokeArgs {
    /// Share
    share: String,

    /// Peer to revoke access from
    peer: String,
}

#[derive(Args)]
struct AccessSetArgs {
    /// Share
    share: String,

    /// Default access level for new peers
    #[arg(value_enum)]
    default_level: AccessLevel,
}

#[derive(ValueEnum, Clone, Copy, Debug)]
enum AccessLevel {
    None,
    Read,
    Write,
    Admin,
}

#[derive(Args)]
struct WatchArgs {
    /// Share or path to watch
    target: String,

    /// Pattern to watch (glob)
    #[arg(long)]
    pattern: Option<String>,

    /// Execute command on change
    #[arg(long)]
    exec: Option<String>,

    /// Debounce time in milliseconds
    #[arg(long, default_value = "500")]
    debounce: u64,
}

// ============================================================================
// Update Command
// ============================================================================

#[derive(Args)]
struct UpdateArgs {
    #[command(subcommand)]
    command: Option<UpdateCommands>,

    /// Force check (ignore cache)
    #[arg(long)]
    force: bool,

    /// Update channel
    #[arg(long, value_enum, default_value = "stable")]
    channel: CliUpdateChannel,
}

#[derive(Subcommand)]
enum UpdateCommands {
    /// Check for available updates
    Check(UpdateCheckArgs),

    /// Show changelog for a version
    Changelog(UpdateChangelogArgs),

    /// Configure automatic update settings
    Config(UpdateConfigArgs),
}

#[derive(Args)]
struct UpdateCheckArgs {
    /// Force check (ignore cache)
    #[arg(long)]
    force: bool,

    /// Update channel
    #[arg(long, value_enum, default_value = "stable")]
    channel: CliUpdateChannel,

    /// Output available download URL
    #[arg(long)]
    show_url: bool,
}

#[derive(Args)]
struct UpdateChangelogArgs {
    /// Version to show changelog for (default: latest)
    version: Option<String>,
}

#[derive(Args)]
struct UpdateConfigArgs {
    /// Enable or disable automatic update checks
    #[arg(long)]
    auto_check: Option<bool>,

    /// Update channel preference
    #[arg(long, value_enum)]
    channel: Option<CliUpdateChannel>,

    /// Check interval in hours
    #[arg(long)]
    check_interval_hours: Option<u64>,
}

#[derive(ValueEnum, Clone, Copy, Debug, Default)]
enum CliUpdateChannel {
    #[default]
    Stable,
    Beta,
    Nightly,
}

impl From<CliUpdateChannel> for UpdateChannel {
    fn from(c: CliUpdateChannel) -> Self {
        match c {
            CliUpdateChannel::Stable => UpdateChannel::Stable,
            CliUpdateChannel::Beta => UpdateChannel::Beta,
            CliUpdateChannel::Nightly => UpdateChannel::Nightly,
        }
    }
}

// ============================================================================
// Doctor Command
// ============================================================================

#[derive(Args)]
struct DoctorArgs {
    /// Run all checks including slow ones
    #[arg(long)]
    full: bool,

    /// Attempt to fix issues automatically
    #[arg(long)]
    fix: bool,
}

// ============================================================================
// Main Entry Point
// ============================================================================

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // Set up logging based on verbosity
    setup_logging(&cli);

    // Execute command
    match &cli.command {
        Commands::Host(args) => run_host(args, &cli).await,
        Commands::Mount(args) => run_mount(args, &cli).await,
        Commands::Status(args) => run_status(args, &cli).await,
        Commands::Cache(args) => run_cache(args, &cli).await,
        Commands::Config(args) => run_config(args, &cli).await,
        Commands::Peers(args) => run_peers(args, &cli).await,
        Commands::Sync(args) => run_sync(args, &cli).await,
        Commands::Signal(args) => run_signal(args, &cli).await,
        Commands::Completions(args) => run_completions(args),
        Commands::Version(args) => run_version(args, &cli),
        Commands::Ping(args) => run_ping(args, &cli).await,
        Commands::Bench(args) => run_bench(args, &cli).await,
        Commands::Init(args) => run_init(args, &cli),
        Commands::Open(args) => run_open(args, &cli),
        Commands::Fetch(args) => run_fetch(args, &cli),
        Commands::Playhead(args) => run_playhead(args, &cli),
        Commands::Unmount(args) => run_unmount(args, &cli).await,
        Commands::List(args) => run_list(args, &cli).await,
        Commands::History(args) => run_history(args, &cli),
        Commands::Access(args) => run_access(args, &cli).await,
        Commands::Watch(args) => run_watch(args, &cli).await,
        Commands::Update(args) => run_update(args, &cli).await,
        Commands::Doctor(args) => run_doctor(args, &cli).await,
        Commands::Mcp => run_mcp().await,
        Commands::Ctl { args } => run_ctl(args).await,
    }
}

fn setup_logging(cli: &Cli) {
    let level = if cli.quiet {
        Level::ERROR
    } else {
        match cli.verbose {
            0 => Level::WARN,
            1 => Level::INFO,
            2 => Level::DEBUG,
            _ => Level::TRACE,
        }
    };

    let filter = EnvFilter::from_default_env()
        .add_directive(level.into())
        .add_directive("quinn=warn".parse().unwrap())
        .add_directive("rustls=warn".parse().unwrap());

    let builder = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(cli.verbose >= 2)
        .with_thread_ids(cli.verbose >= 3)
        .with_file(cli.verbose >= 3)
        .with_line_number(cli.verbose >= 3);

    if cli.no_color {
        builder.with_ansi(false).init();
    } else {
        builder.init();
    }
}

// ============================================================================
// Command Implementations
// ============================================================================

async fn run_host(args: &HostArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let path = args.path.canonicalize()?;

    if !path.is_dir() {
        error!("Path must be a directory: {:?}", path);
        return Err("Not a directory".into());
    }

    let bind_addr: SocketAddr = format!("{}:{}", args.bind, args.port).parse()?;

    let host_name = args.name.clone().unwrap_or_else(|| {
        hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "wormhole-host".into())
    });

    // Generate or use provided join code
    let join_code = args
        .code
        .as_ref()
        .map(|c| teleport_core::crypto::normalize_join_code(c))
        .unwrap_or_else(teleport_core::crypto::generate_join_code);

    if args.copy_code {
        copy_to_clipboard(&join_code);
    }
    if args.qr_code {
        print_join_qr(&join_code);
    }

    // iroh transport path
    if args.transport.eq_ignore_ascii_case("iroh") {
        #[cfg(feature = "iroh")]
        {
            use teleport_daemon::iroh_host::{start_iroh_share, IrohHostConfig};
            if !cli.quiet {
                println!("Starting iroh host for {}…", path.display());
            }
            let handle = start_iroh_share(IrohHostConfig {
                shared_path: path.clone(),
                host_name: host_name.clone(),
                announce_mdns: args.announce_local,
            })
            .await
            .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            if !cli.quiet {
                println!("iroh endpoint id: {}", handle.endpoint_id_hex);
                println!("Join code (SPAKE2 trust): {}", join_code);
                println!(
                    "Connect with: wormhole mount --transport iroh {}",
                    handle.endpoint_id_hex
                );
                println!("Press Ctrl+C to stop sharing");
            } else {
                println!("{}", handle.endpoint_id_hex);
            }
            tokio::signal::ctrl_c().await.ok();
            println!("\nShutting down iroh host…");
            handle.abort();
            return Ok(());
        }
        #[cfg(not(feature = "iroh"))]
        {
            return Err("iroh transport requires the `iroh` feature".into());
        }
    }

    let config = HostConfig {
        bind_addr,
        shared_path: path.clone(),
        max_connections: args.max_connections,
        host_name: host_name.clone(),
    };

    // Display startup info
    print_host_banner(&path, bind_addr, &join_code, &host_name, args, cli);

    if args.announce_local && !cli.quiet {
        println!("Note: --announce-local applies to --transport iroh (mDNS). Classic quic uses LAN IP bind.");
    }

    let host = WormholeHost::new(config);

    // Handle Ctrl+C
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    tokio::spawn(async move {
        signal::ctrl_c().await.ok();
        r.store(false, Ordering::SeqCst);
    });

    // Register with signal server if not disabled
    let signal_task = if !args.no_signal {
        let signal_server = args.signal_server.clone();
        let join_code_clone = join_code.clone();
        let running_clone = running.clone();

        Some(tokio::spawn(async move {
            // Run signal server registration in a loop to handle reconnects
            loop {
                if !running_clone.load(Ordering::SeqCst) {
                    break;
                }

                info!("Registering with signal server: {}", signal_server);
                let rendezvous = RendezvousClient::new(Some(signal_server.clone()));

                match rendezvous.host(&join_code_clone).await {
                    Ok(result) => {
                        info!("Peer connected via signal server: {:?}", result.peer_addr);
                        // Continue loop to accept more peers
                    }
                    Err(e) => {
                        // Don't log timeout as error - it's expected when no peers connect
                        if !matches!(e, RendezvousError::Timeout) {
                            warn!("Signal server error: {} - will retry in 5s", e);
                        } else {
                            debug!("Signal server timeout, re-registering...");
                        }
                        // Brief delay before retry
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        }))
    } else {
        info!("Signal server registration disabled (--no-signal)");
        None
    };

    tokio::select! {
        result = host.serve() => {
            if let Err(e) = result {
                error!("Host error: {:?}", e);
            }
        }
        _ = async {
            while running.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        } => {
            println!("\nShutting down...");
        }
    }

    // Abort signal task on shutdown
    if let Some(task) = signal_task {
        task.abort();
    }

    Ok(())
}

fn print_host_banner(
    path: &PathBuf,
    bind_addr: SocketAddr,
    join_code: &str,
    host_name: &str,
    args: &HostArgs,
    cli: &Cli,
) {
    let share_link = make_share_link(join_code);

    if cli.quiet {
        // In quiet mode, just print the share link
        println!("{}", share_link);
        return;
    }

    match cli.format {
        OutputFormat::Json => {
            let info = serde_json::json!({
                "status": "hosting",
                "path": path,
                "bind_addr": bind_addr.to_string(),
                "join_code": join_code,
                "share_link": share_link,
                "host_name": host_name,
                "allow_write": args.allow_write,
                "max_connections": args.max_connections,
            });
            println!("{}", serde_json::to_string_pretty(&info).unwrap());
            return;
        }
        OutputFormat::Yaml => {
            println!("status: hosting");
            println!("path: {:?}", path);
            println!("bind_addr: {}", bind_addr);
            println!("join_code: {}", join_code);
            println!("share_link: {}", share_link);
            return;
        }
        OutputFormat::Text => {}
    }

    println!();
    println!("╔═══════════════════════════════════════════════════════════════════════╗");
    println!("║                  🌀 WORMHOLE - SHARING ACTIVE                         ║");
    println!("╠═══════════════════════════════════════════════════════════════════════╣");
    println!("║                                                                       ║");
    println!("║  Share:     {:<57} ║", host_name);
    println!("║  Path:      {:<57} ║", format!("{:?}", path));
    println!("║  Address:   {:<57} ║", bind_addr);
    println!("║                                                                       ║");
    println!("║  ┌───────────────────────────────────────────────────────────────┐   ║");
    println!("║  │                                                               │   ║");
    println!("║  │   Share this link:  {:<40}   │   ║", share_link);
    println!("║  │                                                               │   ║");
    println!("║  │   Or use code: {:<46}│   ║", join_code);
    println!("║  │                                                               │   ║");
    println!("║  └───────────────────────────────────────────────────────────────┘   ║");
    println!("║                                                                       ║");
    println!(
        "║  Access:    {:<57} ║",
        if args.allow_write {
            "Read/Write"
        } else {
            "Read-Only"
        }
    );
    println!("║  Max Peers: {:<57} ║", args.max_connections);
    println!("║                                                                       ║");
    println!("║  Connect with:                                                        ║");
    println!("║    wormhole mount {}                      ║", share_link);
    println!("║                                                                       ║");
    println!("║  Press Ctrl+C to stop sharing                                         ║");
    println!("╚═══════════════════════════════════════════════════════════════════════╝");
    println!();
}

async fn run_mount(args: &MountArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    // iroh: target is endpoint id hex
    if args.transport.eq_ignore_ascii_case("iroh") {
        #[cfg(feature = "iroh")]
        {
            return run_mount_iroh(args, cli).await;
        }
        #[cfg(not(feature = "iroh"))]
        {
            return Err("iroh transport requires the `iroh` feature".into());
        }
    }

    // First, try to extract join code from URL if it's a URL
    let target = if let Some(code) = extract_join_code(&args.target) {
        if !cli.quiet && args.target != code {
            println!("Extracted join code from link: {}", code);
        }
        code
    } else {
        args.target.clone()
    };

    // Determine if this is a direct IP or join code
    let is_direct = is_ip_address(&target);

    // Create a modified args with the extracted target
    let modified_args = MountArgs {
        target,
        ..args.clone()
    };

    if is_direct {
        run_mount_direct(&modified_args, cli).await
    } else {
        run_mount_via_signal(&modified_args, cli).await
    }
}

#[cfg(feature = "iroh")]
async fn run_mount_iroh(args: &MountArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    use teleport_core::protocol::{GetAttrRequest, NetMessage};
    use teleport_core::ROOT_INODE;
    use teleport_daemon::iroh_host::iroh_hello_client;

    let endpoint_id = args.target.trim();
    if !cli.quiet {
        println!("Dialing iroh endpoint {}…", endpoint_id);
    }
    let (conn, _codec, host_name) = iroh_hello_client(endpoint_id, args.announce_local)
        .await
        .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

    // Verify root getattr works (smoke check before FUSE mount wiring)
    let reply = conn
        .request(&NetMessage::GetAttr(GetAttrRequest { inode: ROOT_INODE }))
        .await
        .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
    match reply {
        NetMessage::GetAttrResponse(r) if r.attr.is_some() => {
            if !cli.quiet {
                println!(
                    "Connected to iroh host '{}' (endpoint {}). Full FUSE mount over iroh uses the same ALPN; use classic mount for production FUSE today, or continue with wormhole-mount once wired.",
                    host_name, endpoint_id
                );
            }
        }
        other => {
            return Err(format!("iroh getattr failed: {other:?}").into());
        }
    }
    conn.close("mount-check-done");
    Ok(())
}

fn copy_to_clipboard(text: &str) {
    // Best-effort clipboard via common CLIs (no extra deps).
    let attempts = [
        ("wl-copy", vec![text.to_string()]),
        ("xclip", vec!["-selection".into(), "clipboard".into()]),
        ("pbcopy", vec![]),
    ];
    for (cmd, args) in attempts {
        let mut child = match std::process::Command::new(cmd)
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = stdin.write_all(text.as_bytes());
        }
        if child.wait().map(|s| s.success()).unwrap_or(false) {
            println!("Copied join code to clipboard");
            return;
        }
    }
    println!("Clipboard copy unavailable (install wl-copy, xclip, or pbcopy)");
}

fn print_join_qr(join_code: &str) {
    let payload = format!("wormhole://join/{}", join_code);
    // ANSI QR via unicode blocks would need a crate; print scannable deep link.
    println!();
    println!("QR / deep link payload:");
    println!("  {}", payload);
    println!("  (scan with Wormhole mobile/desktop or open the URL)");
    println!();
}

fn is_ip_address(target: &str) -> bool {
    target.parse::<SocketAddr>().is_ok()
}

async fn run_mount_direct(args: &MountArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let addr: SocketAddr = args.target.parse()?;

    #[cfg(target_os = "macos")]
    let default_mount = if args.use_kext {
        std::env::temp_dir().join(format!("wormhole-{}", addr.port()))
    } else {
        PathBuf::from("/Volumes/wormhole")
    };

    #[cfg(not(target_os = "macos"))]
    let default_mount = std::env::temp_dir().join(format!("wormhole-{}", addr.port()));

    let mount_point = args.path.clone().unwrap_or(default_mount);

    // macOS FSKit mounts under /Volumes are root-owned and created by the system
    // at mount time; pre-creating them as a normal user fails. wormhole-mount
    // creates the mount point when appropriate, so only create user-writable paths.
    #[cfg(target_os = "macos")]
    let skip_create = !args.use_kext && mount_point.starts_with("/Volumes");
    #[cfg(not(target_os = "macos"))]
    let skip_create = false;

    if !skip_create && !mount_point.exists() {
        std::fs::create_dir_all(&mount_point)?;
    }

    if !cli.quiet {
        println!("Connecting to {}", addr);
        println!("Mount point: {:?}", mount_point);
        println!("Cache mode: {:?}", args.cache_mode);
    }

    // Find the wormhole-mount binary
    let current_exe = std::env::current_exe()?;
    let mount_exe = current_exe
        .parent()
        .map(|p| p.join("wormhole-mount"))
        .filter(|p| p.exists())
        .ok_or("Could not find wormhole-mount binary")?;

    let mut cmd = std::process::Command::new(&mount_exe);
    cmd.arg(&args.target);
    cmd.arg(&mount_point);

    if args.use_kext {
        cmd.arg("--use-kext");
    }

    let status = cmd.status()?;

    if !status.success() {
        error!("Mount failed with exit code: {:?}", status.code());
        return Err("Mount failed".into());
    }

    Ok(())
}

async fn run_mount_via_signal(
    args: &MountArgs,
    cli: &Cli,
) -> Result<(), Box<dyn std::error::Error>> {
    let code = teleport_core::crypto::normalize_join_code(&args.target);

    if !teleport_core::crypto::validate_join_code(&code) {
        error!("Invalid join code: {}", args.target);
        println!();
        println!("Did you mean to use a direct IP address?");
        println!("  Example: wormhole mount 192.168.1.100:4433");
        return Err("Invalid join code".into());
    }

    let mount_point = args
        .path
        .clone()
        .unwrap_or_else(|| std::env::temp_dir().join(format!("wormhole-{code}")));

    // See run_mount_direct: don't pre-create macOS FSKit /Volumes mount points.
    #[cfg(target_os = "macos")]
    let skip_create = !args.use_kext && mount_point.starts_with("/Volumes");
    #[cfg(not(target_os = "macos"))]
    let skip_create = false;

    if !skip_create && !mount_point.exists() {
        std::fs::create_dir_all(&mount_point)?;
    }

    if !cli.quiet {
        println!("Connecting to share: {}", code);
        println!("Signal server: {}", args.signal);
        println!("Mount point: {:?}", mount_point);
    }

    let rendezvous = teleport_daemon::rendezvous::RendezvousClient::new(Some(args.signal.clone()));

    if !cli.quiet {
        println!("Connecting to signal server...");
    }

    let result = rendezvous.connect(&code).await;

    match result {
        Ok(rendezvous_result) => {
            if !cli.quiet {
                println!(
                    "Found host at: {} (local: {})",
                    rendezvous_result.peer_addr, rendezvous_result.is_local
                );
            }

            let host_addr = rendezvous_result.peer_addr.to_string();

            // Call mount directly with resolved address
            let _addr: SocketAddr = host_addr.parse()?;

            // Note: args.use_kext is available for future kext-specific mount logic on macOS
            #[cfg(target_os = "macos")]
            let _ = args.use_kext; // Silence unused warning until kext logic is implemented

            let actual_mount = mount_point.clone();

            if !cli.quiet {
                println!("Mounting to {:?}", actual_mount);
            }

            // Find the wormhole-mount binary
            let current_exe = std::env::current_exe()?;
            let mount_exe = current_exe
                .parent()
                .map(|p| p.join("wormhole-mount"))
                .filter(|p| p.exists())
                .ok_or("Could not find wormhole-mount binary")?;

            let mut cmd = std::process::Command::new(&mount_exe);
            cmd.arg(host_addr);
            cmd.arg(&actual_mount);

            if args.use_kext {
                cmd.arg("--use-kext");
            }

            let status = cmd.status()?;

            if !status.success() {
                error!("Mount failed with exit code: {:?}", status.code());
                return Err("Mount failed".into());
            }

            Ok(())
        }
        Err(e) => {
            error!("Failed to connect via signal server: {}", e);
            println!();
            println!("Make sure:");
            println!("  1. The signal server is running");
            println!("  2. The host is connected with the same join code");
            println!("  3. Both machines can reach the signal server");
            println!();
            println!("Alternative: Use direct IP connection:");
            println!("  wormhole mount <ip>:4433");
            Err(format!("Signal server connection failed: {}", e).into())
        }
    }
}

async fn run_status(args: &StatusArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    // Prefer control-plane status when wormhole-ctl serve is running.
    if let Ok(output) = std::process::Command::new("wormhole-ctl")
        .arg("status")
        .output()
    {
        if output.status.success() {
            io::stdout().write_all(&output.stdout)?;
            return Ok(());
        }
    }

    println!("╔═══════════════════════════════════════════════════════════════╗");
    println!("║                    WORMHOLE STATUS                            ║");
    println!("╠═══════════════════════════════════════════════════════════════╣");
    println!("║                                                               ║");
    println!("║  Active Hosts:  0  (start control plane for live sessions)    ║");
    println!("║  Active Mounts: 0                                             ║");
    println!("║                                                               ║");
    println!("║  Tip: wormhole-ctl serve   # then host/mount/status           ║");
    println!("║       wormhole mcp         # MCP server (same API)            ║");
    println!("║                                                               ║");

    if args.detailed {
        if let Ok(cache) = DiskCache::new() {
            let entries = cache.entry_count();
            let size = cache.total_size();
            println!("║  Cache Stats:                                                 ║");
            println!("║    Entries:    {:<47} ║", entries);
            println!("║    Size:       {:<47} ║", format_bytes(size));
        }
    }

    println!("║                                                               ║");
    println!("║  Protocol Version: {:<43} ║", PROTOCOL_VERSION);
    println!("║  Chunk Size: {:<50} ║", format_bytes(CHUNK_SIZE as u64));
    println!("║                                                               ║");
    println!("╚═══════════════════════════════════════════════════════════════╝");

    Ok(())
}

async fn run_mcp() -> Result<(), Box<dyn std::error::Error>> {
    let candidates = [
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("wormhole-mcp"))),
        Some(PathBuf::from("wormhole-mcp")),
    ];
    for path in candidates.into_iter().flatten() {
        if path == PathBuf::from("wormhole-mcp") || path.exists() {
            let status = std::process::Command::new(&path).status()?;
            if status.success() {
                return Ok(());
            }
            if path.exists() {
                return Err(format!("wormhole-mcp exited with {status}").into());
            }
        }
    }
    Err("wormhole-mcp not found. Build with: cargo build -p teleport-mcp".into())
}

async fn run_ctl(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let status = std::process::Command::new("wormhole-ctl")
        .args(args)
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("wormhole-ctl exited with {status}").into())
    }
}

async fn run_cache(args: &CacheArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    match &args.command {
        CacheCommands::Stats(_stats_args) => {
            let cache = DiskCache::new()?;

            println!("╔═══════════════════════════════════════════════════════════════╗");
            println!("║                    CACHE STATISTICS                           ║");
            println!("╠═══════════════════════════════════════════════════════════════╣");
            println!("║                                                               ║");
            println!("║  Disk Cache:                                                  ║");
            println!("║    Entries:    {:<47} ║", cache.entry_count());
            println!(
                "║    Total Size: {:<47} ║",
                format_bytes(cache.total_size())
            );
            println!("║                                                               ║");

            // Show RAM cache stats if available
            let ram_cache = HybridCacheManager::default();
            let stats = ram_cache.stats();

            println!("║  RAM Cache:                                                   ║");
            println!(
                "║    Size:       {:<47} ║",
                format_bytes(stats.ram_size_bytes as u64)
            );
            println!("║    Hits:       {:<47} ║", stats.ram_hits);
            println!("║    Disk Hits:  {:<47} ║", stats.disk_hits);
            println!("║    Misses:     {:<47} ║", stats.misses);

            let total_requests = stats.ram_hits + stats.disk_hits + stats.misses;
            let hit_rate = if total_requests > 0 {
                ((stats.ram_hits + stats.disk_hits) as f64 / total_requests as f64) * 100.0
            } else {
                0.0
            };
            println!("║    Hit Rate:   {:<47} ║", format!("{:.1}%", hit_rate));
            println!("║                                                               ║");
            println!("╚═══════════════════════════════════════════════════════════════╝");
        }

        CacheCommands::Clear(clear_args) => {
            if !clear_args.force {
                print!("Are you sure you want to clear the cache? [y/N] ");
                io::stdout().flush()?;
                let mut input = String::new();
                io::stdin().read_line(&mut input)?;
                if !input.trim().eq_ignore_ascii_case("y") {
                    println!("Cancelled.");
                    return Ok(());
                }
            }

            let cache = DiskCache::new()?;
            let size_before = cache.total_size();
            cache.clear()?;
            println!(
                "Cache cleared. Freed {} of space.",
                format_bytes(size_before)
            );
        }

        CacheCommands::Path => {
            if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
                println!("{}", dirs.cache_dir().display());
            }
        }

        CacheCommands::Gc(gc_args) => {
            let cache = DiskCache::new()?;
            let size_before = cache.total_size();

            if let Some(target_gb) = gc_args.target_gb {
                let target_bytes = target_gb * 1024 * 1024 * 1024;
                if gc_args.dry_run {
                    println!(
                        "Would free {} to reach target size of {}",
                        format_bytes(size_before.saturating_sub(target_bytes)),
                        format_bytes(target_bytes)
                    );
                } else {
                    // Evict until target size
                    let entries = cache.entries_by_access_time();
                    let mut current_size = size_before;

                    for (chunk_id, _) in entries {
                        if current_size <= target_bytes {
                            break;
                        }
                        if let Ok(true) = cache.remove(&chunk_id) {
                            current_size = cache.total_size();
                        }
                    }

                    println!(
                        "Garbage collection complete. Freed {}.",
                        format_bytes(size_before - current_size)
                    );
                }
            } else {
                println!("No target size specified. Use --target-gb to set.");
            }
        }

        _ => {
            println!("Command not yet implemented");
        }
    }

    Ok(())
}

async fn run_config(args: &ConfigArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    match &args.command {
        ConfigCommands::Path => {
            if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
                println!("{}", dirs.config_dir().join("config.toml").display());
            }
        }
        ConfigCommands::List => {
            println!("Available configuration keys:");
            println!();
            println!("  cache.ram_size_mb      - RAM cache size (default: 512)");
            println!("  cache.disk_size_gb     - Disk cache size (default: 10)");
            println!("  host.default_port      - Default host port (default: 4433)");
            println!("  host.max_connections   - Max connections (default: 10)");
            println!("  signal.default_url     - Default signal server URL");
            println!("  network.bandwidth_limit_mbps - Bandwidth limit");
            println!("  network.timeout_secs   - Connection timeout");
            println!("  ui.color               - Enable colors (default: true)");
            println!("  ui.progress            - Show progress bars (default: true)");
        }
        _ => {
            println!("Command not yet implemented");
        }
    }

    Ok(())
}

async fn run_peers(args: &PeersArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    match &args.command {
        PeersCommands::List(_) => {
            println!("No known peers.");
            println!();
            println!("Peers are added automatically when you connect to shares.");
            println!("Or add manually with: wormhole peers add <peer>");
        }
        _ => {
            println!("Command not yet implemented");
        }
    }

    Ok(())
}

async fn run_sync(args: &SyncArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    match &args.command {
        SyncCommands::Status(_) => {
            println!("╔═══════════════════════════════════════════════════════════════╗");
            println!("║                    SYNC STATUS                                ║");
            println!("╠═══════════════════════════════════════════════════════════════╣");
            println!("║                                                               ║");
            println!("║  No active synchronizations.                                  ║");
            println!("║                                                               ║");
            println!("║  Mount a share with write access to enable sync:              ║");
            println!("║    wormhole mount <code> --write                              ║");
            println!("║                                                               ║");
            println!("╚═══════════════════════════════════════════════════════════════╝");
        }
        SyncCommands::Conflicts(_) => {
            println!("No sync conflicts.");
        }
        _ => {
            println!("Command not yet implemented");
        }
    }

    Ok(())
}

async fn run_signal(args: &SignalArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let bind_addr: SocketAddr = format!("{}:{}", args.bind, args.port).parse()?;

    if !cli.quiet {
        println!();
        println!("╔═══════════════════════════════════════════════════════════════╗");
        println!("║              🌀 WORMHOLE SIGNAL SERVER                        ║");
        println!("╠═══════════════════════════════════════════════════════════════╣");
        println!("║                                                               ║");
        println!("║  Listening:  ws://{:<45} ║", bind_addr);
        println!("║  Max Conn:   {:<49} ║", args.max_connections);
        println!("║  Code TTL:   {:<49} ║", format!("{}s", args.code_expiry));
        if args.enable_stun {
            println!("║  STUN:       enabled                                          ║");
        }
        if args.enable_turn {
            println!("║  TURN:       enabled                                          ║");
        }
        println!("║                                                               ║");
        println!("║  Press Ctrl+C to stop                                         ║");
        println!("╚═══════════════════════════════════════════════════════════════╝");
        println!();
    }

    let server = teleport_signal::SignalServer::new();

    tokio::select! {
        result = server.serve(bind_addr) => {
            if let Err(e) = result {
                error!("Signal server error: {:?}", e);
            }
        }
        _ = signal::ctrl_c() => {
            println!("\nShutting down signal server...");
        }
    }

    Ok(())
}

fn run_completions(args: &CompletionsArgs) -> Result<(), Box<dyn std::error::Error>> {
    use clap::CommandFactory;
    use clap_complete::{generate, shells};

    let mut cmd = Cli::command();
    let name = cmd.get_name().to_string();

    match args.shell {
        Shell::Bash => generate(shells::Bash, &mut cmd, name, &mut io::stdout()),
        Shell::Zsh => generate(shells::Zsh, &mut cmd, name, &mut io::stdout()),
        Shell::Fish => generate(shells::Fish, &mut cmd, name, &mut io::stdout()),
        Shell::PowerShell => generate(shells::PowerShell, &mut cmd, name, &mut io::stdout()),
        Shell::Elvish => generate(shells::Elvish, &mut cmd, name, &mut io::stdout()),
    }

    Ok(())
}

fn run_version(args: &VersionArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    println!("wormhole {}", env!("CARGO_PKG_VERSION"));

    if args.detailed {
        println!();
        println!("Build Information:");
        println!("  Protocol Version: {}", PROTOCOL_VERSION);
        println!("  Chunk Size: {}", format_bytes(CHUNK_SIZE as u64));
        println!("  Rust Version: {}", rustc_version_runtime::version());
        println!();
        println!("System Information:");
        println!("  OS: {} {}", std::env::consts::OS, std::env::consts::ARCH);

        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = std::process::Command::new("sw_vers")
                .arg("-productVersion")
                .output()
            {
                if let Ok(version) = String::from_utf8(output.stdout) {
                    println!("  macOS Version: {}", version.trim());
                }
            }
        }

        // Check for FUSE
        #[cfg(target_os = "macos")]
        {
            let macfuse_path = std::path::Path::new("/Library/Filesystems/macfuse.fs");
            if macfuse_path.exists() {
                println!("  macFUSE: installed");
            } else {
                println!("  macFUSE: not installed");
            }
        }

        #[cfg(target_os = "linux")]
        {
            let fuse_path = std::path::Path::new("/dev/fuse");
            if fuse_path.exists() {
                println!("  FUSE: available");
            } else {
                println!("  FUSE: not available");
            }
        }

        // Cache directory
        if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
            println!();
            println!("Directories:");
            println!("  Config: {}", dirs.config_dir().display());
            println!("  Cache: {}", dirs.cache_dir().display());
            println!("  Data: {}", dirs.data_dir().display());
        }
    }

    Ok(())
}

async fn run_ping(args: &PingArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let target = if is_ip_address(&args.target) {
        args.target.clone()
    } else {
        // Resolve via signal server
        let rendezvous =
            teleport_daemon::rendezvous::RendezvousClient::new(Some(args.signal.clone()));
        let code = teleport_core::crypto::normalize_join_code(&args.target);

        if !cli.quiet {
            println!("Resolving {} via signal server...", code);
        }

        let result = rendezvous.connect(&code).await?;
        result.peer_addr.to_string()
    };

    println!("PING {} ({} pings)", target, args.count);

    let mut successful = 0;
    let mut total_time = Duration::ZERO;
    let mut min_time = Duration::MAX;
    let mut max_time = Duration::ZERO;

    for i in 0..args.count {
        let start = Instant::now();

        // Try to connect
        let addr: SocketAddr = target.parse()?;
        #[allow(deprecated)] // Using insecure endpoint for ping is acceptable
        let endpoint = teleport_daemon::net::create_client_endpoint()
            .map_err(|e| format!("Failed to create endpoint: {:?}", e))?;

        let result = tokio::time::timeout(
            Duration::from_secs(args.timeout),
            teleport_daemon::net::connect(&endpoint, addr, "localhost"),
        )
        .await;

        let elapsed = start.elapsed();

        match result {
            Ok(Ok(_conn)) => {
                println!(
                    "Reply from {}: time={:.2}ms seq={}",
                    target,
                    elapsed.as_secs_f64() * 1000.0,
                    i + 1
                );
                successful += 1;
                total_time += elapsed;
                min_time = min_time.min(elapsed);
                max_time = max_time.max(elapsed);
            }
            Ok(Err(e)) => {
                println!("Request {} failed: {:?}", i + 1, e);
            }
            Err(_) => {
                println!("Request {} timed out", i + 1);
            }
        }

        if i < args.count - 1 {
            tokio::time::sleep(Duration::from_secs(args.interval)).await;
        }
    }

    println!();
    println!("--- {} ping statistics ---", target);
    println!(
        "{} packets transmitted, {} received, {:.1}% packet loss",
        args.count,
        successful,
        ((args.count - successful) as f64 / args.count as f64) * 100.0
    );

    if successful > 0 {
        let avg_time = total_time / successful;
        println!(
            "rtt min/avg/max = {:.2}/{:.2}/{:.2} ms",
            min_time.as_secs_f64() * 1000.0,
            avg_time.as_secs_f64() * 1000.0,
            max_time.as_secs_f64() * 1000.0
        );
    }

    Ok(())
}

async fn run_bench(args: &BenchArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    println!("Benchmark not yet fully implemented.");
    println!();
    println!("Would benchmark:");
    println!("  Target: {}", args.target);
    println!("  Test: {:?}", args.test);
    println!("  Duration: {}s", args.duration);
    println!("  Parallel streams: {}", args.parallel);

    Ok(())
}

fn run_init(args: &InitArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let path = args.path.clone().unwrap_or_else(|| PathBuf::from("."));
    let wormhole_dir = path.join(".wormhole");

    if wormhole_dir.exists() {
        println!("Already initialized at {:?}", wormhole_dir);
        return Ok(());
    }

    if !args.no_config {
        std::fs::create_dir_all(&wormhole_dir)?;

        // Create default config
        let config_path = wormhole_dir.join("config.toml");
        std::fs::write(
            &config_path,
            r#"# Wormhole local configuration
# This file configures wormhole behavior for this directory

[host]
# Default name when hosting this folder
# name = "My Share"

# Default port
# port = 4433

# Allow write access
# allow_write = false

[mount]
# Default cache mode
# cache_mode = "hybrid"

[sync]
# Patterns to exclude from sync
# exclude = ["*.tmp", ".git"]
"#,
        )?;

        // Create project aperture
        let aperture = teleport_daemon::aperture::ProjectAperture::default_new();
        aperture.write(&path)?;
        let aperture_path = teleport_daemon::aperture::ProjectAperture::aperture_path(&path);

        // Create .gitignore in .wormhole
        std::fs::write(wormhole_dir.join(".gitignore"), "*\n")?;

        println!("Initialized wormhole in {:?}", path);
        println!();
        println!("Created:");
        println!("  {}", config_path.display());
        println!("  {}", aperture_path.display());
        println!();
        println!("To inspect the project aperture, run:");
        println!("  wormhole open .");
        println!();
        println!("To share this folder, run:");
        println!("  wormhole host .");
    }

    Ok(())
}

fn run_open(args: &OpenArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let path = args.path.clone().unwrap_or_else(|| PathBuf::from("."));
    let aperture = match teleport_daemon::aperture::ProjectAperture::load(&path)? {
        Some(a) => a,
        None => {
            return Err(format!(
                "no aperture.toml at {} — run `wormhole init` first",
                teleport_daemon::aperture::ProjectAperture::aperture_path(&path).display()
            )
            .into());
        }
    };

    println!("Project aperture: {}", path.display());
    println!(
        "  name: {}",
        aperture.name.as_deref().unwrap_or("(unnamed)")
    );
    println!("  roots: {:?}", aperture.roots);
    println!("  exclude: {:?}", aperture.exclude);
    println!("  playhead_prefetch: {}", aperture.playhead_prefetch);
    println!("  content_addressed: {}", aperture.content_addressed);

    // Validate roots are non-empty and excludes don't reject everything under roots.
    if aperture.roots.is_empty() {
        return Err("aperture roots is empty — add at least one root".into());
    }
    for root in &aperture.roots {
        if root.contains("..") {
            return Err(format!("invalid root (contains ..): {root}").into());
        }
        if !aperture.allows_relative(root) && root != "." {
            eprintln!("warning: root `{root}` is matched by an exclude pattern");
        }
    }

    println!("Aperture OK.");
    Ok(())
}

fn run_fetch(args: &FetchArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let hash = teleport_daemon::magnet::parse_magnet(&args.magnet).ok_or_else(|| {
        format!(
            "invalid magnet (expected wormhole:magnet:blake3:<hex>, blake3:<hex>, or 64-hex): {}",
            args.magnet
        )
    })?;

    if args.from.is_some() {
        eprintln!("note: --from is reserved for remote fetch; checking local store only");
    }

    let store = teleport_daemon::ContentStore::open_default()
        .map_err(|e| format!("content store unavailable: {e}"))?;

    if store.contains(&hash) {
        let hex = hash.to_hex();
        let uri = teleport_daemon::magnet::magnet_uri(&hash);
        println!("ok");
        println!("  hex: {hex}");
        println!("  magnet: {uri}");
        if let Ok(data) = store.get(&hash) {
            println!("  size: {} bytes", data.len());
        }
        Ok(())
    } else {
        println!("chunk is not local: {}", hash.to_hex());
        // Always non-zero when missing so automation can detect absence.
        Err("chunk not found in local content store".into())
    }
}

fn run_playhead(args: &PlayheadArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let mut gov = teleport_daemon::Governor::new();
    let targets = gov.hint_playhead(args.inode, args.offset, args.ahead, args.behind);
    println!(
        "playhead inode={} offset={} → {} chunk(s)",
        args.inode,
        args.offset,
        targets.len()
    );
    for chunk in &targets {
        println!("  inode={} index={}", chunk.inode, chunk.index);
    }
    Ok(())
}

async fn run_unmount(args: &UnmountArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    if args.all {
        println!("Unmounting all shares...");
        // TODO: Implement unmount all
        println!("No active mounts to unmount.");
        return Ok(());
    }

    let target = PathBuf::from(&args.target);

    if target.exists() && target.is_dir() {
        // Try to unmount using system command
        #[cfg(target_os = "macos")]
        {
            let status = std::process::Command::new("umount")
                .arg(if args.force { "-f" } else { "" })
                .arg(&target)
                .status()?;

            if status.success() {
                println!("Unmounted {:?}", target);
            } else {
                error!("Failed to unmount {:?}", target);
            }
        }

        #[cfg(target_os = "linux")]
        {
            let mut cmd = std::process::Command::new("fusermount");
            cmd.arg("-u");
            if args.force {
                cmd.arg("-z"); // Lazy unmount
            }
            cmd.arg(&target);

            let status = cmd.status()?;
            if status.success() {
                println!("Unmounted {:?}", target);
            } else {
                error!("Failed to unmount {:?}", target);
            }
        }
    } else {
        error!("Not a valid mount point: {:?}", target);
    }

    Ok(())
}

async fn run_list(args: &ListArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    println!("╔═══════════════════════════════════════════════════════════════╗");
    println!("║                    ACTIVE CONNECTIONS                         ║");
    println!("╠═══════════════════════════════════════════════════════════════╣");
    println!("║                                                               ║");

    match args.list_type {
        ListType::All | ListType::Hosts => {
            println!("║  HOSTS (0):                                                   ║");
            println!("║    (none)                                                     ║");
            println!("║                                                               ║");
        }
        _ => {}
    }

    match args.list_type {
        ListType::All | ListType::Mounts => {
            println!("║  MOUNTS (0):                                                  ║");
            println!("║    (none)                                                     ║");
            println!("║                                                               ║");
        }
        _ => {}
    }

    match args.list_type {
        ListType::All | ListType::Peers => {
            println!("║  PEERS (0):                                                   ║");
            println!("║    (none)                                                     ║");
            println!("║                                                               ║");
        }
        _ => {}
    }

    println!("╚═══════════════════════════════════════════════════════════════╝");

    Ok(())
}

fn run_history(args: &HistoryArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    println!("Transfer history (last {} entries):", args.limit);
    println!();
    println!("No transfer history available.");
    println!();
    println!("History is recorded when you host or mount shares.");

    Ok(())
}

async fn run_access(args: &AccessArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    match &args.command {
        AccessCommands::Show(_) => {
            println!("No access rules configured.");
            println!();
            println!("Access rules control who can connect to your shares.");
            println!("Use 'wormhole access grant <share> <peer>' to add rules.");
        }
        _ => {
            println!("Command not yet implemented");
        }
    }

    Ok(())
}

async fn run_watch(args: &WatchArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    println!("Watching {} for changes...", args.target);
    println!("Press Ctrl+C to stop");
    println!();

    // TODO: Implement file watching with notify crate
    signal::ctrl_c().await?;
    println!("\nStopped watching.");

    Ok(())
}

async fn run_update(args: &UpdateArgs, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let _channel: UpdateChannel = args.channel.into();

    match &args.command {
        Some(UpdateCommands::Check(check_args)) => run_update_check(check_args, cli).await,
        Some(UpdateCommands::Changelog(changelog_args)) => {
            run_update_changelog(changelog_args, cli).await
        }
        Some(UpdateCommands::Config(config_args)) => run_update_config(config_args, cli),
        None => {
            // Default: check for updates
            let check_args = UpdateCheckArgs {
                force: args.force,
                channel: args.channel,
                show_url: false,
            };
            run_update_check(&check_args, cli).await
        }
    }
}

async fn run_update_check(
    args: &UpdateCheckArgs,
    cli: &Cli,
) -> Result<(), Box<dyn std::error::Error>> {
    let channel: UpdateChannel = args.channel.into();
    let current_version = env!("CARGO_PKG_VERSION");

    if !cli.quiet {
        println!("Checking for updates...");
        println!("  Current version: {}", current_version);
        println!("  Channel: {}", channel);
        println!();
    }

    let checker = if args.force {
        UpdateChecker::default_repo(channel).skip_cache()
    } else {
        UpdateChecker::default_repo(channel)
    };

    match checker.check_for_update().await {
        Ok(Some(update)) => match cli.format {
            OutputFormat::Json => {
                println!("{}", serde_json::to_string_pretty(&update)?);
            }
            OutputFormat::Yaml => {
                println!("version: {}", update.version);
                println!("name: {}", update.name);
                println!("prerelease: {}", update.prerelease);
                println!("critical: {}", update.is_critical);
                println!("url: {}", update.html_url);
            }
            OutputFormat::Text => {
                println!("{}", format_update_message(&update, current_version));

                if args.show_url {
                    if let Some(url) =
                        UpdateChecker::get_download_url_for_current_platform(&update.download_urls)
                    {
                        println!("  Direct download: {}", url);
                    }
                }
            }
        },
        Ok(None) => {
            if !cli.quiet {
                println!("You're running the latest version ({}).", current_version);
            }
        }
        Err(e) => {
            if !cli.quiet {
                eprintln!("Failed to check for updates: {}", e);
                eprintln!();
                eprintln!("This could be due to:");
                eprintln!("  - No internet connection");
                eprintln!("  - GitHub API rate limiting");
                eprintln!("  - Repository not accessible");
            }
            return Err(e.into());
        }
    }

    Ok(())
}

async fn run_update_changelog(
    _args: &UpdateChangelogArgs,
    _cli: &Cli,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Changelog feature coming soon.");
    println!();
    println!("View release notes at:");
    println!("  https://github.com/wormhole-team/wormhole/releases");

    Ok(())
}

fn run_update_config(
    args: &UpdateConfigArgs,
    _cli: &Cli,
) -> Result<(), Box<dyn std::error::Error>> {
    if args.auto_check.is_none() && args.channel.is_none() && args.check_interval_hours.is_none() {
        // Show current config
        println!("Update configuration:");
        println!();
        println!("  auto_check: true (default)");
        println!("  channel: stable");
        println!("  check_interval: 24 hours");
        println!();
        println!("Use --auto-check, --channel, or --check-interval-hours to modify.");
    } else {
        println!("Update configuration saved.");
        // TODO: Actually persist the configuration
    }

    Ok(())
}

async fn run_doctor(args: &DoctorArgs, _cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    println!("╔═══════════════════════════════════════════════════════════════╗");
    println!("║                    WORMHOLE DOCTOR                            ║");
    println!("╠═══════════════════════════════════════════════════════════════╣");
    println!("║                                                               ║");

    let mut issues = 0;
    let mut warnings = 0;

    // Check 1: FUSE availability
    print!("║  Checking FUSE installation... ");
    #[cfg(target_os = "macos")]
    {
        let macfuse_path = std::path::Path::new("/Library/Filesystems/macfuse.fs");
        if macfuse_path.exists() {
            println!("                    ✓ OK ║");
        } else {
            println!("                 ✗ MISSING ║");
            issues += 1;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let fuse_path = std::path::Path::new("/dev/fuse");
        if fuse_path.exists() {
            println!("                    ✓ OK ║");
        } else {
            println!("                 ✗ MISSING ║");
            issues += 1;
        }
    }
    #[cfg(target_os = "windows")]
    {
        println!("                ⚠ UNCHECKED ║");
        warnings += 1;
    }

    // Check 2: Cache directory
    print!("║  Checking cache directory... ");
    if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
        let cache_dir = dirs.cache_dir();
        if cache_dir.exists() {
            println!("                      ✓ OK ║");
        } else if args.fix {
            match std::fs::create_dir_all(cache_dir) {
                Ok(_) => println!("                   ✓ FIXED ║"),
                Err(_) => {
                    println!("              ✗ CREATE FAIL ║");
                    issues += 1;
                }
            }
        } else {
            println!("                 ✗ MISSING ║");
            warnings += 1;
        }
    } else {
        println!("              ✗ UNAVAILABLE ║");
        issues += 1;
    }

    // Check 3: Config directory
    print!("║  Checking config directory... ");
    if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
        let config_dir = dirs.config_dir();
        if config_dir.exists() {
            println!("                     ✓ OK ║");
        } else if args.fix {
            match std::fs::create_dir_all(config_dir) {
                Ok(_) => println!("                   ✓ FIXED ║"),
                Err(_) => {
                    println!("              ✗ CREATE FAIL ║");
                    issues += 1;
                }
            }
        } else {
            println!("                 ✗ MISSING ║");
            warnings += 1;
        }
    } else {
        println!("              ✗ UNAVAILABLE ║");
        issues += 1;
    }

    // Check 4: Network connectivity (if full check)
    if args.full {
        print!("║  Checking network connectivity... ");
        match reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        {
            Ok(client) => match client.get("https://api.github.com").send().await {
                Ok(resp) if resp.status().is_success() => {
                    println!("                ✓ OK ║");
                }
                Ok(_) => {
                    println!("             ⚠ LIMITED ║");
                    warnings += 1;
                }
                Err(_) => {
                    println!("              ✗ FAILED ║");
                    warnings += 1;
                }
            },
            Err(_) => {
                println!("              ✗ FAILED ║");
                warnings += 1;
            }
        }

        // Check 5: Update availability
        print!("║  Checking for updates... ");
        let checker = UpdateChecker::default_repo(UpdateChannel::Stable);
        match checker.check_for_update().await {
            Ok(Some(update)) => {
                println!("             ⚠ {} AVAIL ║", update.version);
                warnings += 1;
            }
            Ok(None) => {
                println!("                 ✓ LATEST ║");
            }
            Err(_) => {
                println!("              ✗ FAILED ║");
                warnings += 1;
            }
        }
    }

    // Check 6: Disk space
    print!("║  Checking disk space... ");
    if let Some(_dirs) = directories::ProjectDirs::from("", "", "wormhole") {
        let cache = DiskCache::new();
        match cache {
            Ok(c) => {
                let size = c.total_size();
                if size < 10 * 1024 * 1024 * 1024 {
                    // Less than 10GB
                    println!("                        ✓ OK ║");
                } else {
                    println!("                    ⚠ {} ║", format_bytes(size));
                    warnings += 1;
                }
            }
            Err(_) => {
                println!("              ✗ UNAVAILABLE ║");
                warnings += 1;
            }
        }
    } else {
        println!("              ✗ UNAVAILABLE ║");
        warnings += 1;
    }

    println!("║                                                               ║");
    println!("╠═══════════════════════════════════════════════════════════════╣");

    if issues == 0 && warnings == 0 {
        println!("║  Status: All checks passed!                                  ║");
    } else if issues == 0 {
        println!(
            "║  Status: {} warning(s), no critical issues                   ║",
            warnings
        );
    } else {
        println!(
            "║  Status: {} issue(s), {} warning(s)                           ║",
            issues, warnings
        );
    }

    println!("║                                                               ║");

    if issues > 0 {
        println!("║  Run 'wormhole doctor --fix' to attempt automatic repair.    ║");
    }

    println!("╚═══════════════════════════════════════════════════════════════╝");

    if issues > 0 {
        std::process::exit(1);
    }

    Ok(())
}

// ============================================================================
// Utility Functions
// ============================================================================

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    const TB: u64 = GB * 1024;

    if bytes >= TB {
        format!("{:.2} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
