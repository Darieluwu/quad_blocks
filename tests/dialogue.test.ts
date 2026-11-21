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

it('mezcla cuatro plazas, encadena frases sin interrumpir y mantiene las alertas en otro bus',()=>{
  class Clip extends EventTarget {
    static instances:Clip[] = []
    duration = 2
    pause = vi.fn()
    removeAttribute = vi.fn()
    play = vi.fn(()=>Promise.resolve())
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
    const captions = Array.from({length:5},()=>vi.fn())
    for (let i=0;i<4;i++) mixer.playCharacterVoice(`line-${i}`,i,captions[i])
    mixer.playCharacterVoice('follow-up',0,captions[4])
    expect(Clip.instances.map(clip=>clip.src)).toEqual(['line-0','line-1','line-2','line-3'])
    for (const [i,clip] of Clip.instances.entries()) {
      clip.dispatchEvent(new Event('playing'))
      expect(captions[i]).toHaveBeenCalledWith(2000)
      expect(clip.pause).not.toHaveBeenCalled()
    }
    const dialogueGain = Context.sources[0].outputs[0] as ReturnType<typeof gainNode>
    expect(dialogueGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.21,1,.024)
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
    Clip.instances[0].dispatchEvent(new Event('ended'))
    expect(Clip.instances[4].src).toBe('follow-up')
    expect(captions[4]).not.toHaveBeenCalled()
    Clip.instances[4].dispatchEvent(new Event('playing'))
    expect(captions[4]).toHaveBeenCalledWith(2000)
    for (const clip of Clip.instances.slice(1,4)) expect(clip.pause).not.toHaveBeenCalled()
    mixer.stopCharacterVoices()
    expect(Clip.instances.every(clip=>clip.pause.mock.calls.length===1)).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
