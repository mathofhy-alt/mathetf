
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';

const filePath = path.join(process.cwd(), '재조립양식.hml');
const content = fs.readFileSync(filePath, 'utf-8');

// Handle the placeholder specially because it might be invalid XML if not in a tag
// But xmldom is usually lenient.
// However, to be safe, we wrap it.
const wrappedContent = content.replace('{{CONTENT_HERE}}', '<PLACEHOLDER/>');

try {
    const doc = new DOMParser().parseFromString(wrappedContent, 'text/xml');
    const sections = doc.getElementsByTagName('SECTION');

    if (sections.length > 0) {
        const section = sections[0];
        const children = Array.from(section.childNodes);
        console.log(`Total children in SECTION: ${children.length}`);
        let removedCount = 0;

        for (let i = 0; i < children.length; i++) {
            const child = children[i] as Element;
            console.log(`Child[${i}]: NodeType=${child.nodeType}, TagName=${child.tagName}`);

            // Stop if we hit the placeholder (it might be a text node now due to replacement)
            if (child.tagName === 'PLACEHOLDER' || (child.nodeType === 1 && child.tagName === 'PLACEHOLDER')) {
                console.log('Hit placeholder tag. Stopping cleanup.');
                break;
            }

            // Check if it is an empty P tag
            if (child.tagName === 'P') {
                const text = child.getElementsByTagName('TEXT')[0];
                const coldef = child.getElementsByTagName('COLDEF');

                // CRITICAL: DO NOT REMOVE COLDEF or SECDEF (usually inside First P's TEXT)
                if (coldef.length > 0) {
                    console.log('Skipping P with COLDEF');
                    continue;
                }
                const secdef = child.getElementsByTagName('SECDEF');
                if (secdef.length > 0) {
                    console.log('Skipping P with SECDEF');
                    continue;
                }

                // If it has only empty CHAR or no CHAR...
                // Check text content
                const txtContent = child.textContent?.trim();
                if (!txtContent || txtContent.length === 0) {
                    // Remove it
                    section.removeChild(child);
                    removedCount++;
                }
            }
        }
        console.log(`Removed ${removedCount} empty paragraphs.`);

        const serializer = new XMLSerializer();
        let newContent = serializer.serializeToString(doc);

        // Restore placeholder
        newContent = newContent.replace('<PLACEHOLDER/>', '{{CONTENT_HERE}}');
        // Restore XML Declaration manually if lost (serializer might skip or add one)
        if (!newContent.startsWith('<?xml')) {
            newContent = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>' + newContent;
        }

        fs.writeFileSync(filePath, newContent);
        console.log('Template cleaned and saved.');

    } else {
        console.error('No SECTION found in template.');
    }

} catch (e: any) {
    console.error('Error cleaning template:', e);
}
