/**
 * Squeezing a Lua script down to fit the game's character limit.
 *
 * This is a lexer, not a parser. It drops comments, emits the remaining tokens
 * with a separator only where one is needed to keep them apart, and shortens
 * the names.
 *
 * Renaming without a parser is safe because it is *bijective and global*: every
 * occurrence of a name becomes the same new name, so whatever the original
 * scoping was — shadowing, locals in different functions sharing a name — it
 * survives untouched. What must be left alone is everything that is not a
 * variable: reserved words, the standard library and the game's API, the
 * callbacks the game calls by name, field names after a dot or colon, and the
 * keys of a table constructor. A script that could reach a name as a string,
 * through `_G` or `load`, is not renamed at all.
 *
 * A script that does not tokenize (an unterminated string, say) is returned
 * unchanged with the reason, rather than being mangled.
 */

type TokenKind = 'name' | 'number' | 'string' | 'symbol'

interface Token {
  readonly kind: TokenKind
  text: string
  /** Whether a line break preceded this token in the original. */
  readonly newlineBefore: boolean
  /** True for a name that is a key rather than a variable, so must not change. */
  readonly fixed?: boolean
}

export interface MinifyResult {
  readonly code: string
  readonly before: number
  readonly after: number
  /** How many names were shortened. */
  readonly renamed: number
  /** Why renaming was held back, when it was. */
  readonly note: string | null
  readonly error: string | null
}

/** Words Lua reserves, which are never names. */
const RESERVED = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
])

/** The standard library, the game's API, and the callbacks the game calls. */
const PROTECTED = new Set([
  // standard library
  'assert',
  'collectgarbage',
  'dofile',
  'error',
  'getmetatable',
  'ipairs',
  'load',
  'loadstring',
  'next',
  'pairs',
  'pcall',
  'print',
  'rawequal',
  'rawget',
  'rawlen',
  'rawset',
  'require',
  'select',
  'setmetatable',
  'tonumber',
  'tostring',
  'type',
  'unpack',
  'xpcall',
  'bit32',
  'coroutine',
  'debug',
  'io',
  'math',
  'os',
  'string',
  'table',
  'utf8',
  '_G',
  '_ENV',
  '_VERSION',
  // the game's API
  'input',
  'output',
  'property',
  'screen',
  'map',
  'async',
  'httpReply',
  // what the game calls
  'onTick',
  'onDraw',
  'httpReply',
])

/** Names that let a script reach a variable as a string, which renaming breaks. */
const REFLECTIVE = ['_G', '_ENV', 'load', 'loadstring', 'getfenv', 'setfenv', 'require']

const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Short names in order, skipping any that mean something already. */
function* shortNames(): Generator<string> {
  const lengths = [1, 2, 3]
  for (const length of lengths) {
    const indices = Array.from({ length }, () => 0)
    for (;;) {
      const name = indices.map((i) => NAME_CHARACTERS[i]).join('')
      if (!RESERVED.has(name) && !PROTECTED.has(name)) yield name
      let position = length - 1
      while (position >= 0) {
        indices[position] = (indices[position] as number) + 1
        if ((indices[position] as number) < NAME_CHARACTERS.length) break
        indices[position] = 0
        position--
      }
      if (position < 0) break
    }
  }
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
  /** Which brackets are open, so a name inside `{ }` can be seen as a key. */
  const brackets: string[] = []
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

    /** Marks a token as a key rather than a variable. */
    const markFixed = (fromEnd = 0) => {
      const index = tokens.length - 1 - fromEnd
      const token = tokens[index]
      if (token) tokens[index] = { ...token, fixed: true }
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
      const previous = tokens[tokens.length - 1]
      // A name straight after a dot or a colon is a field, not a variable
      const isField =
        previous?.kind === 'symbol' && (previous.text === '.' || previous.text === ':')
      push('name', source.slice(start, i))
      if (isField) markFixed()
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

    // `{ name = ... }` is a table key, which is a string and not a variable
    if (symbol === '=' && brackets[brackets.length - 1] === '{') {
      const previous = tokens[tokens.length - 1]
      const before = tokens[tokens.length - 2]
      const opensTheEntry =
        before === undefined || (before.kind === 'symbol' && '{,;'.includes(before.text))
      if (previous?.kind === 'name' && opensTheEntry) markFixed()
    }
    if ('([{'.includes(symbol)) brackets.push(symbol)
    if (')]}'.includes(symbol)) brackets.pop()

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

/**
 * Gives every name that is really a variable a short one. Returns how many were
 * changed, and why none were when that is the case.
 */
function rename(tokens: Token[]): { renamed: number; note: string | null } {
  const reachedAsStrings = tokens.find(
    (t) => t.kind === 'name' && !t.fixed && REFLECTIVE.includes(t.text),
  )
  if (reachedAsStrings) {
    return {
      renamed: 0,
      note: `names left alone: the script uses ${reachedAsStrings.text}, which can reach them as strings`,
    }
  }

  const renameable = (token: Token) =>
    token.kind === 'name' &&
    token.fixed !== true &&
    !RESERVED.has(token.text) &&
    !PROTECTED.has(token.text)

  // Shortest names to whatever is used most, so the commonest name costs least.
  // Ties go to whichever appeared first, which keeps the result predictable.
  const uses = new Map<string, { count: number; first: number }>()
  tokens.forEach((token, index) => {
    if (!renameable(token)) return
    const seen = uses.get(token.text)
    if (seen) seen.count++
    else uses.set(token.text, { count: 1, first: index })
  })
  const order = [...uses.entries()].sort(([, a], [, b]) => b.count - a.count || a.first - b.first)

  // Every renameable name takes a fresh one from the pool. Keeping a name that
  // was already short would be tempting, but the pool would then be free to
  // hand that same name to something else — two variables, one name.
  const names = shortNames()
  const mapping = new Map<string, string>()
  for (const [name] of order) {
    const next = names.next()
    if (next.done === true) break
    mapping.set(name, next.value)
  }

  for (const token of tokens) {
    if (!renameable(token)) continue
    const replacement = mapping.get(token.text)
    if (replacement !== undefined) token.text = replacement
  }
  return { renamed: [...mapping].filter(([from, to]) => from !== to).length, note: null }
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
      renamed: 0,
      note: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const { renamed, note } = rename(tokens)

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

  return { code: out, before, after: out.length, renamed, note, error: null }
}
