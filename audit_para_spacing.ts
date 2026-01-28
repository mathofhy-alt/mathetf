
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pControl = path.join(process.cwd(), '20260128디버깅대조군.hml');
const pTemplate = path.join(process.cwd(), '재조립양식.hml');

const cControl = fs.readFileSync(pControl, 'utf-8');
const cTemplate = fs.readFileSync(pTemplate, 'utf-8');

const dumpPara = (xml: string, label: string, id: string) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const shapes = doc.getElementsByTagName('PARASHAPE');
    let found = false;
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].getAttribute('Id') === id) {
            found = true;
            console.log(`[${label}] ParaShape[${id}]: LineSpacing="${shapes[i].getAttribute('LineSpacing')}"`);
        }
    }
    if (!found) console.log(`[${label}] ParaShape[${id}] NOT FOUND.`);
};

console.log('--- Control File ---');
dumpPara(cControl, 'Control', '9'); // Control uses 9
dumpPara(cControl, 'Control', '1'); // For comparison

console.log('--- Template File ---');
dumpPara(cTemplate, 'Template', '1'); // Generated uses 1
