# Security Audit

Audit security for: $ARGUMENTS

## Threat Model

### Network Threats
- Man-in-the-middle attacks
- Replay attacks
- Connection hijacking

### Filesystem Threats
- Path traversal (`../../../etc/passwd`)
- Symlink attacks
- Resource exhaustion

### Crypto Threats
- Weak key derivation
- Nonce reuse
- Side-channel leaks

## Audit Checklist

### Path Handling
```rust
// ✅ Required pattern
fn safe_path(root: &Path, relative: &str) -> Option<PathBuf> {
    if relative.contains("..") || relative.starts_with('/') {
        return None;
    }
    let full = root.join(relative);
    let canonical = full.canonicalize().ok()?;
    canonical.starts_with(root).then_some(canonical)
}
```

### Input Validation
- [ ] All network inputs validated
- [ ] Size limits enforced
- [ ] Type checking on deserialization

### Secret Handling
- [ ] No secrets in logs
- [ ] Keys zeroed after use
- [ ] PAKE parameters correct

### Error Messages
- [ ] No path disclosure
- [ ] No version disclosure
- [ ] Generic errors to untrusted parties

## Output

Provide:
- Vulnerabilities found (severity rated)
- Specific code fixes
- Test cases for each issue
