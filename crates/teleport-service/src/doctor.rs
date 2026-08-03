//! System readiness checks (FUSE / platform).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoctorStatus {
    pub ok: bool,
    pub name: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoctorReport {
    pub checks: Vec<DoctorStatus>,
    pub ready: bool,
}

impl DoctorReport {
    pub fn run() -> Self {
        let mut checks = Vec::new();

        #[cfg(target_os = "linux")]
        {
            let fuse = std::path::Path::new("/dev/fuse").exists();
            checks.push(DoctorStatus {
                ok: fuse,
                name: "fuse_device".into(),
                detail: if fuse {
                    "/dev/fuse present".into()
                } else {
                    "Missing /dev/fuse — install libfuse3".into()
                },
            });
            let fusermount = which("fusermount3") || which("fusermount");
            checks.push(DoctorStatus {
                ok: fusermount,
                name: "fusermount".into(),
                detail: if fusermount {
                    "fusermount available".into()
                } else {
                    "fusermount3 not found".into()
                },
            });
        }

        #[cfg(target_os = "macos")]
        {
            let macfuse = std::path::Path::new("/Library/Filesystems/macfuse.fs").exists()
                || std::path::Path::new("/usr/local/lib/libfuse.dylib").exists();
            checks.push(DoctorStatus {
                ok: macfuse,
                name: "macfuse".into(),
                detail: if macfuse {
                    "macFUSE detected".into()
                } else {
                    "macFUSE not detected — install from https://osxfuse.github.io/".into()
                },
            });
        }

        #[cfg(windows)]
        {
            checks.push(DoctorStatus {
                ok: true,
                name: "winfsp".into(),
                detail: "Ensure WinFSP is installed for mounts".into(),
            });
        }

        checks.push(DoctorStatus {
            ok: true,
            name: "protocol".into(),
            detail: format!("protocol v{}", teleport_core::PROTOCOL_VERSION),
        });

        let udp_ok = std::net::UdpSocket::bind("127.0.0.1:0").is_ok();
        checks.push(DoctorStatus {
            ok: udp_ok,
            name: "udp_bind".into(),
            detail: if udp_ok {
                "Can bind UDP (QUIC)".into()
            } else {
                "Cannot bind UDP".into()
            },
        });

        let ready = checks.iter().all(|c| c.ok);
        Self { checks, ready }
    }
}

fn which(bin: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths).any(|dir| {
                let p = dir.join(bin);
                p.is_file()
            })
        })
        .unwrap_or(false)
}
