import type { Sound, CinematicEffect } from './audio'
import { artwork } from './characters/assets'
import { CHARACTERS, type CharacterId } from './characters/catalog'
import { DOUBLE_STAND_PRIZES, LAST_STAND_PRIZES, STAND, type Prize } from './engine/last-stand'
import type { Match } from './engine/match'
import type { Player } from './engine/player'
import { HZ } from './engine/rules'
import { lastStandCopy, standIcons, standLanguage } from './last-stand-copy'
import './last-stand.css'

const wheelColors = ['#347b91','#864a79','#ac5d39','#634da0','#3f805e','#887234']
const seconds = (ticks:number) => Math.max(0,Math.ceil(ticks/HZ))+' s'
const soundStages: Record<'single'|'double',readonly CinematicEffect[]> = {
  single:['last-stand-start','last-stand-spin','last-stand-reveal'],
  double:['double-last-stand-start','last-stand-spin','double-last-stand-reveal'],
}
export const standStage = (elapsed:number) => elapsed>=STAND.revealAt ? 2 : elapsed>=STAND.spinAt ? 1 : 0

export class LastStandView {
  private eventId = 0
  private stage = -1
  private wheels:HTMLElement[] = []

  constructor(private root:HTMLElement, private audio:Sound, private roster:Match['roster'],
    private characters:readonly CharacterId[],private rejoin:boolean) {}

  draw(match:Match, reduced:boolean, elapsed:number, connected:boolean) {
    const event = match.stand?.event
    this.root.hidden = !match.standPaused || !connected
    if (!event || !match.standPaused) {
      if (event) { this.eventId = event.id; this.stage = 2 }
      this.rejoin = false
      return
    }
    if (!connected) return
    const stage = standStage(elapsed)
    const lang = standLanguage()
    const copy = lastStandCopy(lang)
    const prizes:readonly Prize[] = event.kind==='single' ? LAST_STAND_PRIZES : DOUBLE_STAND_PRIZES
    if (this.eventId!==event.id) {
      this.eventId = event.id
      this.stage = this.rejoin ? stage : stage-1
      this.rejoin = false
      this.root.lang = lang
      this.root.innerHTML = `<h2 aria-live="polite">${copy[event.kind]}</h2>${event.kind==='double'? `<p>${copy.versus}</p>`:''}
        <div class="stand-awards">${event.awards.map(({index,prize})=>{
          const character = CHARACTERS[this.characters[this.roster[index].slot]]
          const portrait = artwork(character.assets.portraits.neutral) ?? artwork(character.assets.master)
          return `<section class="stand-award" style="--fighter:${character.colors[0]}">
            <div class="stand-portrait">${portrait?`<img src="${portrait}" alt="">`:''}<strong>${character.name}</strong></div>
            <div class="stand-wheel-frame" aria-hidden="true"><div class="stand-wheel">
            ${prizes.map((entry,i)=>`<span style="--x:${50+36*Math.sin(Math.PI*i/3)}%;--y:${50-36*Math.cos(Math.PI*i/3)}%">${standIcons[entry]}</span>`).join('')}</div></div>
            <strong class="stand-result" role="status" style="--prize-color:${wheelColors[prizes.indexOf(prize)]}">${standIcons[prize]} ${copy[prize]}</strong>
          </section>`
        }).join('')}</div>`
      const gradient = wheelColors.map((color,i)=>`${color} ${i*60}deg ${(i+1)*60}deg`).join(',')
      this.wheels = Array.from(this.root.querySelectorAll('.stand-wheel'))
      for (const wheel of this.wheels) wheel.style.background = `conic-gradient(from -30deg,${gradient})`
    }
    if (stage>this.stage) {
      this.stage = stage
      this.audio.playEffect(soundStages[event.kind][stage])
    }
    this.root.dataset.stage = String(stage)
    this.root.dataset.reduced = String(reduced)
    const t = Math.min(1,Math.max(0,(elapsed-STAND.spinAt)/(STAND.revealAt-STAND.spinAt)))
    const eased = t*t*(3-2*t)
    this.wheels.forEach((wheel,i)=>{
      const angle = 1440-prizes.indexOf(event.awards[i].prize)*60
      wheel.style.transform = `rotate(${reduced ? stage===2 ? angle : 0 : angle*eased}deg)`
    })
  }
}

export function standHud(p:Player, match:Match,slot:number) {
  if (!match.stand?.active || match.finished || p.dead) return ''
  const lang = standLanguage()
  const copy = lastStandCopy(lang)
  const effect = p.stand
  const foundation = p.foundationUntil ? `<span>${standIcons.cursedFoundation} ${copy.cursedFoundation} ·
    ${p.foundationRows ? seconds(p.foundationUntil-match.now-1) : copy.foundationWaiting}</span>` : ''
  const duel = match.stand.active==='double' ? `<small>${copy.duel}</small>` : ''
  if (!effect && !foundation && !duel) return ''
  let details = ''
  if (effect) {
    if (effect.until!==null) {
      const remaining = effect.until-match.now-(effect.prize==='secondWind'?0:1)
      details = `<span>${effect.prize==='secondWind'?copy.shield+' · ':''}${seconds(remaining)}</span>`
    }
    if (effect.prize==='secondWind' && effect.until===null) {
      details = `<progress aria-label="${copy.secondWind}" value="${effect.progress}" max="${STAND.secondWind.goal}"></progress>
        <span>${effect.progress}/${STAND.secondWind.goal}</span>`
    } else if (effect.prize==='revive') {
      details = `<ul><li>${effect.tetris?'✓':'○'} ${copy.tetris}</li><li>${effect.spin?'✓':'○'} ${copy.spin}</li>
        <li>${copy.sent} ${Math.min(effect.sent,STAND.revive.sent)}/${STAND.revive.sent}</li></ul>`
    } else if (effect.prize==='aegisCore' || effect.prize==='precisionStrike') {
      details = `<span>${effect.prize==='aegisCore'?copy.shield:copy.charges} · ${effect.progress}</span>`
    }
  }
  return `<div lang="${lang}"><b class="stand-seat">J${slot+1}</b>${duel}${effect?`<strong>${standIcons[effect.prize]} ${copy[effect.prize]}</strong>${details}`:''}${foundation}</div>`
}
