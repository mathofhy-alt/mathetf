
import assert from 'assert';

// Mock Data for "Hard Restore"
// Template has IDs 1 through 12.
const mockTemplateHeader = `
<hh:head>
    <hh:borderFills count="12">
        <hh:borderFill id="1"><hh:run>Template Def 1</hh:run></hh:borderFill>
        <hh:borderFill id="2"><hh:run>Template Def 2</hh:run></hh:borderFill>
        <hh:borderFill id="3"><hh:run>Template Def 3</hh:run></hh:borderFill>
        <hh:borderFill id="4"><hh:run>Template Def 4</hh:run></hh:borderFill>
        <hh:borderFill id="5"><hh:run>Template Def 5</hh:run></hh:borderFill>
        <hh:borderFill id="6"><hh:run>Template Def 6</hh:run></hh:borderFill>
        <hh:borderFill id="7"><hh:run>Template Def 7</hh:run></hh:borderFill>
        <hh:borderFill id="8"><hh:run>Template Def 8</hh:run></hh:borderFill>
        <hh:borderFill id="9"><hh:run>Template Def 9</hh:run></hh:borderFill>
        <hh:borderFill id="10"><hh:run>Template Def 10</hh:run></hh:borderFill>
        <hh:borderFill id="11"><hh:run>Template Def 11</hh:run></hh:borderFill>
        <hh:borderFill id="12"><hh:run>Template Def 12</hh:run></hh:borderFill>
    </hh:borderFills>
</hh:head>
`;

// Output has only 1-3 (Broken)
const mockOutputHeader = `
<hh:head>
    <hh:borderFills count="3">
        <hh:borderFill id="1"><hh:run>Output Def 1 (Bad)</hh:run></hh:borderFill>
        <hh:borderFill id="2"><hh:run>Output Def 2 (Bad)</hh:run></hh:borderFill>
        <hh:borderFill id="3"><hh:run>Output Def 3 (Bad)</hh:run></hh:borderFill>
    </hh:borderFills>
</hh:head>
`;

// Section0 refers to 1, 4, 12
const mockSection0 = `
<hh:section>
    <hp:p borderFillIDRef="1">Refers to 1</hp:p>
    <hp:p borderFillIDRef="4">Refers to 4 (Missing in Output)</hp:p>
    <hp:p borderFillIDRef="12">Refers to 12 (Missing in Output)</hp:p>
</hh:section>
`;

function testHardRestore() {
    console.log("Starting Hard Restore Logic Test...");

    // 1. Validate Template
    console.log("[1] Validating Template...");
    const templateBorderFillsBlock = /<[^:]+:borderFills\s+[^>]*>([\s\S]*?)<\/[^:]+:borderFills>/i.exec(mockTemplateHeader);

    assert.ok(templateBorderFillsBlock, "Template must have borderFills block");

    // Strict check for presence of id="12"
    assert.ok(templateBorderFillsBlock[0].includes('id="12"'), "Template must contain id=12");
    console.log(" -> Template valid.");

    // 2. Hard Replace
    console.log("[2] Replacing Block...");
    const outputBorderFillsRegex = /<[^:]+:borderFills\s+[^>]*>[\s\S]*?<\/[^:]+:borderFills>/i;
    assert.ok(outputBorderFillsRegex.test(mockOutputHeader), "Output must have borderFills block to replace");

    let fixedHeader = mockOutputHeader.replace(outputBorderFillsRegex, templateBorderFillsBlock[0]);

    // 3. Strict Final Validation
    console.log("[3] Final Validation...");

    // A. Check id=12 presence
    assert.ok(fixedHeader.includes('id="12"'), "Fixed header must contain id=12");

    // B. Check Ref Validity
    const neededIds = new Set<string>();
    const idRefRegex = /borderFillIDRef="(\d+)"/g;
    let match;
    while ((match = idRefRegex.exec(mockSection0)) !== null) {
        neededIds.add(match[1]);
    }
    console.log("Needed Ref IDs:", Array.from(neededIds));

    const presentIds = new Set<string>();
    const defRegex = /<[^:]+:borderFill\s+[^>]*id="(\d+)"/g;
    while ((match = defRegex.exec(fixedHeader)) !== null) {
        presentIds.add(match[1]);
    }
    console.log("Present Def IDs (First 5):", Array.from(presentIds).slice(0, 5), "...");

    const missingIds = Array.from(neededIds).filter(id => !presentIds.has(id));
    console.log("Missing after fix:", missingIds);

    assert.strictEqual(missingIds.length, 0, "All needed IDs must be present");
    assert.ok(fixedHeader.includes('Template Def 1'), "Content should be from template");
    assert.strictEqual(fixedHeader.includes('Output Def 1 (Bad)'), false, "Old output content should be gone");

    console.log("HARD RESTORE TEST PASSED!");
}

testHardRestore();
