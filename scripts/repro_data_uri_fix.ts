
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_data_uri_fix.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

// Data URI Prefix + Valid PNG Base64
const DATA_URI_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const RAW_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO DATA URI FIX ===");

    // Simulate input with Data URI Prefix
    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Data URI Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
        binaries: [{
            id: '1',
            data: DATA_URI_BASE64,
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
            console.log("PASS: Data URI prefix stripped correctly. Content matches raw Base64.");
        } else if (content.includes("data:image")) {
            console.error("FAIL: Data URI prefix NOT stripped.");
        } else {
            console.error("FAIL: Content mismatch but prefix gone? Weird.");
            console.log("Expected:", RAW_BASE64);
            console.log("Actual:  ", content);
        }
    } else {
        console.error("FAIL: BINDATA not found");
    }

    console.log("=== DONE ===");
})();
