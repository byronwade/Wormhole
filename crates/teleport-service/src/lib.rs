//! Shared Wormhole session API — single source of truth for CLI, MCP, and desktop.
//!
//! Feature surface mirrors Tauri commands: host, mount/probe, status, doctor,
//! generate code, list directory, cache helpers.

mod control;
mod doctor;
mod parity;
mod session;

pub use control::{
    call_unix, default_socket_path, handle_request, serve_unix, ControlRequest, ControlResponse,
};
pub use doctor::{DoctorReport, DoctorStatus};
pub use parity::{FeatureSurface, FEATURE_SURFACE};
pub use session::{
    CacheStats, DirListingEntry, HostSessionInfo, MountSessionInfo, ProbeResult, SessionError,
    SessionManager, SessionStatus, StartHostRequest, StartMountRequest,
};
