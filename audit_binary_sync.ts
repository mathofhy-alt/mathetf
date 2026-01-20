
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const content = fs.readFileSync('test_hml_v2_output.hml', 'utf8');
const doc = new DOMParser().parseFromString(content, 'text/xml');

const binItems = doc.getElementsByTagName('BINITEM');
const binDatas = doc.getElementsByTagName('BINDATA');
const pics = doc.getElementsByTagName('PICTURE');

console.log(`BINITEM count: ${binItems.length}`);
console.log(`BINDATA count: ${binDatas.length}`);
console.log(`PICTURE count: ${pics.length}`);

for (let i = 0; i < pics.length; i++) {
    const binData = pics[i].getAttribute('BinData');
    const instId = pics[i].getAttribute('InstId');
    console.log(`Pic ${i + 1}: BinData=${binData}, InstId=${instId}`);
}

const docSetting = doc.getElementsByTagName('DOCSETTING')[0];
console.log(`DOCSETTING Picture: ${docSetting?.getAttribute('Picture')}`);

const beginNumber = doc.getElementsByTagName('BEGINNUMBER')[0];
console.log(`BEGINNUMBER Picture: ${beginNumber?.getAttribute('Picture')}`);
