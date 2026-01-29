
import * as fs from 'fs';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';

// Mock Question Data
const mockQuestion: any = {
    id: 'q1',
    question_number: 1,
    content_xml: '<P><TEXT>Test Question 1</TEXT></P>',
    plain_text: 'Test',
};

const processedQuestions: any[] = [{
    question: mockQuestion,
    images: []
}];

// Read Template
const templatePath = 'c:\\Users\\matho\\OneDrive\\바탕 화면\\안티그래비티 - 복사본\\재조립양식.hml';
const templateContent = fs.readFileSync(templatePath, 'utf-8');

// Generate
const result = generateHmlFromTemplate(templateContent, processedQuestions);

// Write Output
const outputPath = './debug_output.hml';
fs.writeFileSync(outputPath, result.hmlContent);

console.log('Generated debug_output.hml');

// Check for TABLE tag
if (result.hmlContent.includes('<TABLE')) {
    console.log('SUCCESS: <TABLE> tag found in output.');
} else {
    console.error('FAILURE: <TABLE> tag MISSING in output!');
}

// Check for {{CONTENT_HERE}}
if (result.hmlContent.includes('{{CONTENT_HERE}}')) {
    console.error('FAILURE: {{CONTENT_HERE}} still present (Replacement failed).');
} else {
    console.log('SUCCESS: {{CONTENT_HERE}} replaced.');
}

// Log the first 1000 characters of BODY
const bodyStart = result.hmlContent.indexOf('<BODY>');
console.log('--- BODY CONTENT START ---');
console.log(result.hmlContent.substring(bodyStart, bodyStart + 1000));
