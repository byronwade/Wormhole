# Phase 8 — Notes

Research links, implementation notes, and follow-up ideas.

---

## Research Links

### io_uring

- **Official Documentation:** https://kernel.dk/io_uring.pdf
- **Lord of the io_uring:** https://unixism.net/loti/
- **io_uring by example:** https://github.com/shuveb/io_uring-by-example
- **Rust io-uring crate:** https://docs.rs/io-uring/latest/io_uring/
- **tokio-uring:** https://docs.rs/tokio-uring/latest/tokio_uring/

### BLAKE3

- **Official Spec:** https://github.com/BLAKE3-team/BLAKE3-specs
- **Rust Crate:** https://docs.rs/blake3/latest/blake3/
- **Performance Comparison:** https://github.com/BLAKE3-team/BLAKE3#performance
- **SIMD Implementations:** Built into the crate, auto-detected

### QUIC

- **RFC 9000 (QUIC):** https://datatracker.ietf.org/doc/html/rfc9000
- **quiche (Cloudflare):** https://github.com/cloudflare/quiche
- **s2n-quic (AWS):** https://github.com/aws/s2n-quic
- **quinn (Rust):** https://docs.rs/quinn/latest/quinn/
- **QUIC Performance Tuning:** https://blog.cloudflare.com/the-road-to-quic/

### BBR Congestion Control

- **Google Research Paper:** https://research.google/pubs/pub45646/
- **BBR v2:** https://datatracker.ietf.org/doc/html/draft-cardwell-iccrg-bbr-congestion-control
- **Linux Implementation:** Built into kernel, QUIC implementations support it

### Zero-Copy Networking

- **sendfile(2):** https://man7.org/linux/man-pages/man2/sendfile.2.html
- **splice(2):** https://man7.org/linux/man-pages/man2/splice.2.html
- **MSG_ZEROCOPY:** https://www.kernel.org/doc/html/latest/networking/msg_zerocopy.html
- **Windows TransmitFile:** https://docs.microsoft.com/en-us/windows/win32/api/mswsock/nf-mswsock-transmitfile

### Compression

- **zstd:** https://facebook.github.io/zstd/
- **zstd Rust Crate:** https://docs.rs/zstd/latest/zstd/
- **Compression Benchmarks:** https://github.com/facebook/zstd#benchmarks
- **Dictionary Compression:** https://facebook.github.io/zstd/#small-data

---

## Crate Candidates

### Recommended Stack

| Purpose | Crate | Notes |
|---------|-------|-------|
| io_uring | `io-uring` | Pure Rust, well-maintained |
| Async runtime | `tokio` | With io_uring feature on Linux |
| QUIC | `quinn` | Already using, good performance |
| Hashing | `blake3` | Official implementation |
| Compression | `zstd` | Binding to libzstd |
| Concurrent maps | `dashmap` | Already using |
| Buffer management | `bytes` | Already using |

### Alternative Crates (Worth Evaluating)

| Purpose | Crate | Notes |
|---------|-------|-------|
| io_uring | `tokio-uring` | Tokio integration, less mature |
| QUIC | `quiche` | Cloudflare, more tuning options |
| QUIC | `s2n-quic` | AWS, excellent performance |
| Hashing | `xxhash-rust` | Faster but non-cryptographic |
| Compression | `lz4_flex` | Faster but lower ratio |

---

## Implementation Notes

### io_uring Setup

```rust
use io_uring::{IoUring, opcode, types::Fd};

pub struct IoUringBackend {
    ring: IoUring,
    buffer_pool: BufferPool,
}

impl IoUringBackend {
    pub fn new() -> io::Result<Self> {
        // Create ring with 256 entries
        let ring = IoUring::builder()
            .setup_sqpoll(1000)  // Submission queue polling
            .build(256)?;

        Ok(Self {
            ring,
            buffer_pool: BufferPool::new(64, 4 * 1024 * 1024),
        })
    }

    pub async fn read_file(&self, path: &Path, offset: u64, len: usize) -> io::Result<Vec<u8>> {
        let file = std::fs::File::open(path)?;
        let fd = Fd(file.as_raw_fd());

        let buf = self.buffer_pool.acquire().await;

        let sqe = opcode::Read::new(fd, buf.as_mut_ptr(), len as u32)
            .offset(offset)
            .build()
            .user_data(0);

        unsafe {
            self.ring.submission().push(&sqe)?;
        }
        self.ring.submit_and_wait(1)?;

        let cqe = self.ring.completion().next().unwrap();
        let bytes_read = cqe.result() as usize;

        Ok(buf[..bytes_read].to_vec())
    }
}
```

### sendfile on macOS

```rust
#[cfg(target_os = "macos")]
pub fn sendfile_macos(
    file_fd: RawFd,
    socket_fd: RawFd,
    offset: i64,
    len: usize,
) -> io::Result<usize> {
    use libc::{sendfile, SF_NODISKIO};

    let mut sent: i64 = len as i64;

    let result = unsafe {
        sendfile(
            file_fd,
            socket_fd,
            offset,
            &mut sent,
            std::ptr::null_mut(),
            SF_NODISKIO,
        )
    };

    if result == -1 {
        Err(io::Error::last_os_error())
    } else {
        Ok(sent as usize)
    }
}
```

### Windows TransmitFile

```rust
#[cfg(target_os = "windows")]
pub async fn transmit_file_windows(
    file: &File,
    socket: &TcpStream,
    offset: u64,
    len: usize,
) -> io::Result<usize> {
    use windows::Win32::Networking::WinSock::{TransmitFile, TF_USE_KERNEL_APC};
    use windows::Win32::Foundation::HANDLE;

    let file_handle = HANDLE(file.as_raw_handle() as isize);
    let socket_handle = socket.as_raw_socket();

    let mut overlapped = std::mem::zeroed::<OVERLAPPED>();
    overlapped.Offset = offset as u32;
    overlapped.OffsetHigh = (offset >> 32) as u32;

    let result = unsafe {
        TransmitFile(
            socket_handle,
            file_handle,
            len as u32,
            0,  // Use system default chunk size
            &mut overlapped,
            std::ptr::null(),
            TF_USE_KERNEL_APC,
        )
    };

    if result.0 == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(len)  // TransmitFile sends the full amount or fails
    }
}
```

---

## Follow-up Ideas (Future Phases)

### Phase 9: Advanced Networking

- **Multi-path aggregation:** Bond WiFi + Ethernet for higher throughput
- **MPTCP support:** Multiple TCP connections over different paths
- **Hole punching improvements:** Better NAT traversal

### Phase 10: Advanced Deduplication

- **Delta sync:** Transfer only changed blocks (rsync-like)
- **Rolling hash:** Variable-size chunking for better dedup
- **Similarity detection:** Find similar files for dedup across different content

### Phase 11: Enterprise Features

- **Bandwidth scheduling:** Transfer during off-peak hours
- **Priority queues:** Important files first
- **Transfer resume:** Survive network disconnections
- **Audit logging:** Track all file access

### Research Areas

- **Kernel bypass (DPDK/AF_XDP):** For 100Gbps+ networks
- **GPU offload:** BLAKE3 on GPU for extreme throughput
- **RDMA:** When hardware is available
- **Persistent memory:** Intel Optane for cache

---

## Benchmarking Notes

### Test File Generation

```bash
# Generate test files
dd if=/dev/urandom of=/tmp/test_1gb bs=1M count=1024
dd if=/dev/urandom of=/tmp/test_10gb bs=1M count=10240

# Generate compressible text file
base64 /dev/urandom | head -c 1073741824 > /tmp/test_1gb_text

# Generate many small files
mkdir /tmp/small_files
for i in $(seq 1 100000); do
    dd if=/dev/urandom of=/tmp/small_files/file_$i bs=10K count=1 2>/dev/null
done
```

### Network Simulation

```bash
# Linux: Add 50ms latency
sudo tc qdisc add dev eth0 root netem delay 50ms

# Linux: Limit to 100 Mbps
sudo tc qdisc change dev eth0 root tbf rate 100mbit burst 32kbit latency 400ms

# Linux: Add 1% packet loss
sudo tc qdisc change dev eth0 root netem loss 1%

# Remove all tc rules
sudo tc qdisc del dev eth0 root
```

### Performance Measurement

```bash
# Measure throughput
time cp /mnt/wormhole/test_10gb /tmp/local_copy
# Calculate: 10GB / time = throughput

# Measure with progress
pv /mnt/wormhole/test_10gb > /tmp/local_copy

# Syscall analysis
strace -c target/release/wormhole host /tmp/share

# CPU profiling
perf record -g target/release/wormhole host /tmp/share
perf report
```

---

## Known Limitations

### Platform-Specific

| Platform | Limitation | Workaround |
|----------|------------|------------|
| Linux <5.1 | No io_uring | epoll fallback |
| macOS | No io_uring | kqueue + sendfile |
| Windows | Complex IOCP | Careful implementation |
| Docker | May lack io_uring | Check kernel version |
| WSL2 | Performance varies | Use native Windows |

### QUIC Limitations

| Issue | Description | Workaround |
|-------|-------------|------------|
| UDP blocked | Corporate firewalls | TCP fallback |
| MTU issues | Some networks have lower MTU | QUIC handles automatically |
| CPU overhead | More CPU than TCP | Offset by parallelism |

---

## Glossary

| Term | Definition |
|------|------------|
| **BDP** | Bandwidth-Delay Product — optimal amount of in-flight data |
| **HOL blocking** | Head-of-Line blocking — when one stream blocks others |
| **io_uring** | Linux async I/O interface (kernel 5.1+) |
| **Zero-copy** | Transferring data without CPU copying |
| **sendfile** | Kernel function to send file to socket without userspace |
| **BBR** | Bottleneck Bandwidth and RTT — congestion control algorithm |
| **SIMD** | Single Instruction Multiple Data — parallel CPU operations |
