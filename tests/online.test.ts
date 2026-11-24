import { expect, it } from 'vitest'
import { Match, teamForSlot } from '../src/engine/match'
import { DEFAULT_RULES, HZ, SETTINGS } from '../src/engine/rules'
import { NO_INPUT, type Action, type Input } from '../src/engine/player'
import { BATTLE_INTRO_TICKS } from '../src/battle-intro-config'
import { OnlineMatch, actionMask, parseClient, snapshot, type ClientMessage, type Frame, type ServerMessage } from '../src/online/protocol'
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
  expect(parse({type:'input',seq:1,held:0,pressed:['pause']})).toBeNull()
  expect(parse({type:'input',seq:1,held:99999,pressed:[]})).toBeNull()
  expect(parse({type:'input',seq:1,held:0,pressed:['hard']})).toMatchObject({type:'input'})
  expect(parse({type:'input',seq:0,held:0,pressed:[]})).toBeNull()
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
  room.dispatch(a.peer,{type:'input',seq:1,held:0,pressed:['hard']},now)
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
  const inputSeq = [0,0,0,0]
  for (let i=0;i<HZ*7;i++) {
    for (const slot of [1,3]) room.dispatch(players[slot].peer,
      {type:'input',seq:++inputSeq[slot],held:0,pressed:['hard','hard']},now)
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

it('predice movimientos, reconcilia inputs pendientes y no predice en plazas Blitz inactivas',()=>{
  const start = {seed:'latency-prediction',names:['A','B','C','D'],levels:[null,null,null,null],countdown:0}
  const server = new OnlineMatch(start)
  const client = new OnlineMatch(start)
  const slot = server.sides[0].active
  const before = server.players[slot].active
  client.load(structuredClone(snapshot(server)))
  const commands = [
    {held:new Set<Action>(),pressed:['left'] as const},
    {held:new Set<Action>(),pressed:['cw'] as const},
    {held:new Set<Action>(),pressed:['ccw'] as const},
  ]
  for (const command of commands) expect(client.predictMovement(slot,command)).toBe(true)
  expect(client.players[slot].active.x).toBe(before.x-1)
  expect(client.players[slot].active.rotation).toBe(before.rotation)

  for (let tick=0;tick<18;tick++) server.tick()
  client.load(structuredClone(snapshot(server)))
  for (const command of commands) client.predictMovement(slot,command)
  expect(client.players[slot].active.x).toBe(server.players[slot].active.x-1)
  expect(client.players[slot].active.rotation).toBe(server.players[slot].active.rotation)

  for (const command of commands) {
    const inputs: Input[] = Array.from({length:4},()=>({held:new Set<Action>(),pressed:[]}))
    inputs[slot] = command
    server.tick(inputs)
  }
  client.load(structuredClone(snapshot(server)))
  expect(client.players[slot].active).toEqual(server.players[slot].active)
  const inactive = server.sides[0].members.find(member=>member!==slot)!
  const inactiveX = client.players[inactive].active.x
  expect(client.predictMovement(inactive,{held:new Set(),pressed:['left']})).toBe(false)
  expect(client.players[inactive].active.x).toBe(inactiveX)
})

it('acknowledges sequenced input once and drops input for an inactive Blitz seat',()=>{
  const room = new OnlineRoom(()=> 'input-ack-test')
  const players = Array.from({length:4},client)
  let now = 1_000_000
  for (const [i,player] of players.entries()) room.join(player.peer,identity(i,i===0),now)
  for (const player of players) room.dispatch(player.peer,{type:'ready',value:true},now)
  room.dispatch(players[0].peer,{type:'start'},now)
  for (let i=0;i<last(players[0],'start').countdown;i++) room.step(now+=STEP_MS)
  for (let i=0;i<3;i++) room.step(now+=STEP_MS)
  const frame = last(players[0],'frame')
  const active = frame.state.sides[0].active
  const slotPeers = [players[0],players[2],players[1],players[3]]
  const before = frame.state.players[active].active
  room.dispatch(slotPeers[active].peer,{type:'input',seq:1,held:0,pressed:['cw']},now)
  room.dispatch(slotPeers[active].peer,{type:'input',seq:1,held:0,pressed:['ccw']},now)
  const inactive = frame.state.sides[0].members.find(slot=>slot!==active)!
  const inactivePiece = frame.state.players[inactive].active
  room.dispatch(slotPeers[inactive].peer,{type:'input',seq:1,held:1,pressed:['left']},now)
  for (let i=0;i<3;i++) room.step(now+=STEP_MS)
  const confirmed = last(players[0],'frame')
  expect(confirmed.acks[active]).toBe(1)
  expect(confirmed.acks[inactive]).toBe(1)
  expect(confirmed.state.players[active].active.rotation).toBe((before.rotation+1)%4)
  expect(confirmed.state.players[inactive].active).toEqual(inactivePiece)
})

function simulateLatency(rttMs: number, jitterMs: number) {
  const room = new OnlineRoom(() => `lat-${rttMs}-${jitterMs}`)
  const peers = Array.from({length: 4}, client)
  let now = 1_000_000
  for (const [i, p] of peers.entries()) room.join(p.peer, identity(i, i === 0), now)
  for (const p of peers) room.dispatch(p.peer, {type: 'ready', value: true}, now)
  room.dispatch(peers[0].peer, {type: 'start'}, now)
  const start = last(peers[0], 'start')
  for (let i = 0; i < start.countdown; i++) room.step(now += STEP_MS)

  const slotPeers = [peers[0], peers[2], peers[1], peers[3]]
  // Step 3 ticks to get initial frame and identify active slot on team 0
  for (let i = 0; i < 3; i++) room.step(now += STEP_MS)
  const initFrame = last(peers[0], 'frame')
  const activeSlot = initFrame.state.sides[0].active
  const localClient = new OnlineMatch(start)
  localClient.reconcile(initFrame, activeSlot, [])

  const oneWayTicks = Math.round((rttMs / 2) / STEP_MS)
  const jitterTicks = Math.round(jitterMs / STEP_MS)
  const inFlightToServer: {deliverAt: number; msg: Extract<ClientMessage, {type: 'input'}>}[] = []
  const inFlightToClient: {deliverAt: number; frame: Frame}[] = []
  const pending: {seq: number; input: Input}[] = []
  let seq = 0
  let lastFrameCount = slotPeers[activeSlot].messages.filter(m => m.type === 'frame').length
  let heldMask = 0

  const script = new Map<number, Input>([
    [1, {held: new Set<Action>(['left']), pressed: ['left']}],
    [2, {held: new Set<Action>(['left']), pressed: []}],
    [10, {held: new Set<Action>(['left']), pressed: ['cw']}],
    [12, {held: new Set<Action>(), pressed: ['hold']}],
    [15, {held: new Set<Action>(['right']), pressed: ['right']}],
    [16, {held: new Set<Action>(['right']), pressed: ['ccw']}],
    [22, {held: new Set<Action>(), pressed: ['hard']}],
    [25, {held: new Set<Action>(), pressed: ['soft']}],
    [28, {held: new Set<Action>(), pressed: ['half']}],
    [32, {held: new Set<Action>(), pressed: ['hard']}],
  ])

  const totalTicks = 80
  for (let t = 1; t <= totalTicks; t++) {
    const input = script.get(t) ?? NO_INPUT
    const mask = actionMask(input.held)
    let sentSeq = 0
    if (mask !== 0 || input.pressed.length > 0 || mask !== heldMask) {
      sentSeq = ++seq
      pending.push({seq: sentSeq, input: {held: new Set(input.held), pressed: input.pressed.slice()}})
      const jitter = jitterTicks ? ((t % 3) - 1) * jitterTicks : 0
      inFlightToServer.push({
        deliverAt: Math.max(t, t + oneWayTicks + jitter),
        msg: {type: 'input', seq: sentSeq, held: mask, pressed: input.pressed.slice()},
      })
    }
    heldMask = mask

    // Client simulates immediately on tick t
    const pieceBefore = {...localClient.players[activeSlot].active}
    localClient.stepLocal(activeSlot, input, sentSeq)
    if (t === 1) expect(localClient.players[activeSlot].active.x).toBe(pieceBefore.x - 1)
    if (t === 10) expect(localClient.players[activeSlot].active.rotation).not.toBe(pieceBefore.rotation)

    // Deliver client -> server messages arriving at tick t
    for (let i = inFlightToServer.length - 1; i >= 0; i--) {
      if (inFlightToServer[i].deliverAt <= t) {
        room.dispatch(slotPeers[activeSlot].peer, inFlightToServer[i].msg, now)
        inFlightToServer.splice(i, 1)
      }
    }

    // Advance server 1 tick
    room.step(now += STEP_MS)
    const frames = slotPeers[activeSlot].messages.filter((m): m is Frame => m.type === 'frame')
    if (frames.length > lastFrameCount) {
      lastFrameCount = frames.length
      const f = frames[frames.length - 1]
      const jitter = jitterTicks ? ((t % 2) ? jitterTicks : 0) : 0
      inFlightToClient.push({deliverAt: t + oneWayTicks + jitter, frame: structuredClone(f)})
    }

    // Deliver server -> client frames arriving at tick t
    for (let i = inFlightToClient.length - 1; i >= 0; i--) {
      if (inFlightToClient[i].deliverAt <= t) {
        const f = inFlightToClient[i].frame
        inFlightToClient.splice(i, 1)
        const ack = f.acks[activeSlot] ?? 0
        const remaining = pending.filter(c => c.seq > ack)
        pending.splice(0, pending.length, ...remaining)
        localClient.reconcile(f, activeSlot, remaining)
      }
    }
  }

  // Drain remaining in-flight packets and verify client & server converge to identical state
  for (let extra = totalTicks + 1; extra <= totalTicks + 40; extra++) {
    for (let i = inFlightToServer.length - 1; i >= 0; i--) {
      if (inFlightToServer[i].deliverAt <= extra) {
        room.dispatch(slotPeers[activeSlot].peer, inFlightToServer[i].msg, now)
        inFlightToServer.splice(i, 1)
      }
    }
    room.step(now += STEP_MS)
    const frames = slotPeers[activeSlot].messages.filter((m): m is Frame => m.type === 'frame')
    if (frames.length > lastFrameCount) {
      lastFrameCount = frames.length
      inFlightToClient.push({deliverAt: extra + oneWayTicks, frame: structuredClone(frames[frames.length - 1])})
    }
    for (let i = inFlightToClient.length - 1; i >= 0; i--) {
      if (inFlightToClient[i].deliverAt <= extra) {
        const f = inFlightToClient[i].frame
        inFlightToClient.splice(i, 1)
        const ack = f.acks[activeSlot] ?? 0
        const remaining = pending.filter(c => c.seq > ack)
        pending.splice(0, pending.length, ...remaining)
        localClient.reconcile(f, activeSlot, remaining)
      }
    }
    localClient.stepLocal(activeSlot, NO_INPUT, 0)
  }

  const finalServerFrame = last(slotPeers[activeSlot], 'frame')
  return {localClient, finalServerFrame, activeSlot}
}

for (const [rtt, jitter] of [[0, 0], [100, 15], [200, 25], [300, 35]] as const) {
  it(`simula inmediatamente sin teletransportes recurrentes con latencia ${rtt}ms y jitter ${jitter}ms`, () => {
    const {localClient, finalServerFrame, activeSlot} = simulateLatency(rtt, jitter)
    expect(localClient.diagnostics.divergences).toBeLessThanOrEqual(2)
    expect(localClient.players[activeSlot].stats.pieces).toBeGreaterThanOrEqual(2)
    expect(localClient.players[activeSlot].hold).toBe(finalServerFrame.state.players[activeSlot].hold)
  })
}

it('reconcilia basura inesperada con rollback y replay sin perder inputs pendientes', () => {
  const start = {seed: 'rollback-garbage', names: ['A', 'B', 'C', 'D'], levels: [null, null, null, null], countdown: 0}
  const server = new OnlineMatch(start)
  const clientMatch = new OnlineMatch(start)
  const slot = server.sides[0].active
  clientMatch.reconcile({type: 'frame', frameId: 1, state: structuredClone(snapshot(server)), acks: [0, 0, 0, 0], events: [], fallen: []}, slot, [])

  // Client runs 5 ticks ahead: moves left at tick 1, cw at tick 3, hard drop at tick 5
  const pending: {seq: number; input: Input}[] = []
  const seqInputs: [number, Input][] = [
    [1, {held: new Set(['left']), pressed: ['left']}],
    [2, {held: new Set(['left']), pressed: []}],
    [3, {held: new Set(), pressed: ['cw']}],
    [4, NO_INPUT],
    [5, {held: new Set(), pressed: ['hard']}],
  ]
  for (const [seq, inp] of seqInputs) {
    pending.push({seq, input: inp})
    clientMatch.stepLocal(slot, inp, seq)
  }
  expect(clientMatch.players[slot].stats.pieces).toBe(1)

  // Server advances 2 ticks (acks seq 1 & 2) AND injects 3 garbage lines on server
  for (let i = 0; i < 2; i++) {
    const inputs: Input[] = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]
    inputs[slot] = seqInputs[i][1]
    server.tick(inputs)
  }
  server.players[slot].garbage.push({lines: 3, hole: 4, ready: 0})
  // Lock a piece or trigger garbage directly by simulating garbage arrival at tick 2
  const serverSnap = structuredClone(snapshot(server))
  const unacked = pending.filter(c => c.seq > 2)
  const res = clientMatch.reconcile({type: 'frame', frameId: 2, state: serverSnap, acks: [2, 0, 0, 0], events: [], fallen: []}, slot, unacked)

  expect(res.rolledBack).toBe(true)
  expect(res.reason).toBe('garbage')
  // Unacked cw (seq 3) and hard drop (seq 5) were replayed, and the 3 garbage lines were incorporated on lock!
  expect(clientMatch.players[slot].stats.pieces).toBe(1)
  expect(clientMatch.players[slot].stats.received).toBe(3)
})

it('detiene predicción en relevo Blitz, descarta frames duplicados y mantiene equivalencia en VS4 y 2v2', () => {
  const start = {seed: 'blitz-relay-v2', names: ['A', 'B', 'C', 'D'], levels: [null, null, null, null], countdown: 0}
  const server = new OnlineMatch(start)
  const clientMatch = new OnlineMatch(start)
  const firstActive = server.sides[0].active
  const teammate = server.sides[0].members.find(s => s !== firstActive)!
  clientMatch.reconcile({type: 'frame', frameId: 1, state: structuredClone(snapshot(server)), acks: [0, 0, 0, 0], events: [], fallen: []}, firstActive, [])
  expect(clientMatch.isSlotActive(firstActive)).toBe(true)

  // Advance server to end of Blitz turn 1
  for (let i = 0; i < server.turnTicks; i++) server.tick()
  expect(server.transition).toBeGreaterThan(0)
  expect(server.sides[0].active).toBe(teammate)

  const relayFrame: Frame = {type: 'frame', frameId: 2, state: structuredClone(snapshot(server)), acks: [0, 0, 0, 0], events: [], fallen: []}
  const res = clientMatch.reconcile(relayFrame, firstActive, [{seq: 99, input: {held: new Set(), pressed: ['hard']}}])
  expect(res.localActive).toBe(false)
  expect(clientMatch.isSlotActive(firstActive)).toBe(false)
  expect(clientMatch.stepLocal(firstActive, {held: new Set(), pressed: ['hard']}, 100)).toEqual([])

  // Duplicate / older frameId is ignored
  const dup = clientMatch.reconcile({type: 'frame', frameId: 2, state: structuredClone(snapshot(server)), acks: [0, 0, 0, 0], events: [], fallen: []}, firstActive, [])
  expect(dup.accepted).toBe(false)

  // VS4 and 2v2 deterministic state equivalence with Player.exportState / importState
  for (const teams of [false, true]) {
    const roster = Array.from({length: 4}, (_, slot) => teams ? {slot, team: teamForSlot(slot)} : {slot})
    const m1 = new Match(DEFAULT_RULES, `mode-${teams}`, roster)
    const m2 = new Match(DEFAULT_RULES, `mode-${teams}`, roster)
    const actions: Input[] = [
      {held: new Set(['left']), pressed: ['left']},
      {held: new Set(), pressed: ['cw']},
      {held: new Set(), pressed: ['hard']},
      {held: new Set(), pressed: ['hold']},
    ]
    for (let t = 0; t < 20; t++) {
      const inp = [actions[t % 4], NO_INPUT, actions[(t + 1) % 4], NO_INPUT]
      m1.tick(inp)
      m2.tick(inp)
    }
    const saved = m1.players[0].exportState()
    m2.players[0].importState(saved)
    expect(m2.players[0].exportState()).toEqual(m1.players[0].exportState())
  }
})
