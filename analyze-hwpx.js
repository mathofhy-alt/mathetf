// Analyze debug_output.hwpx structure
const JSZip = require('jszip');
const fs = require('fs');

async function analyze() {
    const filePath = './debug_output.hwpx';

    if (!fs.existsSync(filePath)) {
        console.log('FILE NOT FOUND');
        return;
    }

    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));

    // Check header.xml structure
    const headerRaw = await zip.file('Contents/header.xml')?.async('string');
    if (headerRaw) {
        console.log('\n=== HEADER STRUCTURE ===');
        console.log('Total length:', headerRaw.length);

        // Check refList structure
        const refListMatch = headerRaw.match(/<hh:refList[^>]*>([\s\S]*?)<\/hh:refList>/);
        if (refListMatch) {
            console.log('\nRefList found, analyzing children...');
            const refListContent = refListMatch[1];

            // Count each type
            const fontfacesMatch = refListContent.match(/<hh:fontfaces[^>]*cnt="(\d+)"/);
            const borderFillsMatch = refListContent.match(/<hh:borderFills[^>]*cnt="(\d+)"/);
            const charPropsMatch = refListContent.match(/<hh:charProperties[^>]*cnt="(\d+)"/);
            const paraPropsMatch = refListContent.match(/<hh:paraProperties[^>]*cnt="(\d+)"/);
            const stylesMatch = refListContent.match(/<hh:styles[^>]*cnt="(\d+)"/);
            const tabPropsMatch = refListContent.match(/<hh:tabProperties[^>]*cnt="(\d+)"/);
            const numberingsMatch = refListContent.match(/<hh:numberings[^>]*cnt="(\d+)"/);
            const bulletsMatch = refListContent.match(/<hh:bullets[^>]*cnt="(\d+)"/);

            console.log('fontfaces cnt:', fontfacesMatch?.[1] || 'NOT FOUND');
            console.log('borderFills cnt:', borderFillsMatch?.[1] || 'NOT FOUND');
            console.log('charProperties cnt:', charPropsMatch?.[1] || 'NOT FOUND');
            console.log('paraProperties cnt:', paraPropsMatch?.[1] || 'NOT FOUND');
            console.log('styles cnt:', stylesMatch?.[1] || 'NOT FOUND');
            console.log('tabProperties cnt:', tabPropsMatch?.[1] || 'NOT FOUND');
            console.log('numberings cnt:', numberingsMatch?.[1] || 'NOT FOUND');
            console.log('bullets cnt:', bulletsMatch?.[1] || 'NOT FOUND');

            // Check actual charPr count
            const charPrActual = (headerRaw.match(/<hh:charPr /g) || []).length;
            const paraPrActual = (headerRaw.match(/<hh:paraPr /g) || []).length;
            const styleActual = (headerRaw.match(/<hh:style /g) || []).length;

            console.log('\nActual element counts:');
            console.log('charPr elements:', charPrActual);
            console.log('paraPr elements:', paraPrActual);
            console.log('style elements:', styleActual);
        }

        // Check for q0_ prefixed IDs
        const q0Count = (headerRaw.match(/id="q0_/g) || []).length;
        const q1Count = (headerRaw.match(/id="q1_/g) || []).length;
        console.log('\nPrefixed IDs: q0_=' + q0Count + ' q1_=' + q1Count);
    }

    // Check section0.xml
    const sectionRaw = await zip.file('Contents/section0.xml')?.async('string');
    if (sectionRaw) {
        console.log('\n=== SECTION STRUCTURE ===');
        console.log('Total length:', sectionRaw.length);

        // Count paragraphs
        const paraCount = (sectionRaw.match(/<hp:p /g) || []).length;
        console.log('Paragraph count:', paraCount);

        // Check for secPr
        const secPrCount = (sectionRaw.match(/<hp:secPr/g) || []).length;
        console.log('secPr count:', secPrCount);

        // Check style refs
        const q0Refs = (sectionRaw.match(/q0_/g) || []).length;
        const q1Refs = (sectionRaw.match(/q1_/g) || []).length;
        console.log('q0_ references:', q0Refs);
        console.log('q1_ references:', q1Refs);
    }
}

analyze().catch(e => console.error('ERROR:', e));
