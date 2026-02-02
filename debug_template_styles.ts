
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';

const TEMPLATE_PATH = path.join(process.cwd(), 'hml v2-test-tem.hml');

function main() {
    if (!fs.existsSync(TEMPLATE_PATH)) {
        console.error('Template not found:', TEMPLATE_PATH);
        return;
    }

    const xml = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    const charShapes = doc.getElementsByTagName('CHARSHAPE');
    console.log(`Found ${charShapes.length} CharShapes.`);

    for (let i = 0; i < charShapes.length; i++) {
        const cs = charShapes[i];
        const id = cs.getAttribute('Id');
        const height = cs.getAttribute('Height');
        const color = cs.getAttribute('TextColor');
        const name = cs.getAttribute('Name');

        console.log(`[${id}] Name="${name}" Height="${height}" Color="${color}"`);

        // Check for White (16777215) and Small (Height <= 200)
        // Note: Height 100 = 1pt? Usually Height is in HWP units or pt*100.
        // In HML, Height="1000" is often 10pt. So 1pt would be "100".
    }
}

main();
