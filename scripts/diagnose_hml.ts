
import * as fs from 'fs';
import * as path from 'path';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

const TEMPLATE_PATH = path.resolve(__dirname, '../template.hml');
const OUTPUT_DIR = path.resolve(__dirname, '../');

// Standard Empty Body
const EMPTY_BODY = "";

// Standard Text Body
const TEXT_BODY = `
<P><TEXT>Diagnostic Test: Text Only Body.</TEXT></P>
<P><TEXT>This confirms that Body Injection works.</TEXT></P>
`;

// Valid Base64 Image (Small Red Dot)
const VALID_IMAGE_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";

const BINARY_ITEM = {
    id: 1,
    size: 100,
    data: VALID_IMAGE_DATA,
    type: "png",
    binType: "Embedding",
    compress: "false"
};

async function runDiagnostics() {
    console.log("Starting HML Diagnostics...");

    if (!fs.existsSync(TEMPLATE_PATH)) {
        console.error("Template not found at:", TEMPLATE_PATH);
        return;
    }

    const templateXml = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

    // Test 1: Clean (Empty Body, No Binaries)
    // Checks if Template Manager breaks the empty template integrity
    try {
        const hml1 = mergeIntoTemplate(templateXml, {
            combinedBodyPs: EMPTY_BODY,
            binDataItems: []
        });
        fs.writeFileSync(path.join(OUTPUT_DIR, 'diagnose_v1_clean.hml'), hml1, 'utf-8');
        console.log("Generated diagnose_v1_clean.hml");
    } catch (e) {
        console.error("Failed to generate V1:", e);
    }

    // Test 2: Text Only
    // Checks if Body Injection logic is sound
    try {
        const hml2 = mergeIntoTemplate(templateXml, {
            combinedBodyPs: TEXT_BODY,
            binDataItems: []
        });
        fs.writeFileSync(path.join(OUTPUT_DIR, 'diagnose_v2_text.hml'), hml2, 'utf-8');
        console.log("Generated diagnose_v2_text.hml");
    } catch (e) {
        console.error("Failed to generate V2:", e);
    }

    // Test 3: Text + Binary
    // Checks if Binary Injection logic is sound
    try {
        const hml3 = mergeIntoTemplate(templateXml, {
            combinedBodyPs: TEXT_BODY,
            binDataItems: [BINARY_ITEM]
        });
        fs.writeFileSync(path.join(OUTPUT_DIR, 'diagnose_v3_binary.hml'), hml3, 'utf-8');
        console.log("Generated diagnose_v3_binary.hml");
    } catch (e) {
        console.error("Failed to generate V3:", e);
    }

    console.log("Diagnostics Generation Complete.");
}

runDiagnostics();
