import { ACTIONS, type Action, type Input } from './engine/player'
import { PLAYERS, SETTINGS } from './engine/rules'

export const actionNames: Record<Action,string> = {
  left:'Mover izquierda',right:'Mover derecha',soft:'Soft Drop',hard:'Hard Drop',
  cw:'Giro horario',ccw:'Giro antihorario',half:'Giro 180°',hold:'Hold',zone:'Activar Zone',
  prev:'Objetivo anterior',next:'Objetivo siguiente',pause:'Pausa',
}
type MapFor = Record<Action,string>
export type Device = {id:string; index:number}
export type Slot = {name:string; device:Device|null; keys:MapFor; pad:MapFor}
const keys = [
  ['KeyA','KeyD','KeyS','KeyW','KeyE','KeyQ','KeyR','KeyF','KeyC','KeyZ','KeyX','Digit1'],
  ['KeyJ','KeyL','KeyK','KeyI','KeyO','KeyU','KeyP','KeyH','KeyN','KeyB','KeyM','Digit2'],
  ['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Period','Comma','Slash','ShiftRight','Enter','Semicolon','Quote','Digit3'],
  ['Numpad4','Numpad6','Numpad5','Numpad8','Numpad9','Numpad7','Numpad1','Numpad0','NumpadEnter','Numpad2','Numpad3','Digit4'],
]
const pad = ['B14','B15','B13','B12','B0','B2','B1','B4','B5','B6','B7','B9']
const makeMap = (values: string[]) => Object.fromEntries(ACTIONS.map((action,i) => [action,values[i]])) as MapFor
export const defaultMap = (i: number, type: 'keys'|'pad') => makeMap(type === 'keys' ? keys[i] : pad)
export const standardPadLabel = (binding: string) => ({
  B14:'Cruceta ←',B15:'Cruceta →',B13:'Cruceta ↓',B12:'Cruceta ↑',
  B0:'A / ×',B2:'X / □',B1:'B / ○',B4:'LB / L1',B5:'RB / R1',B6:'LT / L2',B7:'RT / R2',B9:'Start / Options',
}[binding] ?? binding)
export const defaultSlot = (i: number): Slot => ({
  name:'Jugador '+(i+1),device:null,keys:defaultMap(i,'keys'),pad:defaultMap(i,'pad'),
})

export function label(binding: string) {
  return binding.replace(/^Key|^Digit/,'').replace(/^Numpad/,'Num ')
    .replace(/^ArrowLeft$/,'←').replace(/^ArrowRight$/,'→').replace(/^ArrowUp$/,'↑').replace(/^ArrowDown$/,'↓')
    .replace(/^Period$/,'.').replace(/^Comma$/,',').replace(/^Slash$/,'/').replace(/^Semicolon$/,';')
    .replace(/^Quote$/,"'").replace(/^ShiftRight$/,'Shift der.')
    .replace(/^B(\d+)$/,'Botón $1').replace(/^A(\d+)([+-])$/,'Eje $1 $2')
}

export function conflict(slots: Slot[], i: number, type: 'keys'|'pad', action: Action, value: string) {
  for (const [j,slot] of slots.entries()) {
    if (type === 'pad' && i !== j) continue
    for (const other of ACTIONS) {
      if ((i !== j || other !== action) && slot[type][other] === value) return `J${j+1} · ${actionNames[other]}`
    }
  }
  return null
}

export function resolvePads(slots: Slot[], pads: readonly Gamepad[], previous: readonly (Gamepad | null)[] = []) {
  const result: (Gamepad|null)[] = Array(PLAYERS).fill(null)
  const taken = new Set<number>()
  slots.forEach((slot,i) => {
    const pad = pads.find(p => p.index === previous[i]?.index && p.id === slot.device?.id && !taken.has(p.index)) ??
      pads.find(p => p.index === slot.device?.index && p.id === slot.device?.id && !taken.has(p.index))
    if (pad) { result[i] = pad; taken.add(pad.index) }
  })
  slots.forEach((slot,i) => {
    if (!slot.device || result[i]) return
    const candidates = pads.filter(p => p.id === slot.device?.id && !taken.has(p.index))
    const waiting = slots.filter((s,j) => s.device?.id === slot.device?.id && !result[j]).length
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

export class Inputs {
  private down = new Set<string>()
  private held = Array.from({length:PLAYERS},() => new Set<Action>())
  private pending: Action[][] = Array.from({length:PLAYERS},() => [])
  devices: Gamepad[] = []
  assigned: (Gamepad|null)[] = Array(PLAYERS).fill(null)
  capture: {player:number; type:'keys'|'pad'; baseline:Set<string>; done:(value:string)=>void}|null = null
  onActivity: () => void = () => {}
  onBlur: () => void = () => {}
  onWake: () => void = () => {}

  constructor(readonly slots: Slot[], private isGame: () => boolean) {
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
      const player = this.slots.findIndex(slot => !slot.device && ACTIONS.some(a => slot.keys[a] === event.code))
      if (player < 0) return
      event.preventDefault()
      if (event.repeat || this.down.has(event.code)) return
      this.onWake()
      this.down.add(event.code)
      const action = ACTIONS.find(a => this.slots[player].keys[a] === event.code)!
      this.pending[player].push(action)
      this.onActivity()
    })
    window.addEventListener('keyup',event => this.down.delete(event.code))
    window.addEventListener('blur',() => { this.clear(); this.onBlur() })
  }

  clear() {
    this.down.clear()
    this.pending.forEach(queue => { queue.length = 0 })
    this.held.forEach(set => set.clear())
  }

  poll() {
    try {
      this.devices = Array.from(navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => !!pad?.connected)
    } catch {
      this.devices = []
    }
    this.assigned = resolvePads(this.slots,this.devices,this.assigned)
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
        const active = slot.device ? bindings.has(slot.pad[action]) : this.down.has(slot.keys[action])
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
  get missing() { return this.slots.flatMap((slot,i) => slot.device && !this.assigned[i] ? [i] : []) }
}
