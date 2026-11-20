import { CASUAL_RULES, DEFAULT_RULES, GENERATORS, TARGETS, type Rules } from './engine/rules'
import { defaultSlot, type Slot } from './input'
export const MIX = {master:0.72,move:0.52,play:0.8,attack:0.64,alert:0.55,zone:0.75}
export type Mix = typeof MIX & {mute:boolean}
export type Profile = 'Competitivo'|'Casual'|'Personalizado'
export type Settings = {rules:Rules; profile:Profile; reduced:boolean; metrics:boolean; audio:Mix; slots:Slot[]}
const STORAGE = 'quad-blocks-v1'
export const NUMBER_RULES = {
  gravity:['Gravedad inicial (celdas/s)',0,120,0.05], progression:['Progresión por línea',0,10,0.05],
  das:['DAS (ms)',0,1000,1], arr:['ARR (ms)',0,500,1], soft:['Soft Drop (celdas/s)',0,120,1],
  lock:['Lock Delay (ms)',0,2000,1], resets:['Reinicios de bloqueo',0,30,1],
  buffer:['Búfer de entrada (ms)',0,300,1], garbageDelay:['Demora de basura (ms)',0,10000,1],
  garbageCap:['Límite de basura por bloqueo',0,20,1], zoneSeconds:['Zone a carga completa (s)',1,60,0.5],
  charge:['Carga por línea (%)',0,100,0.5], zoneMinimum:['Carga mínima de Zone (%)',1,100,1],
} as const
export const ATTACK_LABELS: Record<keyof Rules['attack'],string> = {
  double:'Double',triple:'Triple',quad:'Tetris',mini:'Mini Single',miniDouble:'Mini Double',
  tSingle:'T-Spin Single',tDouble:'T-Spin Double',tTriple:'T-Spin Triple',extraSpin:'Spin adicional',
  comboStep:'Intervalo del combo',comboMax:'Máximo del combo',backToBack:'Back-to-Back',
  perfect:'Perfect Clear',zoneBonus:'Bonificación Zone',
}
export const freshRules = (profile: Profile = 'Competitivo') => structuredClone(profile === 'Casual' ? CASUAL_RULES : DEFAULT_RULES)
export function loadSettings(): Settings {
  const defaults: Settings = {rules:freshRules(),profile:'Competitivo',reduced:false,metrics:false,
    audio:{...MIX,mute:false},slots:Array.from({length:4},(_,i) => defaultSlot(i))}
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Partial<Settings>|null
    if (!value) return defaults
    const rules = {...defaults.rules,...value.rules,attack:{...defaults.rules.attack,...value.rules?.attack}}
    for (const [key,[,min,max]] of Object.entries(NUMBER_RULES)) {
      const field = key as keyof typeof NUMBER_RULES
      const number = rules[field]
      rules[field] = Number.isFinite(number) ? Math.min(max,Math.max(min,number)) : defaults.rules[field]
    }
    if (!GENERATORS.includes(rules.generator)) rules.generator = DEFAULT_RULES.generator
    if (!TARGETS.includes(rules.target)) rules.target = DEFAULT_RULES.target
    return {...defaults,...value,rules,audio:{...defaults.audio,...value.audio},
      slots:defaults.slots.map((slot,i) => ({...slot,...value.slots?.[i],
        keys:{...slot.keys,...value.slots?.[i]?.keys},pad:{...slot.pad,...value.slots?.[i]?.pad}}))}
  } catch { return defaults }
}
export function saveSettings(settings: Settings) {
  try { localStorage.setItem(STORAGE,JSON.stringify(settings)); return true }
  catch { return false }
}
