
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_force_compress.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO FORCE COMPRESS ===");

    // Simulate input that CLAIMS to be compressed (true) but should differ in output
    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Force Compress Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: VALID_PNG_BASE64,
            type: 'png',
            binType: 'Embedding',
            compress: true // Input says TRUE
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

    if (binItemMatch && binItemMatch[1] === 'false') {
        console.log("PASS: BINITEM Compress forced to 'false' even with true input.");
    } else {
        console.error(`FAIL: BINITEM Compress is '${binItemMatch?.[1]}'`);
    }

    if (binDataMatch && binDataMatch[1] === 'false') {
        console.log("PASS: BINDATA Compress forced to 'false' even with true input.");
    } else {
        console.error(`FAIL: BINDATA Compress is '${binDataMatch?.[1]}'`);
    }

    console.log("=== DONE ===");
})();
