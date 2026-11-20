import { ACTIONS, type Action, type Input } from './engine/player'
import { PLAYERS, SETTINGS } from './engine/rules'

export const actionNames: Record<Action,string> = {
  left:'Mover izquierda',right:'Mover derecha',soft:'Soft Drop',hard:'Hard Drop',
  cw:'Giro horario',ccw:'Giro antihorario',half:'Giro 180°',hold:'Hold',zone:'Activar Zone',
  prev:'Objetivo anterior',next:'Objetivo siguiente',pause:'Pausa',
  stance:'Cambiar postura',
}
type MapFor = Record<Action,string>
export type Device = {id:string; index:number}
export type Slot = {name:string; device:Device|null; keys:MapFor; pad:MapFor}
const keys = [
  ['KeyA','KeyD','KeyS','KeyW','KeyE','KeyQ','KeyR','KeyF','KeyC','KeyZ','KeyX','Digit1','KeyT'],
  ['KeyJ','KeyL','KeyK','KeyI','KeyO','KeyU','KeyP','KeyH','KeyN','KeyB','KeyM','Digit2','KeyV'],
  ['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Period','Comma','Slash','ShiftRight','Enter','Semicolon','Quote','Digit3','BracketLeft'],
  ['Numpad4','Numpad6','Numpad5','Numpad8','Numpad9','Numpad7','Numpad1','Numpad0','NumpadEnter','Numpad2','Numpad3','Digit4','NumpadDivide'],
]
const pad = ['B14','B15','B13','B12','B0','B2','B1','B4','B5','B6','B7','B9','B3']
const makeMap = (values: string[]) => Object.fromEntries(ACTIONS.map((action,i) => [action,values[i]])) as MapFor
export const defaultMap = (i: number, type: 'keys'|'pad') => makeMap(type === 'keys' ? keys[i] : pad)
export const standardPadLabel = (binding: string) => ({
  B14:'Cruceta ←',B15:'Cruceta →',B13:'Cruceta ↓',B12:'Cruceta ↑',
  B0:'A / ×',B2:'X / □',B1:'B / ○',B3:'Y / △',B4:'LB / L1',B5:'RB / R1',B6:'LT / L2',B7:'RT / R2',B9:'Start / Options',
}[binding] ?? binding)
export const defaultSlot = (i: number): Slot => ({
  name:'Jugador '+(i+1),device:null,keys:defaultMap(i,'keys'),pad:defaultMap(i,'pad'),
})

export function label(binding: string) {
  if (!binding) return 'Sin asignar'
  return binding.replace(/^Key|^Digit/,'').replace(/^Numpad/,'Num ')
    .replace(/^ArrowLeft$/,'←').replace(/^ArrowRight$/,'→').replace(/^ArrowUp$/,'↑').replace(/^ArrowDown$/,'↓')
    .replace(/^Period$/,'.').replace(/^Comma$/,',').replace(/^Slash$/,'/').replace(/^Semicolon$/,';')
    .replace(/^Quote$/,"'").replace(/^ShiftRight$/,'Shift der.')
    .replace(/^BracketLeft$/,'[').replace(/^Num Divide$/,'Num /')
    .replace(/^B(\d+)$/,'Botón $1').replace(/^A(\d+)([+-])$/,'Eje $1 $2')
}

export function conflict(slots: Slot[], i: number, type: 'keys'|'pad', action: Action, value: string,
  isHuman = (_slot: number) => true) {
  if (!value) return null
  const keyboard = type==='keys' && isHuman(i) && !slots[i].device
  for (const [j,slot] of slots.entries()) {
    if (i!==j && (!keyboard || !isHuman(j) || slot.device)) continue
    for (const other of ACTIONS) {
      if ((i !== j || other !== action) && slot[type][other] === value) return `J${j+1} · ${actionNames[other]}`
    }
  }
  return null
}

export function keyboardClashes(slots: Slot[], i: number, isHuman: (slot: number)=>boolean) {
  const keyboard = slots.map((slot,j)=>i===j ? {...slot,device:null} : slot)
  return ACTIONS.flatMap(action => {
    const value = keyboard[i].keys[action]
    const clash = conflict(keyboard,i,'keys',action,value,j=>j===i || isHuman(j))
    return clash ? [label(value)+' → '+clash] : []
  })
}

export function resolvePads(slots: Slot[], pads: readonly Gamepad[], previous: readonly (Gamepad | null)[] = [],
  isHuman = (_slot: number) => true) {
  const result: (Gamepad|null)[] = Array(PLAYERS).fill(null)
  const taken = new Set<number>()
  const reserve = (slot: Slot,i: number,index: number|undefined) => {
    if (!isHuman(i) || result[i] || index===undefined) return
    const pad = pads.find(p => p.index===index && p.id===slot.device?.id && !taken.has(p.index))
    if (pad) { result[i] = pad; taken.add(pad.index) }
  }
  slots.forEach((slot,i) => reserve(slot,i,previous[i]?.index))
  slots.forEach((slot,i) => reserve(slot,i,slot.device?.index))
  slots.forEach((slot,i) => {
    if (!slot.device || result[i] || !isHuman(i)) return
    const candidates = pads.filter(p => p.id === slot.device?.id && !taken.has(p.index))
    const waiting = slots.filter((s,j) => isHuman(j) && s.device?.id === slot.device?.id && !result[j]).length
    if (candidates.length === 1 && waiting === 1) {
      result[i] = candidates[0]
      taken.add(candidates[0].index)
    }
  })
  return result
}

export function padBindings(device: Gamepad) {
  const bindings: string[] = []
  device.buttons.forEach((button,i) => {
    if (button.pressed || button.value > SETTINGS.axis) bindings.push('B'+i)
  })
  device.axes.forEach((value,i) => {
    if (Math.abs(value) > SETTINGS.axis) bindings.push('A'+i+(value > 0 ? '+' : '-'))
  })
  return bindings
}

export function automaticPadMap(device: Pick<Gamepad,'mapping'|'buttons'|'axes'>): MapFor {
  if (device.mapping === 'standard') return makeMap(pad)
  const directions = device.buttons.length >= 16 ? pad.slice(0,4) :
    device.axes.length >= 2 ? ['A0-','A0+','A1+','A1-'] : pad.slice(0,4)
  const preferred = [...directions,...pad.slice(4)]
  const supported = (value: string) => value.startsWith('A') ||
    Number(value.slice(1)) < device.buttons.length
  const reserved = new Set(preferred.filter(supported))
  const spare = device.buttons.map((_,i) => 'B'+i).filter(value => !reserved.has(value))
  for (const i of [0,1,2,3,8,9,10,11,4,5,6,7,12]) {
    if (!supported(preferred[i])) preferred[i] = spare.shift() ?? ''
  }
  return makeMap(preferred)
}

export function pressedButtons(devices: readonly Gamepad[]) {
  return new Set(devices.flatMap(device => device.buttons.flatMap((button,i) =>
    button.pressed || button.value > SETTINGS.axis ? [`${device.index}:${i}`] : [])))
}

export class Inputs {
  private down = new Set<string>()
  private held = Array.from({length:PLAYERS},() => new Set<Action>())
  private pending: Action[][] = Array.from({length:PLAYERS},() => [])
  devices: Gamepad[] = []
  assigned: (Gamepad|null)[] = Array(PLAYERS).fill(null)
  capture: {player:number; type:'keys'|'pad'; baseline:Set<string>; done:(value:string)=>void}|null = null
  pairing: {baseline:Set<string>; accept:(device:Gamepad)=>boolean}|null = null
  onBlur: () => void = () => {}
  onWake: () => void = () => {}

  constructor(readonly slots: Slot[], private isGame: () => boolean, private isHuman = (_slot: number) => true) {
    window.addEventListener('keydown',event => {
      if (this.capture?.type === 'keys') {
        event.preventDefault()
        if (!event.repeat && event.code !== 'Escape' && event.code !== 'Tab') {
          const capture = this.capture
          this.capture = null
          capture.done(event.code)
        }
        return
      }
      if (!this.isGame() || event.ctrlKey || event.metaKey || event.altKey || event.code === 'Tab') return
      const player = this.slots.findIndex((slot,i) => this.isHuman(i) && !slot.device && ACTIONS.some(a => slot.keys[a] === event.code))
      if (player < 0) return
      event.preventDefault()
      if (event.repeat || this.down.has(event.code)) return
      this.onWake()
      this.down.add(event.code)
      const action = ACTIONS.find(a => this.slots[player].keys[a] === event.code)!
      this.pending[player].push(action)
    })
    window.addEventListener('keyup',event => this.down.delete(event.code))
    window.addEventListener('blur',() => { this.clear(); this.onBlur() })
  }

  clear() {
    this.down.clear()
    this.pending.forEach(queue => { queue.length = 0 })
    this.held.forEach((set,i) => { if (!this.slots[i].device) set.clear() })
  }

  poll() {
    try {
      this.devices = Array.from(navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => !!pad?.connected)
    } catch {
      this.devices = []
    }
    this.assigned = resolvePads(this.slots,this.devices,this.assigned,this.isHuman)
    if (this.pairing) {
      const {baseline,accept} = this.pairing
      const current = pressedButtons(this.devices)
      const edge = [...current].find(binding => !baseline.has(binding))
      this.pairing.baseline = current
      const device = edge && this.devices.find(p => p.index === Number(edge.split(':')[0]))
      if (device && accept(device)) this.pairing = null
    }
    this.slots.forEach((slot,i) => {
      const device = this.assigned[i]
      const bindings = device ? new Set(padBindings(device)) : new Set<string>()
      if (this.capture?.type === 'pad' && this.capture.player === i) {
        const capture = this.capture
        const current = Array.from(bindings).find(binding => !capture.baseline.has(binding))
        capture.baseline = bindings
        if (current) { this.capture = null; capture.done(current) }
      }
      const set = this.held[i]
      for (const action of ACTIONS) {
        const active = this.isHuman(i) && (slot.device ? bindings.has(slot.pad[action]) : this.down.has(slot.keys[action]))
        if (active && !set.has(action)) {
          set.add(action)
          if (slot.device && this.isGame()) {
            this.pending[i].push(action)
            this.onWake()
          }
        }
        if (!active) set.delete(action)
      }
    })
  }

  consume(): Input[] {
    return this.held.map((held,i) => ({held,pressed:this.pending[i].splice(0)}))
  }
  get missing() { return this.slots.flatMap((slot,i) => this.isHuman(i) && slot.device && !this.assigned[i] ? [i] : []) }
}
