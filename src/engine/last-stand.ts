import { randomFrom, seedOf } from './random'
import { HZ } from './rules'
import type { Spin } from './scoring'

export const LAST_STAND_PRIZES = ['secondWind','revive','doubleAttack','cursedFoundation','surgeBreak','finalGambit'] as const
export const DOUBLE_STAND_PRIZES = ['overcharge','aegisCore','timeFracture','precisionStrike','cleanSlate','surgeResonance'] as const
export type Prize = typeof LAST_STAND_PRIZES[number] | typeof DOUBLE_STAND_PRIZES[number]
export const STAND = {
  window:3*HZ, presentation:2500, spinAt:400, revealAt:1900,
  secondWind:{goal:100, tetris:25, tDouble:30, tTriple:40, perfect:50, combo:10, comboAt:3, duration:15*HZ, received:47},
  revive:{sent:8}, doubleAttack:{secondary:50},
  cursedFoundation:{rows:2,duration:60*HZ},
  surgeBreak:{charge:35,rate:1.5,duration:20*HZ},
  finalGambit:{bonus:2,duration:20*HZ},
  overcharge:{bonus:30,duration:25*HZ},
  aegisCore:{capacity:6}, timeFracture:{delay:3*HZ,duration:20*HZ},
  precisionStrike:{charges:3,bonus:2}, cleanSlate:{rows:4},
  surgeResonance:{charge:40,rate:1.25,duration:20*HZ},
} as const

export type StandEffect = {
  prize:Prize; until:number|null; progress:number; remainder:number
  tetris:boolean; spin:boolean; sent:number
}
export type StandEvent = {
  id:number; kind:'single'|'double'; tick:number
  awards:{index:number; prize:Prize}[]
}
export type StandState = {
  windows:[number|null,number|null]; used:[boolean,boolean]; doubleUsed:boolean; revived:boolean
  event:StandEvent|null; elapsed:number; active:'single'|'double'|null
}
export const standState = (): StandState => ({
  windows:[null,null],used:[false,false],doubleUsed:false,revived:false,event:null,elapsed:0,active:null,
})

export function standEvent(seed:string,state:StandState,tick:number,kind:StandEvent['kind'],survivors:number[]):StandEvent {
  const id = (state.event?.id ?? 0)+1
  const random = randomFrom(seedOf(seed+':last-stand:'+id+':'+tick))
  const prizes = kind==='single' ? LAST_STAND_PRIZES : DOUBLE_STAND_PRIZES
  return {id,kind,tick,awards:survivors.map(index=>({index,prize:prizes[Math.floor(random()*prizes.length)]}))}
}

export function standEffect(prize:Prize,now:number):StandEffect {
  const config = STAND[prize]
  const duration = 'duration' in config && prize!=='secondWind' ? config.duration : null
  const progress = prize==='aegisCore' ? STAND.aegisCore.capacity : prize==='precisionStrike' ? STAND.precisionStrike.charges : 0
  return {prize,until:duration===null ? null : now+duration,progress,remainder:0,tetris:false,spin:false,sent:0}
}

export function scaleLines(effect:StandEffect,lines:number,percent:number) {
  const units = lines*percent+effect.remainder
  effect.remainder = units%100
  return Math.floor(units/100)
}

export function chargeSecondWind(lines:number, spin:Spin|null, perfect:boolean, combo:number) {
  const config = STAND.secondWind
  // Each clear earns one base award. The combo bonus is independent of that award.
  const base = perfect ? config.perfect : lines===4 ? config.tetris :
    spin==='T' && lines===3 ? config.tTriple : spin==='T' && lines===2 ? config.tDouble : 0
  return base+(lines>0 && combo>=config.comboAt ? config.combo : 0)
}
