
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_robust_data_uri.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

const RAW_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// Space before data uri
const DIRTY_DATA_URI = "   \n  data:image/png;base64," + RAW_BASE64;

(async () => {
    console.log("=== STARTING REPRO ROBUST DATA URI ===");

    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Robust Data URI Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: DIRTY_DATA_URI,
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

    // 5. Verify Output Data Content
    fs.writeFileSync(OUTPUT_FILE, finalHml);
    console.log(`Saved to ${OUTPUT_FILE}`);

    // Extract BINDATA content
    const binDataMatch = finalHml.match(/<BINDATA[^>]*>([^<]+)<\/BINDATA>/);

    if (binDataMatch) {
        const content = binDataMatch[1];
        if (content === RAW_BASE64) {
            console.log("PASS: Dirty Data URI stripped correctly. Content matches raw Base64.");
        } else if (content.includes("data:image")) {
            console.error("FAIL: Data URI prefix NOT stripped.");
            console.log("Actual Content Start:", content.substring(0, 50));
        } else {
            console.error("FAIL: Content mismatch.");
            console.log("Expected:", RAW_BASE64);
            console.log("Actual:  ", content);
        }
    } else {
        console.error("FAIL: BINDATA not found");
    }

    console.log("=== DONE ===");
})();
