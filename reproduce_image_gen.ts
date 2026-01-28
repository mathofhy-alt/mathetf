
import fs from 'fs';
import path from 'path';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';

// Load Real Template
const template = fs.readFileSync('재조립양식.hml', 'utf-8');

// Mock Image (Matches Control File size approx)
// 100KB Base64 string
const mockBase64 = 'A'.repeat(105991);

const mockQuestion = {
    id: 'q1',
    content_xml: '<P><TEXT>Image Test</TEXT><PICTURE><IMAGE BinItem="1" /></PICTURE></P>',
    question_number: 1,
    // other fields required by DbQuestion but irrelevant for generator
} as any;

const mockImage = {
    question_id: 'q1',
    original_bin_id: '1',
    format: 'jpg',
    data: mockBase64,
    size_bytes: 70000
} as any;

const result = generateHmlFromTemplate(template, [
    { question: mockQuestion, images: [mockImage] }
]);

console.log('Result HML Length:', result.hmlContent.length);
console.log('BINDATA included?', result.hmlContent.includes('<BINDATA'));
console.log('BINDATASTORAGE included?', result.hmlContent.includes('<BINDATASTORAGE'));

if (result.hmlContent.includes('<BINDATA')) {
    const start = result.hmlContent.indexOf('<BINDATA');
    const end = result.hmlContent.indexOf('</BINDATA>');
    const tag = result.hmlContent.substring(start, end + 10); // snippet
    console.log('Generated Tag:', tag.substring(0, 100));
}

// Write to file for inspection
fs.writeFileSync('repro_gen_output.hml', result.hmlContent);
