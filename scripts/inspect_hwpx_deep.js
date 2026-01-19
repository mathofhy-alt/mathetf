
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspect() {
    console.log('--- Analyzing HWPX Structure ---');
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    if (!fs.existsSync(templatePath)) {
        console.error('Template not found');
        return;
    }

    const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));

    // 1. File List
    console.log('Files:', Object.keys(zip.files));

    // 2. Header Structure (Styles)
    const headerFile = zip.file('Contents/header.xml');
    if (headerFile) {
        const xml = await headerFile.async('string');
        console.log('\n--- Header.xml Stats ---');
        console.log('Length:', xml.length);

        // Count definitions
        const tags = ['hh:charPr', 'hh:paraPr', 'hh:borderFill', 'hh:tblPr', 'hm:binData'];
        tags.forEach(tag => {
            const count = (xml.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
            console.log(`${tag}: ${count}`);
        });

        // Show sample BorderFill
        const sampleBF = xml.match(/<hh:borderFill\b[^>]*>[\s\S]*?<\/hh:borderFill>/);
        if (sampleBF) console.log('\nSample BorderFill:', sampleBF[0].slice(0, 200) + '...');
    }

    // 3. Section Ref Pattern
    const secFile = zip.file('Contents/section0.xml');
    if (secFile) {
        const xml = await secFile.async('string');
        console.log('\n--- Section0.xml Stats ---');

        // Check ID Refs
        const refs = ['charPrIDRef', 'paraPrIDRef', 'borderFillIDRef', 'binDataIDRef'];
        refs.forEach(ref => {
            const match = xml.match(new RegExp(`${ref}="(\\d+)"`));
            if (match) console.log(`Found ${ref}: ${match[0]}`);
        });
    }

    // 4. Rels check
    const relsFile = zip.file('Contents/_rels/section0.xml.rels'); // Verify path
    if (relsFile) {
        console.log('\nRels found at Contents/_rels/section0.xml.rels');
        console.log(await relsFile.async('string'));
    } else {
        // Try root rels
        const rootRels = zip.file('_rels/.rels');
        if (rootRels) {
            console.log('\nRoot .rels found');
            // console.log(await rootRels.async('string'));
        }
    }
}

inspect();
