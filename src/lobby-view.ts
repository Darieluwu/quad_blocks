import { artwork } from './characters/assets'
import { CHARACTERS, type CharacterId } from './characters/catalog'
import './lobby.css'

type Fighter = {
  slot:number; id:CharacterId; name:string; details:string; state:string; ready:boolean;
  editable:boolean; settings:boolean; readyAction?:string
}

// Names, device labels and editor markup are escaped by the local/online menu.
export function lobbyFighter({slot,id,name,details,state,ready,editable,settings,readyAction}:Fighter) {
  const character = CHARACTERS[id]
  const neutral = artwork(character.assets.portraits.neutral)
  const master = artwork(character.assets.master)
  const art = master ?? neutral
  return `<article class="lobby-fighter" data-slot="${slot}" data-fighter="${id}" data-ready-state="${ready}" style="--fighter:${character.colors[0]}">
    <div class="lobby-fighter-cover">
      <div class="lobby-fighter-art"><span aria-hidden="true">${character.name.slice(0,2)}</span>
        ${art?`<img src="${art}" ${master?'data-full-art':''} data-art-fallback="${neutral ?? ''}" alt="" draggable="false">`:''}
        <p class="selection-caption" data-selection-caption="${slot}" role="status"></p>
      </div>
      <div class="lobby-fighter-info">
        <div class="lobby-fighter-top"><span class="lobby-slot-tag">J${slot+1}</span><span class="lobby-ready-state">${state}</span></div>
        <h2>${character.name}</h2>
        <strong data-lobby-name="${slot}">${name}</strong>
        <span class="lobby-fighter-details">${details}</span>
      </div>
    </div>
    <div class="lobby-fighter-actions">
      ${editable?`<button class="secondary" data-character="${slot}" data-id="${id}" aria-label="Personaje de J${slot+1}" aria-haspopup="dialog">Personaje</button>`:''}
      ${settings?`<button class="secondary" data-seat-settings="${slot}" aria-expanded="false" aria-controls="lobby-seat-editor" aria-label="Ajustes de J${slot+1}">Ajustes</button>`:''}
      ${readyAction ?? ''}
    </div>
  </article>`
}

export function lobbyLineup(fighters:readonly string[],teams:boolean,allReady:boolean) {
  return `<div class="lobby-lineup ${teams?'lobby-lineup-teams':'lobby-lineup-solo'}" data-all-ready="${allReady}">
    ${teams ? `<section class="lobby-team" data-side="a" aria-label="Equipo A">
      <h2>Equipo <b>A</b></h2>${fighters.slice(0,2).join('')}</section>
      <div class="lobby-versus" aria-hidden="true"><span>VS</span></div>
      <section class="lobby-team" data-side="b" aria-label="Equipo B"><h2>Equipo <b>B</b></h2>${fighters.slice(2).join('')}</section>` : fighters.join('')}
  </div>`
}

export function seatEditor(slot:number,fields:string,ready:boolean) {
  return `<section class="lobby-seat-fields" data-seat-editor="${slot}" hidden>
    <div class="lobby-settings-header"><h2>Ajustes de J${slot+1}</h2><button class="secondary" data-seat-close>Cerrar ajustes</button></div>
    <div class="form-grid">${fields}</div>
    <div class="modal-actions"><button class="secondary" data-seat-action="character">Elegir personaje</button>
      ${ready?'<button class="secondary" data-seat-action="ready">Cambiar estado listo</button>':''}</div>
  </section>`
}

export function lobbyEditors(editors:readonly string[]) {
  return `<div id="lobby-seat-editor" class="lobby-seat-editor" hidden>${editors.join('')}</div>`
}
