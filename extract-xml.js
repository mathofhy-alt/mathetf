// Extract header.xml for detailed analysis
const JSZip = require('jszip');
const fs = require('fs');

async function extractHeader() {
    const zip = await JSZip.loadAsync(fs.readFileSync('./debug_output.hwpx'));
    const headerRaw = await zip.file('Contents/header.xml')?.async('string');
    fs.writeFileSync('./debug_header.xml', headerRaw);
    console.log('Header extracted to debug_header.xml');

    const sectionRaw = await zip.file('Contents/section0.xml')?.async('string');
    fs.writeFileSync('./debug_section.xml', sectionRaw);
    console.log('Section extracted to debug_section.xml');

    // Also extract from template for comparison
    const templateZip = await JSZip.loadAsync(fs.readFileSync('./public/template.hwpx'));
    const templateHeader = await templateZip.file('Contents/header.xml')?.async('string');
    fs.writeFileSync('./template_header.xml', templateHeader);
    console.log('Template header extracted to template_header.xml');
}

extractHeader().catch(console.error);
