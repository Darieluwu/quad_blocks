import { HZ, SETTINGS, type Rules } from './rules'

export class Zone {
  energy = 0
  remaining = 0
  duration = 0
  lines = 0
  private attack = 0
  get active() { return this.remaining > 0 }

  activate(rules: Rules) {
    if (!rules.zone || this.active || this.energy < rules.zoneMinimum) return false
    this.duration = Math.max(1, Math.round(rules.zoneSeconds * HZ * this.energy / 100))
    this.remaining = this.duration
    this.energy = this.lines = this.attack = 0
    return true
  }

  clear(lines: number, attack: number, rules: Rules) {
    if (this.active) {
      this.lines += lines
      this.attack += attack
      return 0
    }
    if (rules.zone) this.energy = Math.min(100, this.energy + lines * rules.charge)
    return attack
  }

  step(rules: Rules) {
    if (!this.active) return null
    this.remaining--
    const warningAt = Math.max(1, Math.min(SETTINGS.warningTicks, Math.floor(this.duration / 3)))
    if (this.remaining === warningAt) return {warning:true as const}
    if (this.remaining) return null
    return {warning:false as const, lines:this.lines,
      attack:this.attack + (this.lines ? this.lines + rules.attack.zoneBonus : 0)}
  }
}
