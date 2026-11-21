import type { Input } from '../engine/player'
import { actionMask, PLAY_ACTIONS, PRESS_LIMIT, randomId, ROOM_ID, type ClientMessage, type ServerMessage } from './protocol'

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
  private ended = false
  private admitted = false
  private attempts = 0
  private held = 0
  private token: string

  constructor(readonly code: string, private name: string, private create: boolean,
    private receive: (message: ServerMessage)=>void, private connection: (state:'connecting'|'lost'|'closed')=>void) {
    this.token = sessionStorage.getItem(this.key) ?? randomId()
  }

  private get key() { return 'tetravolt-seat:'+this.code }

  connect() {
    this.connection(this.admitted ? 'lost' : 'connecting')
    const url = new URL('/api/salas/'+this.code,location.href)
    url.protocol = location.protocol==='https:' ? 'wss:' : 'ws:'
    const socket = this.socket = new WebSocket(url)
    this.held = 0
    socket.addEventListener('open',()=>this.send({type:'join',token:this.token,name:this.name,create:this.create}))
    socket.addEventListener('message',({data})=>{
      if (this.ended || this.socket!==socket) return
      const message = JSON.parse(data) as ServerMessage
      if (message.type==='welcome') {
        this.admitted = true
        this.create = false
        this.attempts = 0
        sessionStorage.setItem(this.key,this.token)
      }
      this.receive(message)
    })
    socket.addEventListener('close',({code})=>{
      if (this.ended || this.socket!==socket) return
      if (!this.admitted || [1000,1008,4002,4003].includes(code) || ++this.attempts>25) {
        this.connection('closed')
        return
      }
      this.connection('lost')
      this.timer = window.setTimeout(()=>this.connect(),Math.min(3000,750*this.attempts))
    })
  }

  send(message: ClientMessage) {
    if (this.socket?.readyState===WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  input(input: Input) {
    const held = actionMask(input.held)
    const pressed = input.pressed.filter(action=>PLAY_ACTIONS.some(allowed=>allowed===action)).slice(0,PRESS_LIMIT)
    if (held!==this.held || pressed.length) this.send({type:'input',held,pressed})
    this.held = held
  }

  close(leave = true) {
    this.ended = true
    clearTimeout(this.timer)
    if (leave) this.send({type:'leave'})
    this.socket?.close()
    if (leave) sessionStorage.removeItem(this.key)
  }
}
