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
  reward:'RECOMPENSA OBTENIDA', team:'Equipo',
  secondWindDescription:'Consigue 100 puntos para recibir solo un 47 % de la basura durante 15 s.',
  reviveDescription:'Completa un Tetris, un T-Spin y envía 8 líneas para revivir a tu compañero.',
  doubleAttackDescription:'Atacas a ambos rivales: 100 % al principal y 50 % al secundario.',
  cursedFoundationDescription:'Los dos rivales reciben 2 filas selladas durante 60 s.',
  surgeBreakDescription:'Gana 35 % de SURGE y +50 % de carga durante 20 s.',
  finalGambitDescription:'Durante 20 s, tus Tetris y Spins ofensivos envían +2 líneas.',
  overchargeDescription:'Tus ataques generan un 30 % más de potencia durante 25 s.',
  aegisCoreDescription:'Un escudo absorbe las primeras 6 líneas de basura.',
  timeFractureDescription:'La basura entrante tarda 3 s extra en aplicarse durante 20 s.',
  precisionStrikeDescription:'Tus próximos 3 Tetris o Spins ofensivos envían +2 líneas.',
  cleanSlateDescription:'Elimina hasta 4 filas de basura existentes en tu tablero.',
  surgeResonanceDescription:'Gana 40 % de SURGE y +25 % de carga durante 20 s.',
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
  reward:'REWARD UNLOCKED', team:'Team',
  secondWindDescription:'Earn 100 points to receive only 47% of incoming garbage for 15 s.',
  reviveDescription:'Clear a Tetris and T-Spin, then send 8 lines to revive your teammate.',
  doubleAttackDescription:'Hit both rivals: 100% damage to your target, 50% to the other.',
  cursedFoundationDescription:'Both rivals receive 2 sealed rows for 60 s.',
  surgeBreakDescription:'Gain 35% SURGE and +50% SURGE generation for 20 s.',
  finalGambitDescription:'For 20 s, offensive Tetris and Spins send +2 attack lines.',
  overchargeDescription:'Your attacks gain 30% power for 25 s.',
  aegisCoreDescription:'A shield absorbs the first 6 incoming garbage lines.',
  timeFractureDescription:'Incoming garbage is delayed by +3 s for 20 s.',
  precisionStrikeDescription:'Your next 3 offensive Tetris or Spins send +2 lines.',
  cleanSlateDescription:'Remove up to 4 existing garbage rows from your board.',
  surgeResonanceDescription:'Gain 40% SURGE and +25% SURGE generation for 20 s.',
}
export const lastStandCopy = (language:string) => /^en\b/i.test(language) ? en : es
export const standLanguage = () => /^en\b/i.test(document.documentElement.lang) || /^en\b/i.test(navigator.language) ? 'en' : 'es'
export const standDescriptions:Record<Prize,keyof typeof es> = {
  secondWind:'secondWindDescription',revive:'reviveDescription',doubleAttack:'doubleAttackDescription',
  cursedFoundation:'cursedFoundationDescription',surgeBreak:'surgeBreakDescription',finalGambit:'finalGambitDescription',
  overcharge:'overchargeDescription',aegisCore:'aegisCoreDescription',timeFracture:'timeFractureDescription',
  precisionStrike:'precisionStrikeDescription',cleanSlate:'cleanSlateDescription',surgeResonance:'surgeResonanceDescription',
}
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
