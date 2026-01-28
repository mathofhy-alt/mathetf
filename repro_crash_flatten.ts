
import { DOMParser } from 'xmldom';
import * as fs from 'fs';

const xml = fs.readFileSync('question_raw.xml', 'utf-8');

function flattenEndnotes(xml: string): string {
    // Matches <ENDNOTE>...</ENDNOTE> including newlines
    const endnoteRegex = /<ENDNOTE>(.*?)<\/ENDNOTE>/gs;

    let match;
    const matches: string[] = [];
    const contents: string[] = [];

    endnoteRegex.lastIndex = 0;

    while ((match = endnoteRegex.exec(xml)) !== null) {
        matches.push(match[0]);
        let content = match[1];

        if (content.includes('<PARALIST')) {
            const pMatch = content.match(/<PARALIST[^>]*>([\s\S]*?)<\/PARALIST>/i);
            if (pMatch) {
                content = pMatch[1];
            }
        }
        contents.push(content);
    }

    let newXml = xml;

    if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
            newXml = newXml.replace(matches[i], '');
            newXml = contents[i] + newXml;
        }
    }
    return newXml;
}

const flattened = flattenEndnotes(xml);
console.log('Original length:', xml.length);
console.log('Flattened length:', flattened.length);

console.log('--- Flattened Content Head ---');
console.log(flattened.substring(0, 500));
console.log('-----------------------------');

try {
    const doc = new DOMParser({
        errorHandler: {
            warning: (w) => console.log('[Warning]', w),
            error: (e) => console.error('[Error]', e),
            fatalError: (e) => console.error('[Fatal]', e),
        }
    }).parseFromString(`<WRAP>${flattened}</WRAP>`, 'text/xml');

    console.log('Parsed flattened XML successfully.');

    // Check Table
    const tables = doc.getElementsByTagName('TABLE');
    for (let i = 0; i < tables.length; i++) {
        const t = tables[i];
        console.log(`Table ${i} childNodes:`, t.childNodes.length);
        if (t.childNodes.length === 0) {
            console.warn('WARNING: Table has NO children!');
        }
    }

} catch (e) {
    console.error('Exception during parsing flattened:', e);
}
