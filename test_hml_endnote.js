
const fs = require('fs');
const path = require('path');
// Import the transpiled JS if available, OR require the TS file via ts-node in a separate process?
// No, I can't require TS from JS without registration.
// But `generator.ts` is in `src`.
// I will try to use `ts-node` one last time with explicit error logging?
// No, silence is bad.
// I will use `require` in a `.js` file and run with `npx ts-node` again?
// Wait, the previous run was `npx ts-node --skip-project test_hml_with_endnotes.ts`.
// It exited 0 but no output.
// Maybe `main()` was not called? It was called.
// Maybe `generateHmlFromTemplate` crashed silently?
// I will add more logs and try catch.

/* 
  Trying `.ts` again but with robust logging.
*/

const generatorPath = './src/lib/hml-v2/generator';
console.log('Loading generator from:', generatorPath);
const generator = require(generatorPath);
console.log('Generator loaded. Keys:', Object.keys(generator));

const generateHmlFromTemplate = generator.generateHmlFromTemplate;
if (!generateHmlFromTemplate) {
    console.error('ERROR: function not found!');
    process.exit(1);
}

// Mock Data
const mockQuestion = {
    question: {
        id: 'test-1',
        content_xml: '<P><TEXT>Question 1 <ENDNOTE><PARALIST><P><TEXT>Answer</TEXT></P></PARALIST></ENDNOTE></TEXT></P>',
        question_number: 1,
        unit_code: '',
        difficulty: 1,
        height: 100,
        content_text_only: 'Question 1',
        plain_text: 'Question 1'
    },
    images: []
};

async function main() {
    try {
        console.log('Running Endnote Test (CJS)...');
        const TEMPLATE_PATH = path.join(process.cwd(), 'hml v2-test-tem.hml');
        const OUTPUT_PATH = path.join(process.cwd(), 'test_output_endnote.hml');

        if (!fs.existsSync(TEMPLATE_PATH)) {
            console.error('Template not found:', TEMPLATE_PATH);
            return;
        }

        const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
        console.log('Template loaded. Size:', templateContent.length);

        console.log('Calling generateHmlFromTemplate...');
        const result = generateHmlFromTemplate(
            templateContent,
            [mockQuestion]
        );
        console.log('Generation complete.');

        fs.writeFileSync(OUTPUT_PATH, result.hmlContent);
        console.log('HML Generated at:', OUTPUT_PATH);

        if (result.hmlContent.includes('CharShape="3"')) {
            console.log('SUCCESS: Found CharShape="3" in output.');
            const idx = result.hmlContent.indexOf('CharShape="3"');
            console.log('Context:', result.hmlContent.substring(idx - 50, idx + 100));
        } else {
            console.error('FAILURE: CharShape="3" NOT found in output.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

main();
