import { artwork } from './assets'
import { CHARACTERS, type CharacterId, type PortraitState, type VisualAttack, type VoiceEvent } from './catalog'
import type { GameEvent } from '../engine/player'
import { characterVisuals } from './visuals'

type Cue = {portrait:PortraitState; voice?:VoiceEvent; attack?:VisualAttack; priority:number}
const spin: Cue = {portrait:'attack',voice:'spin',attack:'spin',priority:3}
const cues: Record<string,Cue> = {
  quad:{portrait:'attack',voice:'tetris',attack:'tetris',priority:4},
  mini:spin,tZero:spin,tSingle:spin,tDouble:spin,tTriple:spin,spinL:spin,spinJ:spin,spinS:spin,spinZ:spin,
  combo:{portrait:'attack',voice:'combo',attack:'combo',priority:2},send:{portrait:'attack',priority:1},
  simpleAttack:{portrait:'attack',priority:1},
  incoming:{portrait:'damage',priority:3},receive:{portrait:'damage',priority:4},
  danger:{portrait:'danger',priority:2},critical:{portrait:'danger',voice:'danger',priority:5},
  zoneStart:{portrait:'zone',voice:'zoneStart',priority:6},zoneEnd:{portrait:'attack',voice:'zoneFinish',attack:'zoneFinish',priority:6},
  eliminated:{portrait:'defeat',voice:'defeat',priority:8},
  victory:{portrait:'victory',voice:'victory',priority:9},blitzVictory:{portrait:'victory',voice:'victory',priority:9},
  blitzGuard:{portrait:'support',voice:'teamDefense',priority:5},blitzProtected:{portrait:'support',priority:4},
  teammateDown:{portrait:'support',voice:'teammateDown',priority:7},
  teammateRevived:{portrait:'support',voice:'teammateRevived',priority:7},blitzRevived:{portrait:'support',priority:5},
}
export const isAttackVoice = (event:VoiceEvent) => event==='tetris' || event==='spin' || event==='combo' || event==='zoneFinish'
export function cueFor(event:GameEvent) {
  if (event.type==='combo' && Number(event.detail)<3) return undefined
  if (event.type==='zoneEnd' && !Number(event.detail)) return {portrait:'zone',voice:'zoneFinish',priority:6} satisfies Cue
  if (event.type==='critical' && event.repeat) return cues.danger
  return cues[event.type]
}

export function portraitMarkup(id:CharacterId,preview = false) {
  const c = CHARACTERS[id]
  const src = (preview && artwork(c.assets.master)) || artwork(c.assets.portraits.neutral)
  return `<span class="character-portrait${preview?' character-preview':''}" data-character-id="${id}" data-portrait="neutral"
    style="--character-color:${c.colors[0]};--character-light:${c.colors[1]}" aria-hidden="true"><span>${c.name.slice(0,2)}</span>
    <img alt="" draggable="false" ${src?`src="${src}"`:'hidden'}></span>`
}

export class Portrait {
  private state:PortraitState = 'neutral'
  private cue?:Cue
  private until = 0
  private img:HTMLImageElement
  private failed = new Set<string>()
  private nextBlink: number
  private blinkUntil = 0

  constructor(readonly id:CharacterId,private root:HTMLElement,slot:number) {
    this.nextBlink = performance.now()+2600+slot*830
    this.img = root.querySelector('img')!
    this.img.addEventListener('error',()=>{
      this.failed.add(this.img.getAttribute('src') ?? '')
      this.image(this.state)
    })
    const blink = artwork(CHARACTERS[id].assets.portraits.blink)
    if (blink) new Image().src = blink
  }

  private image(state:PortraitState) {
    const a = CHARACTERS[this.id].assets
    const keys = [a.portraits[state],state==='attack'?a.attackPose:state==='zone'?a.zonePose:'',a.portraits.neutral]
    const url = keys.map(artwork).find(src=>src && !this.failed.has(src))
    this.img.hidden = !url
    if (url && this.img.getAttribute('src')!==url) this.img.src = url
    if (!url) this.img.removeAttribute('src')
  }

  react(cue:Cue,now:number, attacks:boolean) {
    if (!attacks && (cue.portrait==='attack' || cue.portrait==='damage')) return
    if (!cue.voice && this.cue && now<this.until && cue.priority<this.cue.priority) return
    this.cue = cue
    this.until = now+(cue.portrait==='zone'?760:1150)
    const assets = CHARACTERS[this.id].assets
    const effect = cue.attack ? artwork(assets.attacks[cue.attack]) : undefined
    // Characters with a cinematic theme have a dedicated surface for full poses.
    const pose = characterVisuals[this.id] ? undefined :
      cue.portrait==='zone' ? artwork(assets.zonePose) : cue.portrait==='attack' ? artwork(assets.attackPose) : undefined
    this.root.classList.toggle('character-pose',!effect && !!pose)
    this.setArt('--character-cue-art',effect ?? pose)
  }

  private setArt(property:string,url:string|undefined) {
    if (url) this.root.style.setProperty(property,`url(${JSON.stringify(url)})`)
    else this.root.style.removeProperty(property)
  }

  update(now:number, zone:boolean, danger:number, dead:boolean, winner:boolean, reduced:boolean) {
    if (this.cue && now>=this.until) {
      this.cue = undefined
      this.root.classList.remove('character-pose')
      this.setArt('--character-cue-art',undefined)
    }
    if (!reduced && now>=this.nextBlink) {
      this.blinkUntil = now+135
      this.nextBlink = now+4300
    }
    const state = winner?'victory':dead?'defeat':this.cue?.portrait==='defeat'?'support':
      danger && !zone && (!this.cue || !this.cue.voice && this.cue.priority<4)?'danger':this.cue?.portrait ??
      (zone?'zone':danger?'danger':!reduced && now<this.blinkUntil?'blink':'neutral')
    if (this.state===state) return
    this.state = state
    this.root.dataset.portrait = state
    this.setArt('--character-zone-art',state==='zone' && !characterVisuals[this.id]?artwork(CHARACTERS[this.id].assets.zoneBackground):undefined)
    this.image(state)
  }
}
