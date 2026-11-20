import { emptyBoard, emptyRow, fits, landing, rotate, SHAPES, spawnPiece, type Board, type Piece } from './pieces'
import type { Kind } from './random'
import { detectSpin, scoreClear, type Rotation } from './scoring'
import { Garbage } from './garbage'
import { Zone, type ZoneResult } from './zone'
import { HEIGHT, HIDDEN, HZ, NEXT, SETTINGS, VISIBLE, WIDTH, ticks, type Rules } from './rules'

export const ACTIONS = ['left','right','soft','hard','cw','ccw','half','hold','zone','prev','next','pause','stance'] as const
export type Action = typeof ACTIONS[number]
export type Input = {held: ReadonlySet<Action>; pressed: readonly Action[]}
export const NO_INPUT: Input = {held:new Set(),pressed:[]}
export type GameEvent = {type:string; detail?:string; source?:number}
export type PlayerStats = {pieces:number; lines:number; sent:number; received:number; cancelled:number}
export type CombatPlay = {kind:'lock'; qualifies:boolean; power:number; zoned:boolean} | {kind:'zoneEnd'}
const clearNames = ['','single','double','triple','quad']
export class Player {
  board: Board = emptyBoard()
  active: Piece
  hold: Kind | null = null
  usedHold = false
  next: Kind[] = []
  garbage = new Garbage()
  zone = new Zone()
  events: GameEvent[] = []
  combat: CombatPlay[] = []
  stats: PlayerStats = {pieces:0, lines:0, sent:0, received:0, cancelled:0}
  outbox = 0
  finalZoneAttack = 0
  dead = false
  zoneAllowed = true
  combo = -1
  chain = false
  danger = 0
  revision = 0
  lastRotation: Rotation | null = null
  private gravity = 0
  private lockTimer = 0
  private lockResets = 0
  private direction = 0
  private dasElapsed = 0
  private repeatElapsed = 0
  private warningAt = 0
  private softElapsed = 0
  private buffered: {action:Action; expires:number}[] = []

  constructor(readonly rules: Rules, private source: () => Kind, private recordCombat = false) {
    this.active = spawnPiece(source())
    for (let i = 0; i < NEXT; i++) this.next.push(source())
  }

  event(type: string, detail?: string, source?: number) { this.events.push({type,detail,source}) }

  eliminate() {
    if (this.dead) return
    this.endZone()
    this.dead = true
    this.garbage.queue.length = 0
    this.outbox = 0
    this.event('eliminated')
  }

  private spawn(kind?: Kind) {
    if (!kind) {
      kind = this.next.shift()!
      this.next.push(this.source())
    }
    this.active = this.previewSpawn(kind)
    this.lockTimer = this.lockResets = this.gravity = 0
    this.lastRotation = null
    if (!fits(this.board,this.active) && this.zone.active) {
      this.resolveZone(this.zone.finish(this.rules),false)
      this.active = spawnPiece(kind)
    }
    if (!fits(this.board,this.active)) this.eliminate()
  }

  previewSpawn(kind = this.next[0]) {
    return spawnPiece(kind,this.zone.active ? this.zone.lines : 0)
  }

  private resetLock(grounded: boolean) {
    if (grounded && this.lockResets < this.rules.resets) {
      this.lockTimer = 0
      this.lockResets++
    }
  }

  private move(dx: number) {
    if (!fits(this.board,this.active,dx)) return false
    this.resetLock(!fits(this.board,this.active,0,1))
    this.active.x += dx
    this.lastRotation = null
    return true
  }

  private shift(dx: number, sweep = false) {
    if (!this.move(dx)) return
    if (sweep) while (this.move(dx)) { /* move to the wall */ }
    this.event('move')
  }

  private gravityMove(cells: number) {
    let moved = 0
    while (moved < cells && fits(this.board,this.active,0,1)) {
      moved++
      this.active.y++
    }
    if (moved) this.lastRotation = null
    return moved
  }

  private horizontal(input: Input) {
    const left = input.held.has('left')
    const right = input.held.has('right')
    let tapped = false
    const sweep = this.rules.das===0 && this.rules.arr===0
    for (const action of input.pressed) {
      if (action!=='left' && action!=='right') continue
      this.direction = action==='left' ? -1 : 1
      this.shift(this.direction,sweep)
      tapped = true
    }
    if (tapped) {
      this.dasElapsed = this.repeatElapsed = 0
      return
    }
    const desired = left && right ? this.direction || 1 : left ? -1 : right ? 1 : 0
    if (desired !== this.direction) {
      this.direction = desired
      this.dasElapsed = this.repeatElapsed = 0
      if (desired) this.shift(desired,sweep)
    } else if (desired) {
      const das = ticks(this.rules.das)
      if (++this.dasElapsed < das) return
      if (this.rules.arr === 0) this.shift(desired,true)
      else if (this.dasElapsed === das || ++this.repeatElapsed >= ticks(this.rules.arr)) {
        this.repeatElapsed = 0
        this.shift(desired)
      }
    }
  }

  send(lines: number) {
    if (!Number.isSafeInteger(lines) || lines <= 0 || this.dead) return 0
    const surviving = this.garbage.cancel(lines)
    const cancelled = lines - surviving
    if (cancelled) {
      this.stats.cancelled += cancelled
      this.event('cancel',String(cancelled))
    }
    this.outbox += surviving
    return surviving
  }

  private resolveZone(result: ZoneResult, carryPiece: boolean) {
    if (result.lines) {
      this.board = Array.from({length:result.lines},emptyRow).concat(this.board.slice(0,-result.lines))
      if (carryPiece) this.active.y += result.lines
      this.revision++
    }
    this.event('zoneEnd',String(result.lines))
    if (this.recordCombat) this.combat.push({kind:'zoneEnd'})
    if (result.attack) {
      this.event('zoneAttack')
      this.finalZoneAttack += this.send(result.attack)
    }
  }

  endZone() {
    if (this.zone.active) this.resolveZone(this.zone.finish(this.rules),!this.dead)
  }

  lock(now: number, quarterLines?: number) {
    const piece = this.active
    const spin = detectSpin(this.board,piece,this.lastRotation)
    const cells = SHAPES[piece.kind][piece.rotation]
    const hidden = cells.every(([,y]) => piece.y + y < HIDDEN)
    for (const [x,y] of cells) this.board[piece.y+y][piece.x+x] = piece.kind
    const zoned = this.zone.active
    const banked = zoned ? this.zone.lines : 0
    const playable = this.board.slice(0,HEIGHT-banked)
    const remaining = playable.filter(row => row.some(cell => !cell))
    const lines = playable.length - remaining.length
    if (lines) this.board = zoned ?
      remaining.concat(Array.from({length:banked+lines},()=>emptyRow().fill('zone'))) :
      Array.from({length:lines},emptyRow).concat(remaining)
    this.revision++
    this.stats.pieces++
    this.stats.lines += lines
    this.event('lock')
    const perfect = lines > 0 && remaining.every(row => row.every(cell => !cell))
    const result = scoreClear(lines,spin,perfect,this.combo,this.chain,this.rules)
    if (this.recordCombat) this.combat.push({kind:'lock', qualifies:lines===4 || (lines>0 && (spin==='T' || spin==='mini')),
      power:result.attack+(zoned ? lines : 0), zoned})
    this.combo = result.combo
    this.chain = result.chain
    if (spin) this.event(spin === 'T' ? ['tZero','tSingle','tDouble','tTriple'][lines] ?? 'tTriple' :
      spin === 'mini' ? 'mini' : 'spin'+spin, String(lines))
    else if (lines) this.event(clearNames[lines])
    if (result.b2b) this.event('backToBack')
    if (this.combo > 0) this.event('combo',String(this.combo))
    if (perfect) this.event('perfect')
    if (!zoned && hidden && !lines) { this.eliminate(); return }

    this.send(this.zone.clear(lines,result.attack,this.rules,quarterLines))
    if (zoned && hidden && !lines && banked<VISIBLE) this.resolveZone(this.zone.finish(this.rules),false)
    if (!zoned && !lines) {
      const holes = this.garbage.take(now,this.rules.garbageCap)
      if (holes.length) {
        const displaced = this.board.splice(0,holes.length)
        const overflow = displaced.some(row => row.some(Boolean))
        for (const hole of holes) this.board.push(Array.from({length:WIDTH},(_,x) => x === hole ? null : 'G'))
        this.stats.received += holes.length
        this.revision++
        this.event('receive',String(holes.length))
        if (overflow) { this.eliminate(); return }
      }
    }
    this.usedHold = false
    this.spawn()
  }

  private special(action: Action, now: number, quarterLines?: number): boolean {
    if (action === 'zone') {
      if (this.zoneAllowed && this.zone.activate(this.rules)) {
        this.event('zoneStart')
        this.event('zoneLoop')
      }
      return true
    }
    if (action === 'hard') {
      this.gravityMove(landing(this.board,this.active))
      this.event('hard')
      this.lock(now,quarterLines)
      return true
    }
    if (action === 'hold') {
      if (this.usedHold) return false
      const stored = this.hold
      this.hold = this.active.kind
      this.spawn(stored ?? undefined)
      this.usedHold = true
      this.event('hold')
      return true
    }
    if (action === 'cw' || action === 'ccw' || action === 'half') {
      const result = rotate(this.board,this.active,action === 'cw' ? 1 : action === 'ccw' ? -1 : 2,this.rules.floorKicks)
      if (!result) return false
      if (this.active.kind !== 'O') this.resetLock(!fits(this.board,this.active,0,1))
      this.active = result.piece
      this.lastRotation = result
      this.event('rotate')
    }
    return true
  }

  updateDanger(now: number) {
    const row = this.board.findIndex(line => line.some(Boolean))
    const height = row < 0 ? 0 : HEIGHT - row
    const spawnThreat = height >= VISIBLE && !fits(this.board,this.previewSpawn())
    const effective = Math.max(0,height-(this.zone.active ? this.zone.lines : 0)) +
      Math.min(this.garbage.total,this.rules.garbageCap)
    const level = spawnThreat || Math.max(height,effective) >= SETTINGS.critical ? 2 :
      Math.max(height,effective) >= SETTINGS.early ? 1 : 0
    if (level && (level > this.danger || now >= this.warningAt)) {
      this.event(level === 2 ? 'critical' : 'danger')
      this.warningAt = now + SETTINGS.alarmTicks
    }
    this.danger = level
  }

  tick(input: Input, now: number, quarterLines?: number) {
    if (this.dead) return
    const zone = this.zone.step(this.rules)
    if (zone?.warning) this.event('zoneWarning')
    else if (zone) this.resolveZone(zone,true)
    this.horizontal(input)
    const previous = this.buffered
    this.buffered = []
    for (const entry of previous) {
      if (this.dead) return
      if (entry.expires >= now && !this.special(entry.action,now,quarterLines)) this.buffered.push(entry)
    }
    for (const action of input.pressed) {
      if (this.dead) return
      if (!this.special(action,now,quarterLines) && this.rules.buffer > 0 &&
        !this.buffered.some(entry => entry.action === action)) {
        this.buffered.push({action,expires:now+ticks(this.rules.buffer)})
      }
    }
    if (this.dead) return
    const soft = input.held.has('soft') || input.pressed.includes('soft')
    if (soft) {
      this.softElapsed += this.rules.soft/HZ
      const immediate = input.pressed.includes('soft')
      const cells = Math.floor(this.softElapsed)
      if (cells || immediate) {
        this.softElapsed -= cells
        if (this.gravityMove(Math.max(cells,Number(immediate)))) this.event('soft')
      }
    } else this.softElapsed = 0
    if (!this.zone.active) {
      this.gravity += Math.min(SETTINGS.gravityMax,this.rules.gravity+this.rules.progression*this.stats.lines)/HZ
      const cells = Math.floor(this.gravity)
      if (cells) {
        this.gravity -= cells
        this.gravityMove(cells)
      }
    }
    if (!fits(this.board,this.active,0,1) && ++this.lockTimer >= ticks(this.rules.lock)) this.lock(now,quarterLines)
  }
}
