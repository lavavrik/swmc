import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { stdout } from 'node:process'

const MAX = 720

export type TelemSample = {
  t: number
  s: number
  f: number
  v: number
  i: number
  h: number
  a: number
  e: number
  g: number
  p: number
  c: number
  m: number
  d: number
  u: number
  k: number
}

export const TELEM_KEYS = [
  's',
  'f',
  'v',
  'i',
  'h',
  'a',
  'e',
  'g',
  'p',
  'c',
  'm',
  'd',
  'u',
  'k',
] as const

export function parseTelemQuery(url: string): TelemSample | null {
  const path = url.startsWith('/') ? url : `/${url}`
  if (!path.startsWith('/t')) return null
  const qIndex = path.indexOf('?')
  if (qIndex < 0) return null
  const q = path.slice(qIndex + 1)
  if (!q) return null
  const params = new URLSearchParams(q)
  const n = (k: string) => Number(params.get(k) ?? 0)
  return {
    t: Date.now(),
    s: n('s'),
    f: n('f'),
    v: n('v'),
    i: n('i'),
    h: n('h'),
    a: n('a'),
    e: n('e'),
    g: n('g'),
    p: n('p'),
    c: n('c'),
    m: n('m'),
    d: n('d'),
    u: n('u'),
    k: n('k'),
  }
}

export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.internal || info.family !== 'IPv4') continue
      out.push(info.address)
    }
  }
  return out
}

export function startTelemServer(port: number): void {
  const samples: TelemSample[] = []
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.startsWith('/t')) {
      const sample = parseTelemQuery(url)
      if (sample) {
        samples.push(sample)
        if (samples.length > MAX) samples.splice(0, samples.length - MAX)
      }
      res.statusCode = 200
      res.end('ok')
      return
    }
    if (url.startsWith('/latest')) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(samples[samples.length - 1] ?? null))
      return
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ n: samples.length, keys: TELEM_KEYS, samples }))
  })
  server.listen(port, '0.0.0.0', () => {
    stdout.write(`telemetry on http://127.0.0.1:${port}/  (Stormworks → localhost)\n`)
    for (const ip of lanAddresses()) {
      stdout.write(`  LAN  http://${ip}:${port}/\n`)
    }
    stdout.write('GET /  last samples   GET /latest   ingest GET /t?s=&f=&v=...\n')
  })
}
