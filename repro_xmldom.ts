
import { DOMParser } from 'xmldom';
import * as fs from 'fs';

const xml = fs.readFileSync('question_raw.xml', 'utf-8');
console.log('Read XML length:', xml.length);

try {
    const doc = new DOMParser({
        errorHandler: {
            warning: (w) => console.log('[Warning]', w),
            error: (e) => console.error('[Error]', e),
            fatalError: (e) => console.error('[Fatal]', e),
        }
    }).parseFromString(`<WRAP>${xml}</WRAP>`, 'text/xml');

    console.log('Parsed successfully (technically). serialization:');
    // Check if TABLE is self-closed or weird
    const tables = doc.getElementsByTagName('TABLE');
    for (let i = 0; i < tables.length; i++) {
        const t = tables[i];
        console.log(`Table ${i} childNodes:`, t.childNodes.length);
        console.log(`Table ${i} attributes:`, t.attributes.length);
        if (t.childNodes.length === 0) {
            console.warn('WARNING: Table has NO children!');
        }
    }

    // Check if ROW is sibling
    const rows = doc.getElementsByTagName('ROW');
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        console.log(`Row ${i} parent:`, r.parentNode?.nodeName);
        if (r.parentNode?.nodeName !== 'TABLE') {
            console.error('ERROR: ROW parent is NOT TABLE. It is:', r.parentNode?.nodeName);
        }
    }

} catch (e) {
    console.error('Exception during parsing:', e);
}
