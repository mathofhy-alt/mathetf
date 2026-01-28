
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const filePath = path.join(process.cwd(), 'debug_last_output.hml');
const content = fs.readFileSync(filePath, 'utf-8');

const doc = new DOMParser().parseFromString(content, 'text/xml');
const bindatalist = doc.getElementsByTagName('BINDATALIST')[0];

if (bindatalist) {
    console.log(`BINDATALIST Count: ${bindatalist.getAttribute('Count')}`);
    const binItems = bindatalist.getElementsByTagName('BINITEM');
    console.log(`BINITEM Children: ${binItems.length}`);
    for (let i = 0; i < binItems.length; i++) {
        console.log(`BINITEM[${i}]: Id=${binItems[i].getAttribute('Id')} BinData=${binItems[i].getAttribute('BinData')}`);
    }
} else {
    console.log('BINDATALIST Missing');
}

const storage = doc.getElementsByTagName('BINDATASTORAGE')[0];
if (storage) {
    console.log(`BINDATASTORAGE Count: ${storage.getAttribute('Count')}`);
    const data = storage.getElementsByTagName('BINDATA');
    console.log(`BINDATA Children: ${data.length}`);
    for (let i = 0; i < data.length; i++) {
        console.log(`BINDATA[${i}]: Id=${data[i].getAttribute('Id')} Size=${data[i].getAttribute('Size')}`);
    }
} else {
    console.log('BINDATASTORAGE Missing');
}
