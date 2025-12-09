# Wormhole Testing Strategy

## Overview

This document defines the comprehensive testing approach for Project Wormhole across all 7 phases, ensuring quality, reliability, and performance.

---

## Test Pyramid

```
                    ┌───────────────┐
                    │   E2E Tests   │  ~10% (slow, high coverage)
                    │   (Tauri UI)  │
                   ─┴───────────────┴─
                  ┌───────────────────┐
                  │ Integration Tests │  ~30% (cross-crate)
                  │ (Phase transitions)│
                 ─┴───────────────────┴─
                ┌───────────────────────┐
                │     Unit Tests        │  ~60% (fast, isolated)
                │  (Per-module logic)   │
               ─┴───────────────────────┴─
```

---

## Unit Testing

### Coverage Targets

| Crate | Target | Critical Paths |
|-------|--------|----------------|
| teleport-core | 90% | Protocol serialization, PAKE |
| teleport-daemon | 80% | Path sanitization, cache logic |
| teleport-signal | 85% | Room management, DB queries |

### Example: Protocol Tests

```rust
// crates/teleport-core/src/protocol.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_net_message_roundtrip() {
        let messages = vec![
            NetMessage::Handshake {
                version: 7,
                client_id: "test-client".to_string(),
            },
            NetMessage::ListRequest,
            NetMessage::ReadRequest {
                path: "dir/file.txt".to_string(),
                offset: 1024,
                len: 4096,
            },
            NetMessage::LockRequest {
                path: "file.txt".to_string(),
                lock_type: LockType::Exclusive,
                client_id: "client-1".to_string(),
            },
        ];

        for msg in messages {
            let encoded = bincode::serialize(&msg).unwrap();
            let decoded: NetMessage = bincode::deserialize(&encoded).unwrap();
            assert_eq!(format!("{:?}", msg), format!("{:?}", decoded));
        }
    }

    #[test]
    fn test_dir_entry_serialization() {
        let entry = DirEntry {
            name: "test.txt".to_string(),
            is_dir: false,
            size: 1024,
            modified: 1704067200,
            children: vec![],
        };

        let encoded = bincode::serialize(&entry).unwrap();
        assert!(encoded.len() < 100); // Compact serialization
    }
}
```

### Example: Cache Tests

```rust
// crates/teleport-daemon/src/cache.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_lru_eviction() {
        let cache = RamCache::new(3); // Capacity of 3 chunks

        // Fill cache
        for i in 0..3 {
            cache.insert(chunk_id(i), vec![i as u8; 128]);
        }

        // All should be present
        assert!(cache.contains(&chunk_id(0)));
        assert!(cache.contains(&chunk_id(1)));
        assert!(cache.contains(&chunk_id(2)));

        // Add one more, should evict oldest (0)
        cache.insert(chunk_id(3), vec![3u8; 128]);

        assert!(!cache.contains(&chunk_id(0))); // Evicted
        assert!(cache.contains(&chunk_id(1)));
        assert!(cache.contains(&chunk_id(2)));
        assert!(cache.contains(&chunk_id(3)));
    }

    #[tokio::test]
    async fn test_lru_promotion() {
        let cache = RamCache::new(3);

        cache.insert(chunk_id(0), vec![0u8; 128]);
        cache.insert(chunk_id(1), vec![1u8; 128]);
        cache.insert(chunk_id(2), vec![2u8; 128]);

        // Access chunk 0 to promote it
        let _ = cache.get(&chunk_id(0));

        // Add new chunk, should evict 1 (oldest after promotion)
        cache.insert(chunk_id(3), vec![3u8; 128]);

        assert!(cache.contains(&chunk_id(0))); // Promoted, still here
        assert!(!cache.contains(&chunk_id(1))); // Evicted
        assert!(cache.contains(&chunk_id(2)));
        assert!(cache.contains(&chunk_id(3)));
    }

    fn chunk_id(index: u64) -> ChunkId {
        ChunkId {
            file_path: "test.bin".to_string(),
            chunk_index: index,
        }
    }
}
```

### Example: Path Sanitization Tests

```rust
// crates/teleport-daemon/src/host.rs

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_safe_path_blocks_traversal() {
        let root = tempdir().unwrap();

        // Create a legitimate file
        std::fs::write(root.path().join("legit.txt"), "ok").unwrap();

        // These should all be blocked
        let attacks = vec![
            "../etc/passwd",
            "..\\windows\\system32",
            "foo/../../../etc/passwd",
            "/etc/passwd",
            "C:\\Windows\\System32",
            "foo\x00bar",
            "....//....//etc/passwd",
        ];

        for attack in attacks {
            assert!(
                safe_path(root.path(), attack).is_none(),
                "Should block: {}",
                attack
            );
        }

        // This should work
        assert!(safe_path(root.path(), "legit.txt").is_some());
    }

    #[test]
    fn test_safe_path_allows_nested() {
        let root = tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("a/b/c")).unwrap();
        std::fs::write(root.path().join("a/b/c/file.txt"), "test").unwrap();

        assert!(safe_path(root.path(), "a/b/c/file.txt").is_some());
    }

    #[test]
    fn test_safe_path_blocks_symlink_escape() {
        let root = tempdir().unwrap();
        let outside = tempdir().unwrap();

        // Create symlink pointing outside root
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();

        // Should block access via symlink
        assert!(safe_path(root.path(), "escape").is_none());
    }
}
```

---

## Integration Testing

### Phase Transition Tests

```rust
// tests/integration/phase_transitions.rs

use teleport_daemon::*;
use tempfile::tempdir;
use tokio::time::{timeout, Duration};

/// Test that Phase 2 reads work after Phase 1 mount
#[tokio::test]
async fn test_phase1_to_phase2_reads() {
    let host_dir = tempdir().unwrap();
    let mount_dir = tempdir().unwrap();

    // Create test file hierarchy
    std::fs::create_dir_all(host_dir.path().join("subdir")).unwrap();
    std::fs::write(
        host_dir.path().join("subdir/test.txt"),
        "Phase 2 read test content",
    )
    .unwrap();

    // Start host (Phase 1)
    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 16000)
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(100)).await;

    // Mount (Phase 1)
    let (mut events, mount_handle) = start_mount_service(
        "127.0.0.1:16000".parse().unwrap(),
        mount_dir.path().to_path_buf(),
    )
    .await
    .unwrap();

    // Wait for mount ready
    wait_for_mount(&mut events).await;

    // Phase 2: Read file content
    let content = tokio::fs::read_to_string(mount_dir.path().join("subdir/test.txt"))
        .await
        .unwrap();

    assert_eq!(content, "Phase 2 read test content");

    // Cleanup
    mount_handle.shutdown();
    host_handle.shutdown();
}

/// Test that Phase 3 caching improves repeat reads
#[tokio::test]
async fn test_phase3_cache_speedup() {
    let host_dir = tempdir().unwrap();
    let mount_dir = tempdir().unwrap();

    // Create 1MB test file
    let data: Vec<u8> = (0..1_000_000).map(|i| (i % 256) as u8).collect();
    std::fs::write(host_dir.path().join("large.bin"), &data).unwrap();

    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 16001)
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(100)).await;

    let (mut events, mount_handle) = start_mount_service(
        "127.0.0.1:16001".parse().unwrap(),
        mount_dir.path().to_path_buf(),
    )
    .await
    .unwrap();

    wait_for_mount(&mut events).await;

    // First read (uncached)
    let start = std::time::Instant::now();
    let _ = std::fs::read(mount_dir.path().join("large.bin")).unwrap();
    let first_read = start.elapsed();

    // Second read (should be cached)
    let start = std::time::Instant::now();
    let _ = std::fs::read(mount_dir.path().join("large.bin")).unwrap();
    let second_read = start.elapsed();

    // Cached read should be significantly faster
    assert!(
        second_read < first_read / 2,
        "Cached read ({:?}) should be much faster than uncached ({:?})",
        second_read,
        first_read
    );

    mount_handle.shutdown();
    host_handle.shutdown();
}

/// Test Phase 7 write + read consistency
#[tokio::test]
async fn test_phase7_write_read_consistency() {
    let host_dir = tempdir().unwrap();
    let mount_dir = tempdir().unwrap();

    // Create empty file
    std::fs::write(host_dir.path().join("writable.txt"), "").unwrap();

    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 16002)
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(100)).await;

    let (mut events, mount_handle) = start_mount_service(
        "127.0.0.1:16002".parse().unwrap(),
        mount_dir.path().to_path_buf(),
    )
    .await
    .unwrap();

    wait_for_mount(&mut events).await;

    // Write via mount
    let test_content = "Written through FUSE mount!";
    tokio::fs::write(mount_dir.path().join("writable.txt"), test_content)
        .await
        .unwrap();

    // Wait for sync
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Read back from host directly
    let host_content = std::fs::read_to_string(host_dir.path().join("writable.txt")).unwrap();

    assert_eq!(host_content, test_content);

    mount_handle.shutdown();
    host_handle.shutdown();
}

async fn wait_for_mount(events: &mut broadcast::Receiver<ServiceEvent>) {
    timeout(Duration::from_secs(10), async {
        while let Ok(event) = events.recv().await {
            if matches!(event, ServiceEvent::MountReady { .. }) {
                return;
            }
        }
    })
    .await
    .expect("Mount timed out");
}
```

---

## End-to-End Testing

### Tauri UI Tests

```typescript
// apps/teleport-ui/tests/e2e/host-connect.spec.ts

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';

let tauriProcess: ChildProcess;

test.beforeAll(async () => {
  // Build and start Tauri app
  tauriProcess = spawn('pnpm', ['tauri', 'dev'], {
    cwd: process.cwd(),
    env: { ...process.env, TAURI_DEV: '1' },
  });

  // Wait for app to start
  await new Promise((resolve) => setTimeout(resolve, 10000));
});

test.afterAll(async () => {
  tauriProcess?.kill();
});

test('can start hosting a folder', async ({ page }) => {
  await page.goto('tauri://localhost');

  // Click Host tab
  await page.click('text=Host');

  // Select folder (mock native dialog)
  await page.fill('input[placeholder*="path"]', '/tmp/test-share');

  // Click Start Hosting
  await page.click('text=Start Hosting');

  // Should show join code
  await expect(page.locator('code')).toContainText(/[A-Z0-9]{4}-/);
});

test('can connect with join code', async ({ page }) => {
  await page.goto('tauri://localhost');

  // Click Connect tab
  await page.click('text=Connect');

  // Enter join code
  await page.fill('input[placeholder*="XXXX"]', 'TEST-CODE-1234-ABCD');

  // Enter mount point
  await page.fill('input[placeholder*="mnt"]', '/tmp/test-mount');

  // Click Connect
  await page.click('text=Connect');

  // Should show connecting status
  await expect(page.locator('text=Connecting')).toBeVisible({ timeout: 5000 });
});
```

---

## Stress Testing

### Large File Test

```rust
// tests/stress/large_files.rs

use teleport_daemon::*;
use tempfile::tempdir;
use sha2::{Sha256, Digest};

/// Test transferring a 10GB file
#[tokio::test]
#[ignore] // Run with: cargo test --release -- --ignored
async fn test_10gb_file_transfer() {
    let host_dir = tempdir().unwrap();
    let mount_dir = tempdir().unwrap();

    // Create 10GB file
    let file_path = host_dir.path().join("large.bin");
    let mut file = std::fs::File::create(&file_path).unwrap();

    let chunk: Vec<u8> = (0..1_000_000).map(|i| (i % 256) as u8).collect();
    for _ in 0..10_000 {
        std::io::Write::write_all(&mut file, &chunk).unwrap();
    }
    drop(file);

    // Calculate source hash
    let source_hash = hash_file(&file_path);

    // Setup host/mount
    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 17000)
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(500)).await;

    let (mut events, mount_handle) = start_mount_service(
        "127.0.0.1:17000".parse().unwrap(),
        mount_dir.path().to_path_buf(),
    )
    .await
    .unwrap();

    wait_for_mount(&mut events).await;

    // Read through mount and hash
    let mounted_path = mount_dir.path().join("large.bin");
    let dest_hash = hash_file(&mounted_path);

    assert_eq!(source_hash, dest_hash, "File hash mismatch after transfer");

    mount_handle.shutdown();
    host_handle.shutdown();
}

fn hash_file(path: &std::path::Path) -> String {
    let mut file = std::fs::File::open(path).unwrap();
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).unwrap();
    hex::encode(hasher.finalize())
}
```

### Many Files Test

```rust
// tests/stress/many_files.rs

/// Test with 1 million files
#[tokio::test]
#[ignore]
async fn test_1m_files() {
    let host_dir = tempdir().unwrap();
    let mount_dir = tempdir().unwrap();

    // Create 1M files in 1000 directories
    println!("Creating 1M files...");
    for dir_i in 0..1000 {
        let dir_path = host_dir.path().join(format!("dir_{:04}", dir_i));
        std::fs::create_dir(&dir_path).unwrap();

        for file_i in 0..1000 {
            let file_path = dir_path.join(format!("file_{:04}.txt", file_i));
            std::fs::write(&file_path, format!("Content {}-{}", dir_i, file_i)).unwrap();
        }

        if dir_i % 100 == 0 {
            println!("Created {} directories...", dir_i);
        }
    }

    println!("Starting host...");
    let start = std::time::Instant::now();

    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 17001)
        .await
        .unwrap();

    println!("Host started in {:?}", start.elapsed());

    tokio::time::sleep(Duration::from_millis(500)).await;

    println!("Mounting...");
    let start = std::time::Instant::now();

    let (mut events, mount_handle) = start_mount_service(
        "127.0.0.1:17001".parse().unwrap(),
        mount_dir.path().to_path_buf(),
    )
    .await
    .unwrap();

    wait_for_mount(&mut events).await;

    println!("Mount ready in {:?}", start.elapsed());

    // Verify we can list all directories
    let start = std::time::Instant::now();
    let entries: Vec<_> = std::fs::read_dir(mount_dir.path())
        .unwrap()
        .collect();

    println!("Listed {} dirs in {:?}", entries.len(), start.elapsed());
    assert_eq!(entries.len(), 1000);

    // Random access test
    let start = std::time::Instant::now();
    let content = std::fs::read_to_string(
        mount_dir.path().join("dir_0500/file_0500.txt")
    ).unwrap();

    println!("Random read in {:?}", start.elapsed());
    assert_eq!(content, "Content 500-500");

    mount_handle.shutdown();
    host_handle.shutdown();
}
```

### Concurrent Clients Test

```rust
// tests/stress/concurrent_clients.rs

/// Test 100 concurrent client connections
#[tokio::test]
#[ignore]
async fn test_100_concurrent_clients() {
    let host_dir = tempdir().unwrap();

    // Create test file
    std::fs::write(host_dir.path().join("shared.txt"), "Shared content").unwrap();

    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 17002)
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(500)).await;

    // Spawn 100 clients
    let mut handles = vec![];

    for i in 0..100 {
        let handle = tokio::spawn(async move {
            let mount_dir = tempdir().unwrap();

            let result = start_mount_service(
                "127.0.0.1:17002".parse().unwrap(),
                mount_dir.path().to_path_buf(),
            )
            .await;

            match result {
                Ok((mut events, mount_handle)) => {
                    // Wait for mount with timeout
                    let mount_result = tokio::time::timeout(
                        Duration::from_secs(30),
                        async {
                            while let Ok(event) = events.recv().await {
                                if matches!(event, ServiceEvent::MountReady { .. }) {
                                    return true;
                                }
                            }
                            false
                        },
                    )
                    .await;

                    if mount_result.unwrap_or(false) {
                        // Read file
                        let content = std::fs::read_to_string(
                            mount_dir.path().join("shared.txt")
                        );
                        mount_handle.shutdown();
                        content.is_ok()
                    } else {
                        mount_handle.shutdown();
                        false
                    }
                }
                Err(_) => false,
            }
        });

        handles.push(handle);
    }

    // Wait for all clients
    let results: Vec<_> = futures::future::join_all(handles)
        .await
        .into_iter()
        .map(|r| r.unwrap_or(false))
        .collect();

    let successes = results.iter().filter(|&&x| x).count();
    println!("{}/100 clients succeeded", successes);

    // At least 90% should succeed
    assert!(successes >= 90, "Only {}/100 clients succeeded", successes);

    host_handle.shutdown();
}
```

---

## Performance Benchmarks

### Benchmark Suite

```rust
// benches/transfer_benchmark.rs

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};

fn benchmark_read_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("read_sizes");

    for size in [4096, 65536, 131072, 1048576].iter() {
        group.bench_with_input(
            BenchmarkId::new("sequential", size),
            size,
            |b, &size| {
                // Setup: create file, mount, etc.
                b.iter(|| {
                    // Read 'size' bytes from mounted file
                    black_box(read_bytes(size))
                });
            },
        );
    }

    group.finish();
}

fn benchmark_metadata_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("metadata");

    group.bench_function("stat", |b| {
        b.iter(|| {
            black_box(stat_file())
        });
    });

    group.bench_function("readdir_100", |b| {
        b.iter(|| {
            black_box(readdir_100())
        });
    });

    group.bench_function("readdir_10000", |b| {
        b.iter(|| {
            black_box(readdir_10000())
        });
    });

    group.finish();
}

criterion_group!(benches, benchmark_read_sizes, benchmark_metadata_operations);
criterion_main!(benches);
```

---

## Test Fixtures

### Shared Test Utilities

```rust
// tests/common/mod.rs

use teleport_daemon::*;
use tempfile::TempDir;
use tokio::sync::broadcast;
use tokio::time::{timeout, Duration};

pub struct TestFixture {
    pub host_dir: TempDir,
    pub mount_dir: TempDir,
    pub host_handle: ShutdownHandle,
    pub mount_handle: ShutdownHandle,
    pub events: broadcast::Receiver<ServiceEvent>,
}

impl TestFixture {
    pub async fn new(port: u16) -> Self {
        let host_dir = tempfile::tempdir().unwrap();
        let mount_dir = tempfile::tempdir().unwrap();

        let (_, host_handle) = start_host_service(
            host_dir.path().to_path_buf(),
            port,
        )
        .await
        .unwrap();

        tokio::time::sleep(Duration::from_millis(100)).await;

        let (events, mount_handle) = start_mount_service(
            format!("127.0.0.1:{}", port).parse().unwrap(),
            mount_dir.path().to_path_buf(),
        )
        .await
        .unwrap();

        Self {
            host_dir,
            mount_dir,
            host_handle,
            mount_handle,
            events,
        }
    }

    pub async fn wait_for_mount(&mut self) {
        timeout(Duration::from_secs(10), async {
            while let Ok(event) = self.events.recv().await {
                if matches!(event, ServiceEvent::MountReady { .. }) {
                    return;
                }
            }
        })
        .await
        .expect("Mount timed out");
    }

    pub fn create_file(&self, name: &str, content: &[u8]) {
        std::fs::write(self.host_dir.path().join(name), content).unwrap();
    }

    pub fn read_mounted(&self, name: &str) -> Vec<u8> {
        std::fs::read(self.mount_dir.path().join(name)).unwrap()
    }
}

impl Drop for TestFixture {
    fn drop(&mut self) {
        self.mount_handle.shutdown();
        self.host_handle.shutdown();
    }
}
```

---

## CI Configuration

### GitHub Actions Test Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  unit-tests:
    name: Unit Tests
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        rust: [stable]

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install FUSE (Linux)
        if: runner.os == 'Linux'
        run: sudo apt-get install -y libfuse3-dev

      - name: Install macFUSE (macOS)
        if: runner.os == 'macOS'
        run: |
          brew install --cask macfuse
          # Note: Kernel extension approval needed manually

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: Run unit tests
        run: cargo nextest run --lib --bins

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: unit-tests

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install FUSE
        run: sudo apt-get install -y libfuse3-dev fuse3

      - name: Enable FUSE for user
        run: |
          sudo modprobe fuse
          sudo chmod 666 /dev/fuse

      - name: Run integration tests
        run: cargo nextest run --test '*'

  stress-tests:
    name: Stress Tests
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install FUSE
        run: sudo apt-get install -y libfuse3-dev fuse3

      - name: Run stress tests
        run: cargo test --release -- --ignored --test-threads=1
        timeout-minutes: 60

  coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    needs: unit-tests

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          components: llvm-tools-preview

      - name: Install FUSE
        run: sudo apt-get install -y libfuse3-dev

      - name: Install cargo-llvm-cov
        run: cargo install cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --all-features --lcov --output-path lcov.info

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: lcov.info
          fail_ci_if_error: true
```

---

## Test Checklist by Phase

### Phase 1
- [ ] QUIC handshake succeeds
- [ ] Metadata serialization roundtrips
- [ ] Directory scan captures all entries
- [ ] VFS inode allocation is unique
- [ ] FUSE mount succeeds
- [ ] ls/stat operations work

### Phase 2
- [ ] File read returns correct content
- [ ] Large file read (>chunk size) works
- [ ] Path traversal is blocked
- [ ] Non-existent file returns ENOENT
- [ ] Permission denied handled

### Phase 3
- [ ] Sequential access triggers prefetch
- [ ] Random access doesn't prefetch
- [ ] Cache hit improves read speed
- [ ] LRU eviction works correctly

### Phase 4
- [ ] Disk cache persists across restart
- [ ] Orphan cleanup works
- [ ] GC runs and frees space
- [ ] Hybrid cache promotes disk→RAM

### Phase 5
- [ ] Tauri app starts
- [ ] Host/Connect tabs work
- [ ] System tray functions
- [ ] Events flow to UI

### Phase 6
- [ ] STUN returns public IP
- [ ] Signal server routes messages
- [ ] PAKE derives matching keys
- [ ] Hole punching succeeds (LAN)
- [ ] Join codes work end-to-end

### Phase 7
- [ ] Write persists to host
- [ ] Lock prevents concurrent write
- [ ] Lock expires after TTL
- [ ] File creation works
- [ ] File deletion works
- [ ] Truncate works
