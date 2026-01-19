
import fs from 'fs';
import path from 'path';
import { getAntigravityHeader, getAntigravityTail } from '../src/lib/hml/template';
import { buildBody } from '../src/lib/hml/body-builder';

// Mock Question Data
const mockQuestions = [
    {
        id: 'test-q-1',
        question_number: 1,
        // Unsafe input: ParaShape="99", Style="55" not defined in our template
        content_xml: `<P ParaShape="99" Style="55"><TEXT CharShape="99">테스트 문제 1번입니다. 다음 중 옳은 것은?</TEXT></P>`,
        plain_text: '테스트 문제 1번입니다.',
        subject: '수학',
        difficulty: 'Medium'
    },
    {
        id: 'test-q-2',
        question_number: 2,
        // Unsafe input with attributes on TEXT
        content_xml: `<P ParaShape="123"><TEXT CharShape="456" Bold="true">테스트 문제 2번입니다. 계산하시오: 1+1=?</TEXT></P>`,
        plain_text: '테스트 문제 2번입니다.',
        subject: '수학',
        difficulty: 'Easy'
    }
];

async function generateDebugHml() {
    console.log('Generating Debug HML...');

    try {
        const header = getAntigravityHeader('Debug Exam');
        const body = buildBody(mockQuestions);
        const tail = getAntigravityTail();

        const fullHml = header + body + tail;

        const outputPath = path.join(__dirname, 'debug_output.hml');
        fs.writeFileSync(outputPath, fullHml, 'utf8');

        console.log(`Successfully wrote debug HML to: ${outputPath}`);
        console.log('first 500 chars:', fullHml.substring(0, 500));
        console.log('last 200 chars:', fullHml.substring(fullHml.length - 200));

    } catch (e) {
        console.error('Error generating HML:', e);
    }
}

generateDebugHml();
