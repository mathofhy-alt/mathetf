
// @ts-ignore
import hwpEqnTs from 'hwp-eqn-ts';
const { HwpEqnParser } = hwpEqnTs;

const testScripts = [
    "f \circ g",
    "root {n} {x}",
    "a over b",
    "{cases { 1 # 2 }}",
    "LEFT ( x RIGHT )",
    "Y= LEFT { y` LEFT  `5 LEQ  y LEQ  21 RIGHT } RIGHT ."
];

console.log("Testing hwp-eqn-ts Conversion...");

testScripts.forEach((script, idx) => {
    try {
        const parser = new HwpEqnParser();
        console.log(`\n[Test ${idx + 1}] Original: ${script}`);

        // Let's try to list methods first to be sure
        if (idx === 0) {
            console.log("Available Methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
        }

        // Likely API:
        const tokens = parser.tokenizeHwpEqn(script);
        const ast = parser.parseHwpEqn(tokens);
        const latex = parser.decodeLatex(ast);

        console.log(`LaTeX: ${latex}`);
    } catch (e) {
        console.error(`Failed to convert: ${script}`);
        console.error(e);
    }
});
