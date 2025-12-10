//! WebSocket signal server implementation

use std::net::SocketAddr;
use std::sync::Arc;

use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, info, warn};

use teleport_core::crypto::{generate_join_code, normalize_join_code, validate_join_code};

use crate::messages::{ErrorCode, PeerInfo, SignalMessage};
use crate::room::Room;
use crate::ROOM_IDLE_TIMEOUT_SECS;

/// Channel for sending messages to a peer
type PeerSender = mpsc::UnboundedSender<SignalMessage>;

/// Signal server state
pub struct SignalServer {
    /// Active rooms by join code
    rooms: Arc<DashMap<String, Room>>,
    /// Peer ID to room mapping
    peer_rooms: Arc<DashMap<String, String>>,
    /// Peer connections for message relay
    peer_senders: Arc<DashMap<String, PeerSender>>,
}

impl SignalServer {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
            peer_rooms: Arc::new(DashMap::new()),
            peer_senders: Arc::new(DashMap::new()),
        }
    }

    /// Start the signal server
    pub async fn serve(&self, addr: SocketAddr) -> Result<(), std::io::Error> {
        let listener = TcpListener::bind(addr).await?;
        info!("Signal server listening on {}", addr);

        // Start room cleanup task
        let rooms = self.rooms.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                cleanup_idle_rooms(&rooms);
            }
        });

        loop {
            let (stream, peer_addr) = listener.accept().await?;
            let rooms = self.rooms.clone();
            let peer_rooms = self.peer_rooms.clone();
            let peer_senders = self.peer_senders.clone();
            let room_count = self.rooms.len();
            let peer_count = self.peer_rooms.len();

            tokio::spawn(async move {
                if let Err(e) =
                    handle_connection(stream, peer_addr, rooms, peer_rooms, peer_senders, room_count, peer_count)
                        .await
                {
                    debug!("Connection error from {}: {:?}", peer_addr, e);
                }
            });
        }
    }

    /// Get room count (for monitoring)
    pub fn room_count(&self) -> usize {
        self.rooms.len()
    }

    /// Get peer count (for monitoring)
    pub fn peer_count(&self) -> usize {
        self.peer_rooms.len()
    }
}

impl Default for SignalServer {
    fn default() -> Self {
        Self::new()
    }
}

/// Handle a single connection (HTTP or WebSocket)
async fn handle_connection(
    mut stream: TcpStream,
    peer_addr: SocketAddr,
    rooms: Arc<DashMap<String, Room>>,
    peer_rooms: Arc<DashMap<String, String>>,
    peer_senders: Arc<DashMap<String, PeerSender>>,
    room_count: usize,
    peer_count: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Peek at request to check if it's an HTTP health check or WebSocket upgrade
    // WebSocket upgrades include "Upgrade: websocket" header
    let mut peek_buf = [0u8; 512];
    let n = stream.peek(&mut peek_buf).await?;
    let peek_str = String::from_utf8_lossy(&peek_buf[..n]);

    // Check for plain HTTP requests (health checks) - these don't have Upgrade header
    if peek_str.starts_with("GET ") && !peek_str.to_lowercase().contains("upgrade: websocket") {
        return handle_http_request(&mut stream, room_count, peer_count).await;
    }

    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Generate peer ID
    let peer_id = generate_peer_id();
    debug!("New connection from {} as {}", peer_addr, peer_id);

    // Create channel for receiving relayed messages
    let (tx, mut rx) = mpsc::unbounded_channel::<SignalMessage>();
    peer_senders.insert(peer_id.clone(), tx);

    let mut current_room: Option<String> = None;

    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = ws_receiver.next() => {
                let msg = match msg {
                    Some(Ok(Message::Text(text))) => text,
                    Some(Ok(Message::Close(_))) => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = ws_sender.send(Message::Pong(data)).await;
                        continue;
                    }
                    Some(Ok(_)) => continue,
                    Some(Err(e)) => {
                        debug!("WebSocket error: {:?}", e);
                        break;
                    }
                    None => break,
                };

                let request = match SignalMessage::from_json(&msg) {
                    Ok(r) => r,
                    Err(e) => {
                        let error =
                            SignalMessage::error(ErrorCode::InternalError, format!("Invalid JSON: {}", e));
                        let _ = ws_sender
                            .send(Message::Text(error.to_json().unwrap()))
                            .await;
                        continue;
                    }
                };

                // Handle Relay messages specially
                if let SignalMessage::Relay { to_peer_id, payload } = &request {
                    // Verify sender is in a room
                    if current_room.is_none() {
                        let error = SignalMessage::error(ErrorCode::NotInRoom, "Not in a room");
                        let _ = ws_sender.send(Message::Text(error.to_json().unwrap())).await;
                        continue;
                    }

                    // Check if target peer is in the same room
                    let same_room = peer_rooms.get(to_peer_id)
                        .map(|r| current_room.as_ref() == Some(r.value()))
                        .unwrap_or(false);

                    if !same_room {
                        let error = SignalMessage::error(ErrorCode::RoomNotFound, "Target peer not in your room");
                        let _ = ws_sender.send(Message::Text(error.to_json().unwrap())).await;
                        continue;
                    }

                    // Create the relayed message
                    let relayed = SignalMessage::Relayed {
                        from_peer_id: peer_id.clone(),
                        payload: payload.clone(),
                    };

                    // Send to target peer
                    if let Some(target_sender) = peer_senders.get(to_peer_id) {
                        if target_sender.send(relayed).is_err() {
                            warn!("Failed to relay message to {}", to_peer_id);
                        } else {
                            debug!("Relayed message from {} to {}", peer_id, to_peer_id);
                        }
                    } else {
                        warn!("Target peer {} not found", to_peer_id);
                    }
                    continue;
                }

                let response = handle_message(
                    request,
                    &peer_id,
                    peer_addr,
                    &rooms,
                    &peer_rooms,
                    &mut current_room,
                );

                if let Some(response) = response {
                    let json = response.to_json().unwrap();
                    if ws_sender.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
            }

            // Handle messages from other peers (relayed)
            Some(relayed_msg) = rx.recv() => {
                let json = relayed_msg.to_json().unwrap();
                if ws_sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    }

    // Cleanup on disconnect
    peer_senders.remove(&peer_id);
    if let Some(join_code) = current_room {
        leave_room(&peer_id, &join_code, &rooms, &peer_rooms);
    }

    debug!("Connection closed: {}", peer_id);
    Ok(())
}

/// Handle an HTTP request (for health checks)
async fn handle_http_request(
    stream: &mut TcpStream,
    room_count: usize,
    peer_count: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Read the HTTP request
    let mut buf = vec![0u8; 1024];
    let n = stream.read(&mut buf).await?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse the request path
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    let (status, body) = match path {
        "/health" => (
            "200 OK",
            format!(
                r#"{{"status":"healthy","rooms":{},"peers":{}}}"#,
                room_count, peer_count
            ),
        ),
        "/stats" => (
            "200 OK",
            format!(r#"{{"rooms":{},"peers":{}}}"#, room_count, peer_count),
        ),
        _ => ("404 Not Found", r#"{"error":"not found"}"#.to_string()),
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );

    stream.write_all(response.as_bytes()).await?;
    Ok(())
}

/// Handle a single message
fn handle_message(
    msg: SignalMessage,
    peer_id: &str,
    peer_addr: SocketAddr,
    rooms: &DashMap<String, Room>,
    peer_rooms: &DashMap<String, String>,
    current_room: &mut Option<String>,
) -> Option<SignalMessage> {
    match msg {
        SignalMessage::CreateRoom { join_code, peer_info } => {
            if current_room.is_some() {
                return Some(SignalMessage::error(
                    ErrorCode::AlreadyInRoom,
                    "Already in a room",
                ));
            }

            let code = join_code
                .filter(|c| validate_join_code(c))
                .map(|c| normalize_join_code(&c))
                .unwrap_or_else(|| normalize_join_code(&generate_join_code()));

            // SECURITY: Use a generic error message that doesn't reveal whether
            // a room exists (prevents room enumeration attacks)
            if rooms.contains_key(&code) {
                return Some(SignalMessage::error(
                    ErrorCode::InvalidJoinCode,
                    "Unable to create room with this code",
                ));
            }

            let mut room = Room::new(code.clone());

            // Use provided peer_info if available, otherwise create minimal info
            let info = if let Some(mut provided_info) = peer_info {
                // Always set peer_id to server-assigned ID and public_addr from connection
                provided_info.peer_id = peer_id.into();
                provided_info.public_addr = Some(peer_addr);
                provided_info.is_host = true;
                provided_info
            } else {
                PeerInfo {
                    peer_id: peer_id.into(),
                    public_addr: Some(peer_addr),
                    local_addrs: vec![],
                    quic_port: 4433,
                    is_host: true,
                }
            };

            debug!("Creating room {} with host local_addrs: {:?}", code, info.local_addrs);

            if room.add_peer(info).is_err() {
                return Some(SignalMessage::error(
                    ErrorCode::InternalError,
                    "Failed to create room",
                ));
            }

            rooms.insert(code.clone(), room);
            peer_rooms.insert(peer_id.into(), code.clone());
            *current_room = Some(code.clone());

            info!("Room created: {} by {}", code, peer_id);
            Some(SignalMessage::RoomCreated { join_code: code })
        }

        SignalMessage::JoinRoom { join_code } => {
            if current_room.is_some() {
                return Some(SignalMessage::error(
                    ErrorCode::AlreadyInRoom,
                    "Already in a room",
                ));
            }

            let code = normalize_join_code(&join_code);

            // SECURITY: Use a generic error message that doesn't reveal whether
            // a room exists (prevents room enumeration attacks)
            let mut room = match rooms.get_mut(&code) {
                Some(r) => r,
                None => {
                    return Some(SignalMessage::error(
                        ErrorCode::RoomNotFound,
                        "Unable to join room",
                    ));
                }
            };

            let host_info = room.get_host().cloned();

            let info = PeerInfo {
                peer_id: peer_id.into(),
                public_addr: Some(peer_addr),
                local_addrs: vec![],
                quic_port: 4433,
                is_host: false,
            };

            // SECURITY: Use same generic error to avoid revealing room exists but is full
            if room.add_peer(info).is_err() {
                return Some(SignalMessage::error(
                    ErrorCode::RoomFull,
                    "Unable to join room",
                ));
            }

            peer_rooms.insert(peer_id.into(), code.clone());
            *current_room = Some(code.clone());

            info!("Peer {} joined room {}", peer_id, code);
            Some(SignalMessage::JoinedRoom {
                join_code: code,
                host_info,
            })
        }

        SignalMessage::LeaveRoom => {
            if let Some(code) = current_room.take() {
                leave_room(peer_id, &code, rooms, peer_rooms);
                info!("Peer {} left room {}", peer_id, code);
            }
            None
        }

        SignalMessage::Ping { timestamp } => Some(SignalMessage::Pong { timestamp }),

        SignalMessage::PeerInfo(mut info) => {
            // Update peer's public address as seen by server
            info.public_addr = Some(peer_addr);
            // Keep the original peer_id
            info.peer_id = peer_id.to_string();

            if let Some(code) = current_room {
                if let Some(mut room) = rooms.get_mut(code) {
                    // Update the peer's stored info with new addresses
                    room.update_peer(info);
                    debug!("Updated peer info for {} in room {}", peer_id, code);
                }
            }
            None
        }

        _ => Some(SignalMessage::error(
            ErrorCode::InternalError,
            "Unhandled message type",
        )),
    }
}

/// Leave a room and cleanup
fn leave_room(
    peer_id: &str,
    join_code: &str,
    rooms: &DashMap<String, Room>,
    peer_rooms: &DashMap<String, String>,
) {
    peer_rooms.remove(peer_id);

    if let Some(mut room) = rooms.get_mut(join_code) {
        room.remove_peer(peer_id);

        if room.is_empty() {
            drop(room);
            rooms.remove(join_code);
            debug!("Room {} removed (empty)", join_code);
        }
    }
}

/// Cleanup idle rooms
fn cleanup_idle_rooms(rooms: &DashMap<String, Room>) {
    let to_remove: Vec<String> = rooms
        .iter()
        .filter(|r| r.is_idle(ROOM_IDLE_TIMEOUT_SECS))
        .map(|r| r.join_code.clone())
        .collect();

    for code in to_remove {
        rooms.remove(&code);
        info!("Room {} removed (idle timeout)", code);
    }
}

/// Generate a unique peer ID
///
/// # Panics
/// Panics if the system random number generator fails (extremely rare).
fn generate_peer_id() -> String {
    try_generate_peer_id().expect("RNG failed - system entropy source unavailable")
}

/// Try to generate a unique peer ID, returning an error if RNG fails
fn try_generate_peer_id() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; 8];
    getrandom::getrandom(&mut bytes)?;
    Ok(hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_creation() {
        let server = SignalServer::new();
        assert_eq!(server.room_count(), 0);
        assert_eq!(server.peer_count(), 0);
    }

    #[test]
    fn test_peer_id_generation() {
        let id1 = generate_peer_id();
        let id2 = generate_peer_id();

        assert_eq!(id1.len(), 16); // 8 bytes = 16 hex chars
        assert_ne!(id1, id2);
    }
}
