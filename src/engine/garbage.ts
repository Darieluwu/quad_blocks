import { HEIGHT, WIDTH } from './rules'
import type { Board } from './pieces'

export type GarbagePacket = {lines: number; hole: number; ready: number; source?: number}

export function garbageProjection(board: Board, banked: number, holes: readonly number[]) {
  const top = board.findIndex((row,y)=>y<HEIGHT-banked && row.some(Boolean))
  const projectedTop = (top<0 ? HEIGHT : top+banked)-holes.length
  return {top:projectedTop,height:HEIGHT-projectedTop}
}
export class Garbage {
  readonly queue: GarbagePacket[] = []
  get total() { return this.queue.reduce((total, packet) => total + packet.lines, 0) }

  preview(cap: number) {
    const holes: number[] = []
    for (const packet of this.queue) {
      for (let i=0;i<packet.lines && holes.length<cap;i++) holes.push(packet.hole)
      if (holes.length>=cap) break
    }
    return holes
  }

  push(packet: GarbagePacket) {
    if (!Number.isSafeInteger(packet.lines) || packet.lines <= 0 ||
      !Number.isInteger(packet.hole) || packet.hole < 0 || packet.hole >= WIDTH ||
      !Number.isSafeInteger(packet.ready) || packet.ready < 0) return
    this.queue.push({...packet})
  }

  cancel(lines: number) {
    while (lines > 0 && this.queue.length) {
      const first = this.queue[0]
      const used = Math.min(lines, first.lines)
      first.lines -= used
      lines -= used
      if (!first.lines) this.queue.shift()
    }
    return lines
  }

  take(now: number, cap: number) {
    const holes: number[] = []
    while (holes.length < cap && this.queue.length && this.queue[0].ready <= now) {
      const first = this.queue[0]
      holes.push(first.hole)
      if (!--first.lines) this.queue.shift()
    }
    return holes
  }
}
