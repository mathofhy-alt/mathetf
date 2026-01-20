
import * as fs from 'fs';

const filename = 'test_hml_v2_output.hml';
const content = fs.readFileSync(filename, 'utf8');

// Check for xmlns injection
const xmlnsMatches = content.match(/xmlns="[^"]*"/g);
if (xmlnsMatches) {
    console.log('[POLLUTION] Found xmlns attributes:', [...new Set(xmlnsMatches)]);
} else {
    console.log('[CLEAN] No xmlns attributes found.');
}

// Check for whitespace between P tags in the SECTION
const bodyStart = content.indexOf('<BODY>');
const bodyEnd = content.indexOf('</BODY>');
const body = content.substring(bodyStart, bodyEnd);

if (/>\s+<P/.test(body) || />\s+<TEXT/.test(body)) {
    console.log('[POLLUTION] Found whitespace between tags in BODY!');
    const match = body.match(/>(\s+)<P/);
    if (match) {
        console.log('Sample whitespace (hex):', Buffer.from(match[1]).toString('hex'));
    }
} else {
    console.log('[CLEAN] No extra whitespace found in BODY.');
}

// Check for self-closing tags that should be full
const selfClosing = content.match(/<(P|TEXT|SECTION)[^>]*\/>/g);
if (selfClosing) {
    console.log('[NOTICE] Found self-closing structural tags:', [...new Set(selfClosing)]);
}
