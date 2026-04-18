from latex_hwp_compiler import compile_latex_to_hwp, Lexer, Parser
text = r"\begin{cases} x & (x < 0) \\ y & (x \ge 0) \end{cases}"
lexer = Lexer(text)
tokens = lexer.tokenize()
print("TOKENS:")
for t in tokens:
    print(" ", t.type, t.value)

parser = Parser(tokens)
ast = parser.parse()
print("AST ROWS:", ast.nodes[0].matrix_rows if hasattr(ast.nodes[0], 'matrix_rows') else "No rows")
