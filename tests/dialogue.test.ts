import { expect, it, vi } from 'vitest'
import { Sound } from '../src/audio'
import { MIX } from '../src/settings'

class AudioNodeMock {
  outputs: AudioNodeMock[] = []
  connect(node:AudioNodeMock) { this.outputs.push(node); return node }
  disconnect() { this.outputs.length = 0 }
}
const parameter = () => ({value:0,setTargetAtTime:vi.fn(),setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()})
const gainNode = () => Object.assign(new AudioNodeMock(),{gain:parameter()})

it('mezcla cuatro plazas, interrumpe solo la plaza vigente y mantiene las alertas en otro bus',async ()=>{
  class Clip extends EventTarget {
    static instances:Clip[] = []
    pause = vi.fn()
    removeAttribute = vi.fn()
    load = vi.fn()
    reject!: (reason:Error)=>void
    play = vi.fn(()=>new Promise<void>((_,reject)=>{this.reject = reject}))
    constructor(readonly src:string) { super(); Clip.instances.push(this) }
  }
  class Context {
    state = 'running'
    currentTime = 1
    destination = new AudioNodeMock()
    static gains:ReturnType<typeof gainNode>[] = []
    static sources:AudioNodeMock[] = []
    static oscillators:AudioNodeMock[] = []
    createGain() { const node = gainNode(); Context.gains.push(node); return node }
    createDynamicsCompressor() {
      return Object.assign(new AudioNodeMock(),{threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter()})
    }
    createMediaElementSource() { const node = new AudioNodeMock(); Context.sources.push(node); return node }
    createStereoPanner() { return Object.assign(new AudioNodeMock(),{pan:parameter()}) }
    createOscillator() {
      const node = Object.assign(new AudioNodeMock(),{frequency:parameter(),start:vi.fn(),stop:vi.fn()})
      Context.oscillators.push(node)
      return node
    }
  }
  vi.stubGlobal('AudioContext',Context)
  vi.stubGlobal('Audio',Clip)
  try {
    const mixer = new Sound({...MIX,mute:false})
    mixer.wake()
    const captions = Array.from({length:8},()=>vi.fn())
    for (let i=0;i<4;i++) mixer.playCharacterVoice(`line-${i}`,i,captions[i])
    expect(Clip.instances.map(clip=>clip.src)).toEqual(['line-0','line-1','line-2','line-3'])
    for (const [i,clip] of Clip.instances.entries()) {
      clip.dispatchEvent(new Event('playing'))
      expect(captions[i]).toHaveBeenCalledWith('playing')
      expect(clip.pause).not.toHaveBeenCalled()
    }
    const dialogueGain = Context.sources[0].outputs[0] as ReturnType<typeof gainNode>
    expect(dialogueGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.1785,1,.024)
    const dialogueBus = dialogueGain.outputs[0].outputs[0]
    for (let i=0;i<4;i++) mixer.play({type:'quad'},i)
    expect(Context.oscillators).toHaveLength(20)
    mixer.play({type:'critical'},0)
    mixer.play({type:'zoneStart'},0)
    expect(Context.oscillators).toHaveLength(29)
    const alertBus = Context.oscillators[20].outputs[0].outputs[0].outputs[0]
    const zoneBus = Context.oscillators[24].outputs[0].outputs[0].outputs[0]
    expect(alertBus).not.toBe(dialogueBus)
    expect(zoneBus).not.toBe(dialogueBus)
    expect(alertBus.outputs[0]).toBe(zoneBus.outputs[0])
    mixer.playCharacterVoice('danger',0,captions[4])
    expect(captions[0]).toHaveBeenLastCalledWith('stopped')
    expect(Clip.instances[0].load).toHaveBeenCalledOnce()
    expect(Clip.instances[4].src).toBe('danger')
    expect(Clip.instances[4].play).toHaveBeenCalledOnce()
    mixer.playCharacterVoice('zoneFinish',0,captions[5])
    Clip.instances[5].dispatchEvent(new Event('playing'))
    expect(captions[5]).toHaveBeenLastCalledWith('playing')
    Clip.instances[4].dispatchEvent(new Event('playing'))
    Clip.instances[4].dispatchEvent(new Event('ended'))
    Clip.instances[4].reject(new Error('Fallo de una carga anterior'))
    await Promise.resolve()
    expect(captions[4].mock.calls).toEqual([['stopped']])
    expect(Clip.instances[5].pause).not.toHaveBeenCalled()
    mixer.playCharacterVoice('defeat',0,captions[6])
    expect(captions[5]).toHaveBeenLastCalledWith('stopped')
    Clip.instances[6].dispatchEvent(new Event('error'))
    expect(captions[6]).toHaveBeenLastCalledWith('fallback')
    mixer.playCharacterVoice(undefined,0,captions[7])
    expect(captions[6]).toHaveBeenLastCalledWith('stopped')
    expect(captions[7]).toHaveBeenCalledWith('fallback')
    expect(Clip.instances).toHaveLength(7)
    for (const clip of Clip.instances.slice(1,4)) expect(clip.pause).not.toHaveBeenCalled()
    mixer.stopCharacterVoices()
    expect(Clip.instances.every(clip=>clip.pause.mock.calls.length===1)).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
