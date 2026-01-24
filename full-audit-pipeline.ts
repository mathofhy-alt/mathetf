import { parseHmlV2 } from './src/lib/hml-v2/parser.ts';
import { renderMathToSvg } from './src/lib/math-renderer.ts';
import fs from 'fs';
import path from 'path';

async function runEmergencyAudit() {
    console.log("=== EMERGENCY AUDIT: HML Equation Pipeline ===");

    // 1. Read Sample HML
    const hmlPath = 'test_table.hml';
    if (!fs.existsSync(hmlPath)) {
        console.error("Critical: Sample HML not found!");
        return;
    }
    const hmlContent = fs.readFileSync(hmlPath, 'utf-8');
    console.log(`[1] HML Loaded: ${hmlPath} (${hmlContent.length} chars)`);

    // 2. Parser Audit
    console.log("[2] Running Parser (parseHmlV2)...");
    const result = parseHmlV2(hmlContent);
    console.log(`- Questions Found: ${result.questions.length}`);

    result.questions.forEach((q, qIdx) => {
        console.log(`\n--- Question ${qIdx + 1} Audit ---`);
        console.log(`- Equation Scripts: ${q.equationScripts.length}`);
        q.equationScripts.forEach((s, sIdx) => {
            console.log(`  Eq[${sIdx}]: "${s}"`);
        });

        // Check for math IDs in XML
        const mathIds = q.contentXml.match(/data-hml-math-id="([^"]+)"/g);
        console.log(`- Math IDs in XML: ${mathIds ? mathIds.length : 0} (${mathIds || 'none'})`);
    });

    // 3. Renderer Audit (First Script of First Question)
    if (result.questions.length > 0 && result.questions[0].equationScripts.length > 0) {
        const testScript = result.questions[0].equationScripts[0];
        console.log(`\n[3] Testing Renderer (renderMathToSvg) with: "${testScript}"`);
        try {
            const svg = await renderMathToSvg(testScript);
            console.log(`- SVG Result: ${svg.slice(0, 100)}... (${svg.length} chars)`);
            if (svg.includes("<svg") && svg.includes("path")) {
                console.log("- SVG Integrity: OK (Contains paths)");
            } else {
                console.warn("- SVG Integrity: FAILED (No paths found)");
            }
        } catch (e) {
            console.error("- Renderer Crash:", e);
        }
    } else {
        console.warn("\n[3] SKIPPED: No equation scripts found for testing!");
        // Let's force test a known problematic case
        const forceCase = "1RIGHTx";
        console.log(`\n[3b] FORCE TEST (Problematic Case): "${forceCase}"`);
        const svg = await renderMathToSvg(forceCase);
        console.log(`- SVG Result length: ${svg.length}`);
    }

    // 4. File System Audit
    const mathDir = path.join(process.cwd(), 'public', 'math');
    console.log(`\n[4] File System Audit: ${mathDir}`);
    if (fs.existsSync(mathDir)) {
        console.log("- Directory exists: YES");
    } else {
        console.log("- Directory exists: NO (Will attempt creation simulation)");
        try {
            fs.mkdirSync(mathDir, { recursive: true });
            console.log("- Manual Creation: SUCCESS");
        } catch (e) {
            console.error("- Manual Creation: FAILED", e);
        }
    }

    console.log("\n=== AUDIT COMPLETE ===");
}

runEmergencyAudit();
