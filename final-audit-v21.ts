import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.ts';
import { renderMathToSvg } from './src/lib/math-renderer.ts';

async function finalZeroFailCheck() {
    const testCases = [
        "1RIGHTx",
        "㉠LEFT(x)RIGHT㉡",
        "LEFT|xRIGHT|",
        "OVERat",
        "summatrix"
    ];

    console.log("=== FINAL ZERO-FAIL ENGINE AUDIT (V21) ===");

    for (const tc of testCases) {
        const latex = convertHwpEqToLatex(tc);
        console.log(`\nInput: ${tc}`);
        console.log(`Latex: ${latex}`);
        try {
            const svg = await renderMathToSvg(tc);
            console.log(`SVG Generation: SUCCESS (${svg.length} bytes)`);
        } catch (e) {
            console.error(`SVG Generation: FAILED`, e);
        }
    }
}

finalZeroFailCheck();
