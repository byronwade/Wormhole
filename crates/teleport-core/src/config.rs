//! Configuration system for Wormhole
//!
//! Supports TOML configuration files with sensible defaults.
//! Configuration is loaded from:
//! - macOS: ~/Library/Application Support/wormhole/config.toml
//! - Linux: ~/.config/wormhole/config.toml
//! - Windows: %APPDATA%/wormhole/config.toml

use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Host/server settings
    pub host: HostConfig,
    /// Client/mount settings
    pub client: ClientConfig,
    /// Cache settings
    pub cache: CacheConfig,
    /// Signal server settings
    pub signal: SignalConfig,
    /// Network settings
    pub network: NetworkConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: HostConfig::default(),
            client: ClientConfig::default(),
            cache: CacheConfig::default(),
            signal: SignalConfig::default(),
            network: NetworkConfig::default(),
        }
    }
}

/// Host/server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct HostConfig {
    /// Default QUIC port for hosting
    pub port: u16,
    /// Bind address
    pub bind: IpAddr,
    /// Allow writes from clients
    pub writable: bool,
    /// Auto-generate certificates if missing
    pub auto_cert: bool,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            port: 4433,
            bind: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
            writable: false,
            auto_cert: true,
        }
    }
}

/// Client/mount configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ClientConfig {
    /// Default mount point (optional)
    pub mount_point: Option<PathBuf>,
    /// Read-ahead size in chunks (prefetch)
    pub read_ahead_chunks: usize,
    /// Attribute TTL in seconds
    pub attr_ttl_secs: u64,
    /// Directory listing TTL in seconds
    pub dir_ttl_secs: u64,
    /// Sync interval for dirty chunks (seconds)
    pub sync_interval_secs: u64,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            mount_point: None,
            read_ahead_chunks: 4,
            attr_ttl_secs: 1,
            dir_ttl_secs: 1,
            sync_interval_secs: 1,
        }
    }
}

/// Cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CacheConfig {
    /// Maximum disk cache size in bytes (default 10GB)
    pub max_disk_bytes: u64,
    /// Maximum RAM cache size in bytes (default 512MB)
    pub max_ram_bytes: u64,
    /// Cache directory (uses system cache dir if None)
    pub cache_dir: Option<PathBuf>,
    /// Chunk TTL in seconds (how long to keep cached chunks)
    pub chunk_ttl_secs: u64,
    /// GC interval in seconds
    pub gc_interval_secs: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_disk_bytes: 10 * 1024 * 1024 * 1024, // 10GB
            max_ram_bytes: 512 * 1024 * 1024,         // 512MB
            cache_dir: None,
            chunk_ttl_secs: 3600, // 1 hour
            gc_interval_secs: 60, // 1 minute
        }
    }
}

/// Signal server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SignalConfig {
    /// Signal server port
    pub port: u16,
    /// Bind address
    pub bind: IpAddr,
    /// Database path (None = in-memory)
    pub db_path: Option<PathBuf>,
    /// Room idle timeout in seconds
    pub room_idle_timeout_secs: u64,
    /// Maximum peers per room
    pub max_peers_per_room: usize,
    /// Public signal server URL (for clients)
    pub public_url: Option<String>,
}

impl Default for SignalConfig {
    fn default() -> Self {
        Self {
            port: 8080,
            bind: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
            db_path: None,
            room_idle_timeout_secs: 300, // 5 minutes
            max_peers_per_room: 10,
            public_url: None,
        }
    }
}

/// Network configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct NetworkConfig {
    /// Connection timeout in seconds
    pub connect_timeout_secs: u64,
    /// Request timeout in seconds
    pub request_timeout_secs: u64,
    /// Keep-alive interval in seconds
    pub keepalive_secs: u64,
    /// Maximum concurrent streams per connection
    pub max_streams: u32,
    /// Enable QUIC 0-RTT (faster reconnects, less secure)
    pub enable_0rtt: bool,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            connect_timeout_secs: 10,
            request_timeout_secs: 30,
            keepalive_secs: 15,
            max_streams: 100,
            enable_0rtt: false,
        }
    }
}

impl Config {
    /// Load configuration from the default path
    pub fn load() -> Self {
        match Self::default_path() {
            Some(path) => Self::load_from(&path).unwrap_or_else(|e| {
                warn!("Failed to load config from {:?}: {}, using defaults", path, e);
                Self::default()
            }),
            None => {
                debug!("No config directory found, using defaults");
                Self::default()
            }
        }
    }

    /// Load configuration from a specific path
    pub fn load_from(path: &Path) -> Result<Self, ConfigError> {
        if !path.exists() {
            debug!("Config file {:?} not found, using defaults", path);
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(path)
            .map_err(|e| ConfigError::Io(e.to_string()))?;

        let config: Config = toml::from_str(&content)
            .map_err(|e| ConfigError::Parse(e.to_string()))?;

        info!("Loaded config from {:?}", path);
        Ok(config)
    }

    /// Save configuration to the default path
    pub fn save(&self) -> Result<(), ConfigError> {
        match Self::default_path() {
            Some(path) => self.save_to(&path),
            None => Err(ConfigError::NoConfigDir),
        }
    }

    /// Save configuration to a specific path
    pub fn save_to(&self, path: &Path) -> Result<(), ConfigError> {
        // Create parent directory if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| ConfigError::Io(e.to_string()))?;
        }

        let content = toml::to_string_pretty(self)
            .map_err(|e| ConfigError::Serialize(e.to_string()))?;

        std::fs::write(path, content)
            .map_err(|e| ConfigError::Io(e.to_string()))?;

        info!("Saved config to {:?}", path);
        Ok(())
    }

    /// Get the default config file path
    pub fn default_path() -> Option<PathBuf> {
        ProjectDirs::from("com", "wormhole", "wormhole")
            .map(|dirs| dirs.config_dir().join("config.toml"))
    }

    /// Get the default cache directory
    pub fn default_cache_dir() -> Option<PathBuf> {
        ProjectDirs::from("com", "wormhole", "wormhole")
            .map(|dirs| dirs.cache_dir().to_path_buf())
    }

    /// Get the effective cache directory (config override or system default)
    pub fn cache_dir(&self) -> PathBuf {
        self.cache.cache_dir.clone()
            .or_else(|| Self::default_cache_dir())
            .unwrap_or_else(|| PathBuf::from("/tmp/wormhole"))
    }

    /// Generate a sample configuration file content
    pub fn sample() -> String {
        let config = Self::default();
        toml::to_string_pretty(&config).unwrap_or_else(|_| String::new())
    }
}

/// Configuration errors
#[derive(Debug, Clone)]
pub enum ConfigError {
    /// I/O error
    Io(String),
    /// Parse error
    Parse(String),
    /// Serialization error
    Serialize(String),
    /// No config directory available
    NoConfigDir,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::Io(e) => write!(f, "I/O error: {}", e),
            ConfigError::Parse(e) => write!(f, "Parse error: {}", e),
            ConfigError::Serialize(e) => write!(f, "Serialization error: {}", e),
            ConfigError::NoConfigDir => write!(f, "No configuration directory available"),
        }
    }
}

impl std::error::Error for ConfigError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.host.port, 4433);
        assert_eq!(config.signal.port, 8080);
        assert_eq!(config.cache.max_disk_bytes, 10 * 1024 * 1024 * 1024);
    }

    #[test]
    fn test_config_serialization() {
        let config = Config::default();
        let toml_str = toml::to_string(&config).unwrap();
        let parsed: Config = toml::from_str(&toml_str).unwrap();
        assert_eq!(parsed.host.port, config.host.port);
    }

    #[test]
    fn test_partial_config() {
        let toml_str = r#"
            [host]
            port = 5000
        "#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(config.host.port, 5000);
        // Other values should be defaults
        assert_eq!(config.signal.port, 8080);
    }

    #[test]
    fn test_sample_config() {
        let sample = Config::sample();
        assert!(sample.contains("[host]"));
        assert!(sample.contains("[cache]"));
        assert!(sample.contains("[signal]"));
    }

    #[test]
    fn test_config_load_missing() {
        let config = Config::load_from(Path::new("/nonexistent/config.toml")).unwrap();
        assert_eq!(config.host.port, 4433); // Should use defaults
    }
}
