import type { BlitzMatch } from '../engine/blitz'
import { NO_INPUT } from '../engine/player'
import { HZ } from '../engine/rules'
import { BATTLE_INTRO_TICKS } from '../battle-intro-config'
import { chooseCharacter, uniqueCharacters } from '../characters/catalog'
import { consumeRemote, makeMatch, randomId, snapshot, START_TICKS,
  type ClientMessage, type Frame, type LobbyState, type MatchStart, type RemoteInput, type ServerMessage } from './protocol'

export const STEP_MS = 1000/HZ
const FRAME_TICKS = 3
const REJOIN_MS = 75_000
const IDLE_MS = 600_000
const INPUT_QUEUE_LIMIT = 128
const SEATS = [0,2,1,3]

export type Peer = {send:(data:string)=>void; close:(code:number,reason:string)=>void}
type Member = {token:string; name:string; peer:Peer|null; ready:boolean; input:RemoteInput;
  lastReceivedSeq:number; lastAppliedSeq:number}
const emptyInput = (): RemoteInput => ({held:0,pressed:[]})

export class OnlineRoom {
  private members: (Member|null)[] = [null,null,null,null]
  private botLevels = [5,5,5,5]
  private characters = uniqueCharacters(null)
  private botConfirmed = [false,false,false,false]
  private host = -1
  private phase: LobbyState['phase'] = 'lobby'
  private match: BlitzMatch|null = null
  private startInfo: MatchStart|null = null
  private countdown = 0
  private frameTicks = 0
  private events: Frame['events'] = []
  private fallen: number[] = []
  private pausedAt = 0
  private lastActivity = 0

  constructor(private seed = randomId) {}

  private send(peer: Peer, message: ServerMessage) { peer.send(JSON.stringify(message)) }
  private broadcast(message: ServerMessage) {
    const data = JSON.stringify(message)
    for (const member of this.members) member?.peer?.send(data)
  }
  private error(peer: Peer, message: string, fatal = false) {
    this.send(peer,{type:'error',message,fatal})
    if (fatal) peer.close(4003,'Sala no disponible')
  }
  private lobbyUpdate() {
    this.broadcast({type:'lobby',lobby:{host:this.host,phase:this.phase,
      missing:this.members.flatMap(member=>member && !member.peer ? [member.name] : []),
      seats:this.members.map((member,slot)=>({name:member?.name ?? '',connected:!!member?.peer,
        ready:!!member?.ready,botLevel:this.botLevels[slot],character:this.characters[slot],
        characterConfirmed:member ? member.ready : this.botConfirmed[slot]}))}})
  }

  join(peer: Peer, message: Extract<ClientMessage,{type:'join'}>, now: number) {
    const found = this.members.findIndex(member=>member?.token===message.token)
    if (found>=0) {
      const member = this.members[found]!
      const previous = member.peer
      member.peer = peer
      member.input = emptyInput()
      if (previous!==peer) previous?.close(4002,'Otra pestaña tomó esta plaza')
      this.send(peer,{type:'welcome',slot:found,inputSeq:member.lastReceivedSeq})
      if (this.startInfo) {
        this.send(peer,{type:'start',...this.startInfo,countdown:this.countdown,rejoin:true})
        if (this.match) this.send(peer,{type:'frame',state:snapshot(this.match),acks:this.acknowledgements(),events:[],fallen:[]})
      }
      if (this.phase==='paused' && this.members.every(member=>!member || member.peer)) {
        this.phase = this.countdown ? 'countdown' : 'playing'
        if (this.countdown) this.broadcast({type:'countdown',left:this.countdown})
      }
      this.lobbyUpdate()
      return
    }
    if (this.host===-1 && !message.create) return this.error(peer,'La sala no existe o ha caducado.',true)
    if (this.host!==-1 && message.create) return this.error(peer,'Ese código ya está en uso.',true)
    if (this.phase!=='lobby') return this.error(peer,'La partida ya empezó. Pide otro enlace al anfitrión.',true)
    const slot = SEATS.find(i=>!this.members[i])
    if (slot===undefined) return this.error(peer,'La sala está llena.',true)
    this.members[slot] = {token:message.token,name:message.name.trim(),peer,ready:false,input:emptyInput(),
      lastReceivedSeq:0,lastAppliedSeq:0}
    this.botConfirmed[slot] = false
    if (this.host===-1) this.host = slot
    this.lastActivity = now
    this.send(peer,{type:'welcome',slot,inputSeq:0})
    this.lobbyUpdate()
  }

  dispatch(peer: Peer, message: Exclude<ClientMessage,{type:'join'}>, now: number) {
    const slot = this.members.findIndex(member=>member?.peer===peer)
    if (slot<0) return
    const member = this.members[slot]!
    if (message.type==='leave') { this.disconnect(peer,now,true); return }
    if (message.type==='ping') { this.send(peer,{type:'pong',id:message.id}); return }
    if (message.type==='input') {
      if (this.phase!=='playing') return
      if (message.seq<=member.lastReceivedSeq) return
      if (this.canInput(slot) && member.input.pressed.length+message.pressed.length>INPUT_QUEUE_LIMIT) {
        peer.close(1008,'Demasiadas acciones pendientes')
        return
      }
      member.lastReceivedSeq = message.seq
      if (!this.canInput(slot)) {
        member.input = emptyInput()
        member.lastAppliedSeq = message.seq
        return
      }
      member.input.held = message.held
      member.input.pressed.push(...message.pressed)
      return
    }
    if (message.type==='ready' && this.phase==='lobby') member.ready = message.value
    else if (message.type==='character') {
      const {slot:target,id,request} = message
      const reply = (accepted:boolean) => {
        if (request!==undefined) this.send(peer,{type:'characterConfirmed',slot:target,id,request,accepted})
      }
      if (this.phase!=='lobby' || target!==slot && (slot!==this.host || this.members[target])) { reply(false); return }
      const next = chooseCharacter(this.characters,target,id,this.members.map((seat,i)=>seat ? seat.ready : this.botConfirmed[i]))
      if (!next) {
        this.error(peer,'Ese personaje ya está confirmado por otro participante.')
        this.lobbyUpdate()
        reply(false)
        return
      }
      if (target===slot) {
        if (request!==undefined) member.ready = true
        else if (this.characters[target]!==id) member.ready = false
      } else this.botConfirmed[target] = request!==undefined
      this.characters = next
      this.lastActivity = now
      this.lobbyUpdate()
      reply(true)
      return
    }
    else if (message.type==='bot' && this.phase==='lobby' && slot===this.host && !this.members[message.slot]) {
      this.botLevels[message.slot] = message.level
    } else if (message.type==='lobby' && slot===this.host && this.phase==='results') this.resetLobby()
    else if (message.type==='start' && slot===this.host && this.phase==='lobby') {
      if (this.members.filter(Boolean).length<2 || !this.members.every(seat=>!seat || seat.ready && seat.peer)) {
        return this.error(peer,'Se necesitan dos personas y todas deben estar listas.')
      }
      const levels = this.members.map((seat,i)=>seat ? null : this.botLevels[i])
      const names = this.members.map((seat,i)=>seat?.name ?? `IA ${this.botLevels[i]}`)
      const seed = this.seed()
      this.countdown = START_TICKS
      this.frameTicks = 0
      this.events = []
      this.fallen = []
      this.startInfo = {seed,names,levels,countdown:this.countdown,characters:[...this.characters],presentation:BATTLE_INTRO_TICKS.blitz}
      this.match = makeMatch(seed,levels)
      this.phase = 'countdown'
      this.broadcast({type:'start',...this.startInfo})
    } else return
    this.lastActivity = now
    this.lobbyUpdate()
  }

  private resetLobby() {
    this.match = null
    this.startInfo = null
    this.countdown = 0
    this.phase = 'lobby'
    this.members = this.members.map(member=>member?.peer ? {...member,ready:false,input:emptyInput()} : null)
    if (!this.members[this.host]) this.host = this.members.findIndex(Boolean)
  }

  private canInput(slot: number) {
    return this.phase==='playing' && !!this.match && !this.match.transition &&
      !this.match.players[slot]?.dead && this.match.sides.some(side=>side.active===slot)
  }

  private acknowledgements() {
    return this.members.map(member=>member?.lastAppliedSeq ?? 0)
  }

  disconnect(peer: Peer, now: number, leave = false) {
    const slot = this.members.findIndex(member=>member?.peer===peer)
    if (slot<0) return
    const member = this.members[slot]!
    member.peer = null
    if (this.phase==='lobby' || (leave && this.phase==='results')) {
      this.members[slot] = null
      if (slot===this.host) this.host = this.members.findIndex(Boolean)
    } else if (leave) {
      this.resetLobby()
      this.broadcast({type:'error',message:`${member.name} salió. La partida se cerró.`})
    } else if (this.phase==='playing' || this.phase==='countdown') {
      this.phase = 'paused'
      this.pausedAt = now
      for (const seat of this.members) if (seat) {
        seat.input = emptyInput()
        seat.lastAppliedSeq = seat.lastReceivedSeq
      }
    }
    if (leave) peer.close(1000,'Salió de la sala')
    this.lastActivity = now
    this.lobbyUpdate()
  }

  expire(now: number) {
    if (this.phase==='paused' && now-this.pausedAt>=REJOIN_MS) {
      this.resetLobby()
      this.lastActivity = now
      this.broadcast({type:'error',message:'Se agotó el tiempo de reconexión. La partida se cerró.'})
      this.lobbyUpdate()
    }
    if ((this.phase==='lobby' || this.phase==='results') && now-this.lastActivity>=IDLE_MS) {
      for (const member of this.members) if (member?.peer) this.error(member.peer,'La sala caducó por inactividad.',true)
      this.members = [null,null,null,null]
      this.resetLobby()
    }
  }

  step(now: number) {
    this.expire(now)
    if (this.phase==='countdown') {
      this.countdown--
      if (this.countdown%HZ===0) this.broadcast({type:'countdown',left:this.countdown})
      if (!this.countdown) { this.phase = 'playing'; this.lobbyUpdate() }
      return
    }
    if (this.phase!=='playing' || !this.match) return
    const match = this.match
    const alive = match.players.map(player=>!player.dead)
    const inputs = this.members.map((seat,slot)=>{
      if (!seat) return NO_INPUT
      if (!this.canInput(slot)) {
        seat.input = emptyInput()
        seat.lastAppliedSeq = seat.lastReceivedSeq
        return NO_INPUT
      }
      seat.lastAppliedSeq = seat.lastReceivedSeq
      return consumeRemote(seat.input)
    })
    match.tick(inputs)
    for (const [slot,player] of match.players.entries()) {
      if (player.zone.active && player.zone.remaining%(HZ*2)===0 && player.zone.remaining!==player.zone.duration) player.event('zoneLoop')
      for (const event of player.events) this.events.push({slot,event})
      player.events.length = 0
    }
    if (match.finished) this.fallen = match.players.flatMap((player,i)=>alive[i] && player.dead ? [i] : [])
    if (++this.frameTicks>=FRAME_TICKS || match.finished) {
      this.broadcast({type:'frame',state:snapshot(match),acks:this.acknowledgements(),events:this.events,fallen:this.fallen})
      this.events = []
      this.frameTicks = 0
    }
    if (match.finished) {
      this.phase = 'results'
      this.lastActivity = now
      this.lobbyUpdate()
    }
  }
}
