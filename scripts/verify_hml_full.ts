
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate, parseTemplateOffsets } from '../src/lib/hml/template-manager';

async function run() {
    console.log("=== HML Verification Start ===");

    // 1. Load Source HML (테스트.hml)
    const sourcePath = path.join(process.cwd(), '테스트.hml');
    if (!fs.existsSync(sourcePath)) {
        console.error("ERROR: Source file '테스트.hml' not found.");
        process.exit(1);
    }
    const sourceHml = fs.readFileSync(sourcePath, 'utf-8');
    console.log(`Loaded Source: ${sourcePath} (${sourceHml.length} bytes)`);

    // 2. Parse Source
    const questions = parseHml(sourceHml);
    console.log(`Parsed Questions: ${questions.length}`);

    if (questions.length !== 24) {
        console.error(`FAILURE: Expected 24 questions, got ${questions.length}`);
        // We continue to see what happens, but this is a fail condition.
        // process.exit(1);
    } else {
        console.log("SUCCESS: Parsed exactly 24 questions.");
    }

    // 3. Load Template (template.hml)
    const templatePath = path.join(process.cwd(), 'template.hml');
    if (!fs.existsSync(templatePath)) {
        console.error("ERROR: Template file 'template.hml' not found.");
        process.exit(1);
    }
    const templateXml = fs.readFileSync(templatePath, 'utf-8');
    console.log(`Loaded Template: ${templatePath} (${templateXml.length} bytes)`);

    // 4. Transform for "Download" (Rebuild)
    //    a. Get Offsets
    const offsets = parseTemplateOffsets(templateXml);
    console.log("Template offsets:", offsets);

    //    b. Build Body
    //    We map ParsedQuestion (from parser) to BodyBuilder Question interface
    //    Parser's 'binDataRefs'/'referencedBinaries' -> Builder's 'binaries'
    //    Note: Parser uses 'referencedBinaries' with { id, base64Data, type }
    //          Builder uses 'binaries' with { id, data, type }
    //          Fields match!
    const buildInput = questions.map(q => ({
        question_number: q.question_number,
        content_xml: q.content_xml,
        binaries: q.binaries
    }));

    const built = buildBody(buildInput, offsets.binData);
    console.log(`Built Body: ${built.binDataItems.length} binaries processed.`);

    //    c. Merge (Generate Final HML)
    const finalHml = mergeIntoTemplate(templateXml, built);
    console.log(`Final HML Generated: ${finalHml.length} bytes`);

    // 5. Verification Checks on Final Output
    const checks = [
        { name: "Starts with XML Declaration", pass: finalHml.trim().startsWith('<?xml version="1.0"') },
        { name: "Ends with </HWPML>", pass: finalHml.trim().endsWith('</HWPML>') },
        { name: "Contains <BODYTEXT>", pass: finalHml.includes('<BODYTEXT>') },
        { name: "Contains <BINDATASTORAGE>", pass: finalHml.includes('<BINDATASTORAGE>') },
        { name: "No Nested XML Decl", pass: !/<BINDATA[^>]*>[\s\S]*?<\?xml/.test(finalHml) }, // Check for <?xml inside BINDATA
        { name: "Binary Count Match", pass: (finalHml.match(/<BINDATA\b/g) || []).length === built.binDataItems.length }
    ];

    console.log("\n=== Integrity Checks ===");
    let allPass = true;
    checks.forEach(c => {
        console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
        if (!c.pass) allPass = false;
    });

    // 6. Write Output
    const outPath = path.join(process.cwd(), 'verification_output.hml');
    fs.writeFileSync(outPath, finalHml, 'utf-8');
    console.log(`\nOutput written to: ${outPath}`);

    if (allPass && questions.length === 24) {
        console.log("\n>>> VERIFICATION SUCCESS <<<");
    } else {
        console.log("\n>>> VERIFICATION FAILED <<<");
        process.exit(1);
    }
}

run().catch(e => {
    console.error("Script Error:", e);
    process.exit(1);
});
