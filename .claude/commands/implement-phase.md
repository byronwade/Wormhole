# Implement Phase

You are implementing Phase $ARGUMENTS of the Wormhole project.

## Before You Start

1. Read the phase documentation: `doc/development/phase-$ARGUMENTS-*/`
2. Check the master implementation plan: `doc/development/00-master-implementation-plan.md`
3. Identify what files need to be created/modified
4. Review dependencies - don't introduce future phase requirements

## Phase Overview

| Phase | Goal | Key Deliverables |
|-------|------|------------------|
| 1 | Hello World FS | FUSE skeleton, QUIC connection, `ls -R` works |
| 2 | P2P Tunnel | Data plane, file reads over network |
| 3 | Integration | Streaming governor, RAM cache |
| 4 | Performance | Disk cache, LRU eviction, offline reads |
| 5 | Product Wrapper | Tauri GUI, system tray, installers |
| 6 | Security | NAT traversal, PAKE, join codes |
| 7 | Release | Bidirectional writes, distributed locks |

## Implementation Checklist

For Phase $ARGUMENTS:

1. [ ] Read phase requirements from documentation
2. [ ] Create todo list with specific tasks
3. [ ] Implement core functionality
4. [ ] Write unit tests
5. [ ] Update CLAUDE.md if architecture changes
6. [ ] Run `cargo fmt && cargo clippy -D warnings && cargo test`

## Code Rules Reminder

- No `.unwrap()` in production code
- Use oneshot channels for FUSE↔Tokio bridging
- Validate all network paths with `safe_path()`
- Use `bincode` for wire protocol (not JSON)
- 128KB chunk size constant
- Document complex algorithms with `// Strategy:` comments

## Output

After implementation:
1. List all files created/modified
2. Show how to test the changes
3. Note any blockers or decisions needed
