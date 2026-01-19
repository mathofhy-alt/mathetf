
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'debug_multi_output_fixed.hml');
let content = fs.readFileSync(filePath, 'utf-8');

// The problematic sequence: nested inside PARALIST
// We look for the transition from Header P to Q1 P
const validation = '</PARALIST></MASTERPAGE></SECDEF></TEXT></P><P><TEXT>Question 1 Content';

if (content.includes(validation)) {
    console.log("File already patched.");
} else {
    // Look for the specific context we saw in the file view
    // It was: </P><P><TEXT>Question 1 Content
    // Preceded by whitespace on the line.

    // We'll search for the unique string sequence
    const target = '</P><P><TEXT>Question 1 Content';
    const replacement = '</PARALIST></MASTERPAGE></SECDEF></TEXT></P><P><TEXT>Question 1 Content';

    if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log("Patched successfully.");
    } else {
        console.error("Target string not found. File might be different than expected.");
        // Try fuzzy match?
        // The view showed:
        //       </P><P><TEXT>Question 1 Content
        // Let's try matching with regex for whitespace
        const regex = /<\/P>\s*<P><TEXT>Question 1 Content/;
        if (regex.test(content)) {
            content = content.replace(regex, (match) => {
                return match.replace('<P><TEXT>Question 1 Content', '</PARALIST></MASTERPAGE></SECDEF></TEXT></P><P><TEXT>Question 1 Content');
            });
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log("Patched via Regex.");
        } else {
            console.error("Regex failed too.");
        }
    }
}
