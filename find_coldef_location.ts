
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';

const pDebug = path.join(process.cwd(), 'debug_last_output.hml');
const cDebug = fs.readFileSync(pDebug, 'utf-8');
const doc = new DOMParser().parseFromString(cDebug, 'text/xml');
const serializer = new XMLSerializer();

const ps = doc.getElementsByTagName('P');
console.log(`Searching ${ps.length} paragraphs for COLDEF...`);

for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const coldefs = p.getElementsByTagName('COLDEF');
    if (coldefs.length > 0) {
        console.log(`Found COLDEF in P[${i}]`);
        console.log(`P[${i}] XML: ${serializer.serializeToString(p).substring(0, 200)}...`);
    }
}
