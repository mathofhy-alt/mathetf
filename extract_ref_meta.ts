
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const refFile = 'repro_real_image.hml';
const content = fs.readFileSync(refFile, 'utf8');
const doc = new DOMParser().parseFromString(content, 'text/xml');

console.log('--- Reference BINITEM ---');
const binItems = doc.getElementsByTagName('BINITEM');
for (let i = 0; i < binItems.length; i++) {
    const item = binItems[i];
    console.log(`Item ${i + 1}:`);
    for (let j = 0; j < item.attributes.length; j++) {
        const attr = item.attributes[j];
        console.log(`  ${attr.name}="${attr.value}"`);
    }
}

console.log('\n--- Reference BINDATA ---');
const binDatas = doc.getElementsByTagName('BINDATA');
for (let i = 0; i < binDatas.length; i++) {
    const data = binDatas[i];
    console.log(`Data ${i + 1}:`);
    for (let j = 0; j < data.attributes.length; j++) {
        const attr = data.attributes[j];
        console.log(`  ${attr.name}="${attr.value}"`);
    }
    const txt = data.textContent || '';
    console.log(`  Content Length: ${txt.length}`);
    console.log(`  Has Newlines: ${txt.includes('\n')}`);
    console.log(`  Sample: ${txt.slice(0, 50)}...`);
}
