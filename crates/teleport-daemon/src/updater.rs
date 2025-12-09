//! GitHub-based update checker for Wormhole
//!
//! Checks for new releases on GitHub and notifies users of available updates.
//! Supports both stable and pre-release channels.
//!
//! # Example
//!
//! ```rust,ignore
//! use teleport_daemon::updater::{UpdateChecker, UpdateChannel};
//!
//! let checker = UpdateChecker::new("wormhole-team", "wormhole", UpdateChannel::Stable);
//! if let Some(update) = checker.check_for_update().await? {
//!     println!("New version available: {}", update.version);
//! }
//! ```

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// chrono is kept as a dependency for future datetime formatting needs
use semver::Version;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, info, warn};

/// GitHub repository owner
pub const GITHUB_OWNER: &str = "wormhole-team";

/// GitHub repository name
pub const GITHUB_REPO: &str = "wormhole";

/// Default check interval (24 hours)
pub const DEFAULT_CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Minimum check interval (1 hour) to prevent rate limiting
pub const MIN_CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Errors that can occur during update checking
#[derive(Error, Debug)]
pub enum UpdateError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Failed to parse version: {0}")]
    VersionParseError(#[from] semver::Error),

    #[error("Failed to parse JSON: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Rate limited by GitHub API")]
    RateLimited,

    #[error("No releases found")]
    NoReleases,

    #[error("Failed to read/write cache: {0}")]
    CacheError(String),

    #[error("Network unavailable")]
    NetworkUnavailable,
}

/// Update channel selection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum UpdateChannel {
    /// Only stable releases (no pre-release tags)
    #[default]
    Stable,
    /// Include beta releases (e.g., v1.0.0-beta.1)
    Beta,
    /// Include all releases including alpha/nightly
    Nightly,
}

impl std::fmt::Display for UpdateChannel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Stable => write!(f, "stable"),
            Self::Beta => write!(f, "beta"),
            Self::Nightly => write!(f, "nightly"),
        }
    }
}

impl std::str::FromStr for UpdateChannel {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "stable" => Ok(Self::Stable),
            "beta" => Ok(Self::Beta),
            "nightly" | "alpha" | "dev" => Ok(Self::Nightly),
            _ => Err(format!("Unknown channel: {}", s)),
        }
    }
}

/// Information about an available update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// New version string
    pub version: String,

    /// Parsed semantic version
    #[serde(skip)]
    pub semver: Option<Version>,

    /// Release name/title
    pub name: String,

    /// Release notes (markdown)
    pub body: String,

    /// URL to the release page
    pub html_url: String,

    /// Direct download URLs for each platform
    pub download_urls: DownloadUrls,

    /// Whether this is a pre-release
    pub prerelease: bool,

    /// Release publication date
    pub published_at: String,

    /// Whether this update is considered critical/security
    pub is_critical: bool,
}

/// Platform-specific download URLs
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DownloadUrls {
    pub macos_arm64: Option<String>,
    pub macos_x64: Option<String>,
    pub linux_x64: Option<String>,
    pub linux_arm64: Option<String>,
    pub windows_x64: Option<String>,
}

/// GitHub release asset information
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64, // Keep for future download progress display
}

/// GitHub release information from API
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    prerelease: bool,
    draft: bool,
    published_at: String,
    assets: Vec<GitHubAsset>,
}

/// Cached update check result
#[derive(Debug, Serialize, Deserialize)]
struct UpdateCache {
    /// Last check timestamp (Unix seconds)
    last_check: u64,

    /// Cached release info (if any)
    cached_update: Option<UpdateInfo>,

    /// Current version at time of check
    checked_version: String,
}

/// Update checker with GitHub integration
pub struct UpdateChecker {
    /// GitHub repository owner
    owner: String,

    /// GitHub repository name
    repo: String,

    /// Update channel preference
    channel: UpdateChannel,

    /// Current installed version
    current_version: Version,

    /// HTTP client
    client: reqwest::Client,

    /// Cache file path
    cache_path: Option<PathBuf>,

    /// Check interval
    check_interval: Duration,

    /// Whether to skip cache
    skip_cache: bool,
}

impl UpdateChecker {
    /// Create a new update checker with default settings
    pub fn new(owner: impl Into<String>, repo: impl Into<String>, channel: UpdateChannel) -> Self {
        let current_version =
            Version::parse(env!("CARGO_PKG_VERSION")).unwrap_or_else(|_| Version::new(0, 0, 0));

        let cache_path = directories::ProjectDirs::from("", "", "wormhole")
            .map(|dirs| dirs.cache_dir().join("update_cache.json"));

        Self {
            owner: owner.into(),
            repo: repo.into(),
            channel,
            current_version,
            client: reqwest::Client::builder()
                .user_agent(format!("wormhole/{}", env!("CARGO_PKG_VERSION")))
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            cache_path,
            check_interval: DEFAULT_CHECK_INTERVAL,
            skip_cache: false,
        }
    }

    /// Create checker with default GitHub repo
    pub fn default_repo(channel: UpdateChannel) -> Self {
        Self::new(GITHUB_OWNER, GITHUB_REPO, channel)
    }

    /// Set custom check interval
    pub fn with_interval(mut self, interval: Duration) -> Self {
        self.check_interval = interval.max(MIN_CHECK_INTERVAL);
        self
    }

    /// Skip cache and always check GitHub
    pub fn skip_cache(mut self) -> Self {
        self.skip_cache = true;
        self
    }

    /// Check for updates, using cache if available and fresh
    pub async fn check_for_update(&self) -> Result<Option<UpdateInfo>, UpdateError> {
        // Check cache first
        if !self.skip_cache {
            if let Some(cached) = self.read_cache()? {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                if now - cached.last_check < self.check_interval.as_secs() {
                    debug!(
                        "Using cached update info (age: {}s)",
                        now - cached.last_check
                    );
                    return Ok(cached.cached_update);
                }
            }
        }

        // Fetch from GitHub
        let update = self.fetch_latest_release().await?;

        // Update cache if path is configured
        if self.cache_path.is_some() {
            let cache = UpdateCache {
                last_check: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
                cached_update: update.clone(),
                checked_version: self.current_version.to_string(),
            };

            if let Err(e) = self.write_cache(&cache) {
                warn!("Failed to write update cache: {}", e);
            }
        }

        Ok(update)
    }

    /// Force check GitHub without cache
    pub async fn force_check(&self) -> Result<Option<UpdateInfo>, UpdateError> {
        self.fetch_latest_release().await
    }

    /// Fetch the latest release from GitHub API
    async fn fetch_latest_release(&self) -> Result<Option<UpdateInfo>, UpdateError> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/releases",
            self.owner, self.repo
        );

        debug!("Fetching releases from {}", url);

        let response = self.client.get(&url).send().await?;

        // Handle rate limiting
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            if let Some(remaining) = response.headers().get("x-ratelimit-remaining") {
                if remaining.to_str().unwrap_or("1") == "0" {
                    return Err(UpdateError::RateLimited);
                }
            }
        }

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(UpdateError::NoReleases);
        }

        let releases: Vec<GitHubRelease> = response.json().await?;

        if releases.is_empty() {
            return Err(UpdateError::NoReleases);
        }

        // Find the latest applicable release
        for release in releases {
            // Skip drafts
            if release.draft {
                continue;
            }

            // Filter by channel
            if !self.release_matches_channel(&release) {
                continue;
            }

            // Parse version
            let version_str = release.tag_name.trim_start_matches('v');
            let version = match Version::parse(version_str) {
                Ok(v) => v,
                Err(e) => {
                    debug!(
                        "Skipping release with invalid version {}: {}",
                        release.tag_name, e
                    );
                    continue;
                }
            };

            // Check if newer than current
            if version <= self.current_version {
                debug!(
                    "Latest release {} is not newer than current {}",
                    version, self.current_version
                );
                return Ok(None);
            }

            // Build update info
            let download_urls = self.extract_download_urls(&release.assets);
            let is_critical = self.is_critical_update(&release);

            let update = UpdateInfo {
                version: version.to_string(),
                semver: Some(version),
                name: release.name.unwrap_or_else(|| release.tag_name.clone()),
                body: release.body.unwrap_or_default(),
                html_url: release.html_url,
                download_urls,
                prerelease: release.prerelease,
                published_at: release.published_at,
                is_critical,
            };

            info!(
                "Found update: {} -> {} (critical: {})",
                self.current_version, update.version, update.is_critical
            );

            return Ok(Some(update));
        }

        Ok(None)
    }

    /// Check if a release matches the configured channel
    fn release_matches_channel(&self, release: &GitHubRelease) -> bool {
        match self.channel {
            UpdateChannel::Stable => !release.prerelease,
            UpdateChannel::Beta => {
                !release.prerelease
                    || release.tag_name.contains("beta")
                    || release.tag_name.contains("rc")
            }
            UpdateChannel::Nightly => true,
        }
    }

    /// Extract platform-specific download URLs from assets
    fn extract_download_urls(&self, assets: &[GitHubAsset]) -> DownloadUrls {
        let mut urls = DownloadUrls::default();

        for asset in assets {
            let name = asset.name.to_lowercase();

            if name.contains("macos") || name.contains("darwin") {
                if name.contains("arm64") || name.contains("aarch64") {
                    urls.macos_arm64 = Some(asset.browser_download_url.clone());
                } else if name.contains("x64") || name.contains("x86_64") || name.contains("amd64")
                {
                    urls.macos_x64 = Some(asset.browser_download_url.clone());
                }
            } else if name.contains("linux") {
                if name.contains("arm64") || name.contains("aarch64") {
                    urls.linux_arm64 = Some(asset.browser_download_url.clone());
                } else if name.contains("x64") || name.contains("x86_64") || name.contains("amd64")
                {
                    urls.linux_x64 = Some(asset.browser_download_url.clone());
                }
            } else if (name.contains("windows") || name.contains(".exe") || name.contains(".msi"))
                && (name.contains("x64") || name.contains("x86_64") || name.contains("amd64"))
            {
                urls.windows_x64 = Some(asset.browser_download_url.clone());
            }
        }

        urls
    }

    /// Check if update is marked as critical (security fix, etc.)
    fn is_critical_update(&self, release: &GitHubRelease) -> bool {
        let body = release.body.as_deref().unwrap_or("");
        let name = release.name.as_deref().unwrap_or("");

        let critical_keywords = [
            "security",
            "critical",
            "cve-",
            "vulnerability",
            "urgent",
            "breaking",
            "hotfix",
        ];

        let text = format!("{} {}", name, body).to_lowercase();
        critical_keywords.iter().any(|kw| text.contains(kw))
    }

    /// Read cached update info
    fn read_cache(&self) -> Result<Option<UpdateCache>, UpdateError> {
        let path = match &self.cache_path {
            Some(p) => p,
            None => return Ok(None),
        };

        if !path.exists() {
            return Ok(None);
        }

        let content =
            std::fs::read_to_string(path).map_err(|e| UpdateError::CacheError(e.to_string()))?;

        let cache: UpdateCache =
            serde_json::from_str(&content).map_err(|e| UpdateError::CacheError(e.to_string()))?;

        // Invalidate cache if we've been upgraded
        if cache.checked_version != self.current_version.to_string() {
            debug!("Cache invalidated: version changed");
            return Ok(None);
        }

        Ok(Some(cache))
    }

    /// Write update cache
    fn write_cache(&self, cache: &UpdateCache) -> Result<(), UpdateError> {
        let path = match &self.cache_path {
            Some(p) => p,
            None => return Ok(()),
        };

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| UpdateError::CacheError(e.to_string()))?;
        }

        let content = serde_json::to_string_pretty(cache)
            .map_err(|e| UpdateError::CacheError(e.to_string()))?;

        std::fs::write(path, content).map_err(|e| UpdateError::CacheError(e.to_string()))?;

        Ok(())
    }

    /// Get the current version
    pub fn current_version(&self) -> &Version {
        &self.current_version
    }

    /// Get the configured channel
    pub fn channel(&self) -> UpdateChannel {
        self.channel
    }

    /// Get download URL for current platform
    pub fn get_download_url_for_current_platform(urls: &DownloadUrls) -> Option<&String> {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            urls.macos_arm64.as_ref()
        }

        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        {
            urls.macos_x64.as_ref()
        }

        #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
        {
            urls.linux_x64.as_ref()
        }

        #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
        {
            urls.linux_arm64.as_ref()
        }

        #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
        {
            urls.windows_x64.as_ref()
        }

        #[cfg(not(any(
            all(target_os = "macos", target_arch = "aarch64"),
            all(target_os = "macos", target_arch = "x86_64"),
            all(target_os = "linux", target_arch = "x86_64"),
            all(target_os = "linux", target_arch = "aarch64"),
            all(target_os = "windows", target_arch = "x86_64"),
        )))]
        {
            None
        }
    }
}

/// Format update message for CLI display
pub fn format_update_message(update: &UpdateInfo, current_version: &str) -> String {
    let mut msg = String::new();

    if update.is_critical {
        msg.push_str("⚠️  CRITICAL UPDATE AVAILABLE!\n\n");
    } else {
        msg.push_str("📦 Update available!\n\n");
    }

    msg.push_str(&format!("  Current version:  {}\n", current_version));
    msg.push_str(&format!(
        "  Latest version:   {}{}\n",
        update.version,
        if update.prerelease {
            " (pre-release)"
        } else {
            ""
        }
    ));
    msg.push_str(&format!(
        "  Released:         {}\n",
        &update.published_at[..10]
    ));
    msg.push('\n');

    if !update.body.is_empty() {
        // Show first 3 lines of release notes
        let notes: Vec<&str> = update.body.lines().take(5).collect();
        if !notes.is_empty() {
            msg.push_str("  Release notes:\n");
            for line in notes {
                msg.push_str(&format!("    {}\n", line));
            }
            if update.body.lines().count() > 5 {
                msg.push_str("    ...\n");
            }
            msg.push('\n');
        }
    }

    msg.push_str(&format!("  More info: {}\n", update.html_url));
    msg.push('\n');

    // Add download instruction
    msg.push_str("  To update:\n");

    #[cfg(target_os = "macos")]
    msg.push_str("    brew upgrade wormhole\n");
    #[cfg(target_os = "macos")]
    msg.push_str("    # or download from the release page\n");

    #[cfg(target_os = "linux")]
    msg.push_str("    # Download from the release page or use your package manager\n");

    #[cfg(target_os = "windows")]
    msg.push_str("    # Download the installer from the release page\n");

    msg
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_parsing() {
        assert_eq!(
            "stable".parse::<UpdateChannel>().unwrap(),
            UpdateChannel::Stable
        );
        assert_eq!(
            "beta".parse::<UpdateChannel>().unwrap(),
            UpdateChannel::Beta
        );
        assert_eq!(
            "nightly".parse::<UpdateChannel>().unwrap(),
            UpdateChannel::Nightly
        );
        assert_eq!(
            "STABLE".parse::<UpdateChannel>().unwrap(),
            UpdateChannel::Stable
        );
    }

    #[test]
    fn test_channel_display() {
        assert_eq!(UpdateChannel::Stable.to_string(), "stable");
        assert_eq!(UpdateChannel::Beta.to_string(), "beta");
        assert_eq!(UpdateChannel::Nightly.to_string(), "nightly");
    }

    #[test]
    fn test_critical_detection() {
        let checker = UpdateChecker::default_repo(UpdateChannel::Stable);

        let critical_release = GitHubRelease {
            tag_name: "v1.0.1".to_string(),
            name: Some("Security Fix".to_string()),
            body: Some("Fixed CVE-2024-1234".to_string()),
            html_url: "https://github.com/test/test".to_string(),
            prerelease: false,
            draft: false,
            published_at: "2024-01-01".to_string(),
            assets: vec![],
        };

        assert!(checker.is_critical_update(&critical_release));

        let normal_release = GitHubRelease {
            tag_name: "v1.0.1".to_string(),
            name: Some("Bug fixes".to_string()),
            body: Some("Minor improvements".to_string()),
            html_url: "https://github.com/test/test".to_string(),
            prerelease: false,
            draft: false,
            published_at: "2024-01-01".to_string(),
            assets: vec![],
        };

        assert!(!checker.is_critical_update(&normal_release));
    }

    #[test]
    fn test_download_url_extraction() {
        let checker = UpdateChecker::default_repo(UpdateChannel::Stable);

        let assets = vec![
            GitHubAsset {
                name: "wormhole-macos-arm64.tar.gz".to_string(),
                browser_download_url: "https://example.com/macos-arm64".to_string(),
                size: 1000,
            },
            GitHubAsset {
                name: "wormhole-linux-x86_64.tar.gz".to_string(),
                browser_download_url: "https://example.com/linux-x64".to_string(),
                size: 1000,
            },
            GitHubAsset {
                name: "wormhole-windows-x64.exe".to_string(),
                browser_download_url: "https://example.com/windows-x64".to_string(),
                size: 1000,
            },
        ];

        let urls = checker.extract_download_urls(&assets);

        assert_eq!(
            urls.macos_arm64,
            Some("https://example.com/macos-arm64".to_string())
        );
        assert_eq!(
            urls.linux_x64,
            Some("https://example.com/linux-x64".to_string())
        );
        assert_eq!(
            urls.windows_x64,
            Some("https://example.com/windows-x64".to_string())
        );
    }
}
