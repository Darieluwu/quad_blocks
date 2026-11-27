import { BlitzMatch, type Stance } from '../engine/blitz'
import { Match, teamForSlot } from '../engine/match'
import { ACTIONS, NO_INPUT, type Action, type GameEvent, type Input, type PlayerSnapshot, type PlayerStats } from '../engine/player'
import { DEFAULT_RULES, SETTINGS } from '../engine/rules'
import { isCharacterId, type CharacterId } from '../characters/catalog'
import { BATTLE_INTRO_TICKS } from '../battle-intro-config'

export const ROOM_ID = /^[a-f0-9]{32}$/
export const randomId = () => crypto.randomUUID().replaceAll('-','')
export const ONLINE_RULES = {...DEFAULT_RULES, seed:''}
export const PLAY_ACTIONS = ACTIONS.filter(action=>action!=='pause')
export const PRESS_LIMIT = 16
export const actionMask = (actions: ReadonlySet<Action>) =>
  PLAY_ACTIONS.reduce((mask,action,i)=>actions.has(action) ? mask | (1<<i) : mask,0)
export const heldActions = (mask: number) => new Set(PLAY_ACTIONS.filter((_,i)=>mask & (1<<i)))

export type Seat = {name:string; connected:boolean; ready:boolean; botLevel:number; character?:CharacterId; characterConfirmed?:boolean}
export type OnlineFormat = 'blitz'|'teams'
export type LobbyState = {host:number; seats:Seat[]; phase:'lobby'|'countdown'|'playing'|'paused'|'results'; missing:string[];
  format?:OnlineFormat; lastStand?:boolean}
export type ClientMessage =
  | {type:'join'; token:string; name:string; create:boolean; format?:OnlineFormat}
  | {type:'ready'; value:boolean}
  | {type:'lastStand'; value:boolean}
  | {type:'character'; slot:number; id:CharacterId; request?:number}
  | {type:'bot'; slot:number; level:number}
  | {type:'start'|'lobby'|'leave'}
  | {type:'input'; seq:number; held:number; pressed:Action[]; standId?:number}
  | {type:'ping'; id:number}

export function parseClient(raw: unknown): ClientMessage | null {
  if (typeof raw!=='string' || raw.length>1024) return null
  try {
    const message = JSON.parse(raw) as ClientMessage
    if (!message || typeof message!=='object') return null
    switch (message.type) {
      case 'join': return typeof message.token==='string' && ROOM_ID.test(message.token) &&
        typeof message.name==='string' && message.name.trim().length>0 && message.name.length<=24 && typeof message.create==='boolean' &&
        (message.format===undefined || message.format==='blitz' || message.format==='teams') ? message : null
      case 'ready': case 'lastStand': return typeof message.value==='boolean' ? message : null
      case 'character': return Number.isInteger(message.slot) && message.slot>=0 && message.slot<4 && isCharacterId(message.id) &&
        (message.request===undefined || Number.isSafeInteger(message.request) && message.request>0) ? message : null
      case 'bot': return Number.isInteger(message.slot) && message.slot>=0 && message.slot<4 &&
        Number.isInteger(message.level) && message.level>=1 && message.level<=10 ? message : null
      case 'input': return Number.isSafeInteger(message.seq) && message.seq>0 &&
        (message.standId===undefined || Number.isSafeInteger(message.standId) && message.standId>0) &&
        Number.isInteger(message.held) && message.held>=0 && message.held<(1<<PLAY_ACTIONS.length) &&
        Array.isArray(message.pressed) && message.pressed.length<=PRESS_LIMIT &&
        message.pressed.every(action=>PLAY_ACTIONS.some(allowed=>allowed===action)) ? message : null
      case 'ping': return Number.isSafeInteger(message.id) && message.id>0 ? message : null
      case 'start': case 'lobby': case 'leave': return message
      default: return null
    }
  } catch { return null }
}

export const makeMatch = (seed: string, levels: (number|null)[]) => new BlitzMatch(ONLINE_RULES,seed,
  levels.map((level,slot)=>({slot,team:teamForSlot(slot),level:level??undefined})))
export const makeTeamsMatch = (start:MatchStart) => new Match(ONLINE_RULES,start.seed,
  start.levels.map((level,slot)=>({slot,team:teamForSlot(slot),level:level??undefined})),false,start.lastStand ?? true)

const CELLS = [null,'I','J','L','O','S','T','Z','G','zone','foundation'] as const
const boardText = (p: Match['players'][number]) => p.board.map(row=>row.map(cell=>CELLS.indexOf(cell).toString(16)).join('')).join('')
const loadBoard = (board:PlayerSnapshot['board'],text:string) => {
  let column = 0
  for (const row of board) for (let x=0;x<row.length;x++) row[x] = CELLS[parseInt(text[column++],16)]
}

export function snapshot(match: Match) {
  const blitz = match instanceof BlitzMatch ? match : null
  return {
    now:match.now, left:blitz?.left ?? 0, transition:blitz?.transition ?? 0, rotation:blitz?.rotation ?? 'normal', turn:blitz?.turn ?? 0,
    finished:match.finished, winningTeam:match.winningTeam, stances:blitz?.stances.slice() ?? [],
    sides:blitz?.sides.map(side=>({...side,members:side.members.slice(),rescue:side.rescue?{...side.rescue}:null})) ?? [],
    clocks:blitz?.clocks.slice() ?? [], zonePhase:match.zonePhase,
    ...(blitz ? {} : {teams:{targets:match.targets.slice(),eliminated:match.eliminated.map(group=>group.slice()),
      stand:match.stand ? structuredClone(match.stand) : null}}),
    totals:match.finished ? match.players.map((_,i)=>match.statsFor(i)) : null,
    players:match.players.map(p=>({board:boardText(p),active:{...p.active},lastRotation:p.lastRotation?{...p.lastRotation}:null,
      sim:p.simState(),hold:p.hold,next:p.next.slice(),dead:p.dead,
      stats:{...p.stats},danger:p.danger,garbage:p.garbage.queue.map(packet=>({...packet})),
      zone:p.zone.save(), ...(p.stand ? {stand:{...p.stand}} : {}),
      ...(p.foundationUntil ? {foundationUntil:p.foundationUntil} : {})})),
  }
}

export type Snapshot = ReturnType<typeof snapshot>
export type MatchStart = {seed:string; names:string[]; levels:(number|null)[]; countdown:number; characters?:CharacterId[];
  presentation?:number; rejoin?:boolean; format?:OnlineFormat; lastStand?:boolean}
export type Frame = {type:'frame'; frameId?:number; state:Snapshot; acks:number[]; events:{slot:number; event:GameEvent}[]; fallen:number[]}
export type ServerMessage = {type:'welcome'; slot:number; inputSeq:number} | {type:'lobby'; lobby:LobbyState} |
  {type:'characterConfirmed'; slot:number; id:CharacterId; request:number; accepted:boolean} |
  ({type:'start'} & MatchStart) | {type:'countdown'; left:number} | {type:'pong'; id:number} |
  Frame | {type:'error'; message:string; fatal?:boolean}

type LocalHistoryEntry = {
  clock: number
  seq: number
  maxSeq: number
  input: Input
  board: string
  state: PlayerSnapshot
  stance: Stance
}

export class OnlineTeamsMatch extends Match {
  private lastFrameId = 0
  private totals:PlayerStats[]|null = null
  private boards:string[] = []
  synced = false

  constructor(start:MatchStart) {
    super(ONLINE_RULES,start.seed,start.levels.map((level,slot)=>({slot,team:teamForSlot(slot),level:level??undefined})),
      false,start.lastStand ?? true)
  }

  override statsFor(index:number) { return this.totals?.[index] ?? super.statsFor(index) }

  load(frame:Frame) {
    if (!frame.state.teams || frame.frameId && frame.frameId<=this.lastFrameId) return false
    const {state} = frame
    const {targets,eliminated,stand} = frame.state.teams
    this.lastFrameId = frame.frameId ?? this.lastFrameId
    this.synced = true
    this.now = state.now
    this.finished = state.finished
    this.winningTeam = state.winningTeam
    this.zonePhase = state.zonePhase
    this.totals = state.totals
    this.targets = targets.slice()
    this.eliminated = eliminated.map(group=>group.slice())
    this.stand = stand ? structuredClone(stand) : null
    for (const [i,view] of state.players.entries()) {
      const player = this.players[i]
      const changed = this.boards[i]!==view.board
      const board = changed ? player.board.map(row=>row.slice()) : player.board
      if (changed) loadBoard(board,view.board)
      this.boards[i] = view.board
      player.importState({...view,board,revision:player.revision+Number(changed)})
    }
    return true
  }
}

const cloneInput = (input: Input): Input => ({held: new Set(input.held), pressed: input.pressed.slice()})
const garbageSignature = (queue: readonly {lines:number; hole:number; ready:number}[]) =>
  queue.map(packet => `${packet.lines}:${packet.hole}:${packet.ready}`).join(',')

export class OnlineMatch extends BlitzMatch {
  private totals: PlayerStats[] | null = null
  private boards: string[] = []
  private localHistory: LocalHistoryEntry[] = []
  private lastFrameId = 0
  private maxLocalSeq = 0
  confirmedClock = 0
  confirmedSeq = 0
  diagnostics = {
    corrections: 0,
    correctionTimes: [] as number[],
    divergences: 0,
    lastReason: '',
    debug: false,
  }

  constructor(start: MatchStart) {
    super(ONLINE_RULES,start.seed,start.levels.map((level,slot)=>({slot,team:teamForSlot(slot),level:level??undefined})))
  }

  override statsFor(index: number) { return this.totals?.[index] ?? super.statsFor(index) }

  private loadPlayer(i: number, view: Snapshot['players'][number], stance: Stance) {
    const player = this.players[i]
    this.stances[i] = stance
    if (this.boards[i]!==view.board) {
      this.boards[i] = view.board
      loadBoard(player.board,view.board)
      player.revision++
    }
    player.active = {...view.active}
    player.hold = view.hold
    player.next = view.next.slice()
    player.dead = view.dead
    player.stats = {...view.stats}
    player.danger = view.danger
    player.loadSimState(view.sim, view.lastRotation ? {...view.lastRotation} : null)
    player.zone.restore(view.zone)
    player.garbage.queue.splice(0, player.garbage.queue.length, ...view.garbage.map(packet => ({...packet})))
  }

  load(state: Snapshot) {
    this.now = state.now
    this.left = state.left
    this.transition = state.transition
    this.rotation = state.rotation
    this.turn = state.turn
    this.finished = state.finished
    this.winningTeam = state.winningTeam
    this.totals = state.totals
    if (state.zonePhase !== undefined) this.zonePhase = state.zonePhase
    if (state.clocks) for (let i = 0; i < this.clocks.length; i++) this.clocks[i] = state.clocks[i] ?? 0
    for (const [i,side] of state.sides.entries()) Object.assign(this.sides[i],side)
    for (const [i,view] of state.players.entries()) this.loadPlayer(i, view, state.stances[i])
  }

  isSlotActive(slot: number) {
    return !this.finished && !this.transition && !this.players[slot]?.dead && this.sides.some(side => side.active === slot)
  }

  private runLocalTick(slot: number, input: Input, seq: number, keepEvents: boolean): GameEvent[] {
    const player = this.players[slot]
    const clock = ++this.clocks[slot]
    const quarterLines = this.zoneChargeCost()
    player.zoneAllowed = !this.canRotate || this.left > this.warningTicks
    if (input.pressed.filter(action => action === 'stance').length % 2) {
      this.stances[slot] = this.stances[slot] === 'attack' ? 'defense' : 'attack'
      player.event('blitzStance')
    }
    player.tick(input, clock, quarterLines)
    const events = keepEvents ? player.events.splice(0) : (player.events.length = 0, [])
    player.combat.length = 0
    if (seq > this.maxLocalSeq) this.maxLocalSeq = seq
    this.localHistory.push({
      clock, seq, maxSeq: this.maxLocalSeq, input: cloneInput(input), board: boardText(player),
      state: player.exportState(), stance: this.stances[slot],
    })
    if (this.localHistory.length > 180) this.localHistory.shift()
    return events
  }

  stepLocal(slot: number, input: Input, seq = 0): GameEvent[] {
    if (!this.isSlotActive(slot)) {
      if (this.localHistory.length) this.localHistory.length = 0
      return []
    }
    return this.runLocalTick(slot, input, seq, true)
  }

  private compareLocal(entry: LocalHistoryEntry, view: Snapshot['players'][number], stance: Stance, ackSeq: number): string {
    if (entry.stance !== stance) return 'stance'
    if (entry.state.dead !== view.dead) return 'dead'
    if (garbageSignature(entry.state.garbage) !== garbageSignature(view.garbage)) return 'garbage'
    if (entry.state.zone.remaining !== view.zone.remaining ||
      entry.state.zone.energy !== view.zone.energy ||
      entry.state.zone.lines !== view.zone.lines) return 'zone'
    // While inputs applied by this tick are still in-flight to the server, avoid false-positive rollbacks on piece/board.
    if (entry.maxSeq > ackSeq) return ''
    if (entry.board !== view.board) return 'board'
    const a = entry.state.active, b = view.active
    if (a.kind !== b.kind || a.rotation !== b.rotation || a.x !== b.x || a.y !== b.y) return 'piece'
    if (entry.state.hold !== view.hold || entry.state.sim.usedHold !== view.sim.usedHold) return 'hold'
    if (entry.state.next.join(',') !== view.next.join(',')) return 'next'
    return ''
  }

  reconcile(frame: Frame, slot: number, pending: readonly {seq: number; input: Input}[] = []) {
    if (frame.frameId && frame.frameId <= this.lastFrameId) {
      return {accepted: false, rolledBack: false, localActive: this.isSlotActive(slot), reason: ''}
    }
    if (frame.frameId) this.lastFrameId = frame.frameId
    const {state} = frame
    this.now = state.now
    this.left = state.left
    this.transition = state.transition
    this.rotation = state.rotation
    this.turn = state.turn
    this.finished = state.finished
    this.winningTeam = state.winningTeam
    this.totals = state.totals
    if (state.zonePhase !== undefined) this.zonePhase = state.zonePhase
    for (const [i, side] of state.sides.entries()) Object.assign(this.sides[i], side)
    for (const [i, view] of state.players.entries()) {
      if (i === slot) continue
      this.clocks[i] = state.clocks?.[i] ?? 0
      this.loadPlayer(i, view, state.stances[i])
    }

    const serverClock = state.clocks?.[slot] ?? 0
    const ackSeq = frame.acks[slot] ?? 0
    this.confirmedClock = serverClock
    this.confirmedSeq = ackSeq
    const serverActive = !state.finished && !state.transition && !state.players[slot]?.dead &&
      state.sides.some(side => side.active === slot)

    if (!serverActive) {
      this.localHistory.length = 0
      this.clocks[slot] = serverClock
      this.loadPlayer(slot, state.players[slot], state.stances[slot])
      return {accepted: true, rolledBack: false, localActive: false, reason: ''}
    }

    const entryIndex = this.localHistory.findIndex(item => item.clock === serverClock)
    if (entryIndex < 0 || this.clocks[slot] < serverClock) {
      this.localHistory.length = 0
      this.clocks[slot] = serverClock
      this.loadPlayer(slot, state.players[slot], state.stances[slot])
      for (const cmd of pending) this.runLocalTick(slot, cmd.input, cmd.seq, false)
      return {accepted: true, rolledBack: false, localActive: true, reason: ''}
    }

    const entry = this.localHistory[entryIndex]
    const reason = this.compareLocal(entry, state.players[slot], state.stances[slot], ackSeq)
    if (!reason) {
      this.localHistory.splice(0, entryIndex)
      return {accepted: true, rolledBack: false, localActive: true, reason: ''}
    }

    this.diagnostics.divergences++
    this.diagnostics.corrections++
    this.diagnostics.lastReason = reason
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
    this.diagnostics.correctionTimes.push(nowMs)
    while (this.diagnostics.correctionTimes.length && nowMs - this.diagnostics.correctionTimes[0] > 60_000) {
      this.diagnostics.correctionTimes.shift()
    }

    const targetClock = this.clocks[slot]
    const future = this.localHistory.slice(entryIndex + 1)
    this.localHistory.length = 0
    this.clocks[slot] = serverClock
    this.loadPlayer(slot, state.players[slot], state.stances[slot])

    // Keep an entry for serverClock in history for future comparisons.
    const player = this.players[slot]
    this.localHistory.push({
      clock: serverClock, seq: ackSeq, maxSeq: ackSeq, input: entry.input,
      board: boardText(player), state: player.exportState(), stance: this.stances[slot],
    })

    // Ensure any unacknowledged pending inputs whose original clock <= serverClock are not lost.
    const unackedEarly = pending.filter(cmd => !future.some(item => item.seq === cmd.seq))
    let earlyIdx = 0
    for (let t = serverClock + 1; t <= targetClock; t++) {
      const hist = future[t - serverClock - 1]
      let replayInput: Input = hist
        ? (hist.seq > ackSeq || hist.seq === 0 ? hist.input : {held: hist.input.held, pressed: []})
        : NO_INPUT
      let replaySeq = hist?.seq ?? 0
      if (earlyIdx < unackedEarly.length) {
        const extra = unackedEarly[earlyIdx++]
        replayInput = {
          held: extra.input.held,
          pressed: [...extra.input.pressed, ...replayInput.pressed],
        }
        replaySeq = extra.seq
      }
      this.runLocalTick(slot, replayInput, replaySeq, false)
    }
    while (earlyIdx < unackedEarly.length) {
      const extra = unackedEarly[earlyIdx++]
      this.runLocalTick(slot, extra.input, extra.seq, false)
    }

    return {accepted: true, rolledBack: true, localActive: true, reason}
  }

  correctionsPerMinute(nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    while (this.diagnostics.correctionTimes.length && nowMs - this.diagnostics.correctionTimes[0] > 60_000) {
      this.diagnostics.correctionTimes.shift()
    }
    return this.diagnostics.correctionTimes.length
  }

  predictMovement(slot: number,input: Input) {
    if (this.finished || this.transition || !this.sides.some(side=>side.active===slot)) return false
    const player = this.players[slot]
    if (!player || player.dead) return false
    player.predictMovement(input)
    return true
  }
}

export type RemoteInput = {held:number; pressed:Action[]}
export const consumeRemote = (input: RemoteInput): Input => ({held:heldActions(input.held),pressed:input.pressed.splice(0)})
export const START_TICKS = SETTINGS.countdown+BATTLE_INTRO_TICKS.blitz
