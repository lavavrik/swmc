import { describe, expect, it } from 'vitest'
import { minifyLua } from './minify'

const minify = (source: string) => minifyLua(source).code

describe('minifyLua', () => {
  it('strips line comments', () => {
    expect(minify('-- a note\nx = 1 -- trailing\n')).toBe('x=1')
  })

  it('strips block comments, including long ones', () => {
    expect(minify('--[[ several\nlines ]] x = 1')).toBe('x=1')
    expect(minify('--[==[ nested ]] still ]==] x = 1')).toBe('x=1')
  })

  it('drops spaces around operators and punctuation', () => {
    expect(minify('local a = 1 + 2 * ( 3 - 4 )')).toBe('local a=1+2*(3-4)')
  })

  it('keeps a space between two words that would otherwise merge', () => {
    expect(minify('local  x')).toBe('local x')
    expect(minify('if a then return b end')).toBe('if a then return b end')
  })

  it('keeps a space where two operators would form a different one', () => {
    // `- -1` must not become `--1`, which would be a comment
    expect(minify('x = 1 - -1')).toBe('x=1- -1')
    expect(minify('x = a .. .. b'.replace(' .. .. ', ' .. '))).toBe('x=a..b')
  })

  it('leaves strings untouched', () => {
    expect(minify('x = "a  b -- c"')).toBe('x="a  b -- c"')
    expect(minify("x = 'it\\'s'")).toBe("x='it\\'s'")
    expect(minify('x = [[ raw  -- text ]]')).toBe('x=[[ raw  -- text ]]')
  })

  it('keeps the newline before a line that opens with a bracket', () => {
    // Joining these would turn two statements into one call
    const source = 'local a = b\n(f or g)(1)'
    expect(minify(source)).toBe('local a=b\n(f or g)(1)')
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
      'function onTick()local raw=input.getNumber(1)local limit=property.getNumber("limit")' +
        'output.setNumber(1,math.min(raw,limit))end',
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
