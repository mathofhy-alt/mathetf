
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const LOG_FILE = 'node_hml_debug_standalone.log';

function log(msg: string) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
    console.log(msg);
}

function tryResizeImage(buffer: Buffer, originalId: string): { buffer: Buffer, resized: boolean, format?: string } {
    // Threshold: 10KB (Forcing resize for test)
    if (buffer.length <= 10 * 1024) {
        log(`Skipping small image ${originalId}: ${buffer.length}`);
        return { buffer, resized: false };
    };

    try {
        log(`CHECK RESIZE ${originalId} Size: ${buffer.length}`);

        const tempId = Math.random().toString(36).substring(7);
        const tempInput = path.join(os.tmpdir(), `resize_in_${tempId}.bin`);
        const tempOutput = path.join(os.tmpdir(), `resize_out_${tempId}.jpg`);

        fs.writeFileSync(tempInput, buffer);

        // Path Verification
        const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
        const scriptPath = path.resolve(process.cwd(), 'resize_image.py');

        log(`Python Path: ${pythonPath}`);
        log(`Script Path: ${scriptPath}`);

        if (!fs.existsSync(pythonPath)) {
            log(`ERROR: Python not found at ${pythonPath}`);
            return { buffer, resized: false };
        }
        if (!fs.existsSync(scriptPath)) {
            log(`ERROR: Script not found at ${scriptPath}`);
            return { buffer, resized: false };
        }

        execFileSync(pythonPath, [scriptPath, tempInput, tempOutput]);

        if (fs.existsSync(tempOutput)) {
            const outBuffer = fs.readFileSync(tempOutput);

            // Cleanup
            fs.unlinkSync(tempInput);
            fs.unlinkSync(tempOutput);

            log(`RESIZED ${originalId}: ${buffer.length} -> ${outBuffer.length}`);

            return { buffer: outBuffer, resized: true, format: 'jpg' };
        } else {
            log(`RESIZE FAILED (No Output) ${originalId}`);
        }
    } catch (err: any) {
        log(`RESIZE CRASH ${originalId}: ${err.message}`);
        if (err.stdout) log(`STDOUT: ${err.stdout.toString()}`);
        if (err.stderr) log(`STDERR: ${err.stderr.toString()}`);
    }
    return { buffer, resized: false };
}

// MAIN
async function main() {
    log('--- STARTING STANDALONE RESIZE TEST ---');
    log(`CWD: ${process.cwd()}`);

    // Create a dummy large image (random noise) - 1MB
    const size = 1024 * 1024;
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buffer[i] = Math.floor(Math.random() * 256);

    // Write dummy to file to test real read
    fs.writeFileSync('test_large_input.bin', buffer);

    // Run Resize
    const result = tryResizeImage(buffer, 'TEST_IMG_001');

    log(`Result: Resized=${result.resized}, Size=${result.buffer.length}`);

    if (result.resized && result.buffer.length < size) {
        log('SUCCESS: Image was resized.');
    } else {
        log('FAILURE: Image was NOT resized.');
    }
}

main();
