import { Tokenizer, HwpParser, toLatex, TokenType } from 'hwp-eqn-ts';

function convertGreedy(input: string): string {
    const tokens = Tokenizer.tokenize(input, 'hwpeqn');
    const parser = new HwpParser(tokens);
    const nodes: string[] = [];

    const filteredTokens = (parser as any).tokens;

    while ((parser as any).pos < filteredTokens.length) {
        const startPos = (parser as any).pos;
        const node = parser.parseExpression();
        const latex = toLatex(node);
        if (latex.trim()) nodes.push(latex);

        if ((parser as any).pos <= startPos) {
            // Force consume one if stuck
            const t = (parser as any).next();
            if (t.type !== TokenType.EOF) {
                nodes.push(t.value);
            } else {
                break;
            }
        }
    }
    return nodes.join(' ');
}

console.log("Greedy y=mx+b:", convertGreedy("y = mx + b"));
console.log("Greedy Fraction:", convertGreedy("{a+b} over {c+d}"));
console.log("Greedy Sum:", convertGreedy("sum_{i=1}^n i"));
