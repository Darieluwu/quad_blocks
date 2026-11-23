import type { GameEvent } from '../engine/player'
import type { cueFor } from './presentation'
import type { CharacterVisual } from './visuals'
import './digital-feedback.css'
import './frost-feedback.css'
import './cosmic-feedback.css'
import './fire-feedback.css'
import './lunar-feedback.css'

const fragments = '<i></i>'.repeat(6)
type FeedbackTheme = Exclude<CharacterVisual['theme'],'electric'>

export function portraitFeedback(frame:HTMLElement,theme:FeedbackTheme,event:GameEvent,cue:NonNullable<ReturnType<typeof cueFor>>) {
  const effect = cue.attack==='zoneFinish' ? undefined : cue.attack ??
    (event.type==='teammateRevived' || event.type==='blitzRevived' ? 'reboot' :
      event.type==='teammateDown' ? 'down' : cue.portrait==='support' ? 'shield' :
      cue.portrait==='damage' || cue.portrait==='danger' ? cue.portrait :
      theme!=='digital' && event.type==='simpleAttack' ? 'simple' : undefined)
  if (!effect) return
  const previous = frame.querySelector<HTMLElement>(`.${theme}-portrait`)
  if (previous?.dataset.effect===effect) return
  previous?.remove()
  const layer = document.createElement('span')
  layer.className = `${theme}-portrait`
  layer.dataset.effect = effect
  layer.setAttribute('aria-hidden','true')
  layer.innerHTML = fragments
  layer.addEventListener('animationend',event=>{ if (event.target===layer) layer.remove() })
  frame.append(layer)
}

export function impactFeedback(target:HTMLElement,theme:FeedbackTheme) {
  if (target.dataset.featured==='false' || target.classList.contains('dead')) return
  target.querySelector(`.${theme}-impact`)?.remove()
  const layer = document.createElement('span')
  layer.className = `${theme}-impact`
  layer.innerHTML = fragments
  layer.setAttribute('aria-hidden','true')
  layer.addEventListener('animationend',event=>{ if (event.target===layer) layer.remove() })
  target.append(layer)
}
