import * as fs from 'fs';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import type { DbQuestion, QuestionWithImages } from './src/lib/hml-v2/types';

async function test2ColumnReassembly() {
    console.log('--- START TEST: 2-Column Reassembly ---');

    const templatePath = '재조립양식.hml';
    if (!fs.existsSync(templatePath)) {
        console.error(`Template not found: ${templatePath}`);
        process.exit(1);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');

    // Create 5 mock questions to test the flow
    const questions: QuestionWithImages[] = Array.from({ length: 5 }, (_, i) => ({
        question: {
            id: `q${i + 1}`,
            content_xml: `<P ParaShape="3" Style="0"><TEXT CharShape="0">문항 ${i + 1}: 2단 레이아웃 확인용 테스트 문항입니다. 이 내용이 정상적으로 2단으로 출력되어야 합니다.</TEXT></P>`,
            question_number: i + 1,
            plain_text: `문항 ${i + 1}`,
            created_at: new Date().toISOString(),
        } as DbQuestion,
        images: []
    }));

    try {
        const result = generateHmlFromTemplate(templateContent, questions);
        const output = result.hmlContent;

        fs.writeFileSync('test_2column_output.hml', output);
        console.log('Output saved to test_2column_output.hml');

        // Basic structural assertions
        const hasColDef2 = output.includes('COLDEF Count="2"');
        const questionCount = (output.match(/2단 레이아웃 확인용/g) || []).length;

        console.log(`[Check] COLDEF Count="2" Exists: ${hasColDef2 ? 'PASS' : 'FAIL'}`);
        console.log(`[Check] Question Count (Expected 5): ${questionCount === 5 ? 'PASS' : `FAIL (Found ${questionCount})`}`);

        if (hasColDef2 && questionCount === 5) {
            console.log('--- TEST PASSED: 2-Column reassembly looks correct ---');
        } else {
            console.error('!!! TEST FAILED: Structural issues detected !!!');
            process.exit(1);
        }

    } catch (e) {
        console.error('Test Error:', e);
        process.exit(1);
    }
}

test2ColumnReassembly();
