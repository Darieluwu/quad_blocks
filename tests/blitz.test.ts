import { describe, expect, it, vi } from 'vitest'
import { BlitzMatch, BLITZ_TRANSITION, DEFAULT_BLITZ } from '../src/engine/blitz'
import { teamForSlot } from '../src/engine/match'
import { NO_INPUT, type Action, type Input, type Player } from '../src/engine/player'
import { emptyBoard } from '../src/engine/pieces'
import { DEFAULT_RULES, HEIGHT, HZ, WIDTH } from '../src/engine/rules'
import { zoneTitle } from '../src/engine/zone'
import { defaultMap } from '../src/input'
import { loadSettings } from '../src/settings'

const rules = {...DEFAULT_RULES,gravity:0,progression:0,zoneQuarterLines:100,attack:{...DEFAULT_RULES.attack,perfect:0,backToBack:0,comboMax:0}}
const roster = [0,1,2,3].map(slot=>({slot,team:teamForSlot(slot)}))
const press = (...pressed:Action[]): Input=>({held:NO_INPUT.held,pressed})
const run = (m: BlitzMatch,ticks: number)=>{ for (let i=0;i<ticks;i++) m.tick() }
const create = (options: Partial<typeof DEFAULT_BLITZ> = {})=>new BlitzMatch(rules,'blitz-test',roster,{...DEFAULT_BLITZ,...options})
const inputs = (i: number,...actions:Action[])=>roster.map((_,j)=>i===j ? press(...actions) : NO_INPUT)

function well(p: Player,lines=4) {
  p.board = emptyBoard()
  for (let y=HEIGHT-lines;y<HEIGHT;y++) {
    p.board[y].fill('G')
    p.board[y][WIDTH-1] = null
  }
  p.active = {kind:'I',x:WIDTH-3,y:5,rotation:1}
}

function reviveSetup(options: Partial<typeof DEFAULT_BLITZ> = {}) {
  const m = create(options)
  const side = m.sides[0]
  const fallen = side.active
  m.players[fallen].eliminate()
  m.tick()
  run(m,BLITZ_TRANSITION)
  return {m,side,fallen}
}

describe('2v2 Blitz', () => {
  it('sin reservas ignora el relevo, deja usar Zone y recupera el reloj al revivir', () => {
    const m = create({turn:2,countdown:1})
    const [a,b] = m.sides.map(side=>side.active)
    m.players[a^1].eliminate()
    m.players[b^1].eliminate()
    m.left = 1
    const p = m.players[a]
    p.zone.energy = 100
    m.tick(inputs(a,'zone'))
    expect(p.zone.active).toBe(true)
    run(m,HZ*2)
    expect(m.canRotate).toBe(false)
    expect(m.turn).toBe(1)
    expect(m.transition).toBe(0)
    expect(p.events.some(e=>['blitzWarning','blitzChange'].includes(e.type))).toBe(false)
    p.endZone()
    for (let i=0;i<3;i++) { well(p); m.tick(inputs(a,'hard')) }
    expect(m.players[a^1].dead).toBe(false)
    expect(m.canRotate).toBe(true)
    expect(m.left).toBe(2*HZ)
    run(m,2*HZ)
    expect(m.sides.map(side=>side.active)).toEqual([a^1,b])
    expect(m.turn).toBe(2)
  })

  it.each([3,7,10])('la IA %i puede completar los dos retos con jugadas reales', level => {
    const m = new BlitzMatch(rules,'blitz-test',roster.map(p=>({...p,level:p.team===0 ? level : undefined})))
    const [a,b] = m.sides.map(side=>side.active)
    m.players[a^1].eliminate()
    m.players[b^1].eliminate()
    const p = m.players[a]
    for (let setup=0;setup<6 && m.players[a^1].dead;setup++) {
      const pieces = p.stats.pieces
      well(p)
      p.usedHold = true
      for (let tick=0;tick<240 && p.stats.pieces===pieces;tick++) m.tick()
    }
    expect(m.sides[0].used).toBe(1)
    expect(m.players[a^1].dead).toBe(false)
    expect(p.events.some(e=>e.type==='blitzChallenge' && e.detail==='2')).toBe(true)
  })
  it('usa la semilla para seleccionar un activo por equipo de manera independiente', () => {
    const picks = (seed: string)=>new BlitzMatch(rules,seed,roster).sides.map(side=>side.active)
    expect(picks('same')).toEqual(picks('same'))
    const pairs = Array.from({length:32},(_,i)=>picks('pair'+i))
    expect(new Set(pairs.map(p=>p.join())).size).toBe(4)
    expect(pairs.every(([a,b])=>a<2 && b>=2)).toBe(true)
  })

  it('da aviso los últimos 5 s y rota a los 30 s con 400 ms sin simulación', () => {
    const m = create()
    const first = m.sides.map(s=>s.active)
    run(m,25*HZ)
    expect(m.left).toBe(5*HZ)
    expect(m.players[first[0]].events.some(e=>e.type==='blitzWarning')).toBe(false)
    run(m,5*HZ-1)
    expect(m.players[first[0]].events.filter(e=>e.type==='blitzWarning')).toHaveLength(5)
    expect(m.left).toBe(1)
    m.tick()
    expect(m.now).toBe(30*HZ)
    expect(m.sides.map(s=>s.active)).toEqual(first.map(i=>i^1))
    expect(m.left).toBe(30*HZ)
    expect(m.transition).toBe(BLITZ_TRANSITION)
    run(m,BLITZ_TRANSITION)
    expect(m.now).toBe(30*HZ)
    m.tick()
    expect(m.now).toBe(30*HZ+1)
  })

  it('conserva pieza activa, pila, Hold, Next, generador, energía, basura, peligro y estadísticas', () => {
    const m = create({turn:1,countdown:0})
    const i = m.sides[0].active
    const mate = i^1
    const p = m.players[i]
    p.zone.energy = 65
    p.garbage.push({lines:2,hole:8,ready:70})
    m.tick(inputs(i,'hold','hard','right'))
    p.board[9][0] = 'G'
    run(m,HZ-1)
    const state = () => structuredClone({board:p.board,hold:p.hold,next:p.next,active:p.active,stats:p.stats,
      zone:p.zone.energy,danger:p.danger,garbage:p.garbage.queue,clock:m.clocks[i]})
    const saved = state()
    expect(m.sides[0].active).toBe(mate)
    run(m,BLITZ_TRANSITION)
    m.tick(inputs(i,'hold','left','hard','zone','stance'))
    expect(state()).toEqual(saved)
    run(m,HZ-1+BLITZ_TRANSITION)
    expect(m.sides[0].active).toBe(i)
    expect(state()).toEqual(saved)
    expect(m.players[i]).toBe(p)
    const expected = p.next[0]
    m.tick(inputs(i,'hard'))
    expect(p.active.kind).toBe(expected)
    expect(p.garbage.total).toBe(2)
    run(m,10)
    m.tick(inputs(i,'hard'))
    expect(p.garbage.total).toBe(0)
  })

  it('envía solo al activo rival y cancela primero la basura propia', () => {
    const m = create()
    const [a,b] = m.sides.map(s=>s.active)
    const p = m.players[a]
    p.garbage.push({lines:3,hole:2,ready:5})
    p.send(7)
    m.tick()
    expect(p.garbage.total).toBe(0)
    expect(m.players[b].garbage.queue[0]).toMatchObject({lines:4,source:a})
    expect(m.players[b^1].garbage.total).toBe(0)
  })

  it('divide impar, aplica el límite por turno y descarta protección sobrante', () => {
    const m = create({defenseCap:3})
    const a = m.sides[0].active
    const b = m.sides[1].active
    const ally = m.players[a^1]
    ally.garbage.push({lines:7,hole:3,ready:99})
    m.players[a].send(5)
    m.tick(inputs(a,'stance'))
    expect(m.stances[a]).toBe('defense')
    expect(m.players[b].garbage.total).toBe(3)
    expect(ally.garbage.total).toBe(5)
    m.players[a].send(6)
    m.tick()
    expect(ally.garbage.total).toBe(4)
    expect(m.players[b].garbage.total).toBe(6)
    expect(m.sides[0].defended).toBe(3)
    ally.garbage.cancel(10)
    m.players[a].send(4)
    m.tick()
    expect(m.players[b].garbage.total).toBe(8)
    expect(m.sides[0].defended).toBe(3)
  })

  it('sin potencia después de cancelar basura propia no ayuda ni ataca', () => {
    const m = create()
    const a = m.sides[0].active
    const b = m.sides[1].active
    m.players[a^1].garbage.push({lines:7,hole:3,ready:90})
    m.players[a].garbage.push({lines:4,hole:1,ready:20})
    m.players[a].send(4)
    m.tick(inputs(a,'stance'))
    expect(m.players[a^1].garbage.total).toBe(7)
    expect(m.players[b].garbage.total).toBe(0)
    expect(m.sides[0].defended).toBe(0)
  })

  it('resuelve las dos Zones al relevo sin duplicar potencia ni consumir la energía de la reserva', () => {
    const m = create({turn:2,countdown:1})
    const [a,b] = m.sides.map(s=>s.active)
    for (const i of [a,b]) {
      m.players[i].zone.energy = 100
      m.players[i^1].zone.energy = 45
      well(m.players[i])
    }
    m.tick(roster.map((_,i)=>i===a || i===b ? press('zone','hard') : NO_INPUT))
    expect(m.players[a].zone.active && m.players[b].zone.active).toBe(true)
    expect(m.players[a].zone.lines).toBe(4)
    run(m,2*HZ-1)
    expect(m.players[a].zone.active || m.players[b].zone.active).toBe(false)
    expect(m.players[a].garbage.total).toBe(10)
    expect(m.players[b].garbage.total).toBe(10)
    expect(m.players[a^1].zone.energy).toBe(45)
    run(m,BLITZ_TRANSITION+5)
    expect(m.players[a].garbage.total).toBe(10)
  })

  it('impide activar una Zone nueva durante la cuenta regresiva y permite cambiar postura dentro de una activa', () => {
    const m = create({turn:2,countdown:1})
    const a = m.sides[0].active
    const b = m.sides[1].active
    m.players[a].zone.energy = 100
    m.players[b].zone.energy = 100
    m.tick(inputs(a,'zone'))
    run(m,HZ-1)
    m.tick(roster.map((_,i)=>i===b ? press('zone') : i===a ? press('stance') : NO_INPUT))
    expect(m.players[a].zone.active).toBe(true)
    expect(m.stances[a]).toBe('defense')
    expect(m.players[b].zone.energy).toBe(100)
    expect(m.players[b].zone.active).toBe(false)
  })

  it('el relevo de emergencia conserva al rival y procesa dos caídas simultáneas una sola vez', () => {
    const m = create()
    const [a,b] = m.sides.map(s=>s.active)
    m.players[b].zone.energy = 80
    m.tick(inputs(b,'zone'))
    const before = m.players[b].zone.remaining
    m.players[a].eliminate()
    m.tick()
    expect(m.rotation).toBe('emergency')
    expect(m.sides.map(s=>s.active)).toEqual([a^1,b])
    expect(m.players[b].zone.remaining).toBe(before-1)
    expect(m.turn).toBe(2)
    const simultaneous = create()
    const previous = simultaneous.sides.map(s=>s.active)
    previous.forEach(i=>simultaneous.players[i].eliminate())
    simultaneous.tick()
    expect(simultaneous.sides.map(s=>s.active)).toEqual(previous.map(i=>i^1))
    expect(simultaneous.turn).toBe(2)
    run(simultaneous,BLITZ_TRANSITION)
    expect(simultaneous.turn).toBe(2)
  })

  it('completa ambas resurrecciones en orden, revive en reserva sin modificar al rescatador y agota los usos', () => {
    const {m,side,fallen} = reviveSetup()
    const rescuer = m.players[side.active]
    rescuer.zone.energy = 64
    const play = (lines=4)=>{ well(rescuer,lines); m.tick(inputs(side.active,'hard')) }
    play(2)
    expect(side.rescue).toMatchObject({stage:1,done:0})
    play()
    expect(side.rescue).toMatchObject({stage:2,done:0,goal:6})
    rescuer.garbage.push({lines:15,hole:2,ready:1})
    play()
    expect(side.rescue?.done).toBe(4)
    play()
    expect(side.used).toBe(1)
    expect(side.active).not.toBe(fallen)
    expect(rescuer.zone.energy).toBe(64)
    expect(m.players[fallen]).toMatchObject({dead:false,hold:null,danger:0,zone:{energy:0},next:expect.arrayContaining([expect.any(String)])})
    expect(m.players[fallen].board.flat().every(cell=>cell===null)).toBe(true)
    expect(m.players[fallen].garbage.total).toBe(0)
    m.players[fallen].eliminate()
    play()
    expect(side.rescue).toMatchObject({stage:1,done:1,goal:2})
    play()
    expect(side.rescue).toMatchObject({stage:2,done:0,goal:10})
    play(); play(); play()
    expect(side.used).toBe(2)
    m.players[fallen].eliminate()
    play()
    expect(side.rescue).toBeNull()
    rescuer.eliminate()
    m.tick()
    expect(m.finished).toBe(true)
    expect(m.winningTeam).toBe(1)
  })

  it('solo acredita al segundo desafío las jugadas posteriores y limita el aporte de cada Zone', () => {
    const {m,side} = reviveSetup({zoneRescueCap:3})
    const p = m.players[side.active]
    p.zone.energy = 100
    well(p)
    m.tick(inputs(side.active,'zone','hard'))
    expect(side.rescue).toMatchObject({stage:2,done:0,zonePower:0})
    p.endZone()
    m.tick()
    expect(side.rescue?.done).toBe(0)
    p.zone.energy = 100
    well(p)
    m.tick(inputs(side.active,'zone','hard'))
    p.endZone()
    m.tick()
    expect(side.rescue).toMatchObject({stage:2,done:3,zonePower:0})
  })

  it('resuelve una Zone defensiva antes de cambiar y reinicia el límite para el nuevo turno', () => {
    const m = create({turn:1,countdown:0})
    const [a,b] = m.sides.map(s=>s.active)
    m.players[a].zone.energy = 100
    m.players[a].garbage.push({lines:3,hole:4,ready:999})
    m.players[a^1].garbage.push({lines:6,hole:5,ready:999})
    well(m.players[a])
    m.tick(inputs(a,'zone','stance','hard'))
    run(m,HZ-1)
    expect(m.players[a].garbage.total).toBe(0)
    expect(m.players[a^1].garbage.total).toBe(3)
    expect(m.players[b].garbage.total).toBe(4)
    expect(m.sides[0].defended).toBe(0)
    expect(m.transition).toBe(BLITZ_TRANSITION)
  })

  it('un rescate completado en el último tick habilita al compañero para el relevo inmediato', () => {
    const {m,side,fallen} = reviveSetup()
    const p = m.players[side.active]
    for (let i=0;i<2;i++) { well(p); m.tick(inputs(side.active,'hard')) }
    expect(side.rescue?.done).toBe(4)
    m.left = 1
    well(p)
    m.tick(inputs(side.active,'hard'))
    expect(m.players[fallen].dead).toBe(false)
    expect(side.active).toBe(fallen)
    expect(m.transition).toBe(BLITZ_TRANSITION)
  })

  it('las dos últimas caídas simultáneas terminan en empate sin otro relevo', () => {
    const m = create()
    for (const p of m.players) p.eliminate()
    m.tick()
    expect(m.finished).toBe(true)
    expect(m.winningTeam).toBeNull()
    expect(m.transition).toBe(0)
    expect(m.turn).toBe(1)
  })

  it('acepta las acciones existentes y permite que una IA mixta congele su reserva', () => {
    const m = new BlitzMatch(rules,'mixed',roster.map(p=>({...p,level:p.team===1 ? 6 : undefined})))
    const a = m.sides[0].active
    m.tick(inputs(a,'stance','left','hard'))
    run(m,200)
    expect(m.players[a].stats.pieces).toBe(1)
    expect(m.players[m.sides[1].active].stats.pieces).toBeGreaterThan(0)
    expect(m.players[m.sides[1].active^1].stats.pieces).toBe(0)
    expect(m.stances[a]).toBe('defense')
    expect(defaultMap(0,'keys').stance).toBe('KeyT')
    expect(defaultMap(0,'pad').stance).toBe('B3')
  })

  it('traduce resultados de Zone por cantidad de líneas', () => {
    expect([4,8,12,16,18,19,20,24].map(zoneTitle)).toEqual(
      ['Tetris','Octoris','Dodecatris','Decahexatris','Perfectris','Perfectris','Ultimatris','Electris'])
  })

  it('migra configuraciones antiguas sin reemplazar teclas ni crear un choque de postura', () => {
    vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({slots:[{}, {keys:{left:'KeyT'}}]})})
    try {
      const settings = loadSettings()
      expect(settings.slots[0].keys.stance).toBe('')
      expect(settings.slots[1].keys.left).toBe('KeyT')
      expect(settings.slots[1].keys.stance).toBe('KeyV')
      expect(settings.blitz).toEqual(DEFAULT_BLITZ)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([[12.5,0],[18,0],[5,5]])('migra una carga antigua de %s %% a %s líneas por cuarto', (charge,cost) => {
    vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({profile:'Personalizado',rules:{charge,gravity:2}})})
    try {
      const settings = loadSettings()
      expect(settings.rules.zoneQuarterLines).toBe(cost)
      expect(settings.rules.gravity).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
