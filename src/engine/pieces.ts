import type { Kind } from './random'
import { HEIGHT, HIDDEN, VISIBLE, WIDTH } from './rules'
export type Point = readonly [number, number]
export type Piece = {kind: Kind; rotation: number; x: number; y: number}
export type Cell = Kind | 'G' | 'zone' | 'foundation' | null
export type Board = Cell[][]
export const emptyRow = (): Cell[] => Array<Cell>(WIDTH).fill(null)
export const emptyBoard = (): Board => Array.from({length: HEIGHT}, emptyRow)

const bases: Record<Kind, Point[]> = {
  I:[[0,1],[1,1],[2,1],[3,1]], J:[[0,0],[0,1],[1,1],[2,1]],
  L:[[2,0],[0,1],[1,1],[2,1]], O:[[1,0],[2,0],[1,1],[2,1]],
  S:[[1,0],[2,0],[0,1],[1,1]], T:[[1,0],[0,1],[1,1],[2,1]],
  Z:[[0,0],[1,0],[1,1],[2,1]],
}
export const SHAPES = {} as Record<Kind, Point[][]>
for (const kind of Object.keys(bases) as Kind[]) {
  const edge = kind === 'I' ? 3 : 2
  const states = [bases[kind]]
  for (let n = 1; n < 4; n++) {
    states.push(kind === 'O' ? states[0] : states[n-1].map(([x,y]) => [edge-y,x]))
  }
  SHAPES[kind] = states
}
export function spawnPiece(kind: Kind, banked = 0): Piece {
  const y = banked>=VISIBLE ? HEIGHT-banked-1-Math.max(...SHAPES[kind][0].map(([,dy])=>dy)) : HIDDEN-1
  return {kind,rotation:0,x:3,y}
}
export const occupied = (board: Board, x: number, y: number) =>
  x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || board[y][x] !== null

export function fits(board: Board, piece: Piece, dx = 0, dy = 0, rotation = piece.rotation) {
  for (const [x,y] of SHAPES[piece.kind][rotation]) {
    if (occupied(board, piece.x+x+dx, piece.y+y+dy)) return false
  }
  return true
}

export function landing(board: Board, piece: Piece) {
  let distance = 0
  while (fits(board, piece, 0, distance + 1)) distance++
  return distance
}

// Official quarter-turn offsets expressed with positive Y upwards.
const common: Record<string, Point[]> = {
  '01':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '10':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '12':[[0,0],[1,0],[1,-1],[0,2],[1,2]], '21':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '23':[[0,0],[1,0],[1,1],[0,-2],[1,-2]], '32':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '30':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], '03':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
}
const straight: Record<string, Point[]> = {
  '01':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]], '10':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '12':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]], '21':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '23':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]], '32':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '30':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]], '03':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
}
const double: Point[] = [[0,0],[1,0],[-1,0],[0,1],[1,1],[-1,1],[0,-1]]
const stationary: Point[] = [[0,0]]

export function rotate(board: Board, piece: Piece, turn: -1 | 1 | 2, floorKicks: boolean) {
  const rotation = (piece.rotation + turn + 4) % 4
  const offsets = piece.kind === 'O' ? stationary : turn === 2 ? double :
    (piece.kind === 'I' ? straight : common)[`${piece.rotation}${rotation}`]
  for (const [kick, [dx, up]] of offsets.entries()) {
    if ((!floorKicks && up > 0) || !fits(board, piece, dx, -up, rotation)) continue
    return {piece:{...piece, rotation, x:piece.x+dx, y:piece.y-up}, kick, turn}
  }
  return null
}
