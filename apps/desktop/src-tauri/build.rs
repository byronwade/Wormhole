use std::fs;
use std::path::Path;

fn main() {
    // `tauri::generate_context!` requires frontendDist to exist at compile time.
    // CI / cargo test may run before `pnpm build`, so stub a minimal dist.
    let dist = Path::new("../dist");
    if !dist.exists() {
        let _ = fs::create_dir_all(dist);
        let _ = fs::write(
            dist.join("index.html"),
            "<!doctype html><html><body>Wormhole</body></html>\n",
        );
    }

    tauri_build::build();

    // WinFSP requires delayload on Windows
    #[cfg(windows)]
    winfsp::build::winfsp_link_delayload();
}
