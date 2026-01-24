import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';

const safeReportCases = [
    { name: "Q24 Eq 0 (it- & <)", hwp: "-1le{m<it-3+2 sqrt {2}" },
    { name: "Q14 Eq 9 (vert & ge)", hwp: "LEFT { x`left vert `x{ge}it-3,~x!=-it-1 RIGHT }" },
    { name: "Q21 Eq 12 (colon & |)", hwp: "p`:` LEFT | `x-a` RIGHT | >3" },
    { name: "Q24 Eq 1 (Mashed RIGHT)", hwp: "y= {LEFT | `x` RIGHT | -1} over {LEFT | `x-1` RIGHT |}" }
];

console.log("=== V8 ULTIMATE ENGINE VERIFICATION ===");
safeReportCases.forEach(tc => {
    const res = convertHwpEqToLatex(tc.hwp);
    console.log(`[${tc.name}]`);
    console.log(`  HWP: ${tc.hwp}`);
    console.log(`  RES: ${res}`);
    const leaks = ["RIGHT", "LEFT", "it-", "rm", "AGLT", "AGGT", "AGVERT"];
    const foundLeak = leaks.find(l => res.includes(l));
    const missingSymbol = ["<", ">", "|", ":"].find(s => tc.hwp.includes(s) && !res.includes(s));

    if (foundLeak || missingSymbol) {
        console.error(`  FAIL: ${foundLeak ? 'Leak found: ' + foundLeak : 'Symbol missing'}`);
    } else {
        console.log("  PASS: Clean & Complete.");
    }
    console.log("---");
});
