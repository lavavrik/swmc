/**
 * The expression language used by the game's function components
 * (`x*y+z`, `clamp(x,0,1)`, and so on).
 *
 * A small recursive-descent parser rather than anything dynamic: `eval` and
 * `new Function` are off the table because scripts and saved files are
 * untrusted input. Parsing is done once and cached; evaluation is a walk over
 * the resulting tree.
 */

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '-' | '!'; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }

export interface CompiledExpression {
  /** Evaluates with the given variables; returns 0 for anything non-finite. */
  (vars: Record<string, number>): number
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  clamp: (v = 0, lo = 0, hi = 0) => Math.min(Math.max(v, lo), hi),
}

type Token = { type: 'num'; value: number } | { type: 'name'; value: string } | { type: 'op'; value: string }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
    } else if (/[0-9.]/.test(ch)) {
      const start = i
      while (i < src.length && /[0-9.]/.test(src[i]!)) i++
      const value = Number(src.slice(start, i))
      if (!Number.isFinite(value)) throw new Error(`bad number at ${start}`)
      tokens.push({ type: 'num', value })
    } else if (/[a-zA-Z_]/.test(ch)) {
      const start = i
      while (i < src.length && /[a-zA-Z_0-9]/.test(src[i]!)) i++
      tokens.push({ type: 'name', value: src.slice(start, i).toLowerCase() })
    } else {
      const two = src.slice(i, i + 2)
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        tokens.push({ type: 'op', value: two })
        i += 2
      } else if ('+-*/%^(),<>!&|'.includes(ch)) {
        tokens.push({ type: 'op', value: ch })
        i++
      } else {
        throw new Error(`unexpected character '${ch}' at ${i}`)
      }
    }
  }
  return tokens
}

/** Binary operator precedence, loosest first. */
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '|': 1,
  '&&': 2,
  '&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '^': 7,
}

function parse(tokens: Token[]): Node {
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const eat = (value: string): boolean => {
    const t = peek()
    if (t?.type === 'op' && t.value === value) {
      pos++
      return true
    }
    return false
  }

  function parseExpression(minPrec = 1): Node {
    let left = parseUnary()
    for (;;) {
      const t = peek()
      if (t?.type !== 'op') break
      const prec = PRECEDENCE[t.value]
      if (prec === undefined || prec < minPrec) break
      pos++
      // `^` is right-associative, like the game's exponentiation
      const right = parseExpression(t.value === '^' ? prec : prec + 1)
      left = { kind: 'binary', op: t.value, left, right }
    }
    return left
  }

  function parseUnary(): Node {
    if (eat('-')) return { kind: 'unary', op: '-', arg: parseUnary() }
    if (eat('!')) return { kind: 'unary', op: '!', arg: parseUnary() }
    if (eat('+')) return parseUnary()
    return parsePrimary()
  }

  function parsePrimary(): Node {
    const t = peek()
    if (!t) throw new Error('unexpected end of expression')
    if (t.type === 'num') {
      pos++
      return { kind: 'num', value: t.value }
    }
    if (t.type === 'name') {
      pos++
      if (eat('(')) {
        const args: Node[] = []
        if (!eat(')')) {
          do {
            args.push(parseExpression())
          } while (eat(','))
          if (!eat(')')) throw new Error('missing closing parenthesis')
        }
        return { kind: 'call', name: t.value, args }
      }
      return { kind: 'var', name: t.value }
    }
    if (t.value === '(') {
      pos++
      const inner = parseExpression()
      if (!eat(')')) throw new Error('missing closing parenthesis')
      return inner
    }
    throw new Error(`unexpected token '${t.value}'`)
  }

  const root = parseExpression()
  if (pos !== tokens.length) throw new Error('trailing input')
  return root
}

const bin = (op: string, a: number, b: number): number => {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? 0 : a / b
    case '%':
      return b === 0 ? 0 : a % b
    case '^':
      return a ** b
    case '==':
      return a === b ? 1 : 0
    case '!=':
      return a !== b ? 1 : 0
    case '<':
      return a < b ? 1 : 0
    case '<=':
      return a <= b ? 1 : 0
    case '>':
      return a > b ? 1 : 0
    case '>=':
      return a >= b ? 1 : 0
    case '&':
    case '&&':
      return a !== 0 && b !== 0 ? 1 : 0
    case '|':
    case '||':
      return a !== 0 || b !== 0 ? 1 : 0
    default:
      return 0
  }
}

function evaluate(node: Node, vars: Record<string, number>): number {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'var':
      return vars[node.name] ?? CONSTANTS[node.name] ?? 0
    case 'unary':
      return node.op === '-' ? -evaluate(node.arg, vars) : evaluate(node.arg, vars) === 0 ? 1 : 0
    case 'binary':
      return bin(node.op, evaluate(node.left, vars), evaluate(node.right, vars))
    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) return 0
      return fn(...node.args.map((a) => evaluate(a, vars)))
    }
  }
}

const cache = new Map<string, CompiledExpression | null>()

/**
 * Compiles an expression, returning null if it does not parse. Results are
 * cached because components re-evaluate the same expression every tick.
 */
export function compileExpression(source: string): CompiledExpression | null {
  const cached = cache.get(source)
  if (cached !== undefined) return cached
  let compiled: CompiledExpression | null = null
  try {
    const tree = parse(tokenize(source))
    compiled = (vars) => {
      const value = evaluate(tree, vars)
      return Number.isFinite(value) ? value : 0
    }
  } catch {
    compiled = null
  }
  cache.set(source, compiled)
  return compiled
}

/** Convenience for components: evaluates, or returns 0 if the source is invalid. */
export function evaluateExpression(source: string, vars: Record<string, number>): number {
  return compileExpression(source)?.(vars) ?? 0
}
