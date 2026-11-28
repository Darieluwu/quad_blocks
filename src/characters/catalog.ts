export const CHARACTER_IDS = ['volt','nix','pix','astra','blaze','pengu','kira'] as const
export type CharacterId = typeof CHARACTER_IDS[number]
export const PORTRAITS = ['neutral','blink','attack','danger','damage','victory','defeat','support','zone'] as const
export type PortraitState = typeof PORTRAITS[number]
export const VOICE_EVENTS = ['selection','simpleAttack1','simpleAttack2','tetris','tetris2','spin','combo','combo2','combo3','zoneStart','zoneFinish','danger','victory','defeat',
  'teamDefense','teammateDown','teammateRevived'] as const
export type VoiceEvent = typeof VOICE_EVENTS[number]
export const VISUAL_ATTACKS = ['tetris','spin','combo','zoneFinish'] as const
export type VisualAttack = typeof VISUAL_ATTACKS[number]

type Character = {
  id:CharacterId; name:string; description:string; element:string; colors:readonly [string,string];
  assets:{portraits:Record<PortraitState,string>; master:string; attackPose:string; zonePose:string; zoneBackground:string;
    attacks:Record<VisualAttack,string>; voicesJa:Record<VoiceEvent,string>}
}
const refs = <K extends string>(keys:readonly K[],prefix:string) =>
  Object.fromEntries(keys.map(key=>[key,`${prefix}/${key}`])) as Record<K,string>

function define(id:CharacterId,element:string,colors:Character['colors'],description:string): Character {
  return {id, name:id.toUpperCase(), description, element, colors, assets:{
    portraits:refs(PORTRAITS,`${id}/portraits`), master:`${id}/master`, attackPose:`${id}/pose-attack`,
    zonePose:`${id}/pose-zone`, zoneBackground:`${id}/zone-background`, attacks:refs(VISUAL_ATTACKS,`${id}/attacks`),
    voicesJa:refs(VOICE_EVENTS,id),
  }}
}

export const CHARACTERS = {
  volt:define('volt','Electricidad',['#ff5266','#ffdd56'],'Rival competitivo, joven y atlético, de cabello rojo y chaqueta futurista.'),
  nix:define('nix','Hielo',['#75cfff','#eafaff'],'Estratega glacial de cabello azul plateado. Serena bajo presión, anticipa al rival y ataca con precisión.'),
  pix:define('pix','Tecnología',['#39ebd3','#baff67'],'Hacker traviesa de cabello turquesa y negro, audífonos y chaqueta oversized.'),
  astra:define('astra','Cosmos',['#bf92ff','#f8e1b0'],'Viajera dimensional enigmática. Lee las órbitas y dobla el espacio con serena precisión.'),
  blaze:define('blaze','Combustión',['#ff742d','#ffd789'],'Piloto de combustión obsesionado con el fuego. Temerario en combate y leal a su equipo.'),
  pengu:define('pengu','Magia lunar',['#bd8bff','#ffd670'],'Archimago dormilón, tranquilo y sorprendentemente poderoso.'),
  kira:define('kira','Energía cinética',['#ff65b9','#62efff'],'Patinadora felina de cabello blanco, traviesa y veloz. Convierte su energía cinética en destellos de neón.'),
} satisfies Record<CharacterId,Character>

export const isCharacterId = (value:unknown): value is CharacterId => CHARACTER_IDS.some(id=>id===value)

export function uniqueCharacters(values:unknown, count = 4): CharacterId[] {
  const source = Array.isArray(values) ? values : []
  const picked:CharacterId[] = []
  for (let slot=0;slot<count;slot++) {
    const wanted:unknown = source[slot]
    const available = CHARACTER_IDS.find(id=>!picked.includes(id))
    if (available) picked.push(isCharacterId(wanted) && !picked.includes(wanted) ? wanted : available)
  }
  return picked
}

export function chooseCharacter(lineup:readonly CharacterId[],slot:number,id:CharacterId,reserved:readonly boolean[]) {
  if (!lineup[slot]) return null
  const owner = lineup.indexOf(id)
  if (owner!==slot && owner>=0 && reserved[owner]) return null
  const next = [...lineup]
  if (owner>=0) next[owner] = lineup[slot]
  next[slot] = id
  return next
}

export const CHARACTER_OPTIONS = {attackAnimations:true,attackVoices:true,subtitles:true}
export type CharacterOptions = typeof CHARACTER_OPTIONS
