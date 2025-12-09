//! SQLite storage for signal server persistence
//!
//! Provides persistent storage for rooms and peers to survive server restarts.

use std::net::SocketAddr;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use tracing::{debug, error, info};

use crate::messages::PeerInfo;

/// SQLite storage backend
pub struct Storage {
    conn: Mutex<Connection>,
}

impl Storage {
    /// Open or create a new SQLite database
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        let storage = Self {
            conn: Mutex::new(conn),
        };
        storage.init_schema()?;
        Ok(storage)
    }

    /// Create an in-memory database (for testing)
    pub fn in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        let storage = Self {
            conn: Mutex::new(conn),
        };
        storage.init_schema()?;
        Ok(storage)
    }

    /// Initialize the database schema
    fn init_schema(&self) -> Result<(), StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS rooms (
                join_code TEXT PRIMARY KEY,
                host_id TEXT,
                created_at INTEGER NOT NULL,
                last_activity INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS peers (
                peer_id TEXT PRIMARY KEY,
                join_code TEXT NOT NULL,
                public_addr TEXT,
                local_addrs TEXT,
                quic_port INTEGER NOT NULL,
                is_host INTEGER NOT NULL,
                connected_at INTEGER NOT NULL,
                FOREIGN KEY (join_code) REFERENCES rooms(join_code) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_peers_join_code ON peers(join_code);
            "#,
        )?;

        info!("Storage schema initialized");
        Ok(())
    }

    /// Create a new room
    pub fn create_room(&self, join_code: &str) -> Result<(), StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;
        let now = current_timestamp();

        conn.execute(
            "INSERT INTO rooms (join_code, host_id, created_at, last_activity) VALUES (?1, NULL, ?2, ?2)",
            params![join_code, now],
        )?;

        debug!("Room created in storage: {}", join_code);
        Ok(())
    }

    /// Check if a room exists
    pub fn room_exists(&self, join_code: &str) -> Result<bool, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM rooms WHERE join_code = ?1)",
            params![join_code],
            |row| row.get(0),
        )?;

        Ok(exists)
    }

    /// Delete a room
    pub fn delete_room(&self, join_code: &str) -> Result<(), StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        // Delete peers first (due to foreign key)
        conn.execute("DELETE FROM peers WHERE join_code = ?1", params![join_code])?;
        conn.execute("DELETE FROM rooms WHERE join_code = ?1", params![join_code])?;

        debug!("Room deleted from storage: {}", join_code);
        Ok(())
    }

    /// Update room's last activity timestamp
    pub fn touch_room(&self, join_code: &str) -> Result<(), StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;
        let now = current_timestamp();

        conn.execute(
            "UPDATE rooms SET last_activity = ?1 WHERE join_code = ?2",
            params![now, join_code],
        )?;

        Ok(())
    }

    /// Add a peer to a room
    pub fn add_peer(&self, join_code: &str, info: &PeerInfo) -> Result<(), StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;
        let now = current_timestamp();

        let public_addr = info.public_addr.map(|a| a.to_string());
        let local_addrs = serde_json::to_string(&info.local_addrs).unwrap_or_else(|_| "[]".into());

        conn.execute(
            "INSERT OR REPLACE INTO peers (peer_id, join_code, public_addr, local_addrs, quic_port, is_host, connected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                info.peer_id,
                join_code,
                public_addr,
                local_addrs,
                info.quic_port,
                info.is_host as i32,
                now,
            ],
        )?;

        // If this is the host, update the room's host_id
        if info.is_host {
            conn.execute(
                "UPDATE rooms SET host_id = ?1, last_activity = ?2 WHERE join_code = ?3",
                params![info.peer_id, now, join_code],
            )?;
        } else {
            conn.execute(
                "UPDATE rooms SET last_activity = ?1 WHERE join_code = ?2",
                params![now, join_code],
            )?;
        }

        debug!(
            "Peer added to storage: {} in room {}",
            info.peer_id, join_code
        );
        Ok(())
    }

    /// Remove a peer from a room
    pub fn remove_peer(&self, peer_id: &str) -> Result<Option<String>, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        // Get the join code first
        let join_code: Option<String> = conn
            .query_row(
                "SELECT join_code FROM peers WHERE peer_id = ?1",
                params![peer_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(ref code) = join_code {
            // Check if this peer was the host
            let was_host: Option<String> = conn
                .query_row(
                    "SELECT host_id FROM rooms WHERE join_code = ?1",
                    params![code],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();

            // Delete the peer
            conn.execute("DELETE FROM peers WHERE peer_id = ?1", params![peer_id])?;

            // If this was the host, clear the host_id
            if was_host.as_deref() == Some(peer_id) {
                conn.execute(
                    "UPDATE rooms SET host_id = NULL WHERE join_code = ?1",
                    params![code],
                )?;
            }

            let now = current_timestamp();
            conn.execute(
                "UPDATE rooms SET last_activity = ?1 WHERE join_code = ?2",
                params![now, code],
            )?;

            debug!("Peer removed from storage: {}", peer_id);
        }

        Ok(join_code)
    }

    /// Get peer info
    pub fn get_peer(&self, peer_id: &str) -> Result<Option<PeerInfo>, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let result = conn.query_row(
            "SELECT peer_id, public_addr, local_addrs, quic_port, is_host FROM peers WHERE peer_id = ?1",
            params![peer_id],
            |row| {
                let peer_id: String = row.get(0)?;
                let public_addr: Option<String> = row.get(1)?;
                let local_addrs_json: String = row.get(2)?;
                let quic_port: u16 = row.get(3)?;
                let is_host: i32 = row.get(4)?;

                Ok((peer_id, public_addr, local_addrs_json, quic_port, is_host))
            },
        ).optional()?;

        match result {
            Some((peer_id, public_addr, local_addrs_json, quic_port, is_host)) => {
                let public_addr: Option<SocketAddr> = public_addr.and_then(|s| s.parse().ok());
                let local_addrs: Vec<SocketAddr> =
                    serde_json::from_str(&local_addrs_json).unwrap_or_default();

                Ok(Some(PeerInfo {
                    peer_id,
                    public_addr,
                    local_addrs,
                    quic_port,
                    is_host: is_host != 0,
                }))
            }
            None => Ok(None),
        }
    }

    /// Get host info for a room
    pub fn get_host(&self, join_code: &str) -> Result<Option<PeerInfo>, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let host_id: Option<String> = conn
            .query_row(
                "SELECT host_id FROM rooms WHERE join_code = ?1",
                params![join_code],
                |row| row.get(0),
            )
            .optional()?
            .flatten();

        drop(conn);

        match host_id {
            Some(id) => self.get_peer(&id),
            None => Ok(None),
        }
    }

    /// Get all peers in a room
    pub fn get_peers(&self, join_code: &str) -> Result<Vec<PeerInfo>, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let mut stmt = conn.prepare(
            "SELECT peer_id, public_addr, local_addrs, quic_port, is_host FROM peers WHERE join_code = ?1"
        )?;

        let peers = stmt.query_map(params![join_code], |row| {
            let peer_id: String = row.get(0)?;
            let public_addr: Option<String> = row.get(1)?;
            let local_addrs_json: String = row.get(2)?;
            let quic_port: u16 = row.get(3)?;
            let is_host: i32 = row.get(4)?;

            Ok((peer_id, public_addr, local_addrs_json, quic_port, is_host))
        })?;

        let result: Vec<PeerInfo> = peers
            .filter_map(|r| r.ok())
            .map(
                |(peer_id, public_addr, local_addrs_json, quic_port, is_host)| {
                    let public_addr: Option<SocketAddr> = public_addr.and_then(|s| s.parse().ok());
                    let local_addrs: Vec<SocketAddr> =
                        serde_json::from_str(&local_addrs_json).unwrap_or_default();

                    PeerInfo {
                        peer_id,
                        public_addr,
                        local_addrs,
                        quic_port,
                        is_host: is_host != 0,
                    }
                },
            )
            .collect();

        Ok(result)
    }

    /// Get peer count in a room
    pub fn peer_count(&self, join_code: &str) -> Result<usize, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM peers WHERE join_code = ?1",
            params![join_code],
            |row| row.get(0),
        )?;

        Ok(count as usize)
    }

    /// Clean up idle rooms older than the given threshold (in seconds)
    pub fn cleanup_idle_rooms(&self, idle_threshold_secs: u64) -> Result<usize, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;
        let threshold = current_timestamp() - (idle_threshold_secs as i64);

        // Get rooms to delete
        let mut stmt = conn.prepare("SELECT join_code FROM rooms WHERE last_activity < ?1")?;
        let codes: Vec<String> = stmt
            .query_map(params![threshold], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let count = codes.len();

        // Delete peers first
        conn.execute("DELETE FROM peers WHERE join_code IN (SELECT join_code FROM rooms WHERE last_activity < ?1)", params![threshold])?;
        // Delete rooms
        conn.execute(
            "DELETE FROM rooms WHERE last_activity < ?1",
            params![threshold],
        )?;

        if count > 0 {
            info!("Cleaned up {} idle rooms", count);
        }

        Ok(count)
    }

    /// Get total room count
    pub fn room_count(&self) -> Result<usize, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM rooms", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    /// Get total peer count
    pub fn total_peer_count(&self) -> Result<usize, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM peers", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    /// Load all rooms (for server restart recovery)
    pub fn load_all_rooms(&self) -> Result<Vec<String>, StorageError> {
        let conn = self.conn.lock().map_err(|_| StorageError::LockPoisoned)?;

        let mut stmt = conn.prepare("SELECT join_code FROM rooms")?;
        let codes: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(codes)
    }
}

/// Get current Unix timestamp
fn current_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Storage errors
#[derive(Debug)]
pub enum StorageError {
    Database(rusqlite::Error),
    /// Mutex lock was poisoned (indicates a panic occurred while holding the lock)
    LockPoisoned,
}

impl From<rusqlite::Error> for StorageError {
    fn from(e: rusqlite::Error) -> Self {
        error!("Database error: {:?}", e);
        StorageError::Database(e)
    }
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::Database(e) => write!(f, "Database error: {}", e),
            StorageError::LockPoisoned => {
                write!(f, "Lock poisoned: a thread panicked while holding the lock")
            }
        }
    }
}

impl std::error::Error for StorageError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_creation() {
        let storage = Storage::in_memory().unwrap();
        assert_eq!(storage.room_count().unwrap(), 0);
    }

    #[test]
    fn test_room_operations() {
        let storage = Storage::in_memory().unwrap();

        // Create room
        storage.create_room("ABC-123").unwrap();
        assert!(storage.room_exists("ABC-123").unwrap());
        assert!(!storage.room_exists("XYZ-789").unwrap());

        // Delete room
        storage.delete_room("ABC-123").unwrap();
        assert!(!storage.room_exists("ABC-123").unwrap());
    }

    #[test]
    fn test_peer_operations() {
        let storage = Storage::in_memory().unwrap();

        // Create room and add peer
        storage.create_room("ABC-123").unwrap();

        let peer = PeerInfo {
            peer_id: "peer1".into(),
            public_addr: Some("127.0.0.1:4433".parse().unwrap()),
            local_addrs: vec![],
            quic_port: 4433,
            is_host: true,
        };

        storage.add_peer("ABC-123", &peer).unwrap();

        // Get peer
        let loaded = storage.get_peer("peer1").unwrap().unwrap();
        assert_eq!(loaded.peer_id, "peer1");
        assert!(loaded.is_host);

        // Get host
        let host = storage.get_host("ABC-123").unwrap().unwrap();
        assert_eq!(host.peer_id, "peer1");

        // Remove peer
        let code = storage.remove_peer("peer1").unwrap();
        assert_eq!(code, Some("ABC-123".into()));
        assert!(storage.get_peer("peer1").unwrap().is_none());
    }

    #[test]
    fn test_peer_count() {
        let storage = Storage::in_memory().unwrap();
        storage.create_room("ABC-123").unwrap();

        assert_eq!(storage.peer_count("ABC-123").unwrap(), 0);

        let peer1 = PeerInfo {
            peer_id: "peer1".into(),
            public_addr: None,
            local_addrs: vec![],
            quic_port: 4433,
            is_host: true,
        };

        let peer2 = PeerInfo {
            peer_id: "peer2".into(),
            public_addr: None,
            local_addrs: vec![],
            quic_port: 4433,
            is_host: false,
        };

        storage.add_peer("ABC-123", &peer1).unwrap();
        storage.add_peer("ABC-123", &peer2).unwrap();

        assert_eq!(storage.peer_count("ABC-123").unwrap(), 2);
    }
}
