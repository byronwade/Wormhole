# Contributing to Wormhole

Thank you for your interest in contributing to Wormhole! This document provides guidelines and information for contributors.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Making Contributions](#making-contributions)
5. [Code Standards](#code-standards)
6. [Testing](#testing)
7. [Pull Request Process](#pull-request-process)
8. [Issue Guidelines](#issue-guidelines)
9. [Community](#community)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of:
- Age, body size, disability, ethnicity, gender identity, level of experience
- Nationality, personal appearance, race, religion, or sexual orientation

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Trolling, insulting comments, personal attacks
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Instances of unacceptable behavior may be reported to the project maintainers. All complaints will be reviewed and investigated and will result in a response deemed necessary and appropriate to the circumstances.

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

| Tool | Version | Purpose |
|------|---------|---------|
| **Rust** | 1.75+ | Core development |
| **Node.js** | 20+ | Frontend development |
| **pnpm** | 8+ | Package management |
| **Git** | 2.40+ | Version control |

### Platform-Specific Requirements

**Linux:**
```bash
sudo apt install libfuse3-dev pkg-config build-essential
```

**macOS:**
```bash
brew install macfuse
# Note: Requires system extension approval in Security & Privacy
```

**Windows:**
```
Download and install WinFSP from https://winfsp.dev/
```

### Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR-USERNAME/wormhole.git
cd wormhole

# Add upstream remote
git remote add upstream https://github.com/wormhole-team/wormhole.git
```

---

## Development Setup

### Initial Setup

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install additional components
rustup component add clippy rustfmt

# Build the project
cargo build

# Run tests
cargo test

# For frontend development
cd apps/teleport-ui
pnpm install
```

### IDE Setup

**VS Code (Recommended):**
```json
// .vscode/extensions.json
{
  "recommendations": [
    "rust-lang.rust-analyzer",
    "tamasfe.even-better-toml",
    "vadimcn.vscode-lldb",
    "bradlc.vscode-tailwindcss"
  ]
}
```

**Cursor:**
- The project includes `.cursor/rules/` with AI assistance rules
- MDC files provide context for AI-assisted development

### Running Locally

```bash
# Terminal 1: Run the signal server (if needed)
cargo run -p teleport-signal

# Terminal 2: Host a folder
cargo run -p teleport-daemon -- host ./test-folder

# Terminal 3: Mount on another machine/terminal
cargo run -p teleport-daemon -- mount /mnt/wormhole <HOST_IP>

# Frontend development
cd apps/teleport-ui && pnpm tauri dev
```

---

## Making Contributions

### Types of Contributions

| Type | Description | Difficulty |
|------|-------------|------------|
| **Bug Fixes** | Fix reported issues | Easy-Medium |
| **Documentation** | Improve docs, fix typos | Easy |
| **Tests** | Add test coverage | Easy-Medium |
| **Features** | Implement new features | Medium-Hard |
| **Performance** | Optimize existing code | Medium-Hard |
| **Security** | Fix vulnerabilities | Hard |

### Choosing What to Work On

1. **Check existing issues** - Look for `good first issue` or `help wanted` labels
2. **Check the project board** - See current priorities
3. **Read the phase docs** - Understand what phase we're in
4. **Ask in discussions** - If unsure, ask before starting

### Before You Start

1. **Check if issue exists** - Search open and closed issues
2. **Check if PR exists** - Someone may already be working on it
3. **Comment on the issue** - Let others know you're working on it
4. **Read relevant docs** - Especially `doc/development/` for your area

---

## Code Standards

### Rust Code Style

```rust
// ❌ Never do this
value.unwrap();
value.expect("message");

// ✅ Always do this
value?;
value.ok_or(Error::Missing)?;
```

### Formatting

```bash
# Before committing, always run:
cargo fmt
cargo clippy -D warnings
```

### Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code change that neither fixes nor adds
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Build process, dependencies

**Examples:**
```
feat(daemon): add chunk prefetching for sequential reads

Implements a governor that detects sequential access patterns
and prefetches the next 4 chunks automatically.

Closes #123
```

```
fix(fuse): handle ENOENT correctly for deleted files

Previously, accessing a deleted file would panic. Now it
returns ENOENT as expected.
```

### Branch Naming

```
<type>/<issue-number>-<short-description>
```

**Examples:**
- `feat/123-add-prefetch`
- `fix/456-handle-disconnect`
- `docs/789-update-api-reference`

---

## Testing

### Running Tests

```bash
# All tests
cargo test

# Specific crate
cargo test -p teleport-core

# Specific test
cargo test test_safe_path

# With output
cargo test -- --nocapture

# Integration tests (requires FUSE)
./scripts/integration-tests.sh
```

### Writing Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_name_expected_behavior() {
        // Arrange
        let input = create_test_input();

        // Act
        let result = function_under_test(input);

        // Assert
        assert_eq!(result, expected);
    }

    #[tokio::test]
    async fn test_async_operation() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

### Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `src/*.rs` (inline) | Test individual functions |
| Integration | `tests/` | Test crate interactions |
| E2E | `tests/e2e/` | Full system tests |

### Coverage Requirements

- New code should have >80% coverage
- Critical paths (security, data integrity) need 100%
- Run coverage: `cargo tarpaulin --out Html`

---

## Pull Request Process

### Before Submitting

- [ ] Code compiles without warnings (`cargo build`)
- [ ] All tests pass (`cargo test`)
- [ ] Code is formatted (`cargo fmt`)
- [ ] Clippy passes (`cargo clippy -D warnings`)
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated (if user-facing change)
- [ ] Commit messages follow convention

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would break existing functionality)
- [ ] Documentation update

## Related Issues
Closes #123

## Testing
Describe how you tested your changes.

## Screenshots (if applicable)

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code in hard-to-understand areas
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
```

### Review Process

1. **Automated checks** - CI must pass
2. **Code review** - At least one maintainer approval
3. **Testing** - Reviewer may test locally
4. **Merge** - Squash and merge preferred

### After Merge

- Delete your branch
- Close related issues
- Update any tracking documents

---

## Issue Guidelines

### Bug Reports

```markdown
## Bug Description
A clear description of the bug.

## Steps to Reproduce
1. Start the daemon with '...'
2. Mount the folder '...'
3. Access file '...'
4. See error

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- OS: macOS 14.0
- Rust: 1.75.0
- Wormhole: 0.1.0

## Logs
```
Paste relevant logs here
```

## Additional Context
Any other information.
```

### Feature Requests

```markdown
## Feature Description
A clear description of the feature.

## Use Case
Why do you need this feature?

## Proposed Solution
How do you think it should work?

## Alternatives Considered
Other approaches you've thought about.

## Additional Context
Any other information.
```

---

## Community

### Communication Channels

| Channel | Purpose |
|---------|---------|
| **GitHub Issues** | Bug reports, feature requests |
| **GitHub Discussions** | Questions, ideas, general discussion |
| **Discord** | Real-time chat (link in README) |

### Getting Help

1. **Check documentation** - Most answers are in `doc/`
2. **Search issues** - Someone may have asked before
3. **Ask in Discussions** - For general questions
4. **Open an issue** - For specific bugs or features

### Recognition

Contributors are recognized in:
- CHANGELOG.md (for each release)
- README.md contributors section
- Release notes

---

## Development Workflow Summary

```
1. Fork & Clone
   ↓
2. Create Branch (feat/123-description)
   ↓
3. Make Changes
   ↓
4. Run Tests & Linting
   ↓
5. Commit (conventional format)
   ↓
6. Push & Create PR
   ↓
7. Address Review Feedback
   ↓
8. Merge!
```

---

## Quick Reference

```bash
# Setup
git clone https://github.com/YOU/wormhole.git
cargo build

# Before committing
cargo fmt && cargo clippy -D warnings && cargo test

# Create PR branch
git checkout -b feat/123-my-feature

# Keep up to date
git fetch upstream
git rebase upstream/main
```

---

Thank you for contributing to Wormhole!
