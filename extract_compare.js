const fs = require('fs');

function extractImageTags(filename) {
    console.log(`--- ${filename} ---`);
    try {
        const content = fs.readFileSync(filename, 'utf8');

        // Find SHAPEOBJECT context
        const shapeIndex = content.indexOf('<SHAPEOBJECT');
        if (shapeIndex >= 0) {
            console.log("SHAPEOBJECT context (1000 chars):");
            console.log(content.substring(shapeIndex, shapeIndex + 1000));
        } else {
            console.log("SHAPEOBJECT NOT found.");
        }

        // Find the context around the first IMAGE tag
        const imageIndex = content.indexOf('<IMAGE');
        if (imageIndex >= 0) {
            console.log(`\nContext around FIRST IMAGE tag (2000 chars):`);
            console.log(content.substring(Math.max(0, imageIndex - 1500), imageIndex + 500));
        } else {
            console.log("\nIMAGE tag NOT found.");
        }

    } catch (e) {
        console.log(`Error reading ${filename}: ${e.message}`);
    }
    console.log("\n");
}

extractImageTags('시험지_2026-01-15 (36).hml');
extractImageTags('test_hml_v2_real_output.hml');
