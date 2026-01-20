
import * as fs from 'fs';
import * as path from 'path';
import { parseHmlV2 } from './src/lib/hml-v2/parser';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import type { QuestionWithImages, DbQuestion, DbQuestionImage } from './src/lib/hml-v2/types';

const TEMPLATE_FILE = 'hml v2-test-tem.hml';
const SOURCE_FILE = 'repro_real_image.hml';
const OUTPUT_FILE = 'test_hml_v2_output.hml';

async function main() {
    console.log('=== Verifying 2-Column Layout AND Binary Preservation ===\n');

    // 1. Load Template
    console.log(`[1] Loading Template: ${TEMPLATE_FILE}`);
    if (!fs.existsSync(TEMPLATE_FILE)) {
        console.error('Template not found!');
        process.exit(1);
    }
    const templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf-8');

    // 2. Load Source HML (Real Data with Images)
    console.log(`[2] Loading Source: ${SOURCE_FILE}`);
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error('Source file not found!');
        process.exit(1);
    }
    const sourceContent = fs.readFileSync(SOURCE_FILE, 'utf-8');
    const parseResult = parseHmlV2(sourceContent);

    console.log(`    - Parsed ${parseResult.questions.length} questions`);
    console.log(`    - Parsed ${parseResult.images.length} images`);

    // 3. Map to Generator Input Format
    console.log(`[3] Mapping Data...`);
    const questionsWithImages: QuestionWithImages[] = parseResult.questions.map((q, idx) => {
        // Find images for this question
        const qImages = q.imageRefs.map(refId => {
            const img = parseResult.images.find(i => i.binId === refId);
            if (!img) return null;
            return {
                id: `img-${img.binId}`,
                question_id: `q-${idx}`,
                original_bin_id: img.binId,
                format: img.format,
                data: img.data,
                size_bytes: img.sizeBytes,
                created_at: new Date().toISOString()
            } as DbQuestionImage;
        }).filter((i): i is DbQuestionImage => i !== null);

        return {
            question: {
                id: `q-${idx}`,
                question_number: q.questionNumber,
                content_xml: q.contentXml,
                plain_text: q.plainText
            } as DbQuestion,
            images: qImages
        };
    });

    // 4. Generate
    console.log('[4] Generating HML via Template...');
    const result = generateHmlFromTemplate(templateContent, questionsWithImages);

    // 5. Save
    console.log(`[5] Saving to ${OUTPUT_FILE}`);
    fs.writeFileSync(OUTPUT_FILE, result.hmlContent, 'utf-8');

    // 6. Verification
    console.log('\n=== Verification Results ===');

    // Check SECDEF
    const sectionMatch = result.hmlContent.match(/<SECTION[^>]*>([\s\S]*?)<\/SECTION>/);
    if (!sectionMatch) {
        console.error('FAIL: No SECTION found in output');
    } else {
        const sectionContent = sectionMatch[1];
        // Check for SECDEF preservation
        if (sectionContent.includes('<SECDEF')) {
            console.log('PASS: <SECDEF> found in output SECTION.');
        } else {
            console.error('FAIL: No <SECDEF> found in output SECTION.');
        }

        // Check for Binary Remapping
        // We look for BinItem="X" OR BinData="X" where X > 1
        const remappedRefs = sectionContent.match(/(?:BinItem|BinData)="(\d+)"/g);
        if (remappedRefs) {
            console.log(`PASS: Found ${remappedRefs.length} image references in content.`);
            console.log(`      Refs: ${remappedRefs.slice(0, 5).join(', ')}...`);

            const hasNewIds = remappedRefs.some(r => parseInt(r.match(/\d+/)![0]) > 1);
            if (hasNewIds) {
                console.log('PASS: Image IDs explicitly remapped to > 1 (Template Image ID assumed 1)');
            } else {
                console.warn('WARNING: All Image IDs are 1? This might mean remapping failed or only template image is used.');
            }
        } else {
            if (parseResult.images.length > 0) {
                console.error('FAIL: Original had images, but no BinItem refs found in output content!');
            } else {
                console.log('INFO: No binary references found (Source had no images).');
            }
        }
    }

    // Check BINDATASTORAGE count
    const storageMatch = result.hmlContent.match(/<BINDATASTORAGE[^>]*Count="(\d+)"/);
    if (storageMatch) {
        console.log(`PASS: BINDATASTORAGE Count = ${storageMatch[1]}`);
    } else {
        console.error('FAIL: BINDATASTORAGE Count not found');
    }

    // Check HEAD Structure (BINDATALIST should be early in HEAD)
    if (result.hmlContent.match(/<HEAD[^>]*>\s*<BINDATALIST/)) {
        console.log('PASS: BINDATALIST is direct child of HEAD (Standard Structure)');
    } else if (result.hmlContent.match(/<MAPPINGTABLE>\s*<BINDATALIST/)) {
        console.warn('WARNING: BINDATALIST inside MAPPINGTABLE (Might cause Unknown Error)');
    } else {
        console.warn('INFO: BINDATALIST location not strictly determined by regex.');
    }

    // Check TAIL Structure (SCRIPTCODE before BINDATASTORAGE)
    // We check if <SCRIPTCODE comes before <BINDATASTORAGE
    const scriptPos = result.hmlContent.indexOf('<SCRIPTCODE');
    const storagePos = result.hmlContent.indexOf('<BINDATASTORAGE');
    if (scriptPos !== -1 && storagePos !== -1) {
        if (scriptPos < storagePos) {
            console.log('PASS: SCRIPTCODE appears before BINDATASTORAGE (Standard Structure)');
        } else {
            console.error('FAIL: BINDATASTORAGE appears before SCRIPTCODE (Order Violation)');
        }
    } else {
        console.log('INFO: Could not verify TAIL order (One tag missing?)');
    }

    // Check BINDATA Attributes (Strict Mode)
    const binDataRegex = /<BINDATA[^>]*Id="(\d+)"[^>]*>/g;
    let match;
    let attributePass = true;
    while ((match = binDataRegex.exec(result.hmlContent)) !== null) {
        const tag = match[0];
        if (!tag.includes('Size="')) {
            console.error(`FAIL: BINDATA Id="${match[1]}" missing 'Size' attribute`);
            attributePass = false;
        }
        if (!tag.includes('Compress="')) {
            console.error(`FAIL: BINDATA Id="${match[1]}" missing 'Compress' attribute`);
            attributePass = false;
        }
    }
    if (attributePass) {
        console.log('PASS: All BINDATA tags have Size and Compress attributes');
    }
}

main();
