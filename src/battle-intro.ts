import { HZ, SETTINGS } from './engine/rules'
import { CHARACTERS, type CharacterId } from './characters/catalog'
import { artwork } from './characters/assets'
import { escape } from './menu'
import type { Sound } from './audio'
import { reducedIntroTicks, type BattleIntroMode, type BattleIntroPreference } from './battle-intro-config'
import './battle-intro.css'

type Fighter = {slot:number; id:CharacterId; name:string; level?:number; team?:number; active?:boolean}
const TICK_MS = 1000/HZ
export const BATTLE_GO_MS = 560
const ENTRY = ['-38vw,0','38vw,0','0,-55vh','0,55vh']
const TITLES = {vs4:'FREE FOR ALL',teams:'VS',blitz:'2v2 BLITZ'}
const FRAMING: Record<CharacterId, readonly [number,number]> = {
  volt:[1.12,20],nix:[1.10,20],pix:[1.06,19],astra:[1.06,21],blaze:[1.04,17],pengu:[.89,30],
}

function fighterMarkup(fighter:Fighter,index:number,mode:BattleIntroMode,particles:number) {
  const {id,slot,level,team,active,name} = fighter
  const character = CHARACTERS[id]
  const [color,light] = character.colors
  const [scale,focus] = FRAMING[id]
  const master = artwork(character.assets.master)
  const portrait = artwork(character.assets.portraits.neutral)
  const role = active===undefined ? '' : active ? 'active' : 'reserve'
  const botLabel = level===undefined ? '' : `IA ${level}`
  const seatName = botLabel && name!==botLabel ? `${name} · ${botLabel}` : name
  const entry = mode==='vs4' ? ENTRY[index] : team===0 ? ENTRY[0] : ENTRY[1]
  const sparks = Array.from({length:particles},(_,i)=>
    `<i style="--x:${(i*37+13)%99}%;--y:${(i*19+17)%88}%;--spark:${2+i%4}px"></i>`).join('')
  return `<article class="intro-fighter" data-slot="${slot}" data-character="${id}" data-role="${role}"
    style="--color:${color};--light:${light};--art-scale:${scale};--focus:${focus}%;--entry:${entry}">
    <div class="intro-panel" aria-hidden="true"></div>
    <div class="intro-sparks" aria-hidden="true">${sparks}</div>
    <div class="intro-figure"><div class="intro-art">
      ${portrait ? `<img class="intro-fallback" src="${portrait}" alt="" decoding="async">` : ''}
      ${master ? `<img class="intro-master" src="${master}" alt="" decoding="async">` : ''}
    </div></div>
    <div class="intro-label"><div class="intro-seat">J${slot+1}<span>${escape(seatName)}</span></div>
      <strong>${character.name}</strong>
      ${role ? `<span class="intro-role">${active ? 'ACTIVO' : 'EN RESERVA'}</span>` : ''}
    </div>
  </article>`
}

export class BattleIntroSystem {
  private scene?: HTMLElement
  private animations: Animation[] = []
  private anchors: {figure:HTMLElement; target:HTMLElement}[] = []
  private viewport = ''
  private lastNumber = Infinity
  private goUntil = 0
  private motion = matchMedia('(prefers-reduced-motion: reduce)')
  private quiet: boolean
  private duration: number

  constructor(private audio:Sound, private presentation:number, mode:BattleIntroMode|null, fighters:readonly Fighter[],
    preference:BattleIntroPreference, reducedEffects:boolean, root:HTMLElement, arena:HTMLElement,
    showPresentation:boolean) {
    this.quiet = reducedEffects || this.motion.matches
    const simplified = preference==='reduced' || this.quiet
    this.duration = (simplified && mode ? Math.min(presentation,reducedIntroTicks(mode)) : presentation)*TICK_MS
    if (!mode || !presentation || !showPresentation || preference==='off') return
    const scene = document.createElement('section')
    scene.className = 'battle-intro'
    scene.dataset.mode = mode
    scene.dataset.quiet = String(this.quiet)
    scene.dataset.simplified = String(simplified)
    scene.style.setProperty('--intro-duration',`${this.duration}ms`)
    scene.setAttribute('aria-label',TITLES[mode])
    const particles = this.quiet ? 0 : simplified ? 4 : 12
    const fighter = (entry:Fighter,index:number) => fighterMarkup(entry,index,mode,particles)
    const team = (side:number) => {
      const members = fighters.filter(entry=>entry.team===side)
        .sort((a,b)=>Number(Boolean(a.active))-Number(Boolean(b.active)))
      if (side===1 && mode==='blitz') members.reverse()
      return `<section class="intro-team" data-team="${side}" aria-label="Equipo ${side===0 ? 'A' : 'B'}">
        <h2>EQUIPO ${side===0 ? 'A' : 'B'}</h2>${members.map(fighter).join('')}
        ${mode==='blitz' ? '<div class="intro-relay" aria-hidden="true"><i></i><i></i></div>' : ''}
      </section>`
    }
    scene.innerHTML = `<div class="intro-backplate"></div>
      <div class="intro-lineup">${mode==='vs4' ? fighters.map(fighter).join('') : team(0)+team(1)}</div>
      <div class="intro-impact" aria-hidden="true"></div>
      <div class="intro-title"><h1>${TITLES[mode]}</h1>${mode==='blitz' ? '<span>TAG TEAM BATTLE</span>' : mode==='teams' ? '<span>TEAM BATTLE</span>' : ''}</div>
      ${mode==='blitz' ? '<div class="intro-title intro-versus" aria-hidden="true">VS</div>' : ''}`
    for (const image of scene.querySelectorAll<HTMLImageElement>('.intro-master')) {
      const ready = () => {
        if (image.naturalWidth) image.parentElement?.classList.add('master-ready')
      }
      if (image.complete) ready()
      else image.addEventListener('load',ready,{once:true})
      image.addEventListener('error',()=>image.remove(),{once:true})
    }
    root.append(scene)
    this.scene = scene
    for (const entry of fighters) {
      const figure = scene.querySelector<HTMLElement>(`[data-slot="${entry.slot}"] .intro-figure`)
      const destination = mode==='blitz' && entry.active ? '.well' : '.hud-portrait'
      const target = arena.querySelector<HTMLElement>(`[data-player="${entry.slot}"] ${destination}`)
      if (figure && target) this.anchors.push({figure,target})
    }
    this.animations = scene.getAnimations({subtree:true})
    for (const animation of this.animations) animation.pause()
    this.draw(presentation+SETTINGS.countdown)
    audio.playEffect('battle-start',.86)
  }

  draw(left:number, paused = false) {
    if (paused) this.goUntil = 0
    const scene = this.scene
    if (!scene) return
    scene.style.visibility = paused ? 'hidden' : ''
    if (paused) return
    const time = (this.presentation+SETTINGS.countdown-left)*TICK_MS
    if (time>=this.duration) { this.dispose(); return }
    const viewport = `${innerWidth}:${innerHeight}`
    if (this.viewport!==viewport) {
      this.viewport = viewport
      scene.style.setProperty('--intro-top',`${scene.parentElement?.querySelector('.game-bar')?.getBoundingClientRect().bottom ?? 0}px`)
      for (const {figure,target} of this.anchors) {
        const from = figure.getBoundingClientRect()
        const to = target.getBoundingClientRect()
        figure.style.setProperty('--travel-x',`${to.x+(to.width-from.width)/2-from.x}px`)
        figure.style.setProperty('--travel-y',`${to.y+(to.height-from.height)/2-from.y}px`)
        figure.style.setProperty('--travel-scale',String(Math.min(.75,to.height/from.height)))
      }
    }
    for (const animation of this.animations) animation.currentTime = Math.max(0,time)
  }

  announce(number:number) {
    if (number>=this.lastNumber) return
    this.lastNumber = number
    if (number>0) this.audio.playEffect('countdown-tick',.72)
    else {
      this.goUntil = performance.now()+BATTLE_GO_MS
      this.audio.playEffect('battle-go',.9)
    }
  }

  get go() { return performance.now()<this.goUntil }
  get reduced() { return this.quiet || this.motion.matches }
  dispose() {
    if (!this.scene) return
    for (const animation of this.animations) animation.cancel()
    this.scene?.remove()
    this.scene = undefined
    this.animations = []
    this.anchors = []
  }
}
