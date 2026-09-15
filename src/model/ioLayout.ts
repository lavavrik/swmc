/**
 * Pin slots on the microcontroller block.
 *
 * The game's schematic is a `width × length` grid of cells (each 1–6). A node
 * whose `(faceX, faceZ)` sits outside that rectangle is drawn with a warning
 * and does not appear on the placed block. Inputs fill from the left column,
 * outputs from the right; extra pins wrap inward. The block grows (length
 * first, then width) when there are more pins than cells.
 */
import type { Microcontroller, NodeId } from './types'

export interface PinFace {
  readonly x: number
  readonly z: number
}

export interface PinToPlace {
  readonly dir: 'in' | 'out'
  readonly explicit: boolean
  readonly faceX: number
  readonly faceZ: number
}

export function assignPinFaces(
  pins: readonly PinToPlace[],
  width: number,
  length: number,
): { width: number; length: number; faces: PinFace[] } {
  const n = pins.length
  const both = pins.some((p) => p.dir === 'in') && pins.some((p) => p.dir === 'out')
  let w = clampSize(width)
  let l = clampSize(length)
  if (both) w = Math.max(w, 2)

  for (const pin of pins) {
    if (!pin.explicit) continue
    w = clampSize(Math.max(w, Math.round(pin.faceX) + 1))
    l = clampSize(Math.max(l, Math.round(pin.faceZ) + 1))
  }
  while (w * l < n) {
    if (l < 6) l += 1
    else if (w < 6) w += 1
    else break
  }

  const occupied = new Set<string>()
  const faces: PinFace[] = pins.map(() => ({ x: 0, z: 0 }))
  const key = (x: number, z: number) => `${x},${z}`

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!
    if (!pin.explicit) continue
    const x = Math.max(0, Math.min(w - 1, Math.round(pin.faceX)))
    const z = Math.max(0, Math.min(l - 1, Math.round(pin.faceZ)))
    occupied.add(key(x, z))
    faces[i] = { x, z }
  }

  const take = (startX: number, step: number): PinFace => {
    for (let col = 0; col < w; col++) {
      const x = startX + col * step
      if (x < 0 || x >= w) continue
      for (let z = 0; z < l; z++) {
        if (!occupied.has(key(x, z))) {
          occupied.add(key(x, z))
          return { x, z }
        }
      }
    }
    return { x: 0, z: 0 }
  }

  for (let i = 0; i < pins.length; i++) {
    if (pins[i]!.explicit) continue
    const inward = pins[i]!.dir === 'in'
    faces[i] = take(inward ? 0 : w - 1, inward ? 1 : -1)
  }

  return { width: w, length: l, faces }
}

/** Writes packed `faceX`/`faceZ` onto every IO node, growing the block if needed. */
export function packIoFaces(doc: Microcontroller): Microcontroller {
  const w = clampSize(doc.meta.width)
  const l = clampSize(doc.meta.length)
  const seen = new Set<string>()
  const pins: (PinToPlace & { id: NodeId })[] = []
  for (const id of doc.ioOrder) {
    const node = doc.nodes.find((n) => n.id === id)
    if (!node?.type.startsWith('io.')) continue
    const faceX = Number(node.properties.faceX ?? 0)
    const faceZ = Number(node.properties.faceZ ?? 0)
    const onBody = faceX >= 0 && faceX < w && faceZ >= 0 && faceZ < l
    const key = `${Math.round(faceX)},${Math.round(faceZ)}`
    const keep = onBody && !seen.has(key)
    if (keep) seen.add(key)
    pins.push({
      id,
      dir: node.type.startsWith('io.in.') ? 'in' : 'out',
      explicit: keep,
      faceX,
      faceZ,
    })
  }
  if (pins.length === 0) return doc

  const placed = assignPinFaces(pins, doc.meta.width, doc.meta.length)
  const byId = new Map(pins.map((pin, i) => [pin.id, placed.faces[i]!]))

  const nodes = doc.nodes.map((node) => {
    const face = byId.get(node.id)
    if (!face) return node
    if (node.properties.faceX === face.x && node.properties.faceZ === face.z) return node
    return { ...node, properties: { ...node.properties, faceX: face.x, faceZ: face.z } }
  })
  const sameSize = doc.meta.width === placed.width && doc.meta.length === placed.length
  const sameNodes = nodes.every((node, i) => node === doc.nodes[i])
  if (sameSize && sameNodes) return doc
  return {
    ...doc,
    nodes,
    meta: sameSize ? doc.meta : { ...doc.meta, width: placed.width, length: placed.length },
  }
}

const clampSize = (n: number): number => Math.min(6, Math.max(1, Math.round(n) || 1))
