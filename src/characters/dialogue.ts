import { CHARACTERS, type CharacterId } from './catalog'
import { Portrait, portraitMarkup } from './presentation'

export function dialogueMarkup(id:CharacterId) {
  const character = CHARACTERS[id]
  return `<div class="dialogue-slot"><div class="character-caption" hidden style="--dialogue-color:${character.colors[0]}">
    <div class="dialogue-avatar">${portraitMarkup(id)}</div>
    <strong class="dialogue-name">${character.name}</strong><p class="dialogue-text"></p>
  </div></div>`
}

export class DialogueCard {
  private readonly card:HTMLElement
  private readonly text:HTMLElement
  private readonly resize:ResizeObserver
  private animation:Animation|null = null
  private until = Infinity

  constructor(readonly slot:HTMLElement,id:CharacterId,player:number) {
    this.card = slot.querySelector('.character-caption')!
    this.text = slot.querySelector('.dialogue-text')!
    new Portrait(id,slot.querySelector('.character-portrait')!,player)
    this.resize = new ResizeObserver(()=>this.fitText())
  }

  private get reduced() {
    return !!this.card.closest('.reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  show(line:string,timed:boolean) {
    this.animation?.cancel()
    this.animation = null
    this.text.textContent = line
    this.until = timed ? performance.now()+Math.min(5000,Math.max(2200,line.length*55)) : Infinity
    this.card.hidden = false
    this.fitText()
    this.resize.observe(this.slot)
    if (!this.reduced) {
      this.animation = this.card.animate([
        {opacity:0,transform:'translateY(4px)'},
        {opacity:1,transform:'none'},
      ],{duration:120,easing:'ease-out'})
    }
  }

  hide(fade = false) {
    if (this.card.hidden) return
    this.until = Infinity
    this.animation?.cancel()
    this.animation = null
    if (!fade || this.reduced) {
      this.clear()
      return
    }
    const exit = this.card.animate([{opacity:1},{opacity:0}],{duration:150,easing:'ease-in',fill:'forwards'})
    this.animation = exit
    exit.onfinish = () => {
      if (this.animation===exit) this.clear()
    }
  }

  update(now:number) {
    if (now>=this.until) this.hide(true)
  }

  private clear() {
    this.animation?.cancel()
    this.animation = null
    this.card.hidden = true
    this.text.textContent = ''
    this.resize.disconnect()
  }

  private fitText() {
    if (!this.text.clientWidth) return
    this.text.style.removeProperty('font-size')
    const style = getComputedStyle(this.text)
    let size = parseFloat(style.fontSize)
    // Keep the full translation readable when a board or reserve card is narrow.
    while (size>8 && this.text.scrollHeight>Math.ceil(parseFloat(style.lineHeight)*2)) {
      size -= .5
      this.text.style.fontSize = `${size}px`
    }
  }
}
