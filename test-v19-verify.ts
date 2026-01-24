import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';

const extremeCases = [
    { name: "Attached Keyword (Front)", input: "1RIGHTx" },
    { name: "Attached Keyword (Back)", input: "LEFT{m" },
    { name: "Mashed Case", input: "1RIGHT2LEFT3" }
];

console.log("=== HWP-to-LaTeX V19 Extreme Scrub Verification ===");

extremeCases.forEach(c => {
    const output = convertHwpEqToLatex(c.input);
    console.log(`\n[${c.name}]`);
    console.log(`HWP: ${c.input}`);
    console.log(`LTX: ${output}`);
});

console.log("\n=======================================================");
