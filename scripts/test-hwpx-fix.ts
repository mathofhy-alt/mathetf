
import assert from 'assert';

// Mock Data simulates the problem: 
// section0 uses ID 1 and 4.
// header only defines ID 1.
// template header defines ID 1 and 4.

const mockSection0 = `
<hh:section>
    <hp:p borderFillIDRef="1">Refers to 1</hp:p>
    <hp:p borderFillIDRef="4">Refers to 4 (Missing in header)</hp:p>
    <hp:p borderFillIDRef="5">Refers to 5 (Missing in header)</hp:p>
</hh:section>
`;

const mockHeaderOutput = `
<hh:head>
    <hh:borderFills count="1">
        <hh:borderFill id="1">
            <hh:run>Existing Def 1</hh:run>
        </hh:borderFill>
    </hh:borderFills>
</hh:head>
`;

const mockTemplateHeader = `
<hh:head>
    <hh:borderFills count="5">
        <hh:borderFill id="1">
            <hh:run>Template Def 1</hh:run>
        </hh:borderFill>
        <hh:borderFill id="2">
            <hh:run>Template Def 2</hh:run>
        </hh:borderFill>
        <hh:borderFill id="4">
            <hh:run>Template Def 4 (Target)</hh:run>
        </hh:borderFill>
         <hh:borderFill id="5"><hh:run>Template Def 5 (Target)</hh:run></hh:borderFill>
    </hh:borderFills>
</hh:head>
`;

function testFix() {
    console.log("Starting Logic Test...");

    // A. Collect Needed IDs
    const neededIds = new Set<string>();
    const idRefRegex = /borderFillIDRef="(\d+)"/g;
    let match;
    while ((match = idRefRegex.exec(mockSection0)) !== null) {
        neededIds.add(match[1]);
    }
    console.log("Needed IDs:", Array.from(neededIds));
    assert.deepStrictEqual(Array.from(neededIds).sort(), ['1', '4', '5']);

    // B. Collect Present IDs
    const presentIds = new Set<string>();
    const defRegex = /<[^:]+:borderFill\s+[^>]*id="(\d+)"/g;
    while ((match = defRegex.exec(mockHeaderOutput)) !== null) {
        presentIds.add(match[1]);
    }
    console.log("Present IDs:", Array.from(presentIds));
    assert.strictEqual(presentIds.has('1'), true);
    assert.strictEqual(presentIds.has('4'), false);

    // C. Missing
    const missingIds = Array.from(neededIds).filter(id => !presentIds.has(id));
    console.log("Missing IDs:", missingIds);
    assert.deepStrictEqual(missingIds.sort(), ['4', '5']);

    // D. Extract from Template
    const missingBlocks: string[] = [];
    for (const missingId of missingIds) {
        const blockRegex = new RegExp(`(<[^:]+:borderFill\\s+[^>]*id="${missingId}"[\\s\\S]*?<\\/[^:]+:borderFill>)`, 'i');
        const blockMatch = blockRegex.exec(mockTemplateHeader);
        if (blockMatch) {
            missingBlocks.push(blockMatch[1]);
        }
    }
    console.log(`Extracted ${missingBlocks.length} blocks.`);
    assert.strictEqual(missingBlocks.length, 2);
    assert.ok(missingBlocks[0].includes('id="4"'));
    assert.ok(missingBlocks[1].includes('id="5"'));

    // E. Inject
    let fixedHeader = mockHeaderOutput;
    if (missingBlocks.length > 0) {
        const closingTagRegex = /(<\/[^:]+:borderFills>)/;
        if (closingTagRegex.test(fixedHeader)) {
            const injection = missingBlocks.join('\n');
            fixedHeader = fixedHeader.replace(closingTagRegex, `${injection}$1`);
        }
    }

    console.log("Fixed Header Result:\n", fixedHeader);

    // F. Verify
    assert.ok(fixedHeader.includes('id="4"'), "Should contain ID 4");
    assert.ok(fixedHeader.includes('id="1"'), "Should still contain ID 1");
    assert.ok(fixedHeader.includes('Template Def 4 (Target)'), "Should contain content of 4");
    assert.ok(fixedHeader.includes('Template Def 5 (Target)'), "Should contain content of 5");

    // Ensure structure validity (rudimentary)
    assert.ok(fixedHeader.indexOf('</hh:borderFills>') > fixedHeader.indexOf('Template Def 5'), "Injection should be inside closing tag");

    console.log("TEST PASSED!");
}

testFix();
