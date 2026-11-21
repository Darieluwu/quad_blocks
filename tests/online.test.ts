import { expect, it } from 'vitest'
import { HZ } from '../src/engine/rules'
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
  advance(start.countdown+3)
  expect(last(a,'frame')).toEqual(last(b,'frame'))
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
