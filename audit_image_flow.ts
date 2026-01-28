
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import fs from 'fs';
import path from 'path';

// Mock Data
const MOCK_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<HWPML Style="embed" SubVersion="8.0.0.0" Version="2.8">
<HEAD>
<MAPPINGTABLE>
<BINDATALIST Count="0"></BINDATALIST>
</MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION>
{{CONTENT_HERE}}
</SECTION>
</BODY>
<TAIL>
<BINDATASTORAGE Count="0"></BINDATASTORAGE>
</TAIL>
</HWPML>`;

const MOCK_QUESTION_CONTENT = `
<P>
<TEXT>
<CHAR>Question 1 Image:</CHAR>
<CHAR>
<PICTURE>
<SHAPEOBJECT>
<IMAGE BinData="111" />
</SHAPEOBJECT>
</PICTURE>
</CHAR>
</TEXT>
</P>
`;

const MOCK_IMAGE = {
    original_bin_id: "111",
    format: "png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // 1x1 Red Pixel
    size_bytes: 100
};

async function runAudit() {
    console.log("Starting Image Flow Audit...");

    const questions = [{
        question: { content_xml: MOCK_QUESTION_CONTENT },
        images: [MOCK_IMAGE]
    }];

    const result = generateHmlFromTemplate(MOCK_TEMPLATE, questions as any);

    // Dump to file for inspection
    const outputPath = 'audit_output.hml';
    const hml = result.hmlContent;
    fs.writeFileSync(outputPath, hml);
    console.log(`Generated HML to ${outputPath}`);

    // 1. Check BINDATALIST
    const binItemRegex = /<BINITEM[^>]*?>/g;
    const binItems = hml.match(binItemRegex);
    console.log("BINITEMS Found:", binItems);

    // 1. Check BINDATALIST - Should NOT have Path, should have Format/Type
    if (binItems && !binItems[0].includes('Path=') && binItems[0].includes('Type="Embedding"')) {
        console.log("PASS: BINITEM matches Control File (No Path, Type=Embedding).");
    } else {
        console.error("FAIL: BINITEM malformed (Check for invalid Path attribute).");
    }

    // 2. Check BINDATASTORAGE
    // Remove newlines from HML output before checking vs original base64
    const hmlNoNewlines = hml.replace(/\r?\n|\r/g, '');
    if (hmlNoNewlines.includes(MOCK_IMAGE.data)) {
        console.log("PASS: BINDATASTORAGE contains original Base64 data.");
    } else {
        console.error("FAIL: BINDATASTORAGE missing Base64 data.");
        // Debug
        console.log("Mock Data Start:", MOCK_IMAGE.data.substring(0, 20));
        const bindataTag = hml.match(/<BINDATA[^>]*>([\s\S]*?)<\/BINDATA>/);
        if (bindataTag) console.log("HML Data Start :", bindataTag[1].substring(0, 20));
    }

    // 2.5 Check IMAGERECT/IMAGECLIP should NOT have Effect="RealPic"
    if (hml.includes('<IMAGERECT') && hml.includes('<IMAGERECT') && (hml.match(/<IMAGERECT[^>]*Effect="RealPic"/))) {
        console.error("FAIL: IMAGERECT incorrectly has Effect='RealPic' attribute.");
    } else {
        console.log("PASS: IMAGERECT is clean.");
    }

    // 3. Check PICTURE Remap - Should be BinItem="1" (Hancom Req)
    if (hml.includes('<IMAGE BinItem="1"') || hml.includes('<IMAGE Effect="RealPic" Alpha="0" BinItem="1"')) {
        console.log("PASS: PICTURE Tag correctly uses BinItem='1'.");
    } else {
        console.error("FAIL: PICTURE Tag remap failed (Expected BinItem='1').");
    }

    // 4. Check TreatAsChar
    if (hml.includes('TreatAsChar="true"')) {
        console.log("PASS: PICTURE Tag has TreatAsChar.");
    } else {
        console.error("FAIL: PICTURE Tag missing TreatAsChar.");
    }

}

runAudit();
