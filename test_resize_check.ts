
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const testFile = 'test_large_image.bin'; // We need an actual image for PIL to open. 
// Writing random bytes won't work because PIL needs valid header.
// I will copy one of the uploaded images if possible?
// Or I will try to generate a BMP header manually.

// Simple BMP Header (minimal) to make a valid 1000x1000 BMP approx 3MB.
function createLargeBMP(filename: string) {
    const width = 1000;
    const height = 1000;
    const rowSize = (width * 3 + 3) & ~3;
    const size = 54 + rowSize * height;

    const buffer = Buffer.alloc(size);

    // Header
    buffer.write('BM', 0);
    buffer.writeUInt32LE(size, 2);
    buffer.writeUInt32LE(54, 10); // Offset

    // DIB Header
    buffer.writeUInt32LE(40, 14);
    buffer.writeUInt32LE(width, 18);
    buffer.writeUInt32LE(height, 22);
    buffer.writeUInt16LE(1, 26); // Planes
    buffer.writeUInt16LE(24, 28); // BitCount

    // Fill data with noise
    for (let i = 54; i < size; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }

    fs.writeFileSync(filename, buffer);
    console.log(`Created ${filename} size: ${buffer.length}`);
}

try {
    const inputPath = path.resolve('test_input.bmp');
    createLargeBMP(inputPath);

    const outputPath = path.resolve('test_output.jpg');
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
    const scriptPath = path.resolve(process.cwd(), 'resize_image.py');

    console.log('Python Path:', pythonPath);
    console.log('Script Path:', scriptPath);

    console.log('Executing...');
    const stdout = execFileSync(pythonPath, [scriptPath, inputPath, outputPath]);
    console.log('Stdout:', stdout.toString());

    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        console.log(`Success! Output size: ${stat.size}`);
        if (stat.size < 3000000) { // Should be much smaller than 3MB
            console.log('Compression Verified.');
        } else {
            console.log('Compression Failed (Size did not decrease much).');
        }
    } else {
        console.error('Output file missing!');
    }

} catch (err) {
    console.error('Execution Failed:', err);
}
