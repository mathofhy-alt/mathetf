/**
 * HML V2 Round-Trip Test
 * 
 * Tests:
 * 1. Parse an HML file with images
 * 2. Simulate storing to database
 * 3. Generate new HML from extracted data
 * 4. Save to file for Hancom Office testing
 * 
 * Run: npx ts-node test-hml-v2.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseHmlV2 } from './src/lib/hml-v2/parser.ts';
import { generateHmlV2 } from './src/lib/hml-v2/generator.ts';
import type { QuestionWithImages, DbQuestion, DbQuestionImage } from './src/lib/hml-v2/types.ts';

const TEST_INPUT = 'repro_real_image.hml';
const TEST_OUTPUT = 'test_hml_v2_output.hml';

async function main() {
    console.log('=== HML V2 Round-Trip Test ===\n');

    // Step 1: Read source HML
    const inputPath = path.join(__dirname, TEST_INPUT);
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const hmlContent = fs.readFileSync(inputPath, 'utf-8');
    console.log(`[1] Loaded ${TEST_INPUT} (${hmlContent.length} bytes)`);

    // Step 2: Parse HML
    console.log('\n[2] Parsing HML...');
    const parseResult = parseHmlV2(hmlContent);

    console.log(`    Questions: ${parseResult.questions.length}`);
    console.log(`    Images: ${parseResult.images.length}`);

    for (const q of parseResult.questions) {
        console.log(`    - Q${q.questionNumber}: "${q.plainText.slice(0, 50)}..." (refs: ${q.imageRefs.join(', ') || 'none'})`);
    }

    for (const img of parseResult.images) {
        console.log(`    - Image ${img.binId}: ${img.format}, ${img.sizeBytes} bytes`);
    }

    // Step 3: Simulate database storage
    console.log('\n[3] Simulating database storage...');

    const questionsWithImages: QuestionWithImages[] = parseResult.questions.map((q, idx) => {
        // Create mock DbQuestion
        const dbQuestion: DbQuestion = {
            id: `mock-question-${idx + 1}`,
            question_number: q.questionNumber,
            content_xml: q.contentXml,
            plain_text: q.plainText
        };

        // Find images referenced by this question
        const dbImages: DbQuestionImage[] = q.imageRefs.map(ref => {
            const img = parseResult.images.find(i => i.binId === ref);
            if (!img) {
                console.warn(`    Warning: Image ref ${ref} not found`);
                return null;
            }
            return {
                id: `mock-image-${ref}`,
                question_id: dbQuestion.id,
                original_bin_id: ref,
                format: img.format,
                data: img.data,
                size_bytes: img.sizeBytes,
                created_at: new Date().toISOString()
            };
        }).filter(Boolean) as DbQuestionImage[];

        return { question: dbQuestion, images: dbImages };
    });

    console.log(`    Prepared ${questionsWithImages.length} questions for generation`);

    // Step 4: Generate new HML
    console.log('\n[4] Generating new HML...');
    const generateResult = generateHmlV2(questionsWithImages);

    console.log(`    Output size: ${generateResult.hmlContent.length} bytes`);
    console.log(`    Questions: ${generateResult.questionCount}`);
    console.log(`    Images: ${generateResult.imageCount}`);

    // Step 5: Save output
    const outputPath = path.join(__dirname, TEST_OUTPUT);
    fs.writeFileSync(outputPath, generateResult.hmlContent, 'utf-8');
    console.log(`\n[5] Saved to ${TEST_OUTPUT}`);

    console.log('\n=== Test Complete ===');
    console.log(`\nPlease open ${TEST_OUTPUT} in Hancom Office to verify:`);
    console.log('  - File opens without errors');
    console.log('  - Images are displayed correctly');
    console.log('  - Content structure is preserved');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
