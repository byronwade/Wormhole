# Code Review

Review the code changes for Wormhole project compliance.

## Review Checklist

### Safety & Error Handling
- [ ] No `.unwrap()` or `.expect()` in production code
- [ ] FUSE errors return proper errno (ENOENT, EIO, etc.)
- [ ] `anyhow` for app errors, `thiserror` for library errors
- [ ] All `Result` types handled properly

### Async/Sync Bridging
- [ ] No `.await` inside FUSE methods
- [ ] Using oneshot channels for FUSE↔Tokio communication
- [ ] Not creating new runtimes inside FUSE calls
- [ ] Locks not held across `.await` points

### Security
- [ ] All network paths validated with `safe_path()`
- [ ] No path traversal vulnerabilities (`..` handling)
- [ ] Secrets not logged or exposed
- [ ] Input validation on all external data

### Performance
- [ ] No unnecessary `clone()` on large buffers
- [ ] Using `&[u8]` or `Arc<Vec<u8>>` for data sharing
- [ ] Respecting 128KB chunk size constant
- [ ] Locks held for minimal duration

### Protocol
- [ ] Messages defined in `teleport-core/src/protocol.rs`
- [ ] Using `bincode` serialization (not JSON for file data)
- [ ] New fields are `Option<T>` for backward compatibility
- [ ] Enum variants used for message types

### Architecture
- [ ] `teleport-core` has no daemon dependencies
- [ ] Heavy logic in `teleport-daemon`
- [ ] Frontend calls Rust via `invoke()` only
- [ ] No business logic in React components

### Testing
- [ ] Unit tests in `mod tests` at file bottom
- [ ] Async tests use `#[tokio::test]`
- [ ] FUSE tests mock VFS (no real mounts)
- [ ] Edge cases covered (empty file, large file, invalid path)

### Documentation
- [ ] `///` docs on public items in core
- [ ] `// Strategy:` comments on complex algorithms
- [ ] Functions are reasonably sized

### Style
- [ ] `cargo fmt` passes
- [ ] `cargo clippy -D warnings` passes
- [ ] Meaningful variable/function names

## Output Format

```
## Summary
[One paragraph overview]

## Issues Found
1. **[Severity]** [File:Line] - [Description]
   - Recommendation: [How to fix]

## Suggestions
- [Optional improvements]

## Verdict
[APPROVE / REQUEST CHANGES / NEEDS DISCUSSION]
```
