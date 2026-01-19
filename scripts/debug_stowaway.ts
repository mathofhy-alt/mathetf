
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';
import { buildBody } from '../src/lib/hml/body-builder';

const run = () => {
    console.log("=== Debugging Stowaway Logic ===");

    // 1. Parse Source
    const hmlPath = path.join(process.cwd(), '테스트.hml');
    if (!fs.existsSync(hmlPath)) {
        console.error("File not found: 테스트.hml");
        return;
    }
    const xml = fs.readFileSync(hmlPath, 'utf-8');
    const parsed = parseHml(xml);

    console.log(`Parsed ${parsed.length} questions.`);

    // 2. Check Embedding
    const qWithImages = parsed.find(q => q.content_xml.includes('ANTIGRAVITY_BINARIES'));

    if (!qWithImages) {
        console.error("❌ Stowaway FAILED: No 'ANTIGRAVITY_BINARIES' comment found in ANY question content.");

        // Debug: Check if parser found binaries at all?
        const qWithBins = parsed.find(q => q.binaries.length > 0);
        if (qWithBins) {
            console.log(`   But Question ${qWithBins.question_number} HAS binaries in 'binaries' prop! Logic error in embedding string.`);
        } else {
            console.log("   And NO binaries detected in source parsing at all.");
        }
        return;
    }

    console.log(`✅ Stowaway SUCCESS: Found signature in Q${qWithImages.question_number}`);
    console.log(`   Tail snippet: ${qWithImages.content_xml.slice(-200)}`);

    // 3. Simulate DB Roundtrip (String Only)
    // We assume DB returns this 'content_xml' string.
    const dbRow = {
        question_number: 1,
        content_xml: qWithImages.content_xml,
        binaries: [] // DB loses this
    };

    // 4. Run BuildBody
    console.log("--- Running buildBody extraction ---");
    const built = buildBody([dbRow], 0);

    const extractedBins = built.binDataItems;
    if (extractedBins.length > 0) {
        console.log(`✅ Extraction SUCCESS: Recovered ${extractedBins.length} images.`);
        console.log(`   Image 1 Size: ${extractedBins[0].size}`);
    } else {
        console.error("❌ Extraction FAILED: buildBody returned 0 images.");
    }
}

run();
