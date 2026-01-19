
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function repair() {
    const filename = "시험지_2026-01-09 (40).hwpx";
    const filePath = path.join(process.cwd(), filename);
    const brokenPath = path.join(process.cwd(), "repaired_test.hwpx");

    if (!fs.existsSync(filePath)) {
        console.error("File not found");
        return;
    }

    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    let sec = await zip.file("Contents/section0.xml")?.async("string");

    if (!sec) return;

    console.log("Original Has Token:", sec.includes("[[MASTER_TABLE]]"));

    // TARGETED REMOVAL LOGIC
    const tokenIdx = sec.indexOf('[[MASTER_TABLE]]');
    if (tokenIdx !== -1) {
        console.log("Token found at:", tokenIdx);

        // Find enclosing Paragraph
        const paraStart = sec.lastIndexOf('<hp:p', tokenIdx);
        const paraEnd = sec.indexOf('</hp:p>', tokenIdx);

        if (paraStart !== -1 && paraEnd !== -1) {
            console.log("Enclosing <hp:p> found:", paraStart, paraEnd);
            const closeTagLen = '</hp:p>'.length;
            const fullEnd = paraEnd + closeTagLen;

            // Log snippet
            console.log("Snippet to Delete:", sec.substring(paraStart, Math.min(paraStart + 200, fullEnd)) + " ... ");

            // Delete
            sec = sec.substring(0, paraStart) + sec.substring(fullEnd);
            console.log("Deletion Executed.");
        } else {
            console.log("Could not find enclosing <hp:p>");
        }
    }

    console.log("New Has Token:", sec.includes("[[MASTER_TABLE]]"));

    if (sec.includes("[[MASTER_TABLE]]")) {
        console.error("REPAIR FAILED: Token still exists.");
        // Try brute force regex
        sec = sec.replace(/<hp:p\b[^>]*>[\s\S]*?\[\[MASTER_TABLE\]\][\s\S]*?<\/hp:p>/g, "");
        console.log("After Regex:", sec.includes("[[MASTER_TABLE]]"));
    }
}

repair();
