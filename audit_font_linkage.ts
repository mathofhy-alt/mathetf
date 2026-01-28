
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pDebug = path.join(process.cwd(), 'debug_last_output.hml');
const cDebug = fs.readFileSync(pDebug, 'utf-8');
const doc = new DOMParser().parseFromString(cDebug, 'text/xml');

const definedFonts = new Set<string>();
const fonts = doc.getElementsByTagName('FONT');
for (let i = 0; i < fonts.length; i++) definedFonts.add(fonts[i].getAttribute('Id') || '');

console.log(`Defined Fonts: [${Array.from(definedFonts).join(',')}]`);

const charShapes = doc.getElementsByTagName('CHARSHAPE');
for (let i = 0; i < charShapes.length; i++) {
    const csId = charShapes[i].getAttribute('Id');
    const f = charShapes[i].getElementsByTagName('FONTID')[0];
    if (f) {
        const h = f.getAttribute('Hangul');
        const l = f.getAttribute('Latin');
        const j = f.getAttribute('Hanja');

        let missing = [];
        if (h && !definedFonts.has(h)) missing.push(`Hangul(${h})`);
        if (l && !definedFonts.has(l)) missing.push(`Latin(${l})`);
        if (j && !definedFonts.has(j)) missing.push(`Hanja(${j})`);

        if (missing.length > 0) {
            console.log(`CRITICAL: CharShape[${csId}] references MISSING FONTS: ${missing.join(', ')}`);
        }
    }
}
