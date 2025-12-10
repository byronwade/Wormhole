//! Smart compression module for Phase 8 bulk transfers.
//!
//! This module provides intelligent compression that:
//! - Skips already-compressed file types (mp4, jpg, zip, etc.)
//! - Uses Shannon entropy to detect compressibility
//! - Uses zstd for fast, efficient compression

use std::io::{self, Read, Write};

/// Minimum size for compression to be worthwhile (1KB).
pub const COMPRESSION_THRESHOLD: usize = 1024;

/// Shannon entropy threshold - above this, data is likely already compressed.
/// Maximum entropy is 8.0 (for truly random data). Compressed data is typically >7.5.
pub const ENTROPY_THRESHOLD: f64 = 7.5;

/// Smart compressor that decides whether and how to compress data.
#[derive(Debug, Clone)]
pub struct SmartCompressor {
    /// Zstd compression level (1-22, default 3 for speed).
    level: i32,
}

impl SmartCompressor {
    /// Create a new compressor with default settings.
    pub fn new() -> Self {
        Self { level: 3 }
    }

    /// Create a compressor with a specific compression level.
    ///
    /// Levels 1-3 are fast, 10+ are slow but better ratio.
    pub fn with_level(level: i32) -> Self {
        Self {
            level: level.clamp(1, 22),
        }
    }

    /// Determine if data should be compressed based on file extension and entropy.
    pub fn should_compress(&self, path: &str, data: &[u8]) -> bool {
        // Too small to benefit from compression
        if data.len() < COMPRESSION_THRESHOLD {
            return false;
        }

        // Skip already-compressed file types
        if Self::is_compressed_extension(path) {
            return false;
        }

        // Check entropy of first 4KB to estimate compressibility
        let sample_size = data.len().min(4096);
        let entropy = Self::shannon_entropy(&data[..sample_size]);

        entropy < ENTROPY_THRESHOLD
    }

    /// Check if a file extension indicates already-compressed data.
    pub fn is_compressed_extension(path: &str) -> bool {
        let ext = path
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase();

        matches!(
            ext.as_str(),
            // Video
            "mp4" | "mkv" | "avi" | "mov" | "webm" | "m4v" | "wmv" | "flv" |
            // Archives
            "zip" | "gz" | "xz" | "zst" | "7z" | "rar" | "bz2" | "lz4" | "lzma" | "tar.gz" | "tgz" |
            // Images
            "jpg" | "jpeg" | "png" | "webp" | "gif" | "heic" | "heif" | "avif" |
            // Audio
            "mp3" | "aac" | "flac" | "ogg" | "m4a" | "opus" | "wma" |
            // Other compressed formats
            "pdf" | "docx" | "xlsx" | "pptx" | "epub" | "dmg" | "iso"
        )
    }

    /// Calculate Shannon entropy of data (0-8 bits per byte).
    ///
    /// - 0 = completely uniform (e.g., all zeros)
    /// - 8 = completely random (incompressible)
    /// - Typical text: 4-5
    /// - Compressed data: 7.5-8
    pub fn shannon_entropy(data: &[u8]) -> f64 {
        if data.is_empty() {
            return 0.0;
        }

        // Count byte frequencies
        let mut counts = [0u64; 256];
        for &byte in data {
            counts[byte as usize] += 1;
        }

        // Calculate entropy
        let len = data.len() as f64;
        let mut entropy = 0.0;

        for &count in &counts {
            if count > 0 {
                let p = count as f64 / len;
                entropy -= p * p.log2();
            }
        }

        entropy
    }

    /// Compress data using zstd.
    pub fn compress(&self, data: &[u8]) -> io::Result<Vec<u8>> {
        let mut encoder = zstd::Encoder::new(Vec::new(), self.level)?;
        encoder.write_all(data)?;
        encoder.finish()
    }

    /// Decompress zstd-compressed data.
    pub fn decompress(&self, data: &[u8]) -> io::Result<Vec<u8>> {
        let mut decoder = zstd::Decoder::new(data)?;
        let mut output = Vec::new();
        decoder.read_to_end(&mut output)?;
        Ok(output)
    }

    /// Compress data only if it's worth it, returning whether compression was used.
    ///
    /// Returns (data, was_compressed).
    pub fn compress_smart(&self, path: &str, data: &[u8]) -> CompressionResult {
        if !self.should_compress(path, data) {
            return CompressionResult::Skipped {
                original_size: data.len(),
            };
        }

        match self.compress(data) {
            Ok(compressed) => {
                // Only use compression if it actually reduced size
                if compressed.len() < data.len() {
                    CompressionResult::Compressed {
                        original_size: data.len(),
                        compressed_size: compressed.len(),
                        data: compressed,
                    }
                } else {
                    CompressionResult::NotWorthIt {
                        original_size: data.len(),
                    }
                }
            }
            Err(_) => CompressionResult::NotWorthIt {
                original_size: data.len(),
            },
        }
    }

    /// Get compression statistics for a piece of data.
    pub fn analyze(&self, path: &str, data: &[u8]) -> CompressionStats {
        let entropy = if data.is_empty() {
            0.0
        } else {
            Self::shannon_entropy(&data[..data.len().min(4096)])
        };

        let is_compressed_type = Self::is_compressed_extension(path);
        let would_compress = self.should_compress(path, data);

        CompressionStats {
            original_size: data.len(),
            entropy,
            is_compressed_type,
            would_compress,
        }
    }
}

impl Default for SmartCompressor {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics about compression analysis.
#[derive(Debug, Clone)]
pub struct CompressionStats {
    /// Original data size in bytes.
    pub original_size: usize,
    /// Shannon entropy (0-8).
    pub entropy: f64,
    /// Whether the file type is already compressed.
    pub is_compressed_type: bool,
    /// Whether compression would be attempted.
    pub would_compress: bool,
}

/// Result of a smart compression attempt.
#[derive(Debug, Clone)]
pub enum CompressionResult {
    /// Data was compressed successfully.
    Compressed {
        /// Original size before compression.
        original_size: usize,
        /// Compressed size.
        compressed_size: usize,
        /// The compressed data.
        data: Vec<u8>,
    },
    /// Compression was skipped (already compressed type or high entropy).
    Skipped {
        /// Original size (unchanged).
        original_size: usize,
    },
    /// Compression was attempted but didn't reduce size.
    NotWorthIt {
        /// Original size (unchanged).
        original_size: usize,
    },
}

impl CompressionResult {
    /// Check if the data was compressed.
    pub fn is_compressed(&self) -> bool {
        matches!(self, CompressionResult::Compressed { .. })
    }

    /// Get the compressed data if available, otherwise None.
    pub fn compressed_data(&self) -> Option<&[u8]> {
        match self {
            CompressionResult::Compressed { data, .. } => Some(data),
            _ => None,
        }
    }

    /// Get the original size.
    pub fn original_size(&self) -> usize {
        match self {
            CompressionResult::Compressed { original_size, .. } => *original_size,
            CompressionResult::Skipped { original_size } => *original_size,
            CompressionResult::NotWorthIt { original_size } => *original_size,
        }
    }

    /// Get the savings in bytes (0 if not compressed).
    pub fn savings(&self) -> usize {
        match self {
            CompressionResult::Compressed { original_size, compressed_size, .. } => {
                original_size.saturating_sub(*compressed_size)
            }
            _ => 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_entropy_zeros() {
        let data = vec![0u8; 1000];
        let entropy = SmartCompressor::shannon_entropy(&data);
        assert!(entropy < 0.1, "All zeros should have near-zero entropy");
    }

    #[test]
    fn test_entropy_text() {
        let data = b"Hello, World! This is a test of the entropy calculation.";
        let entropy = SmartCompressor::shannon_entropy(data);
        assert!(entropy > 3.0 && entropy < 5.0, "Text should have moderate entropy: {}", entropy);
    }

    #[test]
    fn test_compressed_extensions() {
        assert!(SmartCompressor::is_compressed_extension("video.mp4"));
        assert!(SmartCompressor::is_compressed_extension("image.jpg"));
        assert!(SmartCompressor::is_compressed_extension("archive.zip"));
        assert!(!SmartCompressor::is_compressed_extension("document.txt"));
        assert!(!SmartCompressor::is_compressed_extension("code.rs"));
    }

    #[test]
    fn test_should_compress() {
        let compressor = SmartCompressor::new();

        // Should compress text
        let text = b"Hello, World! ".repeat(100);
        assert!(compressor.should_compress("file.txt", &text));

        // Should not compress small data
        assert!(!compressor.should_compress("file.txt", b"tiny"));

        // Should not compress already-compressed types
        assert!(!compressor.should_compress("image.jpg", &text));
    }

    #[test]
    fn test_compress_decompress() {
        let compressor = SmartCompressor::new();
        let original = b"Hello, World! ".repeat(100);

        let compressed = compressor.compress(&original).unwrap();
        assert!(compressed.len() < original.len());

        let decompressed = compressor.decompress(&compressed).unwrap();
        assert_eq!(decompressed, original);
    }

    #[test]
    fn test_compress_smart() {
        let compressor = SmartCompressor::new();

        // Compressible text
        let text = b"Hello, World! ".repeat(100);
        let result = compressor.compress_smart("file.txt", &text);
        assert!(result.is_compressed());
        if let CompressionResult::Compressed { compressed_size, original_size, .. } = result {
            assert!(compressed_size < original_size);
        }

        // Already compressed type
        let result = compressor.compress_smart("file.mp4", &text);
        assert!(!result.is_compressed());
        assert!(matches!(result, CompressionResult::Skipped { .. }));
    }
}
