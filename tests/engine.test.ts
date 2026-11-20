import { describe, expect, it } from 'vitest'
import { pieceSource, KINDS, type Kind } from '../src/engine/random'
import { emptyBoard, fits, landing, rotate, SHAPES, spawnPiece } from '../src/engine/pieces'
import { detectSpin, scoreClear } from '../src/engine/scoring'
import { Player, NO_INPUT, type Action } from '../src/engine/player'
import { Match } from '../src/engine/match'
import { Garbage } from '../src/engine/garbage'
import { DEFAULT_RULES, HEIGHT, HIDDEN, HZ, SETTINGS, WIDTH, type Rules } from '../src/engine/rules'
import { automaticPadMap, conflict, defaultSlot, resolvePads } from '../src/input'

const settings = (patch: Partial<Rules> = {}): Rules => ({...DEFAULT_RULES,gravity:0,progression:0,...patch})
const press = (...pressed: Action[]) => ({held:new Set(pressed),pressed})
const player = (patch: Partial<Rules> = {}) => new Player(settings(patch),pieceSource('bag7',1))
const fixture = (p: Player, rows = 4) => {
  p.active = {kind:'I',rotation:1,x:2,y:8}
  for (let y = HEIGHT-rows; y < HEIGHT; y++) p.board[y].fill('G'), p.board[y][4] = null
}
function bury(p: Player) {
  p.active.y = HIDDEN-2
  p.board[HIDDEN].fill('G',3,7)
}
function fakePad(index: number,id: string) { return {index,id,connected:true} as Gamepad }

describe('Generadores', () => {
  it.each([['bag7',1],['bag14',2]] as const)('%s respeta la composición de cada bolsa', (mode,copies) => {
    const source = pieceSource(mode,82)
    const expected = KINDS.flatMap(kind => Array<Kind>(copies).fill(kind)).sort()
    for (let i = 0; i < 8; i++) expect(Array.from({length:expected.length},source).sort()).toEqual(expected)
  })
  it.each(['bag7','bag14','random','history'] as const)('%s admite semillas reproducibles', mode => {
    const sequence = (seed: number) => Array.from({length:140},pieceSource(mode,seed))
    expect(sequence(7)).toEqual(sequence(7))
    expect(sequence(7)).not.toEqual(sequence(6))
  })
  it('historial reduce apariciones entre las últimas cuatro piezas', () => {
    const repeats = (mode: 'history'|'random') => {
      const values = Array.from({length:1500},pieceSource(mode,2))
      return values.filter((value,i) => values.slice(Math.max(0,i-4),i).includes(value)).length
    }
    expect(repeats('history')).toBeLessThan(repeats('random')/4)
  })
})

describe('Movimiento, colisiones y bloqueo', () => {
  it('SRS devuelve orientación original tras cuatro giros en el aire', () => {
    const board = emptyBoard()
    for (const kind of KINDS) {
      const original = spawnPiece(kind)
      let current = original
      for (let i = 0; i < 4; i++) current = rotate(board,current,1,true)!.piece
      expect(current).toEqual(original)
    }
  })
  it('usa la tabla I al salir de la pared', () => {
    const result = rotate(emptyBoard(),{kind:'I',x:-2,y:10,rotation:1},-1,true)
    expect(result).toMatchObject({kick:1,piece:{x:0,rotation:0}})
  })
  it('respeta Floor Kicks y ofrece rotación 180°', () => {
    const board = emptyBoard()
    const token = {kind:'T' as const,x:3,y:HEIGHT-2,rotation:0}
    expect(rotate(board,token,1,false)).toBeNull()
    expect(rotate(board,token,1,true)).toMatchObject({piece:{y:HEIGHT-3},kick:2})
    expect(rotate(board,spawnPiece('S'),2,true)?.piece.rotation).toBe(2)
  })
  it('colisiona con paredes, piso, techo y pila', () => {
    const board = emptyBoard()
    const token = spawnPiece('O')
    expect(fits(board,token,-5)).toBe(false)
    expect(fits(board,token,7)).toBe(false)
    expect(fits(board,token,0,-HIDDEN)).toBe(false)
    expect(fits(board,token,0,HEIGHT)).toBe(false)
    board[token.y][token.x+1] = 'G'
    expect(fits(board,token)).toBe(false)
  })
  it('ghost y Hard Drop coinciden y avanzan Next', () => {
    const p = player()
    const token = {...p.active}
    const target = p.next[0]
    const distance = landing(p.board,token)
    expect(distance).toBeGreaterThan(0)
    expect(fits(p.board,token,0,distance+1)).toBe(false)
    p.tick(press('hard'),1)
    for (const [x,y] of SHAPES[token.kind][0]) expect(p.board[token.y+distance+y][token.x+x]).toBe(token.kind)
    expect(p.active.kind).toBe(target)
    expect(p.stats.pieces).toBe(1)
  })
  it('Hold avanza la cola una vez y permite recuperar la pieza tras bloquear', () => {
    const p = player()
    const initial = p.active.kind
    const next = p.next[0]
    p.tick(press('hold'),1)
    expect([p.hold,p.active.kind]).toEqual([initial,next])
    p.tick(press('hold'),2)
    expect(p.active.kind).toBe(next)
    p.tick(press('hard'),3)
    p.tick(press('hold'),4)
    expect(p.active.kind).toBe(initial)
  })
  it('Lock Delay y Move Reset se miden en ticks', () => {
    const p = player({lock:50,resets:1})
    p.active.y += landing(p.board,p.active)
    p.tick(NO_INPUT,1)
    p.tick(NO_INPUT,2)
    p.tick(press('left'),3)
    p.tick(press('right'),4)
    expect(p.stats.pieces).toBe(0)
    p.tick(NO_INPUT,5)
    expect(p.stats.pieces).toBe(1)
  })
  it('DAS y ARR cero llevan hasta la pared, y Lock Delay cero bloquea al tocar piso', () => {
    const p = player({das:0,arr:0,lock:0})
    p.tick(press('left'),1)
    expect(fits(p.board,p.active,-1)).toBe(false)
    p.active.y += landing(p.board,p.active)
    p.tick(NO_INPUT,2)
    expect(p.stats.pieces).toBe(1)
  })
  it('almacena Hold bloqueado y lo aplica cuando la siguiente pieza está disponible', () => {
    const p = player()
    p.tick(press('hold'),1)
    const second = p.active.kind
    p.tick(press('hold'),2)
    p.tick(press('hard'),3)
    p.tick(NO_INPUT,4)
    expect(p.hold).not.toBeNull()
    expect(p.usedHold).toBe(true)
    expect(p.events.filter(e => e.type==='hold')).toHaveLength(2)
    expect(p.active.kind).not.toBe(second)
  })
})

describe('Jugadas especiales y puntuación', () => {
  it('distingue T-Spin completo, mini y rotación insuficiente', () => {
    const t = {kind:'T',x:3,y:10,rotation:0} as const
    const board = emptyBoard()
    const turn = {kick:0,turn:1}
    board[10][3] = board[12][3] = board[12][5] = 'G'
    expect(detectSpin(board,t,null)).toBeNull()
    expect(detectSpin(board,t,turn)).toBe('mini')
    expect(detectSpin(board,t,{kick:4,turn:1})).toBe('T')
    board[10][5] = 'G'
    expect(detectSpin(board,t,turn)).toBe('T')
    board[10][3] = board[12][3] = null
    expect(detectSpin(board,t,turn)).toBeNull()
  })
  it.each(['L','J','S','Z'] as const)('%s requiere estar inmovilizada tras girar', kind => {
    const board = emptyBoard()
    const piece = {kind,x:3,y:10,rotation:0}
    const turn = {kick:0,turn:1}
    const cells = SHAPES[kind][0]
    expect(detectSpin(board,piece,turn)).toBeNull()
    for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const [x,y] = cells.find(([x,y]) => !cells.some(([a,b]) => a===x+dx && b===y+dy))!
      board[piece.y+y+dy][piece.x+x+dx] = 'G'
    }
    expect(fits(board,piece)).toBe(true)
    expect(detectSpin(board,piece,turn)).toBe(kind)
    expect(detectSpin(board,piece,null)).toBeNull()
    expect(scoreClear(1,kind,false,-1,false,settings()).attack).toBe(2)
    expect(scoreClear(1,kind,false,-1,false,settings({extraSpins:false})).attack).toBe(0)
  })
  it.each([1,2,3] as const)('puntúa T-Spin de %s líneas', lines => {
    expect(scoreClear(lines,'T',false,-1,false,settings()).attack).toBe(lines*2)
  })
  it('combos, Back-to-Back y Perfect Clear generan las bonificaciones configuradas', () => {
    const rules = settings()
    expect(scoreClear(4,null,true,1,true,rules)).toMatchObject({attack:16,combo:2,chain:true,b2b:true})
    expect(scoreClear(0,null,false,2,true,rules)).toMatchObject({combo:-1,chain:true,b2b:false})
    expect(scoreClear(1,null,false,2,true,rules)).toMatchObject({chain:false,b2b:false})
  })
  it('elimina cuatro filas, registra Tetris y detecta Perfect Clear en el tablero real', () => {
    const p = player()
    fixture(p)
    p.tick(press('hard'),1)
    expect(p.stats.lines).toBe(4)
    expect(p.board.flat().every(cell => cell===null)).toBe(true)
    expect(p.events.map(e => e.type)).toEqual(expect.arrayContaining(['quad','perfect']))
    expect(p.outbox).toBe(14)
  })
  it('adapta las alertas a la pila, aplica enfriamiento y cesa al retirar el peligro', () => {
    const p = player()
    const early = HEIGHT-SETTINGS.early
    const critical = HEIGHT-SETTINGS.critical
    p.board[early][0] = 'G'
    p.updateDanger(1)
    p.updateDanger(2)
    expect(p.danger).toBe(1)
    expect(p.events.map(e=>e.type)).toEqual(['danger'])
    p.board[critical][1] = 'G'
    p.updateDanger(3)
    p.updateDanger(3+SETTINGS.alarmTicks)
    expect(p.danger).toBe(2)
    expect(p.events.map(e=>e.type)).toEqual(['danger','critical','critical'])
    p.board[early][0] = p.board[critical][1] = null
    p.updateDanger(4+2*SETTINGS.alarmTicks)
    expect(p.danger).toBe(0)
    expect(p.events).toHaveLength(3)
  })
})

describe('Combate VS4', () => {
  it('cancela FIFO y limita la materialización por demora y cantidad', () => {
    const g = new Garbage()
    g.push({lines:3,hole:2,ready:5})
    g.push({lines:4,hole:8,ready:10})
    g.push({lines:-9,hole:8,ready:0})
    g.push({lines:6,hole:WIDTH,ready:0})
    g.push({lines:6,hole:1,ready:-1})
    expect(g.cancel(4)).toBe(0)
    expect(g.total).toBe(3)
    expect(g.take(9,8)).toEqual([])
    expect(g.take(10,2)).toEqual([8,8])
    expect(g.cancel(4)).toBe(3)
  })
  it('entrega ataques una vez y aplica basura con huecos solo tras un bloqueo sin líneas', () => {
    const match = new Match(settings({garbageDelay:50,garbageCap:2}),'attack')
    fixture(match.players[0])
    match.tick([press('hard')])
    const receiver = match.players[1]
    expect(receiver.garbage.total).toBe(14)
    match.tick([NO_INPUT,press('hard')])
    expect(receiver.stats.received).toBe(0)
    match.tick()
    match.tick([NO_INPUT,press('hard')])
    expect(receiver.stats.received).toBe(2)
    expect(receiver.garbage.total).toBe(12)
    expect(receiver.board.at(-1)?.filter(cell => cell === 'G')).toHaveLength(WIDTH-1)
    expect(match.players[0].stats.sent).toBe(14)
  })
  it('reubica el objetivo al eliminarlo sin duplicar ataques', () => {
    const match = new Match(settings(),'target')
    fixture(match.players[0])
    match.players[1].eliminate()
    match.tick([press('hard')])
    expect(match.targets[0]).toBe(2)
    expect(match.players.map(p=>p.garbage.total)).toEqual([0,0,14,0])
    match.tick([press('next')])
    expect(match.targets[0]).toBe(3)
    match.tick([press('prev')])
    expect(match.targets[0]).toBe(2)
  })
  it('selección aleatoria es reproducible y contraataque prioriza el último atacante', () => {
    const sim = (target: Rules['target']) => {
      const match = new Match(settings({target}),'targets')
      match.players[0].send(3)
      match.tick()
      return match
    }
    expect(sim('random').targets).toEqual(sim('random').targets)
    expect(sim('random').targets[0]).not.toBe(0)
    const counter = sim('counter')
    expect(counter.targets[1]).toBe(0)
    counter.players[1].send(5)
    counter.tick()
    expect(counter.players[0].garbage.total).toBe(2)
    expect(counter.players[1].stats.cancelled).toBe(3)
  })
  it('resuelve empate si los cuatro pierden en el mismo tick', () => {
    const match = new Match(settings(),'tie')
    for (const p of match.players) bury(p)
    match.tick(Array.from({length:4},() => press('hard')))
    expect(match.finished).toBe(true)
    expect(match.winner).toBeNull()
    expect(match.ranking()).toEqual([[0,1,2,3]])
  })
  it('simula una partida completa con movimiento independiente, ataque, eliminaciones y victoria', () => {
    const match = new Match(settings({garbageDelay:0}),'integration')
    expect(match.players.map(p=>[p.active.kind,...p.next])).toEqual(Array(4).fill([match.players[0].active.kind,...match.players[0].next]))
    const independent = new Match(settings({shared:false}),'integration')
    expect(new Set(independent.players.map(p=>p.next.join(''))).size).toBeGreaterThan(1)
    const [a,b,c,d] = match.players
    match.tick([press('left'),press('right'),press('cw'),press('hold')])
    expect([a.active.x,b.active.x,c.active.rotation,d.usedHold]).toEqual([2,4,1,true])
    fixture(a)
    match.tick([press('hard')])
    expect(b.garbage.total).toBe(14)
    bury(b)
    match.tick([NO_INPUT,press('hard')])
    expect(b.dead && !match.finished).toBe(true)
    bury(d); match.tick([NO_INPUT,NO_INPUT,NO_INPUT,press('hard')])
    bury(c); match.tick([NO_INPUT,NO_INPUT,press('hard')])
    expect(match.winner).toBe(0)
    expect(match.ranking()).toEqual([[0],[2],[3],[1]])
    expect(a.events.some(event=>event.type==='victory')).toBe(true)
  })
})

describe('Zone', () => {
  it('carga por líneas y puede desactivarse desde las reglas', () => {
    const p = player()
    fixture(p)
    p.tick(press('hard'),1)
    expect(p.zone.energy).toBe(50)
    p.tick(press('zone'),2)
    expect(p.zone.duration).toBe(6*HZ)
    const disabled = player({zone:false})
    fixture(disabled)
    disabled.tick(press('hard','zone'),1)
    expect(disabled.zone.energy).toBe(0)
    expect(disabled.zone.active).toBe(false)
  })
  it.each([2,4])('%s Zones simultáneas mantienen temporizadores y gravedad independientes', count => {
    const m = new Match(settings({gravity:60,zoneSeconds:2}),'simultaneous')
    m.players.slice(0,count).forEach((p,i) => { p.zone.energy = 25*(i+1) })
    m.tick(m.players.map((_,i)=>i<count ? press('zone','left') : NO_INPUT))
    expect(m.players.slice(0,count).every(p=>p.zone.active && p.active.y===HIDDEN-1 && p.active.x===2)).toBe(true)
    expect(m.players.slice(count).every(p=>!p.zone.active && p.active.y===HIDDEN)).toBe(true)
    for (let i=0;i<30;i++) m.tick()
    expect(m.players[0].zone.active).toBe(false)
    expect(m.players[1].zone.remaining).toBe(30)
  })
  it('retiene basura durante Zone, la cancela al terminar y entrega el resto del ataque', () => {
    const m = new Match(settings({zoneSeconds:1,garbageDelay:0}),'zone attack')
    const [a,b,c] = m.players
    a.zone.energy = 25
    fixture(a)
    c.send(5)
    m.targets[2] = 0
    m.tick([press('zone','hard')])
    expect(a.zone.lines).toBe(4)
    expect(a.garbage.total).toBe(5)
    expect(a.stats.sent).toBe(0)
    m.tick([press('hard')])
    expect(a.stats.received).toBe(0)
    for (let i = 0; i < 14; i++) m.tick()
    expect(a.zone.active).toBe(false)
    expect(a.garbage.total).toBe(0)
    expect(a.stats.cancelled).toBe(5)
    expect(b.garbage.total).toBe(15)
    expect(a.events.map(e=>e.type)).toEqual(expect.arrayContaining(['zoneEnd','zoneAttack']))
  })
  it('mantiene ataques pendientes si Zone termina sin despejar líneas', () => {
    const p = player({zoneSeconds:1})
    p.zone.energy = 25
    p.garbage.push({lines:3,hole:2,ready:0})
    p.tick(press('zone','hard'),1)
    for (let i=2;i<=16;i++) p.tick(NO_INPUT,i)
    expect(p.garbage.total).toBe(3)
    p.tick(press('hard'),17)
    expect(p.stats.received).toBe(3)
  })
})

describe('Dispositivos', () => {
  it('conserva jugadores, reconecta índices nuevos y evita asignación doble', () => {
    const slots = Array.from({length:4},(_,i)=>defaultSlot(i))
    slots[1].device = {id:'Mando A',index:1}
    slots[2].device = {id:'Mando B',index:2}
    expect(resolvePads(slots,[fakePad(1,'Mando A'),fakePad(2,'Mando B')]).map(p=>p?.index)).toEqual([undefined,1,2,undefined])
    expect(resolvePads(slots,[fakePad(2,'Mando B')]).map(p=>p?.index)).toEqual([undefined,undefined,2,undefined])
    expect(resolvePads(slots,[fakePad(3,'Mando A'),fakePad(2,'Mando B')]).map(p=>p?.index)).toEqual([undefined,3,2,undefined])
    slots[3].device = {id:'Mando A',index:1}
    expect(resolvePads(slots,[fakePad(1,'Mando A')]).filter(Boolean)).toHaveLength(1)
  })
  it('detecta conflicto entre teclados y acepta una tecla libre', () => {
    const slots = Array.from({length:4},(_,i)=>defaultSlot(i))
    expect(conflict(slots,0,'keys','left','KeyJ')).toMatch('J2')
    expect(conflict(slots,0,'keys','left','KeyG')).toBeNull()
  })
  it('aplica mapas estándar y genéricos con entradas existentes y únicas', () => {
    const standard = {mapping:'standard' as const,buttons:[],axes:[]}
    expect(automaticPadMap(standard)).toEqual(defaultSlot(0).pad)
    const buttons = Array.from({length:8},()=>({pressed:false,touched:false,value:0}))
    const generic = {mapping:'' as const,buttons,axes:[0,0]}
    const mapping = automaticPadMap(generic)
    expect(mapping).toMatchObject({left:'A0-',right:'A0+',soft:'A1+',hard:'A1-'})
    expect(new Set(Object.values(mapping)).size).toBe(12)
    expect(Object.values(mapping).filter(value=>value.startsWith('B')).every(value=>Number(value.slice(1))<8)).toBe(true)
  })
})
