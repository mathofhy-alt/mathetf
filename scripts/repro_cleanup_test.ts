
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

// USER'S LOGIC TO TEST
async function forceRemoveMasterTable(outBuf: Buffer): Promise<Buffer> {
    const zip = await JSZip.loadAsync(outBuf);

    const secFile = zip.file("Contents/section0.xml");
    if (!secFile) throw new Error("Contents/section0.xml not found");

    let sec = await secFile.async("string");
    console.log("--- DEBUG START ---");
    console.log("Original Size:", sec.length);
    console.log("Has MasterTable:", sec.includes("[[MASTER_TABLE]]"));

    // STRATEGY: Delete everything before [문제 1]
    const q1Marker = "[문제 1]";
    const q1Idx = sec.indexOf(q1Marker);
    console.log("Marker Index:", q1Idx);

    if (q1Idx !== -1) {
        // Find the start of the Paragraph containing Q1
        const pStart = sec.lastIndexOf("<hp:p", q1Idx);
        console.log("Q1 Paragraph Start:", pStart);

        // Find the First Paragraph of the section (after <hs:sec ...>)
        const firstPIdx = sec.indexOf("<hp:p");
        console.log("First Paragraph Index:", firstPIdx);

        if (pStart !== -1 && firstPIdx !== -1 && firstPIdx < pStart) {
            console.log("[Repro] Dropping content between FirstP and Q1P.");

            const prefix = sec.substring(0, firstPIdx);
            const suffix = sec.substring(pStart);

            // Debug what we are keeping/dropping
            console.log("Prefix terminates at:", prefix.slice(-20)); // Should be </hs:sec> or definitions
            console.log("Suffix starts with:", suffix.slice(0, 50)); // Should be <hp:p... [문제 1]

            sec = prefix + suffix;
        } else {
            console.log("[Repro] Skipping Drop: Indices invalid.");
        }
    } else {
        console.warn("[Repro] '[문제 1]' marker not found. Trying Regex fallback.");
        const pBlockRe = /<hp:p\b[^>]*>[\s\S]*?\[\[MASTER_TABLE\]\][\s\S]*?<\/hp:p>/g;
        sec = sec.replace(pBlockRe, "");
    }

    // Final Token Cleanup
    sec = sec.replaceAll("[[MASTER_TABLE]]", "");

    console.log("Has MasterTable After?", sec.includes("[[MASTER_TABLE]]"));

    // Verify
    if (sec.includes("[[MASTER_TABLE]]")) {
        throw new Error("MASTER_TABLE still exists after cleanup");
    }

    zip.file("Contents/section0.xml", sec);
    return await zip.generateAsync({ type: "nodebuffer" });
}

async function run() {
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    if (!fs.existsSync(templatePath)) {
        console.error("Template not found:", templatePath);
        return;
    }

    let buf = fs.readFileSync(templatePath);

    // INJECT MOCK Q1 to simulate real output
    // We add a Paragraph [문제 1] at the end of the section (inside body)
    // Actually, usually it's appended.
    // Let's modify the buffer just to add [문제 1] text so the marker is found.
    // But we need valid XML structure for the logic to find <hp:p>.

    const zip = await JSZip.loadAsync(buf);
    let sec = await zip.file("Contents/section0.xml")?.async("string") || "";

    // Append dummy Q1 paragraph
    const dummyQ1 = `<hp:p><hp:run><hp:t>[문제 1]</hp:t></hp:run></hp:p>`;
    // Section ends with </hs:sec> usually? No, section0.xml IS the section.
    // It usually ends with </hp:sec> or just list of paragraphs.
    // Let's just append it at the end (before last tag if any, or just append)
    // Assuming root is <hs:sec>? No, root is usually <hs:sec>

    if (sec.lastIndexOf("</hs:sec>") !== -1) {
        sec = sec.replace("</hs:sec>", dummyQ1 + "</hs:sec>");
    } else {
        sec += dummyQ1;
    }

    zip.file("Contents/section0.xml", sec);
    const mockOutputBuf = await zip.generateAsync({ type: "nodebuffer" });

    console.log("Running Cleanup on Mocked Output...");
    try {
        await forceRemoveMasterTable(mockOutputBuf);
        console.log("Cleanup SUCCESS!");
    } catch (e) {
        console.error("Cleanup FAILED:", e);
    }
}

run();
