import * as fs from 'fs';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator.ts';
import type { DbQuestion, QuestionWithImages } from './src/lib/hml-v2/types.ts';

// 1. Mock Template with critical content "TEMPLATE_MARKER"
const mockTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<HWPML Style="embed" SubVersion="8.0.0.0" Version="2.8">
<HEAD SecCnt="1">
    <BINDATALIST Count="0"></BINDATALIST>
    <MAPPINGTABLE></MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION Id="0">
    <P><TEXT>TEMPLATE_MARKER_HEADER</TEXT></P>
    <P><SECDEF><STARTNUMBER/></SECDEF></P>
    <P><TEXT>TEMPLATE_MARKER_FOOTER</TEXT></P>
    <P><TEXT>NEWLY APPENDED QUESTION CONTENT</TEXT></P>
</SECTION>
</BODY>
<TAIL>
    <BINDATASTORAGE Count="0"></BINDATASTORAGE>
</TAIL>
</HWPML>`;

// 2. Mock Question
const mockQuestion: any = {
    id: 'q1',
    content_xml: '<P ParaShape="999"><TEXT CharShape="999">QUESTION_WITH_MISSING_STYLE</TEXT></P>',
    question_number: 1,
    plain_text: 'QUESTION_WITH_MISSING_STYLE',
    created_at: new Date().toISOString(),
};

const qwi: QuestionWithImages = {
    question: mockQuestion as DbQuestion,
    images: []
};

console.log('--- START TEST: Style Definition Consistency ---');

// 3. Generate
try {
    const result = generateHmlFromTemplate(mockTemplate, [qwi]);
    const output = result.hmlContent;

    // Save for inspection
    fs.writeFileSync('repro_style_fail.hml', output);
    console.log('Output saved to repro_style_fail.hml');

    // 4. Assertions
    const hasRef999Para = output.includes('ParaShape="999"');
    const hasRef999Char = output.includes('CharShape="999"');

    console.log(`[Check] ParaShape="999" Reference Exists: ${hasRef999Para ? 'FAIL (Should be stripped)' : 'PASS (Stripped)'}`);
    console.log(`[Check] CharShape="999" Reference Exists: ${hasRef999Char ? 'FAIL (Should be stripped)' : 'PASS (Stripped)'}`);

    if (hasRef999Para || hasRef999Char) {
        console.error('!!! FATAL: Style attributes persisted. Content might be invisible. !!!');
        process.exit(1);
    } else {
        console.log('--- TEST PASSED: Style attributes safely stripped ---');
    }

} catch (e) {
    console.error('Test Error:', e);
    process.exit(1);
}
