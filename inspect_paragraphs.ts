
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';

const filePath = path.join(process.cwd(), 'debug_last_output.hml');
const content = fs.readFileSync(filePath, 'utf-8');

const doc = new DOMParser().parseFromString(content, 'text/xml');
const ps = doc.getElementsByTagName('P');
const serializer = new XMLSerializer();

console.log(`Total Paragraphs: ${ps.length}`);
for (let i = 0; i < ps.length; i += 10) {
    const xml = serializer.serializeToString(ps[i]);
    console.log(`P[${i}]: ${xml.substring(0, 150)}...`);
}
