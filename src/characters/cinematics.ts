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
const frostCrystals = `<svg class="cinematic-electricity" viewBox="0 0 320 440" preserveAspectRatio="none" aria-hidden="true">
  <g><path d="M16 86l27-47 9 34-19 42zM243 34l27 9 15 78-34-33zM17 299l45-39-7 44-39 34zM271 231l29-39 5 45-28 38z"/>
  <path d="M43 39l-10 76m237-72 15 78M62 260l-46 78m284-146-23 83"/></g>
</svg>`
const frostBurst = `<svg class="cinematic-beam" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 35L55 34 96 21 186 28 213 15 269 22 320 36 259 49 212 46 154 56 84 43z"/>
  <path d="M1 36h313M92 36l68-31m28 31 66 27M235 36l39-31M41 36l65 28" class="beam-branch"/>
</svg>`
const cosmicOrbit = `<svg class="cinematic-electricity cinematic-orbits" viewBox="0 0 320 440" preserveAspectRatio="none" aria-hidden="true">
  <g transform="translate(168 180)">
    <ellipse rx="143" ry="49" transform="rotate(-31)"/>
    <ellipse rx="117" ry="31" transform="rotate(24)"/>
    <path d="M-105-79v13m-6-6.5h12M126 41v14m-7-7h14M-128 64v12m-6-6h12M30-100v18m-9-9h18"/>
  </g>
</svg>`
const cosmicWave = `<svg class="cinematic-beam" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 36Q130 4 320 36Q146 70 0 36Z"/>
  <path class="beam-branch" d="M0 36Q155 23 320 36M8 34Q150 50 310 35M128 15Q152 36 128 57M198 10Q227 36 198 62M261 6Q301 36 261 66"/>
</svg>`
const combustion = `<svg class="cinematic-electricity cinematic-flames" viewBox="0 0 320 440" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 323Q65 270 37 193Q89 223 84 314Q119 285 113 248Q161 289 130 375L0 399zM320 182Q256 246 279 283Q244 273 242 221Q204 272 220 316Q186 295 169 255Q149 356 320 385z"/>
</svg>`
const flameWave = `<svg class="cinematic-beam" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 44Q56 26 80 39Q120 17 104 8Q154 29 175 29Q202 10 210 4Q208 23 232 25L320 33Q291 52 256 50Q215 54 175 58Q121 42 138 65Q68 61 0 44z"/>
  <path class="beam-branch" d="M0 44Q106 33 176 44T319 33"/>
</svg>`
const lunarSeal = `<svg class="cinematic-electricity cinematic-moon" viewBox="0 0 320 440" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <path class="moon-crescent" d="M239 71A102 102 0 1 0 241 210 88 88 0 0 1 239 71Z"/>
  <g class="moon-seal"><circle cx="160" cy="230" r="137"/><circle cx="160" cy="230" r="115"/>
    <path d="M160 102 270 292 50 292ZM160 358 50 168 270 168Z"/></g>
</svg>`
const lunarWave = `<svg class="cinematic-beam" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
  <path d="M2 43Q125 3 318 35M2 48Q153 19 317 43M2 54Q161 39 291 51"/>
  <path class="moon-crescent" d="M117 15a16 16 0 1 0 17 18 13 13 0 0 1-17-18ZM222 4a20 20 0 1 0 21 22 17 17 0 0 1-21-22Z"/>
  <path d="M162 10v16m-8-8h16m94 29v16m-8-8h16m18-39v12m-6-6h12"/>
</svg>`
const particles = {
  electric:{aura:electricity,discharge:beam},
  digital:{aura:digitalGrid,discharge:digitalBeam},
  frost:{aura:frostCrystals,discharge:frostBurst},
  cosmic:{aura:cosmicOrbit,discharge:cosmicWave},
  fire:{aura:combustion,discharge:flameWave},
  lunar:{aura:lunarSeal,discharge:lunarWave},
}

function place(node:HTMLElement,x:number,y:number,width:number,height:number) {
  Object.assign(node.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`})
}

export class ZoneCinematics {
  private readonly layer:HTMLElement
  private readonly receipts:{origin:HTMLElement;target:HTMLElement;tick:number}[] = []
  private readonly active = new Map<0|1,HTMLElement>()
  private readonly life = new Map<0|1,Animation>()
  private readonly requests = new Map<0|1,number>()
  private activeVS4 = new Map<HTMLElement,HTMLElement>()
  private lifeVS4 = new Map<HTMLElement,Animation>()
  private requestsVS4 = new Map<HTMLElement,number>()

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
    for (const request of this.requests.values()) cancelAnimationFrame(request)
    this.requests.clear()
    for (const life of this.life.values()) life.cancel()
    this.life.clear()
    for (const stage of this.active.values()) stage.remove()
    this.active.clear()
    for (const request of this.requestsVS4.values()) cancelAnimationFrame(request)
    this.requestsVS4.clear()
    for (const life of this.lifeVS4.values()) life.cancel()
    this.lifeVS4.clear()
    for (const stage of this.activeVS4.values()) stage.remove()
    this.activeVS4.clear()
  }

  finish(id:CharacterId,origin:HTMLElement,tick:number) {
    const scene = scenes[id]
    if (!scene || !this.enabled) return
    const teamNode = origin.closest<HTMLElement>('.blitz-team')
    const team = teamNode?.dataset.side === '0' ? 0 : teamNode?.dataset.side === '1' ? 1 : undefined
    if (team!==undefined && (this.requests.has(team) || this.active.has(team))) {
      requestAnimationFrame(()=>{
        if (!this.enabled || !origin.isConnected) return
        this.edge(origin,scene,'charge')
        const victim = this.receipts.findLast(receipt=>receipt.origin===origin && receipt.tick===tick)?.target
        if (victim?.isConnected && victim.dataset.featured!=='false') this.edge(victim,scene,'impact')
      })
      return
    }
    // Wait for the frame to publish the relay state and any real garbage delivery.
    if (team!==undefined) {
      const request=requestAnimationFrame(()=>{
        this.requests.delete(team)
        if (!this.enabled || !origin.isConnected) return
        const receipt = this.receipts.findLast(receipt=>receipt.origin===origin && receipt.tick===tick)
        this.play(id,scene,origin,receipt?.target,team)
      })
      this.requests.set(team,request)
      return
    }
    if (this.requestsVS4.has(origin) || this.activeVS4.has(origin)) {
      requestAnimationFrame(()=>{
        if (!this.enabled || !origin.isConnected) return
        this.edge(origin,scene,'charge')
      })
      return
    }
    const request=requestAnimationFrame(()=>{
      this.requestsVS4.delete(origin)
      if (!this.enabled || !origin.isConnected) return
      const receipt = this.receipts.findLast(receipt=>receipt.origin===origin && receipt.tick===tick)
      this.play(id,scene,origin,receipt?.target)
    })
    this.requestsVS4.set(origin,request)
  }

  private edge(player:HTMLElement,scene:Scene,kind:'charge'|'impact',pose?:string) {
    const edge = document.createElement('span')
    edge.className = `cinematic-edge cinematic-${kind} cinematic-${scene.theme}`
    edge.setAttribute('aria-hidden','true')
    edge.style.setProperty('--scene-color',scene.color)
    edge.innerHTML = '<i></i><i></i><i></i><i></i>'
    if (pose && scene.theme!=='electric') edge.append(Object.assign(new Image(),{src:pose,alt:''}))
    player.append(edge)
    edge.addEventListener('animationend',event=>{
      if (event.target===edge) edge.remove()
    })
  }

  private play(id:CharacterId,scene:Scene,origin:HTMLElement,target:HTMLElement|undefined,team?:0|1) {
    const {zonePose,zoneBackground} = CHARACTERS[id].assets
    const pose = artwork(zonePose) ?? artwork(CHARACTERS[id].assets.portraits.neutral) ?? artwork(CHARACTERS[id].assets.master)
    const background = artwork(zoneBackground) ?? artwork(CHARACTERS[id].assets.portraits.zone)
    const teamNode = origin.closest<HTMLElement>('.blitz-team')
    const clockwise = teamNode ? teamNode.dataset.side==='0' : !target || target.offsetLeft>origin.offsetLeft
    const arena = this.arena.getBoundingClientRect()
    const fields = [...this.arena.querySelectorAll<HTMLElement>('.blitz-stack .player[data-featured="true"]')]
    const [left,right] = fields.map(field=>{
      const teamLeft = field.closest('.blitz-team')!.getBoundingClientRect().left
      const left = teamLeft+field.offsetLeft
      return {left,right:left+field.offsetWidth}
    })
    const clock = this.arena.querySelector<HTMLElement>('.blitz-clock')
    const clockBox = clock && !clock.hidden && !clock.dataset.transition ? clock.getBoundingClientRect() : undefined
    const split = arena.height/2
    const central = team!==undefined && !!left && !!right && right.left-left.right>=220 && innerWidth>=1600

    let box:{x:number;y:number;width:number;height:number}|undefined
    let sidePanels:HTMLElement[] = []
    let stageLayout:'vs4'|'center'|'side' = 'side'
    const sideTop = () => Math.max(team===1?split+8:8,
      Math.max(...sidePanels.map(panel=>panel.getBoundingClientRect().bottom))-arena.top+18)
    const sideHeight = (y:number)=>Math.min(480,(team===0?split:arena.height)-y-12)
    if (team===undefined) {
      const boardOrigin=origin.closest<HTMLElement>('.player')
      if (boardOrigin) {
        const banner=boardOrigin.querySelector<HTMLElement>('.player-banner')?.getBoundingClientRect()
        const board=boardOrigin.getBoundingClientRect()
        const players=[...this.arena.querySelectorAll<HTMLElement>('.arena-grid .player')]
        const fixedWidth=players.length ? Math.max(180,Math.min(...players.map(player=>player.getBoundingClientRect().width))*1.08) : 260
        const fixedHeight=Math.min(240,Math.max(150,arena.height*.26))
        const lunarHeader = scene.theme==='lunar' && banner
        const width=lunarHeader ? Math.min(board.width-16,fixedWidth) : fixedWidth
        const height=lunarHeader ? banner.height : fixedHeight
        const x=board.left-arena.left+(board.width-width)/2
        const y=(lunarHeader ? banner.top : (banner?.bottom ?? board.top)+8)-arena.top
        box={x,y,width,height}
        stageLayout='vs4'
      }
    } else if (central) {
      const margin=8
      const clockReserve=clockBox ? Math.ceil(Math.max(clockBox.width,clockBox.height)+24) : 118
      const slotHeight=(arena.height-margin*2-clockReserve)/2
      if (slotHeight>=150) box = {
        x:left.right-arena.left+7,
        y:team===0 ? margin : margin+slotHeight+clockReserve,
        width:right.left-left.right-14,
        height:slotHeight,
      }
    } else if (teamNode && left && right && innerWidth>950) {
      sidePanels = [...teamNode.querySelectorAll<HTMLElement>('.blitz-summary,.player[data-featured="false"]')]
      const y = sideTop()
      const width = Math.min(340,clockwise ? left.left-arena.left-22 : arena.right-right.right-22)
      const height = sideHeight(y)
      if (width>=180 && height>=150) box = {x:clockwise?left.left-arena.left-width-14:right.right-arena.left+14,y,width,height}
    }

    if (!box) {
      if (origin.dataset.featured!=='false') this.edge(origin,scene,'charge')
      if (target && target.dataset.featured!=='false') this.edge(target,scene,'impact')
      return
    }

    const stage = document.createElement('div')
    const entry = scene.entry==='caster' ? clockwise : !clockwise
    stage.className = `cinematic-scene cinematic-${scene.theme}`
    stage.dataset.character = id
    stage.dataset.direction = clockwise ? 'right' : 'left'
    stage.dataset.layout = stageLayout==='vs4' ? 'vs4' : central ? 'center' : 'side'
    if (team!==undefined) stage.dataset.channel=team===0?'team-a':'team-b'
    stage.dataset.delivery = String(!!target)
    stage.style.setProperty('--scene-color',scene.color)
    stage.style.setProperty('--scene-light',scene.light)
    stage.style.setProperty('--scene-entry',entry?'-1':'1')
    stage.style.setProperty('--scene-time',`${DURATION}ms`)
    const fx = particles[scene.theme]
    stage.innerHTML = `${background?`<img class="cinematic-background" src="${background}" alt="">`:``}
      <span class="cinematic-grid" aria-hidden="true"></span>${fx.aura}
      ${pose?`<img class="cinematic-pose" src="${pose}" alt="">`:``}
      <div class="cinematic-sparks" aria-hidden="true">${Array.from({length:14},(_,i)=>
        `<i style="--angle:${i*137.5}deg;--distance:${48+(i%5)*23}px;--delay:${i%4*19}ms"></i>`).join('')}</div>
      ${fx.discharge}<div class="cinematic-title"><small>${CHARACTERS[id].name} · SURGE</small>
      <strong>${scene.title.join('<br>')}</strong></div>`
    place(stage,box.x,box.y,box.width,box.height)
    this.layer.append(stage)
    if (team!==undefined) this.active.set(team,stage)
    else if (stageLayout==='vs4') this.activeVS4.set(origin,stage)

    const life = stage.animate([{opacity:0},{opacity:1,offset:.14},{opacity:1,offset:.83},{opacity:0}],
      {duration:DURATION,easing:'linear'})
    if (team!==undefined) this.life.set(team,life)
    else if (stageLayout==='vs4') this.lifeVS4.set(origin,life)
    const listener = new AbortController()
    // The staging coordinates belong to this viewport only.
    window.addEventListener('resize',()=>life.cancel(),{once:true,signal:listener.signal})
    let panels:ResizeObserver|undefined
    if (sidePanels.length) {
      const {x,width} = box
      panels = new ResizeObserver(()=>{
        const y = sideTop()
        const height = sideHeight(y)
        if (height<150) life.cancel()
        else place(stage,x,y,width,height)
      })
      for (const panel of sidePanels) panels.observe(panel,{box:'border-box'})
    }
    const impact = target ? window.setTimeout(()=>{
      if (this.enabled && target.isConnected && target.dataset.featured!=='false' &&
          !target.classList.contains('dead')) this.edge(target,scene,'impact')
    },DURATION*.72) : undefined
    const cleanup = () => {
      clearTimeout(impact)
      listener.abort()
      panels?.disconnect()
      stage.remove()
      if (team!==undefined) {
        if (this.active.get(team)===stage) this.active.delete(team)
        if (this.life.get(team)===life) this.life.delete(team)
      } else {
        if (this.activeVS4.get(origin)===stage) this.activeVS4.delete(origin)
        if (this.lifeVS4.get(origin)===life) this.lifeVS4.delete(origin)
      }
    }
    life.onfinish = life.oncancel = cleanup
  }
}
