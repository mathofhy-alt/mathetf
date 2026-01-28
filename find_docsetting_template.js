
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '재조립양식.hml');

try {
    if (!fs.existsSync(filePath)) {
        console.log('Template file not found: ' + filePath);
        process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Find DOCSETTING
    const dsRegex = /<DOCSETTING[^>]*>/g;
    const ds = content.match(dsRegex);
    console.log('--- DOCSETTING ---');
    console.log(ds ? ds[0] : 'Not Found');

    // Find BEGINNUMBER
    const bnRegex = /<BEGINNUMBER[^>]*>/g;
    const bn = content.match(bnRegex);
    console.log('--- BEGINNUMBER ---');
    console.log(bn ? bn[0] : 'Not Found');

} catch (e) {
    console.error(e);
}
