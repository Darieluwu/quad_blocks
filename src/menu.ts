import { GENERATORS, TARGETS, type Rules } from './engine/rules'
import { ACTIONS, type Action } from './engine/player'
import { actionNames, label, padBindings, standardPadLabel, type Inputs } from './input'
import { ATTACK_LABELS, MIX, NUMBER_RULES, type Settings } from './settings'
import { COLORS, heroArt } from './render'

export const escape = (value: string) => value.replace(/[&<>"']/g,char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const checked = (value: boolean) => value ? 'checked' : ''
const selected = (a: unknown,b: unknown) => a === b ? 'selected' : ''
const paths: Record<string,string> = {
  play:'<path d="m8 5 12 7-12 7z"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  controls:'<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M7 12h4m-2-2v4m6-2h1m2-2h1"/>',
  diag:'<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  credits:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  back:'<path d="m14 6-6 6 6 6"/>',lock:'<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
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
    <button class="brand" data-page="home" aria-label="Inicio"><span class="brand-icon">${icon('logo')}</span><span>QUAD<span>BLOCKS</span></span></button>
    <nav aria-label="Menú principal">${items.map(([symbol,text,id]) => `<button data-page="${id}" class="${id===page || (id==='home' && page==='lobby')?'current':''}">${icon(symbol)}<span>${text}</span></button>`).join('')}</nav>
    <button class="icon-button audio-toggle" data-do="mute" title="${mute?'Activar audio':'Silenciar audio'}" aria-label="${mute?'Activar audio':'Silenciar audio'}">${icon(mute?'mute':'audio')}</button>
  </div></header>`
}
export const footer = `<footer class="footer"><span><i></i> MODO LOCAL · OFFLINE</span><span>QUAD BLOCKS <b> / </b> V1.0</span></footer>`

export function home(profile: string) {
  return `<main class="home">
    <section class="hero">
      <div class="hero-copy">
        <div class="overline"><i></i> ARENA COMPETITIVA LOCAL</div>
        <h1>QUAD<br><span>BLOCKS</span><i>.</i></h1>
        <p>Cuatro jugadores, una pantalla. Encadena jugadas, ataca a tus rivales y activa Zone para dominar la arena.</p>
        <div class="hero-actions"><button class="primary" data-page="lobby">${icon('play')} Jugar VS4</button><button class="secondary" data-page="controls">${icon('controls')} Ver controles</button></div>
        <div class="hero-legend" aria-label="Cuatro jugadores locales">${COLORS.map((color,i) => `<span style="--player:${color}"><i></i> J${i+1}</span>`).join('')}</div>
      </div>
      <div class="hero-visual"><canvas id="hero-art" width="700" height="460" aria-hidden="true"></canvas></div>
    </section>
    <section class="modes" aria-label="Modos de juego">
      <div class="section-line"><h2>Modos de juego</h2><span>${escape(profile)}</span></div>
      <div class="mode-grid"><button class="mode mode-live" data-page="lobby"><span class="mode-icon">${icon('play')}</span><span><strong>VS4</strong><small>Todos contra todos</small></span><span class="available">DISPONIBLE</span></button>
      ${[['VS2','Duelo local'],['VS3','Triple amenaza'],['2v2','Equipos']].map(([name,description]) => `<button class="mode" disabled><span class="mode-icon">${icon('lock')}</span><span><strong>${name}</strong><small>${description}</small></span><span class="soon">PRÓXIMAMENTE</span></button>`).join('')}</div>
    </section></main>`
}
export const paintHome = () => heroArt(document.querySelector<HTMLCanvasElement>('#hero-art')!)

const intro = (title: string, description: string, back: string) =>
  `<button class="back" data-page="${back}">${icon('back')} Volver</button><h1>${title}</h1><p class="desc">${description}</p>`

export function lobby(settings: Settings, inputs: Inputs, ready: boolean[]) {
  return `<main class="panel">${intro('Sala VS4','Asigna los dispositivos y confirma que los cuatro jugadores estén listos.','home')}
  <div class="lobby-grid">${settings.slots.map((slot,i) => {
    const assigned = inputs.assigned[i]
    const deviceOptions = inputs.devices.filter(pad => !inputs.assigned.some((other,j) => j!==i && other?.index===pad.index))
    const current = assigned?.index ?? slot.device?.index
    return `<section class="slot" style="--player:${COLORS[i]}"><div class="slot-title"><span class="player-tag">J${i+1}</span><strong>Jugador ${i+1}</strong></div>
      <label>Nombre<input data-name="${i}" value="${escape(slot.name)}" maxlength="20"></label>
      <label>Dispositivo<select data-device="${i}"><option value="">Teclado</option>
      ${slot.device && !assigned ? `<option value="missing" selected>${escape(slot.device.id)} · desconectado</option>` : ''}
      ${deviceOptions.map(pad => `<option value="${pad.index}" ${selected(pad.index,current)}>${escape(pad.id)} [${pad.index}]</option>`).join('')}</select></label>
      ${assigned && assigned.mapping !== 'standard' ? '<p class="hint">Perfil genérico. Puedes comprobarlo y ajustarlo en Controles.</p>' : ''}
      <button class="secondary ready ${ready[i]?'is-ready':''}" data-ready="${i}" ${slot.device&&!assigned?'disabled':''}>${ready[i]?'Listo ✓':'Marcar listo'}</button></section>`
  }).join('')}</div>
  <div class="panel-actions"><button class="secondary" data-page="settings">${icon('settings')} Reglas de partida</button><button class="secondary" data-page="controls">${icon('controls')} Controles</button>
  <button class="primary" data-do="start" ${ready.every(Boolean)&&!inputs.missing.length?'':'disabled'}>${icon('play')} Iniciar partida</button></div></main>`
}
const genName = {bag7:'7-Bag',random:'Random',history:'History Randomizer',bag14:'14-Bag'}
const targetName = {manual:'Manual',random:'Aleatorio',counter:'Contraataque'}
const volumeNames = {master:'Maestro',move:'Movimientos',play:'Jugadas',attack:'Ataques',alert:'Alertas',zone:'Zone'}
export function configuration(settings: Settings, back: string) {
  const rules = settings.rules
  const numbered = (group: (keyof typeof NUMBER_RULES)[]) => group.map(key => {
    const [name,min,max,step] = NUMBER_RULES[key]
    return `<label>${name}<input type="number" data-rule="${key}" min="${min}" max="${max}" step="${step}" value="${rules[key]}"></label>`
  }).join('')
  const check = (key: keyof Rules, text: string) => `<label class="check"><input type="checkbox" data-rule="${key}" ${checked(!!rules[key])}>${text}</label>`
  return `<main class="panel">${intro('Configuración','Ajusta las reglas de VS4, la respuesta de los controles y el audio.',back)}
    <div class="config-grid">
      <section class="settings-card"><h2>Partida</h2><div class="form-grid">
        <label>Perfil<select id="profile">${['Competitivo','Casual','Personalizado'].map(p=>`<option ${selected(p,settings.profile)}>${p}</option>`).join('')}</select></label>
        <label>Generador<select data-rule="generator">${GENERATORS.map(g=>`<option value="${g}" ${selected(g,rules.generator)}>${genName[g]}</option>`).join('')}</select></label>
        <label>Objetivos<select data-rule="target">${TARGETS.map(t=>`<option value="${t}" ${selected(t,rules.target)}>${targetName[t]}</option>`).join('')}</select></label>
        <label>Semilla<input data-rule="seed" maxlength="64" placeholder="Aleatoria" value="${escape(rules.seed)}"></label>
        ${numbered(['gravity','progression','garbageDelay','garbageCap'])}
        ${check('shared','Secuencia compartida')}${check('floorKicks','Permitir Floor Kicks')}
      </div></section>
      <section class="settings-card"><h2>Precisión</h2><div class="form-grid">${numbered(['das','arr','soft','lock','resets','buffer'])}</div>
      <p class="hint">ARR 0 mueve hasta el obstáculo después de DAS.</p></section>
      <section class="settings-card"><h2>Zone y bonificaciones</h2><div class="form-grid">
        ${check('zone','Activar Zone')}${check('extraSpins','Bonificar Spins adicionales')}${numbered(['zoneSeconds','charge','zoneMinimum'])}</div></section>
      <section class="settings-card"><h2>Audio y pantalla</h2>
        ${Object.keys(MIX).map(raw=>{const k=raw as keyof typeof MIX;return `<label class="volume">${volumeNames[k]}<input type="range" min="0" max="1" step="0.01" data-volume="${k}" value="${settings.audio[k]}"></label>`}).join('')}
        <div class="form-grid">
          <label class="check"><input type="checkbox" data-view="mute" ${checked(settings.audio.mute)}> Silenciar</label>
          <label class="check"><input type="checkbox" data-view="reduced" ${checked(settings.reduced)}> Reducir efectos</label>
          <label class="check"><input type="checkbox" data-view="metrics" ${checked(settings.metrics)}> Métricas</label>
        </div></section>
      <details class="settings-card attack-settings"><summary>Tabla de ataques</summary><div class="form-grid">
      ${Object.entries(ATTACK_LABELS).map(([key,name])=>`<label>${name}<input type="number" data-attack="${key}" min="${key==='comboStep'?1:0}" max="100" step="1" value="${rules.attack[key as keyof Rules['attack']] }"></label>`).join('')}</div></details>
    </div></main>`
}

export function controls(settings: Settings, inputs: Inputs, i: number, type:'keys'|'pad', status: string, back: string) {
  const slot = settings.slots[i]
  const pad = inputs.assigned[i]
  const buttonLabel = (action: Action) => type === 'pad' && pad?.mapping === 'standard' ? standardPadLabel(slot.pad[action]) : label(slot[type][action])
  return `<main class="panel">${intro('Controles','Elige un jugador y selecciona una acción para cambiar su asignación.',back)}
    <div class="control-tabs">${settings.slots.map((s,j)=>`<button class="secondary ${i===j?'chosen':''}" data-control-player="${j}" style="--player:${COLORS[j]}">J${j+1} · ${escape(s.name)}</button>`).join('')}</div>
    <section class="settings-card pairing"><div><h2>Asignación rápida de mando</h2>
    <p>${pad ? escape(pad.id) : slot.device ? escape(slot.device.id)+' · desconectado' : 'Dispositivo actual: teclado'}</p>
    <p class="hint">Pulsa un botón del mando que quieras usar. Se aplicará su perfil de controles a J${i+1}.</p></div>
    <div class="pair-actions">${inputs.pairing ? '<button class="secondary" data-do="cancel">Cancelar asignación</button>' :
      '<button class="primary" data-do="pair">Asignar pulsando un botón</button>'}
      ${slot.device && !inputs.pairing ? '<button class="secondary" data-do="keyboard">Usar teclado</button>' : ''}</div></section>
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
    if (slot.device && !inputs.assigned[i]) cards.push(`<section class="settings-card"><h2>${escape(slot.device.id)}</h2><dl><dt>Estado</dt><dd>Desconectado</dd><dt>Último índice</dt><dd>${slot.device.index}</dd><dt>Jugador</dt><dd>J${i+1}</dd></dl></section>`)
  })
  return cards.join('') || '<p class="hint">No hay mandos visibles. Conecta un mando y pulsa uno de sus botones para que el navegador lo detecte.</p>'
}
export const diagnosticsPage = (inner: string, back: string) => `<main class="panel">${intro('Diagnóstico de mandos','Consulta en directo el estado de los dispositivos, sus botones y sus ejes.',back)}<div id="device-list" class="config-grid">${inner}</div></main>`
export const credits = () => `<main class="panel">${intro('Créditos','QUAD BLOCKS · Arena competitiva local','home')}<section class="settings-card"><h2>QUAD BLOCKS</h2><p>Diseño, implementación, gráficos de Canvas y síntesis sonora originales para este proyecto.</p><p>Motor en TypeScript, renderizado en HTML5 Canvas y audio sintetizado con Web Audio API.</p></section></main>`
