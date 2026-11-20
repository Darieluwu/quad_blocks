import { Bot } from './bot'
import { Match, type Participant } from './match'
import { NO_INPUT, Player, type Input } from './player'
import { pieceSource, randomFrom, seedOf } from './random'
import { HZ, ticks, type Rules } from './rules'

export const DEFAULT_BLITZ = {turn:30, countdown:5, defenseCap:6, defensePercent:50,
  zone:true, revives:2, zoneRescueCap:6, effects:true}
export type BlitzRules = typeof DEFAULT_BLITZ
export const BLITZ_TRANSITION = ticks(400)
const RESCUES = [{plays:1,power:6},{plays:2,power:10}]
type Rescue = {stage:1|2; done:number; goal:number; zonePower:number}
export type Stance = 'attack'|'defense'
type Side = {
  members:number[]; active:number; used:number; defended:number; rescue:Rescue|null; revivedAt:number; swapped:boolean;
}

export class BlitzMatch extends Match {
  readonly sides: [Side,Side]
  readonly clocks = [0,0,0,0]
  readonly stances: Stance[] = ['attack','attack','attack','attack']
  readonly turnTicks: number
  readonly warningTicks: number
  left: number
  transition = 0
  rotation: 'normal'|'emergency' = 'normal'
  turn = 1

  constructor(rules: Rules,seed: string,roster: readonly Participant[],readonly blitz: BlitzRules = DEFAULT_BLITZ) {
    super({...rules,zone:rules.zone && blitz.zone},seed,roster,true)
    const sides = ([0,1] as const).map(team=>{
      const members = roster.flatMap((p,i)=>p.team===team ? [i] : [])
      if (members.length!==2) throw new Error('Blitz requiere dos participantes por equipo.')
      const random = randomFrom(seedOf(seed+':blitz:'+team))
      return {members,active:members[Math.floor(random()*members.length)],used:0,defended:0,rescue:null,revivedAt:-Infinity,swapped:false}
    })
    this.sides = [sides[0],sides[1]]
    this.turnTicks = Math.max(1,Math.round(blitz.turn*HZ))
    this.warningTicks = Math.min(this.turnTicks,Math.round(blitz.countdown*HZ))
    this.left = this.turnTicks
    this.updateTargets()
  }

  private partner(side: Side) { return side.members.find(i=>i!==side.active)! }
  get canRotate() { return this.sides.some(side=>!this.players[this.partner(side)].dead) }

  private prepareRescue(side: Side) {
    const goal = RESCUES[side.used]
    if (!goal || side.used>=this.blitz.revives || !this.players[this.partner(side)].dead) return null
    return side.rescue ??= {stage:1,done:0,goal:goal.plays,zonePower:0}
  }

  private updateTargets() {
    this.targets.fill(-1)
    for (const [a,b] of [[this.sides[0].active,this.sides[1].active],[this.sides[1].active,this.sides[0].active]]) {
      if (!this.players[a].dead && !this.players[b].dead) this.targets[a] = b
    }
  }

  private evaluateRescue(side: Side) {
    const player = this.players[side.active]
    const ally = this.partner(side)
    const plays = player.combat.splice(0)
    const mission = player.dead ? null : this.prepareRescue(side)
    if (!mission) {
      side.rescue = null
      return
    }
    const goal = RESCUES[side.used]
    for (const play of plays) {
      if (mission.stage===1) {
        if (play.kind==='lock' && play.qualifies && ++mission.done>=mission.goal) {
          mission.stage = 2
          mission.done = 0
          mission.goal = goal.power
          player.event('blitzChallenge','2')
        }
        continue
      }
      if (play.kind==='zoneEnd') {
        if (mission.zonePower) mission.done += Math.min(this.blitz.zoneRescueCap,mission.zonePower+this.rules.attack.zoneBonus)
        mission.zonePower = 0
      } else if (play.zoned) mission.zonePower += play.power
      else mission.done += play.power
      if (mission.done>=mission.goal) {
        player.event('blitzChallenge','completo')
        this.revive(ally,side)
        return
      }
    }
  }

  private revive(index: number, side: Side) {
    side.used++
    side.rescue = null
    side.revivedAt = this.now
    const {slot,level} = this.roster[index]
    const seed = this.seed+':revive:'+slot+':'+side.used
    this.players[index] = new Player(this.rules,pieceSource(this.rules.generator,seedOf(seed)),true)
    this.bots[index] = level===undefined ? null : new Bot(level,seed)
    this.clocks[index] = 0
    this.stances[index] = 'attack'
    this.players[index].event('blitzRevived')
  }

  private flushAttack(side: Side, enemy: number) {
    const from = side.active
    const player = this.players[from]
    let power = player.dead ? player.finalZoneAttack : player.outbox
    player.outbox = player.finalZoneAttack = 0
    if (power<=0) return
    if (this.stances[from]==='defense') {
      const ally = this.players[this.partner(side)]
      const portion = Math.floor(power*this.blitz.defensePercent/100)
      power -= portion
      const allowed = Math.min(portion,Math.max(0,this.blitz.defenseCap-side.defended))
      if (allowed && !ally.dead) {
        const helped = allowed-ally.garbage.cancel(allowed)
        if (helped) {
          side.defended += helped
          player.event('blitzGuard',String(helped))
          ally.event('blitzProtected',String(helped))
        }
      }
    }
    if (power && !this.players[enemy].dead) this.deliver(from,enemy,power,this.clocks[enemy])
  }

  private finishIfNeeded() {
    const living = ([0,1] as const).filter(team=>this.sides[team].members.some(i=>!this.players[i].dead))
    if (living.length===2) return false
    this.finished = true
    this.winningTeam = living[0] ?? null
    if (living.length) this.players[this.sides[living[0]].active].event('blitzVictory')
    return true
  }

  private rotate(emergency: boolean) {
    this.rotation = emergency ? 'emergency' : 'normal'
    for (const side of this.sides) {
      const previous = side.active
      const ally = this.partner(side)
      if (emergency && this.players[side.active].dead) {
        side.active = ally
        this.prepareRescue(side)
        this.players[ally].event('blitzLast')
      } else if (!emergency && !this.players[ally].dead) side.active = ally
      side.swapped = previous!==side.active
      side.defended = 0
    }
    this.turn++
    this.left = this.turnTicks
    this.transition = BLITZ_TRANSITION
    const announcer = this.players[this.sides[0].active]
    announcer.event('blitzChange')
    announcer.event(emergency ? 'blitzEmergency' : 'blitzRotate')
    this.updateTargets()
  }

  override tick(inputs: readonly Input[] = []) {
    if (this.finished) return
    if (this.transition) { this.transition--; return }
    this.now++
    const quarterLines = this.zoneChargeCost()
    const rotating = this.canRotate
    if (rotating && this.left<=this.warningTicks && this.left%HZ===0) this.players[this.sides[0].active].event('blitzWarning')
    for (const side of this.sides) {
      const i = side.active
      const p = this.players[i]
      if (p.dead) continue
      p.zoneAllowed = !rotating || this.left>this.warningTicks
      const ally = this.players[this.partner(side)]
      const rescue = this.prepareRescue(side)
      const bot = this.bots[i]
      const clock = ++this.clocks[i]
      const input = bot?.input(p,clock,{
        allyGarbage:ally.garbage.total, allyDead:ally.dead, stance:this.stances[i],
        canProtect:side.defended<this.blitz.defenseCap && this.blitz.defensePercent>0,
        turnLeft:rotating ? this.left : Infinity, warn:this.warningTicks,
        rescue:rescue?.stage ?? 0, rescueRemaining:rescue ? rescue.goal-rescue.done : 0,
        zoneRescueRoom:Math.max(0,this.blitz.zoneRescueCap-(rescue?.zonePower ?? 0)),
      }) ?? inputs[i] ?? NO_INPUT
      if (input.pressed.filter(action=>action==='stance').length%2) {
        this.stances[i] = this.stances[i]==='attack' ? 'defense' : 'attack'
        p.event('blitzStance')
      }
      p.tick(input,clock,quarterLines)
    }
    if (rotating) this.left--
    else this.left = this.turnTicks
    const turnEnded = rotating && this.left===0
    const emergency = this.sides.some(side=>this.players[side.active].dead)
    if (!emergency && turnEnded) for (const side of this.sides) this.players[side.active].endZone()
    for (const side of this.sides) this.evaluateRescue(side)
    const [a,b] = this.sides
    this.flushAttack(a,b.active)
    this.flushAttack(b,a.active)
    for (const side of this.sides) {
      const p = this.players[side.active]
      if (p.dead) {
        if (!p.events.some(event=>event.type==='blitzDown')) p.event('blitzDown')
      } else p.updateDanger(this.clocks[side.active])
    }
    if (this.finishIfNeeded()) { this.updateTargets(); return }
    if (emergency || turnEnded) this.rotate(emergency)
  }

}
