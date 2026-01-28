import * as fs from 'fs';
import * as path from 'path';

const templatePath = '재조립양식.hml';

try {
    if (!fs.existsSync(templatePath)) {
        console.error(`File ${templatePath} not found`);
        process.exit(1);
    }

    let content = fs.readFileSync(templatePath, 'utf-8');

    // Pattern 1: User typed it in Hancom, so it's likely wrapped in CHAR
    // <CHAR>{{CONTENT_HERE}}</CHAR></TEXT></P>
    // We want to move it OUTSIDE the P.

    // Check if the placeholder is inside a P tag
    const placeholder = '{{CONTENT_HERE}}';
    const placeIndex = content.indexOf(placeholder);

    if (placeIndex === -1) {
        console.error('Placeholder not found!');
        process.exit(1);
    }

    // Find the closing P tag after the placeholder
    const closePIndex = content.indexOf('</P>', placeIndex);
    if (closePIndex !== -1) {
        // Cut out the placeholder
        const before = content.substring(0, placeIndex);
        // We might need to clean up the <CHAR> wrapper if it's there
        // Looking backwards from placeholder for <CHAR>
        const charStart = content.lastIndexOf('<CHAR>', placeIndex);

        // If <CHAR> immediately precedes placeholder (ignoring whitespace?)
        // Let's do a robust replacement of the specific sequence we saw.

        // Target: <CHAR>{{CONTENT_HERE}}</CHAR></TEXT></P>
        // Replacement: </TEXT></P>{{CONTENT_HERE}}
        // (Leaving the mismatched <CHAR> to be closed? No.)

        // Better: Remove the <CHAR> wrapper ENTIRELY from the inside, and append placeholder after </P>

        const targetSequence = /<CHAR>{{CONTENT_HERE}}<\/CHAR>\s*<\/TEXT>\s*<\/P>/;

        if (targetSequence.test(content)) {
            console.log("Detected <CHAR> wrapper. Moving placeholder outside P.");
            content = content.replace(targetSequence, '</TEXT></P>{{CONTENT_HERE}}');
        } else {
            console.log("Complex structure detected. Using fallback append.");
            // Just replace the string with empty, and verify where to put it?
            // If we blindly replace, we might leave empty CHARs.

            // Let's try to find exactly what's around it.
            const surrounding = content.substring(placeIndex - 20, placeIndex + 40);
            console.log("Surrounding context:", surrounding);

            // Safe fallback:
            // Replace {{CONTENT_HERE}} with nothing inside.
            // Find </P> and append {{CONTENT_HERE}} after it.

            content = content.replace('{{CONTENT_HERE}}', '');
            // Find the VERY NEXT </P> after where it was
            const nextCloseP = content.indexOf('</P>', placeIndex);
            if (nextCloseP !== -1) {
                const splitPoint = nextCloseP + 4; // After </P>
                content = content.substring(0, splitPoint) + '{{CONTENT_HERE}}' + content.substring(splitPoint);
            }
        }

    } else {
        console.log("Placeholder seems to be outside any P tag (or malformed).");
    }

    fs.writeFileSync(templatePath, content, 'utf-8');
    console.log(`[SUCCESS] Patched ${templatePath}`);

} catch (e) {
    console.error("Error patching template:", e);
}
