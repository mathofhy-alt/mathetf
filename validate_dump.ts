
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const filePath = path.join(process.cwd(), 'debug_last_output.hml');
if (!fs.existsSync(filePath)) {
    console.error('File not found');
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');

try {
    const doc = new DOMParser({
        errorHandler: {
            warning: (w) => console.log('XML Warning:', w),
            error: (e) => console.error('XML Error:', e),
            fatalError: (e) => console.error('XML Fatal Error:', e)
        }
    }).parseFromString(content, 'text/xml');

    console.log('XML Parsing Completed.');

    // Check deep nesting
    const sections = doc.getElementsByTagName('SECTION');
    console.log(`Found ${sections.length} SECTIONs`);

    if (sections.length > 0) {
        const ps = sections[0].getElementsByTagName('P');
        console.log(`Found ${ps.length} Paragraphs in Section 0`);

        // Check all paragraphs for text
        let hasText = false;
        for (let i = 0; i < ps.length; i++) {
            const txt = ps[i].textContent?.trim();
            if (txt && txt.length > 0) {
                console.log(`P[${i}]: ${txt.substring(0, 50)}`);
                hasText = true;
            }
        }
        if (!hasText) console.log('WARNING: No text content found in any paragraph!');
    }

} catch (e: any) {
    console.error('Exception during parsing:', e.message);
}
