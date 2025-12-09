//! WebSocket signal server implementation

use std::net::SocketAddr;
use std::sync::Arc;

use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, info};

use teleport_core::crypto::{generate_join_code, normalize_join_code, validate_join_code};

use crate::messages::{ErrorCode, PeerInfo, SignalMessage};
use crate::room::Room;
use crate::ROOM_IDLE_TIMEOUT_SECS;

/// Signal server state
pub struct SignalServer {
    /// Active rooms by join code
    rooms: Arc<DashMap<String, Room>>,
    /// Peer ID to room mapping
    peer_rooms: Arc<DashMap<String, String>>,
}

impl SignalServer {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
            peer_rooms: Arc::new(DashMap::new()),
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

            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, peer_addr, rooms, peer_rooms).await {
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

/// Handle a single WebSocket connection
async fn handle_connection(
    stream: TcpStream,
    peer_addr: SocketAddr,
    rooms: Arc<DashMap<String, Room>>,
    peer_rooms: Arc<DashMap<String, String>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Generate peer ID
    let peer_id = generate_peer_id();
    debug!("New connection from {} as {}", peer_addr, peer_id);

    let mut current_room: Option<String> = None;

    while let Some(msg) = ws_receiver.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text,
            Ok(Message::Close(_)) => break,
            Ok(Message::Ping(data)) => {
                let _ = ws_sender.send(Message::Pong(data)).await;
                continue;
            }
            Ok(_) => continue,
            Err(e) => {
                debug!("WebSocket error: {:?}", e);
                break;
            }
        };

        let request = match SignalMessage::from_json(&msg) {
            Ok(r) => r,
            Err(e) => {
                let error = SignalMessage::error(ErrorCode::InternalError, format!("Invalid JSON: {}", e));
                let _ = ws_sender.send(Message::Text(error.to_json().unwrap().into())).await;
                continue;
            }
        };

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
            if ws_sender.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    }

    // Cleanup on disconnect
    if let Some(join_code) = current_room {
        leave_room(&peer_id, &join_code, &rooms, &peer_rooms);
    }

    debug!("Connection closed: {}", peer_id);
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
        SignalMessage::CreateRoom { join_code } => {
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

            if rooms.contains_key(&code) {
                return Some(SignalMessage::error(
                    ErrorCode::InvalidJoinCode,
                    "Join code already in use",
                ));
            }

            let mut room = Room::new(code.clone());
            let info = PeerInfo {
                peer_id: peer_id.into(),
                public_addr: Some(peer_addr),
                local_addrs: vec![],
                quic_port: 4433,
                is_host: true,
            };

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

            let mut room = match rooms.get_mut(&code) {
                Some(r) => r,
                None => {
                    return Some(SignalMessage::error(
                        ErrorCode::RoomNotFound,
                        format!("Room {} not found", code),
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

            if room.add_peer(info).is_err() {
                return Some(SignalMessage::error(ErrorCode::RoomFull, "Room is full"));
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

            if let Some(code) = current_room {
                if let Some(mut room) = rooms.get_mut(code) {
                    room.touch();
                    // Could broadcast to other peers here
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
fn generate_peer_id() -> String {
    let mut bytes = [0u8; 8];
    getrandom::getrandom(&mut bytes).expect("RNG failed");
    hex::encode(bytes)
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
