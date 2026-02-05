
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

// Mock data
const mockQuestions = [
    {
        question: {
            id: 'q1',
            content_xml: '<P><TEXT>Sample Question Content</TEXT></P>',
            question_number: 1
        },
        images: []
    }
];

const templatePath = './hml v2-test-tem.hml';
const templateContent = fs.readFileSync(templatePath, 'utf8');

const result = generateHmlFromTemplate(templateContent, mockQuestions);

if (result.success && result.hml) {
    const hml = result.hml;

    // 1. Check for PARAHEAD inside P
    const hasParaheadInP = /<P[^>]*>[^<]*<PARAHEAD/i.test(hml);
    console.log(`[VERIFY] PARAHEAD in P detected: ${hasParaheadInP}`);

    // 2. Check for Manual Numbering
    const hasManualNum = /<CHAR>1\. <\/CHAR>/i.test(hml);
    console.log(`[VERIFY] Manual numbering '1. ' detected: ${hasManualNum}`);

    // 3. Check for HeadingType="None" in Style (if patched)
    const stylePatchCheck = /HeadingType="None"/i.test(hml);
    console.log(`[VERIFY] Style HeadingType="None" detected: ${stylePatchCheck}`);

    if (!hasParaheadInP && hasManualNum) {
        console.log('SUCCESS: Structural fix verified. PARAHEAD removed from body.');
    } else {
        console.error('FAILURE: Structural fix failed or numbering missing.');
    }

    fs.writeFileSync('test_crash_fix_output.hml', hml);
    console.log('Test output saved to test_crash_fix_output.hml');
} else {
    console.error('HML generation failed:', result.error);
}
