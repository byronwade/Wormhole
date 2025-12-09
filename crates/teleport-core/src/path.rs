//! Path validation and security utilities
//!
//! Provides safe path handling to prevent path traversal attacks.
//! All paths are validated before filesystem operations.

use crate::error::ProtocolError;
use crate::{MAX_FILENAME_LEN, MAX_PATH_LEN};
use std::path::{Component, Path, PathBuf};

/// Validate and resolve a path safely within a base directory.
///
/// This function prevents path traversal attacks by:
/// 1. Rejecting absolute paths in the relative component
/// 2. Rejecting paths with `..` components
/// 3. Rejecting paths with null bytes
/// 4. Ensuring the final path is within the base directory
///
/// # Arguments
/// * `base` - The base directory (must be absolute and exist)
/// * `relative` - The relative path to resolve (from client)
///
/// # Returns
/// * `Ok(PathBuf)` - The safe, canonicalized path
/// * `Err(ProtocolError::PathTraversal)` - If the path is unsafe
///
/// # Note
/// Unlike canonicalize(), this works on non-existent paths by
/// manually resolving components without following symlinks.
pub fn safe_path(base: &Path, relative: &str) -> Result<PathBuf, ProtocolError> {
    // Check for null bytes (potential security issue)
    if relative.contains('\0') {
        return Err(ProtocolError::PathTraversal(
            "path contains null byte".into(),
        ));
    }

    // Check path length
    if relative.len() > MAX_PATH_LEN {
        return Err(ProtocolError::PathTraversal(format!(
            "path too long: {} bytes (max {})",
            relative.len(),
            MAX_PATH_LEN
        )));
    }

    let relative_path = Path::new(relative);

    // Reject absolute paths
    if relative_path.is_absolute() {
        return Err(ProtocolError::PathTraversal(
            "absolute paths not allowed".into(),
        ));
    }

    // Build the path manually, rejecting dangerous components
    let mut result = base.to_path_buf();

    for component in relative_path.components() {
        match component {
            Component::Normal(name) => {
                // Check filename length
                let name_str = name.to_string_lossy();
                if name_str.len() > MAX_FILENAME_LEN {
                    return Err(ProtocolError::PathTraversal(format!(
                        "filename too long: {} bytes (max {})",
                        name_str.len(),
                        MAX_FILENAME_LEN
                    )));
                }
                result.push(name);
            }
            Component::ParentDir => {
                return Err(ProtocolError::PathTraversal(
                    "parent directory (..) not allowed".into(),
                ));
            }
            Component::CurDir => {
                // Ignore current directory (.)
            }
            Component::Prefix(_) => {
                return Err(ProtocolError::PathTraversal(
                    "path prefixes not allowed".into(),
                ));
            }
            Component::RootDir => {
                return Err(ProtocolError::PathTraversal(
                    "root directory not allowed in relative path".into(),
                ));
            }
        }
    }

    // Final safety check: ensure result starts with base
    // This catches edge cases we might have missed
    if !result.starts_with(base) {
        return Err(ProtocolError::PathTraversal(
            "path escapes base directory".into(),
        ));
    }

    Ok(result)
}

/// Validate a filename (single path component)
pub fn validate_filename(name: &str) -> Result<(), ProtocolError> {
    if name.is_empty() {
        return Err(ProtocolError::PathTraversal("empty filename".into()));
    }

    if name.contains('\0') {
        return Err(ProtocolError::PathTraversal(
            "filename contains null byte".into(),
        ));
    }

    if name.len() > MAX_FILENAME_LEN {
        return Err(ProtocolError::PathTraversal(format!(
            "filename too long: {} bytes (max {})",
            name.len(),
            MAX_FILENAME_LEN
        )));
    }

    if name == "." || name == ".." {
        return Err(ProtocolError::PathTraversal(
            "special directory names not allowed".into(),
        ));
    }

    if name.contains('/') || name.contains('\\') {
        return Err(ProtocolError::PathTraversal(
            "filename contains path separator".into(),
        ));
    }

    Ok(())
}

/// Validate that a path resolves to within the base directory, following symlinks.
///
/// This function should be called **after** a file exists check, to ensure that
/// symlinks don't escape the base directory. It uses canonicalize() which follows
/// all symlinks.
///
/// # Arguments
/// * `base` - The base directory (must be absolute)
/// * `path` - The path to check (can be absolute or relative to cwd)
///
/// # Returns
/// * `Ok(PathBuf)` - The canonicalized path that is within base
/// * `Err(ProtocolError)` - If the path escapes base or canonicalization fails
///
/// # Security
/// This MUST be called before accessing file contents when symlinks could be present.
/// Call after checking the file exists to avoid TOCTOU issues.
pub fn safe_real_path(base: &Path, path: &Path) -> Result<PathBuf, ProtocolError> {
    // Canonicalize base directory (should already exist)
    let canonical_base = base
        .canonicalize()
        .map_err(|e| ProtocolError::PathTraversal(format!("cannot canonicalize base: {}", e)))?;

    // Canonicalize the target path (follows all symlinks)
    let canonical_path = path
        .canonicalize()
        .map_err(|e| ProtocolError::PathTraversal(format!("cannot canonicalize path: {}", e)))?;

    // Verify the canonical path is within the canonical base
    if !canonical_path.starts_with(&canonical_base) {
        return Err(ProtocolError::PathTraversal(
            "symlink escapes shared directory".into(),
        ));
    }

    Ok(canonical_path)
}

/// Check if a path is safe (quick validation without full resolution)
pub fn is_safe_path(relative: &str) -> bool {
    if relative.contains('\0') || relative.len() > MAX_PATH_LEN {
        return false;
    }

    let path = Path::new(relative);

    if path.is_absolute() {
        return false;
    }

    for component in path.components() {
        match component {
            Component::Normal(name) => {
                if name.to_string_lossy().len() > MAX_FILENAME_LEN {
                    return false;
                }
            }
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return false;
            }
            Component::CurDir => {}
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn base() -> PathBuf {
        PathBuf::from("/shared")
    }

    #[test]
    fn test_safe_path_normal() {
        assert_eq!(
            safe_path(&base(), "file.txt").unwrap(),
            PathBuf::from("/shared/file.txt")
        );
        assert_eq!(
            safe_path(&base(), "dir/file.txt").unwrap(),
            PathBuf::from("/shared/dir/file.txt")
        );
        assert_eq!(
            safe_path(&base(), "a/b/c/d.txt").unwrap(),
            PathBuf::from("/shared/a/b/c/d.txt")
        );
    }

    #[test]
    fn test_safe_path_rejects_traversal() {
        assert!(safe_path(&base(), "../etc/passwd").is_err());
        assert!(safe_path(&base(), "foo/../../../etc/passwd").is_err());
        assert!(safe_path(&base(), "..").is_err());
    }

    #[test]
    fn test_safe_path_rejects_absolute() {
        assert!(safe_path(&base(), "/etc/passwd").is_err());
        assert!(safe_path(&base(), "/").is_err());
    }

    #[test]
    fn test_safe_path_handles_dot() {
        assert_eq!(
            safe_path(&base(), "./file.txt").unwrap(),
            PathBuf::from("/shared/file.txt")
        );
        assert_eq!(
            safe_path(&base(), "dir/./file.txt").unwrap(),
            PathBuf::from("/shared/dir/file.txt")
        );
    }

    #[test]
    fn test_safe_path_rejects_null() {
        assert!(safe_path(&base(), "file\0.txt").is_err());
    }

    #[test]
    fn test_safe_path_nonexistent() {
        // This should work even if the path doesn't exist
        // (unlike canonicalize which would fail)
        let result = safe_path(&base(), "nonexistent/deep/path/file.txt");
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            PathBuf::from("/shared/nonexistent/deep/path/file.txt")
        );
    }

    #[test]
    fn test_validate_filename() {
        assert!(validate_filename("file.txt").is_ok());
        assert!(validate_filename("my-file_v2.tar.gz").is_ok());

        assert!(validate_filename("").is_err());
        assert!(validate_filename(".").is_err());
        assert!(validate_filename("..").is_err());
        assert!(validate_filename("file/name").is_err());
        assert!(validate_filename("file\0name").is_err());
    }

    #[test]
    fn test_is_safe_path() {
        assert!(is_safe_path("file.txt"));
        assert!(is_safe_path("dir/file.txt"));
        assert!(is_safe_path("./file.txt"));

        assert!(!is_safe_path("../file.txt"));
        assert!(!is_safe_path("/file.txt"));
        assert!(!is_safe_path("file\0.txt"));
    }

    #[test]
    fn test_path_length_limits() {
        let long_name = "a".repeat(MAX_FILENAME_LEN + 1);
        assert!(validate_filename(&long_name).is_err());
        assert!(safe_path(&base(), &long_name).is_err());

        let long_path = format!("{}/{}", "dir", "a".repeat(MAX_PATH_LEN));
        assert!(safe_path(&base(), &long_path).is_err());
    }

    #[test]
    fn test_safe_real_path_with_existing_file() {
        use std::fs;
        use tempfile::tempdir;

        let temp = tempdir().unwrap();
        let base = temp.path();
        let file_path = base.join("test.txt");
        fs::write(&file_path, "test").unwrap();

        // Normal file within base should succeed
        let result = safe_real_path(base, &file_path);
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with(base.canonicalize().unwrap()));
    }

    #[test]
    #[cfg(unix)]
    fn test_safe_real_path_rejects_escaped_symlink() {
        use std::os::unix::fs::symlink;
        use tempfile::tempdir;

        let temp = tempdir().unwrap();
        let base = temp.path();
        let outside = temp.path().parent().unwrap();

        // Create a symlink inside base that points outside
        let symlink_path = base.join("evil_link");
        symlink(outside, &symlink_path).unwrap();

        // Should reject symlink that escapes base
        let result = safe_real_path(base, &symlink_path);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ProtocolError::PathTraversal(_)));
    }

    #[test]
    #[cfg(unix)]
    fn test_safe_real_path_accepts_internal_symlink() {
        use std::fs;
        use std::os::unix::fs::symlink;
        use tempfile::tempdir;

        let temp = tempdir().unwrap();
        let base = temp.path();

        // Create a file and a symlink to it within base
        let file_path = base.join("real.txt");
        fs::write(&file_path, "test").unwrap();
        let symlink_path = base.join("link.txt");
        symlink(&file_path, &symlink_path).unwrap();

        // Internal symlink should succeed
        let result = safe_real_path(base, &symlink_path);
        assert!(result.is_ok());
    }
}
