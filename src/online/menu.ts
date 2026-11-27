import { escape } from '../menu'
import { uniqueCharacters } from '../characters/catalog'
import { lobbyEditors, lobbyFighter, lobbyLineup, seatEditor } from '../lobby-view'
import type { LobbyState } from './protocol'
import { lastStandCopy, standLanguage, standRule } from '../last-stand-copy'

export function onlineMenu(lobby: LobbyState|null, seat: number, invite: string, name: string, notice: string, waiting: boolean, retry: boolean) {
  const status = `<p class="online-status" role="status">${escape(notice)}</p>`
  const lang = standLanguage()
  const copy = lastStandCopy(lang)
  if (!lobby) return `<main class="panel online-panel"><button class="back" data-page="home">Volver</button>
    <h1 lang="${lang}">${copy.online}</h1><p class="desc">Invita a tus amigos a una sala privada. Cada persona juega desde su navegador con los controles locales de J1.</p>
    ${status}<form id="online-connect" class="settings-card online-form">
      <label>Nombre <input name="name" value="${escape(name)}" maxlength="24" required autocomplete="nickname"></label>
      <label lang="${lang}">${copy.format}<select name="format"><option value="blitz">2v2 Blitz</option><option value="teams">${copy.teams}</option></select></label>
      <label>Enlace o código de sala <input name="invite" value="${escape(invite)}" maxlength="240" autocomplete="off"></label>
      <div class="modal-actions"><button class="primary" name="join" ${waiting?'disabled':''}>${retry?'Reconectar':'Unirse'}</button>
      <button class="secondary" name="create" ${waiting?'disabled':''}>Crear sala</button></div>
    </form></main>`
  const host = seat===lobby.host
  const lineup = uniqueCharacters(lobby.seats.map(p=>p.character))
  const reserved = lobby.seats.map(p=>p.characterConfirmed ?? p.ready)
  const humans = lobby.seats.filter(p=>p.name)
  const readyCount = humans.filter(p=>p.connected && p.ready).length
  const canStart = readyCount>=2 && readyCount===humans.length
  const editors:string[] = []
  const seats = lobby.seats.map((p,i)=>{
    const editableBot = host && !p.name
    if (editableBot) editors.push(seatEditor(i,`<label>Dificultad de la IA <select data-online-bot="${i}">
      ${Array.from({length:10},(_,j)=>`<option value="${j+1}" ${p.botLevel===j+1?'selected':''}>${j+1}</option>`).join('')}</select></label>`,false))
    return lobbyFighter({slot:i,id:lineup[i],name:escape(p.name) || 'Plaza libre',
      details:p.name ? `Persona · ${i===seat?'Tus controles de J1':i===lobby.host?'Anfitrión':'Invitado'}` : `IA de nivel ${p.botLevel} si queda libre`,
      state:p.name ? p.connected ? p.ready?'LISTO':'POR CONFIRMAR' : 'RECONECTANDO' : reserved[i]?'PERSONAJE LISTO':'DISPONIBLE',
      ready:!!reserved[i] && (!p.name || p.connected),editable:i===seat || editableBot,settings:editableBot,
      readyAction:i===seat?`<button class="secondary ready" data-online="ready" aria-pressed="${p.ready}">${p.ready?'Quitar listo':'Marcar listo'}</button>`:undefined})
  })
  return `<main class="panel match-lobby"><button class="back" data-page="home">Salir de la sala</button>
    <h1 lang="${lobby.format==='teams'?lang:'es'}">${lobby.format==='teams'?copy.teamsRoom:'Sala Blitz online'}</h1>${status}<div class="online-invite"><label>Enlace de invitación <input id="online-link" readonly value="${escape(invite)}"></label>
    <button class="secondary" data-online="copy">Copiar enlace</button></div>
    ${lobby.format==='teams'?standRule(lobby.lastStand ?? true,true,host):''}${lobbyLineup(seats,true,canStart)}
    <div class="panel-actions"><span class="lobby-count" role="status">${readyCount} de ${humans.length} personas listas</span>
      ${host?`<button class="primary" data-online="start" ${canStart?'':'disabled'}>Iniciar partida</button>`:'<span>El anfitrión inicia la partida.</span>'}</div>
    ${lobbyEditors(editors)}
    <p class="desc">Se necesitan al menos dos personas. Las plazas libres se completan con IA.</p>
    <p class="hint">Izquierda y derecha para elegir, giro horario para confirmar y giro antihorario para volver.</p></main>`
}
