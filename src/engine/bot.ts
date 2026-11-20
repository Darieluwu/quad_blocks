import { fits, landing, rotate, SHAPES, spawnPiece, type Piece } from './pieces'
import { NO_INPUT, type Action, type Input, type Player } from './player'
import { KINDS, randomFrom, seedOf, type Kind } from './random'
import { HEIGHT, HIDDEN, VISIBLE, WIDTH } from './rules'
import { detectSpin, scoreClear, type Rotation } from './scoring'

export const BOT_LEVELS = [
  'Principiante','Novato','Aprendiz','Intermedio','Competente','Avanzado','Experto','Élite','Maestro','Ultra experto',
]
export const botLevel = (value: number) => Number.isFinite(value) ? Math.max(1,Math.min(10,Math.round(value))) : 5
export type BlitzTactics = {allyGarbage:number; allyDead:boolean; stance:'attack'|'defense';
  canProtect:boolean; turnLeft:number; warn:number; rescue:0|1|2; rescueRemaining:number; zoneRescueRoom:number}
const CADENCE = [10,9,8,7,6,5,4,3,2,1]
const RECOVERY = [60,47,38,28,21,15,10,7,4,2]
const IMPRECISION = [20,14,10,7,4,2,1,0.5,0,0]
const FULL = (1 << WIDTH) - 1
const SHIFTS = [[-1,'left'],[1,'right']] as const
const TURNS = [[1,'cw'],[-1,'ccw'],[2,'half']] as const
const inputFor = (action: Action): Input => ({held:NO_INPUT.held,pressed:[action]})

type Step = {action: Action; x: number; rotation: number; until?: number}
type Node = {piece: Piece; steps: Step[]; rotation: Rotation|null}
type Candidate = {rows:number[]; steps:Step[]; next:Kind[]; value:number; banked:number; qualifies:boolean}
type Placement = {masks:number[]; bottom:number}

function cleared(result: number[], banked: number, zoned: boolean) {
  const playable = banked ? result.slice(0,-banked) : result
  if (!playable.includes(FULL)) return {rows:result,lines:0,banked}
  const remaining = playable.filter(row => row !== FULL)
  const lines = playable.length-remaining.length
  if (zoned) return {rows:remaining.concat(Array<number>(banked+lines).fill(FULL)),lines,banked:banked+lines}
  return {rows:Array<number>(lines).fill(0).concat(remaining),lines,banked:0}
}

function projection(rows: readonly number[], piece: Piece, banked: number, zoned: boolean) {
  const result = rows.slice()
  for (const [x,y] of SHAPES[piece.kind][piece.rotation]) result[piece.y+y] |= 1 << (piece.x+x)
  return cleared(result,banked,zoned)
}

function fieldValue(rows: readonly number[], well: boolean, banked = 0) {
  const top = rows.findIndex(Boolean)
  if (top < 0 || top>=HEIGHT-banked) return -(Math.max(0,banked-11)**2)
  let seen = 0
  let height = 0
  let holes = 0
  const heights = Array<number>(WIDTH).fill(0)
  for (let y=top; y<HEIGHT-banked; y++) {
    const row = rows[y]
    let newColumns = row & ~seen
    while (newColumns) {
      const bit = newColumns & -newColumns
      heights[31-Math.clz32(bit)] = HEIGHT-banked-y
      height += HEIGHT-banked-y
      newColumns ^= bit
    }
    seen |= row
    let gaps = seen & ~row
    while (gaps) { holes++; gaps &= gaps-1 }
  }
  let roughness = 0
  for (let x=1;x<WIDTH;x++) {
    const difference = Math.abs(heights[x]-heights[x-1])
    roughness += x===WIDTH-1 && well && heights[x]<heights[x-1] ? difference*0.18 : difference
  }
  const peak = HEIGHT-top
  return -height*0.52 - holes*5.6 - roughness*0.67 - peak*0.42 - Math.max(0,peak-11)**2*1.4
}

const placementsFor = new Map<Kind,Placement[]>(KINDS.map(kind => [kind,
  SHAPES[kind].slice(0,kind==='O' ? 1 : 4).flatMap(shape=>{
    const min = Math.min(...shape.map(([x])=>x))
    const max = Math.max(...shape.map(([x])=>x))
    const bottom = Math.max(...shape.map(([,y])=>y))
    return Array.from({length:WIDTH-max+min},(_,column)=>{
      const masks = Array<number>(bottom+1).fill(0)
      for (const [dx,dy] of shape) masks[dy] |= 1 << (column-min+dx)
      return {masks,bottom}
    })
  }),
]))

function fitsMasks(rows: readonly number[], masks: number[], y: number) {
  for (let dy=0;dy<masks.length;dy++) {
    if (masks[dy] && (y+dy<0 || y+dy>=HEIGHT || (rows[y+dy] & masks[dy]))) return false
  }
  return true
}

function future(rows: number[], kind: Kind, well: boolean, breadth: number, banked: number, zoned: boolean,
  seekTetris = false) {
  const places: {rows: number[]; value: number; banked:number}[] = []
  const spawn = spawnPiece(kind,banked)
  if (SHAPES[kind][0].some(([dx,dy])=>spawn.y+dy<0 || (rows[spawn.y+dy] & 1 << (spawn.x+dx)))) return places
  for (const {masks,bottom} of placementsFor.get(kind)!) {
    let y = spawn.y
    if (!fitsMasks(rows,masks,y)) continue
    while (y+bottom+1<HEIGHT && fitsMasks(rows,masks,y+1)) y++
    const after = rows.slice()
    for (let dy=0;dy<masks.length;dy++) if (masks[dy]) after[y+dy] |= masks[dy]
    const result = cleared(after,banked,zoned)
    const value = fieldValue(result.rows,well,result.banked)+result.lines*(zoned ? 5 : 2.1)+
      (result.lines===4 ? seekTetris ? 23 : 6 : 0)
    if (places.length<breadth || value>places[breadth-1].value) {
      places.push({rows:result.rows,value,banked:result.banked})
      places.sort((a,b)=>b.value-a.value)
      if (places.length>breadth) places.pop()
    }
  }
  return places
}

export class Bot {
  readonly level: number
  private random: () => number
  private plan: Step[] = []
  private locks = 0
  private inZone = false
  private rescueStage = 0
  private actAt: number

  constructor(level: number, seed: string, stagger = 0) {
    this.level = botLevel(level)
    this.random = randomFrom(seedOf(seed))
    this.actAt = stagger+RECOVERY[this.level-1]
  }

  private search(player: Player, piece: Piece, held: boolean, into: Candidate[], tactics?: BlitzTactics) {
    const board = player.board
    if (!fits(board,piece)) return
    const level = this.level
    const zoned = player.zone.active
    const extra = level >= 7 && player.rules.lock >= 70
    const well = level >= 5 && !player.zone.active
    const sweep = player.rules.das===0 && player.rules.arr===0
    const initial = held ? [{action:'hold' as const,x:player.active.x,rotation:player.active.rotation}] : []
    const next = held && !player.hold ? player.next.slice(1) : player.next
    const queue: Node[] = [{piece,steps:initial,rotation:held ? null : player.lastRotation}]
    const visited = new Set<string>()
    const rows = board.map(row=>row.reduce((bits,cell,x)=>cell ? bits | 1 << x : bits,0))
    const placements = new Map<string,Candidate>()
    const push = (node: Node, piece: Piece, action: Action, rotation: Rotation|null = null, until?: number) => {
      queue.push({piece,steps:[...node.steps,{action,x:node.piece.x,rotation:node.piece.rotation,until}],rotation})
    }
    const limit = extra ? 185 : 44
    for (let cursor=0;cursor<queue.length && visited.size<limit;cursor++) {
      const node = queue[cursor]
      const {piece:p} = node
      const distance = landing(board,p)
      const spin = !distance && detectSpin(board,p,node.rotation)
      const key = `${p.x},${p.y},${p.rotation},${spin || ''}`
      if (visited.has(key)) continue
      visited.add(key)
      const dropped = {...p,y:p.y+distance}
      const id = `${dropped.x},${dropped.y},${p.rotation},${spin || ''}`
      if (!placements.has(id)) {
        const {rows:after,lines,banked} = projection(rows,dropped,zoned ? player.zone.lines : 0,zoned)
        const visible = SHAPES[p.kind][p.rotation].some(([,y])=>dropped.y+y>=HIDDEN)
        if (visible || lines>0 || (zoned && player.zone.lines>=VISIBLE)) {
          const perfect = lines>0 && !after.some((row,y)=>y<HEIGHT-banked && row)
          const attack = scoreClear(lines,spin || null,perfect,player.combo,player.chain,player.rules).attack
          const reward = player.zone.active ? lines*5 : lines*(level>=5 ? 1.6 : 3.7)
          const cancels = Math.min(player.garbage.total,attack)
          const qualifies = lines===4 || (lines>0 && (spin==='T' || spin==='mini'))
          const usefulPower = tactics?.rescue===2 && level>=7 ? Math.min(tactics.rescueRemaining,
            zoned ? Math.min(attack+lines,tactics.zoneRescueRoom) : attack) : 0
          const rescue = tactics?.rescue===1 && qualifies ? level*.85 + Math.max(0,level-6)*4 :
            tactics?.rescue===2 ? Math.min(attack,10)*level*.13 + usefulPower*1.8 +
              (usefulPower && usefulPower>=tactics.rescueRemaining ? 12 : 0) : 0
          const survival = tactics?.allyDead && player.danger ? cancels*level*.23 : 0
          const value = fieldValue(after,well,banked) + reward + (lines===4 ? 5 : 0) +
            Math.min(attack,16)*(level>=5 ? 1.55 : 0.7) + cancels*0.72 + rescue + survival -
            node.steps.length*0.16 - (held ? 0.95 : 0) + this.random()*IMPRECISION[level-1]
          placements.set(id,{rows:after,steps:[...node.steps,{action:'hard',x:p.x,rotation:p.rotation}],next,value,banked,qualifies})
        }
      }
      for (const [dx,action] of SHIFTS) {
        if (!fits(board,p,dx)) continue
        let x = p.x+dx
        if (sweep) while (fits(board,p,x-p.x+dx)) x+=dx
        push(node,{...p,x},action)
      }
      if (p.kind!=='O') for (const [turn,action] of TURNS) {
        if (turn===2 && level<4) continue
        const result = rotate(board,p,turn,player.rules.floorKicks)
        if (result) push(node,result.piece,action,result)
      }
      if (extra && distance) push(node,dropped,'soft',null,dropped.y)
    }
    into.push(...placements.values())
  }

  private decide(p: Player, tactics?: BlitzTactics) {
    const candidates: Candidate[] = []
    this.search(p,p.active,false,candidates,tactics)
    if (!p.usedHold && this.level>=4) this.search(p,p.previewSpawn(p.hold ?? p.next[0]),true,candidates,tactics)
    candidates.sort((a,b)=>b.value-a.value)
    if (this.level<5 || candidates.length<2) return candidates[0]?.steps ?? []
    const well = !p.zone.active
    const breadth = this.level>=9 ? 6 : this.level>=7 ? 4 : 2
    let winner = candidates[0]
    let best = -Infinity
    // Compare only the best immediate placements before extending to the preview.
    for (const candidate of candidates.slice(0,breadth)) {
      const seekTetris = this.level>=7 && tactics?.rescue===1 && !candidate.qualifies
      const forecasts = future(candidate.rows,candidate.next[0],well,this.level>=9 ? 2 : 1,candidate.banked,p.zone.active,seekTetris)
      let continuation = forecasts[0]?.value ?? -180
      if (this.level>=9 && candidate.next[1]) {
        continuation = Math.max(-180,...forecasts.map(placement =>
          placement.value*0.44 +
          (future(placement.rows,candidate.next[1],well,1,placement.banked,p.zone.active)[0]?.value ?? -180)*0.56))
      }
      const current = candidate.value*0.56 + continuation*0.44
      if (current > best) { best = current; winner = candidate }
    }
    return winner.steps
  }

  input(p: Player, now: number, tactics?: BlitzTactics): Input {
    if (p.dead) return NO_INPUT
    const urgentZone = tactics && this.level>=7 && tactics.turnLeft>tactics.warn &&
      (p.danger===2 || (tactics.rescue===2 && p.zone.energy>=50)) && p.zone.energy>=p.rules.zoneMinimum
    if (p.zoneAllowed && p.rules.zone && !p.zone.active && (p.zone.energy>=100 || urgentZone)) return inputFor('zone')
    if (tactics && now%(12*(11-this.level))===0) {
      const protect = !tactics.allyDead && tactics.canProtect && tactics.allyGarbage>=Math.max(2,9-this.level)
      if ((tactics.stance==='defense')!==protect) return inputFor('stance')
    }
    const rescue = tactics?.rescue ?? 0
    if (p.zone.active!==this.inZone || (this.level>=7 && rescue!==this.rescueStage)) {
      this.inZone = p.zone.active
      this.rescueStage = rescue
      this.plan = []
    }
    if (p.stats.pieces!==this.locks) {
      this.locks = p.stats.pieces
      this.plan = []
      this.actAt = Math.max(this.actAt,now+RECOVERY[this.level-1])
    }
    if (now<this.actAt) return NO_INPUT
    while (this.plan[0]?.until !== undefined && p.active.y >= this.plan[0].until) this.plan.shift()
    let step: Step|undefined = this.plan[0]
    if (!step || step.x!==p.active.x || step.rotation!==p.active.rotation) {
      this.plan = this.decide(p,tactics)
      step = this.plan[0]
    }
    this.actAt = now+CADENCE[this.level-1]
    if (!step) return inputFor('hard')
    if (step.until===undefined) this.plan.shift()
    return inputFor(step.action)
  }
}
