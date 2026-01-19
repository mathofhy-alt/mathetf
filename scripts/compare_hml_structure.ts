
import fs from 'fs';
import path from 'path';

const workingPath = 'diagnose_v3_binary.hml';
const generatedPath = 'output_cycle_test.hml';

function extractTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : "NOT FOUND";
}

function analyzeHead(head: string) {
    console.log("\n--- HEAD ANALYSIS ---");
    const hasMapping = head.includes('<MAPPINGTABLE');
    const hasBinData = head.includes('<BINDATALIST');
    const docSetting = head.match(/<DOCSETTING>([\s\S]*?)<\/DOCSETTING>/i)?.[1] || "NOT FOUND";
    const pictureAttr = docSetting.match(/Picture="(\d+)"/i)?.[1] || "NOT FOUND";

    console.log(`MAPPINGTABLE: ${hasMapping ? "OK" : "MISSING"}`);
    console.log(`BINDATALIST: ${hasBinData ? "OK" : "MISSING"}`);
    console.log(`DOCSETTING Picture: ${pictureAttr}`);

    if (hasBinData) {
        const binItems = head.match(/<BINITEM[^>]*>/gi) || [];
        console.log(`BINITEM count: ${binItems.length}`);
        binItems.forEach(item => console.log(`  ${item}`));
    }
}

function analyzeBodyHeader(body: string) {
    console.log("\n--- BODY HEADER ANALYSIS ---");
    // Look for first SECDEF
    const secDefMatch = body.match(/<SECDEF[^>]*>([\s\S]*?)<\/SECDEF>/i);
    if (secDefMatch) {
        console.log("SECDEF Found.");
        const tag = body.match(/<SECDEF[^>]*>/i)?.[0];
        console.log(`SECDEF Tag: ${tag}`);
        const hasMaster = secDefMatch[1].includes('<MASTERPAGE');
        console.log(`MASTERPAGE: ${hasMaster ? "OK" : "MISSING"}`);

        if (hasMaster) {
            const colDef = secDefMatch[1].match(/<COLDEF[^>]*>/i)?.[0];
            console.log(`COLDEF in MasterPage: ${colDef || "NONE"}`);
        }
    } else {
        console.log("SECDEF NOT FOUND IN BODY");
    }
}

function analyzeTail(tail: string) {
    console.log("\n--- TAIL ANALYSIS ---");
    const hasScript = tail.includes('<SCRIPTCODE');
    const hasStorage = tail.includes('<BINDATASTORAGE');
    console.log(`SCRIPTCODE: ${hasScript ? "OK" : "MISSING"}`);
    console.log(`BINDATASTORAGE: ${hasStorage ? "OK" : "MISSING"}`);

    if (hasStorage) {
        // Use \b to avoid matching BINDATASTORAGE
        const binDataTags = tail.match(/<BINDATA\b[^>]*>[\s\S]*?<\/BINDATA>/gi) || [];
        console.log(`BINDATA count: ${binDataTags.length}`);
        binDataTags.forEach(fullTag => {
            const startTag = fullTag.match(/<BINDATA\b[^>]*>/i)?.[0];
            const content = fullTag.replace(/<BINDATA\b[^>]*>/i, "").replace(/<\/BINDATA>/i, "");
            console.log(`  Tag: ${startTag}`);
            console.log(`  Content Preview (20 chars): "${content.substring(0, 20).replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`);
            console.log(`  Contains Newline: ${content.includes('\n')}`);
        });
    }
}

try {
    const workingXml = fs.readFileSync(workingPath, 'utf8');
    const generatedXml = fs.readFileSync(generatedPath, 'utf8');
    const templateXml = fs.readFileSync('template.hml', 'utf8');

    console.log("=== WORKING REFERENCE ===");
    const workingHead = extractTag(workingXml, 'HEAD');
    analyzeHead(workingHead);
    analyzeBodyHeader(extractTag(workingXml, 'BODY'));
    analyzeTail(extractTag(workingXml, 'TAIL'));

    console.log("\n\n=== GENERATED SIMULATION ===");
    const generatedHead = extractTag(generatedXml, 'HEAD');
    analyzeHead(generatedHead);
    analyzeBodyHeader(extractTag(generatedXml, 'BODY'));
    analyzeTail(extractTag(generatedXml, 'TAIL'));

    console.log("\n\n=== ORIGINAL TEMPLATE ===");
    const templateHead = extractTag(templateXml, 'HEAD');
    analyzeHead(templateHead);
    analyzeBodyHeader(extractTag(templateXml, 'BODY'));

} catch (e) {
    console.error(e);
}
