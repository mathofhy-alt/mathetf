
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const filePath = path.join(process.cwd(), 'debug_last_output.hml');
const content = fs.readFileSync(filePath, 'utf-8');

const doc = new DOMParser().parseFromString(content, 'text/xml');
const parashapes = doc.getElementsByTagName('PARASHAPE');

for (let i = 0; i < parashapes.length; i++) {
    const p = parashapes[i];
    if (p.getAttribute('Id') === '5') {
        const attrs = p.attributes;
        console.log('PARASHAPE Id=5 Attributes:');
        for (let j = 0; j < attrs.length; j++) {
            console.log(`  ${attrs[j].name}="${attrs[j].value}"`);
        }

        // Print PARAMARGIN child
        const margins = p.getElementsByTagName('PARAMARGIN')[0];
        if (margins) {
            console.log('  PARAMARGIN:');
            const mAttrs = margins.attributes;
            for (let k = 0; k < mAttrs.length; k++) {
                console.log(`    ${mAttrs[k].name}="${mAttrs[k].value}"`);
            }
        }
        break;
    }
}
