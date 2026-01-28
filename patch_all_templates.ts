
import * as fs from 'fs';
import * as path from 'path';

const templates = [
    'hml v2-test-tem.hml',
    'template.hml',
    '재조립양식.hml'
];

templates.forEach(filename => {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
        console.log(`[SKIP] ${filename} not found.`);
        return;
    }

    console.log(`\n[PROCESSING] ${filename}...`);
    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if placeholder exists
    if (!content.includes('{{CONTENT_HERE}}')) {
        console.log(`  -> Placeholder MISSING. Injecting...`);

        // Find </SECTION>
        // We want to insert valid P-neutral content.
        // Actually, the generator replaces {{CONTENT_HERE}} with <P>...</P> blocks.
        // So we just need to ensure {{CONTENT_HERE}} is a direct child of SECTION.

        if (content.includes('</SECTION>')) {
            // Check if </SECTION> is inside a P tag? Unlikely for valid XML but possible if minified.
            // Safe injection: before </SECTION>.
            content = content.replace('</SECTION>', '{{CONTENT_HERE}}</SECTION>');
            fs.writeFileSync(filePath, content);
            console.log(`  -> [SUCCESS] Injected {{CONTENT_HERE}} before </SECTION>.`);
        } else {
            console.error(`  -> [ERROR] Could not find </SECTION> to inject placeholder.`);
        }
    } else {
        console.log(`  -> Placeholder FOUND.`);

        // Check for double wrapping: <P>...{{CONTENT_HERE}}...</P>
        // We use a regex to see if it's inside <P> tags.
        // This is tricky with simple regex if tags are nested or on multiple lines.
        // But for our templates, it's usually <P>...{{CONTENT_HERE}}...</P>.

        const pWrappedRegex = /<P[^>]*>[^<]*{{CONTENT_HERE}}[^<]*<\/P>/i;
        if (pWrappedRegex.test(content)) {
            console.log(`  -> [WARNING] Placeholder is wrapped in <P>! Fixing...`);

            // Extract the placeholder and move it out.
            // We'll replace the whole P wrapper with just {{CONTENT_HERE}}.
            // WARNING: This assumes the P wrapper contains NOTHING else of value.
            // If it contains empty text or similar, it's fine.

            content = content.replace(/<P[^>]*>\s*{{CONTENT_HERE}}\s*<\/P>/gi, '{{CONTENT_HERE}}');
            content = content.replace(/<P[^>]*><TEXT[^>]*>\s*{{CONTENT_HERE}}\s*<\/TEXT><\/P>/gi, '{{CONTENT_HERE}}');

            fs.writeFileSync(filePath, content);
            console.log(`  -> [SUCCESS] Unwrapped {{CONTENT_HERE}} from <P> tags.`);
        } else {
            console.log(`  -> [OK] Placeholder appears to be correctly placed (not tightly wrapped in P).`);
        }
    }
});
