import { BlitzMatch } from '../engine/blitz'
import { teamForSlot } from '../engine/match'
import { ACTIONS, type Action, type GameEvent, type Input, type PlayerStats } from '../engine/player'
import { DEFAULT_RULES, SETTINGS } from '../engine/rules'
import { isCharacterId, type CharacterId } from '../characters/catalog'

export const ROOM_ID = /^[a-f0-9]{32}$/
export const randomId = () => crypto.randomUUID().replaceAll('-','')
export const ONLINE_RULES = {...DEFAULT_RULES, seed:''}
export const PLAY_ACTIONS = ACTIONS.filter(action=>action!=='pause')
export const PRESS_LIMIT = 16
export const actionMask = (actions: ReadonlySet<Action>) =>
  PLAY_ACTIONS.reduce((mask,action,i)=>actions.has(action) ? mask | (1<<i) : mask,0)
export const heldActions = (mask: number) => new Set(PLAY_ACTIONS.filter((_,i)=>mask & (1<<i)))

export type Seat = {name:string; connected:boolean; ready:boolean; botLevel:number; character?:CharacterId}
export type LobbyState = {host:number; seats:Seat[]; phase:'lobby'|'countdown'|'playing'|'paused'|'results'; missing:string[]}
export type ClientMessage =
  | {type:'join'; token:string; name:string; create:boolean}
  | {type:'ready'; value:boolean}
  | {type:'character'; slot:number; id:CharacterId}
  | {type:'bot'; slot:number; level:number}
  | {type:'start'|'lobby'|'leave'}
  | {type:'input'; held:number; pressed:Action[]}

export function parseClient(raw: unknown): ClientMessage | null {
  if (typeof raw!=='string' || raw.length>1024) return null
  try {
    const message = JSON.parse(raw) as ClientMessage
    if (!message || typeof message!=='object') return null
    switch (message.type) {
      case 'join': return typeof message.token==='string' && ROOM_ID.test(message.token) &&
        typeof message.name==='string' && message.name.trim().length>0 && message.name.length<=24 && typeof message.create==='boolean' ? message : null
      case 'ready': return typeof message.value==='boolean' ? message : null
      case 'character': return Number.isInteger(message.slot) && message.slot>=0 && message.slot<4 && isCharacterId(message.id) ? message : null
      case 'bot': return Number.isInteger(message.slot) && message.slot>=0 && message.slot<4 &&
        Number.isInteger(message.level) && message.level>=1 && message.level<=10 ? message : null
      case 'input': return Number.isInteger(message.held) && message.held>=0 && message.held<(1<<PLAY_ACTIONS.length) &&
        Array.isArray(message.pressed) && message.pressed.length<=PRESS_LIMIT &&
        message.pressed.every(action=>PLAY_ACTIONS.some(allowed=>allowed===action)) ? message : null
      case 'start': case 'lobby': case 'leave': return message
      default: return null
    }
  } catch { return null }
}

export const makeMatch = (seed: string, levels: (number|null)[]) => new BlitzMatch(ONLINE_RULES,seed,
  levels.map((level,slot)=>({slot,team:teamForSlot(slot),level:level??undefined})))

const CELLS = [null,'I','J','L','O','S','T','Z','G','zone'] as const
const boardText = (p: BlitzMatch['players'][number]) => p.board.map(row=>row.map(cell=>CELLS.indexOf(cell)).join('')).join('')

export function snapshot(match: BlitzMatch) {
  return {
    now:match.now, left:match.left, transition:match.transition, rotation:match.rotation, turn:match.turn,
    finished:match.finished, winningTeam:match.winningTeam, stances:match.stances, sides:match.sides,
    totals:match.finished ? match.players.map((_,i)=>match.statsFor(i)) : null,
    players:match.players.map(p=>({board:boardText(p),active:p.active,hold:p.hold,next:p.next,dead:p.dead,
      stats:p.stats,danger:p.danger,garbage:p.garbage.queue,
      zone:{energy:p.zone.energy,remaining:p.zone.remaining,duration:p.zone.duration,lines:p.zone.lines}})),
  }
}

export type Snapshot = ReturnType<typeof snapshot>
export type MatchStart = {seed:string; names:string[]; levels:(number|null)[]; countdown:number; characters?:CharacterId[]}
export type Frame = {type:'frame'; state:Snapshot; events:{slot:number; event:GameEvent}[]; fallen:number[]}
export type ServerMessage = {type:'welcome'; slot:number} | {type:'lobby'; lobby:LobbyState} |
  ({type:'start'} & MatchStart) | {type:'countdown'; left:number} | Frame | {type:'error'; message:string; fatal?:boolean}

export class OnlineMatch extends BlitzMatch {
  private totals: PlayerStats[] | null = null
  private boards: string[] = []

  constructor(start: MatchStart) {
    super(ONLINE_RULES,start.seed,start.levels.map((level,slot)=>({slot,team:teamForSlot(slot),level:level??undefined})))
  }

  override statsFor(index: number) { return this.totals?.[index] ?? super.statsFor(index) }

  load(state: Snapshot) {
    this.now = state.now
    this.left = state.left
    this.transition = state.transition
    this.rotation = state.rotation
    this.turn = state.turn
    this.finished = state.finished
    this.winningTeam = state.winningTeam
    this.totals = state.totals
    for (const [i,side] of state.sides.entries()) Object.assign(this.sides[i],side)
    for (const [i,view] of state.players.entries()) {
      const player = this.players[i]
      this.stances[i] = state.stances[i]
      if (this.boards[i]!==view.board) {
        this.boards[i] = view.board
        let column = 0
        for (const row of player.board) for (let x=0;x<row.length;x++) row[x] = CELLS[Number(view.board[column++])]
        player.revision++
      }
      const {board,zone,garbage,...values} = view
      Object.assign(player,values)
      Object.assign(player.zone,zone)
      player.garbage.queue.splice(0,player.garbage.queue.length,...garbage)
    }
  }
}

export type RemoteInput = {held:number; pressed:Action[]}
export const consumeRemote = (input: RemoteInput): Input => ({held:heldActions(input.held),pressed:input.pressed.splice(0)})
export const START_TICKS = SETTINGS.countdown
