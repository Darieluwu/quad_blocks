import { escape } from '../menu'
import type { LobbyState } from './protocol'

export function onlineMenu(lobby: LobbyState|null, seat: number, invite: string, name: string, notice: string, waiting: boolean, retry: boolean) {
  const status = `<p class="online-status" role="status">${escape(notice)}</p>`
  if (!lobby) return `<main class="panel online-panel"><button class="back" data-page="home">Volver</button>
    <h1>Blitz online</h1><p class="desc">Invita a tus amigos a una sala privada. Cada persona juega desde su navegador con los controles locales de J1.</p>
    ${status}<form id="online-connect" class="settings-card online-form">
      <label>Nombre <input name="name" value="${escape(name)}" maxlength="24" required autocomplete="nickname"></label>
      <label>Enlace o código de sala <input name="invite" value="${escape(invite)}" maxlength="240" autocomplete="off"></label>
      <div class="modal-actions"><button class="primary" name="join" ${waiting?'disabled':''}>${retry?'Reconectar':'Unirse'}</button>
      <button class="secondary" name="create" ${waiting?'disabled':''}>Crear sala</button></div>
    </form></main>`
  const host = seat===lobby.host
  const canStart = lobby.seats.filter(p=>p.connected && p.ready).length>=2 && lobby.seats.every(p=>!p.name || p.ready && p.connected)
  const seats = lobby.seats.map((p,i)=>`<li class="settings-card" style="--seat:${['#ff5266','#59aaff','#58e39a','#be86fa'][i]}">
    <span>J${i+1} · Equipo ${i<2?'A':'B'}${i===seat?' · Tú':''}${i===lobby.host?' · Anfitrión':''}</span>
    <strong>${escape(p.name) || 'Disponible'}</strong>
    ${p.name ? `<span>${p.connected ? p.ready ? 'Listo' : 'Preparándose' : 'Reconectando'}</span>` : host ?
      `<label>IA si queda libre <select data-online-bot="${i}">${Array.from({length:10},(_,j)=>`<option value="${j+1}" ${p.botLevel===j+1?'selected':''}>${j+1}</option>`).join('')}</select></label>` : `<span>IA ${p.botLevel} si queda libre</span>`}</li>`).join('')
  return `<main class="panel online-panel"><button class="back" data-page="home">Salir de la sala</button>
    <h1>Sala Blitz online</h1>${status}<div class="online-invite"><label>Enlace de invitación <input id="online-link" readonly value="${escape(invite)}"></label>
    <button class="secondary" data-online="copy">Copiar enlace</button></div><ol class="online-seats">${seats}</ol>
    <div class="modal-actions"><button class="secondary" data-online="ready">${lobby.seats[seat]?.ready?'Quitar listo':'Marcar listo'}</button>
      ${host?`<button class="primary" data-online="start" ${canStart?'':'disabled'}>Iniciar partida</button>`:'<span>El anfitrión inicia la partida.</span>'}</div>
    <p class="desc">Se necesitan al menos dos personas. Las plazas libres se completan con IA.</p></main>`
}
