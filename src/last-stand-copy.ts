import type { Prize } from './engine/last-stand'

const es = {
  rule:'Last Stand Roulette', enabled:'Activada', disabled:'Desactivada', format:'Modo de la sala',
  teams:'2v2 tradicional', online:'Multijugador online', teamsRoom:'Sala 2v2 tradicional online',
  single:'Último en pie', double:'Double Last Stand', duel:'Duelo final', versus:'Últimos en pie',
  secondWind:'Segunda oportunidad', revive:'Resucitar', doubleAttack:'Ataque doble', cursedFoundation:'Fundación maldita',
  surgeBreak:'Ruptura SURGE', finalGambit:'Apuesta final', overcharge:'Sobrecarga', aegisCore:'Núcleo protector',
  timeFracture:'Fractura temporal', precisionStrike:'Ataque de precisión', cleanSlate:'Borrón y cuenta nueva',
  surgeResonance:'Resonancia SURGE', tetris:'Completa un Tetris', spin:'Limpia con un T-Spin', sent:'Líneas enviadas',
  shield:'Escudo', charges:'Cargas', foundationWaiting:'Pendiente de espacio',
}
const en:Record<keyof typeof es,string> = {
  rule:'Last Stand Roulette', enabled:'Enabled', disabled:'Disabled', format:'Room mode',
  teams:'Traditional 2v2', online:'Online multiplayer', teamsRoom:'Traditional 2v2 online room',
  single:'Last Stand', double:'Double Last Stand', duel:'Final Duel', versus:'Final Duel',
  secondWind:'Second Wind', revive:'Revive', doubleAttack:'Double Attack', cursedFoundation:'Cursed Foundation',
  surgeBreak:'Surge Break', finalGambit:'Final Gambit', overcharge:'Overcharge', aegisCore:'Aegis Core',
  timeFracture:'Time Fracture', precisionStrike:'Precision Strike', cleanSlate:'Clean Slate',
  surgeResonance:'Surge Resonance', tetris:'Clear a Tetris', spin:'Clear with a T-Spin', sent:'Lines sent',
  shield:'Shield', charges:'Charges', foundationWaiting:'Waiting for space',
}
export const lastStandCopy = (language:string) => /^en\b/i.test(language) ? en : es
export const standLanguage = () => /^en\b/i.test(document.documentElement.lang) || /^en\b/i.test(navigator.language) ? 'en' : 'es'
export const standIcons:Record<Prize,string> = {
  secondWind:'◈', revive:'✚', doubleAttack:'↠', cursedFoundation:'▤', surgeBreak:'ϟ', finalGambit:'▲',
  overcharge:'✦', aegisCore:'⬡', timeFracture:'◷', precisionStrike:'◎', cleanSlate:'▱', surgeResonance:'∿',
}

export function standRule(value:boolean, online = false, editable = true) {
  const lang = standLanguage()
  const copy = lastStandCopy(lang)
  return `<label lang="${lang}" class="stand-rule">${copy.rule}
    <select data-last-stand="${online?'online':'local'}" ${editable?'':'disabled'}>
      <option value="on" ${value?'selected':''}>${copy.enabled}</option>
      <option value="off" ${value?'':'selected'}>${copy.disabled}</option>
    </select></label>`
}
