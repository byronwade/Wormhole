//! Wormhole Signal Server
//!
//! Lightweight WebSocket signaling server for peer discovery and NAT traversal.
//!
//! # Usage
//!
//! ```bash
//! wormhole-signal --port 8080
//! ```

use std::net::SocketAddr;

use clap::Parser;
use tracing::{info, Level};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use teleport_signal::{SignalServer, DEFAULT_PORT};

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

    let server = SignalServer::new();
    server.serve(addr).await?;

    Ok(())
}
