import { Player, NO_INPUT, type Input } from './player'
import { pieceSource, randomFrom, seedOf } from './random'
import { PLAYERS, WIDTH, ticks, type Rules } from './rules'

export class Match {
  players: Player[]
  targets: number[]
  private attackers: number[]
  eliminated: number[][] = []
  now = 0
  finished = false
  winner: number | null = null
  private random: () => number

  constructor(readonly rules: Rules, readonly seed: string) {
    this.players = Array.from({length:PLAYERS},(_,i) => new Player(rules,
      pieceSource(rules.generator,seedOf(rules.shared ? seed : seed+':pieces:'+i))))
    this.targets = this.players.map((_,i) => (i+1)%PLAYERS)
    this.attackers = this.players.map(() => -1)
    this.random = randomFrom(seedOf(seed+':combat'))
  }

  private eligible(i: number) {
    return this.players.flatMap((player,j) => i !== j && !player.dead ? [j] : [])
  }

  private choose(i: number, direction: number) {
    for (let step = 1; step <= PLAYERS; step++) {
      const candidate = (this.targets[i]+PLAYERS+direction*step)%PLAYERS
      if (candidate !== i && !this.players[candidate].dead) return candidate
    }
    return -1
  }

  private targetFor(i: number, refreshRandom = false) {
    const set = this.eligible(i)
    if (!set.length || this.players[i].dead) return -1
    if (this.rules.target === 'random' && (refreshRandom || !set.includes(this.targets[i]))) {
      return set[Math.floor(this.random()*set.length)]
    }
    if (this.rules.target === 'counter' && set.includes(this.attackers[i])) return this.attackers[i]
    return set.includes(this.targets[i]) ? this.targets[i] : this.choose(i,1)
  }

  tick(inputs: readonly Input[] = []) {
    if (this.finished) return
    this.now++
    const aliveBefore = this.players.map(p => !p.dead)
    for (const [i,p] of this.players.entries()) {
      p.tick(inputs[i] ?? NO_INPUT,this.now)
    }
    const lost = this.players.flatMap((player,i) =>
      player.dead && !this.eliminated.some(group => group.includes(i)) ? [i] : [])
    if (lost.length) this.eliminated.push(lost)
    for (const [i,p] of this.players.entries()) {
      const before = this.targets[i]
      this.targets[i] = this.targetFor(i)
      if (this.rules.target === 'manual' && this.targets[i] >= 0) {
        for (const action of inputs[i]?.pressed ?? []) {
          if (action === 'prev' || action === 'next') this.targets[i] = this.choose(i, action === 'next' ? 1 : -1)
        }
      }
      if (aliveBefore[i] && !p.dead && before !== this.targets[i] && this.targets[i] >= 0) p.event('target')
    }
    const living = this.players.flatMap((p,i) => p.dead ? [] : [i])
    if (living.length <= 1) {
      for (const p of this.players) p.outbox = 0
      this.finished = true
      this.winner = living[0] ?? null
      if (this.winner !== null) this.players[this.winner].event('victory')
      return
    }

    // Resolve senders against the same pre-delivery counterattack state.
    const deliveries: {from:number; to:number; lines:number; hole:number}[] = []
    for (const [i,p] of this.players.entries()) {
      const lines = p.outbox
      p.outbox = 0
      if (p.dead || !lines) continue
      const to = this.targetFor(i,true)
      this.targets[i] = to
      if (to < 0) continue
      deliveries.push({from:i,to,lines,hole:Math.floor(this.random()*WIDTH)})
    }
    for (const {from,to,lines,hole} of deliveries) {
      const sender = this.players[from]
      const receiver = this.players[to]
      sender.stats.sent += lines
      sender.event('send',String(lines))
      this.attackers[to] = from
      receiver.garbage.push({lines,hole,ready:this.now+ticks(this.rules.garbageDelay)})
      receiver.event('incoming',String(lines))
    }
    for (const [i,p] of this.players.entries()) {
      this.targets[i] = this.targetFor(i)
      if (!p.dead) p.updateDanger(this.now)
    }
  }

  ranking() {
    const survivors = this.players.flatMap((p,i) => p.dead ? [] : [i])
    return [...(survivors.length ? [survivors] : []), ...this.eliminated.slice().reverse()]
  }
}
