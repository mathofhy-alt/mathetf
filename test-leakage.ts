import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';

const cases = [
    "y = x - 1 RIGHT x - 1",
    "y = LEFT | x - 1 RIGHT |",
    "만나지 않도록 하는 상수 m",
    "cases { x=1 # y=2 }",
    "matrix { 1 & 0 # 0 & 1 } OVER 2"
];

console.log("=== LEAKAGE DEFENSE TEST ===");
cases.forEach(c => {
    const res = convertHwpEqToLatex(c);
    console.log(`INPUT:  ${c}`);
    console.log(`OUTPUT: ${res}`);
    if (res.includes("RIGHT") || res.includes("LEFT")) {
        console.error("FAIL: Leakage detected!");
    }
    console.log("---");
});
