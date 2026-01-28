
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '20260128디버깅대조군.hml');

try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`Loaded file: ${filePath} (${content.length} bytes)`);

    // 1. Find BINITEMS in HEAD
    console.log('\n--- BINITEM Tags (HEAD) ---');
    const binItemRegex = /<BINITEM[^>]*>/g;
    const binItems = content.match(binItemRegex);
    if (binItems) {
        binItems.slice(0, 5).forEach(item => console.log(item));
        if (binItems.length > 5) console.log(`... and ${binItems.length - 5} more.`);
    } else {
        console.log('No BINITEM tags found.');
    }

    // 2. Find PICTURE/IMAGE in BODY
    console.log('\n--- PICTURE/IMAGE Tags (BODY) ---');
    // Match PICTURE tags and their inner IMAGE tags
    // Simple regex for demonstration, trying to capture context
    const imageTagRegex = /<IMAGE[^>]*>/g;
    const imageTags = content.match(imageTagRegex);

    if (imageTags) {
        // Show a few unique examples
        const uniqueTags = [...new Set(imageTags)];
        uniqueTags.slice(0, 5).forEach(tag => console.log(tag));
    } else {
        console.log('No IMAGE tags found via simple regex.');
    }

    // 3. Find BINDATA in TAIL (Attributes only)
    console.log('\n--- BINDATA Tags (TAIL - Attributes Only) ---');
    const binDataRegex = /<BINDATA[^>]*>/g;
    const binDataTags = content.match(binDataRegex);
    if (binDataTags) {
        binDataTags.slice(0, 3).forEach(tag => console.log(tag));
    } else {
        console.log('No BINDATA tags found.');
    }

} catch (e) {
    console.error('Error reading file:', e);
}
