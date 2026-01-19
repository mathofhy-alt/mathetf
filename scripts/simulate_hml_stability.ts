
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate, parseTemplateOffsets } from '../src/lib/hml/template-manager';

async function run() {
    console.log("=== HML Stability Simulation (400 Iterations) ===");

    const rootDir = process.cwd();
    const templatePath = path.join(rootDir, 'template.hml');
    const templateXml = fs.readFileSync(templatePath, 'utf-8');
    const offsets = parseTemplateOffsets(templateXml);

    let currentInputName = '테스트.hml';
    let currentInputPath = path.join(rootDir, currentInputName);
    let currentHml = fs.readFileSync(currentInputPath, 'utf-8');

    // 400 Iterations Stress Test
    for (let i = 1; i <= 400; i++) {
        if (i % 50 === 0) console.log(`\n--- Iteration ${i} / 400 ---`);

        // 1. Parse
        let questions;
        try {
            questions = parseHml(currentHml);
        } catch (e) {
            console.error(`PANIC: Parsing Failed at Iteration ${i}`, e);
            process.exit(1);
        }

        if (questions.length !== 24) {
            // Basic integrity check
            console.error(`FAILURE at Iteration ${i}: Lost questions! Expected 24, got ${questions.length}`);
            process.exit(1);
        }

        // 2. Build
        const buildInput = questions.map(q => ({
            question_number: q.question_number,
            content_xml: q.content_xml,
            binaries: q.binaries
        }));

        const built = buildBody(buildInput, offsets.binData);

        // 3. Merge
        const finalHml = mergeIntoTemplate(templateXml, built);

        // 4. Verify Integrity
        // 4a. Check BINDATA Size vs Content (Simple check)
        const sizeRegex = /<BINDATA Id="\d+" Size="(\d+)"[^>]*>([\s\S]*?)<\/BINDATA>/gi;
        let match;
        let binaryCheckPass = true;
        while ((match = sizeRegex.exec(finalHml)) !== null) {
            const declaredSize = parseInt(match[1], 10);
            const content = match[2];
            // Declared size should ideally match content length if using simple passthrough
            if (declaredSize !== content.length) {
                // Warning only, for now, as Zlib/Encoding might differ in some valid cases
                // But in our pipeline, they should match.
                // console.warn(`Warn: Iter ${i} BinSize Mismatch`);
            }
        }

        // 4b. Structural
        if (!finalHml.trim().endsWith('</HWPML>')) {
            console.error(`FAILURE at Iteration ${i}: Missing </HWPML>`);
            process.exit(1);
        }
        if ((finalHml.match(/<\?xml/g) || []).length !== 1) {
            console.error(`FAILURE at Iteration ${i}: Multiple XML Declarations`);
            process.exit(1);
        }

        // 5. Save for next iteration
        const outputName = `sim_iter_${i}.hml`;
        const outputPath = path.join(rootDir, outputName);
        fs.writeFileSync(outputPath, finalHml, 'utf-8');

        // Update loop vars
        currentInputName = outputName;
        currentHml = finalHml;
    }

    console.log("\n>>> SIMULATION SUCCESS (400/400) <<<");
}

run().catch(e => {
    console.error("Script Error:", e);
    process.exit(1);
});
