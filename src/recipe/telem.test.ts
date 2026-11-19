import { describe, expect, it } from 'vitest'
import { parseTelemQuery } from './telem'

describe('parseTelemQuery', () => {
  it('reads a Stormworks GET path', () => {
    const s = parseTelemQuery(
      '/t?s=66.1&f=65.8&v=70&i=0.42&h=0.40&a=0.02&e=-3.9&g=5&p=0&c=0.91&m=0.4&d=0.4&u=1&k=1',
    )
    expect(s).toMatchObject({ s: 66.1, f: 65.8, v: 70, g: 5, k: 1 })
  })

  it('rejects other paths', () => {
    expect(parseTelemQuery('/')).toBeNull()
  })
})
