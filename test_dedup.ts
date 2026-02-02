
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import type { DbQuestionImage, QuestionWithImages } from './src/lib/hml-v2/types';
import fs from 'fs';
import path from 'path';

// Mock Dummy Image Data (Base64)
const DUMMY_IMAGE = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // 1x1 GIF

// Mock Questions
const q1: any = {
    id: 'q1',
    content_xml: '<P><TEXT>Question 1 <CHAR/></TEXT></P>',
    source_db_id: 'db1',
    question_number: 1,
    plain_text: 'Question 1'
};

const q2: any = {
    id: 'q2',
    content_xml: '<P><TEXT>Question 2 <CHAR/></TEXT></P>',
    source_db_id: 'db1',
    question_number: 2,
    plain_text: 'Question 2'
};

// Both questions use the SAME image data
const img1: DbQuestionImage = {
    id: 'img1_db',
    question_id: 'q1',
    original_bin_id: 'bin1',
    data: DUMMY_IMAGE, // Identical Data
    size_bytes: 100,
    format: 'gif',
    created_at: new Date().toISOString()
};

const img2: DbQuestionImage = {
    id: 'img2_db',
    question_id: 'q2',
    original_bin_id: 'bin2',
    data: DUMMY_IMAGE, // Identical Data
    size_bytes: 100,
    format: 'gif',
    created_at: new Date().toISOString()
};

const input: QuestionWithImages[] = [
    { question: q1, images: [img1] },
    { question: q2, images: [img2] } // Different Image Object, Same Content
];

// Load minimal template
const templatePath = path.join(process.cwd(), 'template.hml');
let templateXml = '';
if (fs.existsSync(templatePath)) {
    templateXml = fs.readFileSync(templatePath, 'utf-8');
} else {
    // Minimal fallback if template missing
    templateXml = `<?xml version="1.0" encoding="utf-8"?>
<HWPML Style="embed" Version="2.0" SubVersion="6.0.0.0">
<HEAD>
<DOCSETTING/>
<BINDATALIST Count="0"></BINDATALIST>
</HEAD>
<BODY>
<SECTION>
{{CONTENT_HERE}}
</SECTION>
</BODY>
<TAIL><BINDATASTORAGE Count="0"></BINDATASTORAGE></TAIL>
</HWPML>`;
}

console.log('[TEST] Running Deduplication Test...');
const result = generateHmlFromTemplate(templateXml, input);
const hml = result.hmlContent;

// Verify BINDATA count
const binDataMatches = hml.match(/<BINDATA /g);
console.log(`[TEST] Total BINDATA tags found: ${binDataMatches?.length || 0}`);

const binListMatches = hml.match(/<BINDATALIST Count="(\d+)"/);
console.log(`[TEST] BINDATALIST Count: ${binListMatches ? binListMatches[1] : 'Not Found'}`);

const storageMatches = hml.match(/<BINDATASTORAGE Count="(\d+)"/);
console.log(`[TEST] BINDATASTORAGE Count: ${storageMatches ? storageMatches[1] : 'Not Found'}`);

if ((binDataMatches?.length || 0) === 1) {
    console.log('[SUCCESS] Images were deduplicated! Only 1 BINDATA exists.');
} else {
    console.log('[FAILURE] Images were NOT deduplicated.');
}
