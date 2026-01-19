/**
 * HML V2 Round-Trip Test - Use Original Template
 * 
 * Strategy: Use the ORIGINAL HML file as template, only replace BODY content
 */

const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('xmldom');

const TEST_INPUT = 'repro_real_image.hml';
const TEST_OUTPUT = 'test_hml_v2_output.hml';

async function main() {
    console.log('=== HML V2 Test (Original Template Strategy) ===\n');

    // Load original HML
    const inputPath = path.join(__dirname, TEST_INPUT);
    const hmlContent = fs.readFileSync(inputPath, 'utf-8');
    console.log(`[1] Loaded ${TEST_INPUT} (${hmlContent.length} bytes)`);

    // Strategy: Just copy the original file with minimal changes
    // This tests if the original file itself works

    // For now, just copy the original to see if IT works
    const outputPath = path.join(__dirname, TEST_OUTPUT);
    fs.writeFileSync(outputPath, hmlContent, 'utf-8');
    console.log(`[2] Copied original to ${TEST_OUTPUT}`);

    console.log('\n=== Test Complete ===');
    console.log(`\nPlease open ${TEST_OUTPUT} in Hancom Office.`);
    console.log('If this works, the original file is valid.');
    console.log('If this fails, the original file itself has issues.');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
