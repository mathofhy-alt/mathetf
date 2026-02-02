
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const LOG_FILE = 'node_hml_debug_standalone.log';

function log(msg) {
    try {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { }
    console.log(msg);
}

function tryResizeImage(buffer, originalId) {
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
            fs.unlinkSync(tempInput);
            fs.unlinkSync(tempOutput);

            log(`RESIZED ${originalId}: ${buffer.length} -> ${outBuffer.length}`);
            return { buffer: outBuffer, resized: true, format: 'jpg' };
        } else {
            log(`RESIZE FAILED (No Output) ${originalId}`);
        }
    } catch (err) {
        log(`RESIZE CRASH ${originalId}: ${err.message}`);
        if (err.stdout) log(`STDOUT: ${err.stdout.toString()}`);
        if (err.stderr) log(`STDERR: ${err.stderr.toString()}`);
    }
    return { buffer, resized: false };
}

// MAIN
const size = 1024 * 1024; // 1MB
const buffer = Buffer.alloc(size);
for (let i = 0; i < size; i++) buffer[i] = Math.floor(Math.random() * 256);

// Force it to be a valid BMP header to maybe help Pillow? 
// No, random noise is fine, Pillow might just fail to open it as image.
// Let's copy a REAL image if possible.
// I see 'test_input.bmp' in list_dir?
if (fs.existsSync('test_input.bmp')) {
    log('Using test_input.bmp');
    const realBuf = fs.readFileSync('test_input.bmp');
    tryResizeImage(realBuf, 'REAL_BMP');
} else {
    log('Using Random Noise (Expected to fail Pillow open but prove execution)');
    tryResizeImage(buffer, 'RANDOM_NOISE');
}
