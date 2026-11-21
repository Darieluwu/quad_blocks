import './style.css'
import { Match, teamForSlot, type Participant } from './engine/match'
import { BlitzMatch } from './engine/blitz'
import { HZ, PLAYERS, SETTINGS } from './engine/rules'
import { ACTIONS, NO_INPUT, type Action } from './engine/player'
import { botLevel } from './engine/bot'
import { Inputs, automaticPadMap, conflict, defaultMap, keyboardClashes, label, padBindings, pressedButtons } from './input'
import { Sound } from './audio'
import { mountArena } from './render'
import { ATTACK_LABELS, BLITZ_NUMBERS, NUMBER_RULES, freshRules, loadSettings, saveSettings, type Mix, type Profile } from './settings'
import { configuration, controls, credits, diagnostic, diagnosticsPage, escape, footer, header, home, icon, lobby, modeName, paintHome, teamName, type Mode } from './menu'
import { RoomClient, inviteCode } from './online/client'
import { onlineMenu } from './online/menu'
import { OnlineMatch, randomId, type LobbyState, type ServerMessage } from './online/protocol'

type Page = 'home'|'lobby'|'settings'|'controls'|'diag'|'credits'|'game'|'online'
const app = document.querySelector<HTMLElement>('#app')!
const settings = loadSettings()
const ready = settings.slots.map(() => false)
let page: Page = 'home'
let mode: Mode = 'versus'
let returnPage: 'home'|'lobby' = 'home'
let controlPlayer = 0
let controlType: 'keys'|'pad' = 'keys'
let status = ''
let lobbyIssue = ''
let match: Match | null = null
let arena: ReturnType<typeof mountArena> | null = null
let phase: 'countdown'|'live'|'paused'|'results' = 'countdown'
let countdown: number = SETTINGS.countdown
let resumePhase: 'live'|'countdown' = 'countdown'
let pauseReason = ''
let overlayState = ''
let finalFallen: number[] = []
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
const inputs = new Inputs(settings.slots,() => page === 'game' && phase !== 'results',i=>online && page==='game' ? i===0 : isHuman(i))
inputs.onWake = () => audio.wake()
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
    roster.every(({slot})=>!isHuman(slot) || settings.slots[slot].device || !keyboardClashes(settings.slots,slot,isHuman).length)
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
  app.classList.toggle('reduced',settings.reduced)
  const body = page === 'home' ? home(settings.profile) : page === 'lobby' ? lobby(settings,inputs,ready,mode,canStart(),lobbyIssue) :
    page === 'online' ? onlineMenu(onlineLobby,onlineSeat,onlineLink,onlineName,onlineNotice,onlineWaiting,onlineRetry) :
    page === 'settings' ? configuration(settings,returnPage) : page === 'controls' ?
      controls(settings,inputs,controlPlayer,controlType,status,returnPage) : page === 'diag' ?
      diagnosticsPage(diagnostic(inputs,settings),returnPage) : credits()
  app.innerHTML = header(page,settings.audio.mute)+body+footer
  if (page === 'home') paintHome()
}

function go(next: Page) {
  if (next === 'game') return
  if (online && next!=='online') {
    online.close()
    online = null; onlineLobby = null; onlineNames = null; onlineSeat = -1
    onlineLink = onlineNotice = ''; onlineWaiting = onlineRetry = false
    roomUrl('')
  }
  if (next === 'settings' || next === 'controls' || next === 'diag') {
    if (page === 'lobby') returnPage = 'lobby'
    else if (page === 'home' || page === 'credits') returnPage = 'home'
  }
  if (page === 'game') { audio.stopMusic(); match = null; arena = null; inputs.clear() }
  page = next
  inputs.capture = null
  inputs.pairing = null
  status = ''
  lobbyIssue = ''
  render()
}

function start(roster: readonly Participant[]) {
  audio.wake()
  const seed = settings.rules.seed.trim() ||
    Array.from(crypto.getRandomValues(new Uint32Array(2)),value => value.toString(36)).join('-')
  const rules = structuredClone(settings.rules)
  match = mode==='blitz' ? new BlitzMatch(rules,seed,roster,{...settings.blitz}) : new Match(rules,seed,roster)
  mountGame(match)
}

function mountGame(current: Match, initialCountdown: number = SETTINGS.countdown) {
  const {seed,roster} = current
  if (mode==='blitz') audio.startBlitzMusic()
  const format = mode==='blitz' ? 'BLITZ' : current.teams ? '2v2' : roster.length===PLAYERS ? 'VS4' : roster.map(()=>1).join('v')
  page = 'game'
  phase = initialCountdown ? 'countdown' : 'live'
  countdown = initialCountdown
  overlayState = ''
  finalFallen = []
  inputs.clear()
  app.innerHTML = `<header class="bar game-bar ${mode==='blitz'?'game-bar-blitz':''}"><div class="bar-inner">
    <button class="brand" ${online?'data-page="home" aria-label="Salir de la partida"':'data-do="pause" aria-label="Pausar partida"'}><span class="brand-icon">${icon('logo')}</span><span>TETRA<span>VOLT</span></span></button>
    <div class="game-info"><strong>${format}</strong><span>${modeName(mode)}</span>${mode==='blitz'?'':'<output id="elapsed">00:00</output>'}</div>
    <div class="game-buttons"><button class="icon-button audio-toggle" data-do="mute"></button>${online?`<span class="online-player">ONLINE · J${onlineSeat+1}</span><button class="secondary" data-page="home">Salir</button>`:`<button class="secondary" data-do="pause">${icon('pause')} Pausa</button>`}</div>
  </div></header><main class="game ${mode==='blitz'?'game-blitz':''}"><div id="arena"></div><div id="overlay" aria-live="polite"></div>
    <div class="match-footer"><span>${online?'Sala privada':`Semilla <b>${escape(seed)}</b>`}</span><span id="metrics"></span><span>${online?'Reglas competitivas':escape(settings.profile)} · ${modeName(mode)}</span></div></main>`
  arena = mountArena(document.querySelector<HTMLElement>('#arena')!,roster,current instanceof BlitzMatch)
  arena.draw(current,displaySlots())
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
  if (match instanceof BlitzMatch) audio.resumeMusic()
  inputs.clear()
  drawOverlay()
}

function drawOverlay() {
  if (!match) return
  const overlay = document.querySelector<HTMLElement>('#overlay')!
  const missing = online ? [] : disconnected(match.roster)
  const counter = Math.ceil(countdown/HZ)
  const key = [phase,phase==='countdown'?counter:'',missing.join(','),online && phase==='paused'?onlineNotice:'',onlineLobby?.host].join('|')
  if (key === overlayState) return
  overlayState = key
  if (phase === 'live') { overlay.innerHTML = ''; overlay.hidden = true; return }
  overlay.hidden = false
  if (phase === 'countdown') {
    overlay.className = 'countdown'
    overlay.innerHTML = `<div><span>PREPÁRATE</span><strong>${counter}</strong></div>`
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
      return `<li><b>${current}</b><span>${escape(slots[slot].name)}${type.length ? `<small>${type.join(' · ')}</small>` : ''}</span><span>${lines}</span><span>${sent}</span><span>${received}</span><span>${cancelled}</span><span>${pieces}</span></li>`
    })
  }).join('')
  overlay.innerHTML = `<section class="result-card"><div class="overline"><i></i> RESULTADOS · ${modeName(mode)} <time>${formatTime(currentMatch.now)}</time></div><h2>${title}</h2>
    <div class="result-mvp"><div><small>${mvps.length>1?'MVP COMPARTIDO':'MVP'}</small><strong>${mvpNames}</strong></div>
      <span><b>${bestSent}</b> líneas enviadas</span></div>
    <div class="result-columns"><span>#</span><span>Jugador</span><span title="Líneas limpiadas">Limp.</span><span title="Líneas enviadas">Env.</span><span title="Líneas recibidas">Rec.</span><span title="Líneas canceladas">Canc.</span><span title="Piezas colocadas">Piezas</span></div>
    <ol class="ranking">${rows}</ol><div class="modal-actions">${online ? `${onlineLobby?.host===onlineSeat?'<button class="primary" data-online="lobby">Volver todos a la sala</button>':''}<button class="secondary" data-page="home">Salir</button>` : `<button class="primary" data-do="rematch" ${missing.length?'disabled':''}>Revancha</button><button class="secondary" data-page="lobby">Volver a la sala</button>`}</div></section>`
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
      onlineSeat = message.slot
      onlineNotice = ''
      onlineWaiting = onlineRetry = false
      onlineLink = roomUrl(online!.code)
      break
    case 'lobby':
      onlineLobby = message.lobby
      if (message.lobby.phase==='lobby') {
        audio.stopMusic()
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
        phase = message.lobby.phase==='countdown' ? 'countdown' : 'live'
        audio.resumeMusic()
      }
      break
    case 'start':
      mode = 'blitz'
      onlineNames = message.names
      if (match instanceof OnlineMatch && match.seed===message.seed) {
        countdown = message.countdown
      } else {
        match = new OnlineMatch(message)
        mountGame(match,message.countdown)
      }
      break
    case 'countdown':
      countdown = message.left
      break
    case 'frame':
      if (!(match instanceof OnlineMatch) || phase==='results') return
      match.load(message.state)
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

app.addEventListener('click',event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button || button.disabled) return
  if (online && button.dataset.online) {
    switch (button.dataset.online) {
      case 'start': online.send({type:'start'}); break
      case 'lobby': online.send({type:'lobby'}); break
      case 'ready': online.send({type:'ready',value:!onlineLobby?.seats[onlineSeat]?.ready}); break
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
  if (next) {
    if (button.dataset.mode==='teams' || button.dataset.mode==='versus' || button.dataset.mode==='blitz') mode = button.dataset.mode
    go(next as Page)
    return
  }
  if (index !== undefined) {
    const i = Number(index)
    lobbyIssue = !ready[i] && isHuman(i) && !settings.slots[i].device ? keyboardIssue(i) : ''
    if (!lobbyIssue) ready[i] = !ready[i]
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
  if (action === 'pair') {
    const i = controlPlayer
    inputs.capture = null
    status = 'Esperando un botón del mando para J'+(i+1)+'.'
    inputs.pairing = {baseline:pressedButtons(inputs.devices),accept(device) {
      const owner = inputs.assigned.findIndex(pad => pad?.index === device.index)
      if (owner >= 0 && owner !== i) {
        status = 'Ese mando ya pertenece a J'+(owner+1)+'. Pulsa un botón de otro mando.'
        render()
        return false
      }
      releaseBotReservation(device)
      settings.slots[i].device = {index:device.index,id:device.id}
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
    settings.slots[controlPlayer].device = null
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
    store()
  }
  if (el.dataset.volume) {
    const key = el.dataset.volume as Exclude<keyof Mix,'mute'>
    settings.audio[key] = Number(el.value)
    audio.update(); store()
  }
})
app.addEventListener('change',event => {
  const el = event.target as HTMLInputElement | HTMLSelectElement
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
    ready[i] = bot
    inputs.poll()
    store(); render()
    app.querySelector<HTMLSelectElement>(`[data-controller="${i}"]`)?.focus()
  }
  if (level!==undefined) {
    settings.controllers[Number(level)].level = botLevel(Number(el.value))
    store()
  }
  if (el.id === 'profile') {
    settings.profile = el.value as Profile
    if (settings.profile !== 'Personalizado') settings.rules = freshRules(settings.profile)
    store(); render()
  }
  if (device !== undefined && el.value !== 'missing') {
    const i = Number(device)
    const pad = inputs.devices.find(p => p.index === Number(el.value) && el.value !== '')
    lobbyIssue = !pad ? keyboardIssue(i) : ''
    if (lobbyIssue) { render(); return }
    if (pad) {
      releaseBotReservation(pad)
      if (settings.slots[i].device?.id !== pad.id) settings.slots[i].pad = automaticPadMap(pad)
    }
    settings.slots[i].device = pad ? {index:pad.index,id:pad.id} : null
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

function playEvent(activeMatch: Match, i: number, event: Match['players'][number]['events'][number]) {
  const activeArena = arena
  const player = activeMatch.players[i]
  activeArena?.note(i,event.type,event.detail,activeMatch.now)
  if (activeArena && event.type==='incoming' && event.source!==undefined) {
    activeArena.attack(event.source,i,() => {
      if (match!==activeMatch || arena!==activeArena || player.dead) return
      activeArena.note(i,'impact',undefined,activeMatch.now)
      audio.play(event,activeMatch.roster[i].slot)
    })
  } else if (!(activeMatch instanceof BlitzMatch && event.type==='eliminated')) audio.play(event,activeMatch.roster[i].slot)
}

function frame(now: number) {
  accumulator += Math.min(Math.max(0,now-previous),frameStep*SETTINGS.catchupTicks)
  previous = now
  frames++
  inputs.poll()
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
      if (--countdown <= 0) phase = 'live'
      continue
    }
    const alive = match.players.map(p=>!p.dead)
    match.tick(sample)
    steps++
    match.players.forEach((p,i) => {
      if (p.zone.active && p.zone.remaining % (HZ*2) === 0 && p.zone.remaining !== p.zone.duration) p.event('zoneLoop')
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
