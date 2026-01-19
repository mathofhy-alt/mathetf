// Deep analysis for remaining crash causes
const JSZip = require('jszip');
const fs = require('fs');

async function deepAnalyze() {
    const zip = await JSZip.loadAsync(fs.readFileSync('./debug_output.hwpx'));

    // Check content.hpf
    const hpfRaw = await zip.file('Contents/content.hpf')?.async('string');
    console.log('\n=== CONTENT.HPF ===');
    console.log(hpfRaw?.substring(0, 2000) || 'NOT FOUND');

    // Check for any orphaned references
    const headerRaw = await zip.file('Contents/header.xml')?.async('string');
    const sectionRaw = await zip.file('Contents/section0.xml')?.async('string');

    console.log('\n=== CHECKING FOR ORPHAN REFERENCES ===');

    // Extract all q0_/q1_ IDs defined in header
    const definedIds = new Set();
    const idMatches = headerRaw.matchAll(/id="(q[01]_[^"]+)"/g);
    for (const m of idMatches) {
        definedIds.add(m[1]);
    }
    console.log('Defined q0_/q1_ IDs in header:', definedIds.size);

    // Extract all q0_/q1_ references in section
    const referencedIds = new Set();
    const refMatches = sectionRaw.matchAll(/(q[01]_\d+)/g);
    for (const m of refMatches) {
        referencedIds.add(m[1]);
    }
    console.log('Referenced q0_/q1_ IDs in section:', referencedIds.size);

    // Find orphans (referenced but not defined)
    const orphans = [];
    for (const ref of referencedIds) {
        if (!definedIds.has(ref)) {
            orphans.push(ref);
        }
    }
    console.log('\nOrphan references (NOT DEFINED in header):');
    console.log(orphans.length > 0 ? orphans.join(', ') : 'None found!');

    // Check for any other structural issues
    console.log('\n=== OTHER CHECKS ===');

    // Check ZIP file list for case-sensitivity issues
    const files = Object.keys(zip.files);
    console.log('ZIP files:');
    for (const f of files) {
        console.log('  -', f);
    }

    // Check for duplicate paragraphs IDs
    const paraIds = sectionRaw.match(/id="(\d+)"/g) || [];
    const uniqueParaIds = new Set(paraIds);
    console.log('\nParagraph IDs: total=', paraIds.length, 'unique=', uniqueParaIds.size);
    if (paraIds.length !== uniqueParaIds.size) {
        console.log('WARNING: DUPLICATE PARAGRAPH IDs FOUND!');
    }
}

deepAnalyze().catch(console.error);
