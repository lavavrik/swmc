/**
 * Squeezing a Lua script down to fit the game's character limit.
 *
 * This is a lexer, not a parser: it drops comments and emits the remaining
 * tokens with a separator only where one is needed to keep them apart. That is
 * enough for the bulk of the saving and cannot change what the script does —
 * unlike renaming locals, which is deliberately not attempted.
 *
 * A script that does not tokenize (an unterminated string, say) is returned
 * unchanged with the reason, rather than being mangled.
 */

type TokenKind = 'name' | 'number' | 'string' | 'symbol'

interface Token {
  readonly kind: TokenKind
  readonly text: string
  /** Whether a line break preceded this token in the original. */
  readonly newlineBefore: boolean
}

export interface MinifyResult {
  readonly code: string
  readonly before: number
  readonly after: number
  readonly error: string | null
}

const NAME_START = /[A-Za-z_]/
const NAME_PART = /[A-Za-z0-9_]/
const DIGIT = /[0-9]/

/** Multi-character operators, longest first so the lexer matches greedily. */
const SYMBOLS = [
  '...',
  '..',
  '==',
  '~=',
  '<=',
  '>=',
  '//',
  '<<',
  '>>',
  '::',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '#',
  '&',
  '~',
  '|',
  '<',
  '>',
  '=',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  ';',
  ':',
  ',',
  '.',
]

class LexError extends Error {}

/** Matches `[==[` … `]==]`, used by long strings and long comments. */
function readLongBracket(source: string, at: number): { end: number; text: string } | null {
  if (source[at] !== '[') return null
  let level = 0
  let i = at + 1
  while (source[i] === '=') {
    level++
    i++
  }
  if (source[i] !== '[') return null
  const closing = `]${'='.repeat(level)}]`
  const close = source.indexOf(closing, i + 1)
  if (close === -1) throw new LexError('unterminated long bracket')
  return { end: close + closing.length, text: source.slice(at, close + closing.length) }
}

function readQuoted(source: string, at: number): { end: number; text: string } {
  const quote = source[at]
  let i = at + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) return { end: i + 1, text: source.slice(at, i + 1) }
    if (ch === '\n') break
    i++
  }
  throw new LexError('unterminated string')
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let newline = false

  while (i < source.length) {
    const ch = source[i] as string

    if (ch === '\n') {
      newline = true
      i++
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }

    // Comments, long or to end of line
    if (source.startsWith('--', i)) {
      const long = readLongBracket(source, i + 2)
      if (long) {
        i = long.end
      } else {
        const end = source.indexOf('\n', i)
        i = end === -1 ? source.length : end
      }
      continue
    }

    const push = (kind: TokenKind, text: string) => {
      tokens.push({ kind, text, newlineBefore: newline })
      newline = false
    }

    if (ch === '"' || ch === "'") {
      const quoted = readQuoted(source, i)
      push('string', quoted.text)
      i = quoted.end
      continue
    }

    const long = ch === '[' ? readLongBracket(source, i) : null
    if (long) {
      push('string', long.text)
      i = long.end
      continue
    }

    if (NAME_START.test(ch)) {
      const start = i
      while (i < source.length && NAME_PART.test(source[i] as string)) i++
      push('name', source.slice(start, i))
      continue
    }

    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(source[i + 1] ?? ''))) {
      const start = i
      // Covers 0x1f, 1e-3 and 1.5 alike
      while (i < source.length && /[0-9a-fA-FxX.]/.test(source[i] as string)) {
        if (/[eEpP]/.test(source[i] as string) && /[+-]/.test(source[i + 1] ?? '')) i++
        i++
      }
      push('number', source.slice(start, i))
      continue
    }

    const symbol = SYMBOLS.find((s) => source.startsWith(s, i))
    if (!symbol) throw new LexError(`unexpected character '${ch}'`)
    push('symbol', symbol)
    i += symbol.length
    continue
  }

  return tokens
}

const isWord = (token: Token) => token.kind === 'name' || token.kind === 'number'

/** Whether two adjacent tokens would be read as one without something between them. */
function needsSpace(left: Token, right: Token): boolean {
  if (isWord(left) && isWord(right)) return true
  // A long string opening right after a name would look like an index
  if (isWord(left) && right.kind === 'string' && right.text.startsWith('[')) return true
  if (left.kind !== 'symbol' || right.kind !== 'symbol') return false
  // Any pair that would form a longer operator — `- -` becoming a comment being
  // the dangerous one — has to stay apart
  const joined = left.text + right.text
  return SYMBOLS.some((s) => s.length > 1 && joined.startsWith(s)) || joined.startsWith('--')
}

export function minifyLua(source: string): MinifyResult {
  const before = source.length
  let tokens: Token[]
  try {
    tokens = tokenize(source)
  } catch (error) {
    return {
      code: source,
      before,
      after: before,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  let out = ''
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1]
    if (previous) {
      // `a = b` followed by a line starting with `(` is two statements; joining
      // them would turn it into a call, so that line break is load-bearing
      if (token.newlineBefore && token.text === '(') out += '\n'
      else if (needsSpace(previous, token)) out += ' '
    }
    out += token.text
  })

  return { code: out, before, after: out.length, error: null }
}
