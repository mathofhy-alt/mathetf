
import fs from 'fs';
import path from 'path';

const templatePath = path.join(process.cwd(), 'template.hml');

try {
    const templateXml = fs.readFileSync(templatePath, 'utf-8');
    console.log(`Template Size: ${templateXml.length}`);

    // LOGIC CHECK
    let headerBlock = "";
    const sectionStartIdx = templateXml.indexOf('<SECTION');

    if (sectionStartIdx !== -1) {
        const secDefEnd = templateXml.indexOf('</SECDEF>', sectionStartIdx);
        // Log vicinity
        console.log(`SECDEF End Index: ${secDefEnd}`);

        if (secDefEnd !== -1) {
            const pEnd = templateXml.indexOf('</P>', secDefEnd);
            if (pEnd !== -1) {
                headerBlock = templateXml.substring(sectionStartIdx, pEnd + 4);
                headerBlock = headerBlock.replace(/<\/SECTION>/gi, "");
            }
        }
    }

    if (!headerBlock) {
        console.log("FALLBACK: Header Block not found via preservation. Trying Regex Match...");
        const matches = Array.from(templateXml.matchAll(/<SECDEF[\s\S]*?<\/SECDEF>/gi));
        if (matches.length > 0) {
            let secDefBlock = matches[0][0];
            headerBlock = `<SECTION Id="0"><P ParaShape="0" Style="0"><TEXT CharShape="0">${secDefBlock}</TEXT></P>`;
        } else {
            // Try strict self-closing regex
            const selfClose = templateXml.match(/<SECDEF[^>]*\/>/i);
            if (selfClose) {
                console.log("Found Self-Closing SECDEF via Regex.");
                let secDefBlock = selfClose[0];
                headerBlock = `<SECTION Id="0"><P ParaShape="0" Style="0"><TEXT CharShape="0">${secDefBlock}</TEXT></P>`;
            }
        }
    }

    console.log("\n--- EXTRACTED HEADER BLOCK (BEFORE) ---");
    console.log(headerBlock);

    // INJECTION SIMULATION
    const colDefStandard = 'Layout="Left" Count="2" SameSize="true" Type="Newspaper" Width="8100" Spacing="1000"';
    const colDefTag = `<COLDEF ${colDefStandard} />`;

    if (headerBlock) {
        // MATCHING NEW LOGIC IN template-manager.ts (Sibling Injection)

        // 1. Check if Layout is already defined (Newspaper)
        if (!headerBlock.includes('Type="Newspaper"')) {
            console.log("[DEBUG] No Newspaper Layout found. Injecting Sibling COLDEF.");

            if (headerBlock.includes('</SECDEF>')) {
                console.log("[DEBUG] Found closing SECDEF. Appending COLDEF after it.");
                headerBlock = headerBlock.replace('</SECDEF>', `</SECDEF>${colDefTag}`);
            } else if (/<SECDEF\b[^>]*\/>/i.test(headerBlock)) {
                console.log("[DEBUG] Found self-closing SECDEF. Appending COLDEF after it.");
                // CORRECT SIBLING INJECTION
                headerBlock = headerBlock.replace(/(<SECDEF\b[^>]*\/>)/i, `$1${colDefTag}`);
            } else {
                console.log("[DEBUG] Could not find SECDEF close tag. Injection Aborted.");
            }
        } else {
            console.log("[DEBUG] Existing Newspaper Layout found (likely in MasterPage or existing). Skipping Injection.");
        }
    }

    console.log("\n--- MODIFIED HEADER BLOCK (AFTER) ---");
    console.log(headerBlock);

    // Write to artifact for review
    fs.writeFileSync('debug_header_dump.xml', headerBlock);

} catch (e) {
    console.error("Diagnostic Failed:", e);
}
