// Diagnostic script to analyze template and output HWPX structure
const JSZip = require('jszip');
const fs = require('fs');

async function analyze(filePath, label) {
    console.log(`\n=== ${label}: ${filePath} ===`);

    if (!fs.existsSync(filePath)) {
        console.log('FILE NOT FOUND');
        return;
    }

    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));

    // List files
    console.log('\nFiles:', Object.keys(zip.files).join(', '));

    // Check header.xml
    const headerRaw = await zip.file('Contents/header.xml')?.async('string');
    if (headerRaw) {
        console.log('\n[HEADER] First 1500 chars:');
        console.log(headerRaw.substring(0, 1500));

        // Check for critical elements
        const hasFontFaces = headerRaw.includes('fontFaces');
        const hasCharProperties = headerRaw.includes('charProperties');
        const hasParaProperties = headerRaw.includes('paraProperties');
        const hasStyles = headerRaw.includes('styles');
        const hasBeginNum = headerRaw.includes('beginNum');
        const hasRefList = headerRaw.includes('refList');

        console.log(`\n[CRITICAL ELEMENTS] fontFaces:${hasFontFaces} charProperties:${hasCharProperties} paraProperties:${hasParaProperties} styles:${hasStyles} beginNum:${hasBeginNum} refList:${hasRefList}`);
    }

    // Check section0.xml
    const sectionRaw = await zip.file('Contents/section0.xml')?.async('string');
    if (sectionRaw) {
        console.log('\n[SECTION] First 800 chars:');
        console.log(sectionRaw.substring(0, 800));

        // Count paragraphs
        const paraCount = (sectionRaw.match(/<hp:p/g) || []).length;
        console.log(`\n[SECTION] Paragraph count: ${paraCount}`);
    }
}

(async () => {
    await analyze('./public/template.hwpx', 'TEMPLATE');
})().catch(e => console.error('ERROR:', e));
