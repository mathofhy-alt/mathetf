
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_format_fix.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

// 1x1 Red Pixel PNG Base64
const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO FORMAT FIX ===");

    // 1. Mock Questions
    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Image Test Format Fix</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: VALID_PNG_BASE64,
            type: 'png',
            binType: 'Embedding',
            compress: 'false'
        }]
    }];

    // 2. Build Body
    const buildResult = buildBody(questions as any);

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

    // Check Format case
    const binItemMatch = finalHml.match(/<BINITEM[^>]*Format="([^"]+)"/);
    if (binItemMatch) {
        const fmt = binItemMatch[1];
        if (fmt === 'png') {
            console.log("PASS: Format is lowercase 'png'");
        } else {
            console.error(`FAIL: Format is '${fmt}' (Expected 'png')`);
        }
    } else {
        console.error("FAIL: BINITEM tag not found");
    }

    // Check Size attribute one last time
    if (finalHml.match(/<BINDATA[^>]*Size=/)) {
        console.error("FAIL: BINDATA Size attribute detected!");
    } else {
        console.log("PASS: BINDATA Size attribute absent.");
    }

    console.log("=== DONE ===");
})();
