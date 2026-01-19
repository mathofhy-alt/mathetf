
import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';

// Helper to get text recursively
const getText = (node: Node): string => {
    if (node.nodeType === 3) return node.nodeValue || '';
    let text = "";
    for (let i = 0; i < node.childNodes.length; i++) {
        text += getText(node.childNodes[i]);
    }
    return text.trim();
};

const filePath = 'C:/Users/matho/Downloads/시험지_2026-01-19.hml';

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
console.log(`Read ${content.length} bytes`);

const parser = new DOMParser();
const doc = parser.parseFromString(content, 'text/xml');

const endnotes = doc.getElementsByTagName('ENDNOTE');
console.log(`Found ${endnotes.length} ENDNOTEs`);

for (let i = 0; i < endnotes.length; i++) {
    const note = endnotes[i];
    const paralist = note.getElementsByTagName('PARALIST')[0];

    if (paralist) {
        const text = getText(paralist);
        console.log(`\n[ENDNOTE ${i + 1}] Content Preview:`);
        console.log(text.slice(0, 200));

        // XML Structure Check
        console.log(`[ENDNOTE ${i + 1}] XML Structure:`);
        const serializer = new XMLSerializer();
        console.log(serializer.serializeToString(paralist).slice(0, 300));
    } else {
        console.log(`\n[ENDNOTE ${i + 1}] No PARALIST found`);
    }
}

// Check Namespace on P tags in BODY
const body = doc.getElementsByTagName('BODY')[0];
if (body) {
    const ps = body.getElementsByTagName('P');
    console.log(`\nTotal P tags in BODY: ${ps.length}`);
    if (ps.length > 0) {
        console.log('First P xmlns:', ps[0].getAttribute('xmlns'));
        if (ps.length > 1) {
            console.log('Second P xmlns:', ps[1].getAttribute('xmlns'));
        }
    }
}
