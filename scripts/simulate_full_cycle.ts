
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

// Mock Dependencies

const hmlPath = path.join(process.cwd(), 'debug_multi_output_fixed.hml');
const templatePath = path.join(process.cwd(), 'template.hml'); // Use real template

(async () => {
    try {
        console.log("=== 5-Point Robustness Verification ===");

        // 1. Setup
        const hmlContent = fs.readFileSync(hmlPath, 'utf-8');

        // --- CHECK 1: PARSING ACCURACY & ENDNOTE PRESERVATION ---
        console.log("\n[Check 1] Parsing Accuracy & Endnote Preservation");
        const questions = await parseHml(hmlContent);
        if (questions.length !== 3) throw new Error(`Expected 3 questions, got ${questions.length}`);

        // [TEST CASE] "Missing Start P" Scenerio (User Report 2026-01-14)
        // Structure: <TEXT>...</TEXT></P> (Missing opening P)
        questions.push({
            id: 'mock_fail_p',
            content_xml: `<TEXT>Missing Start P Content</TEXT></P>`,
            content_plain: "Missing Start P",
            images: [],
            binaries: [],
            originalIndex: 99,
            chunkId: "99"
        } as any);

        // Check if Endnotes exist in parsed content (Original Form)
        const q1Xml = questions[0].content_xml;
        if (!q1Xml.includes('<ENDNOTE')) console.warn("WARNING: Q1 has no ENDNOTE tag (Might be normal if Q1 has no answer, but checking preservation).");
        if (questions[1].content_xml.includes('<ENDNOTE') && questions[1].content_xml.includes('</ENDNOTE>')) {
            console.log("PASS: Endnote tags preserved in XML.");
        } else {
            console.error("FAIL: Endnote tags missing.");
        }

        // --- CHECK 2: BINARY ID REMAPPING (SIMULATED COLLISION) ---
        console.log("\n[Check 2] Binary ID handling (Collision Test)");
        const OUTPUT_FILE = path.join(process.cwd(), 'output_cycle_test.hml');
        // Force same ID '1' on two questions
        // [DEBUG] RE-ENABLE BINARIES via Legacy Comment Injection (Simulation)
        // We simulate a question coming from the DB with the OLD format (Comment with JSON)
        // to verify that body-builder.ts correctly parses it AND removes the dangerous comment.
        const legacyStowaway = JSON.stringify([
            { id: '1', data: 'DATA_A', type: 'png', binType: 'Embedding', compress: 'false' }
        ]);

        // Append Legacy Comment to content_xml
        questions[0].content_xml += `\n<!-- ANTIGRAVITY_BINARIES: ${legacyStowaway} -->`;

        // We also want to test PI format on Q2 to verify coexistence
        // But for now, focus on the reported crash (Legacy).

        const buildResult = buildBody(questions);
        const binItems = buildResult.binDataItems;
        if (binItems.length === 2 && binItems[0].id !== binItems[1].id) {
            console.log(`PASS: IDs remapped safely. IDs: ${binItems.map(b => b.id).join(', ')}`);
            console.log(`Data check: ${binItems[0].data === "DATA_A" ? "OK" : "FAIL"} / ${binItems[1].data === "DATA_B" ? "OK" : "FAIL"}`);
        } else {
            console.error("FAIL: Binary remapping failed.", binItems);
        }

        // --- CHECK 3: XML BALANCING & VALIDITY ---
        console.log("\n[Check 3] XML Fragment Validity");
        // We scan Q1 output which was previously malformed
        const q1Raw = questions[0].content_xml;
        const openPs = (q1Raw.match(/<P\b/g) || []).length;
        const closePs = (q1Raw.match(/<\/P>/g) || []).length;
        console.log(`Q1 Tag Balance <P>: ${openPs} Open / ${closePs} Close`);
        if (openPs === closePs) {
            console.log("PASS: <P> tags balanced.");
        } else {
            console.warn("WARN: <P> tags unbalanced (Parser balancer might need tuning if critical).");
        }

        // --- CHECK 4: STYLE PRESERVATION ---
        console.log("\n[Check 4] Style Extraction");
        // We expect custom styles from the ANTIGRAVITY_STYLES comment
        // debug_multi_output_fixed.hml header has styles. Parser should have captured them.
        const styleCheck = questions.some(q => q.content_xml.includes('ANTIGRAVITY_STYLES'));
        if (styleCheck) {
            console.log("PASS: Style definitions captured in XML comments.");
        } else {
            console.warn("WARN: No style comments found. (Source might not have custom styles or parser header logic issue).");
        }

        // --- CHECK 5: FULL CYCLE OUTPUT INTEGRITY ---
        console.log("\n[Check 5] Final Output Integrity");
        let templateXml = "";
        try {
            templateXml = fs.readFileSync(templatePath, 'utf-8');
            console.log(`Template Size: ${templateXml.length} bytes`);
        } catch (e) {
            templateXml = `<HWPML><HEAD><BINDATALIST Count="0"/></HEAD><BODY></BODY><TAIL></TAIL></HWPML>`;
        }

        const finalHml = mergeIntoTemplate(templateXml, {
            combinedBodyPs: buildResult.combinedBodyPs,
            binDataItems: buildResult.binDataItems,
            styleItems: buildResult.styleItems
        });

        fs.writeFileSync(OUTPUT_FILE, finalHml);

        // [Check 5] Final Output Integrity
        console.log("\n[Check 5] Final Output Integrity");
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`Output File Size: ${stats.size} bytes`);

        if (!finalHml.includes('<SECTION')) {
            console.error("FAIL: Section tag missing.");
        } else {
            console.log("PASS: Section integrity.");
        }

        // [TEST HEADER BLOCK - DOCSETTING]
        // If BINDATALIST Count is 0, we expect NO BINDATALIST tag at all now.
        if (finalHml.includes('<BINDATALIST Count="0"')) {
            console.warn("[WARN] Found BINDATALIST Count='0'. Should be omitted if empty?");
        } else if (!finalHml.includes('<BINDATALIST')) {
            console.log("[PASS] BINDATALIST omitted (Clean).");
        }

        // [TEST TAIL BLOCK]
        // If no binaries, BINDATASTORAGE should be omitted or empty?
        if (finalHml.includes('<BINDATASTORAGE></BINDATASTORAGE>')) {
            console.warn("[WARN] Found Empty BINDATASTORAGE. Should be omitted?");
        } else if (!finalHml.includes('<BINDATASTORAGE')) {
            console.log("[PASS] BINDATASTORAGE omitted (Clean).");
        }

        // [TEST HEADER BLOCK - SECDEF]
        // [UPDATE] SECDEF should have Original SpaceColumns="1134" AND injected COLDEF Count="2"
        const secDefMatch = finalHml.match(/<SECDEF[^>]*>([\s\S]*?)<\/SECDEF>/);
        if (secDefMatch) {
            const secDefTag = secDefMatch[0];
            const secDefInner = secDefMatch[1];

            // Check SpaceColumns (Original)
            if (secDefTag.includes('SpaceColumns="1134"')) {
                console.log("[PASS] SECDEF has original SpaceColumns='1134'.");
            } else {
                console.warn("[WARN] SECDEF SpaceColumns mismatch (Expected '1134').", secDefTag);
            }

            // INDEPENDENT LAYOUT CHECK (COLDEF inside SECDEF)
            if (secDefInner.includes('<COLDEF Count="2"') && secDefInner.includes('Type="Newspaper"')) {
                console.log("[PASS] SECDEF contains 2-Column Definition (Header-Level Layout).");
            } else {
                console.error("[FAIL] SECDEF missing internal COLDEF for 2 columns!", secDefInner);
            }
        } else {
            console.error("[FAIL] Missing SECDEF in Body!");
        }

        if (finalHml.includes('Answer 1') && finalHml.includes('Answer 2')) {
            console.log("PASS: Answer text (Endnote Content) present in final file.");
        } else {
            console.error("FAIL: Answer text missing.");
        }

        // [TEST HEADER BLOCK - DOCSETTING]
        // Check Integrity: Picture="1" <=> BINDATALIST Count > 0
        const docSettingMatch = finalHml.match(/<DOCSETTING[^>]*>/);
        if (docSettingMatch) {
            const dsTag = docSettingMatch[0];
            const hasPicture = dsTag.includes('Picture="1"');
            const hasBinaries = binItems.length > 0;

            if (hasPicture === hasBinaries) {
                console.log(`[PASS] DOCSETTING Integrity: Picture="${hasPicture ? 1 : 0}" matches Binaries=${binItems.length}`);
            } else {
                console.error(`[FAIL] DOCSETTING Mismatch: Picture="${hasPicture ? 1 : 0}" BUT Binaries=${binItems.length}`, dsTag);
            }
        }

        // Check 3-4: BINDATALIST Injection Verification
        if (binItems.length > 0) {
            // Updated Regex to capture content
            const bindataListMatch = finalHml.match(/<BINDATALIST Count="(\d+)">([\s\S]*?)<\/BINDATALIST>/);

            if (bindataListMatch) {
                const count = parseInt(bindataListMatch[1]);
                const content = bindataListMatch[2];

                if (count >= binItems.length) { // Allow >= in case we appended to existing
                    console.log(`[PASS] BINDATALIST injected into HEAD with Count=${count}.`);

                    // STRICT TAG CHECK
                    if (content.includes('<BINITEM') && !content.includes('<BINDATA ')) {
                        console.log("[PASS] BINDATALIST uses correct <BINITEM> tags (No <BINDATA> in Head).");
                    } else if (content.includes('<BINDATA')) {
                        console.error("[FAIL] BINDATALIST contains <BINDATA> tags! Should be <BINITEM> for Head Registry.", content.substring(0, 100));
                    } else {
                        console.warn("[WARN] BINDATALIST content unclear (Check manual).", content.substring(0, 100));
                    }

                } else {
                    console.error(`[FAIL] BINDATALIST Count mismatch. Expected >= ${binItems.length}. Found: ${count}`);
                }
            } else {
                console.error(`[FAIL] BINDATALIST missing. Expected ${binItems.length} items.`);
            }
        } else {
            // (Same as before)
            const bindataListMatch = finalHml.match(/<BINDATALIST Count="(\d+)">/);
            if (bindataListMatch && parseInt(bindataListMatch[1]) === 0) {
                console.log("[PASS] BINDATALIST injected into HEAD with Count=0 (Empty List).");
            } else {
                if (!bindataListMatch && !finalHml.match(/Picture="1"/)) {
                    console.log("[PASS] BINDATALIST omitted (Correct since No Binaries & Picture=0).");
                } else {
                    console.error("[FAIL] BINDATALIST missing or invalid.", bindataListMatch?.[0]);
                }
            }
        }

        // Check Stowaway format (Should be PI, not Comment)
        if (finalHml.includes('<!-- ANTIGRAVITY_BINARIES')) {
            console.log("[FAIL] Old JSON Comment found (Should be PI).");
        } else {
            console.log("[PASS] Old JSON mechanism removed.");
        }

        if (finalHml.includes('&lt;P&gt;') || finalHml.includes('&lt;TEXT&gt;')) {
            console.log("[FAIL] XML Tags are double-escaped!");
        } else {
            console.log("[PASS] XML Tags preserved (Not escaped).");
        }

        // [CHECK 5B] BINDATA ATTRIBUTES (STRICT COMPLIANCE)
        // Verify BINDATA does NOT have "Size" attribute (Implies auto-calc)
        // Verify BINDATA has "Encoding=Base64" (Capitalized)
        // Verify BINDATA has "Compress" attribute
        const binDataStorageContent = finalHml.match(/<BINDATASTORAGE[^>]*>([\s\S]*?)<\/BINDATASTORAGE>/)?.[1] || "";
        if (binDataStorageContent) {
            const firstBinData = binDataStorageContent.match(/<BINDATA[^>]*>/)?.[0];
            if (firstBinData) {
                if (firstBinData.includes('Size=')) {
                    console.error("[FAIL] BINDATA tag contains 'Size' attribute! (Risk of crash if incorrect).", firstBinData);
                } else {
                    console.log("[PASS] BINDATA tag omits 'Size' attribute (Safe).");
                }

                if (firstBinData.includes('Encoding="Base64"')) {
                    console.log("[PASS] BINDATA Encoding is 'Base64' (Correct Case).");
                } else {
                    console.warn("[WARN] BINDATA Encoding mismatch (Check Case: 'Base64').", firstBinData);
                }
            }
        }

        // [TEST LAYOUT - BODY CHECK]
        // [TEST LAYOUT - BODY CHECK]
        // Strategy: 2-Column Disabled (Regression Test)
        // Expect: NO <COLDEF> tags in the body stream (Clean 1-Column).
        const bodyColDefMatch = finalHml.match(/<COLDEF[^>]*>/);
        if (bodyColDefMatch) { console.error('[FAIL] Body-Level COLDEF detected! Expected Clean 1-Column.', bodyColDefMatch[0]); } else { console.log('[PASS] Body is Clean (No COLDEF found). Valid 1-Column State.'); }


        // [TEST PHANTOM PARAGRAPH REMOVAL]
        // The regex used in cleanup (Simple Version Reverted):
        const phantomCheck = /<\/SECDEF><\/TEXT><\/P>\s*<P[^>]*ParaShape="0"[^>]*><TEXT[^>]*><\/TEXT><\/P>/gi;
        if (phantomCheck.test(finalHml)) {
            console.error("[FAIL] Phantom Empty Paragraph DETECTED! Cleanup failed.");
        } else {
            console.log("[PASS] Phantom Empty Paragraph Cleaned (or not generated).");
        }

        // [CHECK 6] Missing Start P Fix Verification
        console.log("\n[Check 6] Missing Start P Fix Verification");
        if (finalHml.includes('<P ColumnBreak="false" PageBreak="false" ParaShape="0" Style="0"><TEXT>Missing Start P Content')) {
            console.log("[PASS] Missing Start P was wrapped correctly.");
        } else {
            console.error("[FAIL] Missing Start P NOT wrapped! Output fragment:", finalHml.match(/.{0,50}Missing Start P Content.{0,20}/));
        }

        console.log("\n=== ALL CHECKS COMPLETED ===");

    } catch (e) {
        console.error("Stress Test Failed:", e);
    }
})();
