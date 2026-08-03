//! Extreme E2E: multi-host, probe, mount lifecycle, parity surface.

use std::io::Write;
use std::sync::Arc;
use std::time::Duration;

use teleport_service::{SessionManager, StartHostRequest, StartMountRequest, FEATURE_SURFACE};
use tempfile::tempdir;

#[tokio::test]
async fn e2e_two_hosts_concurrent_probes() {
    let a = tempdir().unwrap();
    let b = tempdir().unwrap();
    std::fs::write(a.path().join("a.txt"), b"AAA").unwrap();
    std::fs::write(b.path().join("b.txt"), b"BBB").unwrap();

    let mgr = SessionManager::new_arc();
    let ha = mgr
        .start_host(StartHostRequest {
            id: Some("ha".into()),
            path: a.path().to_path_buf(),
            port: None,
            name: Some("host-a".into()),
        })
        .await
        .unwrap();
    let hb = mgr
        .start_host(StartHostRequest {
            id: Some("hb".into()),
            path: b.path().to_path_buf(),
            port: None,
            name: Some("host-b".into()),
        })
        .await
        .unwrap();

    assert_ne!(ha.port, hb.port);

    let pa = mgr
        .probe_remote(&format!("127.0.0.1:{}", ha.port))
        .await
        .unwrap();
    let pb = mgr
        .probe_remote(&format!("127.0.0.1:{}", hb.port))
        .await
        .unwrap();
    assert!(pa.entries.iter().any(|e| e.name == "a.txt"));
    assert!(pb.entries.iter().any(|e| e.name == "b.txt"));
    assert_eq!(pa.peer_name.as_deref(), Some("host-a"));

    mgr.stop_all().await;
    assert!(mgr.status().await.hosts.is_empty());
}

#[tokio::test]
async fn e2e_mount_data_plane_lifecycle() {
    let dir = tempdir().unwrap();
    let mut big = vec![0u8; 256 * 1024];
    for (i, b) in big.iter_mut().enumerate() {
        *b = (i % 251) as u8;
    }
    std::fs::File::create(dir.path().join("big.bin"))
        .unwrap()
        .write_all(&big)
        .unwrap();

    let mgr = Arc::new(SessionManager::new());
    let host = mgr
        .start_host(StartHostRequest {
            id: Some("big-host".into()),
            path: dir.path().to_path_buf(),
            port: None,
            name: None,
        })
        .await
        .unwrap();

    let target = format!("127.0.0.1:{}", host.port);
    let mount = mgr
        .start_mount(StartMountRequest {
            target: target.clone(),
            id: Some("m-big".into()),
            mount_point: None,
            data_plane_only: true,
        })
        .await
        .unwrap();
    assert!(mount.data_plane_only);

    // Stress: many concurrent probes
    let mut handles = Vec::new();
    for _ in 0..8 {
        let mgr = Arc::clone(&mgr);
        let target = target.clone();
        handles.push(tokio::spawn(async move {
            mgr.probe_remote(&target).await.expect("probe")
        }));
    }
    for h in handles {
        let probe = h.await.unwrap();
        assert!(probe.entries.iter().any(|e| e.name == "big.bin"));
    }

    mgr.stop_mount("m-big").await.unwrap();
    mgr.stop_host("big-host").await.unwrap();
}

#[tokio::test]
async fn e2e_duplicate_host_id_rejected() {
    let dir = tempdir().unwrap();
    let mgr = SessionManager::new();
    mgr.start_host(StartHostRequest {
        id: Some("dup".into()),
        path: dir.path().to_path_buf(),
        port: None,
        name: None,
    })
    .await
    .unwrap();
    let err = mgr
        .start_host(StartHostRequest {
            id: Some("dup".into()),
            path: dir.path().to_path_buf(),
            port: None,
            name: None,
        })
        .await
        .unwrap_err();
    assert!(err.to_string().contains("already active"));
    mgr.stop_all().await;
}

#[tokio::test]
async fn e2e_invalid_path_rejected() {
    let mgr = SessionManager::new();
    let err = mgr
        .start_host(StartHostRequest {
            id: None,
            path: std::path::PathBuf::from("/definitely/not/a/real/path-xyz"),
            port: None,
            name: None,
        })
        .await
        .unwrap_err();
    assert!(err.to_string().contains("Invalid path"));
}

#[test]
fn e2e_feature_parity_desktop_covered() {
    for f in FEATURE_SURFACE {
        if f.desktop {
            assert!(f.cli, "CLI missing {}", f.id);
            assert!(f.mcp, "MCP missing {}", f.id);
        }
    }
}

#[tokio::test]
async fn e2e_status_protocol_version() {
    let mgr = SessionManager::new();
    let status = mgr.status().await;
    assert_eq!(status.protocol_version, teleport_core::PROTOCOL_VERSION);
    tokio::time::sleep(Duration::from_millis(1)).await;
}
