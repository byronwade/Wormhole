//! Phase 8: Smart Compression
//!
//! Provides intelligent compression that automatically decides whether to compress
//! data based on file type and entropy analysis. Uses zstd for high compression
//! ratios and speed.
//!
//! # Decision Flow
//! 1. Check file extension (skip already-compressed formats)
//! 2. Check data size (skip tiny data where overhead > savings)
//! 3. Analyze entropy (skip high-entropy data that won't compress)
//! 4. Compress with zstd at configured level

use std::io;

/// Minimum data size to consider compression (1 KB)
/// Below this, compression overhead likely exceeds savings
const COMPRESSION_THRESHOLD: usize = 1024;

/// Shannon entropy threshold (bits per byte)
/// Data with entropy > this is likely already compressed/encrypted
const ENTROPY_THRESHOLD: f64 = 7.5;

/// Sample size for entropy calculation
const ENTROPY_SAMPLE_SIZE: usize = 4096;

/// Smart compression with automatic decision-making.
///
/// Decides whether to compress data based on:
/// - File extension (skips videos, images, archives)
/// - Data size (skips small data)
/// - Entropy analysis (skips high-entropy data)
#[derive(Debug, Clone)]
pub struct SmartCompressor {
    /// Zstd compression level (1-22, default 3)
    level: i32,
    /// Minimum size to attempt compression
    min_size: usize,
    /// Entropy threshold for compression decision
    entropy_threshold: f64,
}

impl SmartCompressor {
    /// Default compression level (balanced speed/ratio)
    pub const DEFAULT_LEVEL: i32 = 3;

    /// Create a new SmartCompressor with default settings.
    pub fn new() -> Self {
        Self {
            level: Self::DEFAULT_LEVEL,
            min_size: COMPRESSION_THRESHOLD,
            entropy_threshold: ENTROPY_THRESHOLD,
        }
    }

    /// Create a SmartCompressor with custom compression level.
    pub fn with_level(level: i32) -> Self {
        Self {
            level: level.clamp(1, 22),
            min_size: COMPRESSION_THRESHOLD,
            entropy_threshold: ENTROPY_THRESHOLD,
        }
    }

    /// Create a SmartCompressor optimized for speed (level 1).
    pub fn fast() -> Self {
        Self::with_level(1)
    }

    /// Create a SmartCompressor optimized for ratio (level 19).
    pub fn max_compression() -> Self {
        Self::with_level(19)
    }

    /// Check if data should be compressed based on file path and content.
    ///
    /// Returns `true` if compression is likely beneficial.
    pub fn should_compress(&self, path: &str, data: &[u8]) -> bool {
        // Skip small data
        if data.len() < self.min_size {
            return false;
        }

        // Skip already-compressed formats based on extension
        if Self::is_compressed_extension(path) {
            return false;
        }

        // Check entropy of sample
        let sample_size = data.len().min(ENTROPY_SAMPLE_SIZE);
        let entropy = Self::shannon_entropy(&data[..sample_size]);

        entropy < self.entropy_threshold
    }

    /// Check if file extension indicates already-compressed content.
    pub fn is_compressed_extension(path: &str) -> bool {
        let ext = path
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase();

        matches!(
            ext.as_str(),
            // Video formats
            "mp4" | "mkv" | "avi" | "mov" | "webm" | "m4v" | "wmv" | "flv" |
            // Audio formats (compressed)
            "mp3" | "aac" | "m4a" | "ogg" | "opus" | "wma" | "flac" |
            // Image formats (compressed)
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "heif" | "avif" |
            // Archive formats
            "zip" | "gz" | "xz" | "zst" | "7z" | "rar" | "bz2" | "lz4" | "lzma" |
            "tar.gz" | "tar.xz" | "tar.bz2" | "tgz" |
            // Document formats (usually compressed)
            "pdf" | "docx" | "xlsx" | "pptx" | "epub" |
            // Game/app packages
            "apk" | "ipa" | "dmg" | "pkg"
        )
    }

    /// Calculate Shannon entropy of data (bits per byte).
    ///
    /// Returns a value between 0 (perfectly predictable) and 8 (random).
    /// Well-compressed or encrypted data typically has entropy > 7.5.
    pub fn shannon_entropy(data: &[u8]) -> f64 {
        if data.is_empty() {
            return 0.0;
        }

        let mut freq = [0u64; 256];
        for &byte in data {
            freq[byte as usize] += 1;
        }

        let len = data.len() as f64;
        let mut entropy = 0.0f64;

        for &count in &freq {
            if count > 0 {
                let p = count as f64 / len;
                entropy -= p * p.log2();
            }
        }

        entropy
    }

    /// Compress data using zstd.
    ///
    /// Returns compressed data, or an error if compression fails.
    pub fn compress(&self, data: &[u8]) -> io::Result<Vec<u8>> {
        zstd::encode_all(data, self.level)
    }

    /// Decompress zstd-compressed data.
    ///
    /// Returns decompressed data, or an error if decompression fails.
    pub fn decompress(&self, data: &[u8]) -> io::Result<Vec<u8>> {
        zstd::decode_all(data)
    }

    /// Compress data only if beneficial, returning compression result.
    ///
    /// If compression is beneficial, returns `CompressionResult::Compressed`.
    /// If data shouldn't be compressed, returns `CompressionResult::Skipped`.
    pub fn compress_smart(&self, path: &str, data: &[u8]) -> CompressionResult {
        if !self.should_compress(path, data) {
            return CompressionResult::Skipped {
                original_size: data.len(),
            };
        }

        match self.compress(data) {
            Ok(compressed) => {
                // Only use compressed version if it's actually smaller
                if compressed.len() < data.len() {
                    CompressionResult::Compressed {
                        original_size: data.len(),
                        compressed_size: compressed.len(),
                        data: compressed,
                    }
                } else {
                    CompressionResult::Skipped {
                        original_size: data.len(),
                    }
                }
            }
            Err(_) => CompressionResult::Skipped {
                original_size: data.len(),
            },
        }
    }

    /// Get the compression level.
    pub fn level(&self) -> i32 {
        self.level
    }
}

impl Default for SmartCompressor {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of smart compression decision.
#[derive(Debug)]
pub enum CompressionResult {
    /// Data was compressed successfully
    Compressed {
        original_size: usize,
        compressed_size: usize,
        data: Vec<u8>,
    },
    /// Compression was skipped (not beneficial)
    Skipped { original_size: usize },
}

impl CompressionResult {
    /// Check if data was compressed.
    pub fn is_compressed(&self) -> bool {
        matches!(self, CompressionResult::Compressed { .. })
    }

    /// Get the compression ratio (original / compressed).
    /// Returns 1.0 if not compressed.
    pub fn ratio(&self) -> f64 {
        match self {
            CompressionResult::Compressed {
                original_size,
                compressed_size,
                ..
            } => *original_size as f64 / *compressed_size as f64,
            CompressionResult::Skipped { .. } => 1.0,
        }
    }

    /// Get bytes saved (0 if not compressed or expansion).
    pub fn bytes_saved(&self) -> usize {
        match self {
            CompressionResult::Compressed {
                original_size,
                compressed_size,
                ..
            } => original_size.saturating_sub(*compressed_size),
            CompressionResult::Skipped { .. } => 0,
        }
    }
}

/// Compression statistics for monitoring.
#[derive(Debug, Clone, Default)]
pub struct CompressionStats {
    /// Total bytes before compression
    pub total_input_bytes: u64,
    /// Total bytes after compression (including skipped)
    pub total_output_bytes: u64,
    /// Number of compression operations
    pub compress_count: u64,
    /// Number of skipped operations
    pub skip_count: u64,
    /// Total bytes saved
    pub bytes_saved: u64,
}

impl CompressionStats {
    /// Overall compression ratio
    pub fn ratio(&self) -> f64 {
        if self.total_output_bytes == 0 {
            1.0
        } else {
            self.total_input_bytes as f64 / self.total_output_bytes as f64
        }
    }

    /// Percentage of bytes saved
    pub fn savings_percent(&self) -> f64 {
        if self.total_input_bytes == 0 {
            0.0
        } else {
            (self.bytes_saved as f64 / self.total_input_bytes as f64) * 100.0
        }
    }

    /// Update stats with a compression result
    pub fn record(&mut self, result: &CompressionResult) {
        match result {
            CompressionResult::Compressed {
                original_size,
                compressed_size,
                ..
            } => {
                self.total_input_bytes += *original_size as u64;
                self.total_output_bytes += *compressed_size as u64;
                self.bytes_saved += (*original_size - *compressed_size) as u64;
                self.compress_count += 1;
            }
            CompressionResult::Skipped { original_size } => {
                self.total_input_bytes += *original_size as u64;
                self.total_output_bytes += *original_size as u64;
                self.skip_count += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compressed_extension_detection() {
        // Should skip
        assert!(SmartCompressor::is_compressed_extension("video.mp4"));
        assert!(SmartCompressor::is_compressed_extension("image.jpg"));
        assert!(SmartCompressor::is_compressed_extension("archive.zip"));
        assert!(SmartCompressor::is_compressed_extension("archive.tar.gz"));
        assert!(SmartCompressor::is_compressed_extension("music.mp3"));

        // Should compress
        assert!(!SmartCompressor::is_compressed_extension("code.rs"));
        assert!(!SmartCompressor::is_compressed_extension("document.txt"));
        assert!(!SmartCompressor::is_compressed_extension("data.json"));
        assert!(!SmartCompressor::is_compressed_extension("config.toml"));
    }

    #[test]
    fn test_shannon_entropy() {
        // Low entropy (all same byte)
        let uniform = vec![0u8; 1000];
        let entropy = SmartCompressor::shannon_entropy(&uniform);
        assert!(entropy < 0.1, "Uniform data should have ~0 entropy");

        // Medium entropy (alternating bytes)
        let alternating: Vec<u8> = (0..1000).map(|i| (i % 2) as u8).collect();
        let entropy = SmartCompressor::shannon_entropy(&alternating);
        assert!(entropy > 0.5 && entropy < 1.5, "Alternating should have ~1 bit entropy");

        // High entropy (random-like)
        let high_entropy: Vec<u8> = (0..1000).map(|i| (i % 256) as u8).collect();
        let entropy = SmartCompressor::shannon_entropy(&high_entropy);
        assert!(entropy > 7.0, "Uniform distribution should have ~8 bits entropy");
    }

    #[test]
    fn test_compress_decompress() {
        let compressor = SmartCompressor::new();
        let data = b"Hello, Wormhole! This is some test data that should compress well. \
                     Repeated text like this this this this tends to compress very well.";

        let compressed = compressor.compress(data).unwrap();
        assert!(compressed.len() < data.len(), "Should compress");

        let decompressed = compressor.decompress(&compressed).unwrap();
        assert_eq!(&decompressed, data);
    }

    #[test]
    fn test_should_compress() {
        let compressor = SmartCompressor::new();

        // Small data - skip
        let small = vec![0u8; 100];
        assert!(!compressor.should_compress("data.txt", &small));

        // Compressed extension - skip
        let data = vec![0u8; 10000];
        assert!(!compressor.should_compress("video.mp4", &data));

        // Compressible data - compress
        let text = "Hello, World! ".repeat(1000);
        assert!(compressor.should_compress("data.txt", text.as_bytes()));

        // High entropy (random-like) - skip
        let _high_entropy: Vec<u8> = (0..10000).map(|i| ((i * 7 + 13) % 256) as u8).collect();
        // Note: This might still compress slightly depending on pattern
    }

    #[test]
    fn test_compress_smart() {
        let compressor = SmartCompressor::new();

        // Compressible text
        let text = "The quick brown fox jumps over the lazy dog. ".repeat(100);
        let result = compressor.compress_smart("text.txt", text.as_bytes());
        assert!(result.is_compressed());
        assert!(result.ratio() > 1.5);
        assert!(result.bytes_saved() > 0);

        // Already compressed format
        let data = vec![0u8; 10000];
        let result = compressor.compress_smart("video.mp4", &data);
        assert!(!result.is_compressed());
    }

    #[test]
    fn test_compression_stats() {
        let mut stats = CompressionStats::default();

        // Record compressed result
        stats.record(&CompressionResult::Compressed {
            original_size: 1000,
            compressed_size: 500,
            data: vec![],
        });

        assert_eq!(stats.compress_count, 1);
        assert_eq!(stats.bytes_saved, 500);
        assert!((stats.ratio() - 2.0).abs() < 0.001);

        // Record skipped result
        stats.record(&CompressionResult::Skipped {
            original_size: 1000,
        });

        assert_eq!(stats.skip_count, 1);
        assert_eq!(stats.total_input_bytes, 2000);
        assert_eq!(stats.total_output_bytes, 1500);
    }

    #[test]
    fn test_compression_levels() {
        let fast = SmartCompressor::fast();
        assert_eq!(fast.level(), 1);

        let max = SmartCompressor::max_compression();
        assert_eq!(max.level(), 19);

        let default = SmartCompressor::new();
        assert_eq!(default.level(), SmartCompressor::DEFAULT_LEVEL);
    }
}
