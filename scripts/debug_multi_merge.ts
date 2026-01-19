
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate, parseTemplateOffsets } from '../src/lib/hml/template-manager';

async function run() {
    console.log("=== Debugging Multi-Question Merge Logic ===");

    // 1. Mock Data (3 Questions)
    const questions = [
        {
            question_number: 1,
            content_xml: '<P><TEXT>Question 1 Content</TEXT></P>',
            binaries: []
        },
        {
            question_number: 2,
            content_xml: '<P><TEXT>Question 2 Content</TEXT></P>',
            binaries: []
        },
        {
            question_number: 3,
            content_xml: '<P><TEXT>Question 3 Content</TEXT></P>',
            binaries: []
        }
    ];

    console.log(`Input Questions: ${questions.length}`);

    // 2. Load Template
    const rootDir = process.cwd();
    const templatePath = path.join(rootDir, 'template.hml');
    if (!fs.existsSync(templatePath)) {
        console.error("Template not found!");
        return;
    }
    const templateXml = fs.readFileSync(templatePath, 'utf-8');
    const offsets = parseTemplateOffsets(templateXml);

    // 3. Run Build Body
    console.log("Running buildBody...");
    const built = buildBody(questions, offsets.binData);

    console.log(`Built Body Fragments: ${built.bodyFragments.length}`);
    console.log(`Combined Body Length: ${built.combinedBodyPs.length}`);

    // Check if combined body contains all distinct texts
    if (built.combinedBodyPs.includes("Question 1 Content") &&
        built.combinedBodyPs.includes("Question 2 Content") &&
        built.combinedBodyPs.includes("Question 3 Content")) {
        console.log(">> ✅ buidBody output contains all 3 questions.");
    } else {
        console.error(">> ❌ buidBody output is MISSING data!");
        console.log("Snippet:", built.combinedBodyPs);
    }

    // 4. Run Merge
    console.log("Running mergeIntoTemplate...");
    const finalHml = mergeIntoTemplate(templateXml, built);

    // 5. Verify Final HML
    // Does it appear in the final HML?
    const q1Obj = finalHml.includes("Question 1 Content");
    const q2Obj = finalHml.includes("Question 2 Content");
    const q3Obj = finalHml.includes("Question 3 Content");

    if (q1Obj && q2Obj && q3Obj) {
        console.log(">> ✅ Final HML contains all 3 questions.");
    } else {
        console.error(">> ❌ Final HML is MISSING data!");
        console.log(`Q1: ${q1Obj}, Q2: ${q2Obj}, Q3: ${q3Obj}`);
    }

    // 6. Check for Overwriting or Structure issues
    // Are they inside separate SECTIONS or just Ps?
    // buildBody concatenates Ps. They should be siblings.

    fs.writeFileSync('debug_multi_output.hml', finalHml);
    console.log("Saved debug_multi_output.hml");
}

run();
