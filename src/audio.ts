import type { Mix } from './settings'
import type { GameEvent } from './engine/player'
import blitzTrack from './music/blitz.mp3?url'
type Bus = Exclude<keyof Mix,'master'|'mute'|'music'>
type Patch = [Bus, OscillatorType, number[], number, number]
const PATCHES: Record<string,Patch> = {
  blitzWarning:['alert','triangle',[720],0.12,5],
  blitzChange:['alert','square',[784,1047],0.13,6],
  blitzRotate:['move','triangle',[294,587,880],0.09,5],
  blitzEmergency:['alert','sawtooth',[420,210,440],0.14,7],
  blitzStance:['move','triangle',[510,335],0.065,4],
  blitzGuard:['attack','sine',[330,523,659],0.11,5],
  blitzProtected:['attack','triangle',[410,620],0.08,4],
  blitzDown:['alert','triangle',[324,178,88],0.17,6],
  blitzChallenge:['play','square',[494,659,988],0.085,6],
  blitzRevived:['play','triangle',[262,392,523,784,1047],0.15,7],
  blitzLast:['alert','sine',[250,250,390],0.19,6],
  blitzVictory:['play','triangle',[392,523,659,988,1175],0.20,8],
  move:['move','triangle',[180],0.042,1], rotate:['move','sine',[330,490],0.034,1],
  soft:['move','sine',[145],0.026,1], hard:['move','triangle',[180,82],0.09,2],
  hold:['move','triangle',[380,570,285],0.045,2], lock:['move','sine',[92],0.044,1],
  single:['play','triangle',[330,440],0.075,3], double:['play','triangle',[330,495,660],0.077,3],
  triple:['play','sine',[392,523,659,784],0.078,4], quad:['play','sawtooth',[165,247,330,659,880],0.09,5],
  mini:['play','square',[580,435,690],0.05,3], tZero:['play','triangle',[310,620],0.06,3],
  tSingle:['play','square',[440,554,831],0.06,4], tDouble:['play','triangle',[392,587,740,988],0.072,5],
  tTriple:['play','square',[330,494,659,988,1318],0.08,5],
  spinL:['play','triangle',[262,349,523,392],0.07,4], spinJ:['play','sine',[587,392,294,440],0.08,4],
  spinS:['play','triangle',[370,554,415],0.065,4], spinZ:['play','sawtooth',[466,233,311],0.05,4],
  combo:['play','sine',[660,990],0.055,3], backToBack:['play','square',[330,330,660],0.05,4],
  perfect:['play','triangle',[262,392,523,659,784,1047],0.11,6],
  zoneStart:['zone','sawtooth',[110,165,247,370,554],0.12,6],
  zoneLoop:['zone','sine',[55],0.75,2], zoneWarning:['zone','square',[620,550,620],0.105,5],
  zoneEnd:['zone','triangle',[880,587,392,196],0.12,6], zoneAttack:['zone','sawtooth',[82,165,330],0.10,6],
  send:['attack','triangle',[220,440,660],0.05,3], incoming:['attack','triangle',[746,362,151],0.085,6],
  receive:['attack','sawtooth',[120,84],0.095,3], cancel:['attack','triangle',[520,780],0.058,4],
  target:['attack','sine',[660,590],0.04,2], eliminated:['attack','triangle',[392,294,196,98],0.11,6],
  victory:['play','triangle',[392,523,659,784,1047],0.18,7],
  danger:['alert','triangle',[330,330],0.105,4], critical:['alert','square',[587,392,587,392],0.15,7],
}
const VOICES = 20
type Voice = {osc:OscillatorNode; gain:GainNode; priority:number}
export class Sound {
  private context?: AudioContext
  private master?: GainNode
  private buses = new Map<Bus,GainNode>()
  private voices = new Set<Voice>()
  private last = new Map<string,number>()
  private music?: {track:HTMLAudioElement; gain:GainNode}

  constructor(private mix: Mix) {}

  wake() {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        const limiter = this.context.createDynamicsCompressor()
        limiter.threshold.value = -10
        limiter.ratio.value = 12
        this.master = this.context.createGain()
        limiter.connect(this.master).connect(this.context.destination)
        for (const key of ['move','play','attack','alert','zone'] as const) {
          const bus = this.context.createGain()
          bus.connect(limiter)
          this.buses.set(key,bus)
        }
        this.update()
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* Audio is optional on unsupported devices. */ }
  }

  update() {
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(this.mix.mute ? 0 : this.mix.master,now,0.018)
    for (const [key,bus] of this.buses) bus.gain.setTargetAtTime(this.mix[key],now,0.018)
    this.music?.gain.gain.setTargetAtTime(this.mix.music,now,0.032)
  }

  startBlitzMusic() {
    if (!this.context || !this.master) return
    if (!this.music) {
      const track = new Audio(blitzTrack)
      track.loop = true
      const gain = this.context.createGain()
      gain.gain.value = this.mix.music
      this.context.createMediaElementSource(track).connect(gain).connect(this.master)
      this.music = {track,gain}
    }
    this.stopMusic()
    this.resumeMusic()
  }

  resumeMusic() {
    if (this.music) void this.music.track.play().catch(() => {})
  }

  pauseMusic() { this.music?.track.pause() }

  stopMusic() {
    if (!this.music || !this.context) return
    this.music.track.pause()
    this.music.track.currentTime = 0
  }

  play(event: GameEvent, player: number) {
    const context = this.context
    const patch = PATCHES[event.type]
    if (!context || context.state !== 'running' || this.mix.mute || !patch) return
    const [bus,type,notes,length,priority] = patch
    const now = context.currentTime
    const key = player+event.type
    if ((this.last.get(key) ?? -1) + (bus === 'move' ? 0.055 : 0.09) > now) return
    this.last.set(key,now)
    notes.forEach((frequency,i) => {
      if (this.voices.size >= VOICES) {
        const candidate = [...this.voices].find(voice => voice.priority < priority)
        if (!candidate) return
        candidate.gain.disconnect()
        candidate.osc.stop(now)
        this.voices.delete(candidate)
      }
      const start = now + i*length*0.64
      const osc = context.createOscillator()
      const gain = context.createGain()
      const pan = context.createStereoPanner()
      pan.pan.value = (player-1.5)*0.27
      osc.type = type
      osc.frequency.value = frequency * (event.type === 'combo' ? 1+Math.min(12,Number(event.detail))*0.035 : 1)
      const peak = bus === 'move' ? 0.07 : type === 'square' || type === 'sawtooth' ? 0.09 : 0.145
      gain.gain.setValueAtTime(0.0001,start)
      gain.gain.exponentialRampToValueAtTime(peak,start+0.007)
      gain.gain.exponentialRampToValueAtTime(0.0001,start+length)
      osc.connect(gain).connect(pan).connect(this.buses.get(bus)!)
      const voice = {osc,gain,priority}
      this.voices.add(voice)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
        pan.disconnect()
        this.voices.delete(voice)
      }
      osc.start(start)
      osc.stop(start+length+0.006)
    })
  }
}
