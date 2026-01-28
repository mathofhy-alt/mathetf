
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pTarget = path.join(process.cwd(), 'debug_last_output.hml');
const cTarget = fs.readFileSync(pTarget, 'utf-8');
const doc = new DOMParser().parseFromString(cTarget, 'text/xml');

const ps = doc.getElementsByTagName('P');
let foundContent = false;

console.log(`Checking ${ps.length} paragraphs...`);
for (let i = 0; i < ps.length; i++) {
    const text = (ps[i].textContent || '').trim();
    if (text.length > 0) {
        console.log(`FOUND CONTENT at P[${i}]: '${text.substring(0, 50)}...'`);
        foundContent = true;
        // Print first 5
        if (foundContent && i > 50 && i < 55) break;
    }
}

if (!foundContent) console.log('File is completely DEVOID of visible text.');
