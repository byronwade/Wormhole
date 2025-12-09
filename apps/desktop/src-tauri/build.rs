fn main() {
    tauri_build::build();

    // WinFSP requires delayload on Windows
    #[cfg(windows)]
    winfsp::build::winfsp_link_delayload();
}
