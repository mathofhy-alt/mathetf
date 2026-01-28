import * as fs from 'fs';
import * as path from 'path';

const templatePath = 'hml v2-test-tem.hml';
const fixedTemplatePath = 'hml v2-test-tem-FIXED.hml';

try {
    const content = fs.readFileSync(templatePath, 'utf-8');

    // 1. Locate the insertion point (After COLDEF)
    // Pattern: <COLDEF ... />
    // We want to keep everything up to this closing tag.
    const colDefRegex = /<COLDEF[^>]*\/>/;
    const match = content.match(colDefRegex);

    if (!match) {
        console.error("CRITICAL ERROR: Could not find <COLDEF .../> in template. Cannot safely splice.");
        process.exit(1);
    }

    const cutIndex = match.index! + match[0].length;

    // 2. Construct the new header part
    // This includes <?xml ... <HEAD> ... <BODY><SECTION><P...><TEXT...><SECDEF...><COLDEF.../>
    const headerPart = content.substring(0, cutIndex);

    // 3. Close the structural tags that were open
    // We were inside <P> and <TEXT>.
    // Let's verify standard HML: <P><TEXT>...content...</TEXT></P>
    // So we append </TEXT></P> to close the "Section Definition Paragraph".
    const closer = "</TEXT></P>";

    // 4. Append the placeholder
    const placeholder = "{{CONTENT_HERE}}";

    // 5. Appending closing structure for the file
    const footerPart = "</SECTION></BODY></HWPML>";

    const newContent = headerPart + closer + placeholder + footerPart;

    fs.writeFileSync(fixedTemplatePath, newContent, 'utf-8');
    console.log(`[SUCCESS] Created fixed template at ${fixedTemplatePath}`);
    console.log(`Original size: ${content.length}, New size: ${newContent.length}`);

} catch (e) {
    console.error("Error creating fixed template:", e);
}
