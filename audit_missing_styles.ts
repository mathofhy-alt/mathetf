
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pDebug = path.join(process.cwd(), 'debug_last_output.hml');
if (!fs.existsSync(pDebug)) {
    console.error('Debug file missing');
    process.exit(1);
}

const cDebug = fs.readFileSync(pDebug, 'utf-8');
const doc = new DOMParser().parseFromString(cDebug, 'text/xml');

const definedParaShapes = new Set<string>();
const definedCharShapes = new Set<string>();
const definedStyles = new Set<string>();

// 1. Harvest Definitions
const paraShapes = doc.getElementsByTagName('PARASHAPE');
for (let i = 0; i < paraShapes.length; i++) definedParaShapes.add(paraShapes[i].getAttribute('Id') || '');

const charShapes = doc.getElementsByTagName('CHARSHAPE');
for (let i = 0; i < charShapes.length; i++) definedCharShapes.add(charShapes[i].getAttribute('Id') || '');

const styles = doc.getElementsByTagName('STYLE');
for (let i = 0; i < styles.length; i++) definedStyles.add(styles[i].getAttribute('Id') || '');

console.log(`Defined: ParaShapes=[${Array.from(definedParaShapes).join(',')}]`);
console.log(`Defined: CharShapes=[${Array.from(definedCharShapes).join(',')}]`);
console.log(`Defined: Styles=[${Array.from(definedStyles).join(',')}]`);

// 2. Scan Usage
const missingPara = new Set<string>();
const missingChar = new Set<string>();
const missingStyle = new Set<string>();

const ps = doc.getElementsByTagName('P');
for (let i = 0; i < ps.length; i++) {
    const id = ps[i].getAttribute('ParaShape');
    if (id && !definedParaShapes.has(id)) missingPara.add(id);

    const sid = ps[i].getAttribute('Style');
    if (sid && !definedStyles.has(sid)) missingStyle.add(sid);
}

const texts = doc.getElementsByTagName('TEXT');
for (let i = 0; i < texts.length; i++) {
    const id = texts[i].getAttribute('CharShape');
    if (id && !definedCharShapes.has(id)) missingChar.add(id);
}

// Check CHAR tags too if they have CharShape (rare in HWPML 2.x, usually on TEXT)
// Actually TEXT has CharShape.

console.log('--- Audit Results ---');
if (missingPara.size > 0) console.log(`CRITICAL: Missing ParaShapes: ${Array.from(missingPara).join(', ')}`);
if (missingChar.size > 0) console.log(`CRITICAL: Missing CharShapes: ${Array.from(missingChar).join(', ')}`);
if (missingStyle.size > 0) console.log(`CRITICAL: Missing Styles: ${Array.from(missingStyle).join(', ')}`);

if (missingPara.size === 0 && missingChar.size === 0 && missingStyle.size === 0) {
    console.log('All IDs appear valid options within the file.');
}
