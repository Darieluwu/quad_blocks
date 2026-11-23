import type { CharacterId } from './catalog'

export type CharacterVisual = {
  title:readonly [string,string]
  color:string
  light:string
  theme:'electric'|'digital'
  entry:'caster'|'opponent'
}

export const characterVisuals:Partial<Record<CharacterId,CharacterVisual>> = {
  volt:{title:['THUNDER','OVERDRIVE'],color:'#ffb72e',light:'#fff5a4',theme:'electric',entry:'caster'},
  pix:{title:['SYSTEM','OVERRIDE'],color:'#2eeed7',light:'#d8ff79',theme:'digital',entry:'opponent'},
}
