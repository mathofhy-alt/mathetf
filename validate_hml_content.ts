
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const targetFile = 'test_hml_v2_output.hml';
const referenceFile = 'repro_real_image.hml';

const targetContent = fs.readFileSync(targetFile, 'utf8');

console.log('--- Deep Content Validation ---');

const doc = new DOMParser().parseFromString(targetContent, 'text/xml');

// 1. Validate BINITEM Attributes Strictly
console.log('[Check] BINITEM Attributes');
const binItems = doc.getElementsByTagName('BINITEM');
for (let i = 0; i < binItems.length; i++) {
    const item = binItems[i];
    const binData = item.getAttribute('BinData');
    const format = item.getAttribute('Format');
    const type = item.getAttribute('Type');

    console.log(`  Item ${i + 1}: BinData="${binData}", Format="${format}", Type="${type}"`);

    if (!binData || isNaN(Number(binData))) console.error('    FAIL: Invalid BinData ID');
    // Hancom might be case-sensitive on Format? "png" vs "PNG"
    // Reference file usually has uppercase?
    if (format !== 'PNG' && format !== 'JPG' && format !== 'jpg' && format !== 'png') console.warn('    WARN: Unusual Format');
    if (type !== 'Embedding') console.warn('    WARN: Type must be Embedding usually');
}

// 2. Validate BINDATA Content
console.log('[Check] BINDATA Base64');
const binDataList = doc.getElementsByTagName('BINDATA');
for (let i = 0; i < binDataList.length; i++) {
    const bd = binDataList[i];
    const id = bd.getAttribute('Id');
    const txt = bd.textContent || '';

    // Check for whitespace
    if (txt.match(/\s/)) console.warn(`    WARN: BINDATA[${id}] contains whitespace/newlines. Should be pure base64?`);

    // Check validity (length % 4 === 0)
    if (txt.length % 4 !== 0) console.error(`    FAIL: BINDATA[${id}] Invalid Base64 Length (${txt.length})`);

    console.log(`  Data ${id}: Length=${txt.length}, ValidBase64=${txt.length % 4 === 0}`);
}

// 3. XML Declaration Check
console.log('[Check] XML Declaration');
const xmlDecl = targetContent.match(/^<\?xml[^>]*\?>/);
if (xmlDecl) {
    console.log(`  Found: ${xmlDecl[0]}`);
    if (!xmlDecl[0].includes('encoding="UTF-8"') && !xmlDecl[0].includes("encoding='UTF-8'")) {
        console.warn('  WARN: Encoding might be missing/wrong');
    }
    if (!xmlDecl[0].includes('standalone="no"')) {
        console.warn('  WARN: standalone="no" usually required');
    }
} else {
    console.error('  FAIL: Missing XML Declaration');
}

// 4. Check for duplicate IDs in MAPPINGTABLE
// Although we stripped styles, duplicate IDs in definitions can crash it.
console.log('[Check] Duplicate MAPPINGTABLE IDs');
const mapping = doc.getElementsByTagName('MAPPINGTABLE')[0];
if (mapping) {
    const checkDupes = (tag: string) => {
        const ids = new Set<string>();
        const els = mapping.getElementsByTagName(tag);
        for (let i = 0; i < els.length; i++) {
            const id = els[i].getAttribute('Id');
            if (id && ids.has(id)) console.error(`    FAIL: Duplicate ID "${id}" in <${tag}>`);
            if (id) ids.add(id);
        }
    };
    checkDupes('PARASHAPE');
    checkDupes('CHARSHAPE');
    checkDupes('STYLE');
}
