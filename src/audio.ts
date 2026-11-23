import type { Mix } from './settings'
import type { GameEvent } from './engine/player'
import blitzTrack from './music/blitz.mp3?url'
type Music = 'blitz'|'selection'|'menu'
const optionalTracks = import.meta.glob<string>('./music/selection.mp3',{eager:true,import:'default',query:'?url&no-inline'})
const optionalMenu = import.meta.glob<string>('./music/menu.mp3',{eager:true,import:'default',query:'?url&no-inline'})
const tracks:Record<Music,string|undefined> = {blitz:blitzTrack,selection:optionalTracks['./music/selection.mp3'],menu:optionalMenu['./music/menu.mp3']}
const optionalEffects = import.meta.glob<string>('./music/sfx/*.{mp3,ogg,wav}',{eager:true,import:'default',query:'?url&no-inline'})
export type CinematicEffect =
  'battle-start'|'countdown-tick'|'battle-go'|'combo-rise'|'perfect-clear'|'danger-alert'|'surge-ready'|
  'surge-activate'|'surge-finish'|'blitz-swap-warning'|'blitz-swap'|'teammate-down'|'teammate-revive'|'victory-stinger'
const MUSIC_FADE = .24
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
const SIGNAL_VOICES = 40
const CHARACTER_LEVEL = .42
type Voice = {osc:OscillatorNode; gain:GainNode; priority:number}
export type DialogueState = 'playing'|'waiting'|'fallback'|'stopped'|'ended'
type Dialogue = {notify:(state:DialogueState)=>void; priority:number; media?:{gain:GainNode;dispose:()=>void}}
export class Sound {
  private context?: AudioContext
  private master?: GainNode
  private buses = new Map<Bus,GainNode>()
  private voices = new Set<Voice>()
  private signals = new Set<Voice>()
  private last = new Map<string,number>()
  private music?: {kind:Music;track:HTMLAudioElement;gain:GainNode;envelope:GainNode;source:MediaElementAudioSourceNode}
  private requestedMusic?:Music
  private musicSwitch = 0
  private musicPaused = false
  private dialogue = new Map<number,Dialogue>()
  private dialogueBus?: GainNode
  private effectInstances = new Map<string,HTMLAudioElement[]>()
  private effectLast = new Map<string,number>()
  private duckUntil = 0
  private duckLevel = 1
  private duckTimer = 0

  constructor(private mix: Mix) {}

  wake() {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        const limiter = this.context.createDynamicsCompressor()
        limiter.threshold.value = -10
        limiter.ratio.value = 12
        const output = this.context.createDynamicsCompressor()
        output.threshold.value = -2
        output.knee.value = 0
        output.ratio.value = 20
        output.attack.value = .003
        output.release.value = .12
        this.master = this.context.createGain()
        limiter.connect(this.master).connect(output).connect(this.context.destination)
        const dialogueLimiter = this.context.createDynamicsCompressor()
        dialogueLimiter.threshold.value = -14
        dialogueLimiter.knee.value = 8
        dialogueLimiter.ratio.value = 12
        dialogueLimiter.attack.value = .004
        dialogueLimiter.release.value = .15
        this.dialogueBus = this.context.createGain()
        this.dialogueBus.connect(dialogueLimiter).connect(this.master)
        for (const key of ['move','play','attack','alert','zone','effects'] as const) {
          const bus = this.context.createGain()
          bus.connect(key==='alert' || key==='zone' ? this.master : limiter)
          this.buses.set(key,bus)
        }
        this.update()
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
      if (!this.musicSwitch) {
        if (!this.music && this.requestedMusic) this.switchMusic()
        else if (this.music?.kind==='selection' && this.music.track.paused) this.resumeMusic()
      }
    } catch { /* Audio is optional on unsupported devices. */ }
  }

  update() {
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(this.mix.mute ? 0 : this.mix.master,now,0.018)
    for (const [key,bus] of this.buses) bus.gain.setTargetAtTime(this.mix[key],now,0.018)
    const duck = this.context.currentTime<this.duckUntil ? this.duckLevel : 1
    this.music?.gain.gain.setTargetAtTime(this.mix.music*duck,now,0.032)
    this.dialogueBus?.gain.setTargetAtTime(this.mix.play,now,.018)
  }

  setMusic(kind?:Music) {
    if (kind===this.requestedMusic) return
    this.requestedMusic = kind
    this.musicPaused = false
    window.clearTimeout(this.musicSwitch)
    this.musicSwitch = 0
    if (this.music?.kind==='selection' && !this.music.track.paused && this.context && kind!=='selection') {
      this.fadeMusic(0)
      this.musicSwitch = window.setTimeout(()=>this.switchMusic(),MUSIC_FADE*1000+20)
      return
    }
    this.switchMusic()
  }

  private fadeMusic(value:number) {
    if (!this.music || !this.context) return
    const param = this.music.envelope.gain
    const now = this.context.currentTime
    if (typeof param.cancelAndHoldAtTime==='function') param.cancelAndHoldAtTime(now)
    else {
      const current = param.value
      param.cancelScheduledValues(now)
      param.setValueAtTime(current,now)
    }
    param.linearRampToValueAtTime(value,now+MUSIC_FADE)
  }

  private switchMusic() {
    this.musicSwitch = 0
    const kind = this.requestedMusic
    if (this.music?.kind===kind) {
      if (kind==='selection') this.fadeMusic(1)
      return
    }
    if (this.music) {
      const {track,source,gain,envelope} = this.music
      track.pause()
      track.currentTime = 0
      track.removeAttribute('src')
      track.load()
      source.disconnect()
      gain.disconnect()
      envelope.disconnect()
      this.music = undefined
    }
    if (!kind || !tracks[kind] || !this.context || !this.master) return
    const track = new Audio(tracks[kind])
    track.loop = true
    const gain = this.context.createGain()
    const envelope = this.context.createGain()
    gain.gain.value = this.mix.music
    envelope.gain.value = kind==='selection' ? 0 : 1
    const source = this.context.createMediaElementSource(track)
    source.connect(gain).connect(envelope).connect(this.master)
    this.music = {kind,track,gain,envelope,source}
    if (kind==='selection') track.addEventListener('playing',()=>{
      if (this.music?.track===track && this.requestedMusic===kind) this.fadeMusic(1)
    },{once:true})
    this.playMusic()
  }

  resumeMusic() {
    this.musicPaused = false
    this.playMusic()
  }

  private playMusic() {
    if (!this.musicPaused && this.music?.kind===this.requestedMusic && this.music) void this.music.track.play().catch(() => {})
  }

  pauseMusic() {
    this.musicPaused = true
    this.music?.track.pause()
  }

  stopMusic() {
    this.setMusic()
  }

  playCharacterVoice(src:string|undefined,player:number,notify:Dialogue['notify'],priority=1) {
    if (!Number.isInteger(player) || player<0 || player>3) return
    const previous = this.dialogue.get(player)
    // Routine attack chatter must not cut a named reaction. All other valid events replace the previous line.
    if (previous?.media && priority===1 && previous.priority>1) return
    this.stopCharacterVoice(player)
    const line: Dialogue = {notify,priority}
    this.dialogue.set(player,line)
    const context = this.context
    const bus = this.dialogueBus
    if (!context || !bus || !src || this.mix.mute) { notify('fallback'); return }
    const clip = new Audio(src)
    const source = context.createMediaElementSource(clip)
    const gain = context.createGain()
    const pan = context.createStereoPanner()
    pan.pan.value = (player-1.5)*.25
    gain.gain.value = 0
    source.connect(gain).connect(pan).connect(bus)
    const listeners = new AbortController()
    line.media = {gain,dispose:()=>{
      listeners.abort()
      clip.pause()
      clip.removeAttribute('src')
      clip.load()
      source.disconnect()
      gain.disconnect()
      pan.disconnect()
    }}
    const current = () => this.dialogue.get(player)===line && !!line.media
    const fallback = () => {
      if (!current()) return
      line.media!.dispose()
      line.media = undefined
      this.levelDialogue()
      notify('fallback')
    }
    this.levelDialogue()
    clip.addEventListener('playing',()=>{
      if (current()) notify('playing')
    },{signal:listeners.signal})
    const waiting = () => { if (current()) notify('waiting') }
    clip.addEventListener('waiting',waiting,{signal:listeners.signal})
    clip.addEventListener('pause',waiting,{signal:listeners.signal})
    clip.addEventListener('ended',()=>{ if (current()) this.stopCharacterVoice(player,'ended') },{once:true,signal:listeners.signal})
    clip.addEventListener('error',fallback,{once:true,signal:listeners.signal})
    void clip.play().catch(fallback)
  }

  private levelDialogue() {
    const active = [...this.dialogue.values()].flatMap(line=>line.media ? [line.media] : [])
    const level = CHARACTER_LEVEL/Math.sqrt(Math.max(1,active.length))
    for (const line of active) line.gain.gain.setTargetAtTime(level,this.context!.currentTime,.024)
  }

  private stopCharacterVoice(player:number,reason:'stopped'|'ended' = 'stopped') {
    const line = this.dialogue.get(player)
    if (!line) return
    this.dialogue.delete(player)
    line.media?.dispose()
    line.notify(reason)
    this.levelDialogue()
  }

  stopCharacterVoices() {
    for (const player of this.dialogue.keys()) this.stopCharacterVoice(player)
  }

  duckMusic(amount=.72,duration=1.8) {
    if (!this.music || !this.context) return
    const now=this.context.currentTime
    this.duckUntil=Math.max(this.duckUntil,now+duration)
    this.duckLevel=amount
    this.music.gain.gain.setTargetAtTime(this.mix.music*amount,now,.035)
    window.clearTimeout(this.duckTimer)
    this.duckTimer=window.setTimeout(()=>this.restoreMusicDuck(),duration*1000)
  }

  private restoreMusicDuck() {
    if (!this.music || !this.context) return
    const remaining=this.duckUntil-this.context.currentTime
    if (remaining>0) {
      this.duckTimer=window.setTimeout(()=>this.restoreMusicDuck(),Math.ceil(remaining*1000))
      return
    }
    this.duckLevel=1
    this.music.gain.gain.setTargetAtTime(this.mix.music,this.context.currentTime,.12)
    this.duckTimer=0
  }

  playEffect(name:CinematicEffect|'character-hover'|'character-confirm'|'player-ready'|'attack-send'|'damage-impact'|'surge-ready',intensity=1,playbackRate=1) {
    if (!this.context || this.mix.mute) return
    const src = optionalEffects[`./music/sfx/${name}.mp3`] ?? optionalEffects[`./music/sfx/${name}.ogg`] ?? optionalEffects[`./music/sfx/${name}.wav`]
    if (!src) return
    const now = this.context.currentTime
    const cooldown = name==='damage-impact' ? .12 : name==='character-hover' ? .18 :
      name==='countdown-tick'||name==='blitz-swap-warning' ? .75 : .06
    if ((this.effectLast.get(name) ?? -Infinity)+cooldown>now) return
    this.effectLast.set(name,now)
    const active = (this.effectInstances.get(name) ?? []).filter(clip=>!clip.paused)
    if (active.length>=2) return
    const clip = new Audio(src)
    clip.playbackRate = Math.min(1.18,Math.max(.92,playbackRate))
    const gain = this.context.createGain()
    const source = this.context.createMediaElementSource(clip)
    gain.gain.value = Math.min(1,Math.max(.35,intensity))*0.72
    source.connect(gain).connect(this.buses.get('effects') ?? this.master!)
    const dispose = () => {
      clip.pause()
      clip.removeAttribute('src')
      clip.load()
      source.disconnect()
      gain.disconnect()
      const remaining = (this.effectInstances.get(name) ?? []).filter(item=>item!==clip)
      if (remaining.length) this.effectInstances.set(name,remaining)
      else this.effectInstances.delete(name)
    }
    active.push(clip)
    this.effectInstances.set(name,active)
    clip.addEventListener('ended',dispose,{once:true})
    clip.addEventListener('error',dispose,{once:true})
    void clip.play().catch(dispose)
  }

  play(event: GameEvent, player: number) {
    const context = this.context
    const patch = PATCHES[event.type]
    if (!context || context.state !== 'running' || this.mix.mute || !patch) return
    const [bus,type,notes,length,priority] = patch
    const isSignal = bus==='alert' || bus==='zone'
    const pool = isSignal ? this.signals : this.voices
    const limit = isSignal ? SIGNAL_VOICES : VOICES
    const now = context.currentTime
    const key = player+event.type
    if ((this.last.get(key) ?? -1) + (bus === 'move' ? 0.055 : 0.09) > now) return
    this.last.set(key,now)
    notes.forEach((frequency,i) => {
      if (pool.size >= limit) {
        const candidate = [...pool].find(voice => voice.priority < priority)
        if (!candidate) return
        candidate.gain.disconnect()
        candidate.osc.stop(now)
        pool.delete(candidate)
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
      pool.add(voice)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
        pan.disconnect()
        pool.delete(voice)
      }
      osc.start(start)
      osc.stop(start+length+0.006)
    })
  }
}
