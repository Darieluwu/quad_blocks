import { SHAPES, landing } from './engine/pieces'
import type { Cell } from './engine/pieces'
import { HEIGHT, HIDDEN, VISIBLE, WIDTH, HZ, SETTINGS } from './engine/rules'
import { garbageProjection } from './engine/garbage'
import type { Player } from './engine/player'
import type { Match, Participant } from './engine/match'
import { BlitzMatch } from './engine/blitz'
import { zoneTitle } from './engine/zone'
import type { Slot } from './input'
import { CHARACTERS, uniqueCharacters, type CharacterId } from './characters/catalog'
import { Portrait, cueFor, portraitMarkup } from './characters/presentation'
import { artwork } from './characters/assets'
import { DialogueCard, dialogueMarkup } from './characters/dialogue'
import './characters/dialogue.css'
import { ZoneCinematics } from './characters/cinematics'
import { characterVisuals, type CharacterVisual } from './characters/visuals'
import { impactFeedback, portraitFeedback } from './characters/feedback'
import './characters/hud-portrait.css'
import type { GameEvent } from './engine/player'

export const COLORS = ['#ff5266','#59aaff','#58e39a','#be86fa']
const PIECES: Record<Exclude<Cell,null>,string> = {
  I:'#45d8ec',J:'#5783fc',L:'#ffad51',O:'#f5dc58',S:'#57da91',T:'#b27cfa',Z:'#f75d73',G:'#76869b',
  zone:'#ffda78',
}
const WORDS: Record<string,string> = {
  single:'SINGLE',double:'DOUBLE',triple:'TRIPLE',quad:'TETRIS',mini:'T-SPIN MINI',tZero:'T-SPIN',
  tSingle:'T-SPIN SINGLE',tDouble:'T-SPIN DOUBLE',tTriple:'T-SPIN TRIPLE',
  spinL:'L-SPIN',spinJ:'J-SPIN',spinS:'S-SPIN',spinZ:'Z-SPIN',backToBack:'BACK-TO-BACK',
  perfect:'PERFECT CLEAR',zoneStart:'SURGE ACTIVADO',zoneEnd:'SURGE COMPLETADO',
  blitzDown:'JUGADOR CAÍDO',blitzProtected:'BASURA CANCELADA',blitzGuard:'DEFENSA DE EQUIPO',
}
const PRIORITY: Record<string,number> = {perfect:5,zoneStart:6,zoneEnd:6,backToBack:1}
const ANIMATIONS: Record<string,string> = {
  zoneStart:'zone-in',zoneEnd:'zone-out',impact:'attack-in',receive:'attack-land',send:'attack-send',
}
const CELL = 26
const by = <E extends HTMLElement>(root: ParentNode, selector: string) => root.querySelector<E>(selector)!
function dialogueMarkupLabel(id:CharacterId,text:string) {
  const character=CHARACTERS[id]
  return `<div class="dialogue-avatar">${portraitMarkup(id)}</div><strong class="dialogue-name">${character.name}</strong><p class="dialogue-text">${text.replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]!))}</p>`
}
function winnerResultArt(id:CharacterId) {
  const assets=CHARACTERS[id].assets
  return artwork(assets.master) ?? artwork(assets.zonePose) ?? artwork(assets.portraits.victory) ?? artwork(assets.portraits.neutral)
}
function loserResultArt(id:CharacterId) {
  const assets=CHARACTERS[id].assets
  return artwork(assets.portraits.defeat) ?? artwork(assets.portraits.damage) ?? artwork(assets.portraits.danger) ?? artwork(assets.portraits.neutral)
}

function attackShowcase(id:CharacterId) {
  if (!characterVisuals[id]) return ''
  const url = artwork(CHARACTERS[id].assets.attackPose)
  return url ? `<div class="character-showcase ${id}-showcase" aria-hidden="true"><img class="character-cut-in ${id}-attack" src="${url}" alt="" draggable="false"></div>` : ''
}

function square(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, ghost = false) {
  if (ghost) {
    ctx.globalAlpha = 0.18
    ctx.fillStyle = color
    ctx.fillRect(x+2,y+2,size-4,size-4)
    ctx.globalAlpha = 0.7
    ctx.strokeStyle = color
    ctx.strokeRect(x+2.5,y+2.5,size-5,size-5)
    ctx.globalAlpha = 1
    return
  }
  ctx.fillStyle = color
  ctx.fillRect(x+1,y+1,size-2,size-2)
  ctx.fillStyle = '#ffffff48'
  ctx.fillRect(x+2,y+2,size-4,2)
  ctx.fillRect(x+2,y+4,2,size-7)
  ctx.fillStyle = '#00000039'
  ctx.fillRect(x+3,y+size-4,size-5,2)
  ctx.fillRect(x+size-4,y+4,2,size-8)
}

function preview(canvas: HTMLCanvasElement, kinds: Cell[], size = 12) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0,0,canvas.width,canvas.height)
  for (const [i,kind] of kinds.entries()) {
    if (!kind || kind === 'G' || kind === 'zone') continue
    const shape = SHAPES[kind][0]
    const left = Math.min(...shape.map(([x]) => x))
    const right = Math.max(...shape.map(([x]) => x))
    const offset = (canvas.width - (right-left+1)*size)/2
    for (const [x,y] of shape) square(ctx,offset+(x-left)*size,8+i*(size*2+10)+y*size,size,PIECES[kind])
  }
}

export function mountArena(root: HTMLElement, roster: readonly Participant[], blitz = false, characters = uniqueCharacters(null), attackAnimations = true) {
  const card = ({slot,level,team}:Participant) => {
    const id = characters[slot]
    const {name,colors} = CHARACTERS[id]
    return `
    <article class="player${blitz?' blitz-player':''}" data-player="${slot}" style="--player:${COLORS[slot]};--character-color:${colors[0]}">
      <header class="player-banner">
        <div class="hud-portrait" data-theme="${characterVisuals[id]?.theme ?? ''}">${portraitMarkup(id)}</div>
        <div class="player-profile"><div class="player-head"><span class="player-tag">J${slot+1}</span><h2></h2>
        <span class="character-name">${name}</span>
        ${team===undefined ? '' : `<span class="team-tag" data-team="${team}">Equipo ${team===0?'A':'B'}</span>`}
        ${level===undefined ? '' : `<span class="bot-tag" title="Dificultad ${level}">IA ${level}</span>`}
        <span class="zone-badge" hidden>SURGE</span>
        ${blitz ? '<span class="blitz-state"></span>' : ''}
        <span class="danger-label"></span></div>
        ${blitz ? '<div class="reserve-readout"><span class="reserve-zone"></span><strong class="reserve-garbage" hidden></strong></div>' : ''}
        </div>
        ${attackShowcase(id)}
      </header>
      ${dialogueMarkup(id)}
      ${blitz ? '' : `<div class="combat-hud">
        <div><span class="combat-label">ATACAS A</span><strong class="target"></strong></div>
        <div><span class="combat-label">TE ATACAN</span><div class="attackers"></div></div>
      </div>`}
      <div class="player-body">
        <div class="rail"><span>HOLD</span><canvas class="hold" width="58" height="38"></canvas>
          ${blitz ? '<div class="blitz-trash"><span>BASURA</span>' : ''}<div class="garbage" aria-label="Basura pendiente"><div></div></div><strong class="incoming">0</strong>${blitz ? '</div>' : ''}</div>
        <div class="well">
          <canvas width="${WIDTH*CELL}" height="${HEIGHT*CELL}" class="board" aria-label="Tablero del jugador ${slot+1}"></canvas>
          <canvas width="${WIDTH*CELL}" height="${HEIGHT*CELL}" class="forecast" aria-hidden="true"></canvas>
          <canvas width="${WIDTH*CELL}" height="${HEIGHT*CELL}" class="spawn-guide" aria-hidden="true"></canvas>
          <div class="projection" hidden><strong></strong></div>
          <div class="board-fx" aria-hidden="true"><span class="zone-burst"></span></div><span class="impact" hidden></span>
          <div class="out">${blitz?'JUGADOR CAÍDO':'ELIMINADO'}</div></div>
        <div class="rail"><span>NEXT</span><canvas class="next" width="64" height="210"></canvas><strong class="spawn-label" hidden></strong>
          ${blitz ? '<div class="blitz-zone"><span>SURGE</span><div class="meter"><div></div></div><div class="zone-label"><strong></strong></div></div>' : ''}</div>
      </div>
      ${blitz ? '<div class="blitz-stance" aria-label="Postura"><span>ATAQUE</span><b aria-hidden="true"></b><span>DEFENSA</span></div>' : '<div class="zone-label"><span>SURGE</span><strong></strong></div><div class="meter"><div></div></div>'}
      <div class="player-stats"><span class="lines"></span><span class="sent"></span></div>
      <div class="board-notices"><div class="effect"></div><div class="zone-result" hidden><small>SURGE COMPLETADO</small><strong></strong><span></span></div></div>
      ${blitz ? '<span class="reserve-sweat" aria-hidden="true"><i></i><i></i></span><span class="blitz-entry" aria-hidden="true"></span>' : ''}
    </article>`
  }
  const missionRow = (step: number,title: string) => `<div class="rescue-mission" data-step="${step}">
    <div class="rescue-task"><strong class="rescue-title">${title}</strong><span class="rescue-count"></span></div>
    <div class="rescue-break" aria-hidden="true">${'<i></i>'.repeat(8)}</div></div>`
  const layout = blitz ? `<div class="blitz-clock" role="timer" aria-label="Segundos para el relevo"><strong></strong></div>
    <div class="blitz-arena">${[0,1].map(team=>`<section class="blitz-team" data-side="${team}">
      <aside class="blitz-summary">
        <div class="blitz-team-info"><strong class="blitz-team-name"></strong><div class="blitz-defense"></div></div>
        <div class="blitz-rescue" hidden>
          <strong class="rescue-alert">REVIVE A TU COMPAÑERO</strong><span class="rescue-name"></span>
          ${missionRow(1,'Tetris o T-Spin')}${missionRow(2,'Líneas de ataque')}
        </div>
        <div class="blitz-revived" role="status" hidden><strong>¡REVIVIDO!</strong><span></span></div>
      </aside>
      <div class="blitz-stack">${roster.filter(p=>p.team===team).map(card).join('')}</div>
    </section>`).join('')}</div>` :
    '<div class="arena-grid" style="--boards:'+roster.length+'">'+roster.map(card).join('')+'</div>'
  root.innerHTML = layout+(blitz?'<div class="blitz-subtitle-layer" aria-label="Diálogo de personajes"></div>':'')+'<div class="projectile-layer" aria-hidden="true"></div>'
  root.classList.toggle('no-attack-animation',!attackAnimations)
  return new Arena(root,roster,characters,attackAnimations)
}

class Arena {
  private views
  private layer: HTMLElement
  private cinematics: ZoneCinematics
  private clock: HTMLElement|null
  private teams: HTMLElement[]
  private reviveUntil = [0,0]
  private rescueClearAt = [0,0]
  private blitzKey = ''
  private finished = false
  private reduced = matchMedia('(prefers-reduced-motion: reduce)')
  constructor(private root: HTMLElement, roster: readonly Participant[], characters:readonly CharacterId[],private attackAnimations:boolean) {
    this.layer = by(root,'.projectile-layer')
    this.cinematics = new ZoneCinematics(root,characters)
    this.clock = root.querySelector('.blitz-clock')
    this.teams = [...root.querySelectorAll<HTMLElement>('.blitz-team')]
    this.views = roster.map(({slot,team}) => {
      const node = by(root,`[data-player="${slot}"]`)
      const canvas = by<HTMLCanvasElement>(node,'.board')
      const ctx = canvas.getContext('2d',{alpha:false})!
      const grid = document.createElement('canvas')
      grid.width = canvas.width
      grid.height = canvas.height
      const bg = grid.getContext('2d')!
      bg.fillStyle = '#0d121d'
      bg.fillRect(0,0,grid.width,grid.height)
      bg.fillStyle = '#172339'
      bg.fillRect(0,0,grid.width,HIDDEN*CELL)
      bg.strokeStyle = '#1c2637'
      bg.beginPath()
      for (let x = 1; x < WIDTH; x++) { bg.moveTo(x*CELL+0.5,0); bg.lineTo(x*CELL+0.5,grid.height) }
      for (let y = 1; y < HEIGHT; y++) { bg.moveTo(0,y*CELL+0.5); bg.lineTo(grid.width,y*CELL+0.5) }
      bg.stroke()
      bg.fillStyle = '#586b88'
      bg.fillRect(0,HIDDEN*CELL,grid.width,1)
      const stack = document.createElement('canvas')
      stack.width = grid.width
      stack.height = grid.height
      return {node,team,ctx,grid,stack,stackCtx:stack.getContext('2d')!,revision:-1,signature:'',
        portrait:new Portrait(characters[slot],by(node,'.hud-portrait .character-portrait'),slot),
        portraitFrame:by(node,'.hud-portrait'),portraitPulse:null as Animation|null,
        visualStrike:null as {tick:number;kind:'tetris'|'spin'|'zoneFinish'}|null,
        dialogue:new DialogueCard(by(node,'.dialogue-slot'),characters[slot],slot),
        reserveZone:node.querySelector<HTMLElement>('.reserve-zone'),reserveGarbage:node.querySelector<HTMLElement>('.reserve-garbage'),
        showcase:node.querySelector<HTMLElement>('.character-showcase'),showcaseAnimation:null as Animation|null,
        hold:by<HTMLCanvasElement>(node,'.hold'),next:by<HTMLCanvasElement>(node,'.next'),
        heading:by(node,'h2'),warning:by(node,'.danger-label'),target:node.querySelector<HTMLElement>('.target'),attackers:node.querySelector<HTMLElement>('.attackers'),
        incoming:by(node,'.incoming'),garbage:by(node,'.garbage div'),meter:by(node,'.meter div'),
        zone:by(node,'.zone-label strong'),lines:by(node,'.lines'),sent:by(node,'.sent'),effect:by(node,'.effect'),
        forecast:by<HTMLCanvasElement>(node,'.forecast').getContext('2d')!,
        marker:by(node,'.projection'),markerLabel:by(node,'.projection strong'),fx:by(node,'.board-fx'),
        well:by(node,'.well'),zoneBadge:by(node,'.zone-badge'),
        zoneResult:by(node,'.zone-result'),resultUntil:0,
        guide:by<HTMLCanvasElement>(node,'.spawn-guide').getContext('2d')!,
        guidance:by(node,'.spawn-label'),guideKey:'',player:null as Player|null,
        impact:by(node,'.impact'),impactUntil:0,forecastKey:'',relationKey:'',
        flashUntil:0, priority:0, position:'', hud:''}
    })
  }

  finish(match: Match, fallen: readonly number[]) {
    if (this.finished) return
    this.finished = true
    this.cinematics.stop()
    const effects = !this.root.closest('.reduced') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const winners = match.winnerBoards().map(index=>{
      const node = this.views[index].node
      return {node,from:node.getBoundingClientRect()}
    })
    const boards = document.createElement('div')
    boards.className = 'result-boards'

    // Keep the last painted frame, including the exact arrangement of every locked piece.
    const shots = effects ? fallen.map(index=>{
      const view = this.views[index]
      const box = view.well.getBoundingClientRect()
      const source = view.ctx.canvas
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      canvas.getContext('2d')!.drawImage(source,0,0)
      canvas.className = 'board-fall'
      canvas.dataset.player = view.node.dataset.player
      Object.assign(canvas.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'})
      const colors = match.players[index].board.flat().flatMap(cell=>cell ? [PIECES[cell]] : [])
      return {canvas,box,colors}
    }) : []
    for (const {node} of winners) boards.append(node)
    this.root.replaceChildren(boards)
    return () => {
      if (!effects) return
      for (const {node,from} of winners) {
        const to = node.getBoundingClientRect()
        node.animate([
          {transform:`translate(${from.x+from.width/2-to.x-to.width/2}px,${from.y+from.height/2-to.y-to.height/2}px) scale(${from.width/to.width})`},
          {transform:'none'},
        ],{duration:730,easing:'cubic-bezier(.2,.72,.25,1)'})
      }
      if (!shots.length) return
      const layer = document.createElement('div')
      layer.className = 'final-fx'
      layer.setAttribute('aria-hidden','true')
      this.root.append(layer)
      const animations: Animation[] = []
      for (const {canvas,box,colors} of shots) {
        layer.append(canvas)
        animations.push(canvas.animate([
          {transform:'translate(0,0) rotate(0deg)',opacity:1},
          {offset:.13,transform:'translate(-9px,-13px) rotate(-2deg)',opacity:1},
          {offset:.37,transform:'translate(10px,28px) rotate(3deg)',opacity:1},
          {transform:`translate(40px,${window.innerHeight+box.height*.25}px) rotate(9deg)`,opacity:0},
        ],{duration:970,easing:'cubic-bezier(.45,.06,.62,1)',fill:'forwards'}))

        const burst = document.createElement('div')
        burst.className = 'final-burst'
        burst.style.left = box.x+box.width*.5+'px'
        burst.style.top = box.y+box.height*.43+'px'
        burst.style.setProperty('--burst-size',Math.min(box.width*1.75,570)+'px')
        layer.append(burst)
        for (let n=0;n<14;n++) {
          const shard = document.createElement('i')
          const angle = n*2*Math.PI/14
          const distance = box.width*(.32+(n%4)*.14)
          shard.style.background = colors.length ? colors[n*7%colors.length] : '#ffd695'
          shard.style.setProperty('--shard-x',Math.cos(angle)*distance+'px')
          shard.style.setProperty('--shard-y',Math.sin(angle)*distance+'px')
          shard.style.setProperty('--shard-turn',((n%2 ? -1 : 1)*(65+15*n))+'deg')
          shard.style.setProperty('--shard-size',(8+(n%4)*4)+'px')
          burst.append(shard)
        }
      }
      void Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>layer.remove())
    }
  }

  attack(from: number, to: number, tick:number, arrive: () => void) {
    const origin = this.views[from]
    const victim = this.views[to]
    this.cinematics.delivered(origin.node,victim.node,tick)
    if (!this.attackAnimations || this.layer.closest('.reduced') || this.reduced.matches) {
      arrive()
      return
    }
    const theme = characterVisuals[origin.portrait.id]?.theme
    if (theme==='cosmic' || theme==='fire' || theme==='lunar') {
      // Incoming events can precede the caster's clear within the same simulation tick.
      requestAnimationFrame(()=>{
        if (!this.layer.isConnected) return
        if (this.reduced.matches || this.layer.closest('.reduced')) arrive()
        else this.animateAttack(origin,victim,theme,tick,arrive)
      })
    } else this.animateAttack(origin,victim,theme,tick,arrive)
  }

  private animateAttack(origin:Arena['views'][number],victim:Arena['views'][number],
    theme:CharacterVisual['theme']|undefined,
    tick:number,arrive:()=>void) {
    const electric = theme==='electric'
    const cosmic = theme==='cosmic'
    const fire = theme==='fire'
    const lunar = theme==='lunar'
    const variation = (cosmic || fire || lunar) && origin.visualStrike?.tick===tick ? origin.visualStrike.kind : undefined
    const bounds = this.layer.getBoundingClientRect()
    const anchor = (view: Arena['views'][number]) => {
      const field = view.well.getBoundingClientRect()
      return field.width ? field : view.node.getBoundingClientRect()
    }
    const start = anchor(origin)
    const end = anchor(victim)
    const direction = Math.sign(end.left-start.left) || 1
    const x = (direction>0 ? start.right : start.left)-bounds.left
    const y = Math.max(18,Math.min(start.top,end.top)-bounds.top-12)
    const dx = (direction>0 ? end.left : end.right)-bounds.left-x
    const arc = Math.min(variation==='tetris'?34:16,Math.abs(dx)*.10,y-8)
    const projectile = document.createElement('span')
    projectile.className = 'projectile'
    if (theme) projectile.classList.add(`projectile-${theme}`)
    if (cosmic || fire || lunar) projectile.dataset.strike = variation ?? 'simple'
    projectile.dataset.from = origin.node.dataset.player
    projectile.dataset.to = victim.node.dataset.player
    projectile.style.left = x+'px'
    projectile.style.top = y+'px'
    projectile.style.setProperty('--shot',fire?'#ff702c':lunar?'#bd8bff':cosmic?'#ce9dff':theme==='digital'?'#30f5df':theme==='frost'?'#9cdeff':
      electric ? '#ffd345' : COLORS[Number(origin.node.dataset.player)])
    projectile.style.setProperty('--shot-accent',CHARACTERS[origin.portrait.id].colors[1])
    projectile.style.setProperty('--bearing',Math.atan2(0,dx)+'rad')
    this.layer.append(projectile)
    const flight = projectile.animate(variation==='spin' ? [
      {transform:'translate(0,0) scale(.6)',opacity:.55},
      {transform:`translate(${dx*.28}px,${-arc}px) rotate(160deg)`,opacity:1,offset:.3},
      {transform:`translate(${dx*.67}px,${arc*.30}px) rotate(285deg)`,opacity:1,offset:.67},
      {transform:`translate(${dx}px,0) rotate(360deg) scale(1.1)`,opacity:1},
    ] : [
      {transform:'translate(0,0) scale(.65)',opacity:.48},
      {transform:`translate(${dx*.48}px,${-arc}px)`,opacity:1,offset:.46},
      {transform:`translate(${dx}px,0) scale(1.15)`,opacity:1},
    ],{duration:Math.min(490,(fire?345:310)+Math.abs(dx)*.12),easing:'ease-out'})
    const cosmicImpact = cosmic ? window.setTimeout(()=>{
      if (this.layer.isConnected && victim.node.dataset.featured!=='false' && !victim.node.classList.contains('dead')) {
        impactFeedback(victim.node,'cosmic')
      }
    },180) : undefined
    const clear = () => {
      if (cosmicImpact!==undefined) window.clearTimeout(cosmicImpact)
      projectile.remove()
    }
    void flight.finished.then(()=>{
      clear()
      if (!this.layer.isConnected) return
      if (theme && !electric && !this.reduced.matches && !this.layer.closest('.reduced')) impactFeedback(victim.node,theme)
      if (electric && victim.node.dataset.featured!=='false' && !victim.node.classList.contains('dead')) {
        victim.well.animate([
          {boxShadow:'0 0 17px 3px #ffd345, 0 0 4px 1px #fff6a9 inset'},
          {boxShadow:'none'},
        ],{duration:320,easing:'ease-out'})
      }
      arrive()
    },clear)
  }

  characterEvent(i:number,event:GameEvent,tick:number) {
    const cue = cueFor(event)
    const view = this.views[i]
    const theme = characterVisuals[view.portrait.id]?.theme
    if (cue) {
      const reaction = theme && theme!=='electric' && theme!=='digital' && event.type==='teammateDown' ?
        {...cue,portrait:'danger' as const} : theme==='fire' && event.type==='teammateRevived' ?
          {...cue,portrait:'victory' as const} : cue
      view.portrait.react(reaction,performance.now(),this.attackAnimations)
      if ((theme==='cosmic' || theme==='fire' || theme==='lunar') && (cue.attack==='tetris' || cue.attack==='spin' || cue.attack==='zoneFinish')) {
        if (view.visualStrike?.tick!==tick || view.visualStrike.kind!=='zoneFinish') {
          view.visualStrike = {tick,kind:cue.attack}
        }
      }
    }
    if (cue && theme && theme!=='electric' && this.attackAnimations &&
        !this.reduced.matches && !this.root.closest('.reduced')) portraitFeedback(view.portraitFrame,theme,event,cue)
    const attackPulse = cue?.attack==='tetris' || cue?.attack==='spin' || cue?.attack==='combo'
    if (attackPulse || event.type==='blitzGuard' || event.type==='blitzProtected') this.emphasizePortrait(view,attackPulse)
    if (event.type==='zoneStart') this.cinematics.charge(view.portrait.id,view.node)
    if (cue?.attack==='zoneFinish') {
      view.portraitPulse?.cancel()
      view.showcaseAnimation?.cancel()
      this.cinematics.finish(view.portrait.id,view.node,tick)
    }
    if (!view.showcase || !cue) return cue
    if (event.type==='eliminated' || event.type==='victory' || event.type==='blitzVictory') view.showcaseAnimation?.cancel()
    if (!cue.attack || cue.attack==='zoneFinish' || (theme==='frost' && cue.attack==='combo') ||
        ((theme==='cosmic' || theme==='fire' || theme==='lunar') && cue.attack!=='tetris') ||
        !this.attackAnimations || this.reduced.matches || this.root.closest('.reduced')) return cue
    view.showcaseAnimation?.cancel()
    view.showcase.dataset.scene = 'attack'
    const scene = by(view.showcase,'.character-cut-in')
    const animation = scene.animate([
      {opacity:0,transform:'translateX(15%)'},{opacity:1,transform:'none',offset:.22},{opacity:0,transform:'none'},
    ],{duration:570,easing:'ease-out'})
    view.showcaseAnimation = animation
    const clear = () => {
      if (view.showcaseAnimation!==animation) return
      delete view.showcase!.dataset.scene
      view.showcaseAnimation = null
    }
    animation.onfinish = animation.oncancel = clear
    return cue
  }

  private emphasizePortrait(view:Arena['views'][number],towardRival:boolean) {
    if (!this.attackAnimations || this.reduced.matches || this.root.closest('.reduced') ||
        view.node.dataset.featured==='false' || this.root.querySelector('.cinematic-scene:not([data-channel])')) return
    if (view.portraitPulse && Number(view.portraitPulse.currentTime)<65) return
    view.portraitPulse?.cancel()
    const frame = view.portraitFrame
    frame.dataset.pulsing = ''
    const pulse = frame.animate([
      {transform:'none',easing:'cubic-bezier(.24,.65,.32,1)'},
      {transform:`translateX(${towardRival?'var(--hud-pulse-x,0px)':'0px'}) scale(var(--hud-pulse-scale,1))`,offset:.26,easing:'ease-out'},
      {transform:'none'},
    ],{duration:520})
    view.portraitPulse = pulse
    const clear = () => {
      if (view.portraitPulse!==pulse) return
      delete frame.dataset.pulsing
      view.portraitPulse = null
    }
    pulse.onfinish = pulse.oncancel = clear
  }

  subtitle(i:number,text:string|undefined,timed:boolean,ended:boolean,zoneFinish:boolean) {
    const {dialogue,portrait} = this.views[i]
    if (!text) {
      dialogue.hide(ended)
      this.clearBlitzSubtitle(i)
      return
    }
    const accent = zoneFinish ? this.cinematics.accent(portrait.id) : undefined
    dialogue.slot.toggleAttribute('data-cinematic-line',!!accent)
    if (accent) dialogue.slot.style.setProperty('--scene-color',accent)
    dialogue.show(text,timed)
    if (this.root.querySelector('.blitz-arena') && this.root.clientWidth>=1500) dialogue.hide(false)
    if (this.root.classList.contains('blitz-arena') || this.root.querySelector('.blitz-arena')) this.showBlitzSubtitle(i,text,timed,accent)
  }

  private blitzSubtitleTimer = new Map<number,number>()
  private showBlitzSubtitle(i:number,text:string,timed:boolean,accent:string|undefined) {
    const layer=this.root.querySelector<HTMLElement>('.blitz-subtitle-layer')
    if (!layer) return
    const view=this.views[i]
    const team=view.team
    if (team===undefined) return
    const caption=dialogueMarkupLabel(view.portrait.id,text)
    let callout=layer.querySelector<HTMLElement>(`.blitz-subtitle-callout[data-callout-player="${i}"]`)
    if (!callout) {
      callout=document.createElement('div')
      callout.className='blitz-subtitle-callout'
      callout.dataset.calloutPlayer=String(i)
      callout.dataset.team=String(team)
      layer.append(callout)
    }
    callout.innerHTML=caption
    callout.style.setProperty('--dialogue-color',CHARACTERS[view.portrait.id].colors[0])
    if (accent) callout.style.setProperty('--dialogue-accent',accent)
    const node=view.node.getBoundingClientRect()
    const arena=this.root.getBoundingClientRect()
    const width=Math.min(210,Math.max(150,(this.root.querySelector<HTMLElement>('.blitz-arena')?.getBoundingClientRect().width??arena.width)*.14))
    callout.style.width=`${width}px`
    callout.style.top=`${Math.max(56,Math.min(arena.height-78,node.top-arena.top+(team===0?110:220)))}px`
    callout.style.left=team===0?'8px':''
    callout.style.right=team===1?'8px':''
    clearTimeout(this.blitzSubtitleTimer.get(i))
    if (timed) this.blitzSubtitleTimer.set(i,window.setTimeout(()=>this.clearBlitzSubtitle(i),5000))
  }

  private clearBlitzSubtitle(i:number) {
    clearTimeout(this.blitzSubtitleTimer.get(i))
    this.blitzSubtitleTimer.delete(i)
    this.root.querySelector<HTMLElement>(`.blitz-subtitle-callout[data-callout-player="${i}"]`)?.remove()
  }

  placeResultCaptions(overlay:HTMLElement) {
    for (const view of this.views) {
      if (!view.node.isConnected) overlay.querySelector(`[data-result-player="${view.node.dataset.player}"]`)?.closest('li')?.append(view.dialogue.slot)
    }
  }

  note(i: number, type: string, detail: string|undefined, now: number) {
    const view = this.views[i]
    const teamView = view.team===undefined ? undefined : this.teams[view.team]
    if (teamView && type==='blitzChallenge') {
      const step = detail==='completo' ? 2 : 1
      const row = by(teamView,`.rescue-mission[data-step="${step}"]`)
      row.classList.add('burst')
      if (step===2) {
        row.dataset.state = 'done'
        const count = by(row,'.rescue-count')
        const goal = count.dataset.goal
        if (goal) count.textContent = `${goal}/${goal}`
        this.rescueClearAt[view.team!] = performance.now()+670
      }
      return
    }
    if (teamView && type==='blitzRevived') {
      const notice = by(teamView,'.blitz-revived')
      by(notice,'span').textContent = view.heading.textContent
      notice.hidden = false
      notice.classList.remove('arrive')
      requestAnimationFrame(()=>notice.classList.add('arrive'))
      this.reviveUntil[view.team!] = performance.now()+3000
      return
    }
    const animation = ANIMATIONS[type]
    if (animation) {
      const group = animation.startsWith('zone') ? ['zone-in','zone-out'] : ['attack-in','attack-land','attack-send']
      view.fx.classList.remove(...group)
      requestAnimationFrame(() => {
        view.fx.classList.remove(...group)
        view.fx.classList.add(animation)
      })
    }
    if (type==='impact' || type==='receive') {
      view.well.classList.remove('hit')
      requestAnimationFrame(() => view.well.classList.add('hit'))
    }
    if (type==='incoming' || type==='receive') {
      view.impact.hidden = false
      view.impact.textContent = type==='incoming' ? '+'+detail+' ENTRANTES' : '+'+detail+' INCORPORADAS'
      view.impactUntil = now+SETTINGS.effectTicks
    }
    if (type==='zoneEnd') {
      const lines = Number(detail)
      view.zoneResult.hidden = false
      by(view.zoneResult,'strong').textContent = zoneTitle(lines)
      by(view.zoneResult,'span').textContent = lines+(lines===1?' línea':' líneas')
      view.zoneResult.classList.remove('zone-reveal')
      requestAnimationFrame(()=>view.zoneResult.classList.add('zone-reveal'))
      view.resultUntil = performance.now()+3000
      return
    }
    if (!WORDS[type]) return
    const priority = PRIORITY[type] ?? 2
    if (now < view.flashUntil && priority < view.priority) return
    view.priority = priority
    view.flashUntil = now+SETTINGS.effectTicks
    view.effect.textContent = WORDS[type]
    view.effect.classList.remove('flash')
    requestAnimationFrame(() => { if (view.effect.textContent) view.effect.classList.add('flash') })
  }

  private field(view: Arena['views'][number], p: Player) {
    const piece = p.active
    const pos = [p.revision,piece.kind,piece.rotation,piece.x,piece.y,p.dead].join(',')
    if (view.position === pos) return
    view.position = pos
    if (view.revision !== p.revision) {
      view.revision = p.revision
      view.stackCtx.drawImage(view.grid,0,0)
      for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const kind = p.board[y][x]
        if (kind) square(view.stackCtx,x*CELL,y*CELL,CELL,PIECES[kind])
      }
    }
    view.ctx.drawImage(view.stack,0,0)
    if (p.dead) return
    const drop = landing(p.board,piece)
    for (const [x,y] of SHAPES[piece.kind][piece.rotation]) {
      const px = (piece.x+x)*CELL
      const py = (piece.y+y)*CELL
      if (drop) square(view.ctx,px,py+drop*CELL,CELL,PIECES[piece.kind],true)
      square(view.ctx,px,py,CELL,PIECES[piece.kind])
    }
  }

  private drawProjection(view: Arena['views'][number], p: Player) {
    const holes = p.dead || p.zone.active ? [] : p.garbage.preview(p.rules.garbageCap)
    const key = holes.length ? [p.revision,...holes].join('|') : 'none'
    if (view.forecastKey===key) return
    view.forecastKey = key
    const ctx = view.forecast
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height)
    view.marker.hidden = !holes.length
    if (!holes.length) return
    const {top,height} = garbageProjection(p.board,0,holes)
    const row = Math.max(0,top)
    view.marker.style.top = row/HEIGHT*100+'%'
    view.marker.dataset.overflow = String(height>VISIBLE)
    view.markerLabel.textContent = `+${holes.length} · ALTURA ${height}`
    const color = height>=SETTINGS.critical ? '#ff5270' : '#ffb36b'
    ctx.fillStyle = color
    ctx.strokeStyle = color
    for (let y=0;y<HEIGHT;y++) {
      const projected = y-holes.length
      if (projected<0 || projected>=HEIGHT) continue
      ctx.globalAlpha = .25
      for (let x=0;x<WIDTH;x++) {
        if (p.board[y][x]) ctx.strokeRect(x*CELL+4,projected*CELL+4,CELL-8,CELL-8)
      }
    }
    holes.forEach((hole,index) => {
      const y = (HEIGHT-holes.length+index)*CELL
      for (let x=0;x<WIDTH;x++) if (x!==hole) {
        ctx.globalAlpha = .10
        ctx.fillRect(x*CELL+1,y+1,CELL-2,CELL-2)
        ctx.globalAlpha = .25
        ctx.beginPath()
        ctx.moveTo(x*CELL+5,y+CELL-5)
        ctx.lineTo(x*CELL+CELL-5,y+5)
        ctx.stroke()
      }
    })
    ctx.globalAlpha = 1
  }

  private drawSpawnGuide(view: Arena['views'][number], p: Player) {
    const kind = !p.dead && p.danger ? p.next[0] : undefined
    const piece = kind ? p.previewSpawn(kind) : undefined
    const key = piece ? [kind,p.revision,piece.y].join(':') : ''
    if (view.guideKey===key) return
    view.guideKey = key
    const ctx = view.guide
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height)
    view.guidance.hidden = !kind
    if (!kind || !piece) return
    view.guidance.textContent = 'APARICIÓN '+kind
    view.guidance.title = 'Mantén libres las casillas marcadas para la siguiente pieza'
    for (const [dx,dy] of SHAPES[kind][0]) {
      const x = piece.x+dx
      const y = piece.y+dy
      const blocked = p.board[y]?.[x]!==null
      ctx.strokeStyle = blocked ? '#ff526c' : '#ffec8c'
      ctx.fillStyle = blocked ? '#ff003351' : '#ffe36c29'
      ctx.lineWidth = 2
      ctx.fillRect(x*CELL+2,y*CELL+2,CELL-4,CELL-4)
      ctx.strokeRect(x*CELL+3,y*CELL+3,CELL-6,CELL-6)
    }
  }

  private drawBlitz(match: BlitzMatch, slots: Slot[]) {
    const clock = this.clock!
    const seconds = Math.ceil(match.left/HZ)
    const warning = match.canRotate && !match.transition && match.left<=match.warningTicks
    // Online snapshots serialize the initial -Infinity timestamp as null.
    const revivedTeams = match.sides.map(side=>Number.isFinite(side.revivedAt) && match.now-side.revivedAt<3*HZ)
    const key = [seconds,warning,match.canRotate,!!match.transition,match.rotation,match.turn,...match.stances,
      ...match.sides.flatMap((side,team)=>[side.active,side.used,side.defended,revivedTeams[team],
        side.rescue?.stage,side.rescue?.done,
        ...side.members.flatMap(i=>[match.players[i].dead,match.players[i].danger,match.players[i].garbage.total])])].join('|')
    if (key===this.blitzKey) return
    this.blitzKey = key
    clock.hidden = !match.canRotate && !match.transition
    clock.dataset.warning = String(warning)
    clock.dataset.transition = match.transition ? match.rotation : ''
    clock.dataset.effects = String(match.blitz.effects)
    clock.dataset.beat = seconds%2 ? 'odd' : 'even'
    clock.dataset.urgent = String(warning && seconds<=2)
    clock.dataset.turn = String(match.turn)
    by(clock,'strong').textContent = match.transition ? match.rotation==='emergency'?'¡RELEVO!':'¡CAMBIO!' :
      match.canRotate ? String(seconds) : ''
    for (const [team,side] of match.sides.entries()) {
      const teamView = this.teams[team]
      teamView.dataset.switch = String(!!match.transition && match.blitz.effects && side.swapped)
      const status = by(teamView,'.blitz-summary')
      const ally = side.members.find(i=>i!==side.active)!
      const waiting = match.players[ally]
      const revived = !waiting.dead && revivedTeams[team]
      const name = slots[match.roster[ally].slot].name
      const active = this.views[side.active]
      const reserve = this.views[ally]
      active.node.dataset.featured = 'true'
      reserve.node.dataset.featured = 'false'
      active.node.dataset.state = match.players[side.active].dead ? 'down' : 'active'
      active.node.dataset.reserveDanger = 'false'
      reserve.node.dataset.state = waiting.dead ? 'down' : revived ? 'revived' : 'reserve'
      reserve.node.dataset.reserveDanger = String(!waiting.dead && waiting.danger>0)
      by(active.node,'.blitz-state').textContent = match.players[side.active].dead ? 'CAÍDO' : 'ACTIVO'
      by(reserve.node,'.blitz-state').textContent = waiting.dead ? side.rescue?.stage===2 ? 'REVIVIENDO' : 'CAÍDO' : revived ? 'REVIVIDO' : 'EN ESPERA'
      for (const index of side.members) {
        const stance = by(this.views[index].node,'.blitz-stance')
        stance.dataset.stance = match.stances[index]
        stance.setAttribute('aria-label',match.stances[index]==='defense' ? 'Postura: Defensa' : 'Postura: Ataque')
      }
      by(status,'.blitz-team-name').textContent = `Equipo ${team===0?'A':'B'} · ${match.blitz.revives-side.used} rescates`
      const rescue = waiting.dead ? side.rescue : null
      const mission = by(status,'.blitz-rescue')
      mission.hidden = !rescue && !this.rescueClearAt[team]
      if (rescue && !this.rescueClearAt[team]) {
        by(mission,'.rescue-name').textContent = name
        const goals = match.rescueGoals(team)
        for (const [index,goal] of [goals.plays,goals.power].entries()) {
          const step = index+1
          const row = by(mission,`.rescue-mission[data-step="${step}"]`)
          row.dataset.state = rescue.stage===step ? 'active' : rescue.stage>step ? 'done' : 'locked'
          const counter = by(row,'.rescue-count')
          counter.dataset.goal = String(goal)
          counter.textContent = `${rescue.stage===step ? rescue.done : rescue.stage>step ? goal : 0}/${goal}`
        }
      }
      by(status,'.blitz-defense').textContent = waiting.dead ? rescue ? '' : 'ÚLTIMA OPORTUNIDAD · Rescates agotados' :
        `Defensa del turno ${side.defended}/${match.blitz.defenseCap}`
    }
  }

  private drawCombat(view: Arena['views'][number], i: number, match: Match, slots: Slot[]) {
    if (!view.target || !view.attackers) return
    const target = match.roster[match.targets[i]]?.slot
    const aimed = match.targets.flatMap((to,from)=>to===i && !match.players[from].dead ? [from] : [])
    const queued = new Map<number,number>()
    for (const packet of match.players[i].garbage.queue) {
      if (packet.source!==undefined) queued.set(packet.source,(queued.get(packet.source) ?? 0)+packet.lines)
    }
    const relation = [target,slots[target ?? -1]?.name,aimed.join(),JSON.stringify([...queued])].join('|')
    if (view.relationKey===relation) return
    view.relationKey = relation
    view.target.textContent = target===undefined ? '—' : `J${target+1} · ${slots[target].name}`
    view.target.style.color = target===undefined ? '' : COLORS[target]
    view.target.title = target===undefined ? '' : slots[target].name
    const attackers = [...new Set([...queued.keys(),...aimed])]
    view.attackers.replaceChildren(...attackers.map(from=>{
      const {slot} = match.roster[from]
      const lines = queued.get(from) ?? 0
      const chip = document.createElement('span')
      chip.className = 'attacker'
      chip.style.setProperty('--attacker',COLORS[slot])
      chip.textContent = 'J'+(slot+1)+(lines ? ' +'+lines : '')
      chip.title = slots[slot].name+(lines ? ' · '+lines+' líneas pendientes' : ' · te apunta')
      chip.setAttribute('aria-label',chip.title)
      return chip
    }))
    if (!attackers.length) view.attackers.textContent = '—'
  }

  draw(match: Match, slots: Slot[]) {
    const now = performance.now()
    for (const view of this.views) view.dialogue.update(now)
    if (this.finished) return
    const reduced = this.reduced.matches || !!this.root.closest('.reduced')
    const winners = match.finished ? match.winnerBoards() : []
    if (match instanceof BlitzMatch) {
      this.drawBlitz(match,slots)
      this.rescueClearAt.forEach((until,team)=>{
        if (!until || performance.now()<until) return
        const mission = by(this.teams[team],'.blitz-rescue')
        mission.hidden = true
        for (const row of mission.querySelectorAll('.burst')) row.classList.remove('burst')
        this.rescueClearAt[team] = 0
        this.blitzKey = ''
      })
      this.reviveUntil.forEach((until,team)=>{
        if (until && performance.now()>=until) {
          by(this.teams[team],'.blitz-revived').hidden = true
          this.reviveUntil[team] = 0
        }
      })
    }
    for (const [i,p] of match.players.entries()) {
      const view = this.views[i]
      view.portrait.update(now,p.zone.active,p.danger,p.dead,winners.includes(i),reduced)
      if (view.player!==p) {
        view.player = p
        view.position = view.forecastKey = view.guideKey = ''
        view.revision = -1
      }
      this.field(view,p)
      this.drawProjection(view,p)
      this.drawSpawnGuide(view,p)
      this.drawCombat(view,i,match,slots)
      if (!view.zoneResult.hidden && performance.now()>=view.resultUntil) view.zoneResult.hidden = true
      const signature = [p.hold,...p.next].join(',')
      if (view.signature !== signature) {
        view.signature = signature
        preview(view.hold,[p.hold])
        preview(view.next,p.next,16)
      }
      if (view.effect.textContent && match.now >= view.flashUntil) view.effect.textContent = ''
      if (!view.impact.hidden && (p.dead || match.now>=view.impactUntil)) view.impact.hidden = true
      const slot = match.roster[i].slot
      const incoming = p.garbage.total
      const zoneProgress = p.zone.active ? p.zone.remaining/p.zone.duration*100 : p.zone.energy
      const hud = [p.dead,p.danger,p.zone.active,zoneProgress,p.zone.lines,incoming,p.stats.lines,p.stats.sent,slots[slot].name].join('|')
      if (view.hud === hud) continue
      view.hud = hud
      view.heading.textContent = slots[slot].name
      view.node.classList.toggle('dead',p.dead)
      view.node.classList.toggle('zoned',p.zone.active && !p.dead)
      view.zoneBadge.hidden = !p.zone.active || p.dead
      view.node.dataset.danger = String(p.dead ? 0 : p.danger)
      view.warning.textContent = p.dead ? '' : p.danger === 2 ? '¡ALARMA!' : p.danger ? 'PELIGRO' : ''
      view.incoming.textContent = String(incoming)
      view.garbage.style.height = Math.min(100,incoming*7)+'%'
      const blitz = match instanceof BlitzMatch
      view.meter.style[blitz?'height':'width'] = zoneProgress+'%'
      view.zone.textContent = p.zone.active ? `${blitz ? Math.ceil(zoneProgress)+'% · ' : ''}${p.zone.lines} L · ${(p.zone.remaining/HZ).toFixed(1)} s` :
        match.rules.zone ? Math.round(p.zone.energy)+'%' : 'Desactivada'
      if (view.reserveZone) view.reserveZone.textContent = p.dead || !match.rules.zone ? '' : `SURGE ${view.zone.textContent}`
      if (view.reserveGarbage) {
        view.reserveGarbage.hidden = p.dead || !incoming
        view.reserveGarbage.textContent = `+${incoming} basura`
      }
      view.lines.textContent = p.stats.lines+' líneas'
      view.sent.textContent = p.stats.sent+' enviadas'
    }
  }
}

export function heroArt(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const hue = ['#fe5272','#5aa9ff','#58e19b','#ba7aff']
  ctx.clearRect(0,0,w,h)
  const glow = ctx.createRadialGradient(348,220,10,348,220,300)
  glow.addColorStop(0,'#192b5b')
  glow.addColorStop(0.65,'#111931')
  glow.addColorStop(1,'#0e142200')
  ctx.fillStyle = glow
  ctx.fillRect(0,0,w,h)
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = i === 0 ? '#53648a64' : '#58678442'
    ctx.beginPath()
    ctx.ellipse(350,235,135+i*33,92+i*24,-0.33,0,Math.PI*2)
    ctx.stroke()
  }
  ctx.strokeStyle = '#6681a439'
  ctx.beginPath()
  ctx.moveTo(50,235);ctx.lineTo(650,235);ctx.moveTo(350,24);ctx.lineTo(350,450);ctx.stroke()
  const marks = [[82,172],[605,104],[138,345],[587,351],[245,58],[460,406],[648,216],[66,284],[440,45],[278,382]]
  for (const [x,y] of marks) {
    ctx.strokeStyle = '#8c9fce99'
    ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);ctx.stroke()
  }
  // Axonometric illustration based on the game's own four color groups.
  const unit = 33
  function cube(x: number,y: number,color: string) {
    const face = (points: number[][],fill: string, edge: string) => {
      ctx.beginPath()
      points.forEach(([a,b],i) => i ? ctx.lineTo(x+a*unit,y+b*unit) : ctx.moveTo(x+a*unit,y+b*unit))
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.stroke()
    }
    face([[-1,0],[0,.49],[0,1.48],[-1,.99]],color+'aa',color)
    face([[0,.49],[1,0],[1,.99],[0,1.48]],color+'66',color)
    face([[0,-.49],[1,0],[0,.49],[-1,0]],color+'ee','#ffffff75')
    face([[0,-.31],[.64,0],[0,.31],[-.64,0]],color+'3d','#ffffff40')
  }
  const formations = [
    {x:220,y:120,color:hue[0],cells:[[0,0],[1,0],[2,0],[1,1]]},
    {x:420,y:103,color:hue[1],cells:[[0,0],[1,0],[1,1],[1,2]]},
    {x:190,y:272,color:hue[2],cells:[[0,1],[1,1],[1,0],[2,0]]},
    {x:416,y:250,color:hue[3],cells:[[0,0],[0,1],[0,2],[1,2]]},
  ]
  for (const {x,y,color,cells} of formations) {
    ctx.shadowBlur = 18
    ctx.shadowColor = color+'60'
    for (const [a,b] of cells.slice().sort((a,b) => a[0]+a[1]-b[0]-b[1])) {
      cube(x+(a-b)*unit,y+(a+b)*unit*0.49,color)
    }
    ctx.shadowBlur = 0
  }
}
