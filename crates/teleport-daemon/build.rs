//! Build script for teleport-daemon
//!
//! This script handles platform-specific build configuration:
//! - Windows: Sets up WinFSP delayload linking

fn main() {
    // WinFSP requires delayload on Windows because the DLL location
    // is determined at runtime via registry lookup
    #[cfg(windows)]
    winfsp::build::winfsp_link_delayload();
}
