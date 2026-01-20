
import * as fs from 'fs';
import { DOMParser } from 'xmldom';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import type { QuestionWithImages, DbQuestion, DbQuestionImage } from './src/lib/hml-v2/types';

// Simulate the test-hml-v2.ts data
const dummyQuestion: DbQuestion = {
    id: 'test-q-1',
    content_xml: `<P ParaShape="0" Style="0"><TEXT CharShape="0">Source Question Text</TEXT></P>`,
    // ... other fields don't matter much for this test
} as any;

const dummyImage: DbQuestionImage = {
    original_bin_id: '1',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    format: 'png'
} as any;

const questions: QuestionWithImages[] = [{
    question: dummyQuestion,
    images: [dummyImage]
}];

console.log('--- Source XML Investigation ---');
console.log(`Original XML: ${dummyQuestion.content_xml}`);

const template = fs.readFileSync('repro_real_image.hml', 'utf8');
const result = generateHmlFromTemplate(template, questions);

const doc = new DOMParser().parseFromString(result.hmlContent, 'text/xml');
const pTags = doc.getElementsByTagName('SECTION')[0].getElementsByTagName('P');

console.log(`\nGenerated HML (SECTION children): ${pTags.length}`);
for (let i = 0; i < pTags.length; i++) {
    console.log(`P ${i}: ${new (require('xmldom').XMLSerializer)().serializeToString(pTags[i]).substring(0, 100)}...`);
}
