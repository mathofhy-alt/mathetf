
import fs from 'fs';
import path from 'path';

const inputPath = 'd:\\Dropbox\\안티그래비티\\template_new.hml';
const outputPath = 'd:\\Dropbox\\안티그래비티\\template.hml';

try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    console.log('Read ' + content.length + ' bytes.');

    // Regex to find the Body Section and replace it
    const sectionRegex = /<SECTION Id="0">[\s\S]*?<\/SECTION>/i;

    // Regex to capture SECDEF (essential for page setup)
    const secDefMatch = content.match(/<SECDEF[\s\S]*?<\/SECDEF>/i) || content.match(/<SECDEF[^>]*?\/>/i);
    const secDef = secDefMatch ? secDefMatch[0] : '';

    if (!secDef) {
        console.warn('Warning: No SECDEF found in source template. Page settings may be lost.');
    } else {
        console.log('Preserved SECDEF (' + secDef.length + ' bytes).');
    }

    if (!sectionRegex.test(content)) {
        console.error('Checking failed: SECTION tag not found!');
        process.exit(1);
    }

    const cleanSection = `<SECTION Id="0"><P ParaShape="0"><TEXT CharShape="0">${secDef}</TEXT></P></SECTION>`;
    const newContent = content.replace(sectionRegex, cleanSection);

    fs.writeFileSync(outputPath, newContent, 'utf-8');
    console.log('Successfully created cleaned template at: ' + outputPath);

} catch (e) {
    console.error('Error:', e);
    process.exit(1);
}
