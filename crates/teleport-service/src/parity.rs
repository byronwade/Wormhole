//! Feature surface shared by desktop, CLI, and MCP — keep in sync.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeatureSurface {
    pub id: &'static str,
    pub desktop: bool,
    pub cli: bool,
    pub mcp: bool,
    pub description: &'static str,
}

/// Canonical feature matrix. CI asserts CLI + MCP cover every `desktop: true` row.
pub const FEATURE_SURFACE: &[FeatureSurface] = &[
    FeatureSurface {
        id: "host_start",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Start hosting a folder",
    },
    FeatureSurface {
        id: "host_stop",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Stop a host session",
    },
    FeatureSurface {
        id: "host_list",
        desktop: true,
        cli: true,
        mcp: true,
        description: "List active hosts",
    },
    FeatureSurface {
        id: "mount_start",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Mount / connect to a peer",
    },
    FeatureSurface {
        id: "mount_stop",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Disconnect a mount",
    },
    FeatureSurface {
        id: "mount_list",
        desktop: true,
        cli: true,
        mcp: true,
        description: "List active mounts",
    },
    FeatureSurface {
        id: "status",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Session status snapshot",
    },
    FeatureSurface {
        id: "probe_remote",
        desktop: true,
        cli: true,
        mcp: true,
        description: "QUIC data-plane list without FUSE",
    },
    FeatureSurface {
        id: "generate_code",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Generate join code",
    },
    FeatureSurface {
        id: "local_ips",
        desktop: true,
        cli: true,
        mcp: true,
        description: "List local IP addresses",
    },
    FeatureSurface {
        id: "list_directory",
        desktop: true,
        cli: true,
        mcp: true,
        description: "List a local directory",
    },
    FeatureSurface {
        id: "doctor",
        desktop: true,
        cli: true,
        mcp: true,
        description: "System readiness checks",
    },
    FeatureSurface {
        id: "cache_stats",
        desktop: false,
        cli: true,
        mcp: true,
        description: "Disk cache statistics",
    },
    FeatureSurface {
        id: "cache_clear",
        desktop: false,
        cli: true,
        mcp: true,
        description: "Clear disk cache",
    },
    FeatureSurface {
        id: "default_mount_path",
        desktop: true,
        cli: true,
        mcp: true,
        description: "Suggested mount path",
    },
    FeatureSurface {
        id: "playhead_hint",
        desktop: false,
        cli: true,
        mcp: true,
        description: "Send playhead scrub hint to local mount",
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_features_have_cli_and_mcp() {
        for f in FEATURE_SURFACE {
            if f.desktop {
                assert!(f.cli, "{} missing CLI", f.id);
                assert!(f.mcp, "{} missing MCP", f.id);
            }
        }
    }

    #[test]
    fn ids_unique() {
        let mut seen = std::collections::HashSet::new();
        for f in FEATURE_SURFACE {
            assert!(seen.insert(f.id), "duplicate {}", f.id);
        }
    }
}
