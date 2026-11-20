import { SHAPES, landing } from './engine/pieces'
import type { Cell } from './engine/pieces'
import { HIDDEN, VISIBLE, WIDTH, HZ, SETTINGS } from './engine/rules'
import type { Player } from './engine/player'
import type { Match } from './engine/match'
import type { Slot } from './input'

export const COLORS = ['#ff5266','#59aaff','#58e39a','#be86fa']
const PIECES: Record<Exclude<Cell,null>,string> = {
  I:'#45d8ec',J:'#5783fc',L:'#ffad51',O:'#f5dc58',S:'#57da91',T:'#b27cfa',Z:'#f75d73',G:'#76869b',
}
const WORDS: Record<string,string> = {
  single:'SINGLE',double:'DOUBLE',triple:'TRIPLE',quad:'TETRIS',mini:'T-SPIN MINI',tZero:'T-SPIN',
  tSingle:'T-SPIN SINGLE',tDouble:'T-SPIN DOUBLE',tTriple:'T-SPIN TRIPLE',
  spinL:'L-SPIN',spinJ:'J-SPIN',spinS:'S-SPIN',spinZ:'Z-SPIN',backToBack:'BACK-TO-BACK',
  perfect:'PERFECT CLEAR',zoneStart:'ZONE ACTIVADA',zoneEnd:'ZONE COMPLETADA',
}
const PRIORITY: Record<string,number> = {perfect:5,zoneStart:6,zoneEnd:6,backToBack:1}
const CELL = 26
const by = <E extends HTMLElement>(root: ParentNode, selector: string) => root.querySelector<E>(selector)!

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

function preview(canvas: HTMLCanvasElement, kinds: Cell[]) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0,0,canvas.width,canvas.height)
  const size = 12
  for (const [i,kind] of kinds.entries()) {
    if (!kind || kind === 'G') continue
    const shape = SHAPES[kind][0]
    const left = Math.min(...shape.map(([x]) => x))
    const right = Math.max(...shape.map(([x]) => x))
    const offset = (canvas.width - (right-left+1)*size)/2
    for (const [x,y] of shape) square(ctx,offset+(x-left)*size,8+i*36+y*size,size,PIECES[kind])
  }
}

export function mountArena(root: HTMLElement) {
  root.innerHTML = '<div class="arena-grid">'+COLORS.map((color,i) => `
    <article class="player" data-player="${i}" style="--player:${color}">
      <header class="player-head"><span class="player-tag">J${i+1}</span><h2></h2><span class="danger-label"></span></header>
      <div class="player-body">
        <div class="rail"><span>HOLD</span><canvas class="hold" width="58" height="38"></canvas><div class="garbage" aria-label="Basura pendiente"><div></div></div><strong class="incoming">0</strong></div>
        <div class="well"><canvas width="${WIDTH*CELL}" height="${VISIBLE*CELL}" class="board" aria-label="Tablero del jugador ${i+1}"></canvas><div class="out">ELIMINADO</div></div>
        <div class="rail"><span>NEXT</span><canvas class="next" width="58" height="180"></canvas><span class="target-label">OBJ.</span><strong class="target"></strong></div>
      </div>
      <div class="zone-label"><span>ZONE</span><strong></strong></div><div class="meter"><div></div></div>
      <div class="player-stats"><span class="lines"></span><span class="sent"></span></div>
      <div class="effect"></div>
    </article>`).join('')+'</div>'
  return new Arena(root)
}

class Arena {
  private views
  constructor(root: HTMLElement) {
    this.views = [...root.querySelectorAll<HTMLElement>('.player')].map(node => {
      const canvas = by<HTMLCanvasElement>(node,'.board')
      const ctx = canvas.getContext('2d',{alpha:false})!
      const grid = document.createElement('canvas')
      grid.width = canvas.width
      grid.height = canvas.height
      const bg = grid.getContext('2d')!
      bg.fillStyle = '#0d121d'
      bg.fillRect(0,0,grid.width,grid.height)
      bg.strokeStyle = '#1c2637'
      bg.beginPath()
      for (let x = 1; x < WIDTH; x++) { bg.moveTo(x*CELL+0.5,0); bg.lineTo(x*CELL+0.5,grid.height) }
      for (let y = 1; y < VISIBLE; y++) { bg.moveTo(0,y*CELL+0.5); bg.lineTo(grid.width,y*CELL+0.5) }
      bg.stroke()
      const stack = document.createElement('canvas')
      stack.width = grid.width
      stack.height = grid.height
      return {node,ctx,grid,stack,stackCtx:stack.getContext('2d')!,revision:-1,signature:'',
        hold:by<HTMLCanvasElement>(node,'.hold'),next:by<HTMLCanvasElement>(node,'.next'),
        heading:by(node,'h2'),warning:by(node,'.danger-label'),target:by(node,'.target'),
        incoming:by(node,'.incoming'),garbage:by(node,'.garbage div'),meter:by(node,'.meter div'),
        zone:by(node,'.zone-label strong'),lines:by(node,'.lines'),sent:by(node,'.sent'),effect:by(node,'.effect'),
        flashUntil:0, priority:0, position:'', hud:''}
    })
  }

  note(i: number, type: string, detail: string|undefined, now: number) {
    if (!WORDS[type]) return
    const view = this.views[i]
    const priority = PRIORITY[type] ?? 2
    if (now < view.flashUntil && priority < view.priority) return
    view.priority = priority
    view.flashUntil = now+SETTINGS.effectTicks
    view.effect.textContent = type === 'zoneEnd' ? WORDS[type]+' · '+detail+' L' : WORDS[type]
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
      for (let y = 0; y < VISIBLE; y++) for (let x = 0; x < WIDTH; x++) {
        const kind = p.board[y+HIDDEN][x]
        if (kind) square(view.stackCtx,x*CELL,y*CELL,CELL,PIECES[kind])
      }
    }
    view.ctx.drawImage(view.stack,0,0)
    if (p.dead) return
    const drop = landing(p.board,piece)
    for (const [x,y] of SHAPES[piece.kind][piece.rotation]) {
      const px = (piece.x+x)*CELL
      const py = (piece.y+y-HIDDEN)*CELL
      if (drop) square(view.ctx,px,py+drop*CELL,CELL,PIECES[piece.kind],true)
      square(view.ctx,px,py,CELL,PIECES[piece.kind])
    }
  }

  draw(match: Match, slots: Slot[]) {
    for (const [i,p] of match.players.entries()) {
      const view = this.views[i]
      this.field(view,p)
      const signature = [p.hold,...p.next].join(',')
      if (view.signature !== signature) {
        view.signature = signature
        preview(view.hold,[p.hold])
        preview(view.next,p.next)
      }
      if (view.effect.textContent && match.now >= view.flashUntil) view.effect.textContent = ''
      const target = match.targets[i]
      const incoming = p.garbage.total
      const zoneProgress = p.zone.active ? p.zone.remaining/p.zone.duration*100 : p.zone.energy
      const hud = [p.dead,p.danger,p.zone.active,zoneProgress,p.zone.lines,target,incoming,p.stats.lines,p.stats.sent,slots[i].name].join('|')
      if (view.hud === hud) continue
      view.hud = hud
      view.heading.textContent = slots[i].name
      view.node.classList.toggle('dead',p.dead)
      view.node.classList.toggle('zoned',p.zone.active && !p.dead)
      view.node.dataset.danger = String(p.dead ? 0 : p.danger)
      view.warning.textContent = p.dead ? '' : p.danger === 2 ? 'CRÍTICO' : p.danger ? 'PELIGRO' : ''
      view.target.textContent = target < 0 ? '—' : 'J'+(target+1)
      view.target.style.color = COLORS[target] ?? ''
      view.target.title = slots[target]?.name ?? ''
      view.incoming.textContent = String(incoming)
      view.garbage.style.height = Math.min(100,incoming*7)+'%'
      view.meter.style.width = zoneProgress+'%'
      view.zone.textContent = p.zone.active ? `${p.zone.lines} L · ${(p.zone.remaining/HZ).toFixed(1)} s` :
        match.rules.zone ? Math.round(p.zone.energy)+'%' : 'Desactivada'
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
