/**
 * HWP Math to LaTeX Converter (V27 - Recursive Descent AST Engine)
 * 
 * Technical Authority: Seoul Exam Platform Engineering
 * Implementation: Antigravity AI
 */

const SYMBOL_MAP: Record<string, string> = {
    "therefore": "\\therefore", "because": "\\because", "times": "\\times", "cdot": "\\cdot", "div": "\\div", "pm": "\\pm",
    "le": "\\le", "leq": "\\le", "ge": "\\ge", "geq": "\\ge", "ne": "\\ne", "neq": "\\ne", "approx": "\\approx",
    "inf": "\\infty", "infinity": "\\infty", "overline": "\\overline", "bar": "\\overline", "underline": "\\underline",
    "vec": "\\vec", "hat": "\\hat", "tilde": "\\tilde", "dot": "\\dot", "ddot": "\\ddot", "arc": "\\overset{\\frown}",
    "sum": "\\sum", "int": "\\int", "prod": "\\prod",
    "alpha": "\\alpha", "beta": "\\beta", "gamma": "\\gamma", "delta": "\\delta", "epsilon": "\\epsilon", "zeta": "\\zeta",
    "eta": "\\eta", "theta": "\\theta", "iota": "\\iota", "kappa": "\\kappa", "lambda": "\\lambda", "mu": "\\mu",
    "nu": "\\nu", "xi": "\\xi", "omicron": "o", "pi": "\\pi", "rho": "\\rho", "sigma": "\\sigma", "tau": "\\tau",
    "upsilon": "\\upsilon", "phi": "\\phi", "chi": "\\chi", "psi": "\\psi", "omega": "\\omega",
    "Alpha": "A", "Beta": "B", "Gamma": "\\Gamma", "Delta": "\\Delta", "Epsilon": "E", "Zeta": "Z", "Eta": "H", "Theta": "\\Theta",
    "Iota": "I", "Kappa": "K", "Lambda": "\\Lambda", "Mu": "M", "Nu": "N", "Xi": "\\Xi", "Omicron": "O", "Pi": "\\Pi",
    "Rho": "P", "Sigma": "\\Sigma", "Tau": "T", "Upsilon": "\\Upsilon", "Phi": "\\Phi", "Chi": "X", "Psi": "\\Psi", "Omega": "\\Omega",
    "subset": "\\subset", "subseteq": "\\subseteq", "supset": "\\supset", "supseteq": "\\supseteq",
    "cap": "\\cap", "cup": "\\cup", "in": "\\in", "notin": "\\notin", "empty": "\\emptyset",
    "->": "\\to", "<-": "\\leftarrow", "<->": "\\leftrightarrow", "=>": "\\Rightarrow", "<=": "\\Leftarrow", "<=>": "\\Leftrightarrow",
    "angle": "\\angle", "perp": "\\perp", "parallel": "\\parallel", "triangle": "\\triangle",
    "cdots": "\\cdots", "vdots": "\\vdots", "ddots": "\\ddots", "circ": "\\circ", "prime": "'",
    "partial": "\\partial", "nabla": "\\nabla", "bullet": "\\bullet"
};

const GREEK_SET = new Set([
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu",
    "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu",
    "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
]);

enum TokenType { WHITESPACE, NUMBER, IDENT, SYMBOL, SPACE_CMD, EOF }

interface Token { type: TokenType; value: string; }

class Lexer {
    private pos = 0;
    constructor(private input: string) { }
    private peek() { return this.input[this.pos] || ''; }
    private next() { return this.input[this.pos++] || ''; }
    public tokenize(): Token[] {
        const tokens: Token[] = [];
        while (this.pos < this.input.length) {
            const char = this.peek();
            const start = this.pos;
            if (/\s/.test(char)) {
                let v = ''; while (/\s/.test(this.peek())) v += this.next();
                tokens.push({ type: TokenType.WHITESPACE, value: v });
            } else if (/[0-9]/.test(char)) {
                let v = ''; while (/[0-9.]/.test(this.peek())) v += this.next();
                tokens.push({ type: TokenType.NUMBER, value: v });
            } else if (/[a-zA-Z가-힣]/.test(char)) {
                let v = ''; while (/[a-zA-Z가-힣]/.test(this.peek())) v += this.next();
                tokens.push({ type: TokenType.IDENT, value: v });
            } else if (char === '~' || char === '`') {
                tokens.push({ type: TokenType.SPACE_CMD, value: this.next() });
            } else if (char === '<' || char === '-' || char === '=') {
                let cand = '';
                const p = this.pos;
                if (this.input.startsWith('<->', p)) cand = '<->';
                else if (this.input.startsWith('<=>', p)) cand = '<=>';
                else if (this.input.startsWith('->', p)) cand = '->';
                else if (this.input.startsWith('=>', p)) cand = '=>';
                else if (this.input.startsWith('<-', p)) cand = '<-';
                else if (this.input.startsWith('<=', p)) cand = '<=';
                if (cand) { this.pos += cand.length; tokens.push({ type: TokenType.SYMBOL, value: cand }); }
                else tokens.push({ type: TokenType.SYMBOL, value: this.next() });
            } else {
                tokens.push({ type: TokenType.SYMBOL, value: this.next() });
            }
        }
        tokens.push({ type: TokenType.EOF, value: '' });
        return tokens;
    }
}

class Parser {
    private tokens: Token[];
    private pos = 0;
    constructor(tokens: Token[]) { this.tokens = tokens.filter(t => t.type !== TokenType.WHITESPACE); }
    private peek() { return this.tokens[this.pos] || { type: TokenType.EOF, value: '' }; }
    private next() { return this.tokens[this.pos++] || { type: TokenType.EOF, value: '' }; }
    private match(v: string) { if (this.peek().value.toLowerCase() === v.toLowerCase()) { this.pos++; return true; } return false; }

    public parse() { return this.parseExpression(); }

    private parseExpression(stopAt: string[] = []): string {
        let terms: string[] = [];
        while (this.pos < this.tokens.length) {
            const tk = this.peek();
            if (tk.type === TokenType.EOF || stopAt.some(s => s.toLowerCase() === tk.value.toLowerCase())) break;
            if (tk.value.toLowerCase() === 'over') {
                this.next();
                const left = terms.join(' ');
                const right = this.parseExpression(stopAt);
                return `\\frac{${left}}{${right}}`;
            }
            terms.push(this.parseTerm(stopAt));
        }
        return terms.join(' ');
    }

    private parseTerm(stopAt: string[] = []): string {
        let factors: string[] = [];
        const terminators = stopAt.concat(['over']);
        while (this.pos < this.tokens.length) {
            const tk = this.peek();
            if (tk.type === TokenType.EOF || terminators.some(s => s.toLowerCase() === tk.value.toLowerCase())) break;
            factors.push(this.parseFactor(stopAt));
        }
        return factors.join(' ');
    }

    private parseFactor(stopAt: string[] = []): string {
        let base = this.parsePrimary(stopAt);
        while (true) {
            const tk = this.peek();
            if (tk.value === '^') {
                this.next();
                const sup = this.parsePrimary(stopAt);
                base = `${base}^{${sup}}`;
            } else if (tk.value === '_') {
                this.next();
                const sub = this.parsePrimary(stopAt);
                base = `${base}_{${sub}}`;
            } else break;
        }
        return base;
    }

    private parsePrimary(stopAt: string[] = []): string {
        const tk = this.next();
        if (tk.type === TokenType.EOF) return "";
        if (tk.type === TokenType.NUMBER) return tk.value;
        if (tk.type === TokenType.SPACE_CMD) return "\\; ";
        if (tk.type === TokenType.SYMBOL) {
            if (tk.value === '{') {
                const res = this.parseExpression(['}']);
                this.match('}');
                return res;
            }
            return SYMBOL_MAP[tk.value] || tk.value;
        }
        if (tk.type === TokenType.IDENT) {
            const val = tk.value.toLowerCase();
            if (val === 'root' || val === 'sqrt') {
                const arg1 = this.parsePrimary(stopAt);
                const nextTk = this.peek();
                if (nextTk.type !== TokenType.EOF && !['#', '&', '}', 'right', 'over'].includes(nextTk.value.toLowerCase())) {
                    if (nextTk.value === '{' || nextTk.type === TokenType.NUMBER || nextTk.type === TokenType.IDENT) {
                        const arg2 = this.parsePrimary(stopAt);
                        return `\\sqrt[${arg1}]{${arg2}}`;
                    }
                }
                return `\\sqrt{${arg1}}`;
            }
            if (val === 'left' || val === 'right') {
                if (val === 'right') {
                    // Dangling RIGHT - just ignore or return a phantom delimiter to prevent KaTeX crash
                    let delimTk = this.next();
                    let delim = (delimTk.value === '{' || delimTk.value === '}') ? '\\' + delimTk.value : delimTk.value;
                    if (delimTk.type === TokenType.EOF || delimTk.type === TokenType.SPACE_CMD) delim = '.';
                    return `\\right${delim}`;
                }

                // val is 'left'
                let delimTk = this.next();
                let delim = (delimTk.value === '{' || delimTk.value === '}') ? '\\' + delimTk.value : delimTk.value;
                if (delimTk.type === TokenType.EOF || delimTk.type === TokenType.SPACE_CMD) delim = '.';

                const content = this.parseExpression(['right']);

                // If we stopped because of 'right', consume it and its delimiter
                if (this.peek().value.toLowerCase() === 'right') {
                    this.next(); // consume 'right'
                    let nextTkR = this.next();
                    let delimR = (nextTkR.value === '{' || nextTkR.value === '}') ? '\\' + nextTkR.value : nextTkR.value;
                    if (nextTkR.type === TokenType.EOF || nextTkR.type === TokenType.SPACE_CMD) delimR = '.';
                    return `\\left${delim} ${content} \\right${delimR}`;
                } else {
                    // Missing 'right' - close with '.'
                    return `\\left${delim} ${content} \\right.`;
                }
            }
            if (val === 'matrix' || val === 'cases') {
                const genre = val;
                this.match('{');
                const rows: string[][] = [];
                let currentRow: string[] = [];
                while (this.pos < this.tokens.length) {
                    const cell = this.parseExpression(['&', '#', '}']);
                    currentRow.push(cell);
                    const sep = this.next().value;
                    if (sep === '&') continue;
                    if (sep === '#') { rows.push(currentRow); currentRow = []; continue; }
                    if (sep === '}') { rows.push(currentRow); break; }
                }
                return `\\begin{${genre}} ${rows.map(r => r.join(' & ')).join(' \\\\ ')} \\end{${genre}}`;
            }
            if (val === 'rm' || val === 'it' || val === 'bold') {
                const content = this.parsePrimary(stopAt);
                const cmd = val === 'bold' ? '\\mathbf' : (val === 'it' ? '\\mathit' : '\\mathrm');
                return `${cmd}{${content}}`;
            }
            if (SYMBOL_MAP[val]) return SYMBOL_MAP[val];
            if (GREEK_SET.has(tk.value)) return "\\" + tk.value;
            return tk.value;
        }
        return "";
    }
}

/**
 * HWP 수식 스크립트를 표준 LaTeX으로 변환 (V27 RD Engine)
 */
export function convertHwpEqToLatex(script: string): string {
    if (!script) return '';

    // 1. 스타일 및 폰트 제어어 사전 제거 (RD 파서 부하 경감)
    let preCleaned = script
        .replace(/(size\s*\d+|font\s*".*?"|bold|it|rm)/gi, match => {
            return match;
        })
        .replace(/[\u0000-\u001F\u007F-\u009F\uE000-\uF8FF]/g, ''); // Control chars and PUA

    try {
        const lexer = new Lexer(preCleaned);
        const parser = new Parser(lexer.tokenize());
        let latex = parser.parse();

        // 필수 적용 필터 (Capture Analysis 기반)
        latex = latex
            .replace(/\\right\./g, '') // 찌꺼기 제거
            .replace(/sim\s/g, '\\sim ') // sim 기호 보정
            .replace(/it\s/g, '') // it 제거 미흡 보정
            .replace(/RIGHT\s*\|/g, '\\right|') // 절댓값 닫기 보정
            .replace(/circ/g, '\\circ'); // 합성함수 기호 확정

        return latex.trim();
    } catch (error) {
        console.error("[HWP-V27-Parser Error]:", error);
        return script;
    }
}
