
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const OUTPUT_FILE = path.join(process.cwd(), 'repro_mapping_order.hml');
const TEMPLATE_FILE = path.join(process.cwd(), 'template.hml');

const RAW_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
    console.log("=== STARTING REPRO MAPPING ORDER ===");

    const questions = [{
        question_number: 1,
        content_xml: `<P><TEXT>Mapping Order Test</TEXT></P><P><PICTURE BinData="1" /></P>`,
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

    // 3. Load Template (FORCE MOCK for Order Verification)
    let templateXml = `<HWPML><HEAD><MAPPINGTABLE></MAPPINGTABLE></HEAD><BODY></BODY><TAIL></TAIL></HWPML>`;


    // 4. Merge
    const finalHml = mergeIntoTemplate(templateXml, {
        combinedBodyPs: buildResult.combinedBodyPs,
        binDataItems: buildResult.binDataItems,
        styleItems: buildResult.styleItems
    });

    // 5. Verify Structure
    fs.writeFileSync(OUTPUT_FILE, finalHml);
    console.log(`Saved to ${OUTPUT_FILE}`);

    // Verify Order: MAPPINGTABLE before BINDATALIST
    const headContent = finalHml.match(/<HEAD>([\s\S]*?)<\/HEAD>/)?.[1] || "";
    const mappingIdx = headContent.indexOf("MAPPINGTABLE");
    const binListIdx = headContent.indexOf("BINDATALIST");

    if (mappingIdx !== -1 && binListIdx !== -1) {
        if (binListIdx > mappingIdx) {
            console.log("PASS: BINDATALIST is AFTER MAPPINGTABLE.");
        } else {
            console.error("FAIL: BINDATALIST is BEFORE MAPPINGTABLE.");
            console.error(`Mapping: ${mappingIdx}, BinList: ${binListIdx}`);
        }
    } else {
        console.log("WARN: Tag missing.");
    }

    console.log("=== DONE ===");
})();
