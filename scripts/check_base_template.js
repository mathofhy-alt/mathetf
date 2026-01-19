const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function checkBaseTemplate() {
    const basePath = path.join(process.cwd(), 'base_template.hwpx');
    console.log(`Checking: ${basePath}`);

    if (!fs.existsSync(basePath)) {
        console.error("base_template.hwpx DOES NOT EXIST.");
        return;
    }

    const data = fs.readFileSync(basePath);
    const zip = await JSZip.loadAsync(data);
    const section0 = await zip.file("Contents/section0.xml").async("string");

    console.log(`Content Length: ${section0.length}`);

    if (section0.includes('[[MASTER_TABLE]]')) {
        console.error("FAIL: base_template.hwpx contains '[[MASTER_TABLE]]'. It is NOT a clean file.");
    } else {
        console.log("PASS: No '[[MASTER_TABLE]]' token found.");
    }

    if (section0.includes('<hp:tbl')) {
        console.warn("WARNING: base_template.hwpx contains tables (<hp:tbl>). Is it truly empty?");
    } else {
        console.log("PASS: No tables found.");
    }

    // Check Master Page
    if (section0.includes('masterPageCnt="1"')) {
        console.warn("WARNING: base_template.hwpx refers to a Master Page (masterPageCnt=1).");
    }
}

checkBaseTemplate();
