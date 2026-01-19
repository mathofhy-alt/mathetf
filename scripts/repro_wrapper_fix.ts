
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_wrapper_fix.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

// 1x1 Red Pixel PNG Base64
const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO WRAPPER FIX ===");

    // 1. Mock Questions (Bare PICTURE tag)
    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Wrapper Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: VALID_PNG_BASE64,
            type: 'png',
            binType: 'Embedding',
            compress: 'false'
        }]
    }];

    // 2. Build Body (Should inject Wrapper)
    const buildResult = buildBody(questions as any);

    // Verify Wrapper Injection in Fragments immediately
    const q1Body = buildResult.bodyFragments[0];
    if (q1Body.includes('<SHAPEOBJECT') && q1Body.includes('InstId=')) {
        console.log("PASS: SHAPEOBJECT wrapper injected into body fragment.");
    } else {
        console.error("FAIL: SHAPEOBJECT wrapper MISSING in body fragment.");
    }

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

    // 5. Verify Output
    fs.writeFileSync(OUTPUT_FILE, finalHml);
    console.log(`Saved to ${OUTPUT_FILE}`);

    // Final checks
    const shapeMatch = finalHml.match(/<SHAPEOBJECT[^>]*>/);
    const pictureMatch = finalHml.match(/<PICTURE[^>]*>/);

    if (shapeMatch && pictureMatch) {
        console.log("PASS: Final HML contains both SHAPEOBJECT and PICTURE.");
    } else {
        console.error("FAIL: Final HML structure insufficient.");
        if (!shapeMatch) console.error("- Missing SHAPEOBJECT");
        if (!pictureMatch) console.error("- Missing PICTURE");
    }

    console.log("=== DONE ===");
})();
