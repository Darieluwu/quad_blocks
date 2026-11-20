import './style.css'
import { Match } from './engine/match'
import { HZ, SETTINGS } from './engine/rules'
import { ACTIONS, type Action } from './engine/player'
import { Inputs, automaticPadMap, conflict, defaultMap, label, padBindings, pressedButtons } from './input'
import { Sound } from './audio'
import { mountArena } from './render'
import { ATTACK_LABELS, NUMBER_RULES, freshRules, loadSettings, saveSettings, type Mix, type Profile } from './settings'
import { configuration, controls, credits, diagnostic, diagnosticsPage, escape, footer, header, home, icon, lobby, paintHome } from './menu'

type Page = 'home'|'lobby'|'settings'|'controls'|'diag'|'credits'|'game'
const app = document.querySelector<HTMLElement>('#app')!
const settings = loadSettings()
const ready = settings.slots.map(() => false)
let page: Page = 'home'
let returnPage: 'home'|'lobby' = 'home'
let controlPlayer = 0
let controlType: 'keys'|'pad' = 'keys'
let status = ''
let match: Match | null = null
let arena: ReturnType<typeof mountArena> | null = null
let phase: 'countdown'|'live'|'paused'|'results' = 'countdown'
let countdown: number = SETTINGS.countdown
let resumePhase: 'live'|'countdown' = 'countdown'
let pauseReason = ''
let overlayState = ''
const audio = new Sound(settings.audio)
const inputs = new Inputs(settings.slots,() => page === 'game' && phase !== 'results')
inputs.onWake = () => audio.wake()
inputs.onBlur = () => { if (page === 'game') pause('La ventana perdió el foco.') }
document.addEventListener('pointerdown', () => audio.wake())
document.addEventListener('keydown', () => audio.wake())
document.addEventListener('visibilitychange', () => {
  if (document.hidden && page === 'game') pause('La ventana perdió el foco.')
})

const store = () => { saveSettings(settings) }
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
  const body = page === 'home' ? home(settings.profile) : page === 'lobby' ? lobby(settings,inputs,ready) :
    page === 'settings' ? configuration(settings,returnPage) : page === 'controls' ?
      controls(settings,inputs,controlPlayer,controlType,status,returnPage) : page === 'diag' ?
      diagnosticsPage(diagnostic(inputs,settings),returnPage) : credits()
  app.innerHTML = header(page,settings.audio.mute)+body+footer
  if (page === 'home') paintHome()
}

function go(next: Page) {
  if (next === 'game') return
  if (next === 'settings' || next === 'controls' || next === 'diag') {
    if (page === 'lobby') returnPage = 'lobby'
    else if (page === 'home' || page === 'credits') returnPage = 'home'
  }
  if (page === 'game') { match = null; arena = null; inputs.clear() }
  page = next
  inputs.capture = null
  inputs.pairing = null
  status = ''
  render()
}

function start() {
  audio.wake()
  const seed = settings.rules.seed.trim() ||
    Array.from(crypto.getRandomValues(new Uint32Array(2)),value => value.toString(36)).join('-')
  match = new Match(structuredClone(settings.rules),seed)
  page = 'game'
  phase = 'countdown'
  countdown = SETTINGS.countdown
  overlayState = ''
  inputs.clear()
  app.innerHTML = `<header class="bar game-bar"><div class="bar-inner">
    <button class="brand" data-do="pause" aria-label="Pausar partida"><span class="brand-icon">${icon('logo')}</span><span>QUAD<span>BLOCKS</span></span></button>
    <div class="game-info"><strong>VS4</strong><span>TODOS CONTRA TODOS</span><output id="elapsed">00:00</output></div>
    <div class="game-buttons"><button class="icon-button audio-toggle" data-do="mute"></button><button class="secondary" data-do="pause">${icon('pause')} Pausa</button></div>
  </div></header><main class="game"><div id="arena"></div><div id="overlay" aria-live="polite"></div>
    <div class="match-footer"><span>Semilla <b>${escape(seed)}</b></span><span id="metrics"></span><span>${escape(settings.profile)} · VS4</span></div></main>`
  arena = mountArena(document.querySelector<HTMLElement>('#arena')!)
  arena.draw(match,settings.slots)
  muteButton()
  drawOverlay()
}

function pause(reason = '') {
  if (phase !== 'live' && phase !== 'countdown') return
  resumePhase = phase
  phase = 'paused'
  pauseReason = reason
  inputs.clear()
  drawOverlay()
}
function resume() {
  if (phase !== 'paused' || inputs.missing.length) return
  phase = resumePhase
  inputs.clear()
  drawOverlay()
}

function drawOverlay() {
  if (!match) return
  const overlay = document.querySelector<HTMLElement>('#overlay')!
  const missing = inputs.missing
  const counter = Math.ceil(countdown/HZ)
  const key = [phase,phase==='countdown'?counter:'',missing.join(',')].join('|')
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
    overlay.innerHTML = `<section class="modal"><div class="overline"><i></i> VS4</div><h2>Partida en pausa</h2>
      <p>${missing.length ? 'Mando desconectado · '+missing.map(i=>escape(settings.slots[i].name)).join(', ')+'. Reconecta para continuar.' : escape(pauseReason || 'Los cuatro tableros están en pausa.')}</p>
      <div class="modal-actions"><button class="primary" data-do="resume" ${missing.length?'disabled':''}>Continuar</button><button class="secondary" data-do="rematch" ${missing.length?'disabled':''}>Reiniciar</button><button class="secondary" data-page="lobby">Volver a la sala</button></div></section>`
    return
  }
  const winner = match.winner
  let rank = 1
  const rows = match.ranking().flatMap(group => {
    const current = rank
    rank += group.length
    return group.map(i => `<li><b>${current}</b><span>${escape(settings.slots[i].name)}</span><span>${match!.players[i].stats.lines} L · ${match!.players[i].stats.sent} enviadas</span></li>`)
  }).join('')
  overlay.innerHTML = `<section class="modal"><div class="overline"><i></i> RESULTADOS VS4</div><h2>${winner===null?'Empate':escape(settings.slots[winner].name)+' gana'}</h2>
    <ol class="ranking">${rows}</ol><div class="modal-actions"><button class="primary" data-do="rematch" ${missing.length?'disabled':''}>Revancha</button><button class="secondary" data-page="lobby">Volver a la sala</button></div></section>`
}

app.addEventListener('click',event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button || button.disabled) return
  const {page:next,do:action,ready:index,controlPlayer:player,controlType:type,action:bind} = button.dataset
  if (next) { go(next as Page); return }
  if (index !== undefined) { ready[Number(index)] = !ready[Number(index)]; render(); return }
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
      const duplicate = conflict(settings.slots,i,mode,binding,value)
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
  if (action === 'start' && ready.every(Boolean) && !inputs.missing.length) start()
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
      const clash = conflict(copy,controlPlayer,controlType,a,defaults[a])
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
  if (action === 'rematch' && !inputs.missing.length) start()
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
  const {device,rule,view,attack} = el.dataset
  if (el.id === 'profile') {
    settings.profile = el.value as Profile
    if (settings.profile !== 'Personalizado') settings.rules = freshRules(settings.profile)
    store(); render()
  }
  if (device !== undefined && el.value !== 'missing') {
    const i = Number(device)
    const pad = inputs.devices.find(p => p.index === Number(el.value) && el.value !== '')
    if (pad && settings.slots[i].device?.id !== pad.id) settings.slots[i].pad = automaticPadMap(pad)
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
    app.querySelector<HTMLSelectElement>('#profile')!.value = settings.profile
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
function frame(now: number) {
  accumulator += Math.min(Math.max(0,now-previous),frameStep*SETTINGS.catchupTicks)
  previous = now
  frames++
  inputs.poll()
  if (page === 'game' && inputs.missing.length) pause()
  while (accumulator >= frameStep) {
    accumulator -= frameStep
    const sample = inputs.consume()
    if (!match || page !== 'game' || phase === 'results') continue
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
    match.tick(sample)
    steps++
    match.players.forEach((p,i) => {
      if (p.zone.active && p.zone.remaining % (HZ*2) === 0 && p.zone.remaining !== p.zone.duration) p.event('zoneLoop')
      for (const event of p.events) {
        arena?.note(i,event.type,event.detail,match!.now)
        audio.play(event,i)
      }
      p.events.length = 0
    })
    if (match.finished) phase = 'results'
  }
  if (match && page === 'game') {
    arena?.draw(match,settings.slots)
    drawOverlay()
    const seconds = Math.floor(match.now/HZ)
    const time = String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')
    if (time !== clockText || document.querySelector('#elapsed')!.textContent !== time) {
      document.querySelector('#elapsed')!.textContent = clockText = time
    }
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
        if (page === 'lobby') for (const i of inputs.missing) ready[i] = false
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
