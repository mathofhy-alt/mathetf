import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';

const hardCases = [
    { name: "Attached Keyword V20", input: "1RIGHTx" },
    { name: "Mashed Case V20", input: "LEFT{m" },
    { name: "Korean Attached", input: "㉠RIGHT㉡" },
    { name: "Nested Absolute", input: "LEFT | x RIGHT |" },
    { name: "Therefore/Sim", input: "portanto , sim" }
];

console.log("=== HWP-to-LaTeX V20 Universal Hardened Verification ===");

hardCases.forEach(c => {
    const output = convertHwpEqToLatex(c.input);
    console.log(`\n[${c.name}]`);
    console.log(`HWP: ${c.input}`);
    console.log(`LTX: ${output}`);
});

console.log("\n=======================================================");
