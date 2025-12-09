# Optimize Performance

Optimize performance for: $ARGUMENTS

## Performance Targets

| Metric | Target | Measure |
|--------|--------|---------|
| First byte | <100ms | Time to first data |
| Throughput | >100MB/s | Sustained transfer |
| Memory | <100MB | Idle daemon |
| Latency | <50ms | Metadata ops |

## Optimization Areas

### Buffer Management
```rust
// ❌ Allocating in hot path
fn process(data: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
}

// ✅ Reuse buffers
fn process(data: &[u8], buf: &mut Vec<u8>) {
    buf.clear();
}
```

### Lock Contention
```rust
// ❌ Holding lock across await
let guard = cache.lock().await;
fetch_remote().await; // BAD

// ✅ Release before await
let needs_fetch = {
    let guard = cache.lock().await;
    !guard.contains_key(&key)
};
if needs_fetch {
    let result = fetch_remote().await;
    cache.lock().await.insert(key, result);
}
```

### Chunking
- Use 128KB chunks (CHUNK_SIZE constant)
- Prefetch next chunks during read
- Parallel chunk requests

### Caching
- LRU cache for hot data
- Negative cache for missing files
- Metadata cache with TTL

## Profiling

```bash
# CPU profiling
cargo flamegraph --bin teleport-daemon

# Memory profiling
MALLOC_CONF=prof:true cargo run

# Tracing
RUST_LOG=trace cargo run 2>&1 | grep "span"
```

## Output

Provide:
- Bottleneck identification
- Specific optimizations with code
- Before/after measurements
