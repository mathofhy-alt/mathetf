
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function testTemplateCleaning() {
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    console.log("Loading Template at:", templatePath);

    if (!fs.existsSync(templatePath)) {
        console.error("Template not found!");
        return;
    }

    const data = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(data);
    let templateSection0 = await zip.file("Contents/section0.xml")?.async("string");

    if (!templateSection0) {
        console.error("Contents/section0.xml not found in template!");
        return;
    }

    console.log("--- START CLEANING TEST ---");
    console.log("Original Length:", templateSection0.length);
    console.log("Has MasterTable Before:", templateSection0.includes("[[MASTER_TABLE]]"));

    // LOGIC COPY FROM HWRP MERGER
    const tokenIdx = templateSection0.indexOf('[[MASTER_TABLE]]');
    console.log("Token Index:", tokenIdx);

    if (tokenIdx !== -1) {
        const tblStart = templateSection0.lastIndexOf('<hp:tbl', tokenIdx);
        console.log("Table Start:", tblStart);
        const tblEnd = templateSection0.indexOf('</hp:tbl>', tokenIdx);
        console.log("Table End:", tblEnd);

        if (tblStart !== -1 && tblEnd !== -1) {
            // FIX: Template table is inside <hp:p>, NOT necessarily <hp:ctrl>
            // Search for enclosing Paragraph <hp:p>
            const paraStart = templateSection0.lastIndexOf('<hp:p', tblStart);
            const paraEnd = templateSection0.indexOf('</hp:p>', tblEnd);

            // DEBUG XML
            console.log("Snippet around TblStart:", templateSection0.substring(tblStart - 100, tblStart + 50));
            console.log("Snippet around TblEnd:", templateSection0.substring(tblEnd - 50, tblEnd + 100));

            if (paraStart !== -1 && paraEnd !== -1) {
                const closeTagLen = '</hp:p>'.length;
                const removalEnd = paraEnd + closeTagLen;

                // EXTRACT
                const masterTableXml = templateSection0.substring(paraStart, removalEnd);
                console.log("Extracted XML Length:", masterTableXml.length);

                // REMOVE from Clean Template
                templateSection0 = templateSection0.substring(0, paraStart) + templateSection0.substring(removalEnd);
                console.log("Removal Executed (Paragraph Mode).");
            } else {
                console.warn("Could not find enclosing Paragraph for Master Table.");
            }
        } else {
            console.log("Table tags not found.");
        }
    } else {
        console.log("Token not found.");
    }

    console.log("Has MasterTable After?", templateSection0.includes("[[MASTER_TABLE]]"));

    if (templateSection0.includes("[[MASTER_TABLE]]")) {
        console.error("FAILURE: [[MASTER_TABLE]] still present!");
    } else {
        console.log("SUCCESS: [[MASTER_TABLE]] removed.");
    }
}

testTemplateCleaning();
