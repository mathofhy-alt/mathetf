
import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';

const xml = fs.readFileSync('question_raw.xml', 'utf-8');

function flattenEndnotesRobust(xml: string): string {
    const endnoteRegex = /<ENDNOTE>(.*?)<\/ENDNOTE>/gs;
    let match;
    const matches: string[] = [];
    const contents: string[] = [];

    // Regex for grabbing the container is fine (Endnotes dont nest usually)
    // But verify if ENDNOTE nested?
    // HWPML allows nested endnotes? Unlikely.

    while ((match = endnoteRegex.exec(xml)) !== null) {
        matches.push(match[0]);
        let content = match[1];

        // Robust unwrap using DOMParser
        if (content.includes('<PARALIST')) {
            try {
                // Wrap to handle multiple P tags
                const doc = new DOMParser().parseFromString(`<WRAP>${content}</WRAP>`, 'text/xml');
                const root = doc.documentElement;
                const paralist = root.getElementsByTagName('PARALIST')[0];

                if (paralist) {
                    // Serialize children of PARALIST
                    const serializer = new XMLSerializer();
                    let innerXml = '';
                    for (let i = 0; i < paralist.childNodes.length; i++) {
                        innerXml += serializer.serializeToString(paralist.childNodes[i]);
                    }
                    content = innerXml;
                }
            } catch (e) {
                console.warn('Failed to unwrap PARALIST via DOM, falling back to original content', e);
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

const flattened = flattenEndnotesRobust(xml);
console.log('Original length:', xml.length);
console.log('Flattened length:', flattened.length);

// Verify validity
try {
    const doc = new DOMParser().parseFromString(`<WRAP>${flattened}</WRAP>`, 'text/xml');
    console.log('Parsed robust flattened XML successfully.');

    // Check Table
    const tables = doc.getElementsByTagName('TABLE');
    for (let i = 0; i < tables.length; i++) {
        const t = tables[i];
        console.log(`Table ${i} childNodes:`, t.childNodes.length);
        if (t.childNodes.length === 0) {
            console.error('FAIL: Table is empty!');
        } else {
            // Verify integrity
            console.log('Table seems intact.');
        }
    }

} catch (e) {
    console.error('Exception during parsing robust flattened:', e);
}
