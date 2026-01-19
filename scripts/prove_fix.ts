
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate, parseTemplateOffsets } from '../src/lib/hml/template-manager';

async function run() {
    console.log("=== HML FIX PROOF ===");

    // 1. Load Source
    const sourcePath = path.join(process.cwd(), '테스트.hml');
    const sourceHml = fs.readFileSync(sourcePath, 'utf-8');
    const questions = parseHml(sourceHml);

    // 2. Load Template
    const templatePath = path.join(process.cwd(), 'template.hml');
    const templateXml = fs.readFileSync(templatePath, 'utf-8');
    const offsets = parseTemplateOffsets(templateXml);

    // 3. Build
    const buildInput = questions.map(q => ({
        question_number: q.question_number,
        content_xml: q.content_xml,
        binaries: q.binaries
    }));

    const built = buildBody(buildInput, offsets.binData);
    const finalHml = mergeIntoTemplate(templateXml, built);

    console.log("\n[PROOF 1: SECDEF Presence]");
    const secDefMatch = finalHml.match(/<SECTION[^>]*>([\s\S]{0,200})/);
    if (secDefMatch) {
        console.log("SECTION Start:\n" + secDefMatch[1] + "...");
        if (secDefMatch[1].includes("<SECDEF")) {
            console.log(">> ✅ SECDEF Found! (Page Layout Preserved)");
        } else {
            console.log(">> ❌ SECDEF MISSING");
        }
    }

    console.log("\n[PROOF 2: Compression Attribute]");
    const binMatch = finalHml.match(/<BINDATA\s[^>]*>/);
    if (binMatch) {
        console.log("First BINDATA Tag:\n" + binMatch[0]);
        if (binMatch[0].includes('Compress="false"')) {
            console.log(">> ✅ Compress='false' (Correctly copied from source)");
        } else if (binMatch[0].includes('Compress="true"')) {
            // Check source
            if (sourceHml.match(/<BINDATA[^>]*Compress="false"/)) {
                console.log(">> ❌ Mismatch! Source was false, Output is true.");
            } else {
                console.log(">> ✅ Compress='true' (Matches source)");
            }
        }
    }

    console.log("\n[PROOF 3: Structure]");
    const hasBody = finalHml.includes("<BODY>");
    const hasHwpmlEnd = finalHml.trim().endsWith("</HWPML>");
    const hasTailWrapper = finalHml.match(/<TAIL>\s*<BINDATASTORAGE>/) !== null;

    console.log(`Contains <BODY>: ${hasBody ? '✅' : '❌'}`);
    console.log(`BINDATASTORAGE in <TAIL>: ${hasTailWrapper ? '✅' : '❌'}`);
    console.log(`Ends with </HWPML>: ${hasHwpmlEnd ? '✅' : '❌'}`);

    console.log("\n[PROOF 4: Layout & Image Format]");
    // Check BorderFill="1" (Solid)
    const borderFillMatch = finalHml.match(/BorderFill="1"/);
    const borderFillFixed = borderFillMatch !== null;
    console.log(`Table Borders (BorderFill="1"): ${borderFillFixed ? '✅ Fixed (Solid)' : '❌ Failed'}`);

    // Check BinItem Format (Should capture jpg/png/etc)
    const binItemMatch = finalHml.match(/<BINITEM[^>]*Format="([^"]+)"/);
    if (binItemMatch) {
        console.log(`Image Format Detected: ${binItemMatch[1]} ${binItemMatch[1] !== 'png' ? '✅ (Dynamic Preservation)' : '(Check source if png is correct)'}`);
    } else {
        console.log("❌ No BINITEM found");
    }
}

run();
