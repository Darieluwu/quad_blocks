export const HZ = 60
export const WIDTH = 10
export const VISIBLE = 20
export const HIDDEN = 4
export const HEIGHT = VISIBLE + HIDDEN
export const NEXT = 5
export const PLAYERS = 4

export const GENERATORS = ['bag7', 'random', 'history', 'bag14'] as const
export const TARGETS = ['manual', 'random', 'counter'] as const
export type Generator = typeof GENERATORS[number]
export type TargetMode = typeof TARGETS[number]
export const ATTACK = {
  double: 1, triple: 2, quad: 4, mini: 1, miniDouble: 2,
  tSingle: 2, tDouble: 4, tTriple: 6, extraSpin: 2,
  comboStep: 2, comboMax: 4, backToBack: 1, perfect: 10, zoneBonus: 2,
}
export const DEFAULT_RULES = {
  generator: 'bag7' as Generator, shared: true, seed: '',
  gravity: 1, progression: 0.15, das: 130, arr: 32, soft: 32, lock: 500,
  resets: 15, buffer: 100, floorKicks: true, target: 'manual' as TargetMode,
  garbageDelay: 650, garbageCap: 8, zone: true, zoneSeconds: 12,
  charge: 12.5, zoneMinimum: 25, extraSpins: true, attack: ATTACK,
}
export type Rules = typeof DEFAULT_RULES
export const CASUAL_RULES: Rules = {
  ...DEFAULT_RULES, gravity: 0.65, progression: 0.05, lock: 700,
  garbageDelay: 950, garbageCap: 5, charge: 18, zoneSeconds: 15,
}
export const SETTINGS = {early: 14, critical: 18, alarmTicks: 210, warningTicks: 120,
  axis: 0.58, countdown: 180, effectTicks: 100, gravityMax: 120, catchupTicks: 8}
export const ticks = (ms: number) => Math.ceil(ms * HZ / 1000)
