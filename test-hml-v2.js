/**
 * HML V2 - Template-Based Approach
 * 
 * Strategy: Use the original HML file as template and extract/re-inject content
 * This preserves all the complex HEAD structure that Hancom Office requires
 */

const fs = require('fs');
const path = require('path');

const TEST_INPUT = 'hml v2-test-tem.hml';
const TEST_OUTPUT = 'test_hml_v2_output.hml';

async function main() {
    console.log('=== HML V2 Template-Based Test ===\n');

    // Step 1: Load original HML
    const inputPath = path.join(__dirname, TEST_INPUT);
    const hmlContent = fs.readFileSync(inputPath, 'utf-8');
    console.log(`[1] Loaded ${TEST_INPUT} (${hmlContent.length} bytes)`);

    // Step 2: Just copy the original file (test if original works)
    const outputPath = path.join(__dirname, TEST_OUTPUT);
    fs.writeFileSync(outputPath, hmlContent, 'utf-8');
    console.log(`[2] Copied to ${TEST_OUTPUT} (${hmlContent.length} bytes)`);

    console.log('\n=== Test Complete ===');
    console.log(`\nPlease open ${TEST_OUTPUT} in Hancom Office to verify it opens correctly.`);
    console.log('If this works, we can proceed to modify the content.');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
