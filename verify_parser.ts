
// @ts-ignore
import { convertHwpEqToLatex } from './src/lib/hwp-to-latex.js';

const tests = [
    "f \circ g",
    "root {n} {x}",
    "a over b",
    "sqrt {x+1}",
    "matrix { a # b }",
    "cases { 1 # 2 }",
    "LEFT ( x RIGHT )",
    "Y= LEFT { y` LEFT  `5 LEQ  y LEQ  21 RIGHT } RIGHT ."
];

console.log("Verifying New Custom Recursive Parser...");

tests.forEach(t => {
    try {
        console.log(`\nHWP:   ${t}`);
        console.log(`LaTeX: ${convertHwpEqToLatex(t)}`);
    } catch (e) {
        console.error(e);
    }
});
