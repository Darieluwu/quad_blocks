import { Player, NO_INPUT, type Input, type PlayerStats } from './player'
import { pieceSource, randomFrom, seedOf } from './random'
import { PLAYERS, RANDOM_TARGET_TICKS, WIDTH, ZONE_PHASES, ticks, type Rules } from './rules'
import { Bot } from './bot'

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
  private zonePhase = 0
  private pastStats: (PlayerStats|undefined)[] = []

  constructor(readonly rules: Rules, readonly seed: string, readonly roster: readonly Participant[] = defaultRoster(),
    trackCombat = false) {
    this.teams = roster.every(p=>p.team!==undefined)
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
    if (this.finished) return
    this.now++
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

    // Resolve all deliveries against the same pre-delivery targets.
    const deliveries: {from:number; to:number; lines:number}[] = []
    for (const [i,p] of this.players.entries()) {
      const lines = p.dead || finished ? p.finalZoneAttack : p.outbox
      p.outbox = p.finalZoneAttack = 0
      if (!lines) continue
      const former = previousTargets[i]
      const to = p.dead ? this.opponent(i,former) ? former : this.choose(i,1,former) : this.targets[i]
      if (to<0) continue
      deliveries.push({from:i,to,lines})
    }
    for (const {from,to,lines} of deliveries) this.deliver(from,to,lines,this.now)
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
    }
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

  protected deliver(from: number,to: number,lines: number,receiverClock: number) {
    const sender = this.players[from]
    const receiver = this.players[to]
    sender.stats.sent += lines
    sender.event('send',String(lines))
    this.attackers[to] = from
    receiver.garbage.push({lines,hole:Math.floor(this.random()*WIDTH),
      ready:receiverClock+ticks(this.rules.garbageDelay),source:from})
    receiver.event('incoming',String(lines),from)
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
