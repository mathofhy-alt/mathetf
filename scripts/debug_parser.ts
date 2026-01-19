
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';

const hmlPath = path.join(process.cwd(), 'debug_multi_output_fixed.hml');

if (!fs.existsSync(hmlPath)) {
    console.error("Debug file not found:", hmlPath);
    process.exit(1);
}

// Simulate Endnote-based slicing
(async () => {
    const raw = fs.readFileSync(hmlPath, 'utf-8');
    const startTag = '<BODY>';
    const endTag = '</BODY>';
    const s = raw.indexOf(startTag);
    const e = raw.indexOf(endTag);
    if (s === -1 || e === -1) return;

    const body = raw.slice(s + startTag.length, e);

    // Find Endnotes
    const endnotes: number[] = [];
    const re = /<\/(?:[a-zA-Z0-9]+:)?ENDNOTE>/gi;
    let m;
    while ((m = re.exec(body)) !== null) {
        endnotes.push(m.index + m[0].length);
    }

    console.log(`Found ${endnotes.length} Endnotes.`);

    let prev = 0;
    endnotes.forEach((pos, i) => {
        const slice = body.slice(prev, pos);
        console.log(`\n--- Question ${i + 1} ---`);
        console.log(`Start: ${prev}, End: ${pos}, Length: ${slice.length}`);
        console.log(`First 50: ${slice.substring(0, 50).replace(/\n/g, ' ')}`);
        console.log(`Last 50: ${slice.substring(slice.length - 50).replace(/\n/g, ' ')}`);
        prev = pos;
    });
})();

const content = fs.readFileSync(hmlPath, 'utf-8');
const questions = parseHml(content);

console.log(`Parsed ${questions.length} questions.`);

if (questions.length > 0) {
    const q1 = questions[0];
    console.log("--- Q1 Dump ---");
    console.log("Text length:", q1.plain_text.length);
    console.log("XML length:", q1.content_xml.length);
    console.log("First 100 chars text:", q1.plain_text.slice(0, 100));
    console.log("First 200 chars XML:", q1.content_xml.slice(0, 200));
    console.log("Is Content Empty?", q1.content_xml.trim().length === 0);
    console.log("Has Binaries?", q1.binaries.length);
} else {
    console.log("No questions parsed!");
}
