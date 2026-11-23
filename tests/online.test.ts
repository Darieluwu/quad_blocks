import { expect, it } from 'vitest'
import { HZ, SETTINGS } from '../src/engine/rules'
import { BATTLE_INTRO_TICKS } from '../src/battle-intro-config'
import { OnlineMatch, parseClient, type ClientMessage, type ServerMessage } from '../src/online/protocol'
import { OnlineRoom, STEP_MS, type Peer } from '../src/online/room'

function client() {
  const messages: ServerMessage[] = []
  const closes: number[] = []
  const peer: Peer = {send:data=>messages.push(JSON.parse(data)),close:code=>closes.push(code)}
  return {peer,messages,closes}
}
const identity = (n: number,create=false): Extract<ClientMessage,{type:'join'}> => ({
  type:'join',token:String(n).padStart(32,'0'),name:`Persona ${n}`,create,
})
const last = <T extends ServerMessage['type']>(peer: ReturnType<typeof client>,type: T) =>
  peer.messages.findLast(message=>message.type===type) as Extract<ServerMessage,{type:T}>

it('valida los mensajes de sala y acepta solo controles de juego acotados',()=>{
  const parse = (value: unknown) => parseClient(JSON.stringify(value))
  expect(parse(identity(0))).toEqual(identity(0))
  expect(parse({...identity(0),token:'falso'})).toBeNull()
  expect(parse({type:'input',held:0,pressed:['pause']})).toBeNull()
  expect(parse({type:'input',held:99999,pressed:[]})).toBeNull()
  expect(parse({type:'input',held:0,pressed:['hard']})).toMatchObject({type:'input'})
  expect(parse({type:'bot',slot:4,level:1})).toBeNull()
  expect(parse({type:'character',slot:1,id:'volt',request:-1})).toBeNull()
})

it('confirma una reserva de personaje desde el servidor y responde solo al cliente que la solicitó',()=>{
  const room = new OnlineRoom()
  const host = client(), guest = client(), reconnected = client()
  room.join(host.peer,identity(1,true),0)
  room.join(guest.peer,identity(2),0)
  room.dispatch(host.peer,{type:'character',slot:1,id:'blaze',request:1},1)
  expect(last(host,'characterConfirmed')).toMatchObject({slot:1,id:'blaze',request:1,accepted:true})
  expect(last(guest,'lobby').lobby.seats[1]).toMatchObject({character:'blaze',ready:false,characterConfirmed:true})
  expect(guest.messages.some(message=>message.type==='characterConfirmed')).toBe(false)
  room.dispatch(guest.peer,{type:'character',slot:2,id:'blaze',request:2},2)
  expect(last(guest,'characterConfirmed')).toMatchObject({request:2,accepted:false})
  expect(last(guest,'lobby').lobby.seats[2]).toMatchObject({character:'pix',ready:false})
  room.dispatch(guest.peer,{type:'character',slot:1,id:'nix',request:3},3)
  expect(last(guest,'characterConfirmed')).toMatchObject({request:3,accepted:false})
  room.dispatch(guest.peer,{type:'character',slot:2,id:'pengu',request:4},4)
  expect(last(guest,'characterConfirmed')).toMatchObject({request:4,accepted:true})
  expect(last(host,'lobby').lobby.seats[2]).toMatchObject({character:'pengu',ready:true})
  room.disconnect(guest.peer,5)
  room.join(reconnected.peer,identity(2),6)
  expect(last(reconnected,'lobby').lobby.seats[2]).toMatchObject({character:'pengu',connected:true,ready:false})
  expect(reconnected.messages.some(message=>message.type==='characterConfirmed')).toBe(false)
})

it('crea una sala por invitación, asigna equipos y sincroniza una partida y su reconexión',()=>{
  const room = new OnlineRoom(()=> 'blitz-test')
  const a = client(), b = client(), guest = client(), replacement = client()
  let now = 1_000_000
  const advance = (count: number) => { for (let i=0;i<count;i++) room.step(now+=STEP_MS) }
  room.join(guest.peer,identity(3),now)
  expect(guest.closes).toEqual([4003])
  room.join(a.peer,identity(1,true),now)
  room.join(b.peer,identity(2),now)
  expect(last(a,'welcome').slot).toBe(0)
  expect(last(b,'welcome').slot).toBe(2)
  room.dispatch(a.peer,{type:'bot',slot:1,level:7},now)
  room.dispatch(a.peer,{type:'character',slot:1,id:'blaze'},now)
  room.dispatch(a.peer,{type:'character',slot:0,id:'pengu'},now)
  room.dispatch(b.peer,{type:'bot',slot:1,level:10},now)
  room.dispatch(a.peer,{type:'ready',value:true},now)
  room.dispatch(b.peer,{type:'character',slot:2,id:'pengu'},now)
  expect(last(b,'error').message).toContain('confirmado')
  room.dispatch(b.peer,{type:'character',slot:1,id:'nix'},now)
  room.dispatch(a.peer,{type:'start'},now)
  expect(last(a,'error').message).toContain('listas')
  room.dispatch(b.peer,{type:'ready',value:true},now)
  room.dispatch(b.peer,{type:'start'},now)
  expect(last(a,'lobby').lobby.phase).toBe('lobby')
  room.dispatch(a.peer,{type:'start'},now)
  const start = last(a,'start')
  expect(start.levels).toEqual([null,7,null,5])
  expect(start.characters).toEqual(['pengu','blaze','pix','astra'])
  expect(last(b,'start')).toEqual(start)
  expect(start.presentation).toBe(BATTLE_INTRO_TICKS.blitz)
  expect(start.countdown).toBe(BATTLE_INTRO_TICKS.blitz+SETTINGS.countdown)
  room.dispatch(a.peer,{type:'input',held:0,pressed:['hard']},now)
  advance(start.countdown-1)
  expect(last(a,'lobby').lobby.phase).toBe('countdown')
  expect(last(a,'frame')).toBeUndefined()
  advance(1)
  expect(last(a,'lobby').lobby.phase).toBe('playing')
  expect(last(a,'countdown')).toEqual({type:'countdown',left:0})
  expect(a.messages.filter(message=>message.type==='countdown')).toEqual(b.messages.filter(message=>message.type==='countdown'))
  expect(last(a,'frame')).toBeUndefined()
  advance(3)
  expect(last(a,'frame')).toEqual(last(b,'frame'))
  expect(last(a,'frame').state.players[0].stats.pieces).toBe(0)
  advance(31*HZ)
  const previous = last(a,'frame').state
  expect(previous.turn).toBe(2)
  expect(previous.players.some(player=>player.stats.pieces>0)).toBe(true)
  room.disconnect(b.peer,now)
  expect(last(a,'lobby').lobby.phase).toBe('paused')
  advance(HZ)
  expect(last(a,'frame').state).toEqual(previous)
  room.join(replacement.peer,identity(2),now)
  expect(last(replacement,'welcome').slot).toBe(2)
  expect(last(replacement,'start')).toMatchObject({rejoin:true,countdown:0,characters:start.characters})
  expect(last(replacement,'frame').state.now).toBeGreaterThanOrEqual(previous.now)
  expect(last(a,'lobby').lobby.phase).toBe('playing')
  const replica = new OnlineMatch(start)
  replica.load(last(replacement,'frame').state)
  expect(replica.players.flatMap(p=>p.board.flat()).some(Boolean)).toBe(true)
  advance(6)
  expect(last(a,'frame')).toEqual(last(replacement,'frame'))
  room.disconnect(replacement.peer,now)
  room.expire(now+76_000)
  expect(last(a,'lobby').lobby.phase).toBe('lobby')
})

it('comparte el resultado de cuatro humanos, limita la sala y devuelve al grupo a la espera',()=>{
  const room = new OnlineRoom(()=> 'alerta')
  const players = Array.from({length:4},client)
  let now = 1_000_000
  for (const [i,player] of players.entries()) room.join(player.peer,identity(i,i===0),now)
  expect(players.map(player=>last(player,'welcome').slot)).toEqual([0,2,1,3])
  const extra = client()
  room.join(extra.peer,identity(4),now)
  expect(last(extra,'error').message).toContain('llena')
  for (const player of players) room.dispatch(player.peer,{type:'ready',value:true},now)
  room.dispatch(players[0].peer,{type:'start'},now)
  for (let i=0;i<HZ*7;i++) {
    for (const slot of [1,3]) room.dispatch(players[slot].peer,{type:'input',held:0,pressed:['hard','hard']},now)
    room.step(now+=STEP_MS)
    if (last(players[0],'frame')?.state.finished) break
  }
  const final = last(players[0],'frame')
  expect(final.state.finished).toBe(true)
  expect(final.state.winningTeam).toBe(0)
  expect(final.fallen).toHaveLength(1)
  expect(final.state.totals).toHaveLength(4)
  for (const player of players) expect(last(player,'frame')).toEqual(final)
  room.dispatch(players[0].peer,{type:'lobby'},now)
  expect(last(players[1],'lobby').lobby.phase).toBe('lobby')
  expect(last(players[1],'lobby').lobby.seats.every(seat=>seat.connected && !seat.ready)).toBe(true)
})
