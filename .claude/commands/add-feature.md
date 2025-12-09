# Add Feature

Implement the feature: $ARGUMENTS

## Implementation Checklist

### 1. Planning
- [ ] Identify affected crates (core, daemon, signal, ui)
- [ ] Check which phase this belongs to
- [ ] Review existing patterns in codebase

### 2. Core Changes (teleport-core)
- [ ] Add types to `protocol.rs`
- [ ] Update message enums if needed
- [ ] Add error variants

### 3. Daemon Changes (teleport-daemon)
- [ ] Implement handler logic
- [ ] Update FUSE ops if filesystem-related
- [ ] Add QUIC message handling

### 4. UI Changes (teleport-ui)
- [ ] Add Tauri command in `commands.rs`
- [ ] Create React component
- [ ] Update Zustand store

### 5. Testing
- [ ] Unit tests for new functions
- [ ] Integration test if cross-crate

## Code Standards

- No `unwrap()` in production
- Use `?` for error propagation
- Follow existing naming conventions
- Add tracing spans for new functions

## Output

Provide implementation with:
- All file changes needed
- Test coverage
- Documentation updates if public API
