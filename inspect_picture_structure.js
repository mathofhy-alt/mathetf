
const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('xmldom');

const filePath = path.join(__dirname, '20260128디버깅대조군.hml');

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');

    const pictures = doc.getElementsByTagName('PICTURE');
    console.log(`Found ${pictures.length} PICTURE tags.\n`);

    if (pictures.length > 0) {
        const pic = pictures[0];
        const serializer = new XMLSerializer();
        // Pretty print logic (hacky but works for inspection)
        const xml = serializer.serializeToString(pic);
        console.log(xml.replace(/>/g, '>\n').replace(/</g, '\n<'));
    }

} catch (e) {
    console.error(e);
}
