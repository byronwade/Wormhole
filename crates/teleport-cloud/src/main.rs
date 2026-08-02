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
    }
    Ok(())
}
