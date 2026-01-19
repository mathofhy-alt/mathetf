
import { buildBody, Question } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';
import fs from 'fs';
import path from 'path';

const mockQuestion: Question = {
    question_number: 1,
    content_xml: `
    <!-- ANTIGRAVITY_STYLES: [{"id":"7","xml":"<BORDERFILL Id=\\"7\\"><LEFTBORDER Type=\\"Dash\\" Width=\\"0.12mm\\" Color=\\"0\\"/><RIGHTBORDER Type=\\"Dash\\" Width=\\"0.12mm\\" Color=\\"0\\"/><TOPBORDER Type=\\"Dash\\" Width=\\"0.12mm\\" Color=\\"0\\"/><BOTTOMBORDER Type=\\"Dash\\" Width=\\"0.12mm\\" Color=\\"0\\"/><DIAGONAL Type=\\"None\\" Width=\\"0.1mm\\" Color=\\"0\\"/><FILLBRUSH><WINDOWBRUSH FaceColor=\\"4294967295\\" HatchColor=\\"0\\" ForeColor=\\"4294967295\\" BackColor=\\"16777215\\" PatternType=\\"None\\"/></FILLBRUSH></BORDERFILL>"}] -->
    <P><TEXT>Test Content</TEXT></P>
    <TABLE BorderFill="7"><ROW><CELL><P><TEXT>Cell</TEXT></P></CELL></ROW></TABLE>
    `,
    binaries: []
};

// 1. Load Template
const templatePath = path.join(process.cwd(), 'template.hml');
const templateXml = fs.readFileSync(templatePath, 'utf-8');

// 2. Build Body
console.log("--- Building Body ---");
const built = buildBody([mockQuestion]);

console.log(`Extracted BorderFills: ${built.borderFills?.length}`);
if (built.borderFills?.length) {
    console.log(`First Style ID: ${built.borderFills[0].id}`); // Should be 11
    console.log(`First Style XML: ${built.borderFills[0].xml}`);
}

const bodySnippet = built.combinedBodyPs;
console.log(`Body Update (BorderFill="7" -> ?): ${bodySnippet.includes('BorderFill="11"') ? "SUCCESS (Mapped to 11)" : "FAIL"}`);

// 3. Merge
console.log("--- Merging into Template ---");
const finalHml = mergeIntoTemplate(templateXml, built);

// 4. Inspect Final HML
const headMatch = finalHml.match(/<HEAD[\s\S]*?<\/HEAD>/);
if (headMatch) {
    const listMatch = headMatch[0].match(/<BORDERFILLLIST[\s\S]*?<\/BORDERFILLLIST>/);
    if (listMatch) {
        console.log("Found BORDERFILLLIST in HEAD:");
        // Check for ID 11
        if (listMatch[0].includes('Id="11"')) {
            console.log("SUCCESS: Start Style ID 11 found in Template!");
        } else {
            console.log("FAIL: Style ID 11 NOT found in Template.");
            console.log(listMatch[0].substring(0, 500) + "...");
        }

        // Check Count
        const countM = listMatch[0].match(/Count="(\d+)"/);
        console.log(`Total Count: ${countM ? countM[1] : 'Unknown'}`);
    } else {
        console.log("FAIL: No BORDERFILLLIST found in HEAD.");
    }
}
