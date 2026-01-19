
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_order_check.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

const RAW_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO ORDER CHECK ===");

    // Testing Lowercase 'bindata' input to verify normalization
    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Order Test</TEXT></P><P><PICTURE bindata="1" /></P>`,
        binaries: [{
            id: '1',
            data: RAW_BASE64,
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
        templateXml = `<HWPML><HEAD><DOCSETTING Picture="1" /></HEAD><BODY></BODY><TAIL></TAIL></HWPML>`;
    }

    // 4. Merge
    const finalHml = mergeIntoTemplate(templateXml, {
        combinedBodyPs: buildResult.combinedBodyPs,
        binDataItems: buildResult.binDataItems,
        styleItems: buildResult.styleItems
    });

    // 5. Verify Structure
    fs.writeFileSync(OUTPUT_FILE, finalHml);
    console.log(`Saved to ${OUTPUT_FILE}`);

    // Verify Order: DOCSETTING before BINDATALIST
    const headContent = finalHml.match(/<HEAD>([\s\S]*?)<\/HEAD>/)?.[1] || "";
    const docSettingIdx = headContent.indexOf("DOCSETTING");
    const binListIdx = headContent.indexOf("BINDATALIST");

    if (docSettingIdx !== -1 && binListIdx !== -1) {
        if (binListIdx > docSettingIdx) {
            console.log("PASS: BINDATALIST is AFTER DOCSETTING.");
        } else {
            console.error("FAIL: BINDATALIST is BEFORE DOCSETTING.");
        }
    } else {
        console.log("WARN: Tag missing (okay if template different).");
    }

    // Verify Body Attribute Case
    const pictureTag = finalHml.match(/<PICTURE[^>]*>/)?.[0] || "";
    if (pictureTag) {
        if (pictureTag.includes('BinData="1"')) { // Normalization happens during remapping?
            // Wait, template-manager currently does NOT normalize unless I add it.
            // I haven't added normalization logic yet in this step sequence.
            // Checking if it fails as expected.
            console.log(`PICTURE TAG: ${pictureTag}`);
        } else if (pictureTag.includes('bindata="1"')) {
            console.log("INFO: Attribute is still lowercase (bindata).");
        }
    }

    console.log("=== DONE ===");
})();
