
const fs = require('fs');
const path = require('path');

// Use require with .ts extension which ts-node supports
const { generateHmlFromTemplate } = require('./src/lib/hml-v2/generator.ts');

// Mock data
const mockQuestion = {
    id: 'q1',
    content_xml: '<P data-hml-style="QUESTION"><TEXT>1) Test Question V35</TEXT></P>',
    question_number: 1
};

const mockImages: any[] = [];

// Read template
const templatePath = '재조립양식.hml';
if (!fs.existsSync(templatePath)) {
    console.error("Template not found!");
    process.exit(1);
}
const templateContent = fs.readFileSync(templatePath, 'utf8');

// Generate
console.log("Running V35 Generation...");
try {
    const result = generateHmlFromTemplate(templateContent, [{ question: mockQuestion, images: mockImages }]);

    // Write output
    const outputPath = 'test_output_v35.hml';
    fs.writeFileSync(outputPath, result.hmlContent);
    console.log(`Generated ${outputPath}`);

    // Verification Logic
    const hml = result.hmlContent;

    // Check 1: BINDATALIST after MAPPINGTABLE
    const mapEnd = hml.indexOf('</MAPPINGTABLE>');
    const binStart = hml.indexOf('<BINDATALIST');

    if (mapEnd === -1) console.error("FAIL: </MAPPINGTABLE> not found");
    if (binStart === -1) console.error("FAIL: <BINDATALIST> not found");

    if (binStart > mapEnd) {
        console.log("PASS: BINDATALIST is AFTER MAPPINGTABLE");
    } else {
        console.error(`FAIL: BINDATALIST (Index ${binStart}) is BEFORE or INSIDE MAPPINGTABLE (End Index ${mapEnd})`);
    }

} catch (e) {
    console.error(e);
}
