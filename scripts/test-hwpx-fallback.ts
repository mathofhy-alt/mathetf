
import { HwpxParser } from '../src/lib/hwpx/parser';
import assert from 'assert';

// Mock XML Paragraphs
const mockParagraphs = [
    // Header/Garbage
    '<hp:p id="0"><hp:t>Exam Title</hp:t></hp:p>',

    // Q1: Text Trigger "1 ."
    // Note: extractTextFromP handles <hp:t>
    '<hp:p id="1"><hp:t>1</hp:t><hp:t>.</hp:t><hp:t> </hp:t><hp:t>Question One</hp:t></hp:p>',
    '<hp:p id="2"><hp:t>Content of Q1</hp:t></hp:p>',

    // Q2: Text Trigger "2."
    '<hp:p id="3"><hp:t>2.</hp:t><hp:t>Question Two</hp:t></hp:p>',

    // Q3: Style Trigger (Legacy ID 5) - Should still work
    '<hp:p id="4" paraPrIDRef="5"><hp:t>Question Three (Style Trigger)</hp:t></hp:p>',

    // Q4: Gap Tolerance (Jump to 10)
    '<hp:p id="5"><hp:t>10.</hp:t><hp:t>Question Ten</hp:t></hp:p>'
];

async function testHwpxFallback() {
    console.log("Starting HWPX Fallback Test...");

    const parser = new HwpxParser();

    // Access private method via casting
    const parserAny = parser as any;

    // Mock createFragment to avoid full zip dependency
    parserAny.createFragment = async (index: number, xmls: string[]) => {
        return {
            index,
            xml: xmls.join('\n'),
            assets: [],
            styles: {},
            manifestItems: {}
        };
    };

    const questions = await parserAny.groupQuestions(mockParagraphs);

    console.log(`Parsed ${questions.length} questions.`);

    questions.forEach((q: any) => {
        console.log(`Q${q.index}: ${q.xml.substring(0, 50).replace(/\n/g, '')}...`);
    });

    // Expect: 1, 2, 3, 10
    assert.strictEqual(questions.length, 4, "Should parse 4 questions");
    assert.strictEqual(questions[0].index, 1, "Q1");
    // Q1 XML should contain "Question One"
    assert.ok(questions[0].xml.includes("Question One"), "Q1 Content");

    assert.strictEqual(questions[1].index, 2, "Q2");
    assert.strictEqual(questions[2].index, 3, "Q3 (Style)"); // 1->2->3

    // Q10 should be index 10 (Our logic sets currentQNum to foundNumber)
    assert.strictEqual(questions[3].index, 10, "Q10 (Gap)");

    console.log("HWPX FALLBACK TEST PASSED!");
}

testHwpxFallback();
