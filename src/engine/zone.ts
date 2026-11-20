import { HZ, SETTINGS, ZONE_PHASES, type Rules } from './rules'
export type ZoneResult = {warning:false; lines:number; attack:number}
const ZONE_NAMES = [[24,'Electris'],[23,'Infinitris'],[22,'Impossibilitris'],[21,'Kirbtris'],
  [20,'Ultimatris'],[18,'Perfectris'],[16,'Decahexatris'],[12,'Dodecatris'],[8,'Octoris'],[4,'Tetris']] as const
export const zoneTitle = (lines: number) => ZONE_NAMES.find(([min])=>lines>=min)?.[1] ??
  (['Sin ataque','Single','Double','Triple'][lines] ?? 'Zone')

export class Zone {
  energy = 0
  remaining = 0
  duration = 0
  lines = 0
  regularLines = 0
  private partial = 0
  private attack = 0
  get active() { return this.remaining > 0 }

  activate(rules: Rules) {
    if (!rules.zone || this.active || this.energy < rules.zoneMinimum) return false
    this.duration = Math.max(1, Math.round(rules.zoneSeconds * HZ * this.energy / 100))
    this.remaining = this.duration
    this.energy = this.lines = this.attack = 0
    return true
  }

  clear(lines: number, attack: number, rules: Rules,
    quarterLines = rules.zoneQuarterLines || ZONE_PHASES[0].lines) {
    if (this.active) {
      this.lines += lines
      this.attack += attack
      return 0
    }
    if (rules.zone && lines>0) {
      this.regularLines += lines
      const progress = this.partial+lines
      this.energy = Math.min(100,this.energy+25*Math.floor(progress/quarterLines))
      this.partial = progress%quarterLines
    }
    return attack
  }

  step(rules: Rules) {
    if (!this.active) return null
    this.remaining--
    const warningAt = Math.max(1, Math.min(SETTINGS.warningTicks, Math.floor(this.duration / 3)))
    if (this.remaining === warningAt) return {warning:true as const}
    if (this.remaining) return null
    return this.finish(rules)
  }

  finish(rules: Rules): ZoneResult {
    this.remaining = 0
    return {warning:false, lines:this.lines,
      attack:this.attack + (this.lines ? this.lines + rules.attack.zoneBonus : 0)}
  }
}
