
import { parseHml } from '../src/lib/hml/parser';
import assert from 'assert';

// Mock HML with Gaps and Skipped Numbers
const mockHmlGaps = `
<HEAD>
<MAPPINGTABLE>
<STYLE Id="0" Name="Normal" />
</MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION>

<!-- Q1: Standard -->
<P Style="0"><TEXT><CHAR>1.</CHAR><CHAR> </CHAR><CHAR>Start</CHAR></TEXT></P>

<!-- Q2 is missing! Format was unrecognizable or deleted -->
<P Style="0"><TEXT><CHAR>Unrecognizable Garbage for Q2</CHAR></TEXT></P>

<!-- Q3: Should trigger despite expected=2 -->
<P Style="0"><TEXT><CHAR>3.</CHAR><CHAR>Resume</CHAR></TEXT></P>

<!-- Q4: Standard -->
<P Style="0"><TEXT><CHAR>4.</CHAR><CHAR>Four</CHAR></TEXT></P>

<!-- Broad Jump: Q10 (Gap of 6) -->
<P Style="0"><TEXT><CHAR>10.</CHAR><CHAR>Jump</CHAR></TEXT></P>

</SECTION>
</BODY>
<TAIL></TAIL>
`;

function testFallback() {
    console.log("Starting HML Fallback Test (Gap Tolerance)...");

    const questions = parseHml(mockHmlGaps);

    console.log("Parsed Questions Count:", questions.length);
    questions.forEach((q, idx) => {
        console.log(`Out Q${q.question_number}: ${q.plain_text.substring(0, 30)}...`);
    });

    // We expect 4 questions found: 1, 3, 4, 10.
    // They will be renumbered to 1, 2, 3, 4.

    assert.strictEqual(questions.length, 4, "Should parse 4 questions despite gaps");

    // Check Original Content Preservation
    assert.ok(questions[0].plain_text.includes("1. Start"), "Q1 Start");
    assert.ok(questions[1].plain_text.includes("3.Resume"), "Q2 is actually Q3 content");
    assert.ok(questions[2].plain_text.includes("4.Four"), "Q3 is actually Q4 content");
    assert.ok(questions[3].plain_text.includes("10.Jump"), "Q4 is actually Q10 content");

    console.log("GAP TOLERANCE TEST PASSED!");
}

testFallback();
