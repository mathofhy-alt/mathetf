const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspectStart() {
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    const data = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(data);
    const section0 = await zip.file("Contents/section0.xml").async("string");

    console.log("TOTAL LENGTH:", section0.length);
    console.log("--- START (first 1000 chars) ---");
    console.log(section0.substring(0, 1000));
}

inspectStart();
