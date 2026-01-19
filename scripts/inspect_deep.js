const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspectDeep() {
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    console.log(`Inspecting: ${templatePath}`);

    const data = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(data);

    // 1. Inspect Header for Master Pages
    const headerXml = await zip.file("Contents/header.xml").async("string");
    console.log("\n--- HEADER: Master Pages ---");
    const masterPages = headerXml.match(/<hm:masterPage[\s\S]*?<\/hm:masterPage>/g);
    if (masterPages) {
        masterPages.forEach((mp, i) => {
            console.log(`[MasterPage ${i}] Length: ${mp.length}`);
            console.log(mp.substring(0, 500));
            // Check for border/fill refs
        });
    } else {
        console.log("No Master Pages found in header.");
    }

    // 2. Inspect Section0 secPr for Page Borders
    const section0 = await zip.file("Contents/section0.xml").async("string");
    const secPrRegex = /<hp:secPr[\s\S]*?>/;
    const secPrMatch = secPrRegex.exec(section0);

    if (secPrMatch) {
        console.log("\n--- SECTION 0: secPr ---");
        const secPr = secPrMatch[0];
        console.log(secPr);

        // Check for pageBorderFill attribute
        // <hp:pageBorderFill type="BOTH" borderFillIDRef="..."/>
        if (secPr.includes('pageBorderFill')) {
            console.log("WARNING: pageBorderFill is PRESENT!");
        } else {
            console.log("Clean: No pageBorderFill detected in secPr tag itself (check children).");
        }
    }
}

inspectDeep();
