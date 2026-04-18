from latex_hwp_compiler import Lexer, TokenType
text = r"x \\ y \\\\ z"
lexer = Lexer(text)
tokens = lexer.tokenize()
for t in tokens:
    print(t.type, t.value)
