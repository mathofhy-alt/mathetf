
import * as fs from 'fs';
import * as path from 'path';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import type { DbQuestion, QuestionWithImages } from './src/lib/hml-v2/types';

const templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml');
if (!fs.existsSync(templatePath)) {
    console.error('Template not found:', templatePath);
    process.exit(1);
}

const templateContent = fs.readFileSync(templatePath, 'utf-8');
console.log(`Loaded template: ${templateContent.length} chars`);

// Mock Question
const mockQuestion: any = {
    id: 'q1',
    content_xml: '<P><TEXT>VERIFICATION_TEXT_Content_Injection_Success</TEXT></P>',
    question_number: 1,
    plain_text: 'VERIFICATION_TEXT',
    created_at: new Date().toISOString(),
};

const qwi: QuestionWithImages = {
    question: mockQuestion as DbQuestion,
    images: []
};

console.log('Generating HML...');
try {
    const result = generateHmlFromTemplate(templateContent, [qwi]);
    const output = result.hmlContent;

    fs.writeFileSync('verify_output.hml', output);
    console.log(`Generated output: ${output.length} chars`);

    if (output.includes('VERIFICATION_TEXT_Content_Injection_Success')) {
        console.log('SUCCESS: Content was successfully injected!');

        // Also check if valid XML structure
        if (output.includes('</SECTION>')) {
            console.log('SUCCESS: Structure looks valid.');
        } else {
            console.error('FAIL: Output structure broken (missing </SECTION>)');
        }

    } else {
        console.error('FAIL: Content NOT found in output. Template fix failed.');
    }

} catch (e) {
    console.error('Error generating HML:', e);
}
