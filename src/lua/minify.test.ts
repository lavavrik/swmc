import { describe, expect, it } from 'vitest'
import { minifyLua } from './minify'

const minify = (source: string) => minifyLua(source).code

describe('minifyLua', () => {
  it('strips line comments', () => {
    expect(minify('-- a note\nx = 1 -- trailing\n')).toBe('a=1')
  })

  it('strips block comments, including long ones', () => {
    expect(minify('--[[ several\nlines ]] x = 1')).toBe('a=1')
    expect(minify('--[==[ nested ]] still ]==] x = 1')).toBe('a=1')
  })

  it('drops spaces around operators and punctuation', () => {
    expect(minify('local a = 1 + 2 * ( 3 - 4 )')).toBe('local a=1+2*(3-4)')
  })

  it('keeps a space between two words that would otherwise merge', () => {
    expect(minify('local  x')).toBe('local a')
    expect(minify('if a then return b end')).toBe('if a then return b end')
  })

  it('keeps a space where two operators would form a different one', () => {
    // `- -1` must not become `--1`, which would be a comment
    expect(minify('x = 1 - -1')).toBe('a=1- -1')
    expect(minify('x = alpha .. beta')).toBe('a=b..c')
  })

  it('leaves strings untouched', () => {
    expect(minify('x = "a  b -- c"')).toBe('a="a  b -- c"')
    expect(minify("x = 'it\\'s'")).toBe("a='it\\'s'")
    expect(minify('x = [[ raw  -- text ]]')).toBe('a=[[ raw  -- text ]]')
  })

  it('keeps the newline before a line that opens with a bracket', () => {
    // Joining these would turn two statements into one call
    const source = 'local a = b\n(f or g)(1)'
    expect(minify(source)).toBe('local a=b\n(c or d)(1)')
  })

  it('handles a realistic script', () => {
    const source = `
-- clamp the throttle
function onTick()
  local raw = input.getNumber(1)   -- 0..1
  local limit = property.getNumber("limit")
  output.setNumber(1, math.min(raw, limit))
end
`
    expect(minify(source)).toBe(
      'function onTick()local a=input.getNumber(1)local b=property.getNumber("limit")' +
        'output.setNumber(1,math.min(a,b))end',
    )
  })

  it('reports how much it saved', () => {
    const result = minifyLua('-- a comment\nx = 1\n')
    expect(result.before).toBe(19)
    expect(result.after).toBe(3)
  })

  it('leaves a script it cannot tokenize alone', () => {
    const broken = 'x = "unterminated'
    const result = minifyLua(broken)
    expect(result.code).toBe(broken)
    expect(result.error).not.toBeNull()
  })

  it('is stable when run twice', () => {
    const once = minify('function f() return 1 end')
    expect(minify(once)).toBe(once)
  })
})

describe('renaming', () => {
  it('shortens locals and globals, consistently', () => {
    // Statements need no separator, so the line break goes with everything else
    expect(minify('local counter = 1\ncounter = counter + total')).toBe('local a=1 a=a+b')
  })

  it('leaves fields and methods alone, since they are keys and not variables', () => {
    expect(minify('local point = value.someField')).toBe('local a=b.someField')
    expect(minify('thing:someMethod(other)')).toBe('a:someMethod(b)')
  })

  it('takes a fresh name even for one already short, so none can collide', () => {
    // Keeping `v` would leave the pool free to hand `v` to something else
    expect(minify('local v = math.floor(x)')).toBe('local a=math.floor(b)')
  })

  it('leaves the keys of a table alone, but not the values', () => {
    expect(minify('local t = { alpha = beta, [gamma] = delta }')).toBe('local a={alpha=b,[c]=d}')
  })

  it('keeps the keys of a table split by semicolons', () => {
    expect(minify('local t = { alpha = 1; beta = 2 }')).toBe('local a={alpha=1;beta=2}')
  })

  it('renames variables assigned inside a function held in a table', () => {
    // Inside the function body, `; x =` and `, x =` are statements, not entries
    expect(minify('local x=0 local t={f=function() y=1; x=2 end}')).toBe(
      'local a=0 local b={f=function()c=1;a=2 end}',
    )
    expect(minify('local x,y=0,0 local t={f=function() x,y=1,2 end}')).toBe(
      'local a,b=0,0 local c={f=function()a,b=1,2 end}',
    )
    expect(minify('local x=0 local t={f=function() if true then x=1 end end}')).toBe(
      'local a=0 local b={f=function()if true then a=1 end end}',
    )
  })

  it('renames inside every kind of block nested in a table', () => {
    const source =
      'local x,y=0,0 local t={f=function() do y=1; x=2 end while true do y=1; x=2 end ' +
      'for i=1,2 do y=1; x=2 end repeat y=1; x=2 until true ' +
      'if a then y=1 elseif b then y=1; x=2 else y=1; x=2 end end, k=1}'
    const result = minify(source)
    expect(result).not.toMatch(/\bx\b|\by\b/)
    // the table key after the function is still a key
    expect(result).toMatch(/,k=1}$/)
  })

  it('still sees the keys of a table built inside a function in a table', () => {
    expect(minify('local t={f=function() local u={alpha=1; beta=2} end}')).toBe(
      'local a={f=function()local b={alpha=1;beta=2}end}',
    )
  })

  it('never touches reserved words, the standard library or the game’s API', () => {
    const source =
      'function onTick() local reading = math.floor(input.getNumber(1)) output.setNumber(1, reading) end'
    const result = minify(source)
    expect(result).toContain('function onTick()')
    expect(result).toContain('math.floor')
    expect(result).toContain('input.getNumber')
    expect(result).toContain('output.setNumber')
    expect(result).toContain('local a=')
  })

  it('keeps a goto and its label in step', () => {
    const result = minify('for i=1,3 do goto skip end\n::skip::')
    expect(result).toContain('goto a')
    expect(result).toContain('::a::')
  })

  it('renames the same name in different scopes to the same thing, which is safe', () => {
    // Two unrelated locals sharing a name stay unrelated once renamed
    const result = minify(
      'function first() local value = 1 return value end\n' +
        'function second() local value = 2 return value end',
    )
    expect(result).toBe('function b()local a=1 return a end function c()local a=2 return a end')
  })

  it('refuses to rename when names could be reached as strings', () => {
    for (const escape of ['_G.total = 1', 'local f = load("x")', 'print(_ENV)']) {
      const result = minifyLua(`local total = 2\n${escape}`)
      expect(result.renamed, escape).toBe(0)
      expect(result.note, escape).toMatch(/_G|_ENV|load/)
      // still minified, just not renamed
      expect(result.code).toContain('total')
    }
  })

  it('reports how many names it shortened', () => {
    const result = minifyLua('local alpha = 1\nlocal beta = alpha')
    expect(result.renamed).toBe(2)
  })

  it('gives the shortest names to whatever is used most', () => {
    expect(minify('rare = 1 common = common + common + rare')).toBe('b=1 a=a+a+b')
  })

  it('does not hand out a name the script needs for something else', () => {
    // `os` and `io` are library names; a rename must not land on them
    const many = Array.from({ length: 80 }, (_, i) => `local name${i} = ${i}`).join('\n')
    const result = minify(`${many}\nprint(os.time(), io)`)
    expect(result).toContain('os.time()')
    expect(/\blocal os=/.test(result)).toBe(false)
    expect(/\blocal io=/.test(result)).toBe(false)
  })
})
