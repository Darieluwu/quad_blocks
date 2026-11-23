import { artwork } from './assets'
import { CHARACTERS, type CharacterId } from './catalog'
import { characterVisuals as scenes, type CharacterVisual as Scene } from './visuals'
import './cinematics.css'
const DURATION = 1100

const electricity = `<svg class="cinematic-electricity" viewBox="0 0 320 440" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 132L56 155 49 183 127 204 105 219 159 242 218 218 207 196 276 163 320 100"/>
  <path d="M0 351L45 315 58 325 108 283 88 267 159 242 193 273 234 254 251 275 320 244"/>
  <path d="M61 0L92 67 77 95 121 136 109 161 159 242 147 292 167 319 154 381 189 440"/>
</svg>`
const beam = `<svg class="cinematic-beam" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
  <path class="beam-main" d="M0 42L32 27 55 46 80 29 111 42 140 15 169 39 195 25 219 43 244 34 264 51 286 29 320 36"/>
  <path class="beam-branch" d="M30 27L48 9 73 19M141 16L168 3 189 14M219 43L229 61 260 64M285 29L297 14 320 17"/>
</svg>`
const digitalGrid = `<svg class="cinematic-electricity" viewBox="0 0 320 440" preserveAspectRatio="none" aria-hidden="true">
  <path d="M4 95h92v58H4zM219 31h98v49h-98zM204 155h114v105H204zM12 273h105v65H12z"/>
  <path d="M10 110h78m-78 10h50m168-73h70M215 170h89v22h-89zM20 289h83M20 303h39"/>
</svg>`
const digitalBeam = `<svg class="cinematic-beam" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 27h40v-7h45v14h39v-13h54v12h39v-8h70v8h33M0 53h67v-6h84v11h51v-16h49v11h69"/>
  <path d="M13 31h66v9H13zM97 30h69v13H97zM192 25h73v18h-73zM275 29h36v14h-36z" fill="currentColor"/>
</svg>`
const particles = {electric:{aura:electricity,discharge:beam},digital:{aura:digitalGrid,discharge:digitalBeam}}

function place(node:HTMLElement,x:number,y:number,width:number,height:number) {
  Object.assign(node.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`})
}

export class ZoneCinematics {
  private readonly layer:HTMLElement
  private readonly receipts:{origin:HTMLElement;target:HTMLElement;tick:number}[] = []
  private active?:HTMLElement
  private life?:Animation
  private request = 0

  constructor(private arena:HTMLElement,characters:readonly CharacterId[]) {
    this.layer = document.createElement('div')
    this.layer.className = 'cinematic-layer'
    arena.append(this.layer)
    for (const id of new Set(characters)) if (scenes[id]) {
      const {zonePose,zoneBackground} = CHARACTERS[id].assets
      for (const key of [zonePose,zoneBackground]) {
        const url = artwork(key)
        if (url) new Image().src = url
      }
    }
  }

  private get enabled() {
    return this.layer.isConnected && !this.layer.closest('.reduced,.no-attack-animation') &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  delivered(origin:HTMLElement,target:HTMLElement,tick:number) {
    this.receipts.push({origin,target,tick})
    if (this.receipts.length>32) this.receipts.shift()
  }

  charge(id:CharacterId,origin:HTMLElement) {
    const scene = scenes[id]
    if (scene && this.enabled) this.edge(origin,scene,'charge',artwork(CHARACTERS[id].assets.zonePose))
  }

  accent(id:CharacterId) { return scenes[id]?.color }

  stop() {
    cancelAnimationFrame(this.request)
    this.request = 0
    this.life?.cancel()
    this.life = undefined
    this.active?.remove()
    this.active = undefined
  }

  finish(id:CharacterId,origin:HTMLElement,tick:number) {
    const scene = scenes[id]
    if (!scene || !this.enabled) return
    if (this.request || this.active) {
      requestAnimationFrame(()=>{
        if (!this.enabled || !origin.isConnected) return
        this.edge(origin,scene,'charge')
        const victim = this.receipts.findLast(receipt=>receipt.origin===origin && receipt.tick===tick)?.target
        if (victim?.isConnected && victim.dataset.featured!=='false') this.edge(victim,scene,'impact')
      })
      return
    }
    // Wait for the frame to publish the relay state and any real garbage delivery.
    this.request = requestAnimationFrame(()=>{
      this.request = 0
      if (!this.enabled || !origin.isConnected) return
      const receipt = this.receipts.findLast(receipt=>receipt.origin===origin && receipt.tick===tick)
      this.play(id,scene,origin,receipt?.target)
    })
  }

  private edge(player:HTMLElement,scene:Scene,kind:'charge'|'impact',pose?:string) {
    const edge = document.createElement('span')
    edge.className = `cinematic-edge cinematic-${kind} cinematic-${scene.theme}`
    edge.setAttribute('aria-hidden','true')
    edge.style.setProperty('--scene-color',scene.color)
    edge.innerHTML = '<i></i><i></i><i></i><i></i>'
    if (pose && scene.theme==='digital') edge.append(Object.assign(new Image(),{src:pose,alt:''}))
    player.append(edge)
    edge.addEventListener('animationend',event=>{
      if (event.target===edge) edge.remove()
    })
  }

  private play(id:CharacterId,scene:Scene,origin:HTMLElement,target:HTMLElement|undefined) {
    const {zonePose,zoneBackground} = CHARACTERS[id].assets
    const pose = artwork(zonePose)
    const background = artwork(zoneBackground)
    const team = origin.closest<HTMLElement>('.blitz-team')
    const clockwise = team ? team.dataset.side==='0' : !target || target.offsetLeft>origin.offsetLeft
    const arena = this.arena.getBoundingClientRect()
    const fields = [...this.arena.querySelectorAll<HTMLElement>('.blitz-stack .player[data-featured="true"]')]
    const [left,right] = fields.map(field=>{
      const teamLeft = field.closest('.blitz-team')!.getBoundingClientRect().left
      const left = teamLeft+field.offsetLeft
      return {left,right:left+field.offsetWidth}
    })
    const clock = this.arena.querySelector<HTMLElement>('.blitz-clock')
    const centre = left && right && right.left-left.right>=220
    const top = 8
    const centralHeight = Math.min(500,(clock && !clock.hidden ? arena.height/2-62 : arena.height*.56)-top)
    const central = !!centre && centralHeight>=265

    let box:{x:number;y:number;width:number;height:number}|undefined
    let sidePanels:HTMLElement[] = []
    const sideTop = () => Math.max(...sidePanels.map(panel=>panel.getBoundingClientRect().bottom))-arena.top+18
    if (central) {
      box = {x:left.right-arena.left+7,y:top,width:right.left-left.right-14,height:centralHeight}
    } else if (team && left && right && innerWidth>950) {
      sidePanels = [...team.querySelectorAll<HTMLElement>('.blitz-summary,.player[data-featured="false"]')]
      const y = sideTop()
      const width = Math.min(340,clockwise ? left.left-arena.left-22 : arena.right-right.right-22)
      const height = Math.min(480,arena.height-y-12)
      if (width>=180 && height>=250) box = {x:clockwise?left.left-arena.left-width-14:right.right-arena.left+14,y,width,height}
    }

    if (!box || !pose || !background) {
      if (origin.dataset.featured!=='false') this.edge(origin,scene,'charge')
      if (target && target.dataset.featured!=='false') this.edge(target,scene,'impact')
      return
    }

    const stage = document.createElement('div')
    const entry = scene.entry==='caster' ? clockwise : !clockwise
    stage.className = `cinematic-scene cinematic-${scene.theme}`
    stage.dataset.character = id
    stage.dataset.direction = clockwise ? 'right' : 'left'
    stage.dataset.layout = central ? 'center' : 'side'
    stage.dataset.delivery = String(!!target)
    stage.style.setProperty('--scene-color',scene.color)
    stage.style.setProperty('--scene-light',scene.light)
    stage.style.setProperty('--scene-entry',entry?'-1':'1')
    stage.style.setProperty('--scene-time',`${DURATION}ms`)
    const fx = particles[scene.theme]
    stage.innerHTML = `<img class="cinematic-background" src="${background}" alt="">
      <span class="cinematic-grid" aria-hidden="true"></span>${fx.aura}
      <img class="cinematic-pose" src="${pose}" alt="">
      <div class="cinematic-sparks" aria-hidden="true">${Array.from({length:14},(_,i)=>
        `<i style="--angle:${i*137.5}deg;--distance:${48+(i%5)*23}px;--delay:${i%4*19}ms"></i>`).join('')}</div>
      ${fx.discharge}<div class="cinematic-title"><small>${CHARACTERS[id].name} · ZONE</small>
      <strong>${scene.title.join('<br>')}</strong></div>`
    place(stage,box.x,box.y,box.width,box.height)
    this.layer.append(stage)
    this.active = stage

    const life = stage.animate([{opacity:0},{opacity:1,offset:.14},{opacity:1,offset:.83},{opacity:0}],
      {duration:DURATION,easing:'linear'})
    this.life = life
    const listener = new AbortController()
    // The staging coordinates belong to this viewport only.
    window.addEventListener('resize',()=>life.cancel(),{once:true,signal:listener.signal})
    let panels:ResizeObserver|undefined
    if (sidePanels.length) {
      const {x,width} = box
      panels = new ResizeObserver(()=>{
        const y = sideTop()
        const height = Math.min(480,arena.height-y-12)
        if (height<250) life.cancel()
        else place(stage,x,y,width,height)
      })
      for (const panel of sidePanels) panels.observe(panel,{box:'border-box'})
    }
    const impact = target ? window.setTimeout(()=>{
      if (this.active===stage && this.enabled && target.isConnected && target.dataset.featured!=='false' &&
          !target.classList.contains('dead')) this.edge(target,scene,'impact')
    },DURATION*.72) : undefined
    const cleanup = () => {
      clearTimeout(impact)
      listener.abort()
      panels?.disconnect()
      stage.remove()
      if (this.active!==stage) return
      this.active = undefined
      this.life = undefined
    }
    life.onfinish = life.oncancel = cleanup
  }
}
