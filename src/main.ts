import './style.css'
import { Match, teamForSlot, type Participant } from './engine/match'
import { BlitzMatch } from './engine/blitz'
import { HZ, PLAYERS, SETTINGS } from './engine/rules'
import { ACTIONS, NO_INPUT, type Action } from './engine/player'
import { BOT_LEVELS, botLevel } from './engine/bot'
import { Inputs, actionNames as actionNamesOnline, automaticPadMap, conflict, defaultMap, keyboardClashes, label, padBindings, pressedButtons } from './input'
import { Sound, comboRisePlaybackRate, type DialogueState } from './audio'
import { mountArena } from './render'
import { ATTACK_LABELS, BLITZ_NUMBERS, NUMBER_RULES, freshRules, loadSettings, saveSettings, type Mix, type Profile } from './settings'
import { configuration, controls, credits, diagnostic, diagnosticsPage, escape, footer, header, home, icon, lobby, modeName, modeSelect, teamName, type Mode } from './menu'
import { RoomClient, inviteCode } from './online/client'
import { onlineMenu } from './online/menu'
import { OnlineMatch, randomId, type LobbyState, type ServerMessage } from './online/protocol'
import { CHARACTERS, CHARACTER_IDS, chooseCharacter, isCharacterId, uniqueCharacters, type CharacterId, type CharacterOptions, type VoiceEvent } from './characters/catalog'
import { ArcadePicker } from './characters/picker'
import { artwork, japaneseVoice, subtitleFor } from './characters/assets'
import { isAttackVoice } from './characters/presentation'
import { BattleIntroSystem, BATTLE_GO_MS } from './battle-intro'
import { BATTLE_INTRO_TICKS, isBattleIntroPreference, reducedIntroTicks, type BattleIntroMode } from './battle-intro-config'

type Page = 'home'|'lobby'|'settings'|'controls'|'diag'|'credits'|'game'|'online'
const app = document.querySelector<HTMLElement>('#app')!
const settings = loadSettings()
const ready = settings.slots.map(() => false)
let page: Page = 'home'
let mode: Mode = 'versus'
let modeMenuIndex = 0
let arcadeMenuIndex = 0
let modeMenuOpen = false
const arcadePadPrior = new Map<number,{up:boolean;down:boolean;left:boolean;right:boolean;confirm:boolean;cancel:boolean}>()
const criticalSeen = new Set<number>()
const surgeReadySeen = new Set<number>()
let battleIntro: BattleIntroSystem | null = null
let countdownReceivedAt = 0
let victoryPlayed = false
let blitzWarningSent = false
const perfectSeen = new Map<number,number>()
let returnPage: 'home'|'lobby' = 'home'
let controlPlayer = 0
let controlType: 'keys'|'pad' = 'keys'
let controlContext:'online'|'local'='local'
let status = ''
let lobbyIssue = ''
let lobbyEditor:number|null = null
let match: Match | null = null
let arena: ReturnType<typeof mountArena> | null = null
let phase: 'countdown'|'live'|'paused'|'results' = 'countdown'
let countdown: number = SETTINGS.countdown
let resumePhase: 'live'|'countdown' = 'countdown'
let pauseReason = ''
let overlayState = ''
let finalFallen: number[] = []
let matchCharacters = [...settings.characters]
function artworkWinner(id:CharacterId) {
  const assets=CHARACTERS[id].assets
  return artwork(assets.master) ?? artwork(assets.zonePose) ?? artwork(assets.portraits.victory) ?? artwork(assets.portraits.neutral)
}
function artworkLoser(id:CharacterId) {
  const assets=CHARACTERS[id].assets
  return artwork(assets.portraits.defeat) ?? artwork(assets.portraits.damage) ?? artwork(assets.portraits.danger) ?? artwork(assets.portraits.neutral)
}
let lobbyPadPrior: (ReadonlySet<Action>|undefined)[] = []
const selectionCaptions = new Map<number,{id:CharacterId;text:string}>()
const picker = new ArcadePicker()
const pickerDrafts = new Map<number,CharacterId>()
const pickerConfirmed = new Map<number,CharacterId>()
const pickerPending = new Map<number,{id:CharacterId;request:number}>()
let pickerSlot:number|null = null
let pickerNotice = ''
let selectionRequest = 0
const simpleAttackVariant = new Map<number,0|1>()
const simpleAttackLast = new Map<number,number>()
let onlineConnected = false
let online: RoomClient|null = null
let onlineLobby: LobbyState|null = null
let onlineSeat = -1
let onlineNames: string[]|null = null
let onlineNotice = ''
let onlineWaiting = false
let onlineRetry = false
let onlineLink = inviteCode(new URL(location.href).searchParams.get('sala') ?? '')
let onlineName = settings.slots[0].name
if (onlineLink) page = 'online'
const audio = new Sound(settings.audio)
const isHuman = (i: number) => !settings.controllers[i].bot
const inputs = new Inputs(settings.slots,() => page === 'game' && phase !== 'results',i=>online && (page==='game' || page==='online') ? i===0 : isHuman(i))
inputs.onWake = () => audio.wake()
const syncOnlineProfile=()=>inputs.setOnlineProfile(page==='online'||page==='game'&&!!online ? {
  name:onlineName,device:settings.online.device==='pad'&&settings.online.padId?{id:settings.online.padId.id,index:settings.online.padId.index}:null,
  deviceType:settings.online.device==='keyboard'?'keyboard':'pad',keys:settings.online.keyboard,pad:settings.online.pad
}:null)
app.addEventListener('error',event=>{
  const image = event.target
  if (!(image instanceof HTMLImageElement) || image.dataset.artFallback===undefined) return
  const fallback = image.dataset.artFallback
  image.removeAttribute('data-full-art')
  if (fallback && image.getAttribute('src')!==fallback) image.src = fallback
  else image.hidden = true
},true)
inputs.onBlur = () => { if (online) online.input(NO_INPUT); else if (page === 'game') pause('La ventana perdió el foco.') }
document.addEventListener('pointerdown', () => audio.wake())
document.addEventListener('keydown', () => audio.wake())
document.addEventListener('visibilitychange', () => {
  if (document.hidden && page === 'game') { inputs.clear(); inputs.onBlur() }
})

const displaySlots = () => onlineNames ? settings.slots.map((slot,i)=>({...slot,name:onlineNames![i]})) : settings.slots

const store = () => { saveSettings(settings) }
function lobbyRoster(): Participant[] {
  return ready.flatMap((included,slot) => {
    if (!included) return []
    const {bot,level} = settings.controllers[slot]
    return [{slot,level:bot ? level : undefined,team:mode!=='versus' ? teamForSlot(slot) : undefined}]
  })
}
const disconnected = (roster: readonly Participant[]) => inputs.missing.filter(slot =>
  roster.some(p=>p.slot===slot && p.level===undefined))
function canStart() {
  const roster = lobbyRoster()
  return roster.length >= (mode!=='versus' ? PLAYERS : 2) && !disconnected(roster).length &&
    roster.every(({slot})=>!isHuman(slot) || settings.slots[slot].deviceType!==null)
}
function keyboardIssue(i: number) {
  const clashes = keyboardClashes(settings.slots,i,isHuman)
  return clashes.length ? 'Reasigna estas teclas en Controles antes de usar el teclado en J'+(i+1)+': '+clashes.join(', ')+'.' : ''
}
function releaseBotReservation(device: Gamepad) {
  settings.slots.forEach((slot,i) => {
    if (settings.controllers[i].bot && slot.device?.id===device.id && slot.device.index===device.index) slot.device = null
  })
}
function muteButton() {
  const button = app.querySelector<HTMLButtonElement>('.audio-toggle')
  if (!button) return
  const title = settings.audio.mute ? 'Activar audio' : 'Silenciar audio'
  button.innerHTML = icon(settings.audio.mute ? 'mute' : 'audio')
  button.setAttribute('aria-label',title)
  button.title = title
  const check = app.querySelector<HTMLInputElement>('[data-view="mute"]')
  if (check) check.checked = settings.audio.mute
}

function render() {
  audio.setMusic(page==='lobby' || page==='online' && onlineLobby?.phase==='lobby' ? 'selection' :
    page==='home' ? 'menu' : undefined)
  const focused = (document.activeElement as HTMLElement|null)?.dataset
  const characterFocus = focused?.character
  const editorField = (['controller','device','level','onlineBot'] as const).find(key=>focused?.[key]!==undefined)
  const preceding = new Map([...app.querySelectorAll<HTMLElement>('.lobby-fighter')].map(card=>[card.dataset.slot,card.dataset]))
  const allReady = app.querySelector('.lobby-lineup')?.getAttribute('data-all-ready')
  app.classList.toggle('reduced',settings.reduced)
  const body = page === 'home' ? (modeMenuOpen ? modeSelect(mode) : home(settings.profile)) : page === 'lobby' ? lobby(settings,inputs,ready,mode,canStart(),lobbyIssue) :
    page === 'online' ? onlineMenu(onlineLobby,onlineSeat,onlineLink,onlineName,onlineNotice,onlineWaiting,onlineRetry) :
    page === 'settings' ? configuration(settings,returnPage) : page === 'controls' ?
      controls(settings,inputs,controlPlayer,controlType,status,returnPage,controlContext) : page === 'diag' ?
      diagnosticsPage(diagnostic(inputs,settings),returnPage) : credits()
  app.innerHTML = (page==='home' ? '' : header(page,settings.audio.mute))+body+(page==='home'?'':footer)
  if (page==='lobby' || page==='online') {
    if (page==='lobby' || onlineLobby?.phase==='lobby') audio.prepareBattleEffects()
    syncLobbyEditor()
    const lineupView = app.querySelector('.lobby-lineup')
    if (allReady==='false' && lineupView?.getAttribute('data-all-ready')==='true') lineupView.classList.add('just-ready')
    for (const card of app.querySelectorAll<HTMLElement>('.lobby-fighter')) {
      const old = preceding.get(card.dataset.slot)
      if (old && old.fighter!==card.dataset.fighter) card.classList.add('is-new-fighter')
      if (old?.readyState==='false' && card.dataset.readyState==='true') card.classList.add('just-ready')
    }
    const lineup = page==='online' ? onlineLineup() : settings.characters
    for (const [slot,caption] of selectionCaptions) {
      if (lineup[slot]===caption.id) showSelectionCaption(slot,caption.text)
      else selectionCaptions.delete(slot)
    }
  }
  if (characterFocus!==undefined) app.querySelector<HTMLButtonElement>(`[data-character="${characterFocus}"]`)?.focus()
  if (editorField && focused && Number(focused[editorField])===lobbyEditor) {
    const attr = editorField==='onlineBot' ? 'online-bot' : editorField
    app.querySelector<HTMLSelectElement>(`[data-${attr}="${lobbyEditor}"]`)?.focus({preventScroll:true})
  }
  refreshPicker()
}

function go(next: Page) {
  if (next === 'game') return
  if (next==='lobby'||next==='home') victoryPlayed=false
  if (online && next!=='online') {
    online.close()
    online = null; onlineLobby = null; onlineNames = null; onlineSeat = -1
    onlineLink = onlineNotice = ''; onlineWaiting = onlineRetry = false
    onlineConnected = false
    roomUrl('')
  }
  if (next === 'settings' || next === 'controls' || next === 'diag') {
    if (page === 'lobby') returnPage = 'lobby'
    else if (page === 'home' || page === 'credits') returnPage = 'home'
  }
  audio.stopCharacterVoices()
  selectionCaptions.clear()
  resetPicker()
  lobbyEditor = null
  if (page === 'game') {
    battleIntro?.dispose()
    battleIntro = null
    match = null; arena = null; inputs.clear()
  }
  lobbyPadPrior = []
  page = next
  inputs.capture = null
  inputs.pairing = null
  status = ''
  lobbyIssue = ''
  syncOnlineProfile()
  render()
}

function start(roster: readonly Participant[]) {
  audio.wake()
  const seed = settings.rules.seed.trim() ||
    Array.from(crypto.getRandomValues(new Uint32Array(2)),value => value.toString(36)).join('-')
  const rules = structuredClone(settings.rules)
  match = mode==='blitz' ? new BlitzMatch(rules,seed,roster,{...settings.blitz}) : new Match(rules,seed,roster)
  matchCharacters = [...settings.characters]
  const format = introMode(match)
  const presentation = !format || settings.battleIntro==='off' ? 0 :
    settings.battleIntro==='reduced' ? reducedIntroTicks(format) : BATTLE_INTRO_TICKS[format]
  mountGame(match,SETTINGS.countdown+presentation,presentation)
}

function introMode(current:Match): BattleIntroMode|null {
  return current instanceof BlitzMatch ? 'blitz' : current.teams ? 'teams' : current.roster.length===PLAYERS ? 'vs4' : null
}

function startBattleMusic(current:Match) {
  const format = introMode(current)
  if (format==='blitz' || format==='vs4') audio.setMusic(format)
}

function mountGame(current: Match, initialCountdown:number, presentation:number, rejoin = false) {
  const {seed,roster} = current
  battleIntro?.dispose()
  criticalSeen.clear()
  surgeReadySeen.clear()
  victoryPlayed=false
  blitzWarningSent=false
  if (page==='game') audio.stopCharacterVoices()
  audio.stopMusic()
  const format = mode==='blitz' ? 'BLITZ' : current.teams ? '2v2' : roster.length===PLAYERS ? 'VS4' : roster.map(()=>1).join('v')
  page = 'game'
  phase = initialCountdown ? 'countdown' : 'live'
  countdown = initialCountdown
  countdownReceivedAt = performance.now()
  selectionCaptions.clear()
  resetPicker()
  lobbyEditor = null
  overlayState = ''
  finalFallen = []
  inputs.clear()
  app.innerHTML = `<header class="bar game-bar ${mode==='blitz'?'game-bar-blitz':''}"><div class="bar-inner">
    <button class="brand" ${online?'data-page="home" aria-label="Salir de la partida"':'data-do="pause" aria-label="Pausar partida"'}><span class="brand-icon">${icon('logo')}</span><span>TETRA<span>VOLT</span></span></button>
    <div class="game-info"><strong>${format}</strong><span>${modeName(mode)}</span>${mode==='blitz'?'':'<output id="elapsed">00:00</output>'}</div>
    <div class="game-buttons"><button class="icon-button audio-toggle" data-do="mute"></button>${online?`<span class="online-player">ONLINE · J${onlineSeat+1}</span><button class="secondary" data-page="home">Salir</button>`:`<button class="secondary" data-do="pause">${icon('pause')} Pausa</button>`}</div>
  </div></header><main class="game ${mode==='blitz'?'game-blitz':''}"><div id="arena"></div><div id="overlay" aria-live="polite"></div>
    <div class="match-footer"><span>${online?'Sala privada':`Semilla <b>${escape(seed)}</b>`}</span><span id="metrics"></span><span>${online?'Reglas competitivas':escape(settings.profile)} · ${modeName(mode)}</span></div></main>`
  const arenaRoot = app.querySelector<HTMLElement>('#arena')!
  arena = mountArena(arenaRoot,roster,current instanceof BlitzMatch,matchCharacters,settings.characterOptions.attackAnimations)
  arena.draw(current,displaySlots())
  const slots = displaySlots()
  const fighters = roster.map(({slot,level,team},index)=>({slot,level,team,id:matchCharacters[slot],name:slots[slot].name,
    active:current instanceof BlitzMatch ? current.sides.some(side=>side.active===index) : undefined}))
  battleIntro = new BattleIntroSystem(audio,presentation,introMode(current),fighters,settings.battleIntro,
    settings.reduced,app,arenaRoot,!rejoin && initialCountdown>SETTINGS.countdown)
  if (initialCountdown<=SETTINGS.countdown) startBattleMusic(current)
  muteButton()
  drawOverlay()
}

function pause(reason = '') {
  if (online) return
  if (phase !== 'live' && phase !== 'countdown') return
  resumePhase = phase
  phase = 'paused'
  audio.pauseMusic()
  pauseReason = reason
  inputs.clear()
  drawOverlay()
}
function resume() {
  if (phase !== 'paused' || !match || disconnected(match.roster).length) return
  phase = resumePhase
  audio.resumeMusic()
  inputs.clear()
  drawOverlay()
}

function drawOverlay() {
  if (!match) return
  const overlay = document.querySelector<HTMLElement>('#overlay')!
  if (phase==='countdown') {
    // Interpolate the artwork between server samples, leaving the visible numbers on the official ticks.
    const elapsed = online ? Math.min(HZ-1,(performance.now()-countdownReceivedAt)*HZ/1000) : 0
    battleIntro?.draw(countdown-elapsed)
  } else if (phase==='paused') battleIntro?.draw(countdown,true)
  else battleIntro?.dispose()
  const missing = online ? [] : disconnected(match.roster)
  const counter = phase==='countdown' && countdown<=SETTINGS.countdown ? Math.ceil(countdown/HZ) : 0
  const go = phase==='live' && battleIntro?.go
  const key = [phase,counter,go,missing.join(','),online && phase==='paused'?onlineNotice:'',onlineLobby?.host].join('|')
  if (key === overlayState) return
  overlayState = key
  if (phase === 'live' && !go) { overlay.innerHTML = ''; overlay.hidden = true; return }
  overlay.hidden = false
  if (phase==='countdown' || go) {
    overlay.className = 'countdown'
    overlay.dataset.quiet = String(battleIntro?.reduced ?? settings.reduced)
    overlay.style.setProperty('--go-duration',`${BATTLE_GO_MS}ms`)
    if (counter>0) {
      battleIntro?.announce(counter)
      overlay.innerHTML = `<div class="battle-counter"><span>PREPÁRATE</span><strong>${counter}</strong></div>`
    } else overlay.innerHTML = go ? '<div class="battle-counter battle-counter-go"><strong>¡COMBATE!</strong></div>' : ''
    return
  }
  overlay.className = 'overlay'
  if (phase === 'paused') {
    if (online) {
      overlay.innerHTML = `<section class="modal"><h2>Partida en espera</h2><p role="status">${escape(onlineNotice)}</p><button class="secondary" data-page="home">Salir de la partida</button></section>`
      return
    }
    overlay.innerHTML = `<section class="modal"><div class="overline"><i></i> ${modeName(mode)}</div><h2>Partida en pausa</h2>
      <p>${missing.length ? 'Mando desconectado · '+missing.map(i=>escape(settings.slots[i].name)).join(', ')+'. Reconecta para continuar.' : escape(pauseReason || 'Los tableros están en pausa.')}</p>
      <div class="modal-actions"><button class="primary" data-do="resume" ${missing.length?'disabled':''}>Continuar</button><button class="secondary" data-do="rematch" ${missing.length?'disabled':''}>Reiniciar</button><button class="secondary" data-page="lobby">Volver a la sala</button></div></section>`
    return
  }
  const currentMatch = match
  if (mode==='blitz' && !victoryPlayed) {
    victoryPlayed=true
    audio.wake()
    audio.playEffect('victory-stinger',.9)
  }
  const animate = arena?.finish(currentMatch,finalFallen)
  const game = overlay.closest('.game')!
  game.classList.add('result-scene')
  game.classList.toggle('result-draw',currentMatch.winnerBoards().length===0)
  overlay.className = 'results-panel'
  const winner = currentMatch.winner
  const team = currentMatch.winningTeam
  const slots = displaySlots()
  const title = team!==null ? teamName(team)+' gana' : winner===null ? 'Empate' :
    escape(slots[currentMatch.roster[winner].slot].name)+' gana'
  const mvps = currentMatch.mvps()
  const mvpNames = mvps.map(i=>escape(slots[currentMatch.roster[i].slot].name)).join(' · ')
  const bestSent = currentMatch.statsFor(mvps[0]).sent
  let rank = 1
  const rows = currentMatch.ranking().flatMap((group,index) => {
    const current = currentMatch.teams ? index+1 : rank
    rank += group.length
    return group.map(i => {
      const {slot,level,team} = currentMatch.roster[i]
      const {lines,sent,received,cancelled,pieces} = currentMatch.statsFor(i)
      const type = [team===undefined ? '' : teamName(team),level===undefined ? '' : 'IA '+level].filter(Boolean)
      return `<li><b>${current}</b><div class="result-player" data-result-player="${slot}">${escape(slots[slot].name)}${type.length ? `<small>${type.join(' · ')}</small>` : ''}</div><span>${lines}</span><span>${sent}</span><span>${received}</span><span>${cancelled}</span><span>${pieces}</span></li>`
    })
  }).join('')
  const blitzResult = mode==='blitz' && currentMatch instanceof BlitzMatch ? (()=> {
    const winningTeam=currentMatch.winningTeam
    if (winningTeam===null) return ''
    const winning=matchCharacters.flatMap((_,index)=>currentMatch.roster[index]?.team===winningTeam?[index]:[])
    const losing=matchCharacters.flatMap((_,index)=>currentMatch.roster[index]?.team!==winningTeam?[index]:[])
    const artCard=(index:number,kind:'winner'|'loser')=>{
      const id=matchCharacters[currentMatch.roster[index].slot]
      const character=CHARACTERS[id]
      const src=kind==='winner'
        ? artworkWinner(id)
        : artworkLoser(id)
      const mvp=mvps.includes(index)
      return `<figure class="blitz-result-${kind}" ${kind==='loser'?'':''}><span class="blitz-result-team">${teamName(participantTeam(index))}</span>${mvp&&kind==='winner'?'<b class="blitz-mvp-badge">MVP</b>':''}${src?`<img src="${src}" alt="${character.name}" draggable="false">`:'<span class="blitz-result-fallback">'+character.name+'</span>'}<figcaption>${character.name}</figcaption></figure>`
    }
    const participantTeam=(index:number)=>currentMatch.roster[index].team ?? 0
    return `<div class="blitz-result-visual" data-team="${winningTeam}">
      <div class="blitz-result-winners">${winning.map(index=>artCard(index,'winner')).join('')}</div>
      <div class="blitz-result-losers">${losing.map(index=>artCard(index,'loser')).join('')}</div>
    </div>`
  })() : ''
  overlay.innerHTML = `<section class="result-card${mode==='blitz'?' blitz-result-card':''}">${blitzResult}<div class="result-card-content"><div class="overline"><i></i> RESULTADOS · ${modeName(mode)} <time>${formatTime(currentMatch.now)}</time></div><h2>${title}</h2>
    <div class="result-mvp"><div><small>${mvps.length>1?'MVP COMPARTIDO':'MVP'}</small><strong>${mvpNames}</strong></div>
      <span><b>${bestSent}</b> líneas enviadas</span></div>
    <div class="result-columns"><span>#</span><span>Jugador</span><span title="Líneas limpiadas">Limp.</span><span title="Líneas enviadas">Env.</span><span title="Líneas recibidas">Rec.</span><span title="Líneas canceladas">Canc.</span><span title="Piezas colocadas">Piezas</span></div>
    <ol class="ranking">${rows}</ol><div class="modal-actions">${online ? `${onlineLobby?.host===onlineSeat?'<button class="primary" data-online="lobby">Volver todos a la sala</button>':''}<button class="secondary" data-page="home">Salir</button>` : `<button class="primary" data-do="rematch" ${missing.length?'disabled':''}>Revancha</button><button class="secondary" data-page="lobby">Volver a la sala</button>`}</div></div></section>`
  arena?.placeResultCaptions(overlay)
  animate?.()
}

function roomUrl(code: string) {
  const url = new URL(location.href)
  if (code) url.searchParams.set('sala',code)
  else url.searchParams.delete('sala')
  history.replaceState(null,'',url)
  return url.href
}

function receiveOnline(message: ServerMessage) {
  switch (message.type) {
    case 'error':
      onlineNotice = message.message
      if (page==='online') render()
      break
    case 'welcome':
      onlineConnected = true
      onlineSeat = message.slot
      onlineNotice = ''
      onlineWaiting = onlineRetry = false
      onlineLink = roomUrl(online!.code)
      break
    case 'lobby': {
    const previousReady = onlineLobby?.seats.map(seat=>seat.ready) ?? []
      onlineLobby = message.lobby
    if (page==='online') {
      for (let seat=0;seat<onlineLobby.seats.length;seat++) {
        if (!previousReady[seat] && onlineLobby.seats[seat].ready) audio.playEffect('player-ready')
      }
    }
      if (message.lobby.phase==='lobby') {
        if (page==='game') { audio.stopCharacterVoices(); lobbyPadPrior = [] }
        battleIntro?.dispose()
        battleIntro = null
        match = arena = null
        onlineNames = null
        page = 'online'
        render()
      } else if (message.lobby.phase==='paused' && page==='game') {
        phase = 'paused'
        onlineNotice = `Esperando que vuelva ${message.lobby.missing.join(', ')}.`
        audio.pauseMusic()
        inputs.clear()
        online?.input(NO_INPUT)
      } else if (page==='game' && message.lobby.phase!=='results') {
        const starting = phase==='countdown' && message.lobby.phase==='playing'
        phase = message.lobby.phase==='countdown' ? 'countdown' : 'live'
        if (match && countdown<=SETTINGS.countdown) startBattleMusic(match)
        audio.resumeMusic()
        if (starting) battleIntro?.announce(0)
      }
      break
    }
    case 'characterConfirmed': {
      const pending = pickerPending.get(message.slot)
      if (pending?.request!==message.request || pending.id!==message.id) break
      pickerPending.delete(message.slot)
      if (message.accepted && page==='online' && onlineLineup()[message.slot]===message.id) {
        pickerDrafts.delete(message.slot)
        completeSelection(message.slot,message.id)
      } else if (pickerSlot===message.slot) {
        pickerNotice = 'La sala no pudo confirmar ese personaje.'
        refreshPicker()
      }
      break
    }
    case 'start':
      mode = 'blitz'
      onlineNames = message.names
      if (match instanceof OnlineMatch && match.seed===message.seed) {
        countdown = message.countdown
        countdownReceivedAt = performance.now()
      } else {
        matchCharacters = uniqueCharacters(message.characters)
        match = new OnlineMatch(message)
        mountGame(match,message.countdown,message.presentation ?? 0,message.rejoin)
      }
      break
    case 'countdown':
      if (countdown>SETTINGS.countdown && message.left<=SETTINGS.countdown && match) startBattleMusic(match)
      countdown = message.left
      countdownReceivedAt = performance.now()
      break
    case 'frame':
      if (!(match instanceof OnlineMatch) || phase==='results') return
      match.load(message.state)
      for (const [i,player] of match.players.entries()) {
        if (player.danger!==2) criticalSeen.delete(i)
        if (!player.dead && player.zone.energy>=player.rules.zoneMinimum && !player.zone.active) {
          if (!surgeReadySeen.has(i)) { surgeReadySeen.add(i); audio.playEffect('surge-ready',.72) }
        } else surgeReadySeen.delete(i)
      }
      for (const {slot,event} of message.events) playEvent(match,slot,event)
      if (match.finished) {
        finalFallen = message.fallen
        audio.stopMusic()
        phase = 'results'
      }
  }
}

app.addEventListener('submit',event=>{
  if (!(event.target instanceof HTMLFormElement) || event.target.id!=='online-connect') return
  event.preventDefault()
  const form = new FormData(event.target)
  onlineName = String(form.get('name') ?? '').trim()
  onlineLink = String(form.get('invite') ?? '').trim()
  const create = (event as SubmitEvent).submitter?.getAttribute('name')==='create'
  const code = create ? randomId() : inviteCode(onlineLink)
  if (!code || !onlineName) {
    onlineNotice = 'Introduce un nombre y, para unirte, un enlace o código válido.'
    render()
    return
  }
  online?.close(online.code!==code || create)
  onlineNotice = ''
  online = new RoomClient(code,onlineName,create,receiveOnline,state=>{
    onlineConnected = false
    pickerPending.clear()
    onlineWaiting = state==='connecting'
    if (state==='connecting') onlineNotice = 'Conectando…'
    else if (state==='lost') onlineNotice = 'Conexión perdida. Reconectando…'
    else {
      onlineRetry = true
      if (!onlineNotice || onlineNotice.startsWith('Conect')) {
        onlineNotice = 'El servidor online no está disponible. Abre la versión servida por Cloudflare Workers.'
      }
    }
    if (page==='game' && phase!=='results') {
      phase = 'paused'
      audio.pauseMusic()
      inputs.clear()
    } else if (page==='online') {
      if (state==='closed') onlineLobby = null
      render()
    }
  })
  online.connect()
})

app.addEventListener('change',event=>{
  const element = event.target
  if (element instanceof HTMLSelectElement && element.dataset.onlineBot!==undefined) {
    online?.send({type:'bot',slot:Number(element.dataset.onlineBot),level:Number(element.value)})
  }
})

function refreshModeSelectionInfo() {
  if (!modeMenuOpen) return
  const modes: Record<Mode,{players:string;name:string;copy:string}> = {
    versus:{players:'2-4 JUGADORES',name:'VERSUS SURGE',copy:'Todos contra todos. Cada plaza carga SURGE y ataca al rival.'},
    teams:{players:'4 JUGADORES',name:'EQUIPOS 2V2',copy:'Dos equipos. Coordinación, objetivos compartidos y presión competitiva.'},
    blitz:{players:'2-4 JUGADORES',name:'2V2 BLITZ',copy:'Relevos activos, defensa de equipo y rescates bajo presión.'},
  }
  const active=modes[mode]
  const info=app.querySelector<HTMLElement>('.mode-selection-info')
  if (!info) return
  info.innerHTML=`<small>${active.players}</small><strong>${active.name}</strong><p>${active.copy}</p>`
}

app.addEventListener('click',event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button || button.disabled) return
  if (button.hasAttribute('data-mode-back')) {
    modeMenuOpen=false
    audio.playEffect('character-confirm')
    render()
    return
  }
  if (button.dataset.mode!==undefined) {
    mode=button.dataset.mode as Mode
    modeMenuIndex=['versus','teams','blitz'].indexOf(mode)
    app.querySelectorAll('.arcade-mode').forEach((node,i)=>{
      node.classList.toggle('is-selected',i===modeMenuIndex)
      node.setAttribute('aria-pressed',String(i===modeMenuIndex))
    })
    refreshModeSelectionInfo()
    audio.playEffect('character-hover')
    return
  }
  if (button.hasAttribute('data-mode-confirm')) {
    modeMenuOpen=false
    audio.playEffect('character-confirm')
    const selected=app.querySelector<HTMLElement>(`.arcade-mode[data-mode="${mode}"]`)
    if (!settings.reduced && selected) selected.animate([
      {transform:'translateY(-8px) scale(1.035)',filter:'brightness(1.25)',offset:0},
      {transform:'translateY(-16px) scale(1.10)',filter:'brightness(1.5)',offset:.55},
      {transform:'translateY(-8px) scale(.98)',filter:'brightness(.8)',offset:1},
    ],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'})
    go('lobby')
    return
  }
  if (button.dataset.mainAction!==undefined) {
    const action=button.dataset.mainAction
    audio.playEffect(action==='play'?'character-confirm':'character-hover')
    if (action==='play') { modeMenuOpen=true; modeMenuIndex=['versus','teams','blitz'].indexOf(mode); render(); return }
    if (action==='online') { go('online'); return }
    if (action==='settings') { go('settings'); return }
    if (action==='controls') { go('controls'); return }
    if (action==='credits') { go('credits'); return }
  }
  if (button.dataset.seatSettings!==undefined) {
    const slot = Number(button.dataset.seatSettings)
    if (lobbyEditor===slot) toggleLobbyEditor(null)
    else toggleLobbyEditor(slot)
    return
  }
  if (button.hasAttribute('data-seat-close')) { toggleLobbyEditor(null); return }
  if (button.dataset.seatAction && lobbyEditor!==null) {
    const card = app.querySelector(`.lobby-fighter[data-slot="${lobbyEditor}"]`)
    card?.querySelector<HTMLButtonElement>(button.dataset.seatAction==='character'?'[data-character]':'[data-ready]')?.click()
    return
  }
  if (online && button.dataset.online) {
    switch (button.dataset.online) {
      case 'start': online.send({type:'start'}); break
      case 'lobby': online.send({type:'lobby'}); break
      case 'ready':
        if (pickerPending.has(onlineSeat)) break
        if (onlineLobby?.seats[onlineSeat]?.ready) {
          pickerConfirmed.delete(onlineSeat)
          online.send({type:'ready',value:false})
        } else confirmCharacter(onlineSeat,onlineLineup()[onlineSeat])
        break
      case 'copy': {
        const field = document.querySelector<HTMLInputElement>('#online-link')!
        field.select()
        const status = document.querySelector('.online-status')!
        void navigator.clipboard.writeText(field.value).then(()=>{ status.textContent = 'Enlace copiado.' },()=>{
          status.textContent = 'Copia el enlace seleccionado.'
        })
      }
    }
    return
  }
  const {page:next,do:action,ready:index,controlPlayer:player,controlType:type,action:bind} = button.dataset
  if (button.dataset.controlContext) {
    controlContext = button.dataset.controlContext as typeof controlContext
    inputs.capture=null
    inputs.pairing=null
    status=''
    controlType=controlContext==='online' ? (settings.online.device==='pad'?'pad':'keys') : controlType
    render()
    return
  }
  if (button.dataset.onlineDevice) {
    settings.online.device=button.dataset.onlineDevice as typeof settings.online.device
    controlType=settings.online.device==='pad'?'pad':'keys'
    status=storeResult(settings.online.device==='pad'?'Modo mando seleccionado.':'Modo teclado seleccionado.')
    inputs.capture=null
    syncOnlineProfile()
    render()
    return
  }
  if (button.dataset.onlineAction) {
    const binding=button.dataset.onlineAction as Action
    const map=controlType==='keys'?settings.online.keyboard:settings.online.pad
    const device=inputs.assigned[0]
    if (controlType==='pad'&&!device) return
    status=controlType==='pad'?'Pulsa un botón o mueve un eje del mando.':'Pulsa la nueva tecla. Esc cancela.'
    inputs.pairing=null
    inputs.capture={player:0,type:controlType,baseline:new Set(device?padBindings(device):[]),done(value){
      const duplicate=ACTIONS.find(action=>action!==binding&&map[action]===value)
      if (duplicate) status='Conflicto: '+label(value)+' ya está asignado a '+actionNamesOnline[duplicate]+'.'
      else { map[binding]=value; status=storeResult('Asignación online guardada: '+label(value)+'.'); syncOnlineProfile() }
      render()
      app.querySelector<HTMLButtonElement>(`[data-online-action="${binding}"]`)?.focus()
    }}
    render()
    return
  }
  if (button.dataset.character!==undefined) {
    openPicker(Number(button.dataset.character))
    return
  }
  if (next) {
    if (button.dataset.mode==='teams' || button.dataset.mode==='versus' || button.dataset.mode==='blitz') mode = button.dataset.mode
    go(next as Page)
    return
  }
  if (index !== undefined) {
    const i = Number(index)
    lobbyIssue = !ready[i] && isHuman(i) && !settings.slots[i].device ? keyboardIssue(i) : ''
    if (!lobbyIssue && !ready[i]) { confirmCharacter(i,settings.characters[i]); if (ready[i]) audio.playEffect('player-ready'); return }
    if (!lobbyIssue) {
      ready[i] = false
      pickerConfirmed.delete(i)
    }
    render()
    return
  }
  if (player !== undefined || type) {
    if (player !== undefined) controlPlayer = Number(player)
    if (type) controlType = type as typeof controlType
    inputs.capture = null
    inputs.pairing = null
    status = ''
    render()
    return
  }
  if (bind && ACTIONS.includes(bind as Action)) {
    const i = controlPlayer
    const mode = controlType
    const binding = bind as Action
    const device = inputs.assigned[i]
    if (mode === 'pad' && !device) return
    inputs.pairing = null
    status = mode === 'pad' ? 'Pulsa un botón o mueve un eje del mando.' : 'Pulsa la nueva tecla. Esc cancela.'
    inputs.capture = {player:i,type:mode,baseline:new Set(device ? padBindings(device) : []),done(value) {
      const duplicate = conflict(settings.slots,i,mode,binding,value,isHuman)
      if (duplicate) status = 'Conflicto: '+label(value)+' ya está asignado a '+duplicate+'.'
      else {
        settings.slots[i][mode][binding] = value
        status = storeResult('Asignación guardada: '+label(value)+'.')
      }
      render()
      app.querySelector<HTMLButtonElement>('[data-action="'+binding+'"]')?.focus()
    }}
    render()
    return
  }
  if (action === 'start' && canStart()) start(lobbyRoster())
  if (action === 'pair-online') {
    inputs.capture=null
    status='Pulsa un botón del mando que quieres usar online.'
    inputs.pairing={baseline:pressedButtons(inputs.devices),accept(device){
      settings.online.padId={index:device.index,id:device.id}
      settings.online.device='pad'
      settings.online.pad=automaticPadMap(device)
      inputs.assigned[0]=device
      inputs.pairing=null
      controlType='pad'
      status=storeResult('Mando online seleccionado: '+device.id+'.')
      syncOnlineProfile()
      render()
      return true
    }}
    render()
  }
  if (action === 'reset-online') {
    const map=controlType==='pad'&&inputs.assigned[0]?automaticPadMap(inputs.assigned[0]):defaultMap(0,controlType)
    const clashes=ACTIONS.flatMap(a=>ACTIONS.find(other=>other!==a&&map[other]===map[a])?[label(map[a])]:[])
    if (clashes.length) status='Hay asignaciones duplicadas: '+clashes.join(', ')+'.'
    else {
      if (controlType==='keys') settings.online.keyboard=map
      else settings.online.pad=map
      status=storeResult('Controles online predeterminados restaurados.')
      syncOnlineProfile()
    }
    render()
  }
  if (action === 'pair') {
    const i = controlPlayer
    inputs.capture = null
    status = 'Esperando un botón del mando para J'+(i+1)+'.'
    inputs.pairing = {baseline:pressedButtons(inputs.devices),accept(device) {
      const owner = settings.slots.findIndex((slot,j) => j!==i && slot.device?.index===device.index && slot.device.id===device.id)
      if (owner >= 0) settings.slots[owner].device=null
      releaseBotReservation(device)
      settings.slots.forEach((slot,j)=>{ if (j!==i && slot.device?.index===device.index && slot.device.id===device.id) { slot.device=null; slot.deviceType=null } })
      settings.slots[i].device = {index:device.index,id:device.id}
      settings.slots[i].deviceType='pad'
      settings.slots[i].pad = automaticPadMap(device)
      inputs.assigned[i] = device
      inputs.pairing = null
      controlType = 'pad'
      ready[i] = false
      const mapping = device.mapping === 'standard' ? 'Perfil estándar aplicado.' :
        'Perfil genérico aplicado. Comprueba las asignaciones y ajusta las que necesites.'
      status = storeResult('Mando asignado a J'+(i+1)+'. '+mapping)
      render()
      return true
    }}
    render()
  }
  if (action === 'keyboard') {
    const issue = keyboardIssue(controlPlayer)
    if (issue) { controlType = 'keys'; status = issue; render(); return }
    settings.slots.forEach((slot,i)=>{ if (i!==controlPlayer && slot.deviceType==='keyboard') { slot.device=null; slot.deviceType=null } })
    settings.slots[controlPlayer].device = null
    settings.slots[controlPlayer].deviceType='keyboard'
    inputs.assigned[controlPlayer] = null
    ready[controlPlayer] = false
    controlType = 'keys'
    status = storeResult('Teclado asignado a J'+(controlPlayer+1)+'.')
    render()
  }
  if (action === 'mute') {
    settings.audio.mute = !settings.audio.mute
    audio.update(); store(); muteButton()
  }
  if (action === 'reset') {
    const device = inputs.assigned[controlPlayer]
    const defaults = controlType === 'pad' && device ? automaticPadMap(device) : defaultMap(controlPlayer,controlType)
    const copy = settings.slots.map((slot,i) => i === controlPlayer ? {...slot,[controlType]:defaults} : slot)
    const clashes = ACTIONS.flatMap(a => {
      if (!defaults[a]) return []
      const clash = conflict(copy,controlPlayer,controlType,a,defaults[a],isHuman)
      return clash ? [label(defaults[a])+' → '+clash] : []
    })
    if (clashes.length) status = 'Libera las teclas ocupadas para restaurar: '+clashes.join(', ')+'.'
    else {
      settings.slots[controlPlayer][controlType] = defaults
      status = storeResult('Controles predeterminados restaurados.')
    }
    inputs.capture = null
    inputs.pairing = null
    render()
  }
  if (action === 'cancel') cancelCapture()
  if (action === 'pause') pause()
  if (action === 'resume') resume()
  if (action === 'rematch' && match && !disconnected(match.roster).length) start(match.roster)
})

const storeResult = (success: string) => saveSettings(settings) ? success : 'Aplicado en esta sesión. El navegador no permitió guardar los cambios.'
function cancelCapture() {
  status = inputs.pairing ? 'Asignación cancelada.' : 'Captura cancelada.'
  inputs.capture = null
  inputs.pairing = null
  render()
}
window.addEventListener('keydown',event => {
  if (event.code !== 'Escape' || event.repeat) return
  if (inputs.capture || inputs.pairing) cancelCapture()
  else if (page === 'game' && phase === 'paused') resume()
  else if (page === 'game') pause()
})

app.addEventListener('input',event => {
  const el = event.target as HTMLInputElement
  if (el.dataset.name !== undefined) {
    const i = Number(el.dataset.name)
    settings.slots[i].name = el.value.trim() || 'Jugador '+(i+1)
    const name = app.querySelector(`[data-lobby-name="${i}"]`)
    if (name) name.textContent = settings.slots[i].name
    store()
  }
  if (el.dataset.volume) {
    const key = el.dataset.volume as Exclude<keyof Mix,'mute'>
    settings.audio[key] = Number(el.value)
    const label=el.closest('.volume')?.querySelector<HTMLElement>('.volume-value')
    if (label) label.textContent=`${Math.round(settings.audio[key]*100)}%`
    audio.update(); store()
  }
})
app.addEventListener('change',event => {
  const el = event.target as HTMLInputElement | HTMLSelectElement
  if (el.dataset.battleIntroPref!==undefined && isBattleIntroPreference(el.value)) {
    settings.battleIntro = el.value
    store()
    return
  }
  const option = el.dataset.characterOption
  if (option && option in settings.characterOptions && el instanceof HTMLInputElement) {
    settings.characterOptions[option as keyof CharacterOptions] = el.checked
    store()
    return
  }
  const {device,rule,view,attack,controller,level} = el.dataset
  const blitz = el.dataset.blitz
  if (blitz && el instanceof HTMLInputElement) {
    if (blitz==='zone' || blitz==='effects') settings.blitz[blitz] = el.checked
    else if (blitz in BLITZ_NUMBERS) {
      const key = blitz as keyof typeof BLITZ_NUMBERS
      const [,min,max] = BLITZ_NUMBERS[key]
      const value = Number.isFinite(el.valueAsNumber) ? Math.round(el.valueAsNumber) : settings.blitz[key]
      settings.blitz[key] = Math.min(max,Math.max(min,value))
      el.value = String(settings.blitz[key])
    }
    store()
  }
  if (controller!==undefined) {
    const i = Number(controller)
    const bot = el.value==='bot'
    lobbyIssue = !bot && !settings.slots[i].device ? keyboardIssue(i) : ''
    if (lobbyIssue) { render(); return }
    settings.controllers[i].bot = bot
    if (bot) {
      settings.slots[i].device=null
      settings.slots[i].deviceType=null
    } else if (settings.slots[i].deviceType===null) {
      lobbyIssue='Selecciona un dispositivo válido para esta plaza.'
    }
    ready[i] = bot
    inputs.poll()
    store(); render()
    app.querySelector<HTMLSelectElement>(`[data-controller="${i}"]`)?.focus()
  }
  if (level!==undefined) {
    const next = settings.controllers[Number(level)].level = botLevel(Number(el.value))
    const badge = app.querySelector(`[data-lobby-level="${level}"]`)
    if (badge) badge.textContent = `${next} · ${BOT_LEVELS[next-1]}`
    store()
  }
  if (el.id === 'profile') {
    settings.profile = el.value as Profile
    if (settings.profile !== 'Personalizado') settings.rules = freshRules(settings.profile)
    store(); render()
  }
  if (device !== undefined && el.value !== 'missing') {
    const i = Number(device)
    if (el.value==='keyboard') {
      settings.slots.forEach((slot,j)=>{ if (j!==i && slot.deviceType==='keyboard') slot.deviceType=null })
      settings.slots[i].device=null
      settings.slots[i].deviceType='keyboard'
      ready[i]=false
      lobbyIssue=keyboardIssue(i)
      inputs.assigned[i]=null
      inputs.poll()
      store(); render()
      return
    }
    if (el.value==='none') {
      settings.slots[i].device=null
      settings.slots[i].deviceType=null
      ready[i]=false
      inputs.assigned[i]=null
      lobbyIssue=''
      inputs.poll(); store(); render(); return
    }
    const pad = inputs.devices.find(p => p.index === Number(el.value) && el.value !== '')
    lobbyIssue = !pad ? keyboardIssue(i) : ''
    if (lobbyIssue) { render(); return }
    if (pad) {
      releaseBotReservation(pad)
      settings.slots.forEach((slot,j)=>{ if (j!==i && slot.device?.index===pad.index && slot.device.id===pad.id) { slot.device=null; slot.deviceType=null } })
      if (settings.slots[i].device?.id !== pad.id) settings.slots[i].pad = automaticPadMap(pad)
    }
    settings.slots[i].device = pad ? {index:pad.index,id:pad.id} : null
    settings.slots[i].deviceType=pad?'pad':null
    ready[i] = false
    inputs.assigned[i] = null
    inputs.poll()
    store(); render()
  }
  if (rule) {
    if (rule in NUMBER_RULES && el instanceof HTMLInputElement) {
      const key = rule as keyof typeof NUMBER_RULES
      const [,min,max,step] = NUMBER_RULES[key]
      const value = Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : settings.rules[key]
      settings.rules[key] = Math.min(max,Math.max(min,step===1 ? Math.round(value) : value))
      el.value = String(settings.rules[key])
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const key = rule as 'shared'|'floorKicks'|'zone'|'extraSpins'
      settings.rules[key] = el.checked
    } else if (rule === 'seed') settings.rules.seed = el.value
    else if (rule === 'target') settings.rules.target = el.value as typeof settings.rules.target
    else if (rule === 'generator') settings.rules.generator = el.value as typeof settings.rules.generator
    settings.profile = 'Personalizado'
    const profile = app.querySelector<HTMLSelectElement>('#profile')
    if (profile) profile.value = settings.profile
    store()
  }
  if (attack && el instanceof HTMLInputElement && attack in ATTACK_LABELS) {
    const key = attack as keyof typeof settings.rules.attack
    const value = Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : settings.rules.attack[key]
    settings.rules.attack[key] = Math.min(100,Math.max(Number(el.min),Math.round(value)))
    el.value = String(settings.rules.attack[key])
    settings.profile = 'Personalizado'
    app.querySelector<HTMLSelectElement>('#profile')!.value = settings.profile
    store()
  }
  if (view && el instanceof HTMLInputElement) {
    if (view === 'mute') { settings.audio.mute = el.checked; audio.update(); muteButton() }
    else if (view === 'reduced' || view === 'metrics') settings[view] = el.checked
    app.classList.toggle('reduced',settings.reduced)
    store()
  }
})

const frameStep = 1000/HZ
let previous = performance.now()
let accumulator = 0
let lastScan = -1000
let fingerprint = ''
let frames = 0
let steps = 0
let clockText = ''
function formatTime(ticks: number) {
  const seconds = Math.floor(ticks/HZ)
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')
}

function onlineLineup() { return uniqueCharacters(onlineLobby?.seats.map(seat=>seat.character)) }

function syncLobbyEditor() {
  const tray = app.querySelector<HTMLElement>('#lobby-seat-editor')
  const active = tray?.querySelector<HTMLElement>(`[data-seat-editor="${lobbyEditor}"]`)
  if (!active) lobbyEditor = null
  if (tray) tray.hidden = !active
  for (const editor of tray?.querySelectorAll<HTMLElement>('[data-seat-editor]') ?? []) editor.hidden = editor!==active
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-seat-settings]')) {
    button.setAttribute('aria-expanded',String(Number(button.dataset.seatSettings)===lobbyEditor))
  }
  return active
}

function toggleLobbyEditor(slot:number|null) {
  const previous = lobbyEditor
  lobbyEditor = slot
  const editor = syncLobbyEditor()
  if (editor) {
    editor.scrollIntoView({block:'nearest'})
    editor.querySelector<HTMLElement>('input,select')?.focus({preventScroll:true})
  } else if (previous!==null) app.querySelector<HTMLButtonElement>(`[data-seat-settings="${previous}"]`)?.focus()
}

const pickerLineup = () => page==='online' ? onlineLineup() : settings.characters
const pickerReservations = () => page==='online' ? onlineLobby?.seats.map(seat=>seat.characterConfirmed ?? seat.ready) ?? [] : ready
const editablePickerSeats = () => page==='lobby' ? [0,1,2,3] : page==='online' && onlineLobby ?
  onlineLobby.seats.flatMap((seat,slot)=>slot===onlineSeat || onlineSeat===onlineLobby?.host && !seat.name ? [slot] : []) : []

function refreshPicker() {
  if (pickerSlot===null) return
  const seats = editablePickerSeats()
  if (!seats.includes(pickerSlot)) { closePicker(); return }
  const lineup = pickerLineup()
  const id = pickerDrafts.get(pickerSlot) ?? lineup[pickerSlot]
  const caption = selectionCaptions.get(pickerSlot)
  picker.update({slot:pickerSlot,id,lineup,seats,drafts:pickerDrafts,reserved:pickerReservations(),
    pending:pickerPending.has(pickerSlot) || page==='online' && !onlineConnected,
    confirmed:pickerConfirmed.get(pickerSlot)===id && lineup[pickerSlot]===id && !!pickerReservations()[pickerSlot],
    reduced:settings.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches,
    caption:caption?.id===id ? caption.text : '',notice:page==='online' && !onlineConnected ? 'Esperando conexión con la sala.' : pickerNotice})
}

function openPicker(slot:number) {
  if (!editablePickerSeats().includes(slot)) return
  pickerSlot = slot
  pickerNotice = ''
  if (!pickerDrafts.has(slot)) pickerDrafts.set(slot,pickerLineup()[slot])
  refreshPicker()
}

function closePicker() {
  const slot = pickerSlot
  pickerSlot = null
  pickerNotice = ''
  picker.close()
  if (slot!==null) {
    pickerDrafts.delete(slot)
    app.querySelector<HTMLButtonElement>(`[data-character="${slot}"]`)?.focus({preventScroll:true})
  }
}

function resetPicker() {
  closePicker()
  pickerDrafts.clear()
  pickerConfirmed.clear()
  pickerPending.clear()
}

function previewCharacter(slot:number,id:CharacterId) {
  const previous = pickerDrafts.get(slot) ?? pickerLineup()[slot]
  pickerDrafts.set(slot,id)
  if (previous!==id) audio.playEffect('character-hover')
  if (slot===pickerSlot) pickerNotice = ''
  refreshPicker()
  if (slot===pickerSlot) {
    picker.focus(id)
  }
}

function confirmCharacter(slot:number,id:CharacterId) {
  if (!editablePickerSeats().includes(slot) || pickerPending.has(slot)) return
  const next = chooseCharacter(pickerLineup(),slot,id,pickerReservations())
  if (!next) {
    if (pickerSlot===slot) pickerNotice = 'Ese personaje ya está ocupado.'
    refreshPicker()
    return
  }
  if (page==='online' && online) {
    if (!onlineConnected) return
    const request = ++selectionRequest
    pickerPending.set(slot,{id,request})
    refreshPicker()
    online.send({type:'character',slot,id,request})
    return
  }
  if (page!=='lobby') return
  lobbyIssue = isHuman(slot) ? settings.slots[slot].device ?
    inputs.assigned[slot] ? '' : 'Reconecta el mando para marcar listo.' : keyboardIssue(slot) : ''
  if (!lobbyIssue) {
    settings.characters = next
    const wasReady = ready[slot]
    ready[slot] = true
    if (!wasReady) audio.playEffect('player-ready')
    pickerDrafts.delete(slot)
    store()
  }
  if (pickerSlot===slot) pickerNotice = lobbyIssue
  render()
  if (!lobbyIssue) completeSelection(slot,id)
}

function completeSelection(slot:number,id:CharacterId) {
  pickerConfirmed.set(slot,id)
  audio.playEffect('character-confirm')
  if (pickerSlot===slot) pickerNotice = ''
  refreshPicker()
  app.querySelector(`.lobby-fighter[data-slot="${slot}"]`)?.classList.add('picker-confirmed')
  if (pickerSlot===slot) {
    picker.focus(id)
    picker.flash(id)
  }
  showSelection(id,slot)
}

picker.node.addEventListener('click',event=>{
  const button = (event.target as HTMLElement).closest('button')
  if (!button || button.disabled || pickerSlot===null) return
  const {pickerSeat,pickerId} = button.dataset
  if (button.hasAttribute('data-picker-close')) closePicker()
  else if (pickerSeat!==undefined) openPicker(Number(pickerSeat))
  else if (isCharacterId(pickerId)) previewCharacter(pickerSlot,pickerId)
  else if (button.hasAttribute('data-picker-confirm')) confirmCharacter(pickerSlot,pickerDrafts.get(pickerSlot) ?? pickerLineup()[pickerSlot])
})
picker.node.addEventListener('cancel',event=>{ event.preventDefault(); closePicker() })

const selectionActions = ['left','right','cw','ccw'] as const
type SelectionAction = typeof selectionActions[number]
const characterSeats = () => page==='lobby' ? settings.slots.flatMap((_,i)=>isHuman(i)?[i]:[]) :
  page==='online' && onlineLobby && onlineSeat>=0 ? [onlineSeat] : []

function characterInput(slot:number,action:SelectionAction) {
  if (!editablePickerSeats().includes(slot)) return
  if (action==='ccw') {
    if (pickerSlot===slot) closePicker()
    else if (pickerDrafts.delete(slot)) refreshPicker()
    return
  }
  const lineup = pickerLineup()
  if (action==='cw') {
    if (pickerSlot===slot || pickerDrafts.has(slot) || !pickerReservations()[slot]) confirmCharacter(slot,pickerDrafts.get(slot) ?? lineup[slot])
    return
  }
  if (pickerSlot===null) openPicker(slot)
  const reserved = pickerReservations()
  const options = CHARACTER_IDS.filter(id=>{
    const owner = lineup.indexOf(id)
    return owner<0 || owner===slot || !reserved[owner]
  })
  const current = options.indexOf(pickerDrafts.get(slot) ?? lineup[slot])
  const direction = action==='right' ? 1 : -1
  previewCharacter(slot,options[(current+direction+options.length)%options.length])
}

window.addEventListener('keydown',event=>{
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (page==='home') {
    const action = modeMenuOpen ? (
      event.key==='ArrowLeft'?'left':event.key==='ArrowRight'?'right':event.key==='ArrowUp'?'up':
      event.key==='ArrowDown'?'down':event.key==='Enter'?'confirm':event.key==='Escape'?'cancel':''
    ) : (
      event.key==='ArrowUp'?'up':event.key==='ArrowDown'?'down':event.key==='Enter'?'confirm':
      event.key==='Escape'?'cancel':''
    )
    if (action) {
      event.preventDefault()
      if (action==='cancel') {
        if (modeMenuOpen) { modeMenuOpen=false; render(); audio.playEffect('character-hover') }
        return
      }
      if (modeMenuOpen) {
        if (action==='left'||action==='right') {
          modeMenuIndex=(modeMenuIndex+(action==='right'?1:-1)+3)%3
          mode=['versus','teams','blitz'][modeMenuIndex] as Mode
          app.querySelectorAll('.arcade-mode').forEach((node,i)=>{
            node.classList.toggle('is-selected',i===modeMenuIndex)
            node.setAttribute('aria-pressed',String(i===modeMenuIndex))
          })
          refreshModeSelectionInfo()
          audio.playEffect('character-hover')
        } else if (action==='confirm') {
          modeMenuOpen=false
          audio.playEffect('character-confirm')
          go('lobby')
        }
        return
      }
      if (action==='up'||action==='down') {
        arcadeMenuIndex=(arcadeMenuIndex+(action==='down'?1:-1)+5)%5
        app.querySelectorAll('.arcade-option').forEach((node,i)=>node.classList.toggle('is-selected',i===arcadeMenuIndex))
        audio.playEffect('character-hover')
        return
      }
      if (action==='confirm') app.querySelector<HTMLButtonElement>(`.arcade-option[data-arcade-index="${arcadeMenuIndex}"]`)?.click()
    }
  }
  const inside = picker.node.contains(target)
  const focused = target.dataset.character
  if (!inside && focused===undefined && target.closest('input,select,textarea,button,a,[contenteditable]')) return
  for (const slot of characterSeats()) {
    if (focused!==undefined && focused!==String(slot)) continue
    const config = settings.slots[page==='online' ? 0 : slot]
    if (config.device) continue
    const action = selectionActions.find(action=>config.keys[action]===event.code)
    if (!action) continue
    event.preventDefault()
    characterInput(slot,action)
    return
  }
  if (inside && pickerSlot!==null && (event.code==='ArrowLeft' || event.code==='ArrowRight')) {
    event.preventDefault()
    characterInput(pickerSlot,event.code==='ArrowLeft'?'left':'right')
  }
})

function pollCharacterPads() {
  if (page==='home') {
    for (const pad of inputs.devices) {
      const bindings=padBindings(pad)
      const up=bindings.includes('B12')||(pad.mapping==='standard'&&pad.buttons[12]?.pressed)
      const down=bindings.includes('B13')||(pad.mapping==='standard'&&pad.buttons[13]?.pressed)
      const left=bindings.includes('B14')||(pad.mapping==='standard'&&pad.buttons[14]?.pressed)
      const right=bindings.includes('B15')||(pad.mapping==='standard'&&pad.buttons[15]?.pressed)
      const confirm=bindings.includes('B0')||(pad.mapping==='standard'&&pad.buttons[0]?.pressed)
      const cancel=bindings.includes('B1')||(pad.mapping==='standard'&&pad.buttons[1]?.pressed)
      const prior=arcadePadPrior.get(pad.index)??{up:false,down:false,left:false,right:false,confirm:false,cancel:false}
      arcadePadPrior.set(pad.index,{up,down,left,right,confirm,cancel})
      if (modeMenuOpen && (left&&!prior.left||right&&!prior.right)) {
        modeMenuIndex=(modeMenuIndex+(right&&!prior.right?1:-1)+3)%3
        mode=['versus','teams','blitz'][modeMenuIndex] as Mode
        app.querySelectorAll('.arcade-mode').forEach((node,i)=>{
          node.classList.toggle('is-selected',i===modeMenuIndex)
          node.setAttribute('aria-pressed',String(i===modeMenuIndex))
        })
        refreshModeSelectionInfo()
        audio.playEffect('character-hover')
      } else if (!modeMenuOpen && (up&&!prior.up||down&&!prior.down)) {
        arcadeMenuIndex=(arcadeMenuIndex+(down&&!prior.down?1:-1)+5)%5
        app.querySelectorAll('.arcade-option').forEach((node,i)=>node.classList.toggle('is-selected',i===arcadeMenuIndex))
        audio.playEffect('character-hover')
      }
      if (confirm&&!prior.confirm) app.querySelector<HTMLButtonElement>(modeMenuOpen?'.arcade-confirm':`.arcade-option[data-arcade-index="${arcadeMenuIndex}"]`)?.click()
      if (cancel&&!prior.cancel) {
        if (modeMenuOpen) { modeMenuOpen=false; render() }
        else if (page==='home') go('home')
      }
    }
  }
  for (const slot of characterSeats()) {
    const local = page==='online' ? 0 : slot
    const pad = inputs.assigned[local]
    const bindings = pad ? padBindings(pad) : []
    const map = settings.slots[local].pad
    const held = new Set<Action>(selectionActions.filter(action=>bindings.includes(map[action])))
    const previous = lobbyPadPrior[slot]
    lobbyPadPrior[slot] = held
    if (!previous) continue
    const action = selectionActions.find(action=>held.has(action) && !previous.has(action))
    if (action) characterInput(slot,action)
  }
}

function speak(id:CharacterId,event:VoiceEvent,seat:number,caption:(text:string|undefined,timed:boolean,state:DialogueState)=>void,priority=1) {
  const voiceEnabled = settings.characterOptions.attackVoices || !isAttackVoice(event)
  const clip = voiceEnabled ? japaneseVoice(id,event) : undefined
  const text = settings.characterOptions.subtitles ? subtitleFor(id,event) : undefined
  if (!voiceEnabled && !text) return
  if (clip) audio.wake()
  audio.playCharacterVoice(clip,seat,state=>{
    caption(state==='playing' || state==='fallback' ? text : undefined,state==='fallback',state)
  },priority)
}

function showSelectionCaption(seat:number,text:string) {
  const caption = app.querySelector(`[data-selection-caption="${seat}"]`)
  if (caption) caption.textContent = text
  if (seat===pickerSlot) {
    const id = pickerDrafts.get(seat) ?? pickerLineup()[seat]
    picker.setCaption(selectionCaptions.get(seat)?.id===id ? text : '')
  }
}

function showSelection(id:CharacterId,seat:number) {
  speak(id,'selection',seat,(text,timed)=>{
    if (page!=='lobby' && page!=='online') return
    if (!text) {
      selectionCaptions.delete(seat)
      showSelectionCaption(seat,'')
      return
    }
    if ((page==='online' ? onlineLineup() : settings.characters)[seat]!==id) return
    const caption = {id,text:`${CHARACTERS[id].name} · ${text}`}
    selectionCaptions.set(seat,caption)
    showSelectionCaption(seat,caption.text)
    if (timed) setTimeout(()=>{
      if (selectionCaptions.get(seat)!==caption) return
      selectionCaptions.delete(seat)
      showSelectionCaption(seat,'')
    },3500)
  })
}

function presentCharacter(index:number,event:Match['players'][number]['events'][number],current:Match) {
  const view = arena
  const cue = view?.characterEvent(index,event,current.now)
  if (event.type==='simpleAttack') {
    const seat = current.roster[index].slot
    const id = matchCharacters[seat]
    const now = performance.now()
    if (now-(simpleAttackLast.get(seat) ?? -2500)>=2500) {
      simpleAttackLast.set(seat,now)
      const variant = simpleAttackVariant.get(seat) ?? 0
      simpleAttackVariant.set(seat,variant===0?1:0)
      speak(id,variant===0?'simpleAttack1':'simpleAttack2',seat,(text,timed,state)=>{
        view?.subtitle(index,text,timed,state==='ended',false)
      },1)
    }
  }
  if (!cue?.voice) return
  const seat = current.roster[index].slot
  speak(matchCharacters[seat],cue.voice,seat,(text,timed,state)=>
    view?.subtitle(index,text,timed,state==='ended',cue.voice==='zoneFinish'),cue.priority)
}

function playEvent(activeMatch: Match, i: number, event: Match['players'][number]['events'][number]) {
  const activeArena = arena
  const player = activeMatch.players[i]
  presentCharacter(i,event,activeMatch)
  if (event.type==='perfect') {
    perfectSeen.set(i,activeMatch.now)
    audio.playEffect('perfect-clear',.88)
  } else if (event.type==='combo') {
    if ((perfectSeen.get(i)??-1)!==activeMatch.now) {
      const level=Math.max(1,Number(event.detail)||1)
      const playbackRate=comboRisePlaybackRate(level)
      audio.playEffect('combo-rise',.68,playbackRate)
    }
  } else if (event.type==='critical') {
    if (!activeMatch.players[i].dead && !criticalSeen.has(i)) {
      criticalSeen.add(i)
      audio.playEffect('danger-alert',.82)
    }
  } else if (event.type==='eliminated') {
    criticalSeen.delete(i)
  } else if (event.type==='zoneStart') {
    audio.playEffect('surge-activate',.82)
  } else if (event.type==='zoneEnd') {
    audio.playEffect('surge-finish',.82)
  } else if (event.type==='blitzWarning') {
    if (!blitzWarningSent) {
      blitzWarningSent=true
      audio.playEffect('blitz-swap-warning',.78)
    }
  } else if (event.type==='blitzRotate'||event.type==='blitzEmergency') {
    blitzWarningSent=false
    audio.playEffect('blitz-swap',.82)
  } else if (event.type==='blitzRevived') {
    audio.playEffect('teammate-revive',.82)
  } else if (event.type==='victory'||event.type==='blitzVictory') {
    // The definitive stinger is owned by drawOverlay() so rerenders and online frames cannot duplicate it.
  }
  if (event.type==='send') audio.playEffect('attack-send')
  if (activeMatch instanceof BlitzMatch && (event.type==='eliminated' || event.type==='blitzRevived')) {
    const teammate = activeMatch.roster.findIndex((p,j)=>j!==i && p.team===activeMatch.roster[i].team && !activeMatch.players[j].dead)
    if (teammate>=0) {
      const teammateEvent=event.type==='eliminated'?'teammateDown':'teammateRevived'
      if (event.type==='eliminated') audio.playEffect('teammate-down',.82)
      presentCharacter(teammate,{type:teammateEvent},activeMatch)
    }
  }
  activeArena?.note(i,event.type,event.detail,activeMatch.now)
  if (activeArena && event.type==='incoming' && event.source!==undefined) {
    activeArena.attack(event.source,i,activeMatch.now,() => {
      if (match!==activeMatch || arena!==activeArena || player.dead) return
      activeArena.note(i,'impact',undefined,activeMatch.now)
      audio.playEffect('damage-impact',Math.min(1,0.55+Number(event.detail)*0.07))
      audio.play(event,activeMatch.roster[i].slot)
    })
  } else if (!(activeMatch instanceof BlitzMatch && event.type==='eliminated')) audio.play(event,activeMatch.roster[i].slot)
}

function frame(now: number) {
  accumulator += Math.min(Math.max(0,now-previous),frameStep*SETTINGS.catchupTicks)
  previous = now
  frames++
  inputs.poll()
  pollCharacterPads()
  if (!online && page === 'game' && match && disconnected(match.roster).length) pause()
  while (accumulator >= frameStep) {
    accumulator -= frameStep
    const physical = inputs.consume()
    if (!match || page !== 'game' || phase === 'results') continue
    if (online) {
      if (phase==='live') online.input(physical[0])
      continue
    }
    const sample = match.roster.map(p=>p.level===undefined ? physical[p.slot] : NO_INPUT)
    if (sample.some(input => input.pressed.includes('pause'))) {
      if (phase === 'paused') resume()
      else pause()
      continue
    }
    if (phase === 'paused') continue
    if (phase === 'countdown') {
      if (countdown===SETTINGS.countdown+1) startBattleMusic(match)
      if (--countdown <= 0) {
        phase='live'
        battleIntro?.announce(0)
      }
      continue
    }
    const alive = match.players.map(p=>!p.dead)
    match.tick(sample)
    steps++
    match.players.forEach((p,i) => {
      if (p.zone.active && p.zone.remaining % (HZ*2) === 0 && p.zone.remaining !== p.zone.duration) p.event('zoneLoop')
      if (p.danger!==2) criticalSeen.delete(i)
      if (!p.dead && p.zone.energy>=p.rules.zoneMinimum && !p.zone.active && !surgeReadySeen.has(i)) {
        surgeReadySeen.add(i)
        audio.playEffect('surge-ready',.72)
      } else if (p.zone.active || p.zone.energy<p.rules.zoneMinimum) {
        surgeReadySeen.delete(i)
      }
      for (const event of p.events) if (match) playEvent(match,i,event)
      p.events.length = 0
    })
    if (match.finished) {
      finalFallen = match.players.flatMap((p,i)=>p.dead && alive[i] ? [i] : [])
      audio.stopMusic()
      phase = 'results'
    }
  }
  if (match && page === 'game') {
    arena?.draw(match,displaySlots())
    drawOverlay()
    const time = formatTime(match.now)
    const elapsed = document.querySelector('#elapsed')
    if (elapsed && (time!==clockText || elapsed.textContent!==time)) elapsed.textContent = clockText = time
  }
  if (now-lastScan >= 250) {
    const elapsed = now-lastScan
    lastScan = now
    if (page === 'diag') document.querySelector('#device-list')!.innerHTML = diagnostic(inputs,settings)
    if (page === 'lobby' || page === 'controls') {
      const connected = JSON.stringify([inputs.devices.map(p => [p.index,p.id]),inputs.assigned.map(p => p?.index)])
      if (fingerprint !== connected && !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLSelectElement)) {
        fingerprint = connected
        if (page === 'lobby') for (const i of disconnected(lobbyRoster())) ready[i] = false
        if (page === 'controls' && inputs.capture?.type === 'pad' && !inputs.assigned[controlPlayer]) {
          inputs.capture = null; status = 'Mando desconectado. Reconéctalo para continuar.'
        }
        render()
      }
    }
    const metrics = document.querySelector('#metrics')
    if (settings.metrics && metrics) metrics.textContent = `${Math.round(frames*1000/elapsed)} FPS · ${Math.round(steps*1000/elapsed)} UPS`
    frames = steps = 0
  }
  requestAnimationFrame(frame)
}
inputs.poll()
render()
requestAnimationFrame(frame)
