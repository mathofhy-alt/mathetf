
import { buildFinalHmlFile } from '@/lib/hml/template-manager';
import { buildBody, Question } from '@/lib/hml/body-builder';
import fs from 'fs';
import path from 'path';

const mockQuestions: Question[] = [
    {
        question_number: 1,
        content_xml: '<P><TEXT>Test CDATA: <![CDATA[ x < y & y > z ]]></TEXT><TEXT>Test CDATA: <![CDATA[p->simq\u00A0]]></TEXT><TEXT> Normal &amp; Text </TEXT></P>'
    }
];

const templatePath = path.join(process.cwd(), 'template.hml');
if (!fs.existsSync(templatePath)) {
    console.log("Template not found, skipping template load.");
    process.exit(0);
}

// Emulate route.ts logic exactly
let templateXml = fs.readFileSync(templatePath, 'utf-8');
templateXml = templateXml.replace(/^\uFEFF/, '');

const built = buildBody(mockQuestions);
const finalHml = buildFinalHmlFile(templateXml, built.combinedBodyPs, built.binDataItems);

// Emulate Strict Processing Logic (Zero-Margin + EOF)
let safeHml = finalHml.trim();
const xmlStart = safeHml.indexOf('<?xml');
if (xmlStart > 0) {
    safeHml = safeHml.substring(xmlStart);
}

const xmlEndTag = '</HWPML>';
const xmlEndIndex = safeHml.lastIndexOf(xmlEndTag);
if (xmlEndIndex !== -1) {
    // Intentionally append garbage to test logic if we were running route code, 
    // but here we just simulate what route does: cut it.
    safeHml = safeHml.substring(0, xmlEndIndex + xmlEndTag.length);
}

// Emulate Buffer creation (UTF-8 No BOM)
const buffer = Buffer.from(safeHml, 'utf8');
const outputStr = buffer.toString('utf8');

console.log("--- START OF FILE CHECK ---");
// Check absolute 0 index
if (outputStr.startsWith('<?xml')) {
    console.log("[PASS] Starts with <?xml");
} else {
    console.log(`[FAIL] Starts with: '${outputStr.substring(0, 10)}' (Code: ${outputStr.charCodeAt(0)})`);
}

console.log("--- END OF FILE CHECK ---");
if (outputStr.endsWith('</HWPML>')) {
    console.log("[PASS] Ends exactly with </HWPML>");
} else {
    console.log(`[FAIL] Ends with: ...'${outputStr.slice(-20)}'`);
}

// Check Entity Escaping & CDATA
console.log("--- ENTITY & CDATA CHECK ---");
const textMatch = outputStr.match(/<TEXT>.*?<\/TEXT>/g);
if (textMatch) {
    textMatch.forEach(t => console.log("Found TEXT segment:", t));
}

if (outputStr.includes('<![CDATA[ x < y & y > z ]]>')) {
    console.log("[PASS] CDATA Content Preserved (Untouched &)");
} else {
    console.log("[FAIL] CDATA Content corrupted");
}

if (outputStr.includes('Normal &amp; Text')) {
    console.log("[PASS] Normal Text Ampersand Escaped");
} else {
    console.log("[FAIL] Normal Text Ampersand Check Failed");
}

// Check Math Processing
if (outputStr.includes('Test CDATA: <![CDATA[p -> sim q ]]')) { // Flexible check
    console.log("[PASS] Math Spacing Correct ('p->simq' -> 'p -> sim q')");
} else {
    console.log("[FAIL] Math Spacing Failed");
}

// Check Global Normalization
if (!outputStr.includes('\u00A0')) {
    console.log("[PASS] NBSP Global Removal (Normalized)");
} else {
    console.log("[FAIL] NBSP Found in content (Global Check)");
}

// Check Section Integrity (Data Missing check)
const sectionMatches = outputStr.match(/<SECTION/g);
const closeSectionMatches = outputStr.match(/<\/SECTION>/g);
console.log(`Section Tags: Open=${sectionMatches?.length}, Close=${closeSectionMatches?.length}`);

if (sectionMatches?.length === 1 && closeSectionMatches?.length === 1) {
    console.log("[PASS] Single SECTION Open/Close pair confirmed.");
} else {
    console.log("[FAIL] Section Tag Mismatch (Possible fragmentation)");
}

if (outputStr.includes('<P><TEXT>Test CDATA:')) {
    console.log("[PASS] Body Content is present (Not empty).");
} else {
    console.log("[FAIL] Body Content Missing!");
}
