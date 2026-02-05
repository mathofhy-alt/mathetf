
// Running via npx ts-node handles registration
const fs = require('fs');
const path = require('path');
const { generateHmlFromTemplate } = require('./src/lib/hml-v2/generator.ts');

const templatePath = path.join(__dirname, '재조립양식.hml');
if (!fs.existsSync(templatePath)) {
    console.error("Template missing");
    process.exit(1);
}
const templateContent = fs.readFileSync(templatePath, 'utf8');
console.log("DEBUG: Template Length:", templateContent.length);
const firstPara = templateContent.indexOf("<PARAMARGIN");
console.log("DEBUG: First PARAMARGIN index:", firstPara);
if (firstPara !== -1) {
    console.log("DEBUG: Snippet:", templateContent.substring(firstPara, firstPara + 50));
}

// Mock content matching the user's screenshot to verify style application
const content = `1) 다항식 x^4 - 7x^2 + 15를 x-2로 나누었을 때의 나머지를 구하여라.`;

const questionsWithImages = [
    {
        question: {
            id: 'q1',
            content_xml: `<P data-hml-style="QUESTION"><TEXT>${content}</TEXT></P>`,
            question_number: 1
        },
        images: []
    }
];

try {
    console.log("Running generator with V35 Fix...");
    const result = generateHmlFromTemplate(templateContent, questionsWithImages);

    const outputPath = 'test_output_endnote.hml';
    fs.writeFileSync(outputPath, result.hmlContent);
    console.log(`SUCCESS: Generated ${outputPath}.`);

    // Quick verify
    if (result.hmlContent.indexOf('<BINDATALIST') > result.hmlContent.indexOf('</MAPPINGTABLE>')) {
        console.log("VERIFIED: BINDATALIST is correctly placed AFTER MAPPINGTABLE.");
    } else {
        console.error("WARNING: Structure check failed.");
    }

} catch (e) {
    console.error("ERROR:", e);
}
