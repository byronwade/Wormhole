//! Teleport Signal Server
//!
//! Lightweight signaling server for peer discovery and NAT traversal.
//! Clients connect via WebSocket to exchange connection information.
//!
//! # Protocol
//!
//! 1. Host creates a room with a join code
//! 2. Client joins the room using the join code
//! 3. Server relays connection info between peers
//! 4. Peers establish direct QUIC connection
//! 5. Signal connection can be dropped

pub mod server;
pub mod messages;
pub mod room;

pub use server::SignalServer;
pub use messages::{SignalMessage, PeerInfo};
pub use room::Room;

/// Default WebSocket port
pub const DEFAULT_PORT: u16 = 8080;

/// Maximum room idle time before cleanup (5 minutes)
pub const ROOM_IDLE_TIMEOUT_SECS: u64 = 300;

/// Maximum peers per room
pub const MAX_PEERS_PER_ROOM: usize = 10;
