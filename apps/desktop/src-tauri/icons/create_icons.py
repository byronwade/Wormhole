#!/usr/bin/env python3
# Create simple placeholder PNG icons for Tauri
# Using raw PNG format with minimal libraries

import struct
import zlib

def create_png(size, filename):
    # Create a simple purple square PNG
    width = height = size
    
    # RGBA pixels - purple (#7C3AED) with full opacity
    r, g, b, a = 124, 58, 237, 255
    
    # Build raw image data (with filter byte per row)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter type: None
        for x in range(width):
            raw_data += bytes([r, g, b, a])
    
    # Compress the data
    compressed = zlib.compress(raw_data, 9)
    
    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    # Write PNG file
    with open(filename, 'wb') as f:
        f.write(signature + ihdr + idat + iend)
    
    print(f"Created {filename} ({size}x{size})")

# Create all required icon sizes
sizes = [
    (32, '32x32.png'),
    (128, '128x128.png'),
    (256, '128x128@2x.png'),
    (512, 'icon.png'),
]

for size, name in sizes:
    create_png(size, name)

print("Icons created successfully!")
