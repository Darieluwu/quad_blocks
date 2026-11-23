import { GENERATORS, TARGETS, type Rules } from './engine/rules'
import { ACTIONS, type Action } from './engine/player'
import { actionNames, label, padBindings, standardPadLabel, type Inputs } from './input'
import { ATTACK_LABELS, BLITZ_NUMBERS, MIX, NUMBER_RULES, type Settings } from './settings'
import { COLORS, heroArt } from './render'
import { BOT_LEVELS } from './engine/bot'
import { lobbyEditors, lobbyFighter, lobbyLineup, seatEditor } from './lobby-view'
import { artwork } from './characters/assets'
import { CHARACTERS } from './characters/catalog'

export type Mode = 'versus'|'teams'|'blitz'
export const teamName = (team: number) => team===0 ? 'Equipo A' : 'Equipo B'
export const modeName = (mode: Mode) => mode==='blitz' ? '2v2 Blitz' : mode==='teams' ? 'Equipos 2v2' : 'Versus SURGE'
export const targetName = {manual:'Manual',random:'Aleatorio',counter:'Defensa'}
const targetOptions = (value: Rules['target']) =>
  TARGETS.map(t=>`<option value="${t}" ${selected(t,value)}>${targetName[t]}</option>`).join('')

export const escape = (value: string) => value.replace(/[&<>"']/g,char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const checked = (value: boolean) => value ? 'checked' : ''
const selected = (a: unknown,b: unknown) => a === b ? 'selected' : ''
const paths: Record<string,string> = {
  play:'<path d="m8 5 12 7-12 7z"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  controls:'<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M7 12h4m-2-2v4m6-2h1m2-2h1"/>',
  diag:'<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  credits:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  audio:'<path d="M4 10h4l5-4v12l-5-4H4zM16 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  mute:'<path d="M4 10h4l5-4v12l-5-4H4zm12 0 5 5m0-5-5 5"/>',
  pause:'<path d="M9 5v14m6-14v14"/>',
  logo:'<path fill="currentColor" stroke="none" d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z"/>',
}
export const icon = (name: string) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`

export function header(page: string, mute: boolean) {
  const items = [['play','Jugar','home'],['settings','Configuración','settings'],['controls','Controles','controls'],
    ['diag','Diagnóstico','diag'],['credits','Créditos','credits']]
  return `<header class="bar"><div class="bar-inner">
    <button class="brand" data-page="home" aria-label="Inicio"><span class="brand-icon">${icon('logo')}</span><span>TETRA<span>VOLT</span></span></button>
    <nav aria-label="Menú principal">${items.map(([symbol,text,id]) => `<button data-page="${id}" class="${id===page || (id==='home' && page==='lobby')?'current':''}">${icon(symbol)}<span>${text}</span></button>`).join('')}</nav>
    <button class="icon-button audio-toggle" data-do="mute" title="${mute?'Activar audio':'Silenciar audio'}" aria-label="${mute?'Activar audio':'Silenciar audio'}">${icon(mute?'mute':'audio')}</button>
  </div></header>`
}
export const footer = `<footer class="footer"><span><i></i> LOCAL Y ONLINE</span><span>TETRAVOLT</span></footer>`

export function home(profile: string) {
  const volt = artwork(CHARACTERS.volt.assets.master)
  const pix = artwork(CHARACTERS.pix.assets.master)
  return `<main class="arcade-main home-menu" data-arcade-menu>
    <div class="arcade-atmosphere" aria-hidden="true"><span class="energy-ring ring-a"></span><span class="energy-ring ring-b"></span>
      <span class="block block-a"></span><span class="block block-b"></span><span class="block block-c"></span><span class="block block-d"></span></div>
    <section class="arcade-character volt-character" aria-hidden="true">${volt?`<img src="${volt}" alt="">`:''}</section>
    <section class="arcade-character pix-character" aria-hidden="true">${pix?`<img src="${pix}" alt="">`:''}</section>
    <section class="arcade-menu-copy">
      <div class="arcade-brand" aria-label="TETRAVOLT"><span>TETRA</span><strong>VOLT</strong><i></i></div>
      <nav class="arcade-options" aria-label="Menú principal">
        <button class="arcade-option is-selected" data-main-action="play" data-arcade-index="0"><span class="option-no">01</span><span class="option-label">JUGAR</span><span class="option-glyph">${icon('play')}</span></button>
        <button class="arcade-option" data-main-action="online" data-arcade-index="1"><span class="option-no">02</span><span class="option-label">MULTIJUGADOR</span><small>ONLINE</small><span class="option-glyph">${icon('controls')}</span></button>
        <button class="arcade-option" data-main-action="settings" data-arcade-index="2"><span class="option-no">03</span><span class="option-label">CONFIGURACIÓN</span><span class="option-glyph">${icon('settings')}</span></button>
        <button class="arcade-option" data-main-action="controls" data-arcade-index="3"><span class="option-no">04</span><span class="option-label">CONTROLES</span><span class="option-glyph">${icon('controls')}</span></button>
        <button class="arcade-option" data-main-action="credits" data-arcade-index="4"><span class="option-no">05</span><span class="option-label">CRÉDITOS</span><span class="option-glyph">${icon('credits')}</span></button>
      </nav>
      <div class="arcade-profile"><span>PERFIL</span><strong>${escape(profile)}</strong></div>
    </section>
    <aside class="arcade-status"><span>ONLINE</span><i></i><b>4P</b></aside>
  </main>`
}

export function modeSelect(selected: Mode = 'versus') {
  const modes: {id:Mode;no:string;name:string;players:string;copy:string;poster:string}[] = [
    {id:'versus',no:'01',name:'VERSUS SURGE',players:'2-4 JUGADORES',copy:'Todos contra todos. Cada plaza carga SURGE y ataca al rival.',poster:artwork('vs4') ?? ''},
    {id:'teams',no:'02',name:'EQUIPOS 2V2',players:'4 JUGADORES',copy:'Dos equipos. Coordinación, objetivos compartidos y presión competitiva.',poster:artwork('2v2') ?? ''},
    {id:'blitz',no:'03',name:'2V2 BLITZ',players:'2-4 JUGADORES',copy:'Relevos activos, defensa de equipo y rescates bajo presión.',poster:artwork('2v2blitz') ?? ''},
  ]
  const active=modes.find(mode=>mode.id===selected) ?? modes[0]
  return `<main class="arcade-main mode-menu" data-arcade-modes>
    <header class="mode-menu-header"><button class="arcade-back" data-mode-back>${icon('back')} VOLVER</button><div><span>SELECCIÓN DE MODO</span><strong>TETRAVOLT</strong></div></header>
    <section class="mode-arena" aria-label="Modos de juego" data-selected="${selected}">
      ${modes.map(mode=>`<button class="arcade-mode ${mode.id===selected?'is-selected':''}" data-mode="${mode.id}" data-mode-index="${modes.indexOf(mode)}" aria-pressed="${mode.id===selected}">
        <span class="mode-no">${mode.no}</span>
        <span class="mode-cover" aria-label="${escape(mode.name)}">${mode.poster?`<img src="${mode.poster}" alt="${escape(mode.name)}" draggable="false">`:'<span class="mode-cover-fallback"></span>'}</span>
      </button>`).join('')}
    </section>
    <footer class="mode-menu-footer">
      <span class="mode-nav-label"><kbd>←</kbd><kbd>→</kbd> CAMBIAR</span>
      <div class="mode-selection-info" aria-live="polite"><small>${active.players}</small><strong>${active.name}</strong><p>${active.copy}</p></div>
      <button class="arcade-confirm" data-mode-confirm>${icon('play')} CONFIRMAR</button>
      <span class="mode-back-label"><kbd>ESC</kbd> VOLVER</span>
    </footer>
  </main>`
}

const intro = (title: string, description: string, back: string) =>
  `<button class="back" data-page="${back}">${icon('back')} Volver</button><h1>${title}</h1><p class="desc">${description}</p>`

export function lobby(settings: Settings, inputs: Inputs, ready: boolean[], mode: Mode, canStart: boolean, issue: string) {
  const teams = mode!=='versus'
  const description = mode==='blitz' ? 'Confirma las cuatro plazas. J1 y J2 se turnan por el Equipo A. J3 y J4 se turnan por el Equipo B.' :
    teams ? 'Confirma las cuatro plazas. J1 y J2 forman el Equipo A. J3 y J4 forman el Equipo B.' :
    'Marca entre dos y cuatro plazas como listas. Cada plaza puede ser una persona o una IA.'
  const editors:string[] = []
  const fighters = settings.slots.map((slot,i) => {
    const assigned = inputs.assigned[i]
    const controller = settings.controllers[i]
    const deviceOptions = inputs.devices.filter(pad => !inputs.assigned.some((other,j) => j!==i && other?.index===pad.index))
    const current = assigned?.index ?? slot.device?.index
    editors.push(seatEditor(i,`<label>Nombre<input data-name="${i}" value="${escape(slot.name)}" maxlength="20"></label>
      <label>Participante<select data-controller="${i}"><option value="human" ${selected(false,controller.bot)}>Persona</option><option value="bot" ${selected(true,controller.bot)}>IA</option></select></label>
      ${controller.bot ? `<label>Dificultad<select data-level="${i}">${BOT_LEVELS.map((name,j)=>`<option value="${j+1}" ${selected(j+1,controller.level)}>${j+1} · ${name}</option>`).join('')}</select></label>` :
      `<label>Dispositivo<select data-device="${i}"><option value="">Teclado</option>
      ${slot.device && !assigned ? `<option value="missing" selected>${escape(slot.device.id)} · desconectado</option>` : ''}
      ${deviceOptions.map(pad => `<option value="${pad.index}" ${selected(pad.index,current)}>${escape(pad.id)} [${pad.index}]</option>`).join('')}</select></label>
      ${assigned && assigned.mapping !== 'standard' ? '<p class="hint">Perfil genérico. Puedes comprobarlo y ajustarlo en Controles.</p>' : ''}`}
      `,true))
    const missing = !controller.bot && !!slot.device && !assigned
    const details = controller.bot ? `IA · <span data-lobby-level="${i}">${controller.level} · ${BOT_LEVELS[controller.level-1]}</span>` :
      'Persona · '+escape(assigned?.id ?? slot.device?.id ?? 'Teclado')
    return lobbyFighter({slot:i,id:settings.characters[i],name:escape(slot.name),details,
      state:missing?'SIN MANDO':ready[i]?'LISTO':'POR CONFIRMAR',ready:ready[i],editable:true,settings:true,
      readyAction:`<button class="secondary ready ${ready[i]?'is-ready':''}" data-ready="${i}" aria-pressed="${ready[i]}" ${!controller.bot&&slot.device&&!assigned?'disabled':''}>${ready[i]?'Quitar listo':'Marcar listo'}</button>`})
  })
  return `<main class="panel match-lobby">${intro('Sala '+modeName(mode),description,'home')}
  ${lobbyLineup(fighters,teams,ready.every(Boolean))}
  <div class="panel-actions"><button class="secondary" data-page="settings">${icon('settings')} Reglas de partida</button><button class="secondary" data-page="controls">${icon('controls')} Controles</button>
  ${mode==='blitz' ? '' : `<label class="lobby-target">Objetivos<select data-rule="target">${targetOptions(settings.rules.target)}</select></label>`}
  <span class="lobby-count" role="status">${ready.filter(Boolean).length} de 4 plazas listas</span>
  <button class="primary" data-do="start" ${canStart?'':'disabled'}>${icon('play')} Iniciar partida</button></div>
  ${lobbyEditors(editors)}
  <p class="hint">Izquierda y derecha para elegir, giro horario para confirmar y giro antihorario para volver. Usa los controles de tu plaza.</p>
  ${issue ? `<p class="lobby-issue" role="alert">${escape(issue)}</p>` : ''}
  ${mode==='blitz' ? blitzSettings(settings) : ''}</main>`
}
function blitzSettings(settings: Settings) {
  return `<details class="settings-card attack-settings blitz-settings"><summary>Reglas de Blitz</summary>
    <div class="form-grid">${Object.entries(BLITZ_NUMBERS).map(([key,[label,min,max]])=>
      `<label>${label}<input type="number" min="${min}" max="${max}" step="1" data-blitz="${key}" value="${settings.blitz[key as keyof typeof BLITZ_NUMBERS]}"></label>`).join('')}
      <label class="check"><input type="checkbox" data-blitz="zone" ${checked(settings.blitz.zone)}> SURGE en Blitz</label>
      <label class="check"><input type="checkbox" data-blitz="effects" ${checked(settings.blitz.effects)}> Efectos de rotación</label>
    </div></details>`
}
const genName = {bag7:'7-Bag',random:'Random',history:'History Randomizer',bag14:'14-Bag'}
const volumeNames = {master:'Maestro',move:'Movimientos',play:'Jugadas',attack:'Ataques',alert:'Alertas',zone:'SURGE',effects:'Efectos',music:'Música (Blitz)'}
export function configuration(settings: Settings, back: string) {
  const rules = settings.rules
  const numbered = (group: (keyof typeof NUMBER_RULES)[]) => group.map(key => {
    const [name,min,max,step] = NUMBER_RULES[key]
    return `<label>${name}<input type="number" data-rule="${key}" min="${min}" max="${max}" step="${step}" value="${rules[key]}"></label>`
  }).join('')
  const check = (key: keyof Rules, text: string) => `<label class="check"><input type="checkbox" data-rule="${key}" ${checked(!!rules[key])}>${text}</label>`
  return `<main class="panel">${intro('Configuración','Ajusta las reglas de partida, la respuesta de los controles y el audio.',back)}
    <div class="config-grid">
      <section class="settings-card"><h2>Partida</h2><div class="form-grid">
        <label>Perfil<select id="profile">${['Competitivo','Casual','Personalizado'].map(p=>`<option ${selected(p,settings.profile)}>${p}</option>`).join('')}</select></label>
        <label>Generador<select data-rule="generator">${GENERATORS.map(g=>`<option value="${g}" ${selected(g,rules.generator)}>${genName[g]}</option>`).join('')}</select></label>
        <label>Objetivos<select data-rule="target">${targetOptions(rules.target)}</select></label>
        <label>Semilla<input data-rule="seed" maxlength="64" placeholder="Aleatoria" value="${escape(rules.seed)}"></label>
        ${numbered(['gravity','progression','garbageDelay','garbageCap'])}
        ${check('shared','Secuencia compartida')}${check('floorKicks','Permitir Floor Kicks')}
      </div></section>
      <section class="settings-card"><h2>Precisión</h2><div class="form-grid">${numbered(['das','arr','soft','lock','resets','buffer'])}</div>
      <p class="hint">ARR 0 mueve hasta el obstáculo después de DAS.</p></section>
      <section class="settings-card"><h2>SURGE y bonificaciones</h2><div class="form-grid">
        ${check('zone','Activar SURGE')}${check('extraSpins','Bonificar Spins adicionales')}${numbered(['zoneSeconds','zoneQuarterLines','zoneMinimum'])}</div></section>
      <section class="settings-card"><h2>Audio y pantalla</h2>
        ${Object.keys(MIX).map(raw=>{const k=raw as keyof typeof MIX;return `<label class="volume">${volumeNames[k]}<input type="range" min="0" max="1" step="0.01" data-volume="${k}" value="${settings.audio[k]}"></label>`}).join('')}
        <div class="form-grid">
          <label class="check"><input type="checkbox" data-view="mute" ${checked(settings.audio.mute)}> Silenciar</label>
          <label class="check"><input type="checkbox" data-view="reduced" ${checked(settings.reduced)}> Reducir efectos</label>
          <label class="check"><input type="checkbox" data-character-option="attackAnimations" ${checked(settings.characterOptions.attackAnimations)}> Animaciones de ataques</label>
          <label class="check"><input type="checkbox" data-character-option="attackVoices" ${checked(settings.characterOptions.attackVoices)}> Voces de ataques</label>
          <label class="check"><input type="checkbox" data-character-option="subtitles" ${checked(settings.characterOptions.subtitles)}> Subtítulos de personajes</label>
          <label class="check"><input type="checkbox" data-view="metrics" ${checked(settings.metrics)}> Métricas</label>
        </div></section>
      <details class="settings-card attack-settings"><summary>Tabla de ataques</summary><div class="form-grid">
      ${Object.entries(ATTACK_LABELS).map(([key,name])=>`<label>${name}<input type="number" data-attack="${key}" min="${key==='comboStep'?1:0}" max="100" step="1" value="${rules.attack[key as keyof Rules['attack']] }"></label>`).join('')}</div></details>
    </div></main>`
}

export function controls(settings: Settings, inputs: Inputs, i: number, type:'keys'|'pad', status: string, back: string) {
  const slot = settings.slots[i]
  const pad = inputs.assigned[i]
  const bot = settings.controllers[i].bot
  const buttonLabel = (action: Action) => type === 'pad' && pad?.mapping === 'standard' ? standardPadLabel(slot.pad[action]) : label(slot[type][action])
  return `<main class="panel">${intro('Controles','Elige un jugador y selecciona una acción para cambiar su asignación.',back)}
    <div class="control-tabs">${settings.slots.map((s,j)=>`<button class="secondary ${i===j?'chosen':''}" data-control-player="${j}" style="--player:${COLORS[j]}">J${j+1} · ${escape(s.name)}</button>`).join('')}</div>
    <section class="settings-card pairing"><div><h2>Asignación rápida de mando</h2>
    <p>${bot ? 'Plaza de IA' : pad ? escape(pad.id) : slot.device ? escape(slot.device.id)+' · desconectado' : 'Dispositivo actual: teclado'}</p>
    <p class="hint">${bot ? 'Elige Persona en la sala para activar los controles de esta plaza.' : `Pulsa un botón del mando que quieras usar. Se aplicará su perfil de controles a J${i+1}.`}</p></div>
    <div class="pair-actions">${inputs.pairing ? '<button class="secondary" data-do="cancel">Cancelar asignación</button>' :
      '<button class="primary" data-do="pair" '+(bot?'disabled':'')+'>Asignar pulsando un botón</button>'}
      ${slot.device && !inputs.pairing && !bot ? '<button class="secondary" data-do="keyboard">Usar teclado</button>' : ''}</div></section>
    <div class="control-toolbar"><div class="segmented"><button data-control-type="keys" class="${type==='keys'?'chosen':''}">Teclado</button><button data-control-type="pad" class="${type==='pad'?'chosen':''}">Mando</button></div>
    <button class="secondary" data-do="reset">Restaurar predeterminados</button></div>
    ${type==='pad'&&!pad ? '<p class="hint">Asigna un mando para capturar botones o ejes.</p>' : ''}
    <p id="status" role="status">${escape(status)}</p>
    <div class="bindings">${ACTIONS.map(action=>`<div><span>${actionNames[action]}</span><button class="binding" data-action="${action}" ${type==='pad'&&!pad?'disabled':''}>${escape(buttonLabel(action))}</button></div>`).join('')}</div>
    ${inputs.capture ? '<button class="secondary" data-do="cancel">Cancelar captura</button>' : ''}
  </main>`
}
export function diagnostic(inputs: Inputs, settings: Settings) {
  const cards = inputs.devices.map(pad => {
    const who = inputs.assigned.findIndex(other => other?.index === pad.index)
    return `<section class="settings-card"><h2>${escape(pad.id)}</h2><dl><dt>Estado</dt><dd>Conectado</dd><dt>Índice</dt><dd>${pad.index}</dd><dt>Distribución</dt><dd>${escape(pad.mapping || 'Personalizada')}</dd><dt>Jugador</dt><dd>${who<0?'Sin asignar':'J'+(who+1)}</dd><dt>Botones y ejes activos</dt><dd>${padBindings(pad).map(label).join(' · ') || '—'}</dd><dt>Botones</dt><dd>${pad.buttons.map((button,i)=>`B${i}: ${button.value.toFixed(2)}`).join(' · ')}</dd><dt>Ejes</dt><dd>${pad.axes.map((axis,i)=>`A${i}: ${axis.toFixed(2)}`).join(' · ') || '—'}</dd></dl></section>`
  })
  settings.slots.forEach((slot,i) => {
    if (slot.device && inputs.missing.includes(i)) cards.push(`<section class="settings-card"><h2>${escape(slot.device.id)}</h2><dl><dt>Estado</dt><dd>Desconectado</dd><dt>Último índice</dt><dd>${slot.device.index}</dd><dt>Jugador</dt><dd>J${i+1}</dd></dl></section>`)
  })
  return cards.join('') || '<p class="hint">No hay mandos visibles. Conecta un mando y pulsa uno de sus botones para que el navegador lo detecte.</p>'
}
export const diagnosticsPage = (inner: string, back: string) => `<main class="panel">${intro('Diagnóstico de mandos','Consulta en directo el estado de los dispositivos, sus botones y sus ejes.',back)}<div id="device-list" class="config-grid">${inner}</div></main>`
export const credits = () => `<main class="panel">${intro('Créditos','TETRAVOLT · Arena competitiva','home')}<section class="settings-card"><h2>TETRAVOLT</h2><p>Diseño, implementación, gráficos de Canvas y síntesis sonora originales para este proyecto.</p><p>Motor en TypeScript, renderizado en HTML5 Canvas y audio sintetizado con Web Audio API.</p></section></main>`
