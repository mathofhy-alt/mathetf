import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';

const reportCases = [
    { name: "Absolute Value (Nested)", input: "LEFT | x RIGHT | + LEFT | y RIGHT |" },
    { name: "Complex Symbols", input: "le{m , ge{n , ∽p , portanto" },
    { name: "Hangul Markers", input: "㉠ + ㉡ = ㉢" },
    { name: "Missing Operators", input: "a < b , c > d , x | y , p : q" },
    { name: "Mixed Noise", input: "it-3rmOAB + 1RIGHTx" }
];

console.log("=== HWP-to-LaTeX V18 Platinum Hardened Verification ===");

reportCases.forEach(c => {
    const output = convertHwpEqToLatex(c.input);
    console.log(`\n[${c.name}]`);
    console.log(`HWP: ${c.input}`);
    console.log(`LTX: ${output}`);
});

console.log("\n=======================================================");
