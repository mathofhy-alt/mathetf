
import * as fs from 'fs';

const workingFile = 'repro_real_image.hml';
const failingFile = 'test_zero_questions.hml';

function getBodyContent(filename: string) {
    const content = fs.readFileSync(filename, 'utf8');
    const bodyStart = content.indexOf('<BODY>');
    const bodyEnd = content.indexOf('</BODY>') + 7;
    return content.substring(bodyStart, bodyEnd);
}

const workingBody = getBodyContent(workingFile);
const failingBody = getBodyContent(failingFile);

console.log('=== HML Body Comparison (First 1000 chars) ===');
console.log('--- WORKING ---');
console.log(workingBody.substring(0, 1000));
console.log('\n--- FAILING ---');
console.log(failingBody.substring(0, 1000));

// Deep check for namespaces or hidden attributes
const failingSample = failingBody.substring(0, 500);
if (failingSample.includes('xmlns=')) {
    console.log('\n[CRITICAL] Found namespace pollution (xmlns) in FAILING body!');
}

// Check for self-closing tags that might be different
console.log('\n--- TAG ANALYSIS ---');
const workingTextCount = (workingBody.match(/<TEXT/g) || []).length;
const failingTextCount = (failingBody.match(/<TEXT/g) || []).length;
console.log(`Working <TEXT> count: ${workingTextCount}`);
console.log(`Failing <TEXT> count: ${failingTextCount}`);

const workingSelfClosingText = (workingBody.match(/<TEXT[^>]*\/>/g) || []).length;
const failingSelfClosingText = (failingBody.match(/<TEXT[^>]*\/>/g) || []).length;
console.log(`Working self-closing <TEXT/>: ${workingSelfClosingText}`);
console.log(`Failing self-closing <TEXT/>: ${failingSelfClosingText}`);
