const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function debugRemoval() {
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    const data = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(data);
    let templateSection0 = await zip.file("Contents/section0.xml").async("string");

    console.log("Original Length:", templateSection0.length);
    const tokenIdx = templateSection0.indexOf('[[MASTER_TABLE]]');
    console.log("Token Index:", tokenIdx);

    if (tokenIdx === -1) {
        console.error("Token not found!");
        return;
    }

    // SIMULATING HWPX MERGER LOGIC
    const tblStart = templateSection0.lastIndexOf('<hp:tbl', tokenIdx);
    const tblEnd = templateSection0.indexOf('</hp:tbl>', tokenIdx);

    console.log("Table Start:", tblStart);
    console.log("Table End:", tblEnd);

    if (tblStart !== -1 && tblEnd !== -1) {
        const closeLen = '</hp:tbl>'.length;
        const removalEnd = tblEnd + closeLen;

        // Extract
        const masterTableXml = templateSection0.substring(tblStart, removalEnd);
        console.log("Extracted Length:", masterTableXml.length);

        // P Removal Check
        const pStart = templateSection0.lastIndexOf('<hp:p', tblStart);
        // Important: we need to find pEnd relative to removalEnd
        const pEnd = templateSection0.indexOf('</hp:p>', removalEnd);

        console.log("P Start:", pStart);
        console.log("P End:", pEnd);
        console.log("Dist (tblStart - pStart):", tblStart - pStart);

        if (pStart !== -1 && pEnd !== -1 && (tblStart - pStart < 200)) {
            const pRemoveEnd = pEnd + '</hp:p>'.length;
            templateSection0 = templateSection0.substring(0, pStart) + templateSection0.substring(pRemoveEnd);
            console.log("ACTION: Removed Table AND Paragraph");
        } else {
            templateSection0 = templateSection0.substring(0, tblStart) + templateSection0.substring(removalEnd);
            console.log("ACTION: Removed Table ONLY");
        }
    } else {
        console.log("ACTION: Table not found, fallback logic would run.");
    }

    // RESULT CHECK
    if (templateSection0.includes('[[MASTER_TABLE]]')) {
        console.error("FAIL: [[MASTER_TABLE]] still present!");
    } else {
        console.log("SUCCESS: [[MASTER_TABLE]] removed.");
    }

    if (templateSection0.includes('hp:tbl')) {
        // Note: Might be other tables?
        console.log("INFO: 'hp:tbl' still exists in file (could be others?). Count:", templateSection0.split('<hp:tbl').length - 1);
    }
}

debugRemoval();
