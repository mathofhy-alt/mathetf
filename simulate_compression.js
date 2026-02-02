
const zlib = require('zlib');
const fs = require('fs');

async function testCompression() {
    console.log('[TEST] Generating 2.5MB Dummy BMP (simulating Native Image)...');
    // Create a 1000x874 BMP (approx 2.6MB)
    // 54 bytes header + 1000*874*3 bytes data
    const width = 1000;
    const height = 874;
    const rowSize = (width * 3 + 3) & ~3; // Padding to 4 bytes
    const dataSize = rowSize * height;
    const fileSize = 54 + dataSize;

    const buffer = Buffer.alloc(fileSize);

    // BMP Header (Signature BM)
    buffer.write('BM', 0);
    buffer.writeUInt32LE(fileSize, 2);
    buffer.writeUInt32LE(54, 10); // Offset

    // DIB Header
    buffer.writeUInt32LE(40, 14); // Header size
    buffer.writeInt32LE(width, 18);
    buffer.writeInt32LE(height, 22);
    buffer.writeUInt16LE(1, 26); // Planes
    buffer.writeUInt16LE(24, 28); // BPP

    // Fill with semi-random data (compressible but not zero)
    // Repeating pattern to allow compression
    for (let i = 54; i < fileSize; i++) {
        buffer[i] = i % 255;
    }

    console.log(`[TEST] Original BMP Size: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // --- Scenario 1: Standard Deflate (Old logic) ---
    try {
        const deflated = zlib.deflateSync(buffer);
        console.log(`[TEST] Standard Deflate Size: ${deflated.length} bytes (${(deflated.length / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) { console.error('Std Deflate failed', e); }

    // --- Scenario 2: Raw Deflate (New Logic) ---
    try {
        const rawDeflated = zlib.deflateRawSync(buffer);
        console.log(`[TEST] Raw Deflate Size: ${rawDeflated.length} bytes (${(rawDeflated.length / 1024 / 1024).toFixed(2)} MB)`);

        // --- Verify HML Snippet Size ---
        const base64 = rawDeflated.toString('base64');
        const count = 44;
        const totalSize = base64.length * count;
        console.log(`[TEST] Simulated 44 Images Total Base64 Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

        // If uncompressed:
        const uncompressedBase64 = buffer.toString('base64');
        const totalUncompressed = uncompressedBase64.length * count;
        console.log(`[TEST] Simulated 44 Uncompressed Images Total Size: ${(totalUncompressed / 1024 / 1024).toFixed(2)} MB`);

    } catch (e) { console.error('Raw Deflate failed', e); }
}

testCompression();
