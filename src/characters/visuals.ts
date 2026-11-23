import type { CharacterId } from './catalog'

export type CharacterVisual = {
  title:readonly [string,string]
  color:string
  light:string
  theme:'electric'|'digital'|'frost'|'cosmic'|'fire'
  entry:'caster'|'opponent'
}

export const characterVisuals:Partial<Record<CharacterId,CharacterVisual>> = {
  volt:{title:['THUNDER','BREAKER'],color:'#ffb72e',light:'#fff5a4',theme:'electric',entry:'caster'},
  nix:{title:['ABSOLUTE','ZERO'],color:'#75cfff',light:'#eafaff',theme:'frost',entry:'caster'},
  pix:{title:['SYSTEM','OVERRIDE'],color:'#2eeed7',light:'#d8ff79',theme:'digital',entry:'opponent'},
  astra:{title:['EVENT','HORIZON'],color:'#bf92ff',light:'#f8e1b0',theme:'cosmic',entry:'caster'},
  blaze:{title:['INFERNO','BREAK'],color:'#ff742d',light:'#ffd789',theme:'fire',entry:'caster'},
}
