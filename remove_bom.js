
const fs = require('fs');

try {
    const filePath = '재조립양식.hml';
    const content = fs.readFileSync(filePath);

    let startOffset = 0;
    if (content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
        console.log('UTF-8 BOM detected. Removing...');
        startOffset = 3;
    } else {
        console.log('No BOM detected.');
    }

    const cleanContent = content.slice(startOffset);

    // Write to a new file to avoid destroying the original if this isn't the fix
    fs.writeFileSync('재조립양식_fixed.hml', cleanContent);
    console.log('Success: See 재조립양식_fixed.hml');

} catch (e) {
    console.error('Error:', e);
}
