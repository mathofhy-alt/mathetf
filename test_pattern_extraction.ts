
import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';

const hml = fs.readFileSync('재조립양식.hml', 'utf-8');
const doc = new DOMParser().parseFromString(hml, 'text/xml');
const serializer = new XMLSerializer();

const patterns = {
    BOGI: '',
    JOKUN: '',
    MIJU: ''
};

const tables = doc.getElementsByTagName('TABLE');
for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const text = table.textContent || '';

    // Find the P tag that contains the identifier
    const ps = table.getElementsByTagName('P');
    let targetP = null;
    for (let j = 0; j < ps.length; j++) {
        const pText = ps[j].textContent || '';
        if (pText === '보기박스') {
            patterns.BOGI = serializer.serializeToString(table);
            targetP = ps[j];
        } else if (pText === '조건박스') {
            patterns.JOKUN = serializer.serializeToString(table);
            targetP = ps[j];
        } else if (pText === '미주박스') {
            patterns.MIJU = serializer.serializeToString(table);
            targetP = ps[j];
        }
    }
}

console.log('--- BOGI Pattern (first 100 chars) ---');
console.log(patterns.BOGI.substring(0, 100) + '...');
console.log('--- JOKUN Pattern (first 100 chars) ---');
console.log(patterns.JOKUN.substring(0, 100) + '...');
console.log('--- MIJU Pattern (first 100 chars) ---');
console.log(patterns.MIJU.substring(0, 100) + '...');
