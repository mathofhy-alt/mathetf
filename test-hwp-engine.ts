import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';

const testCases = [
    { name: "Simple Equation", hwp: "y = mx + b" },
    { name: "Fraction (OVER)", hwp: "{a + b} over {c + d}" },
    { name: "Square Root", hwp: "sqrt{x^2 + y^2}" },
    { name: "Summation", hwp: "sum_{i=1}^{n} i" },
    { name: "Matrix", hwp: "matrix{1 & 0 # 0 & 1}" },
    { name: "Complex Mix", hwp: "f(x) = {1} over {sqrt{2 pi sigma^2}} exp (- {(x-mu)^2} over {2 sigma^2})" }
];

console.log("=== HWP-EQN-TS ENGINE VERIFICATION ===");

testCases.forEach(tc => {
    try {
        const latex = convertHwpEqToLatex(tc.hwp);
        console.log(`[${tc.name}]`);
        console.log(`  HWP:   ${tc.hwp}`);
        console.log(`  LATEX: ${latex}`);
        console.log('-------------------');
    } catch (e) {
        console.error(`[FAIL] ${tc.name}:`, e);
    }
});
