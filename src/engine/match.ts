import { Player, NO_INPUT, type Input, type PlayerStats } from './player'
import { pieceSource, randomFrom, seedOf } from './random'
import { PLAYERS, RANDOM_TARGET_TICKS, WIDTH, ZONE_PHASES, ticks, type Rules } from './rules'
import { Bot } from './bot'
import { scaleLines, STAND, standEffect, standEvent, standState, type StandState } from './last-stand'

export type Team = 0|1
export type Participant = {slot:number; level?:number; team?:Team}
export const teamForSlot = (slot: number): Team => slot < PLAYERS/2 ? 0 : 1
const defaultRoster = (): Participant[] => Array.from({length:PLAYERS},(_,slot)=>({slot}))

export class Match {
  players: Player[]
  targets: number[]
  protected attackers: number[]
  private randomAt: number[]
  eliminated: number[][] = []
  now = 0
  finished = false
  winner: number | null = null
  winningTeam: Team | null = null
  readonly teams: boolean
  private random: () => number
  private targetRandom: () => number
  protected bots: (Bot|null)[]
  zonePhase = 0
  private pastStats: (PlayerStats|undefined)[] = []
  stand: StandState|null

  constructor(readonly rules: Rules, readonly seed: string, readonly roster: readonly Participant[] = defaultRoster(),
    trackCombat = false, enableStand = false) {
    this.teams = roster.every(p=>p.team!==undefined)
    this.stand = enableStand && ([0,1] as const).every(team=>roster.filter(p=>p.team===team).length===2) &&
      roster.length===4 ? standState() : null
    this.players = roster.map(({slot}) => new Player(rules,
      pieceSource(rules.generator,seedOf(rules.shared ? seed : seed+':pieces:'+slot)),trackCombat))
    this.random = randomFrom(seedOf(seed+':combat'))
    this.targetRandom = randomFrom(seedOf(seed+':target'))
    this.targets = this.players.map((_,i) => this.choose(i,1,i))
    this.randomAt = this.players.map(() => 0)
    this.attackers = this.players.map(() => -1)
    if (rules.target==='random') this.targets = this.players.map((_,i)=>this.targetFor(i))
    this.bots = roster.map(({slot,level},i) => level===undefined ? null : new Bot(level,seed+':bot:'+slot,i*2))
  }

  private opponent(i: number, j: number) {
    return i!==j && !!this.players[j] && !this.players[j].dead && (!this.teams || this.roster[i].team!==this.roster[j].team)
  }

  private eligible(i: number) {
    return this.players.flatMap((_,j) => this.opponent(i,j) ? [j] : [])
  }

  private choose(i: number, direction: number, from = this.targets[i]) {
    const count = this.players.length
    for (let step = 1; step <= count; step++) {
      const candidate = (Math.max(0,from)+count+direction*step)%count
      if (this.opponent(i,candidate)) return candidate
    }
    return -1
  }

  private targetFor(i: number) {
    const set = this.eligible(i)
    if (!set.length || this.players[i].dead) return -1
    const previous = this.targets[i]
    if (this.rules.target === 'random' && (this.now>=this.randomAt[i] || !set.includes(previous))) {
      const choices = this.randomAt[i] && set.length>1 ? set.filter(target=>target!==previous) : set
      this.randomAt[i] = this.now+RANDOM_TARGET_TICKS
      return choices[Math.floor(this.targetRandom()*choices.length)]
    }
    if (this.rules.target === 'counter' && set.includes(this.attackers[i])) return this.attackers[i]
    return set.includes(previous) ? previous : this.choose(i,1)
  }

  tick(inputs: readonly Input[] = []) {
    if (this.finished || this.standPaused) return
    this.now++
    if (this.stand?.active) for (const [index,p] of this.players.entries()) {
      if (p.foundationUntil && p.foundationUntil<=this.now) {
        if (p.clearFoundation()) this.bots[index]?.resetPlan()
        if (!p.dead) p.event('standExpire')
      }
      if (p.stand?.until!=null && p.stand.until<=this.now) p.expireStand()
    }
    const quarterLines = this.zoneChargeCost()
    const aliveBefore = this.players.map(p => !p.dead)
    for (const [i,p] of this.players.entries()) {
      p.tick(this.bots[i]?.input(p,this.now) ?? inputs[i] ?? NO_INPUT,this.now,quarterLines)
    }
    const lost = this.players.flatMap((player,i) =>
      player.dead && !this.eliminated.some(group => group.includes(i)) ? [i] : [])
    if (lost.length) this.eliminated.push(lost)
    const previousTargets = this.targets.slice()
    for (const [i,p] of this.players.entries()) {
      const before = this.targets[i]
      this.targets[i] = this.targetFor(i)
      if (!this.bots[i] && this.rules.target === 'manual' && this.targets[i] >= 0) {
        for (const action of inputs[i]?.pressed ?? []) {
          if (action === 'prev' || action === 'next') this.targets[i] = this.choose(i, action === 'next' ? 1 : -1)
        }
      }
      if (aliveBefore[i] && !p.dead && before !== this.targets[i] && this.targets[i] >= 0) p.event('target')
    }
    const living = this.players.flatMap((p,i) => p.dead ? [] : [i])
    const survivingTeams = new Set(living.map(i=>this.roster[i].team))
    const finished = this.teams ? survivingTeams.size<=1 : living.length<=1
    if ((this.stand?.active==='single' && living.length!==3) || (this.stand?.active==='double' && finished)) this.endStand()

    // Resolve all deliveries against the same pre-delivery targets.
    const deliveries: {from:number; to:number; lines:number; secondary?:true}[] = []
    for (const [i,p] of this.players.entries()) {
      const lines = p.dead || finished ? p.finalZoneAttack : p.outbox
      p.outbox = p.finalZoneAttack = 0
      if (!lines) continue
      const former = previousTargets[i]
      const to = p.dead ? this.opponent(i,former) ? former : this.choose(i,1,former) : this.targets[i]
      if (to<0) continue
      deliveries.push({from:i,to,lines})
      if (p.stand?.prize==='doubleAttack') {
        const secondary = this.eligible(i).find(index=>index!==to)
        if (secondary!==undefined) {
          const extra = scaleLines(p.stand,lines,STAND.doubleAttack.secondary)
          if (extra) deliveries.push({from:i,to:secondary,lines:extra,secondary:true})
        }
      } else if (p.stand?.prize==='revive') p.stand.sent += lines
    }
    for (const {from,to,lines,secondary} of deliveries) this.deliver(from,to,lines,this.now,secondary)
    for (const [i,p] of this.players.entries()) {
      const target = this.targetFor(i)
      if (!p.dead && target>=0 && target!==this.targets[i]) p.event('target')
      this.targets[i] = target
      if (!p.dead) p.updateDanger(this.now)
    }
    if (finished) {
      this.finished = true
      this.winner = this.teams ? null : living[0] ?? null
      this.winningTeam = this.teams && living.length ? this.roster[living[0]].team! : null
      if (living.length) this.players[living[0]].event('victory')
      if (this.stand) this.stand.windows = [null,null]
    } else if (this.stand) {
      this.detectStand(living,lost)
      this.tryRevive()
      for (const [index,p] of this.players.entries()) {
        if (p.foundationUntil && !p.dead && p.placeFoundation(this.now+1)) this.bots[index]?.resetPlan()
      }
    }
  }

  get standPaused() {
    return !!this.stand?.event && this.stand.elapsed<STAND.presentation
  }

  advanceStand(elapsed:number) {
    const state = this.stand
    if (!state?.event || !this.standPaused) return
    state.elapsed = Math.max(state.elapsed,Math.min(STAND.presentation,elapsed))
    if (this.standPaused) return
    state.active = state.event.kind
    for (const {index,prize} of state.event.awards) {
      const p = this.players[index]
      if (prize==='cleanSlate' && p.cleanSlate()) this.bots[index]?.resetPlan()
      if (prize==='surgeBreak' || prize==='surgeResonance') {
        if (p.rules.zone) p.zone.energy = Math.min(100,p.zone.energy+STAND[prize].charge)
      }
      p.stand = standEffect(prize,this.now+1)
      if (prize==='cursedFoundation') for (const opponent of this.eligible(index)) {
        const rival = this.players[opponent]
        rival.foundationUntil = p.stand.until!
        if (rival.placeFoundation(this.now+1)) this.bots[opponent]?.resetPlan()
      }
    }
  }

  private detectStand(living:number[],lost:number[]) {
    const state = this.stand!
    if (state.doubleUsed || state.active || this.standPaused) return
    const byTeam = ([0,1] as const).map(team=>living.filter(index=>this.roster[index].team===team))
    for (const team of [0,1] as const) {
      if (byTeam[team].length!==1) state.windows[team] = null
      else if (lost.some(index=>this.roster[index].team===team)) state.windows[team] = this.now
    }
    const [a,b] = state.windows
    if (living.length===2) {
      if (!state.used.some(Boolean) && a!==null && b!==null && Math.abs(a-b)<=STAND.window) {
        state.doubleUsed = true
        state.event = standEvent(this.seed,state,this.now,'double',byTeam.flat())
        state.elapsed = 0
      }
      state.windows = [null,null]
      return
    }
    for (const team of [0,1] as const) {
      const start = state.windows[team]
      if (start===null || this.now-start<STAND.window || state.used[team]) continue
      state.used[team] = true
      state.windows = [null,null]
      state.event = standEvent(this.seed,state,this.now,'single',byTeam[team])
      state.elapsed = 0
    }
  }

  private endStand() {
    this.stand!.active = null
    this.stand!.windows = [null,null]
    for (const [index,p] of this.players.entries()) {
      p.expireStand()
      if (p.clearFoundation()) this.bots[index]?.resetPlan()
    }
  }

  private tryRevive() {
    const state = this.stand!
    if (state.active!=='single' || state.revived) return
    const index = state.event!.awards[0].index
    const effect = this.players[index].stand
    if (effect?.prize!=='revive' || !effect.tetris || !effect.spin || effect.sent<STAND.revive.sent) return
    const ally = this.roster.findIndex((p,i)=>i!==index && p.team===this.roster[index].team)
    const {slot,level} = this.roster[ally]
    const seed = this.seed+':last-stand:revive:'+slot
    this.endStand()
    state.revived = true
    this.archiveStats(ally)
    const revision = this.players[ally].revision
    this.players[ally] = new Player(this.rules,pieceSource(this.rules.generator,seedOf(seed)))
    this.players[ally].revision = revision+1
    if (level!==undefined) this.bots[ally] = new Bot(level,seed)
    this.eliminated = this.eliminated.map(group=>group.filter(i=>i!==ally)).filter(group=>group.length)
    this.targets[ally] = this.choose(ally,1,ally)
    this.attackers[ally] = -1
    this.players[ally].event('standRevived')
  }

  protected zoneChargeCost() {
    if (this.rules.zoneQuarterLines) return this.rules.zoneQuarterLines
    for (const player of this.players) {
      while (this.zonePhase<ZONE_PHASES.length-1 && player.zone.regularLines>=ZONE_PHASES[this.zonePhase+1].at) {
        this.zonePhase++
      }
    }
    return ZONE_PHASES[this.zonePhase].lines
  }

  protected deliver(from: number,to: number,lines: number,receiverClock: number,secondary?:true) {
    const sender = this.players[from]
    const receiver = this.players[to]
    sender.stats.sent += lines
    sender.event('send',String(lines))
    const hole = Math.floor(this.random()*WIDTH)
    lines = receiver.receiveStand(lines)
    if (!lines) return
    this.attackers[to] = from
    const delay = receiver.stand?.prize==='timeFracture' ? STAND.timeFracture.delay : 0
    receiver.garbage.push({lines,hole,ready:receiverClock+ticks(this.rules.garbageDelay)+delay,source:from})
    receiver.events.push({type:'incoming',detail:String(lines),source:from,...(secondary ? {secondary} : {})})
  }

  ranking() {
    if (this.teams && this.finished) {
      if (this.winningTeam===null) return [this.players.map((_,i)=>i)]
      const [winners,losers]: number[][] = [[],[]]
      this.roster.forEach(({team},i)=>(team===this.winningTeam ? winners : losers).push(i))
      return [winners,losers]
    }
    const survivors = this.players.flatMap((p,i) => p.dead ? [] : [i])
    return [...(survivors.length ? [survivors] : []), ...this.eliminated.slice().reverse()]
  }

  statsFor(index: number): PlayerStats {
    const total = {...this.players[index].stats}
    const past = this.pastStats[index]
    if (past) for (const field of Object.keys(total) as (keyof PlayerStats)[]) total[field] += past[field]
    return total
  }

  protected archiveStats(index: number) { this.pastStats[index] = this.statsFor(index) }

  mvps() {
    const sent = this.players.map((_,i)=>this.statsFor(i).sent)
    const best = Math.max(...sent)
    return sent.flatMap((lines,i)=>lines===best ? [i] : [])
  }

  winnerBoards() {
    if (!this.finished) return []
    return this.teams ? this.players.flatMap((p,i)=>!p.dead && this.roster[i].team===this.winningTeam ? [i] : []) :
      this.winner===null ? [] : [this.winner]
  }
}
