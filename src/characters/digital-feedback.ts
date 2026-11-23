import type { GameEvent } from '../engine/player'
import type { cueFor } from './presentation'
import './digital-feedback.css'

const fragments = '<i></i>'.repeat(6)

export function digitalPortrait(frame:HTMLElement,event:GameEvent,cue:NonNullable<ReturnType<typeof cueFor>>) {
  const effect = cue.attack==='zoneFinish' ? undefined : cue.attack ??
    (event.type==='teammateRevived' || event.type==='blitzRevived' ? 'reboot' :
      event.type==='teammateDown' ? 'down' : cue.portrait==='support' ? 'shield' :
      cue.portrait==='damage' || cue.portrait==='danger' ? cue.portrait : undefined)
  if (!effect) return
  const previous = frame.querySelector<HTMLElement>('.digital-portrait')
  if (previous?.dataset.effect===effect) return
  previous?.remove()
  const layer = document.createElement('span')
  layer.className = 'digital-portrait'
  layer.dataset.effect = effect
  layer.setAttribute('aria-hidden','true')
  layer.innerHTML = fragments
  layer.addEventListener('animationend',event=>{ if (event.target===layer) layer.remove() })
  frame.append(layer)
}

export function digitalImpact(target:HTMLElement) {
  if (target.dataset.featured==='false' || target.classList.contains('dead')) return
  target.querySelector('.digital-impact')?.remove()
  const layer = document.createElement('span')
  layer.className = 'digital-impact'
  layer.innerHTML = fragments
  layer.setAttribute('aria-hidden','true')
  layer.addEventListener('animationend',event=>{ if (event.target===layer) layer.remove() })
  target.append(layer)
}
