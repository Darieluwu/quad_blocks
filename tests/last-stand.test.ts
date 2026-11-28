import { describe, expect, it, vi } from 'vitest'
import { BlitzMatch } from '../src/engine/blitz'
import { Bot } from '../src/engine/bot'
import { chargeSecondWind, DOUBLE_STAND_PRIZES, LAST_STAND_PRIZES, STAND, standEvent, standState, type Prize } from '../src/engine/last-stand'
import { Match, teamForSlot } from '../src/engine/match'
import { emptyBoard, fits } from '../src/engine/pieces'
import type { Player } from '../src/engine/player'
import { DEFAULT_RULES, HEIGHT, HZ, WIDTH, ticks } from '../src/engine/rules'
import { lastStandCopy, standDescriptions } from '../src/last-stand-copy'
import { LastStandView } from '../src/last-stand-view'
import type { Sound } from '../src/audio'
import { OnlineTeamsMatch, snapshot, type ClientMessage, type Frame, type ServerMessage } from '../src/online/protocol'
import { OnlineRoom, STEP_MS, type Peer } from '../src/online/room'

const roster = [0,1,2,3].map(slot=>({slot,team:teamForSlot(slot)}))
const rules = {...DEFAULT_RULES,gravity:0,progression:0,lock:2000,zoneQuarterLines:1}
const make = (enabled=true,seed='last-stand') => new Match(rules,seed,roster,false,enabled)
const advance = (match:Match,count:number) => { for (let i=0;i<count;i++) match.tick() }
const ko = (match:Match,...slots:number[]) => { for (const slot of slots) match.players[slot].eliminate() }

function award(left:Prize,right?:Prize) {
  const match = make()
  ko(match,1,...(right ? [3] : []))
  advance(match,right ? 1 : STAND.window+1)
  match.stand!.event!.awards[0].prize = left
  if (right) match.stand!.event!.awards[1].prize = right
  match.advanceStand(STAND.presentation)
  return match
}

function tetris(player:Player,now:number,perfect=false) {
  player.board = emptyBoard()
  for (let row=HEIGHT-4;row<HEIGHT;row++) {
    player.board[row].fill('J')
    player.board[row][3] = null
  }
  if (!perfect) player.board[HEIGHT-5][0] = 'L'
  player.active = {kind:'I',rotation:1,x:1,y:HEIGHT-4}
  player.lastRotation = null
  player.lock(now)
}

function tSpin(player:Player,now:number) {
  player.board = emptyBoard()
  player.board[HEIGHT-2].fill('J')
  for (let i=3;i<=5;i++) player.board[HEIGHT-2][i] = null
  player.board[HEIGHT-3][3] = player.board[HEIGHT-3][5] = player.board[HEIGHT-1][3] = 'J'
  player.active = {kind:'T',rotation:0,x:3,y:HEIGHT-3}
  player.lastRotation = {turn:1,kick:0}
  player.lock(now)
}

describe('detección en Match',()=>{
  it('respeta la opción y limita la regla al 2v2 tradicional',()=>{
    const matches = [make(false),new Match(rules,'ffa',roster.map(({slot})=>({slot})),false,true),
      new BlitzMatch(rules,'blitz',roster)]
    for (const match of matches) {
      ko(match,1)
      advance(match,STAND.window+4)
      expect(match.stand).toBeNull()
      expect(match.standPaused).toBe(false)
    }
  })
  it('mantiene una ventana oculta de 180 ticks y activa un KO aislado al vencer',()=>{
    const match = make()
    ko(match,0)
    match.tick()
    advance(match,STAND.window-1)
    expect(match.now).toBe(STAND.window)
    expect(match.stand?.event).toBeNull()
    match.tick()
    expect(match.stand?.event).toMatchObject({kind:'single',tick:STAND.window+1,awards:[{index:1}]})
    expect(match.standPaused).toBe(true)
    expect(match.players[1].stand).toBeNull()
  })
  it.each([0,2*HZ,STAND.window])('resuelve dos KO separados por %s ticks de inmediato',distance=>{
    const match = make()
    ko(match,1,...(distance===0 ? [3] : []))
    for (let i=0;i<distance;i++) match.tick()
    if (distance) ko(match,3)
    match.tick()
    expect(match.stand?.event).toMatchObject({kind:'double',tick:distance+1,awards:[{index:0},{index:2}]})
    expect(match.stand?.doubleUsed).toBe(true)
  })
  it('cancela el beneficio normal tras un segundo KO fuera de la ventana',()=>{
    const match = award('doubleAttack')
    ko(match,2)
    match.tick()
    expect(match.stand?.event).toMatchObject({id:1,kind:'single'})
    expect(match.stand?.active).toBeNull()
    expect(match.standPaused).toBe(false)
    expect(match.players[0].stand).toBeNull()
  })
  it.each([[0,1],[0,1,2,3]])('la victoria o el empate prevalecen sobre las ruletas: %j',(...dead:number[])=>{
    const match = make()
    ko(match,dead[0])
    match.tick()
    advance(match,STAND.window-1)
    ko(match,...dead.slice(1))
    match.tick()
    expect(match.finished).toBe(true)
    expect(match.winningTeam).toBe(dead.length===4 ? null : 1)
    expect(match.stand?.event).toBeNull()
  })
  it('da una sola tirada normal por equipo y conserva el gasto tras Revive',()=>{
    const match = award('revive')
    const effect = match.players[0].stand!
    Object.assign(effect,{tetris:true,spin:true,sent:8})
    match.tick()
    expect(match.players[1].dead).toBe(false)
    ko(match,1)
    advance(match,STAND.window+1)
    expect(match.stand?.used).toEqual([true,false])
    expect(match.stand?.event?.id).toBe(1)
    expect(match.standPaused).toBe(false)
  })
  it('permite una primera tirada normal al otro equipo después de Revive',()=>{
    const match = award('revive')
    Object.assign(match.players[0].stand!,{tetris:true,spin:true,sent:8})
    match.tick()
    ko(match,3)
    advance(match,STAND.window+1)
    expect(match.stand?.event).toMatchObject({id:2,kind:'single',awards:[{index:2}]})
    expect(match.stand?.used).toEqual([true,true])
  })
  it('mantiene un único Double hasta el resultado normal del duelo',()=>{
    const match = award('aegisCore','precisionStrike')
    advance(match,STAND.window*2)
    expect(match.stand?.active).toBe('double')
    expect(match.players[0].stand?.progress).toBe(6)
    expect(match.players[2].stand?.progress).toBe(3)
    ko(match,2)
    advance(match,STAND.window+1)
    expect(match.winningTeam).toBe(0)
    expect(match.stand?.event?.id).toBe(1)
    expect(match.stand?.active).toBeNull()
    expect(match.players.every(p=>!p.stand)).toBe(true)
  })
  it('elige de forma reproducible, permite premios iguales y alcanza ambos catálogos completos',()=>{
    const rolls = Array.from({length:100},(_,i)=>standEvent(String(i),standState(),1,'double',[1,2]))
    expect(rolls.some(({awards:[a,b]})=>a.prize===b.prize)).toBe(true)
    expect(rolls.some(({awards:[a,b]})=>a.prize!==b.prize)).toBe(true)
    for (const index of [0,1]) expect(new Set(rolls.map(roll=>roll.awards[index].prize))).toEqual(new Set(DOUBLE_STAND_PRIZES))
    const singles = rolls.map((_,i)=>standEvent(String(i),standState(),1,'single',[1]).awards[0].prize)
    expect(new Set(singles)).toEqual(new Set(LAST_STAND_PRIZES))
    expect(rolls[5]).toEqual(standEvent('5',standState(),1,'double',[1,2]))
  })
})

describe('recompensas',()=>{
  it('carga Second Wind desde cero con una base por jugada y un combo adicional',()=>{
    const match = award('secondWind')
    const p = match.players[0]
    expect(p.stand?.progress).toBe(0)
    expect(p.receiveStand(8)).toBe(8)
    expect(chargeSecondWind(2,'T',false,0)).toBe(30)
    expect(chargeSecondWind(3,'T',false,3)).toBe(50)
    expect(chargeSecondWind(4,null,true,3)).toBe(60)
    expect(chargeSecondWind(0,'T',false,3)).toBe(0)
    tetris(p,match.now,true)
    expect(p.stand?.progress).toBe(50)
    tetris(p,match.now)
    expect(p.stand?.progress).toBe(75)
    tetris(p,match.now)
    expect(p.stand).toMatchObject({progress:100,until:match.now+15*HZ})
    expect(p.events.filter(e=>e.type==='secondWindActivate')).toHaveLength(1)
    p.outbox = 0
    const attacker = match.players[2]
    attacker.garbage.push({lines:1,hole:0,ready:0})
    attacker.send(2)
    match.tick()
    expect(p.garbage.total).toBe(0)
    expect(p.stand?.remainder).toBe(47)
    for (let i=0;i<99;i++) {
      attacker.send(1)
      match.tick()
    }
    expect(p.garbage.total).toBe(47)
    advance(match,15*HZ-100)
    expect(p.stand).toBeNull()
    expect(p.receiveStand(8)).toBe(8)
  })
  it.each([['spin','tetris'],['tetris','spin']])('Revive completa misiones en orden %s / %s',(...order:string[])=>{
    const match = award('revive')
    const p = match.players[0]
    const ally = match.players[1]
    ally.garbage.push({lines:9,hole:1,ready:0})
    ally.zone.energy = 100
    ally.board[HEIGHT-1][0] = 'L'
    p.garbage.push({lines:3,hole:1,ready:0})
    p.send(3)
    match.tick()
    expect(p.stand?.sent).toBe(0)
    p.send(8)
    match.tick()
    expect(p.stand?.sent).toBe(8)
    for (const task of order) {
      ;(task==='spin' ? tSpin : tetris)(p,match.now)
      match.tick()
    }
    expect(match.stand?.revived).toBe(true)
    expect(match.stand?.active).toBeNull()
    expect(match.players[1].dead).toBe(false)
    expect(match.players[1].board).toEqual(emptyBoard())
    expect(match.players[1].zone.energy).toBe(0)
    expect(match.players[1].garbage.total).toBe(0)
    expect(match.players[1].events.map(event=>event.type)).toContain('standRevived')
  })
  it('Double Attack duplica el destino con 100% / 50% tras una única cancelación',()=>{
    const match = award('doubleAttack')
    const p = match.players[0]
    p.garbage.push({lines:2,hole:0,ready:0})
    p.send(10)
    match.tick()
    expect(p.stats.cancelled).toBe(2)
    expect(match.players.slice(2).map(rival=>rival.garbage.total)).toEqual([8,4])
    p.send(1)
    match.tick()
    p.send(1)
    match.tick()
    expect(match.players.slice(2).map(rival=>rival.garbage.total)).toEqual([10,5])
    expect(match.players[3].events).toContainEqual({type:'incoming',detail:'4',source:0,secondary:true})
  })
  it('mantiene dos filas selladas 60 s, sin perder bloques ni dar ataques',()=>{
    const match = award('cursedFoundation')
    const p = match.players[2]
    expect(p.board.slice(-2).every(row=>row.every(cell=>cell==='foundation'))).toBe(true)
    expect(p.foundationUntil).toBe(match.now+1+60*HZ)
    p.board[HEIGHT-3][0] = 'L'
    const until = p.foundationUntil
    advance(match,until-match.now-1)
    expect(p.board[HEIGHT-3][0]).toBe('L')
    const before = {...p.active}
    match.tick()
    expect(p.foundationUntil).toBe(0)
    expect(p.board[HEIGHT-1][0]).toBe('L')
    expect(p.board.flat().filter(Boolean)).toEqual(['L'])
    expect(p.active).toMatchObject({y:before.y+2})
    expect(p.stats.sent).toBe(0)
    expect(fits(p.board,p.active)).toBe(true)
  })
  it('aplaza la fundación cuando no cabe, preserva basura y SURGE y retira el sello al salir de 1v2',()=>{
    const match = make()
    ko(match,1)
    advance(match,STAND.window+1)
    match.stand!.event!.awards[0].prize = 'cursedFoundation'
    const p = match.players[2]
    p.board[0][0] = 'L'
    match.advanceStand(STAND.presentation)
    expect(p.dead).toBe(false)
    expect(p.board[0][0]).toBe('L')
    expect(p.board[HEIGHT-1][0]).toBeNull()
    p.board[0][0] = null
    match.tick()
    expect(p.foundationUntil).toBe(match.now+1+60*HZ)
    p.garbage.push({lines:1,hole:9,ready:0})
    match.tick([{}, {}, {}].map(()=>({held:new Set(),pressed:['hard']})))
    expect(p.board[HEIGHT-3].filter(cell=>cell==='G')).toHaveLength(WIDTH-1)
    p.zone.energy = 25
    p.zone.activate(p.rules)
    p.zone.lines = 1
    p.board[HEIGHT-3].fill('zone')
    p.endZone()
    expect(p.board.slice(-2).flat().every(cell=>cell==='foundation')).toBe(true)
    ko(match,3)
    match.tick()
    expect(p.foundationUntil).toBe(0)
    expect(p.board.flat()).not.toContain('foundation')
    expect(p.board).toHaveLength(HEIGHT)
  })
  it('una IA construye y limpia líneas sobre la fundación sin retirarla',()=>{
    const match = award('cursedFoundation')
    const p = match.players[2]
    const bot = new Bot(8,'foundation-bot')
    for (let now=match.now;now<match.now+420;now++) {
      p.tick(bot.input(p,now),now)
      expect(p.foundationRows).toBe(2)
    }
    expect(p.dead).toBe(false)
    expect(p.stats.lines).toBeGreaterThan(0)
    expect(p.board).toHaveLength(HEIGHT)
  })
  it.each([['surgeBreak',35,37.5],['surgeResonance',40,31.25]] as const)(
    '%s solo bonifica energía de SURGE, respeta el máximo y expira',(prize,initial,perLine)=>{
      const match = prize==='surgeBreak' ? award(prize) : award(prize,'cleanSlate')
      const p = match.players[0]
      expect(p.zone.energy).toBe(initial)
      tSpin(p,match.now)
      expect(p.zone.energy).toBe(initial+perLine)
      expect(p.outbox).toBe(DEFAULT_RULES.attack.tSingle)
      p.zone.energy = 99
      tSpin(p,match.now)
      expect(p.zone.energy).toBe(100)
      advance(match,20*HZ+1)
      expect(p.stand).toBeNull()
      p.zone.energy = 0
      tSpin(p,match.now)
      expect(p.zone.energy).toBe(25)
    })
  it('Final Gambit concede +2 por jugada ofensiva, incluso si hay combo y Perfect Clear',()=>{
    const match = award('finalGambit')
    const p = match.players[0]
    p.combo = 3
    tetris(p,match.now,true)
    expect(p.outbox).toBe(4+10+2+2)
    p.outbox = 0
    p.combo = -1
    p.chain = false
    tSpin(p,match.now)
    expect(p.outbox).toBe(4)
    expect(p.receiveStand(10)).toBe(10)
    advance(match,20*HZ+1)
    expect(p.stand).toBeNull()
  })
  it('Overcharge fracciona el 30% antes de cancelar y vence en 25 s',()=>{
    const match = award('overcharge','cleanSlate')
    const p = match.players[0], opponent = match.players[2]
    p.garbage.push({lines:2,hole:0,ready:0})
    for (let i=0;i<10;i++) {
      p.send(1)
      match.tick()
    }
    expect(p.stats.cancelled).toBe(2)
    expect(opponent.garbage.total).toBe(11)
    advance(match,25*HZ-9)
    expect(p.stand).toBeNull()
  })
  it('Aegis solo absorbe seis líneas nuevas y conserva la cola anterior',()=>{
    const match = award('aegisCore','cleanSlate')
    const p = match.players[0], opponent = match.players[2]
    p.garbage.push({lines:5,hole:2,ready:0})
    opponent.send(2)
    match.tick()
    expect(p.garbage.total).toBe(5)
    expect(p.stand?.progress).toBe(4)
    opponent.send(9)
    match.tick()
    expect(p.garbage.total).toBe(10)
    expect(p.stand).toBeNull()
  })
  it('Time Fracture conserva tiempos previos, admite cancelación y mantiene el retardo tras expirar',()=>{
    const match = award('timeFracture','cleanSlate')
    const p = match.players[0], opponent = match.players[2]
    p.garbage.push({lines:3,hole:7,ready:40})
    const until = p.stand!.until!
    advance(match,until-match.now-2)
    opponent.send(4)
    match.tick()
    const ready = match.now+ticks(rules.garbageDelay)+3*HZ
    expect(p.garbage.queue.map(packet=>packet.ready)).toEqual([40,ready])
    expect(p.send(4)).toBe(0)
    match.tick()
    expect(p.stand).toBeNull()
    expect(p.garbage.queue[0]).toMatchObject({lines:3,ready})
    expect(p.garbage.take(ready-1,8)).toEqual([])
    expect(p.garbage.take(ready,8)).toHaveLength(3)
  })
  it('Precision Strike consume solo tres cargas en ataques elegibles',()=>{
    const match = award('precisionStrike','cleanSlate')
    const p = match.players[0]
    p.send(4)
    expect(p.stand?.progress).toBe(3)
    p.outbox = 0
    for (const expected of [2,1,0]) {
      p.chain = false
      p.combo = -1
      tSpin(p,match.now)
      expect(p.outbox).toBe(4)
      expect(p.stand?.progress ?? 0).toBe(expected)
      p.outbox = 0
    }
    expect(p.stand).toBeNull()
  })
  it('Clean Slate retira solo hasta cuatro filas consecutivas de basura y conserva pieza, RNG y bloques',()=>{
    const match = make()
    ko(match,1,3)
    match.tick()
    const p = match.players[0]
    const original = p.exportState()
    for (let row=HEIGHT-5;row<HEIGHT;row++) {
      p.board[row].fill('G')
      p.board[row][5] = null
    }
    p.board[HEIGHT-5][5] = 'L'
    match.stand!.event!.awards[0].prize = 'cleanSlate'
    match.advanceStand(STAND.presentation)
    expect(p.board[HEIGHT-1][5]).toBe('L')
    expect(p.board.flat().filter(cell=>cell==='G')).toHaveLength(WIDTH-1)
    expect(p.exportState().sim.source).toEqual(original.sim.source)
    expect(p.next).toEqual(original.next)
    expect(p.active.kind).toBe(original.active.kind)
    expect(p.outbox).toBe(0)
    const cleaned = p.board.map(row=>row.slice())
    p.cleanSlate()
    expect(p.board).toEqual(cleaned)
  })
})

function peer() {
  const messages:ServerMessage[] = []
  const socket:Peer = {send:data=>messages.push(JSON.parse(data)),close:()=>{}}
  const last = <T extends ServerMessage['type']>(type:T) =>
    messages.findLast(message=>message.type===type) as Extract<ServerMessage,{type:T}>
  return {socket,last}
}

const join = (id:number,create=false):Extract<ClientMessage,{type:'join'}> => ({
  type:'join',name:'Player '+id,token:String(id).padStart(32,'0'),create,...(create ? {format:'teams'} : {}),
})

function onlineRoom() {
  const room = new OnlineRoom(()=> 'teams-room')
  const users = [peer(),peer(),peer(),peer()]
  let now = 1_000
  for (const [i,user] of users.entries()) {
    room.join(user.socket,join(i,i===0),now)
    room.dispatch(user.socket,{type:'ready',value:true},now)
  }
  return {room,users,advance:(count:number)=>{ for (let i=0;i<count;i++) room.step(now+=STEP_MS) },now:()=>now,
    send:(index:number,message:Exclude<ClientMessage,{type:'join'}>)=>room.dispatch(users[index].socket,message,now)}
}

describe('pausa, partidas locales y online',()=>{
  it('congela todos los relojes competitivos e ignora inputs locales durante la presentación',()=>{
    const match = make()
    ko(match,1)
    advance(match,STAND.window+1)
    const p = match.players[0]
    p.zone.energy = 100
    p.zone.activate(p.rules)
    p.garbage.push({lines:5,hole:3,ready:0})
    const frozen = p.exportState()
    const tick = match.now
    match.advanceStand(2499)
    for (let i=0;i<20;i++) match.tick([{held:new Set(['left']),pressed:['hold','hard','cw']}])
    expect(match.now).toBe(tick)
    expect(p.exportState()).toEqual(frozen)
    match.advanceStand(STAND.presentation)
    match.tick()
    expect(match.now).toBe(tick+1)
    expect(p.stats.pieces).toBe(0)
    expect(p.hold).toBeNull()
    expect(p.zone.remaining).toBe(frozen.zone.remaining-1)
  })
  it('sincroniza la regla del anfitrión, la fija al empezar y juega con la opción apagada',()=>{
    const {users,send,advance} = onlineRoom()
    expect(users[1].last('lobby').lobby).toMatchObject({format:'teams',lastStand:true})
    send(1,{type:'lastStand',value:false})
    expect(users[0].last('lobby').lobby.lastStand).toBe(true)
    send(0,{type:'lastStand',value:false})
    expect(users[1].last('lobby').lobby.lastStand).toBe(false)
    send(0,{type:'start'})
    expect(users[1].last('start')).toMatchObject({format:'teams',lastStand:false})
    send(0,{type:'lastStand',value:true})
    advance(users[0].last('start').countdown+STAND.window+3)
    expect(users[0].last('frame').state.teams?.stand).toBeNull()
    expect(users[1].last('frame')).toEqual(users[0].last('frame'))
  })
  it('publica una tirada online, conserva el snapshot al reconectar y descarta inputs de la pausa',()=>{
    const {room,users,send,advance,now} = onlineRoom()
    send(0,{type:'start'})
    const start = users[0].last('start')
    advance(start.countdown)
    // Los dos primeros asientos corresponden a equipos distintos: provocar los KO con inputs reales.
    let seq = 0
    for (let i=0;i<22 && !users[0].last('frame')?.state.teams?.stand?.event;i++) {
      ++seq
      for (const user of [0,1]) send(user,{type:'input',seq,held:0,pressed:['hard']})
      advance(3)
    }
    const frame = users[0].last('frame')
    const state = frame.state.teams?.stand
    expect(state?.event?.kind).toBe('double')
    expect(frame).toEqual(users[2].last('frame'))
    const id = state!.event!.id
    const resumed = peer()
    room.disconnect(users[2].socket,now())
    advance(3*HZ)
    room.join(resumed.socket,join(2),now())
    expect(resumed.last('start').rejoin).toBe(true)
    const rejoinFrame = resumed.last('frame')
    const replica = new OnlineTeamsMatch(start)
    expect(replica.load(rejoinFrame)).toBe(true)
    expect(replica.load(rejoinFrame)).toBe(false)
    expect(replica.standPaused).toBe(true)
    expect(replica.stand?.event).toEqual(state?.event)
    const survivor = users[3].last('welcome').slot
    send(3,{type:'input',seq:1,held:0,pressed:['hard','hold'],standId:id})
    advance(HZ)
    expect(users[0].last('frame').state.now).toBe(frame.state.now)
    advance(STAND.presentation/STEP_MS)
    const after = users[0].last('frame')
    expect(after.state.teams?.stand?.active).toBe('double')
    expect(after.state.players[survivor].stats.pieces).toBe(0)
    expect(after.state.players[survivor].hold).toBeNull()
    expect(replica.load(after)).toBe(true)
    expect(replica.standPaused).toBe(false)
    expect(replica.load(rejoinFrame)).toBe(false)
    send(3,{type:'input',seq:2,held:0,pressed:['hard']})
    advance(3)
    expect(users[0].last('frame').state.players[survivor].stats.pieces).toBe(0)
    send(3,{type:'input',seq:3,held:0,pressed:['hard'],standId:id})
    advance(3)
    expect(users[0].last('frame').state.players[survivor].stats.pieces).toBe(1)
  })
  it('cuatro IA juegan hasta un resultado con la regla habilitada',()=>{
    const match = new Match(DEFAULT_RULES,'stand-bots',roster.map(p=>({...p,level:6})),false,true)
    for (let step=0;step<30_000 && !match.finished;step++) {
      if (match.standPaused) match.advanceStand(STAND.presentation)
      else match.tick()
    }
    expect(match.finished).toBe(true)
    expect(match.stand?.event).toBeTruthy()
    expect(match.players.every(p=>p.stats.pieces>0)).toBe(true)
  })
  it('codifica filas selladas y estados de premio en snapshots',()=>{
    const match = award('cursedFoundation')
    const client = new OnlineTeamsMatch({seed:match.seed,names:[],levels:[null,null,null,null],countdown:0})
    const frame:Frame = {type:'frame',frameId:1,state:JSON.parse(JSON.stringify(snapshot(match))),acks:[],events:[],fallen:[]}
    expect(client.load(frame)).toBe(true)
    expect(client.players[2].board).toEqual(match.players[2].board)
    expect(client.players[0].stand).toEqual(match.players[0].stand)
    expect(client.stand).toEqual(match.stand)
  })
})

it('emite una sola secuencia sonora para las dos ruedas y omite fases anteriores al reconectar',()=>{
  vi.stubGlobal('document',{documentElement:{lang:'es'}})
  vi.stubGlobal('navigator',{language:'es-CL'})
  try {
    const root = {dataset:{},querySelectorAll:()=>[{style:{}},{style:{}}]} as unknown as HTMLElement
    const sound = {playEffect:vi.fn()}
    const match = make()
    ko(match,1,3)
    match.tick()
    const view = new LastStandView(root,sound as unknown as Sound,roster,['volt','nix','pix','blaze'],false)
    for (const ms of [0,0,400,400,700,1900,1900,2000]) view.draw(match,true,ms,true)
    expect(sound.playEffect.mock.calls.flat()).toEqual(['double-last-stand-start','last-stand-spin','double-last-stand-reveal'])
    sound.playEffect.mockClear()
    const rejoin = new LastStandView(root,sound as unknown as Sound,roster,['volt','nix','pix','blaze'],true)
    rejoin.draw(match,false,600,true)
    rejoin.draw(match,false,1900,true)
    expect(sound.playEffect.mock.calls.flat()).toEqual(['double-last-stand-reveal'])
  } finally { vi.unstubAllGlobals() }
})

it('localiza lobby, cinemáticas y los dos catálogos en ES/EN',()=>{
  const es = lastStandCopy('es-CL'), en = lastStandCopy('en-US')
  expect([es.enabled,es.disabled,en.enabled,en.disabled]).toEqual(['Activada','Desactivada','Enabled','Disabled'])
  expect([es.single,es.versus,en.single,en.versus]).toEqual(['Último en pie','Últimos en pie','Last Stand','Final Duel'])
  for (const prize of [...LAST_STAND_PRIZES,...DOUBLE_STAND_PRIZES]) {
    expect(es[prize]).toBeTruthy()
    expect(en[prize]).toBeTruthy()
    expect(es[prize]).not.toBe(en[prize])
  }
})


describe('Last Stand V2 presentation copy',()=>{
  it('has matching localized descriptions for each reward',()=>{
    for (const prize of [...LAST_STAND_PRIZES,...DOUBLE_STAND_PRIZES]) {
      const key=standDescriptions[prize]
      expect(lastStandCopy('es')[key].length).toBeGreaterThan(15)
      expect(lastStandCopy('en')[key].length).toBeGreaterThan(15)
    }
  })
  it('keeps a 3-second readable reveal inside the 6.35-second frozen presentation',()=>{
    expect(STAND.presentation).toBe(6350)
    expect(STAND.revealAt).toBe(3100)
    expect(STAND.exitAt-STAND.revealAt).toBe(3000)
    expect(STAND.presentation-STAND.exitAt).toBe(250)
  })
})
