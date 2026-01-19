
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function inspect() {
    const filename = "시험지_2026-01-09 (40).hwpx";
    const filePath = path.join(process.cwd(), filename);

    console.log(`Inspecting: ${filePath}`);
    if (!fs.existsSync(filePath)) {
        console.error("File not found!");
        return;
    }

    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    const section0 = await zip.file("Contents/section0.xml")?.async("string");

    if (!section0) {
        console.error("Contents/section0.xml not found!");
        return;
    }

    console.log(`\n--- ANALYSIS OF ${filename} ---`);
    console.log(`Total Length: ${section0.length}`);
    console.log(`Has [[MASTER_TABLE]] token: ${section0.includes('[[MASTER_TABLE]]')}`);

    // Check for Table tags
    const hasTable = section0.includes('<hp:tbl');
    console.log(`Has <hp:tbl>: ${hasTable}`);

    // Check for First Content
    const firstPIdx = section0.indexOf('<hp:p');
    console.log(`First <hp:p> Index: ${firstPIdx}`);

    // Extract first 1000 chars of text content
    const plainText = section0.substring(0, 5000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`\n[Plain Text Dump (Start)]:\n${plainText.substring(0, 500)}\n...`);

    // Check for Question 1
    const q1Patterns = ['[문제 1]', '1.', '①'];
    for (const pat of q1Patterns) {
        console.log(`Contains "${pat}": ${section0.includes(pat)}`);
    }

    // Debug specific location of Q1 if found
    const q1Idx = section0.indexOf('[문제 1]');
    console.log(`\nIndex of "[문제 1]": ${q1Idx}`);
    if (q1Idx !== -1) {
        console.log(`XML around Q1:\n${section0.substring(q1Idx - 200, q1Idx + 200)}`);

        // Check what is BEFORE Q1
        const preQ1 = section0.substring(0, q1Idx);
        console.log(`\n[Pre-Q1 Analysis]:`);
        console.log(`Bytes before Q1: ${preQ1.length}`);
        console.log(`Paragraphs (<hp:p>) before Q1: ${(preQ1.match(/<hp:p\b/g) || []).length}`);
        console.log(`Tables (<hp:tbl>) before Q1: ${(preQ1.match(/<hp:tbl/g) || []).length}`);
    }

    console.log("\n--- RAW XML START (First 1500 chars) ---");
    console.log(section0.substring(0, 1500));
}

inspect();
