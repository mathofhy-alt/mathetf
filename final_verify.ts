
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const targetFile = 'test_hml_v2_output.hml';
const content = fs.readFileSync(targetFile, 'utf8');
const doc = new DOMParser().parseFromString(content, 'text/xml');

console.log('--- Final Metadata Verification ---');

const findTag = (name: string) => {
    const els = doc.getElementsByTagName('*');
    for (let i = 0; i < els.length; i++) {
        if (els[i].localName === name) return els[i];
    }
    return null;
};

const binItems = doc.getElementsByTagName('BINITEM');
console.log(`Actual BINITEM count: ${binItems.length}`);

const docSetting = findTag('DOCSETTING');
console.log(`DOCSETTING Picture: ${docSetting?.getAttribute('Picture')}`);

const beginNumber = findTag('BEGINNUMBER');
console.log(`BEGINNUMBER Picture: ${beginNumber?.getAttribute('Picture')}`);

console.log('\n--- Section Integrity Check ---');
const sections = doc.getElementsByTagName('SECTION');
console.log(`SECTION count: ${sections.length}`);
const secDefs = doc.getElementsByTagName('SECDEF');
console.log(`Total SECDEF tags found (should be 1 in template-based): ${secDefs.length}`);

console.log('\n--- Picture ID Verification ---');
const pics = doc.getElementsByTagName('PICTURE');
for (let i = 0; i < pics.length; i++) {
    const p = pics[i];
    console.log(`Pic ${i + 1}: BinData="${p.getAttribute('BinData')}", InstId="${p.getAttribute('InstId')}", ZOrder="${p.getAttribute('ZOrder')}"`);
    const shape = p.getElementsByTagName('SHAPEOBJECT')[0];
    if (shape) {
        console.log(`  SHAPEOBJECT InstId="${shape.getAttribute('InstId')}"`);
    }
}

console.log('\n--- Binary Data Storage Verification ---');
const binDataStorage = findTag('BINDATASTORAGE');
console.log(`BINDATASTORAGE Count attr: ${binDataStorage?.getAttribute('Count')}`);
const binDatas = doc.getElementsByTagName('BINDATA');
console.log(`Actual BINDATA count: ${binDatas.length}`);
