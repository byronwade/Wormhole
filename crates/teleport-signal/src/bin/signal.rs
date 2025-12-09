//! Wormhole Signal Server
//!
//! Lightweight WebSocket signaling server for peer discovery and NAT traversal.
//!
//! # Usage
//!
//! ```bash
//! # In-memory mode (default)
//! wormhole-signal --port 8080
//!
//! # With SQLite persistence
//! wormhole-signal --port 8080 --db /var/lib/wormhole/signal.db
//! ```

use std::net::SocketAddr;
use std::path::PathBuf;

use clap::Parser;
use tracing::{info, Level};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use teleport_signal::{SignalServer, Storage, DEFAULT_PORT};

#[derive(Parser, Debug)]
#[command(name = "wormhole-signal")]
#[command(about = "Wormhole signaling server for peer discovery")]
#[command(version)]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value_t = DEFAULT_PORT)]
    port: u16,

    /// Bind address
    #[arg(short, long, default_value = "0.0.0.0")]
    bind: String,

    /// SQLite database path for persistence (optional, uses in-memory if not specified)
    #[arg(short, long)]
    db: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(
            EnvFilter::builder()
                .with_default_directive(Level::INFO.into())
                .from_env_lossy(),
        )
        .init();

    let args = Args::parse();

    let addr: SocketAddr = format!("{}:{}", args.bind, args.port).parse()?;

    info!("Starting Wormhole Signal Server");
    info!("Listening on {}", addr);

    // Initialize storage if database path provided
    let storage = if let Some(db_path) = &args.db {
        // Create parent directory if it doesn't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        info!("Using SQLite persistence: {:?}", db_path);
        Some(Storage::open(db_path)?)
    } else {
        info!("Using in-memory storage (no persistence)");
        None
    };

    // Log storage stats on startup
    if let Some(ref store) = storage {
        let room_count = store.room_count().unwrap_or(0);
        let peer_count = store.total_peer_count().unwrap_or(0);
        info!(
            "Loaded {} rooms with {} peers from database",
            room_count, peer_count
        );
    }

    let server = SignalServer::new();
    server.serve(addr).await?;

    Ok(())
}
