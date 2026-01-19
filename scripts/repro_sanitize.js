const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function repro() {
    const basePath = path.join(process.cwd(), 'base_template.hwpx');
    console.log(`[Repro] Reading: ${basePath}`);

    if (!fs.existsSync(basePath)) {
        console.error("File not found");
        return;
    }

    const baseData = fs.readFileSync(basePath);
    const baseZip = await JSZip.loadAsync(baseData);
    let baseSection0 = await baseZip.file("Contents/section0.xml").async("string");

    console.log(`[Repro] Original Content Preview (SecPr):`);
    const secPrMatch = /<hp:secPr[\s\S]*?>/.exec(baseSection0);
    console.log(secPrMatch ? secPrMatch[0] : "No secPr found");

    // LOGIC COPY FROM HWX MERGER
    if (baseSection0.includes('masterPageCnt="1"') || baseSection0.includes('masterPageCnt')) {
        console.log("[Repro] Sanitizing...");
        baseSection0 = baseSection0.replace(/masterPageCnt="\d+"/, 'masterPageCnt="0"');

        baseSection0 = baseSection0.replace(/borderFillIDRef="\d+"/, '')
            .replace(/<hp:pageBorderFill\b[^>]*>[\s\S]*?<\/hp:pageBorderFill>/, '')
            .replace(/<hp:pageBorderFill\b[^>]*\/>/, '');
    }

    console.log(`[Repro] Sanitized Content Preview (SecPr):`);
    const secPrMatch2 = /<hp:secPr[\s\S]*?>/.exec(baseSection0);
    console.log(secPrMatch2 ? secPrMatch2[0] : "No secPr found");

    // Save to test file
    baseZip.file("Contents/section0.xml", baseSection0);
    const outBuf = await baseZip.generateAsync({ type: "nodebuffer" });
    const outPath = path.join(process.cwd(), 'repro_out.hwpx');
    fs.writeFileSync(outPath, outBuf);
    console.log(`[Repro] Saved to ${outPath}`);
}

repro();
