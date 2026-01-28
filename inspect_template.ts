
import * as fs from 'fs';
import * as path from 'path';

const templatePath = path.join(process.cwd(), 'template.hml');

try {
    const content = fs.readFileSync(templatePath, 'utf-8');

    console.log(`File size: ${content.length} bytes`);

    const anchor = '{{CONTENT_HERE}}';
    const index = content.indexOf(anchor);

    if (index === -1) {
        console.error(`ERROR: Anchor "${anchor}" NOT FOUND in template.hml`);
    } else {
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + anchor.length + 100);
        console.log(`\n--- Context for ${anchor} ---`);
        console.log(content.substring(start, end));
        console.log('-----------------------------');

        // Check for parent tags by scanning backwards
        const lookback = content.substring(Math.max(0, index - 200), index);
        console.log(`Lookback: ...${lookback.slice(-50)}`);
    }

    const marker = '{{MASTER_PATTERNS_START}}';
    const mIndex = content.indexOf(marker);
    if (mIndex === -1) {
        console.warn(`WARNING: Marker "${marker}" NOT FOUND`);
    } else {
        console.log(`Marker found at index ${mIndex}`);
    }

} catch (e) {
    console.error('Failed to read template:', e);
}
