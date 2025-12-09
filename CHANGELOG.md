# Changelog

All notable changes to Wormhole will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Full-featured CLI with 20+ commands (host, mount, status, cache, config, peers, sync, signal, completions, version, ping, bench, init, unmount, list, history, access, watch, update, doctor)
- GitHub-based update checker with caching
- Doctor command for system health diagnostics
- Shell completions for bash, zsh, fish, powershell, and elvish
- Cross-platform installation scripts (install.sh, install.ps1, uninstall.sh)
- GitHub Actions CI/CD pipeline (Linux, macOS, Windows)
- Release automation workflow with binary artifacts
- Dependabot configuration for automatic dependency updates
- Issue templates and pull request templates
- CODEOWNERS file
- Initial project documentation
- Architecture decision records (ADRs)
- Protocol specification
- Development phase guides (1-7)
- Marketing and brand documentation

### Changed
- Improved CLI output formatting and colors
- Better structured logging with configurable verbosity levels

### Deprecated
- `create_client_endpoint()` - use `create_client_endpoint_with_pinned_cert()` for production

### Fixed
- Resolved all compiler warnings
- Fixed deprecated API usage patterns
- Fixed unused import warnings

### Security
- Added certificate pinning support for QUIC connections
- Deprecated insecure connection methods with clear warnings

---

## [0.1.0] - YYYY-MM-DD (Planned - Phase 1 Complete)

### Added
- FUSE filesystem skeleton (`teleport-daemon`)
- Basic QUIC connection (`quinn`)
- Directory listing over network
- File attribute sync
- Join code generation
- Basic CLI (`wormhole host`, `wormhole mount`)

### Technical Details
- Chunk size: 128KB
- Protocol: bincode serialization
- Transport: QUIC with TLS 1.3

---

## Version History Template

When releasing a new version, copy this template:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Vulnerability fixes
```

---

## Release Checklist

Before each release:

- [ ] All tests passing
- [ ] CHANGELOG.md updated
- [ ] Version bumped in Cargo.toml files
- [ ] Documentation updated
- [ ] Security audit completed (if applicable)
- [ ] Performance benchmarks run
- [ ] Release notes drafted
- [ ] Git tag created

---

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes, protocol incompatibility
- **MINOR** (0.X.0): New features, backward compatible
- **PATCH** (0.0.X): Bug fixes, backward compatible

### Pre-release Labels

- `alpha`: Early development, unstable
- `beta`: Feature complete, testing
- `rc`: Release candidate, final testing

Example: `1.0.0-alpha.1`, `1.0.0-beta.2`, `1.0.0-rc.1`

---

## Links

- [Releases](https://github.com/wormhole-team/wormhole/releases)
- [Milestones](https://github.com/wormhole-team/wormhole/milestones)
- [Project Board](https://github.com/wormhole-team/wormhole/projects)

[Unreleased]: https://github.com/wormhole-team/wormhole/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wormhole-team/wormhole/releases/tag/v0.1.0
