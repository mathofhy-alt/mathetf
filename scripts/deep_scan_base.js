const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function deepScanBase() {
    const basePath = path.join(process.cwd(), 'base_template.hwpx');
    console.log(`Scanning: ${basePath}`);

    const data = fs.readFileSync(basePath);
    const zip = await JSZip.loadAsync(data);
    const section0 = await zip.file("Contents/section0.xml").async("string");

    console.log(`--- SECTION 0 SCAN ---`);
    console.log(`Total Length: ${section0.length}`);

    // Check Master Page Count
    const secPrMatch = /<hp:secPr[\s\S]*?>/.exec(section0);
    if (secPrMatch) {
        console.log(`SecPr: ${secPrMatch[0]}`);
    } else {
        console.log("No secPr found.");
    }

    // Check for Objects
    const shapes = (section0.match(/<hp:shp\b/g) || []).length;
    const pics = (section0.match(/<hp:pic\b/g) || []).length;
    const lines = (section0.match(/<hp:line\b/g) || []).length;
    const rects = (section0.match(/<hp:rect\b/g) || []).length;
    const containers = (section0.match(/<hp:container\b/g) || []).length;

    console.log(`Shapes: ${shapes}`);
    console.log(`Pictures: ${pics}`);
    console.log(`Lines: ${lines}`);
    console.log(`Rects: ${rects}`);
    console.log(`Containers: ${containers}`);

    if (shapes + pics + lines + rects + containers > 0) {
        console.log("FAIL: Objects detected in 'clean' template!");
    } else {
        console.log("PASS: No drawing objects detected.");
    }

    // Check for Tables
    const tables = (section0.match(/<hp:tbl\b/g) || []).length;
    console.log(`Tables: ${tables}`);
}

deepScanBase();
