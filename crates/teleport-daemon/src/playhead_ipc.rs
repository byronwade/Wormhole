//! Playhead hint IPC for NLE / external apps.
//!
//! On Unix: datagram socket at `data_local_dir/playhead.sock`.
//! Elsewhere (or as fallback): JSON file drop at `data_local_dir/playhead-hint.json`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Hint from an external editor: scrub/playhead position for prefetch.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlayheadHintMsg {
    pub inode: u64,
    pub offset: u64,
    #[serde(default)]
    pub ahead: Option<u64>,
    #[serde(default)]
    pub behind: Option<u64>,
}

fn data_local_dir() -> PathBuf {
    if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
        let dir = dirs.data_local_dir().to_path_buf();
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }
    PathBuf::from(".")
}

/// Unix datagram path used by mounts listening for playhead hints.
pub fn socket_path() -> PathBuf {
    data_local_dir().join("playhead.sock")
}

/// File-drop path used on non-Unix or as a testable fallback.
pub fn hint_file_path() -> PathBuf {
    data_local_dir().join("playhead-hint.json")
}

/// Send a playhead hint to the local mount (socket on Unix, file elsewhere).
pub fn send_hint(msg: &PlayheadHintMsg) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::net::UnixDatagram;
        let path = socket_path();
        if path.exists() {
            if let Ok(sock) = UnixDatagram::unbound() {
                let bytes = serde_json::to_vec(msg).map_err(|e| e.to_string())?;
                if sock.send_to(&bytes, &path).is_ok() {
                    return Ok(());
                }
                // Stale socket file or no listener — fall through to file drop.
            }
        }
    }
    send_hint_file(&hint_file_path(), msg)
}

/// Write a hint JSON file (testable / non-Unix fallback).
pub fn send_hint_file(path: &Path, msg: &PlayheadHintMsg) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string(msg).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

/// Read and delete a hint file if present.
pub fn try_recv_file(path: &Path) -> Option<PlayheadHintMsg> {
    let data = std::fs::read_to_string(path).ok()?;
    let msg: PlayheadHintMsg = serde_json::from_str(&data).ok()?;
    let _ = std::fs::remove_file(path);
    Some(msg)
}

#[cfg(unix)]
/// Bind a non-blocking Unix datagram listener for playhead hints.
pub fn bind_listener() -> Result<std::os::unix::net::UnixDatagram, String> {
    use std::os::unix::net::UnixDatagram;
    let path = socket_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    let sock = UnixDatagram::bind(&path).map_err(|e| e.to_string())?;
    sock.set_nonblocking(true).map_err(|e| e.to_string())?;
    Ok(sock)
}

#[cfg(unix)]
/// Non-blocking receive of one playhead hint (or `None` if empty/error).
pub fn try_recv(sock: &std::os::unix::net::UnixDatagram) -> Option<PlayheadHintMsg> {
    let mut buf = [0u8; 4096];
    match sock.recv(&mut buf) {
        Ok(n) => serde_json::from_slice(&buf[..n]).ok(),
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => None,
        Err(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn file_hint_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("playhead-hint.json");
        let msg = PlayheadHintMsg {
            inode: 7,
            offset: 1310720,
            ahead: Some(4),
            behind: Some(2),
        };
        send_hint_file(&path, &msg).unwrap();
        let got = try_recv_file(&path).expect("hint file");
        assert_eq!(got, msg);
        assert!(try_recv_file(&path).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn unix_datagram_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("playhead.sock");
        let _ = std::fs::remove_file(&path);
        let listener = std::os::unix::net::UnixDatagram::bind(&path).unwrap();
        listener.set_nonblocking(true).unwrap();

        let msg = PlayheadHintMsg {
            inode: 1,
            offset: 0,
            ahead: Some(3),
            behind: None,
        };
        let client = std::os::unix::net::UnixDatagram::unbound().unwrap();
        let bytes = serde_json::to_vec(&msg).unwrap();
        client.send_to(&bytes, &path).unwrap();

        let got = try_recv(&listener).expect("datagram hint");
        assert_eq!(got.inode, 1);
        assert_eq!(got.ahead, Some(3));
        let _ = std::fs::remove_file(&path);
    }
}
