//! Project aperture: `.wormhole/aperture.toml` describing share roots and excludes.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors loading or writing a project aperture.
#[derive(Debug, Error)]
pub enum ApertureError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse: {0}")]
    Parse(String),
    #[error("serialize: {0}")]
    Serialize(String),
}

/// Project aperture: `.wormhole/aperture.toml` describing share roots and excludes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectAperture {
    pub name: Option<String>,
    /// Relative paths; default `["."]`.
    pub roots: Vec<String>,
    /// Globs like `*.tmp`, `.git`, `node_modules`.
    pub exclude: Vec<String>,
    /// Default true — enable playhead prefetch hints.
    pub playhead_prefetch: bool,
    /// Default true — enable magnet/CAS on host.
    pub content_addressed: bool,
}

impl Default for ProjectAperture {
    fn default() -> Self {
        Self::default_new()
    }
}

fn default_roots() -> Vec<String> {
    vec![".".into()]
}

fn default_exclude() -> Vec<String> {
    vec![
        "*.tmp".into(),
        ".git".into(),
        "node_modules".into(),
        ".wormhole".into(),
    ]
}

impl ProjectAperture {
    /// Sensible defaults for a new project aperture.
    pub fn default_new() -> Self {
        Self {
            name: None,
            roots: default_roots(),
            exclude: default_exclude(),
            playhead_prefetch: true,
            content_addressed: true,
        }
    }

    /// Path to `.wormhole/aperture.toml` under `project_root`.
    pub fn aperture_path(project_root: &Path) -> PathBuf {
        project_root.join(".wormhole").join("aperture.toml")
    }

    /// Loads `.wormhole/aperture.toml` if present.
    pub fn load(project_root: &Path) -> Result<Option<Self>, ApertureError> {
        let path = Self::aperture_path(project_root);
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&path)?;
        let aperture: Self =
            toml::from_str(&content).map_err(|e| ApertureError::Parse(e.to_string()))?;
        Ok(Some(aperture))
    }

    /// Writes `aperture.toml` under `project_root/.wormhole/`.
    pub fn write(&self, project_root: &Path) -> Result<(), ApertureError> {
        let wormhole_dir = project_root.join(".wormhole");
        fs::create_dir_all(&wormhole_dir)?;
        let path = wormhole_dir.join("aperture.toml");
        let content =
            toml::to_string_pretty(self).map_err(|e| ApertureError::Serialize(e.to_string()))?;
        fs::write(&path, content)?;
        Ok(())
    }

    /// Returns false if `rel` matches an exclude pattern, or contains `..`.
    ///
    /// Simple glob: `*` as suffix/prefix/contains, or exact match.
    /// Also matches against individual path components (e.g. `.git` in `src/.git`).
    pub fn allows_relative(&self, rel: &str) -> bool {
        if rel.contains("..") {
            return false;
        }
        let normalized = normalize_slashes(rel);
        for pattern in &self.exclude {
            if simple_glob_match(pattern, &normalized) {
                return false;
            }
            for component in normalized.split('/') {
                if !component.is_empty() && simple_glob_match(pattern, component) {
                    return false;
                }
            }
        }
        true
    }

    /// Returns true if `rel` is under one of the configured roots (slash-normalized).
    pub fn is_under_roots(&self, rel: &str) -> bool {
        let normalized = strip_dot_slash(&normalize_slashes(rel));
        for root in &self.roots {
            let root_norm = strip_dot_slash(&normalize_slashes(root));
            if root_norm.is_empty() || root_norm == "." {
                return true;
            }
            if normalized == root_norm
                || normalized.starts_with(&format!("{root_norm}/"))
            {
                return true;
            }
        }
        false
    }
}

fn normalize_slashes(s: &str) -> String {
    s.replace('\\', "/")
}

fn strip_dot_slash(s: &str) -> String {
    let s = s.trim_matches('/');
    if let Some(rest) = s.strip_prefix("./") {
        rest.to_string()
    } else if s == "." {
        String::new()
    } else {
        s.to_string()
    }
}

/// Simple glob: exact, `*suffix`, `prefix*`, or `*contains*`.
fn simple_glob_match(pattern: &str, value: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if pattern == value {
        return true;
    }
    let starts = pattern.starts_with('*');
    let ends = pattern.ends_with('*');
    match (starts, ends) {
        (true, true) => {
            let mid = &pattern[1..pattern.len().saturating_sub(1)];
            if mid.is_empty() {
                true
            } else {
                value.contains(mid)
            }
        }
        (true, false) => value.ends_with(&pattern[1..]),
        (false, true) => {
            let prefix = &pattern[..pattern.len().saturating_sub(1)];
            value.starts_with(prefix)
        }
        (false, false) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn default_new_sensible() {
        let a = ProjectAperture::default_new();
        assert!(a.name.is_none());
        assert_eq!(a.roots, vec![".".to_string()]);
        assert!(a.playhead_prefetch);
        assert!(a.content_addressed);
        assert!(a.exclude.iter().any(|e| e == ".git"));
    }

    #[test]
    fn write_and_load_roundtrip() {
        let dir = TempDir::new().unwrap();
        let mut aperture = ProjectAperture::default_new();
        aperture.name = Some("demo".into());
        aperture.roots = vec!["src".into(), "assets".into()];
        aperture.write(dir.path()).unwrap();

        let loaded = ProjectAperture::load(dir.path()).unwrap();
        let loaded = loaded.expect("aperture.toml should exist");
        assert_eq!(loaded.name.as_deref(), Some("demo"));
        assert_eq!(loaded.roots, vec!["src", "assets"]);
        assert!(loaded.playhead_prefetch);
        assert!(loaded.content_addressed);
    }

    #[test]
    fn load_missing_returns_none() {
        let dir = TempDir::new().unwrap();
        assert!(ProjectAperture::load(dir.path()).unwrap().is_none());
    }

    #[test]
    fn allows_relative_rejects_dotdot() {
        let a = ProjectAperture::default_new();
        assert!(!a.allows_relative("../etc/passwd"));
        assert!(!a.allows_relative("foo/../../bar"));
    }

    #[test]
    fn allows_relative_exclude_globs() {
        let a = ProjectAperture::default_new();
        assert!(a.allows_relative("src/main.rs"));
        assert!(!a.allows_relative("foo.tmp"));
        assert!(!a.allows_relative("cache/foo.tmp"));
        assert!(!a.allows_relative(".git"));
        assert!(!a.allows_relative("vendor/.git/config"));
        assert!(!a.allows_relative("node_modules/pkg/index.js"));
    }

    #[test]
    fn allows_relative_custom_contains_glob() {
        let mut a = ProjectAperture::default_new();
        a.exclude = vec!["*secret*".into()];
        assert!(!a.allows_relative("my-secret-file"));
        assert!(a.allows_relative("public.txt"));
    }

    #[test]
    fn is_under_roots_dot() {
        let a = ProjectAperture::default_new();
        assert!(a.is_under_roots("anything/here"));
        assert!(a.is_under_roots("."));
    }

    #[test]
    fn is_under_roots_specific() {
        let mut a = ProjectAperture::default_new();
        a.roots = vec!["src".into(), "assets/video".into()];
        assert!(a.is_under_roots("src/main.rs"));
        assert!(a.is_under_roots("src"));
        assert!(a.is_under_roots("assets/video/clip.mov"));
        assert!(!a.is_under_roots("assets/audio/a.wav"));
        assert!(!a.is_under_roots("README.md"));
    }

    #[test]
    fn is_under_roots_normalizes_slashes() {
        let mut a = ProjectAperture::default_new();
        a.roots = vec!["src\\lib".into()];
        assert!(a.is_under_roots("src/lib/mod.rs"));
    }
}
