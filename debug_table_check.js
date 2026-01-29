
const fs = require('fs');
const path = require('path');

// Mock simple string replacement to simulate the generator logic
// because importing the actual typescript file is hard in this environment without proper setup.

// Read Template
const templatePath = 'c:\\Users\\matho\\OneDrive\\바탕 화면\\안티그래비티 - 복사본\\재조립양식.hml';
const templateContent = fs.readFileSync(templatePath, 'utf-8');

// The logic from generator.ts:
// Safe Mode Regex
const anchorRegex = /<P[^>]*>\s*<TEXT[^>]*>\s*(?:<CHAR>\s*)?{{CONTENT_HERE}}(?:\s*<\/CHAR>)?\s*<\/TEXT>\s*<\/P>/;
const anchor = '{{CONTENT_HERE}}';
const combinedContentXmlFull = '<P><TEXT>OUTPUT_CONTENT_START</TEXT></P>\n<P><TEXT>OUTPUT_CONTENT_END</TEXT></P>';

let currentHml = templateContent;

console.log('--- START DEBUG ---');
console.log('Template length:', currentHml.length);
console.log('Contains anchor?', currentHml.includes(anchor));

if (anchorRegex.test(currentHml)) {
    console.log('REGEX WATCHED!');
    const match = currentHml.match(anchorRegex);
    console.log('Match found:', match[0]); // Print what is being replaced
    currentHml = currentHml.replace(anchorRegex, combinedContentXmlFull);
} else {
    console.log('REGEX FAILED. Fallback to simple replace.');
    currentHml = currentHml.replace(anchor, combinedContentXmlFull);
}

// Write Output
const outputPath = './debug_output_js.hml';
fs.writeFileSync(outputPath, currentHml);

// Check if TABLE is still there
if (currentHml.includes('<TABLE')) {
    console.log('SUCCESS: Table preserved.');
    // Check if table is BEFORE the replaced content
    const tableIndex = currentHml.indexOf('<TABLE');
    const contentIndex = currentHml.indexOf('OUTPUT_CONTENT_START');
    if (tableIndex < contentIndex) {
        console.log('SUCCESS: Table is BEFORE content (Correct order).');
    } else {
        console.error('FAILURE: Table is AFTER content? (Weird order).');
    }
} else {
    console.error('FAILURE: Table LOST!');
}
