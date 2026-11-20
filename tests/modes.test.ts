import { describe, expect, it } from 'vitest'
import { Match, teamForSlot } from '../src/engine/match'
import { Bot } from '../src/engine/bot'
import { NO_INPUT, Player, type Action } from '../src/engine/player'
import { DEFAULT_RULES, HEIGHT, WIDTH } from '../src/engine/rules'
import { pieceSource } from '../src/engine/random'

const rules = {...DEFAULT_RULES,gravity:0,progression:0}
const teamRoster = [0,1,2,3].map(slot=>({slot,team:teamForSlot(slot)}))
const input = (...pressed:Action[])=>({held:NO_INPUT.held,pressed})
const stats = (p: Player) => ({...p.stats,dead:p.dead})

describe('Versus Zone y 2v2', () => {
  it.each([{slots:[1,3]},{slots:[0,2,3]},{slots:[0,1,2,3]}])('juega un todos contra todos con las plazas $slots', ({slots}) => {
    const match = new Match(rules,'roster',slots.map(slot=>({slot})))
    expect(match.roster.map(p=>p.slot)).toEqual(slots)
    expect(match.players.length).toBe(slots.length)
    match.players.slice(1).forEach(p=>p.eliminate())
    match.tick()
    expect(match.winner).toBe(0)
    expect(match.finished).toBe(true)
  })
  it.each(['manual','random','counter'] as const)('con objetivos %s solo ataca al otro equipo', target => {
    const match = new Match({...rules,target},'team',teamRoster)
    expect(match.targets.map(i=>teamForSlot(i))).toEqual([1,1,0,0])
    match.players[0].send(4)
    match.tick([input('next')])
    expect(match.players[1].garbage.total).toBe(0)
    expect(match.players[2].garbage.total+match.players[3].garbage.total).toBe(4)
    const receiver = match.players.findIndex(p=>p.garbage.total>0)
    match.players[receiver].send(6)
    match.tick()
    expect(match.players[0].garbage.total+match.players[1].garbage.total).toBe(2)
    if (target==='counter') expect(match.players[0].garbage.total).toBe(2)
  })
  it('declara ganador al equipo completo aunque haya perdido a un compañero', () => {
    const match = new Match(rules,'duos',teamRoster)
    match.players[1].eliminate()
    match.players[2].eliminate()
    match.tick()
    expect(match.finished).toBe(false)
    expect(match.targets[0]).toBe(3)
    match.players[3].eliminate()
    match.tick()
    expect(match.winningTeam).toBe(0)
    expect(match.ranking()).toEqual([[0,1],[2,3]])
  })
  it('declara empate cuando se eliminan los dos equipos en el mismo tick', () => {
    const match = new Match(rules,'tie',teamRoster)
    match.players.forEach(p=>p.eliminate())
    match.tick()
    expect(match.finished).toBe(true)
    expect(match.winningTeam).toBeNull()
    expect(match.ranking()).toEqual([[0,1,2,3]])
  })
})

describe('IA local', () => {
  const player = (seed = 1) => new Player(rules,pieceSource('bag7',seed))
  it.each([1,5,10])('nivel %i activa Zone en el primer tick al 100 %%', level => {
    const p = player()
    const bot = new Bot(level,'zone')
    p.zone.energy = 99
    p.tick(bot.input(p,1),1)
    expect(p.zone.active).toBe(false)
    p.zone.energy = 100
    p.tick(bot.input(p,2),2)
    expect(p.zone.active).toBe(true)
  })
  it('nivel 10 limpia cuatro líneas pasando por SRS y entradas del motor', () => {
    const match = new Match(rules,'fixture',[{slot:0},{slot:3,level:10}])
    const p = match.players[1]
    p.active = {kind:'I',rotation:0,x:3,y:3}
    for (let y=HEIGHT-4;y<HEIGHT;y++) {
      p.board[y].fill('G')
      p.board[y][WIDTH-1] = null
    }
    for (let i=0;i<60 && !p.stats.pieces;i++) match.tick()
    expect(p.stats.lines).toBe(4)
    expect(p.events.map(e=>e.type)).toContain('rotate')
    expect(match.players[0].garbage.total).toBeGreaterThan(0)
  })
  it('el nivel 10 es reproducible y más eficaz que el nivel 1 con la misma secuencia', () => {
    const play = (level: number) => {
      const p = player(7)
      const bot = new Bot(level,'comparison')
      for (let now=1;now<=2100 && !p.dead;now++) {
        p.tick(bot.input(p,now),now)
        p.events.length = 0
      }
      return stats(p)
    }
    const best = play(10)
    const beginner = play(1)
    expect(best).toEqual(play(10))
    expect(best.pieces).toBeGreaterThan(beginner.pieces)
    expect(best.lines).toBeGreaterThan(beginner.lines)
    expect(best.dead).toBe(false)
  })
  it('una pareja con IA puede jugar contra otra pareja con IA', () => {
    const match = new Match(rules,'mixed',teamRoster.map(p=>
      ({...p,level:p.slot===1 ? 5 : p.slot===3 ? 8 : undefined})))
    for (let now=0;now<240;now++) match.tick()
    expect(match.players.map(p=>p.stats.pieces>0)).toEqual([false,true,false,true])
    expect(match.finished).toBe(false)
  })
})
