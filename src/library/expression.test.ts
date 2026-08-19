import { describe, expect, it } from 'vitest'
import { compileExpression, evaluateExpression } from './expression'

const evalWith = (src: string, vars: Record<string, number> = {}) => evaluateExpression(src, vars)

describe('expression', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(evalWith('2+3*4')).toBe(14)
    expect(evalWith('(2+3)*4')).toBe(20)
    expect(evalWith('2^3^2')).toBe(512) // right-associative
    expect(evalWith('-3+1')).toBe(-2)
  })

  it('reads variables and constants', () => {
    expect(evalWith('x*y+z', { x: 2, y: 3, z: 4 })).toBe(10)
    expect(evalWith('x', {})).toBe(0)
    expect(evalWith('pi')).toBeCloseTo(Math.PI)
  })

  it('calls functions', () => {
    expect(evalWith('clamp(5,0,1)')).toBe(1)
    expect(evalWith('max(1,7,3)')).toBe(7)
    expect(evalWith('abs(-2)')).toBe(2)
  })

  it('treats division by zero as zero, like the game', () => {
    expect(evalWith('1/0')).toBe(0)
  })

  it('evaluates comparisons to 1 and 0', () => {
    expect(evalWith('x>1', { x: 2 })).toBe(1)
    expect(evalWith('x==1 & x>0', { x: 1 })).toBe(1)
  })

  it('returns null for expressions that do not parse', () => {
    expect(compileExpression(')(')).toBeNull()
    expect(compileExpression('1+')).toBeNull()
    expect(compileExpression('1 2')).toBeNull()
  })

  it('never returns a non-finite number', () => {
    expect(evalWith('sqrt(-1)')).toBe(0)
  })
})
