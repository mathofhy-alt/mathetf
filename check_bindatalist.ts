
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const filePath = path.join(process.cwd(), 'debug_last_output.hml');
const content = fs.readFileSync(filePath, 'utf-8');

const doc = new DOMParser().parseFromString(content, 'text/xml');
const bindatalist = doc.getElementsByTagName('BINDATALIST')[0];

if (bindatalist) {
    console.log(`BINDATALIST Count attribute: ${bindatalist.getAttribute('Count')}`);
    const bindatas = bindatalist.getElementsByTagName('BINDATA');
    console.log(`Actual BINDATA children: ${bindatas.length}`);

    for (let i = 0; i < bindatas.length; i++) {
        const bd = bindatas[i];
        console.log(`BINDATA[${i}]: Id=${bd.getAttribute('Id')}, Format=${bd.getAttribute('Format')}, Encoding=${bd.getAttribute('Encoding')}, Size=${bd.textContent?.length}`);
    }
} else {
    console.log('BINDATALIST not found in HEAD');
}
