
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_exact_match.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO EXACT MATCH ===");

    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Exact Match Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: VALID_PNG_BASE64,
            type: 'png',
            binType: 'Embedding',
            compress: false
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

    // Verify BINITEM
    const binItemMatch = finalHml.match(/<BINITEM[^>]*>/);
    if (binItemMatch) {
        const tag = binItemMatch[0];
        console.log(`BINITEM: ${tag}`);

        if (tag.includes("Path=")) console.error("FAIL: Path attribute present.");
        else console.log("PASS: Path attribute absent.");

        if (tag.includes("Compress=")) console.error("FAIL: Compress attribute present on BINITEM.");
        else console.log("PASS: Compress attribute absent on BINITEM.");
    }

    // Verify BINDATA (Must HAVE Compress=false)
    const binDataMatch = finalHml.match(/<BINDATA[^>]*>/);
    if (binDataMatch) {
        const tag = binDataMatch[0];
        console.log(`BINDATA: ${tag}`);
        if (tag.includes('Compress="false"')) console.log("PASS: BINDATA has Compress=false");
        else console.error("FAIL: BINDATA missing Compress=false");
    }

    console.log("=== DONE ===");
})();
