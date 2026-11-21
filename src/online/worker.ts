import { ROOM_ID, parseClient } from './protocol'
import { OnlineRoom, STEP_MS, type Peer } from './room'

type Namespace = {idFromName:(name:string)=>unknown; get:(id:unknown)=>{fetch:(request:Request)=>Promise<Response>}}
type Env = {ROOMS:Namespace; ASSETS:{fetch:(request:Request)=>Promise<Response>}}
type ServerSocket = WebSocket & {accept:()=>void}
declare const WebSocketPair: new () => [WebSocket,ServerSocket]

const AUTH_TIMEOUT = 4_000
const MAX_PEERS = 12

export class Room {
  private room = new OnlineRoom()
  private peers = new Set<Peer>()
  private timer: ReturnType<typeof setInterval>|undefined
  private previous = 0
  private accumulator = 0

  private run() {
    const now = Date.now()
    this.accumulator += Math.max(0,Math.min(100,now-this.previous))
    this.previous = now
    while (this.accumulator>=STEP_MS) {
      this.accumulator -= STEP_MS
      this.room.step(now)
    }
  }

  fetch(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return new Response('Conéctate desde TETRAVOLT.',{status:426})
    if (this.peers.size>=MAX_PEERS) return new Response('Demasiadas conexiones.',{status:429})
    this.room.expire(Date.now())
    const [client,socket] = new WebSocketPair()
    socket.accept()
    let authorized = false
    let bucket = Date.now()
    let messages = 0
    const peer: Peer = {
      send: data=>{ if (socket.readyState===1) socket.send(data) },
      close: (code,reason)=>{ if (socket.readyState===1) socket.close(code,reason) },
    }
    this.peers.add(peer)
    if (!this.timer) {
      this.previous = Date.now()
      this.accumulator = 0
      this.timer = setInterval(()=>this.run(),STEP_MS)
    }
    const timeout = setTimeout(()=>{ if (!authorized) peer.close(4003,'Identificación requerida') },AUTH_TIMEOUT)
    const disconnect = () => {
      clearTimeout(timeout)
      if (!this.peers.delete(peer)) return
      this.room.disconnect(peer,Date.now())
      if (!this.peers.size) {
        clearInterval(this.timer)
        this.timer = undefined
      }
    }
    socket.addEventListener('close',disconnect)
    socket.addEventListener('error',disconnect)
    socket.addEventListener('message',({data})=>{
      const now = Date.now()
      if (now-bucket>=1000) { bucket = now; messages = 0 }
      if (++messages>120) { peer.close(1008,'Demasiados mensajes'); return }
      const message = parseClient(data)
      if (!message || (message.type==='join')===authorized) { peer.close(1008,'Mensaje inválido'); return }
      if (message.type==='join') {
        authorized = true
        clearTimeout(timeout)
        this.room.join(peer,message,now)
      } else this.room.dispatch(peer,message,now)
    })
    return new Response(null,{status:101,webSocket:client} as ResponseInit & {webSocket:WebSocket})
  }
}

export default {
  fetch(request: Request,env: Env) {
    const url = new URL(request.url)
    if (url.pathname==='/api/online') return new Response(null,{status:204})
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    const code = url.pathname.slice('/api/salas/'.length)
    if (!url.pathname.startsWith('/api/salas/') || !ROOM_ID.test(code)) return new Response(null,{status:404})
    if (request.headers.get('Origin')!==url.origin) return new Response(null,{status:403})
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request)
  },
}
