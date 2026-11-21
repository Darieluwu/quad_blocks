import { CHARACTER_IDS, CHARACTERS, type CharacterId } from './catalog'
import { portraitMarkup } from './presentation'

export function characterPicker(slot:number,lineup:readonly CharacterId[],reserved:readonly boolean[],editable:boolean) {
  const character = CHARACTERS[lineup[slot]]
  return `<div class="character-picker">${portraitMarkup(character.id,true)}<div>
    ${editable ? `<label>Personaje de J${slot+1}<select data-character="${slot}">${CHARACTER_IDS.map(id=>{
      const owner = lineup.indexOf(id)
      return `<option value="${id}" ${id===character.id?'selected':''} ${owner>=0 && owner!==slot && reserved[owner]?'disabled':''}>${CHARACTERS[id].name} · ${CHARACTERS[id].element}</option>`
    }).join('')}</select></label>` : `<strong>${character.name} · ${character.element}</strong>`}
    <p>${character.description}</p><p class="selection-caption" data-selection-caption="${slot}" role="status"></p></div></div>`
}
