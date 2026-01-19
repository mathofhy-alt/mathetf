import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'output_cycle_test.hml');

try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const idx = content.indexOf('</SECDEF>');

    if (idx === -1) {
        console.error("</SECDEF> not found!");
    } else {
        console.log("Found </SECDEF> at index " + idx);
        const start = Math.max(0, idx - 100);
        const end = Math.min(content.length, idx + 400); // Look ahead enough to see COLDEF and body start
        console.log("\n--- CONTEXT SNIPPET ---");
        console.log(content.substring(start, end));
        console.log("--- END SNIPPET ---\n");
    }
} catch (e) {
    console.error("Error reading file:", e);
}
