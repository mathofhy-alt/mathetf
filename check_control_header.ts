
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pControl = path.join(process.cwd(), '20260128디버깅대조군.hml');
const pDebug = path.join(process.cwd(), 'debug_last_output.hml');

const cControl = fs.readFileSync(pControl, 'utf-8');
const cDebug = fs.readFileSync(pDebug, 'utf-8');

const docControl = new DOMParser().parseFromString(cControl, 'text/xml');
const docDebug = new DOMParser().parseFromString(cDebug, 'text/xml');

const checkColDef = (doc: Document, label: string) => {
    const coldefs = doc.getElementsByTagName('COLDEF');
    console.log(`[${label}] Found ${coldefs.length} COLDEF tags.`);
    for (let i = 0; i < coldefs.length; i++) {
        console.log(`  COLDEF[${i}]: Count=${coldefs[i].getAttribute('Count')} Layout=${coldefs[i].getAttribute('Layout')}`);
    }
};

const checkParaShape = (doc: Document, id: string, label: string) => {
    const shapes = doc.getElementsByTagName('PARASHAPE');
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].getAttribute('Id') === id) {
            console.log(`[${label}] PARASHAPE Id=${id}:`);
            const margins = shapes[i].getElementsByTagName('PARAMARGIN')[0];
            if (margins) {
                console.log(`  Margins: Left=${margins.getAttribute('Left')} Right=${margins.getAttribute('Right')} Indent=${margins.getAttribute('Indent')}`);
            }
        }
    }
};

checkColDef(docControl, 'Control');
checkColDef(docDebug, 'Debug');

checkParaShape(docControl, '9', 'Control');
checkParaShape(docDebug, '1', 'Debug'); // Debug used ParaShape 1 for P[0]
