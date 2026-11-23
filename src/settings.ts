import { CASUAL_RULES, DEFAULT_RULES, GENERATORS, TARGETS, type Rules } from './engine/rules'
import { conflict, defaultSlot, type Slot } from './input'
import { botLevel } from './engine/bot'
import { DEFAULT_BLITZ, type BlitzRules } from './engine/blitz'
import { CHARACTER_OPTIONS, uniqueCharacters, type CharacterId, type CharacterOptions } from './characters/catalog'
export const MIX = {master:0.72,move:0.52,play:0.8,attack:0.64,alert:0.55,zone:0.75,effects:0.58,music:0.10}
export type Mix = typeof MIX & {mute:boolean}
export type Profile = 'Competitivo'|'Casual'|'Personalizado'
export type Settings = {rules:Rules; profile:Profile; reduced:boolean; metrics:boolean; audio:Mix; slots:Slot[];
  controllers: {bot:boolean; level:number}[]; blitz:BlitzRules; characters:CharacterId[]; characterOptions:CharacterOptions}
type StoredSettings = Partial<Omit<Settings,'rules'>> & {rules?:Partial<Rules> & {charge?:number}}
const STORAGE = 'quad-blocks-v1'
export const NUMBER_RULES = {
  gravity:['Gravedad inicial (celdas/s)',0,120,0.05], progression:['Progresión por línea',0,10,0.05],
  das:['DAS (ms)',0,1000,1], arr:['ARR (ms)',0,500,1], soft:['Soft Drop (celdas/s)',0,120,1],
  lock:['Lock Delay (ms)',0,2000,1], resets:['Reinicios de bloqueo',0,30,1],
  buffer:['Búfer de entrada (ms)',0,300,1], garbageDelay:['Demora de basura (ms)',0,10000,1],
  garbageCap:['Límite de basura por bloqueo',0,20,1], zoneSeconds:['SURGE a carga completa (s)',1,60,0.5],
  zoneQuarterLines:['Líneas por cuarto de SURGE (0 = por fases)',0,100,1], zoneMinimum:['Carga mínima de SURGE (%)',1,100,1],
} as const
export const BLITZ_NUMBERS = {
  turn:['Turno (segundos)',1,120], countdown:['Cuenta regresiva (segundos)',0,30],
  defenseCap:['Límite de defensa por turno',0,40], defensePercent:['Protección (%)',0,100],
  revives:['Resurrecciones por equipo',0,2], zoneRescueCap:['Aporte máximo de SURGE al rescate',0,40],
} as const
export const ATTACK_LABELS: Record<keyof Rules['attack'],string> = {
  double:'Double',triple:'Triple',quad:'Tetris',mini:'Mini Single',miniDouble:'Mini Double',
  tSingle:'T-Spin Single',tDouble:'T-Spin Double',tTriple:'T-Spin Triple',extraSpin:'Spin adicional',
  comboStep:'Intervalo del combo',comboMax:'Máximo del combo',backToBack:'Back-to-Back',
  perfect:'Perfect Clear',zoneBonus:'Bonificación SURGE',
}
export const freshRules = (profile: Profile = 'Competitivo') => structuredClone(profile === 'Casual' ? CASUAL_RULES : DEFAULT_RULES)
export function loadSettings(): Settings {
  const defaults: Settings = {rules:freshRules(),profile:'Competitivo',reduced:false,metrics:false,
    audio:{...MIX,mute:false},slots:Array.from({length:4},(_,i) => defaultSlot(i)),
    controllers:Array.from({length:4},()=>({bot:false,level:5})),blitz:{...DEFAULT_BLITZ},
    characters:uniqueCharacters(null),characterOptions:{...CHARACTER_OPTIONS}}
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as StoredSettings|null
    if (!value) return defaults
    const {charge,...savedRules} = value.rules ?? {}
    const rules = {...defaults.rules,...savedRules,attack:{...defaults.rules.attack,...savedRules.attack}}
    if (savedRules.zoneQuarterLines===undefined && charge!==undefined && Number.isFinite(charge)) {
      if (charge===0) rules.zone = false
      else if (charge>0 && charge!==12.5 && charge!==18) rules.zoneQuarterLines = Math.round(25/charge) || 1
    }
    for (const [key,[,min,max]] of Object.entries(NUMBER_RULES)) {
      const field = key as keyof typeof NUMBER_RULES
      const number = rules[field]
      rules[field] = Number.isFinite(number) ? Math.min(max,Math.max(min,number)) : defaults.rules[field]
    }
    if (!GENERATORS.includes(rules.generator)) rules.generator = DEFAULT_RULES.generator
    if (!TARGETS.includes(rules.target)) rules.target = DEFAULT_RULES.target
    const controllers = defaults.controllers.map((_,i)=>({bot:value.controllers?.[i]?.bot===true,
      level:botLevel(value.controllers?.[i]?.level ?? 5)}))
    const slots = defaults.slots.map((slot,i) => ({...slot,...value.slots?.[i],
      keys:{...slot.keys,...value.slots?.[i]?.keys},pad:{...slot.pad,...value.slots?.[i]?.pad}}))
    slots.forEach((slot,i)=>{
      for (const type of ['keys','pad'] as const) {
        if (value.slots?.[i]?.[type]?.stance!==undefined) continue
        if (conflict(slots,i,type,'stance',slot[type].stance,j=>!controllers[j].bot)) slot[type].stance = ''
      }
    })
    const blitz = {...DEFAULT_BLITZ,...value.blitz}
    for (const [key,[,min,max]] of Object.entries(BLITZ_NUMBERS)) {
      const field = key as keyof typeof BLITZ_NUMBERS
      blitz[field] = Number.isFinite(blitz[field]) ? Math.min(max,Math.max(min,Math.round(blitz[field]))) : DEFAULT_BLITZ[field]
    }
    const characterOptions = {...CHARACTER_OPTIONS}
    for (const key of Object.keys(characterOptions) as (keyof CharacterOptions)[]) {
      const option = value.characterOptions?.[key]
      if (typeof option==='boolean') characterOptions[key] = option
    }
    return {...defaults,...value,rules,audio:{...defaults.audio,...value.audio},controllers,slots,blitz,
      characters:uniqueCharacters(value.characters),characterOptions}
  } catch { return defaults }
}
export function saveSettings(settings: Settings) {
  try { localStorage.setItem(STORAGE,JSON.stringify(settings)); return true }
  catch { return false }
}
