import { CHARACTER_IDS, CHARACTERS, type CharacterId } from './catalog'
import { portraitMarkup } from './presentation'
import { artwork } from './assets'
import './picker.css'

export type PickerView = {slot:number;id:CharacterId;lineup:readonly CharacterId[];reserved:readonly boolean[];
  seats:readonly number[];drafts:ReadonlyMap<number,CharacterId>;pending:boolean;confirmed:boolean;reduced:boolean;caption:string;notice:string}

export class ArcadePicker {
  readonly node = document.createElement('dialog')
  private last?:CharacterId
  private seatList = ''
  private readonly art:HTMLElement
  private readonly tabs:HTMLElement
  private readonly confirm:HTMLButtonElement
  private readonly status:HTMLElement
  private readonly caption:HTMLElement
  private readonly buttons:HTMLButtonElement[]

  constructor() {
    this.node.className = 'arcade-picker'
    this.node.setAttribute('aria-labelledby','arcade-picker-title')
    this.node.innerHTML = `<div class="arcade-picker-inner">
      <header class="arcade-picker-header"><h2 id="arcade-picker-title">Selección de personaje</h2>
        <button class="secondary" data-picker-close autofocus>Volver a la sala</button></header>
      <nav class="arcade-seats" aria-label="Plazas disponibles"></nav>
      <div class="arcade-showcase"></div>
      <div class="arcade-roster" aria-label="Personajes">${CHARACTER_IDS.map(id=>{
        const {name,colors} = CHARACTERS[id]
        return `<button class="arcade-fighter" data-picker-id="${id}" style="--fighter:${colors[0]}" aria-pressed="false">
          ${portraitMarkup(id)}<strong>${name}</strong><small></small></button>`
      }).join('')}</div>
      <footer class="arcade-actions"><div><p class="arcade-feedback" role="status"></p>
        <p class="arcade-caption" role="status"></p></div><button class="primary" data-picker-confirm>Marcar listo</button></footer>
    </div>`
    document.body.append(this.node)
    this.art = this.node.querySelector('.arcade-showcase')!
    this.tabs = this.node.querySelector('.arcade-seats')!
    this.confirm = this.node.querySelector('[data-picker-confirm]')!
    this.status = this.node.querySelector('.arcade-feedback')!
    this.caption = this.node.querySelector('.arcade-caption')!
    this.buttons = [...this.node.querySelectorAll<HTMLButtonElement>('[data-picker-id]')]
    this.node.addEventListener('error',event=>{
      const image = event.target
      if (!(image instanceof HTMLImageElement)) return
      const fallback = image.dataset.fallback
      if (fallback && image.getAttribute('src')!==fallback) image.src = fallback
      else image.hidden = true
    },true)
  }

  update(view:PickerView) {
    const opened = this.node.open
    this.node.classList.toggle('reduced',view.reduced)
    this.node.dataset.slot = String(view.slot)
    this.node.style.setProperty('--fighter',CHARACTERS[view.id].colors[0])
    if (this.seatList!==view.seats.join(',')) {
      this.seatList = view.seats.join(',')
      this.tabs.innerHTML = view.seats.map(slot=>`<button type="button" data-picker-seat="${slot}">J${slot+1}</button>`).join('')
    }
    for (const button of this.tabs.querySelectorAll('button')) {
      const slot = Number(button.dataset.pickerSeat)
      const id = view.drafts.get(slot) ?? view.lineup[slot]
      button.setAttribute('aria-pressed',String(slot===view.slot))
      button.textContent = `J${slot+1} · ${CHARACTERS[id].name}`
    }
    let occupied = false
    for (const button of this.buttons) {
      const id = button.dataset.pickerId as CharacterId
      const owner = view.lineup.indexOf(id)
      const taken = owner>=0 && owner!==view.slot && view.reserved[owner]
      const selected = id===view.id
      button.setAttribute('aria-pressed',String(selected))
      button.toggleAttribute('data-occupied',taken)
      button.querySelector('small')!.textContent = taken ? `OCUPADO · J${owner+1}` : ''
      if (selected) occupied = taken
    }
    if (view.id!==this.last || !opened) this.preview(view.id,opened && !view.reduced)
    this.confirm.disabled = occupied || view.pending
    this.confirm.textContent = view.pending ? 'Confirmando…' : 'Marcar listo'
    this.status.textContent = view.notice || (occupied ? 'Elige un personaje disponible.' : view.confirmed ? 'PERSONAJE CONFIRMADO' : '')
    this.status.classList.toggle('confirmed',view.confirmed && !view.notice && !occupied)
    this.setCaption(view.caption)
    if (!opened) {
      this.node.showModal()
      this.focus(view.id)
    }
  }

  focus(id:CharacterId) { this.buttons.find(button=>button.dataset.pickerId===id)?.focus({preventScroll:true}) }
  setCaption(text:string) { if (this.caption.textContent!==text) this.caption.textContent = text }

  close() {
    if (this.node.open) this.node.close()
    this.last = undefined
    this.art.replaceChildren()
  }

  flash(id:CharacterId) {
    if (!this.node.open || this.last!==id || this.node.classList.contains('reduced')) return
    const scene = this.art.querySelector('.arcade-scene:not(.outgoing)')
    scene?.animate([
      {filter:'brightness(1.26)',transform:'translateX(4px)'},
      {filter:'none',transform:'none'},
    ],{duration:260,easing:'ease-out'})
    const image = scene?.querySelector<HTMLImageElement>('.arcade-master')
    const attack = artwork(CHARACTERS[id].assets.portraits.attack)
    if (image && attack) {
      image.closest('.arcade-figure')!.append(Object.assign(new Image(),{className:'arcade-confirm-pose',src:attack,alt:''}))
      const pose = image.parentElement!.lastElementChild!
      pose.animate([{opacity:0,transform:'translateX(14px)'},{opacity:.9,offset:.24},{opacity:0}],
        {duration:470,easing:'ease-out',fill:'both'}).onfinish = () => pose.remove()
    }
  }

  private preview(id:CharacterId,motion:boolean) {
    this.last = id
    const character = CHARACTERS[id]
    const neutral = artwork(character.assets.portraits.neutral)
    const master = artwork(character.assets.master) ?? neutral
    this.art.querySelectorAll('.arcade-scene.outgoing').forEach(scene=>scene.remove())
    const previous = this.art.firstElementChild
    if (previous && motion) {
      previous.classList.add('outgoing')
      previous.setAttribute('aria-hidden','true')
      previous.animate([{opacity:1},{opacity:0,transform:'translateX(-14px)'}],{duration:170,fill:'forwards'}).onfinish = ()=>previous.remove()
    } else this.art.replaceChildren()
    const scene = document.createElement('div')
    scene.className = 'arcade-scene'
    scene.dataset.preview = id
    scene.style.setProperty('--fighter',character.colors[0])
    scene.style.setProperty('--fighter-light',character.colors[1])
    scene.innerHTML = `<div class="arcade-identity"><span class="arcade-element">${character.element}</span>
      <h3>${character.name}</h3><p>${character.description}</p></div>
      <div class="arcade-figure" aria-hidden="true"><span>${character.name.slice(0,2)}</span>
      ${master?`<img class="arcade-master" src="${master}" data-fallback="${neutral ?? ''}" alt="" draggable="false">`:''}</div>`
    this.art.append(scene)
    if (motion) scene.animate([{opacity:0,transform:'translateX(20px)'},{opacity:1,transform:'none'}],
      {duration:210,easing:'cubic-bezier(.18,.68,.26,1)'})
  }
}
