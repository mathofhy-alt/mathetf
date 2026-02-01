
const fs = require('fs');
const zlib = require('zlib');

const files = ['probe_2.bmp', 'probe_3.bmp'];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    console.log(`Analyzing ${file}...`);
    const data = fs.readFileSync(file);
    console.log(`  Header: ${data.toString('hex', 0, 16)}`);

    // Attempt 1: InflateRaw (Deflate without header)
    try {
        const decompressed = zlib.inflateRawSync(data);
        console.log(`  [Success] InflateRaw produced ${decompressed.length} bytes.`);
        console.log(`  Decompressed Header: ${decompressed.toString('hex', 0, 16)}`);
        const header = decompressed.toString('ascii', 0, 2);
        if (header === 'BM') console.log('  -> IT IS A BMP!');
        else if (header === 'PNG') console.log('  -> IT IS A PNG!'); // PNG header is usually 89 50...
        else if (decompressed[0] === 0xFF && decompressed[1] === 0xD8) console.log('  -> IT IS A JPG!');

        fs.writeFileSync(file + '.raw_inflated.bmp', decompressed);
    } catch (e) {
        console.log(`  [Fail] InflateRaw: ${e.message}`);
    }

    // Attempt 2: Strip 4 bytes (maybe checksum?) and try Inflate
    try {
        const stripped = data.subarray(4); // Try various offsets if needed
        const decompressed = zlib.inflateSync(stripped);
        console.log(`  [Success] Strip 4 + Inflate produced ${decompressed.length} bytes.`);
        console.log(`  Decompressed Header: ${decompressed.toString('hex', 0, 16)}`);
    } catch (e) {
        // console.log(`  [Fail] Strip 4 + Inflate: ${e.message}`);
    }
});
