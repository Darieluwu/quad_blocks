import { HZ } from './engine/rules'

export const BATTLE_INTRO_TICKS = {vs4:2*HZ,teams:2.5*HZ,blitz:3*HZ}
export type BattleIntroMode = keyof typeof BATTLE_INTRO_TICKS
export const reducedIntroTicks = (mode:BattleIntroMode) => Math.round(BATTLE_INTRO_TICKS[mode]*.65)

export const BATTLE_INTRO_OPTIONS = {full:'Completas',reduced:'Reducidas',off:'Desactivadas'}
export type BattleIntroPreference = keyof typeof BATTLE_INTRO_OPTIONS
export const isBattleIntroPreference = (value: unknown): value is BattleIntroPreference =>
  typeof value==='string' && Object.hasOwn(BATTLE_INTRO_OPTIONS,value)
