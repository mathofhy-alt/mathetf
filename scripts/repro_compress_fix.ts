
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_compress_fix.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

// 1x1 Red Pixel PNG Base64 (Uncompressed)
const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO COMPRESS FIX ===");

    // 1. Mock Questions with BOOLEAN true/false for compress (Simulate mix types)
    // Case 1: Boolean true (Must result in 'true')
    // Case 2: String 'true' (Must result in 'true')
    // Case 3: Boolean false (Must result in 'false')

    // Note: We use VALID_PNG_BASE64 even for "compressed" just to check the Output Attribute.

    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Compress Bool Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: VALID_PNG_BASE64,
            type: 'png',
            binType: 'Embedding',
            compress: true // BOOLEAN input!
        }]
    }];

    // 2. Build Body
    // @ts-ignore
    const buildResult = buildBody(questions);

    // 3. Load Template
    let templateXml = "";
    try {
        templateXml = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    } catch (e) {
        templateXml = `<HWPML><HEAD><BINDATALIST Count="0"/></HEAD><BODY></BODY><TAIL></TAIL></HWPML>`;
    }

    // 4. Merge
    const finalHml = mergeIntoTemplate(templateXml, {
        combinedBodyPs: buildResult.combinedBodyPs,
        binDataItems: buildResult.binDataItems,
        styleItems: buildResult.styleItems
    });

    // 5. Verify Output Attributes
    fs.writeFileSync(OUTPUT_FILE, finalHml);
    console.log(`Saved to ${OUTPUT_FILE}`);

    const binItemMatch = finalHml.match(/<BINITEM[^>]*Compress="([^"]+)"/);
    const binDataMatch = finalHml.match(/<BINDATA[^>]*Id="1"[^>]*Compress="([^"]+)"/);

    let pass = true;

    if (binItemMatch) {
        console.log(`BINITEM Compress: ${binItemMatch[1]}`);
        if (binItemMatch[1] !== 'true') {
            console.error("FAIL: BINITEM Compress should be 'true' for boolean input.");
            pass = false;
        }
    } else {
        console.error("FAIL: BINITEM not found");
        pass = false;
    }

    if (binDataMatch) {
        console.log(`BINDATA Compress: ${binDataMatch[1]}`);
        if (binDataMatch[1] !== 'true') {
            console.error("FAIL: BINDATA Compress should be 'true' for boolean input.");
            pass = false;
        }
    } else {
        console.error("FAIL: BINDATA not found");
        pass = false;
    }

    if (pass) console.log("PASS: Compress attribute logic handles booleans correctly.");

    console.log("=== DONE ===");
})();
