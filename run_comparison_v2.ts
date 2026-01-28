
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';

const pControl = path.join(process.cwd(), '20260128디버깅대조군.hml');
const pTarget = path.join(process.cwd(), '시험지_2026-01-28 (29).hml');

if (!fs.existsSync(pControl) || !fs.existsSync(pTarget)) {
    console.error('Files missing');
    process.exit(1);
}

const cControl = fs.readFileSync(pControl, 'utf-8');
const cTarget = fs.readFileSync(pTarget, 'utf-8');

const dControl = new DOMParser().parseFromString(cControl, 'text/xml');
const dTarget = new DOMParser().parseFromString(cTarget, 'text/xml');
const serializer = new XMLSerializer();

// 1. Paragraph Count
const psControl = dControl.getElementsByTagName('P');
const psTarget = dTarget.getElementsByTagName('P');
console.log(`Paragraph Count: Control=${psControl.length} vs Target=${psTarget.length}`);

// 2. Inspect first 10 paragraphs of Target
console.log('\n--- Target First 10 Paragraphs ---');
for (let i = 0; i < Math.min(10, psTarget.length); i++) {
    const xml = serializer.serializeToString(psTarget[i]);
    console.log(`P[${i}]: ${xml.substring(0, 150)}...`);
    const hasText = (psTarget[i].textContent || '').trim().length > 0;
    console.log(`      HasText: ${hasText}`);
}

// 3. Find COLDEF
console.log('\n--- Finding COLDEF in Target ---');
let foundCol = false;
for (let i = 0; i < psTarget.length; i++) {
    if (psTarget[i].getElementsByTagName('COLDEF').length > 0) {
        console.log(`Found COLDEF in P[${i}]`);
        foundCol = true;
        break; // Just find first
    }
}
if (!foundCol) console.log('WARNING: GENUINE COLDEF MISSING IN TARGET!');
