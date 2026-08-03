//! OS shell integrations: Finder/Explorer/file-manager "Share with Wormhole".
//!
//! Installs lightweight context-menu / desktop-entry hooks that launch the app
//! with `--share <path>` or the `wormhole://share?path=` deep link.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct ShellIntegrationStatus {
    pub installed: bool,
    pub detail: String,
}

/// Resolve the current executable path for shell hooks.
fn exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("Failed to resolve app path: {e}"))
}

/// Install platform shell integration for sharing folders from the OS.
#[tauri::command]
pub fn install_shell_integration() -> Result<ShellIntegrationStatus, String> {
    let exe = exe_path()?;
    #[cfg(target_os = "linux")]
    {
        install_linux(&exe)?;
        return Ok(ShellIntegrationStatus {
            installed: true,
            detail: "Added “Share with Wormhole” to the applications menu (inode/directory)."
                .into(),
        });
    }
    #[cfg(target_os = "macos")]
    {
        install_macos(&exe)?;
        return Ok(ShellIntegrationStatus {
            installed: true,
            detail: "Installed “Share with Wormhole” service under ~/Library/Services.".into(),
        });
    }
    #[cfg(target_os = "windows")]
    {
        install_windows(&exe)?;
        return Ok(ShellIntegrationStatus {
            installed: true,
            detail: "Added Explorer folder context menu “Share with Wormhole”.".into(),
        });
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = exe;
        Err("Shell integration is not supported on this platform".into())
    }
}

/// Remove previously installed shell integration.
#[tauri::command]
pub fn uninstall_shell_integration() -> Result<ShellIntegrationStatus, String> {
    #[cfg(target_os = "linux")]
    {
        uninstall_linux()?;
        return Ok(ShellIntegrationStatus {
            installed: false,
            detail: "Removed Wormhole share desktop entry.".into(),
        });
    }
    #[cfg(target_os = "macos")]
    {
        uninstall_macos()?;
        return Ok(ShellIntegrationStatus {
            installed: false,
            detail: "Removed Wormhole share service.".into(),
        });
    }
    #[cfg(target_os = "windows")]
    {
        uninstall_windows()?;
        return Ok(ShellIntegrationStatus {
            installed: false,
            detail: "Removed Explorer Wormhole context menu.".into(),
        });
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Err("Shell integration is not supported on this platform".into())
    }
}

/// Whether shell integration appears installed.
#[tauri::command]
pub fn shell_integration_status() -> Result<ShellIntegrationStatus, String> {
    #[cfg(target_os = "linux")]
    {
        let path = linux_desktop_path();
        let installed = path.exists();
        return Ok(ShellIntegrationStatus {
            installed,
            detail: if installed {
                format!("Installed at {}", path.display())
            } else {
                "Not installed".into()
            },
        });
    }
    #[cfg(target_os = "macos")]
    {
        let path = macos_service_path();
        let installed = path.exists();
        return Ok(ShellIntegrationStatus {
            installed,
            detail: if installed {
                format!("Installed at {}", path.display())
            } else {
                "Not installed".into()
            },
        });
    }
    #[cfg(target_os = "windows")]
    {
        let installed = windows_key_exists();
        return Ok(ShellIntegrationStatus {
            installed,
            detail: if installed {
                "Explorer context menu registered".into()
            } else {
                "Not installed".into()
            },
        });
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Ok(ShellIntegrationStatus {
            installed: false,
            detail: "Unsupported platform".into(),
        })
    }
}

#[cfg(target_os = "linux")]
fn linux_desktop_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".local/share/applications/wormhole-share-folder.desktop")
}

#[cfg(target_os = "linux")]
fn install_linux(exe: &Path) -> Result<(), String> {
    let path = linux_desktop_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let content = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Share with Wormhole\n\
         Comment=Share this folder over a Wormhole portal\n\
         Exec=\"{}\" --share %f\n\
         MimeType=inode/directory;\n\
         NoDisplay=false\n\
         Terminal=false\n\
         Categories=Utility;Network;\n",
        exe.display()
    );
    fs::write(&path, content).map_err(|e| format!("write desktop entry: {e}"))?;
    // Best-effort refresh of desktop database
    let _ = std::process::Command::new("update-desktop-database")
        .arg(path.parent().unwrap_or(Path::new(".")))
        .status();
    Ok(())
}

#[cfg(target_os = "linux")]
fn uninstall_linux() -> Result<(), String> {
    let path = linux_desktop_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("remove desktop entry: {e}"))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_service_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join("Library/Services/Share with Wormhole.workflow")
}

#[cfg(target_os = "macos")]
fn install_macos(exe: &Path) -> Result<(), String> {
    let workflow = macos_service_path();
    let contents = workflow.join("Contents");
    fs::create_dir_all(&contents).map_err(|e| format!("mkdir service: {e}"))?;

    let info = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>io.wormhole.share-service</string>
  <key>CFBundleName</key>
  <string>Share with Wormhole</string>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>Share with Wormhole</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict>
        <key>NSApplicationIdentifier</key>
        <string>com.apple.finder</string>
      </dict>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.folder</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
"#
    );
    fs::write(contents.join("Info.plist"), info).map_err(|e| format!("Info.plist: {e}"))?;

    // Automator workflow: Run Shell Script with paths
    let wflow = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key>
  <string>523</string>
  <key>AMApplicationVersion</key>
  <string>2.10</string>
  <key>AMDocumentVersion</key>
  <string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key>
        <string>Run Shell Script</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key>
          <string>for f in "$@"; do "{exe}" --share "$f"; done</string>
          <key>CheckedForUserDefaultShell</key>
          <true/>
          <key>inputMethod</key>
          <integer>1</integer>
          <key>shell</key>
          <string>/bin/zsh</string>
          <key>source</key>
          <string></string>
        </dict>
      </dict>
    </dict>
  </array>
  <key>connectors</key>
  <dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.fileSystemObject.folder</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceApplicationBundleID</key>
    <string>com.apple.finder</string>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
"#,
        exe = exe.display()
    );
    fs::write(contents.join("document.wflow"), wflow)
        .map_err(|e| format!("document.wflow: {e}"))?;

    // Refresh Services menu
    let _ = std::process::Command::new("/System/Library/CoreServices/pbs")
        .arg("-flush")
        .status();
    Ok(())
}

#[cfg(target_os = "macos")]
fn uninstall_macos() -> Result<(), String> {
    let path = macos_service_path();
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| format!("remove service: {e}"))?;
        let _ = std::process::Command::new("/System/Library/CoreServices/pbs")
            .arg("-flush")
            .status();
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_key_exists() -> bool {
    use std::os::windows::process::CommandExt;
    // Query via reg.exe to avoid winreg crate dependency
    std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Classes\Directory\shell\WormholeShare",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn install_windows(exe: &Path) -> Result<(), String> {
    let exe_str = exe.to_string_lossy().replace('/', "\\");
    let command = format!("\"{}\" --share \"%1\"", exe_str);
    run_reg(&[
        "add",
        r"HKCU\Software\Classes\Directory\shell\WormholeShare",
        "/ve",
        "/d",
        "Share with Wormhole",
        "/f",
    ])?;
    run_reg(&[
        "add",
        r"HKCU\Software\Classes\Directory\shell\WormholeShare\command",
        "/ve",
        "/d",
        &command,
        "/f",
    ])?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn uninstall_windows() -> Result<(), String> {
    let _ = run_reg(&[
        "delete",
        r"HKCU\Software\Classes\Directory\shell\WormholeShare",
        "/f",
    ]);
    Ok(())
}

#[cfg(target_os = "windows")]
fn run_reg(args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let status = std::process::Command::new("reg")
        .args(args)
        .creation_flags(0x08000000)
        .status()
        .map_err(|e| format!("reg failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("reg {:?} exited with {}", args, status))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_does_not_panic() {
        let _ = shell_integration_status();
    }
}
