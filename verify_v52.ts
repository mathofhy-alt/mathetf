
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const targetFile = 'test_output_endnote.hml';
if (!fs.existsSync(targetFile)) {
    console.error(`File ${targetFile} not found.`);
    process.exit(1);
}

const content = fs.readFileSync(targetFile, 'utf8');
const doc = new DOMParser().parseFromString(content, 'text/xml');

console.log('--- MAPPINGTABLE AUDIT ---');
const mappingTable = doc.getElementsByTagName('MAPPINGTABLE')[0];
if (mappingTable) {
    const styles = Array.from(mappingTable.getElementsByTagName('STYLE'));
    const style9999 = styles.find(s => s.getAttribute('Id') === '9999');
    console.log(`Style 9999 exists: ${!!style9999}`);
    if (style9999) {
        console.log(`  - Name: "${style9999.getAttribute('Name')}"`);
        console.log(`  - ParaShape: "${style9999.getAttribute('ParaShape')}"`);
    }

    const parashapes = Array.from(mappingTable.getElementsByTagName('PARASHAPE'));
    const ps9997 = parashapes.find(p => p.getAttribute('Id') === '9997');
    const ps9998 = parashapes.find(p => p.getAttribute('Id') === '9998');

    console.log(`ParaShape 9997 exists: ${!!ps9997}`);
    if (ps9997) console.log(`  - KeepWithNext: "${ps9997.getAttribute('KeepWithNext')}"`);

    console.log(`ParaShape 9998 exists: ${!!ps9998}`);
    if (ps9998) {
        const margin = ps9998.getElementsByTagName('PARAMARGIN')[0];
        console.log(`  - LineSpacingType: "${margin?.getAttribute('LineSpacingType')}"`);
        console.log(`  - LineSpacing: "${margin?.getAttribute('LineSpacing')}"`);
    }
} else {
    console.error('MAPPINGTABLE not found!');
}

console.log('\n--- BODY AUDIT ---');
const paras = Array.from(doc.getElementsByTagName('P'));
paras.forEach((p, i) => {
    const style = p.getAttribute('Style');
    const ps = p.getAttribute('ParaShape');
    if (style === '9999' || ps === '9998') {
        console.log(`Para ${i}: Style="${style}", ParaShape="${ps}"`);
        if (ps === '9998') console.log(`  - This is a GUTTER padding paragraph.`);
    }
});
