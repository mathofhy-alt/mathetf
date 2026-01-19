const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function testRadicalClean() {
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    console.log(`Loading: ${templatePath}`);
    const data = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(data);
    let templateSection0 = await zip.file("Contents/section0.xml").async("string");

    console.log(`Original Size: ${templateSection0.length}`);

    // LOGIC FROM HWPX MERGER
    const secPrRegex = /<hp:p\b[^>]*>[\s\S]*?<hp:secPr[\s\S]*?<\/hp:p>/;
    const secPrMatch = secPrRegex.exec(templateSection0);

    if (secPrMatch) {
        console.log("MATCH FOUND!");
        const secPrBlock = secPrMatch[0];
        console.log(`Block Size: ${secPrBlock.length}`);
        console.log(`Block Content Preview: ${secPrBlock.substring(0, 200)}...`);

        // Check if [[MASTER_TABLE]] is inside the secPr block (it shouldn't be)
        if (secPrBlock.includes('[[MASTER_TABLE]]')) {
            console.error("CRITICAL: [[MASTER_TABLE]] is INSIDE the secPr block!");
        } else {
            console.log("GOOD: [[MASTER_TABLE]] is NOT in the secPr block.");
        }

        const secTagStartMatch = /<hs:sec\b[^>]*>/.exec(templateSection0);
        const secTagStart = secTagStartMatch ? secTagStartMatch[0] : '<hs:sec>';

        const generated = `${secTagStart}${secPrBlock}</hs:sec>`;
        console.log(`Generated Section Size: ${generated.length}`);

        // Check if <hp:tbl> exists in generated
        if (generated.includes('<hp:tbl')) {
            console.error("FAIL: Table still exists in generated output!");
        } else {
            console.log("SUCCESS: No tables in output.");
        }

    } else {
        console.error("NO MATCH for secPrRegex!");
        // Print the first 500 chars to debug why regex failed
        console.log(templateSection0.substring(0, 500));
    }
}

testRadicalClean();
