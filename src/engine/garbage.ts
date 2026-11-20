import { WIDTH } from './rules'

export type GarbagePacket = {lines: number; hole: number; ready: number}
export class Garbage {
  readonly queue: GarbagePacket[] = []
  get total() { return this.queue.reduce((total, packet) => total + packet.lines, 0) }

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
