
/**
 * HWP Equation to LaTeX Converter
 * 
 * Maps HWP equation script syntax (similar to EQN) to LaTeX.
 * Based on common HWP control codes:
 * - ROOT {a} {b} -> \sqrt[a]{b} (or \sqrt{b} if a is absent)
 * - frac {a} {b} -> \frac{a}{b}
 * - ^, _ -> ^, _
 * - rm, it, bold -> \mathrm, \mathit, \mathbf
 */

export function convertHwpEqToLatex(hwpScript: string): string {
    if (!hwpScript) return "";

    let latex = hwpScript;

    // 1. Basic preprocessing
    latex = latex.replace(/`/g, ' '); // HWP uses backticks for spaces sometimes? Or just remove them.

    // 2. Common Keywords Case-Insensitive Normalization (simplistic)
    // We'll iterate common patterns. HWP is often case-insensitive for keywords.

    // FRAC {a} over {b} or {a} over {b} ? HWP usually uses "a over b" or "frac{a}{b}"
    // Standard HWP: "y = frac {1} {2} x"

    // Replace "frac" -> "\frac"
    // Regex for keywords followed by braces or spaces
    latex = latex.replace(/(\b)frac(\b)/gi, "\\frac");
    latex = latex.replace(/(\b)sqrt(\b)/gi, "\\sqrt");
    latex = latex.replace(/(\b)root(\b)/gi, "\\sqrt"); // HWP 'root' is sqrt

    // 3. Handle ROOT {n} {x} -> \sqrt[n]{x}
    // This is tricky with Regex. For now, assume simple \sqrt mapping or use a parser if needed.
    // HWP: "root {3} {x}" -> Cube root. LaTeX: "\sqrt[3]{x}"
    // This requires re-ordering.

    // 4. Handle Sub/Sup
    // HWP: "x^2", "x_1" -> LaTeX compatible usually.

    // 5. Handle "times", "div", "pm"
    latex = latex.replace(/(\b)times(\b)/gi, "\\times"); // x
    latex = latex.replace(/(\b)div(\b)/gi, "\\div"); // ÷
    latex = latex.replace(/(\b)pm(\b)/gi, "\\pm"); // ±
    latex = latex.replace(/(\b)ge(\b)/gi, "\\ge"); // ≥
    latex = latex.replace(/(\b)le(\b)/gi, "\\le"); // ≤
    latex = latex.replace(/(\b)ne(\b)/gi, "\\ne"); // ≠
    latex = latex.replace(/(\b)approx(\b)/gi, "\\approx"); // ≈

    // 6. Font Styles
    // rm a -> \mathrm{a} ? HWP strictly uses braces? "rm {abc}"
    latex = latex.replace(/(\b)rm\s*{([^}]+)}/gi, "\\mathrm{$2}");
    latex = latex.replace(/(\b)it\s*{([^}]+)}/gi, "\\mathit{$2}");
    latex = latex.replace(/(\b)bold\s*{([^}]+)}/gi, "\\mathbf{$2}");

    // 7. Greek Letters
    // alpha, beta, gamma... usually match LaTeX but might need slash.
    const greek = [
        "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa",
        "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
        "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa",
        "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
    ];

    greek.forEach(g => {
        // Replace "alpha" with "\alpha" ensuring word boundary and not already escaped
        const re = new RegExp(`(?<!\\\\)\\b${g}\\b`, 'g');
        latex = latex.replace(re, `\\${g}`);
    });

    // 8. Special Corrections
    // HWP uses "LEFT {", "RIGHT }" for dynamic delimiters. LaTeX: "\left\{", "\right\}"
    latex = latex.replace(/left\s*([(){}[\]|])/gi, "\\left$1");
    latex = latex.replace(/right\s*([(){}[\]|])/gi, "\\right$1");

    // 9. Clean up
    // Remove unnecessary braces if any? No, keep them.

    return latex;
}
