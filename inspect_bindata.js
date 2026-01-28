const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || path.join(__dirname, '20260128디버깅대조군.hml');

try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Find all BINDATA tags
    const regex = /<BINDATA[^>]*?Id="(\d+)"[^>]*?Size="(\d+)"[^>]*?>([\s\S]*?)<\/BINDATA>/g;
    let match;

    console.log(`Inspecting ${filePath}...`);

    while ((match = regex.exec(content)) !== null) {
        const id = match[1];
        const declaredSize = parseInt(match[2], 10);
        const body = match[3].replace(/\s/g, ''); // Remove whitespace (newlines)

        // Calculate actual binary size from Base64
        const padding = (body.endsWith('==')) ? 2 : (body.endsWith('=') ? 1 : 0);
        const actualSize = (body.length * 3 / 4) - padding;

        const rawBody = match[3];
        console.log(`[BINDATA Id=${id}]`);
        console.log(`  Declared Size: ${declaredSize}`);
        console.log(`  Raw Content Length: ${rawBody.length}`);
        console.log(`  Actual Binary Size: ${actualSize}`);

        // Check Header for Magic Bytes
        const buffer = Buffer.from(body.substring(0, 20), 'base64');
        console.log(`  Header (Hex): ${buffer.toString('hex')}`);

        if (buffer.toString('hex').startsWith('ffd8')) {
            console.log(`  Detected Type: JPG`);
        } else if (buffer.toString('hex').startsWith('89504e47')) {
            console.log(`  Detected Type: PNG`);
        } else {
            console.log(`  Detected Type: Unknown`);
        }

        if (declaredSize === actualSize) {
            console.log("  PASS: Size matches.");
        } else {
            console.error(`  FAIL: Size Mismatch! Diff: ${actualSize - declaredSize}`);
        }
        console.log('---');
    }
} catch (e) {
    console.error(e);
}

