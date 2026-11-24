import type { Generator } from './rules'
export const KINDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const
export type Kind = typeof KINDS[number]
export const HISTORY_SIZE = 4
export const HISTORY_ROLLS = 6

export function seedOf(value: string) {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619)
  return hash >>> 0
}

export type PieceSourceState = {rng: number; bag: Kind[]; history: Kind[]}
export type PieceSource = (() => Kind) & {
  save: () => PieceSourceState
  restore: (state: PieceSourceState) => void
}

export function randomFrom(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ state >>> 15, state | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
  next.save = () => state >>> 0
  next.restore = (saved: number) => { state = saved >>> 0 }
  return next
}

export function pieceSource(mode: Generator, seed: number): PieceSource {
  const random = randomFrom(seed)
  const pick = () => KINDS[Math.floor(random() * KINDS.length)]
  const bag: Kind[] = []
  const history: Kind[] = []
  const next = (() => {
    if (mode === 'random') return pick()
    if (mode === 'history') {
      let piece = pick()
      for (let attempt = 1; attempt < HISTORY_ROLLS && history.includes(piece); attempt++) piece = pick()
      history.push(piece)
      if (history.length > HISTORY_SIZE) history.shift()
      return piece
    }
    if (!bag.length) {
      bag.push(...KINDS)
      if (mode === 'bag14') bag.push(...KINDS)
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
    }
    return bag.pop()!
  }) as PieceSource
  next.save = () => ({rng: random.save(), bag: bag.slice(), history: history.slice()})
  next.restore = (state: PieceSourceState) => {
    random.restore(state.rng)
    bag.splice(0, bag.length, ...state.bag)
    history.splice(0, history.length, ...state.history)
  }
  return next
}
