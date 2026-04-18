import re
from enum import Enum, auto
import json
import os

class TokenType(Enum):
    CMD = auto()
    CHAR = auto()
    LBRACE = auto()
    RBRACE = auto()
    LBRACKET = auto()
    RBRACKET = auto()
    CARET = auto()
    UNDERSCORE = auto()
    AMP = auto()
    DOUBLE_BACKSLASH = auto()
    SPACE = auto()
    EOF = auto()

class Token:
    def __init__(self, typ, val=None):
        self.type = typ
        self.value = val
    def __repr__(self):
        return f"Tok({self.type.name}, {repr(self.value)})"

# --- AST Nodes ---
class Node: pass
class RootNode(Node):
    def __init__(self, children): self.children = children
class CommandNode(Node):
    def __init__(self, cmd): self.cmd = cmd
class CharNode(Node):
    def __init__(self, char): self.char = char
class GroupNode(Node):
    def __init__(self, children): self.children = children
class FracNode(Node):
    def __init__(self, num, den): self.num = num; self.den = den
class SqrtNode(Node):
    def __init__(self, degree, content): self.degree = degree; self.content = content
class SupSubNode(Node):
    def __init__(self, base, sup=None, sub=None): self.base = base; self.sup = sup; self.sub = sub
class EnvNode(Node):
    def __init__(self, env, matrix_rows): self.env = env; self.matrix_rows = matrix_rows
class OverlineNode(Node):
    def __init__(self, content): self.content = content
class DecoratorNode(Node):
    def __init__(self, cmd, content): self.cmd = cmd; self.content = content
class ScriptTarget(Node):
    def __init__(self, script_type, arg): self.type = script_type; self.arg = arg

# --- Lexer ---
class Lexer:
    def __init__(self, text):
        self.text = text
        self.pos = 0
    
    def tokenize(self):
        tokens = []
        while self.pos < len(self.text):
            c = self.text[self.pos]
            if c == '\\':
                if self.pos + 1 < len(self.text) and self.text[self.pos+1] == '\\':
                    tokens.append(Token(TokenType.DOUBLE_BACKSLASH))
                    self.pos += 2
                else:
                    match = re.match(r'^\\([a-zA-Z]+)', self.text[self.pos:])
                    if match:
                        tokens.append(Token(TokenType.CMD, match.group(1)))
                        self.pos += len(match.group(0))
                    else:
                        nxt = self.text[self.pos+1] if self.pos+1 < len(self.text) else ''
                        if nxt in ['{','}','_','^','%','$','#','&', '(', ')', '[', ']']:
                            tokens.append(Token(TokenType.CHAR, nxt))
                            self.pos += 2
                        elif nxt in [' ', ',', ';', '!']: 
                            tokens.append(Token(TokenType.SPACE))
                            self.pos += 2
                        else:
                            tokens.append(Token(TokenType.CHAR, '\\' + nxt))
                            self.pos += 2
            elif c == '{': tokens.append(Token(TokenType.LBRACE)); self.pos += 1
            elif c == '}': tokens.append(Token(TokenType.RBRACE)); self.pos += 1
            elif c == '[': tokens.append(Token(TokenType.LBRACKET)); self.pos += 1
            elif c == ']': tokens.append(Token(TokenType.RBRACKET)); self.pos += 1
            elif c == '^': tokens.append(Token(TokenType.CARET)); self.pos += 1
            elif c == '_': tokens.append(Token(TokenType.UNDERSCORE)); self.pos += 1
            elif c == '&': tokens.append(Token(TokenType.AMP)); self.pos += 1
            elif re.match(r'\s', c): self.pos += 1 
            else: tokens.append(Token(TokenType.CHAR, c)); self.pos += 1
        
        tokens.append(Token(TokenType.EOF))
        return tokens

# --- Parser ---
class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self): return self.tokens[self.pos]
    def consume(self):
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def parse(self):
        nodes = self.parse_sequence()
        return RootNode(nodes)

    def parse_sequence(self, stop_types=None):
        if stop_types is None: stop_types = []
        nodes = []
        while self.peek().type != TokenType.EOF and self.peek().type not in stop_types:
            node = self.parse_single_node()
            if node:
                nodes.append(node)
        return self.group_scripts(nodes)

    def parse_arg_text(self):
        if self.peek().type == TokenType.LBRACE:
            self.consume()
            txt = ""
            while self.peek().type not in (TokenType.RBRACE, TokenType.EOF):
                t = self.consume()
                if t.value: txt += t.value
            if self.peek().type == TokenType.RBRACE: self.consume()
            return txt
        return ""

    def parse_arg(self):
        if self.peek().type == TokenType.LBRACE:
            self.consume()
            seq = self.parse_sequence([TokenType.RBRACE])
            if self.peek().type == TokenType.RBRACE: self.consume()
            return GroupNode(seq)
        else:
            return self.parse_single_node(skip_scripts=True)

    def parse_single_node(self, skip_scripts=False):
        tok = self.peek()
        if tok.type == TokenType.CMD:
            cmd = self.consume().value
            if cmd == 'frac':
                return FracNode(self.parse_arg(), self.parse_arg())
            elif cmd == 'sqrt':
                degree = None
                if self.peek().type == TokenType.LBRACKET:
                    self.consume()
                    degree_nodes = self.parse_sequence([TokenType.RBRACKET])
                    if self.peek().type == TokenType.RBRACKET: self.consume()
                    degree = GroupNode(degree_nodes)
                return SqrtNode(degree, self.parse_arg())
            elif cmd == 'overline':
                return OverlineNode(self.parse_arg())
            elif cmd in ('hat', 'bar', 'vec', 'tilde', 'dot', 'ddot'):
                return DecoratorNode(cmd, self.parse_arg())
            elif cmd == 'left':
                return CommandNode('LEFT ' + self.consume().value)
            elif cmd == 'right':
                return CommandNode('RIGHT ' + self.consume().value)
            elif cmd == 'begin':
                env = self.parse_arg_text()
                rows = []
                cols = []
                curr = []
                while self.peek().type != TokenType.EOF:
                    if self.peek().type == TokenType.CMD and self.peek().value == 'end':
                        self.consume()
                        self.parse_arg_text()
                        break
                    elif self.peek().type == TokenType.AMP:
                        self.consume()
                        cols.append(self.group_scripts(curr))
                        curr = []
                    elif self.peek().type == TokenType.DOUBLE_BACKSLASH:
                        self.consume()
                        cols.append(self.group_scripts(curr))
                        rows.append(cols)
                        cols = []
                        curr = []
                    else:
                        n = self.parse_single_node()
                        if n: curr.append(n)
                if curr or cols:
                    cols.append(self.group_scripts(curr))
                    rows.append(cols)
                return EnvNode(env, rows)
            else:
                return CommandNode(cmd)
                
        elif tok.type == TokenType.LBRACE:
            self.consume()
            seq = self.parse_sequence([TokenType.RBRACE])
            if self.peek().type == TokenType.RBRACE: self.consume()
            return GroupNode(seq)
            
        elif tok.type in (TokenType.CARET, TokenType.UNDERSCORE):
            if skip_scripts: return None 
            t = self.consume()
            arg = self.parse_arg()
            return ScriptTarget(t.type, arg)
            
        elif tok.type == TokenType.CHAR:
            return CharNode(self.consume().value)
            
        else: # SPACE, AMP, DOUBLE_BACKSLASH 
            self.consume()
            return None

    def group_scripts(self, items):
        out = []
        for item in items:
            if isinstance(item, ScriptTarget):
                if out:
                    prev = out.pop()
                    if isinstance(prev, SupSubNode):
                        if item.type == TokenType.CARET: prev.sup = item.arg
                        else: prev.sub = item.arg
                        out.append(prev)
                    else:
                        out.append(SupSubNode(base=prev, 
                                              sup=item.arg if item.type == TokenType.CARET else None,
                                              sub=item.arg if item.type == TokenType.UNDERSCORE else None))
                else:
                    out.append(SupSubNode(base=None, 
                                          sup=item.arg if item.type == TokenType.CARET else None,
                                          sub=item.arg if item.type == TokenType.UNDERSCORE else None))
            else:
                out.append(item)
        return out

# --- Emitter ---
class HWPEmitter:
    def __init__(self):
        self.dict_path = os.path.join(os.path.dirname(__file__), "gemini_hwp_dict.json")
        self.cmd_map = {}
        try:
            with open(self.dict_path, "r", encoding="utf-8") as f:
                self.cmd_map = json.load(f)
        except:
            pass

    def _wrap(self, s):
        s = str(s).strip()
        if not s: return "{}"
        if s.startswith('{') and s.endswith('}'):
            d = 0
            ok = True
            for i, c in enumerate(s):
                if c == '{': d += 1
                elif c == '}':
                    d -= 1
                    if d == 0 and i != len(s)-1:
                        ok = False
                        break
            if ok: return s
        return f"{{{s}}}"

    def emit(self, node):
        if not node: return ""
        
        if isinstance(node, RootNode):
            return " ".join(self.emit(n) for n in node.children)
            
        elif isinstance(node, GroupNode):
            inner = " ".join(self.emit(n) for n in node.children)
            if inner: return f"{{{inner}}}"
            return ""
            
        elif isinstance(node, FracNode):
            num = self.emit(node.num)
            den = self.emit(node.den)
            return f"{self._wrap(num)} over {self._wrap(den)} "
            
        elif isinstance(node, SqrtNode):
            content = self.emit(node.content)
            if node.degree:
                degree = self.emit(node.degree)
                return f"root {self._wrap(degree)} of {self._wrap(content)} "
            return f"sqrt {self._wrap(content)} "
            
        elif isinstance(node, OverlineNode):
            def is_pure_upper(n):
                if isinstance(n, list): return all(is_pure_upper(c) for c in n if c)
                if isinstance(n, CharNode): return n.char.isalpha() and n.char.isupper()
                if isinstance(n, GroupNode): return is_pure_upper(n.children)
                if isinstance(n, CommandNode) and n.cmd in ('rm', 'mathrm', 'text', 'mathbf', 'mathit'): return True
                return False
            def get_upper(n):
                if isinstance(n, list):
                    for c in n:
                        if c: yield from get_upper(c)
                elif isinstance(n, CharNode): yield n.char
                elif isinstance(n, GroupNode): yield from get_upper(n.children)
            
            if is_pure_upper(node.content):
                letters_list = list(get_upper(node.content))
                if len(letters_list) >= 2:
                    letters = " ".join(letters_list)
                    return f"bar {{ rm {{{letters}}} }} "
            return f"overline {self._wrap(self.emit(node.content))} "
            
        elif isinstance(node, DecoratorNode):
            return f"{node.cmd} {self._wrap(self.emit(node.content))} "
            
        elif isinstance(node, EnvNode):
            if node.env == 'cases':
                body = " # ".join(" & ".join(" ".join(self.emit(n) for n in col) for col in row) for row in node.matrix_rows)
                return f"cases {{ {body} }} "
            elif 'matrix' in node.env or node.env == 'array':
                body = " # ".join(" & ".join(" ".join(self.emit(n) for n in col) for col in row) for row in node.matrix_rows)
                
                if node.env == 'pmatrix': return f"pmatrix {{ {body} }} "
                if node.env == 'bmatrix': return f"bmatrix {{ {body} }} "
                if node.env == 'vmatrix': return f"vmatrix {{ {body} }} "
                return f"matrix {{ {body} }} "
            return ""
            
        elif isinstance(node, SupSubNode):
            base = self.emit(node.base) if node.base else ""
            res = base
            if isinstance(node.base, (SqrtNode, OverlineNode)):
                res = res.strip() + " ` "
            if node.sub: res += f"_{self._wrap(self.emit(node.sub))}"
            if node.sup: res += f"^{self._wrap(self.emit(node.sup))}"
            return res
            
        elif isinstance(node, CommandNode):
            if node.cmd.startswith('LEFT '):
                c = node.cmd.replace('LEFT ', '')
                if c == '{': return 'LEFT lbrace '
                return f"LEFT {c} "
            if node.cmd.startswith('RIGHT '):
                c = node.cmd.replace('RIGHT ', '')
                if c == '}': return 'RIGHT rbrace '
                return f"RIGHT {c} "
                
            cmd_exact = "\\" + node.cmd
            if cmd_exact in self.cmd_map:
                return f" {self.cmd_map[cmd_exact]} "
            
            # common hardcoded
            if node.cmd in ('alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'omega',
                            'Alpha', 'Beta', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Omega'):
                return f" {node.cmd} "
            if node.cmd in ('times', 'div', 'cdot'): return f" {'TIMES' if node.cmd=='times' else ('DIV' if node.cmd=='div' else 'cdot')} "
            if node.cmd == 'infty': return ' inf '
            if node.cmd == 'le' or node.cmd == 'leq': return ' <= '
            if node.cmd == 'ge' or node.cmd == 'geq': return ' >= '
            if node.cmd == 'ne' or node.cmd == 'neq': return ' != '
            if node.cmd in ('to', 'rightarrow'): return ' -> '
            if node.cmd == 'sum': return 'sum '
            if node.cmd == 'prod': return 'prod '
            if node.cmd == 'int': return 'int '
            if node.cmd in ('ldots', 'cdots', 'dots'): return '... '
            if node.cmd in ('sin', 'cos', 'tan', 'ln', 'log', 'lim', 'det', 'max', 'min'): return f" {node.cmd} "
            
            return f" {node.cmd} "
            
        elif isinstance(node, CharNode):
            if node.char in '()[]+-=,<>.|/': return f" {node.char} "
            return node.char
            
        return ""

def compile_latex_to_hwp(latex_str):
    try:
        lexer = Lexer(latex_str)
        tokens = lexer.tokenize()
        parser = Parser(tokens)
        ast = parser.parse()
        emitter = HWPEmitter()
        
        res = emitter.emit(ast)
        res = re.sub(r'\s+', ' ', res).strip()
        res = re.sub(r'overline \{(.*?)\}\^\{(.*?)\}', r'{overline {\1}}^{\2}', res)
        return res
    except Exception as e:
        print(f"Compiler Error on {latex_str}: {e}")
        return latex_str
