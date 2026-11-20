import { fits, occupied, type Board, type Piece } from './pieces'
import type { Rules } from './rules'
export type Spin = 'mini' | 'T' | 'L' | 'J' | 'S' | 'Z'
export type Rotation = {kick: number; turn: number}

export function detectSpin(board: Board, piece: Piece, rotation: Rotation | null): Spin | null {
  if (!rotation) return null
  const {kind, x, y} = piece
  if (kind === 'T') {
    const corners = [occupied(board,x,y), occupied(board,x+2,y),
      occupied(board,x+2,y+2), occupied(board,x,y+2)]
    if (corners.filter(Boolean).length < 3) return null
    const full = corners[piece.rotation] && corners[(piece.rotation+1)%4]
    return full || (rotation.turn !== 2 && rotation.kick === 4) ? 'T' : 'mini'
  }
  if (kind === 'L' || kind === 'J' || kind === 'S' || kind === 'Z') {
    const trapped = !fits(board,piece,-1,0) && !fits(board,piece,1,0) &&
      !fits(board,piece,0,-1) && !fits(board,piece,0,1)
    if (trapped) return kind
  }
  return null
}

export function scoreClear(lines: number, spin: Spin | null, perfect: boolean,
  combo: number, chain: boolean, rules: Rules) {
  const extra = spin && spin !== 'T' && spin !== 'mini' && rules.extraSpins
  const difficult = lines > 0 && (lines === 4 || spin === 'T' || spin === 'mini' || !!extra)
  const b2b = difficult && chain
  const nextChain = lines ? difficult : chain
  const nextCombo = lines ? combo + 1 : -1
  const a = rules.attack
  let attack = [0,0,a.double,a.triple,a.quad][lines] ?? 0
  if (lines && spin === 'T') attack = [0,a.tSingle,a.tDouble,a.tTriple][lines] ?? attack
  if (lines && spin === 'mini') attack = lines === 1 ? a.mini : a.miniDouble
  if (lines && extra) attack += a.extraSpin
  if (nextCombo > 0) attack += Math.min(a.comboMax, Math.floor(nextCombo / Math.max(1,a.comboStep)))
  if (b2b) attack += a.backToBack
  if (perfect) attack += a.perfect
  return {attack, b2b, chain:nextChain, combo:nextCombo}
}
