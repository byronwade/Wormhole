//! Phase 8: Throughput Benchmarks
//!
//! Benchmarks for measuring:
//! - BLAKE3 hashing performance
//! - Sequential file read throughput
//! - Buffer pool acquisition overhead
//! - Compression performance
//!
//! Run with: cargo bench --bench throughput -p teleport-daemon

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::hint::black_box as hint_black_box;

// Import from teleport-core
use teleport_core::buffer_pool::{BufferPool, BULK_CHUNK_SIZE, RANDOM_CHUNK_SIZE};
use teleport_core::compression::SmartCompressor;
use teleport_core::types::ContentHash;

/// Benchmark BLAKE3 hashing at different sizes
fn bench_blake3_hashing(c: &mut Criterion) {
    let mut group = c.benchmark_group("blake3_hash");

    // Test various chunk sizes
    let sizes = [
        ("128KB", RANDOM_CHUNK_SIZE),
        ("1MB", 1024 * 1024),
        ("4MB", BULK_CHUNK_SIZE),
        ("16MB", 16 * 1024 * 1024),
    ];

    for (name, size) in sizes {
        // Create test data
        let data: Vec<u8> = (0..size).map(|i| (i % 256) as u8).collect();

        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(BenchmarkId::new("size", name), &data, |b, data| {
            b.iter(|| {
                let hash = ContentHash::compute(black_box(data));
                hint_black_box(hash)
            })
        });
    }

    group.finish();
}

/// Benchmark buffer pool acquisition/release
fn bench_buffer_pool(c: &mut Criterion) {
    let mut group = c.benchmark_group("buffer_pool");

    // Test bulk buffer pool
    let pool = BufferPool::new(16, BULK_CHUNK_SIZE);

    group.bench_function("acquire_release_bulk", |b| {
        b.iter(|| {
            let buffer = pool.try_acquire().expect("pool exhausted");
            hint_black_box(&buffer);
            drop(buffer); // Return to pool
        })
    });

    // Test random-access buffer pool
    let random_pool = BufferPool::new(64, RANDOM_CHUNK_SIZE);

    group.bench_function("acquire_release_random", |b| {
        b.iter(|| {
            let buffer = random_pool.try_acquire().expect("pool exhausted");
            hint_black_box(&buffer);
            drop(buffer);
        })
    });

    group.finish();
}

/// Benchmark compression decisions and operations
fn bench_compression(c: &mut Criterion) {
    let mut group = c.benchmark_group("compression");

    let compressor = SmartCompressor::new();

    // Highly compressible text data
    let text_data = "The quick brown fox jumps over the lazy dog. ".repeat(100_000);
    let text_bytes = text_data.as_bytes();

    group.throughput(Throughput::Bytes(text_bytes.len() as u64));
    group.bench_function("compress_text_4mb", |b| {
        b.iter(|| {
            let result = compressor.compress(black_box(text_bytes));
            hint_black_box(result)
        })
    });

    // Already high-entropy data (won't compress well)
    let random_data: Vec<u8> = (0..BULK_CHUNK_SIZE).map(|i| ((i * 7 + 13) % 256) as u8).collect();

    group.throughput(Throughput::Bytes(random_data.len() as u64));
    group.bench_function("compress_random_4mb", |b| {
        b.iter(|| {
            let result = compressor.compress(black_box(&random_data));
            hint_black_box(result)
        })
    });

    // Benchmark should_compress decision
    group.bench_function("should_compress_check", |b| {
        b.iter(|| {
            let should = compressor.should_compress(black_box("data.txt"), black_box(text_bytes));
            hint_black_box(should)
        })
    });

    // Benchmark entropy calculation
    let sample_data: Vec<u8> = (0..4096).map(|i| (i % 256) as u8).collect();
    group.bench_function("entropy_calculation", |b| {
        b.iter(|| {
            let entropy = SmartCompressor::shannon_entropy(black_box(&sample_data));
            hint_black_box(entropy)
        })
    });

    group.finish();
}

/// Benchmark decompression
fn bench_decompression(c: &mut Criterion) {
    let mut group = c.benchmark_group("decompression");

    let compressor = SmartCompressor::new();

    // Compress text data first
    let text_data = "The quick brown fox jumps over the lazy dog. ".repeat(100_000);
    let compressed = compressor.compress(text_data.as_bytes()).unwrap();

    group.throughput(Throughput::Bytes(text_data.len() as u64));
    group.bench_function("decompress_text_4mb", |b| {
        b.iter(|| {
            let result = compressor.decompress(black_box(&compressed));
            hint_black_box(result)
        })
    });

    group.finish();
}

/// Benchmark sequential memory operations (baseline for comparison)
fn bench_memory_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("memory_throughput");

    let size = BULK_CHUNK_SIZE; // 4MB
    let src: Vec<u8> = (0..size).map(|i| (i % 256) as u8).collect();

    group.throughput(Throughput::Bytes(size as u64));

    group.bench_function("memcpy_4mb", |b| {
        b.iter_batched(
            || vec![0u8; size],
            |mut dst| {
                dst.copy_from_slice(black_box(&src));
                dst
            },
            criterion::BatchSize::SmallInput,
        )
    });

    group.finish();
}

/// Benchmark content hash comparison
fn bench_hash_comparison(c: &mut Criterion) {
    let mut group = c.benchmark_group("hash_operations");

    // Create two hashes
    let data1 = b"Hello, Wormhole!";
    let data2 = b"Hello, Wormhole?";
    let hash1 = ContentHash::compute(data1);
    let hash2 = ContentHash::compute(data2);
    let hash1_clone = ContentHash::compute(data1);

    group.bench_function("hash_equality_check", |b| {
        b.iter(|| {
            let eq1 = black_box(&hash1) == black_box(&hash1_clone);
            let eq2 = black_box(&hash1) == black_box(&hash2);
            hint_black_box((eq1, eq2))
        })
    });

    group.bench_function("hash_to_hex", |b| {
        b.iter(|| {
            let hex = black_box(&hash1).to_hex();
            hint_black_box(hex)
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_blake3_hashing,
    bench_buffer_pool,
    bench_compression,
    bench_decompression,
    bench_memory_throughput,
    bench_hash_comparison,
);

criterion_main!(benches);
