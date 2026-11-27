import type { Input } from '../engine/player'
import { actionMask, PLAY_ACTIONS, PRESS_LIMIT, randomId, ROOM_ID, type ClientMessage, type OnlineFormat, type ServerMessage } from './protocol'

export function inviteCode(value: string) {
  const text = value.trim()
  if (ROOM_ID.test(text)) return text
  try {
    const code = new URL(text).searchParams.get('sala') ?? ''
    return ROOM_ID.test(code) ? code : ''
  } catch { return '' }
}

export class RoomClient {
  private socket: WebSocket|null = null
  private timer = 0
  private pingTimer = 0
  private ended = false
  private admitted = false
  private attempts = 0
  private held = 0
  private inputSeq = 0
  private pending: {seq:number; input:Input}[] = []
  private pingId = 0
  private pendingPing: {id:number; sentAt:number}|null = null
  private ping = 0
  private jitter = 0
  private previousPing = 0
  private snapshotTimes: number[] = []
  private snapshotIntervalMs = 0
  private lastSnapshotAt = 0
  private token: string

  constructor(readonly code: string, private name: string, private create: boolean,
    private receive: (message: ServerMessage)=>void, private connection: (state:'connecting'|'lost'|'closed')=>void,
    private format?:OnlineFormat) {
    this.token = sessionStorage.getItem(this.key) ?? randomId()
  }

  private get key() { return 'tetravolt-seat:'+this.code }

  connect() {
    clearInterval(this.pingTimer)
    this.connection(this.admitted ? 'lost' : 'connecting')
    const url = new URL('/api/salas/'+this.code,location.href)
    url.protocol = location.protocol==='https:' ? 'wss:' : 'ws:'
    const socket = this.socket = new WebSocket(url)
    this.held = 0
    socket.addEventListener('open',()=>this.send({type:'join',token:this.token,name:this.name,create:this.create,format:this.format}))
    socket.addEventListener('message',({data})=>{
      if (this.ended || this.socket!==socket) return
      const message = JSON.parse(data) as ServerMessage
      if (message.type==='welcome') {
        this.admitted = true
        this.create = false
        this.attempts = 0
        this.inputSeq = Math.max(this.inputSeq,message.inputSeq)
        this.pending = this.pending.filter(command=>command.seq>message.inputSeq)
        sessionStorage.setItem(this.key,this.token)
        this.pingTimer = window.setInterval(()=>this.measurePing(),2000)
      } else if (message.type==='pong' && this.pendingPing?.id===message.id) {
        this.ping = performance.now()-this.pendingPing.sentAt
        if (this.previousPing) {
          const variation = Math.abs(this.ping-this.previousPing)
          this.jitter += (variation-this.jitter)/16
        }
        this.previousPing = this.ping
        this.pendingPing = null
      } else if (message.type==='frame') {
        const now = performance.now()
        if (this.lastSnapshotAt) this.snapshotIntervalMs = now-this.lastSnapshotAt
        this.lastSnapshotAt = now
        this.snapshotTimes.push(now)
        this.snapshotTimes = this.snapshotTimes.filter(time=>now-time<=5000)
      }
      this.receive(message)
    })
    socket.addEventListener('close',({code})=>{
      if (this.ended || this.socket!==socket) return
      if (!this.admitted || [1000,1008,4002,4003].includes(code) || ++this.attempts>25) {
        clearInterval(this.pingTimer)
        this.connection('closed')
        return
      }
      clearInterval(this.pingTimer)
      this.connection('lost')
      this.timer = window.setTimeout(()=>this.connect(),Math.min(3000,750*this.attempts))
    })
  }

  send(message: ClientMessage) {
    if (this.socket?.readyState!==WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  input(input: Input, standId?:number) {
    const held = actionMask(input.held)
    const pressed = input.pressed.filter(action=>PLAY_ACTIONS.some(allowed=>allowed===action)).slice(0,PRESS_LIMIT)
    if ((held!==0 || pressed.length>0 || held!==this.held) && this.socket?.readyState===WebSocket.OPEN) {
      const seq = ++this.inputSeq
      const message: ClientMessage = {type:'input',seq,held,pressed,standId}
      if (this.send(message)) {
        this.pending.push({seq,input:{held:new Set(input.held),pressed:pressed.slice()}})
        this.held = held
        return seq
      }
    }
    this.held = held
    return 0
  }

  clearPending() {
    this.pending.length = 0
    this.held = 0
  }

  acknowledge(acks: readonly number[],slot: number) {
    const ack = acks[slot] ?? 0
    this.pending = this.pending.filter(command=>command.seq>ack)
    return this.pending.slice()
  }

  get metrics() {
    const times = this.snapshotTimes
    const snapshotHz = times.length>1 ? (times.length-1)*1000/(times[times.length-1]-times[0]) : 0
    return {
      ping:this.ping,
      jitter:this.jitter,
      snapshotHz,
      snapshotIntervalMs:this.snapshotIntervalMs,
      pendingInputs:this.pending.length,
    }
  }

  private measurePing() {
    const id = ++this.pingId
    this.pendingPing = {id,sentAt:performance.now()}
    if (!this.send({type:'ping',id})) this.pendingPing = null
  }

  close(leave = true) {
    this.ended = true
    clearTimeout(this.timer)
    clearInterval(this.pingTimer)
    if (leave) this.send({type:'leave'})
    this.socket?.close()
    if (leave) sessionStorage.removeItem(this.key)
  }
}
