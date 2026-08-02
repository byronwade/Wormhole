//! teleport-cloud CLI — issue/verify mount tokens (control plane only).

use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use teleport_cloud::TokenService;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "teleport-cloud", about = "Wormhole control-plane utilities")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a new team signing seed
    Init {
        #[arg(long, default_value = "team.seed")]
        seed: PathBuf,
    },
    /// Issue a mount token for a subject
    Issue {
        #[arg(long, default_value = "team.seed")]
        seed: PathBuf,
        #[arg(long)]
        subject: String,
        #[arg(long)]
        share: Option<String>,
        #[arg(long)]
        ttl: Option<u64>,
    },
    /// Verify a mount token
    Verify {
        #[arg(long, default_value = "team.seed")]
        seed: PathBuf,
        #[arg(long)]
        token: String,
        #[arg(long)]
        share: Option<String>,
    },
    /// Print team public key id
    KeyId {
        #[arg(long, default_value = "team.seed")]
        seed: PathBuf,
    },
    /// Serve Polar webhook + health (control plane only — no file bytes)
    Serve {
        #[arg(long, default_value = "0.0.0.0:8787")]
        bind: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse()?))
        .init();

    let cli = Cli::parse();
    match cli.command {
        Commands::Init { seed } => {
            let svc = TokenService::new();
            svc.save_seed(&seed)
                .with_context(|| format!("write {}", seed.display()))?;
            println!("team_key_id={}", svc.team_key_id());
            println!("seed={}", seed.display());
        }
        Commands::Issue {
            seed,
            subject,
            share,
            ttl,
        } => {
            let svc = TokenService::load_seed(&seed)
                .with_context(|| format!("load {}", seed.display()))?;
            let token = svc.issue_encoded(&subject, share, ttl)?;
            println!("{token}");
        }
        Commands::Verify { seed, token, share } => {
            let svc = TokenService::load_seed(&seed)
                .with_context(|| format!("load {}", seed.display()))?;
            let grant = svc.verify_encoded(&token, share.as_deref())?;
            println!(
                "ok subject={} expires_at={}",
                grant.grant.subject, grant.grant.expires_at
            );
        }
        Commands::KeyId { seed } => {
            let svc = TokenService::load_seed(&seed)
                .with_context(|| format!("load {}", seed.display()))?;
            println!("{}", svc.team_key_id());
        }
        Commands::Serve { bind } => {
            serve_control_plane(&bind).await?;
        }
    }
    Ok(())
}

async fn serve_control_plane(bind: &str) -> Result<()> {
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use teleport_cloud::{apply_polar_event, PolarWebhookEvent};

    let entitlements = Arc::new(parking_lot::RwLock::new(HashMap::new()));
    let listener = TcpListener::bind(bind)
        .await
        .with_context(|| format!("bind {bind}"))?;
    println!("teleport-cloud listening on http://{bind}");
    println!("  GET  /healthz");
    println!("  POST /webhooks/polar");

    loop {
        let (mut socket, _) = listener.accept().await?;
        let entitlements = entitlements.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 64 * 1024];
            let n = match socket.read(&mut buf).await {
                Ok(0) | Err(_) => return,
                Ok(n) => n,
            };
            let req = String::from_utf8_lossy(&buf[..n]);
            let (status, body) = if req.starts_with("GET /healthz") {
                ("200 OK", r#"{"ok":true}"#.to_string())
            } else if req.starts_with("POST /webhooks/polar") {
                let body_start = req.find("\r\n\r\n").map(|i| i + 4).unwrap_or(req.len());
                let json = &req[body_start..];
                match serde_json::from_str::<PolarWebhookEvent>(json) {
                    Ok(event) => {
                        let mut map = entitlements.write();
                        match apply_polar_event(&mut map, &event) {
                            Ok(()) => ("200 OK", r#"{"applied":true}"#.to_string()),
                            Err(e) => ("400 Bad Request", format!(r#"{{"error":"{e}"}}"#)),
                        }
                    }
                    Err(e) => ("400 Bad Request", format!(r#"{{"error":"{e}"}}"#)),
                }
            } else {
                ("404 Not Found", r#"{"error":"not found"}"#.to_string())
            };
            let resp = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = socket.write_all(resp.as_bytes()).await;
        });
    }
}
