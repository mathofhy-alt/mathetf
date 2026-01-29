
const fs = require('fs');
const { DOMParser } = require('xmldom');

try {
    const xml = fs.readFileSync('재조립양식.hml', 'utf-8');
    console.log(`Read ${xml.length} characters.`);

    // Check for BOM
    if (xml.charCodeAt(0) === 0xFEFF) {
        console.log('BOM detected.');
    } else {
        console.log('No BOM.');
    }

    const doc = new DOMParser({
        errorHandler: {
            warning: (w) => console.log('Warning:', w),
            error: (e) => console.log('Error:', e),
            fatalError: (e) => console.log('Fatal Error:', e)
        }
    }).parseFromString(xml, 'text/xml');

    console.log('Parser completed.');
    const root = doc.documentElement;
    if (!root) {
        console.error('No root element found!');
    } else {
        console.log(`Root tag: ${root.tagName}`);
    }

} catch (e) {
    console.error('Exception:', e);
}
