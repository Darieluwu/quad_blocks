import { openLobby } from './navigation'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { CHARACTER_IDS, VOICE_EVENTS, type CharacterId, type VoiceEvent } from '../../src/characters/catalog'
import { characterVisuals } from '../../src/characters/visuals'
import { makeMatch, snapshot, type Frame, type ServerMessage } from '../../src/online/protocol'

const digest = (url:URL) => createHash('sha256').update(readFileSync(url)).digest('hex')
const original = new URL('../../src/characters/voices/ja/',import.meta.url)
const emitted = new URL('../../dist/assets/',import.meta.url)
const translations = JSON.parse(readFileSync(new URL('../../src/characters/subtitles/es.json',import.meta.url),'utf8')) as Record<CharacterId,Record<VoiceEvent,string>>

function voiceFiles() {
  const filenames = readdirSync(emitted).filter(name=>name.endsWith('.ogg'))
  const hashes = new Map(filenames.map(name=>[name,digest(new URL(name,emitted))]))
  return CHARACTER_IDS.flatMap(id=>{
    const directory = new URL(`${id}/`,original)
    const files = readdirSync(directory,{withFileTypes:true}).filter(file=>file.isFile()).map(file=>file.name)
    const expected = VOICE_EVENTS.map(event=>`${event}.ogg`)
    expect(files.sort(),`src/characters/voices/ja/${id}/`).toEqual(expected.sort())
    return VOICE_EVENTS.map(event=>{
      const path = `src/characters/voices/ja/${id}/${event}.ogg`
      const hash = digest(new URL(`${id}/${event}.ogg`,original))
      const file = filenames.find(name=>name.startsWith(`${event}-`) && hashes.get(name)===hash)
      expect(file,path).toBeDefined()
      return {id,event,path,url:`/assets/${file}`}
    })
  })
}

async function traceVoices(page:Page) {
  await page.addInitScript(()=>{
    const real = AudioContext.prototype.createMediaElementSource
    const log = {starts:[] as string[],ends:[] as string[],pauses:[] as string[],times:[] as number[],active:0,peak:0}
    Object.defineProperty(window,'voiceLog',{value:log})
    AudioContext.prototype.createMediaElementSource = function(track) {
      const node = real.call(this,track)
      const url = new URL(track.src).pathname
      if (!url.endsWith('.ogg')) return node
      let active = false
      const finish = (events:string[])=>{ if (active) { active=false; events.push(url); log.active-- } }
      const pause = track.pause.bind(track)
      track.pause = () => {
        if (!track.ended) finish(log.pauses)
        pause()
      }
      track.addEventListener('playing',()=>{
        log.starts.push(url)
        log.times.push(performance.now())
        active = true
        log.peak = Math.max(log.peak,++log.active)
      },{once:true})
      track.addEventListener('ended',()=>finish(log.ends),{once:true})
      track.addEventListener('pause',()=>{ if (!track.ended) finish(log.pauses) },{once:true})
      return node
    }
  })
}
type VoiceLog = {starts:string[]; ends:string[]; pauses:string[]; times:number[]; active:number; peak:number}
const voices = (page:Page) => page.evaluate(()=>(window as unknown as {voiceLog:VoiceLog}).voiceLog)
const blitzCaption = (page:Page,slot:number) => page.locator(
  `.blitz-subtitle-callout[data-callout-player="${slot}"]:visible, .player[data-player="${slot}"] .character-caption:visible`)

test('las grabaciones exactas se sirven y decodifican en el navegador desde el build',async ({page})=>{
  const files = voiceFiles()
  expect(new Set(files.map(file=>file.url)).size).toBe(CHARACTER_IDS.length*VOICE_EVENTS.length)
  await page.goto('/')
  const failures = await page.evaluate(async files=>{
    const audio = new AudioContext()
    try {
      const failures:string[] = []
      for (let i=0;i<files.length;i+=8) {
        await Promise.all(files.slice(i,i+8).map(async ({path,url})=>{
          try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const result = await audio.decodeAudioData(await response.arrayBuffer())
            if (!result.length || !result.duration || !result.getChannelData(0).some(sample=>Math.abs(sample)>.001)) {
              throw new Error('sin señal de audio')
            }
          } catch (error) { failures.push(`${path}: ${String(error)}`) }
        }))
      }
      return failures
    } finally { await audio.close() }
  },files)
  expect(failures).toEqual([])
})

test('Marcar listo reproduce las cuatro voces de selección en VS4 y muestra sus subtítulos',async ({page})=>{
  const assets = voiceFiles()
  await traceVoices(page)
  await page.goto('/')
  await openLobby(page,'versus')
  expect((await voices(page)).starts).toEqual([])
  for (let i=0;i<4;i++) await page.locator(`[data-ready="${i}"]`).click()
  const expected = CHARACTER_IDS.slice(0,4).map(id=>assets.find(file=>file.id===id && file.event==='selection')!.url)
  await expect.poll(async ()=>(await voices(page)).starts).toEqual(expect.arrayContaining(expected))
  for (const [slot,id] of CHARACTER_IDS.slice(0,4).entries()) {
    await expect(page.locator(`[data-selection-caption="${slot}"]`)).toContainText(translations[id].selection)
  }
  await expect.poll(async ()=>(await voices(page)).peak).toBe(4)
  await expect.poll(async ()=>(await voices(page)).ends).toEqual(expect.arrayContaining(expected))
})

test('la pista de selección mantiene una sola instancia y la sala funciona si la pista falta',async ({page},info)=>{
  await page.addInitScript(()=>{
    const tracks:HTMLMediaElement[] = []
    Object.assign(window,{selectionTracks:tracks})
    const create = AudioContext.prototype.createMediaElementSource
    AudioContext.prototype.createMediaElementSource = function(track) {
      if (track.src.includes('/selection-') && track.src.endsWith('.mp3')) tracks.push(track)
      return create.call(this,track)
    }
  })
  const music = () => page.evaluate(()=>{
    const tracks = (window as unknown as {selectionTracks:HTMLMediaElement[]}).selectionTracks
    return tracks.map(track=>({loop:track.loop,paused:track.paused,time:track.currentTime,error:track.error?.code}))
  })
  await page.goto('/')
  await openLobby(page,'versus')
  await expect.poll(async ()=>(await music())[0]?.time).toBeGreaterThan(0)
  await expect(page.locator('.lobby-fighter[data-slot="2"] .lobby-fighter-art img')).toHaveAttribute('src',/master-.+\.png$/)
  await page.locator('[data-character="2"]').click()
  await expect(page.locator('.arcade-scene:not(.outgoing)')).toHaveAttribute('data-preview','pix')
  await expect(page.locator('.arcade-master')).toHaveAttribute('src',/master-.+\.png$/)
  await expect.poll(()=>page.locator('.arcade-master').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(100)
  await page.screenshot({path:info.outputPath('pix-selector.png')})
  const before = (await music())[0].time
  await page.locator('[data-picker-confirm]').click()
  await expect(page.locator('.arcade-caption')).toContainText(translations.pix.selection)
  await page.keyboard.press('Escape')
  expect(await music()).toMatchObject([{loop:true,paused:false}])
  expect((await music())[0].time).toBeGreaterThan(before)
  await page.locator('[data-ready="0"]').click()
  await page.getByRole('button',{name:'Iniciar partida'}).click()
  await expect.poll(async ()=>(await music())[0].paused).toBe(true)
  await page.route('**/assets/selection-*.mp3',route=>route.fulfill({status:404}))
  await page.reload()
  await openLobby(page,'versus')
  await expect.poll(async ()=>(await music())[0]?.error).toBeTruthy()
  await page.locator('[data-seat-settings="2"]').click()
  await page.locator('[data-controller="2"]').selectOption('bot')
  await page.locator('[data-character="2"]').click()
  await page.locator('[data-picker-confirm]').click()
  await expect(page.locator('.arcade-caption')).toContainText(translations.pix.selection)
})

test('la sala arcade reserva al confirmar y reproduce las voces de persona e IA',async ({page},info)=>{
  const assets = voiceFiles()
  await traceVoices(page)
  await page.goto('/')
  await openLobby(page,'blitz')
  await page.locator('[data-seat-settings="1"]').click()
  await page.locator('[data-controller="1"]').selectOption('bot')
  await page.locator('[data-seat-close]:visible').click()
  expect((await voices(page)).starts).toEqual([])
  await page.screenshot({path:info.outputPath('sala-arcade.png')})
  await page.locator('[data-character="0"]').click()
  const picker = page.getByRole('dialog')
  const confirm = picker.locator('[data-picker-confirm]')
  await expect(picker.locator('.arcade-master')).toBeVisible()
  await expect.poll(()=>picker.locator('.arcade-master').evaluate((image:HTMLImageElement)=>image.naturalHeight)).toBeGreaterThan(800)
  await page.screenshot({path:info.outputPath('selector-volt.png')})
  await picker.locator('[data-picker-id="blaze"]').click()
  await expect(picker.locator('.arcade-scene:not(.outgoing) h3')).toHaveText('BLAZE')
  const blaze = picker.locator('.arcade-scene:not(.outgoing) .arcade-master')
  await expect.poll(()=>blaze.evaluate((img:HTMLImageElement)=>img.naturalHeight)).toBeGreaterThan(900)
  await page.screenshot({path:info.outputPath('blaze-selector.png'),animations:'disabled'})
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-character="0"]')).toHaveAttribute('data-id','volt')
  expect((await voices(page)).starts).toEqual([])
  await page.locator('[data-character="0"]').click()
  await confirm.click()
  await expect(picker.locator('.arcade-feedback')).toHaveText('PERSONAJE CONFIRMADO')
  await expect(picker.locator('.arcade-caption')).toContainText(translations.volt.selection)
  await picker.locator('[data-picker-seat="1"]').click()
  await picker.locator('[data-picker-id="volt"]').click()
  await expect(picker.locator('[data-picker-id="volt"]')).toContainText('OCUPADO')
  await expect(confirm).toBeDisabled()
  await picker.locator('[data-picker-id="blaze"]').click()
  await confirm.click()
  await expect(picker.locator('.arcade-caption')).toContainText(translations.blaze.selection)
  const sounds = ['volt','blaze'].map(id=>assets.find(file=>file.id===id && file.event==='selection')!.url)
  expect((await voices(page)).starts).toEqual(sounds)
  await page.setViewportSize({width:390,height:844})
  await expect(picker.locator('.arcade-scene.outgoing')).toHaveCount(0)
  expect(await picker.evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('selector-compacto.png')})
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:1920,height:1080})
  const fighter = page.locator('.lobby-fighter[data-slot="1"]')
  await expect(fighter.locator('.lobby-fighter-art img')).toHaveAttribute('src',/master-.+\.png$/)
  await expect(fighter).toContainText('BLAZE')
  await page.screenshot({path:info.outputPath('blaze-lobby.png'),animations:'disabled'})
})

async function playbackRoom(page:Page, options?:{attackVoices:boolean;subtitles:boolean;attackAnimations?:boolean},
  lineup:readonly CharacterId[] = ['volt','nix','pix','pengu']) {
  const levels = [null,5,null,5]
  const match = makeMatch('voice-validation',levels)
  let connection!:WebSocketRoute
  const send = (message:ServerMessage) => connection.send(JSON.stringify(message))
  await traceVoices(page)
  if (options) await page.addInitScript(characterOptions=>localStorage.setItem('quad-blocks-v1',JSON.stringify({characterOptions})),options)
  await page.routeWebSocket('**/api/salas/*',socket=>{
    connection = socket
    socket.onMessage(message=>{
      if (JSON.parse(String(message)).type!=='join') return
      send({type:'welcome',slot:0})
      send({type:'start',seed:'voice-validation',names:['Humano A','IA A','Humano B','IA B'],levels,countdown:0,characters:[...lineup]})
    })
  })
  await page.goto('/')
  await page.locator('[data-main-action="online"]').click()
  await page.getByRole('button',{name:'Crear sala'}).click()
  await expect(page.locator('.online-player')).toHaveText('ONLINE · J1')
  return {assets:voiceFiles(),lineup,match,frame:(events:Frame['events'])=>send({type:'frame',state:snapshot(match),events,fallen:[]})}
}

test('ASTRA usa su maestra y confirma con su voz y subtítulo en el selector',async ({page},info)=>{
  await traceVoices(page)
  await page.goto('/')
  await openLobby(page,'blitz')
  const slot = page.locator('.lobby-fighter[data-slot="3"]')
  const hero = slot.locator('.lobby-fighter-art img')
  await expect.poll(()=>hero.evaluate((img:HTMLImageElement)=>img.naturalHeight)).toBeGreaterThan(900)
  await page.screenshot({path:info.outputPath('astra-lobby.png'),animations:'disabled'})
  await page.locator('[data-character="3"]').click()
  const scene = page.locator('.arcade-scene:not(.outgoing)')
  await expect(scene).toHaveAttribute('data-preview','astra')
  await expect(scene.locator('.arcade-master')).toHaveAttribute('src',(await hero.getAttribute('src'))!)
  await expect(scene).toContainText('Cosmos')
  await page.screenshot({path:info.outputPath('astra-selector.png'),animations:'disabled'})
  await page.locator('[data-picker-confirm]').click()
  await expect(page.locator('.arcade-caption')).toContainText(translations.astra.selection)
  const voice = voiceFiles().find(file=>file.id==='astra' && file.event==='selection')!
  await expect.poll(async ()=>(await voices(page)).starts).toContain(voice.url)
})

test('ASTRA distingue sus ataques y Event Horizon en Blitz',async ({page},info)=>{
  const {match,frame,assets} = await playbackRoom(page,undefined,['volt','nix','pix','astra'])
  match.sides[0].active = 0
  match.sides[1].active = 3
  frame([])
  const player = page.locator('[data-player="3"]')
  const portrait = player.locator('.hud-portrait img')
  const scene = page.locator('.cinematic-scene.cinematic-cosmic')
  const advance = (events:Frame['events'])=>{ match.now++; frame(events) }
  const play = (type:string,detail?:string)=>advance([{slot:3,event:{type,detail}}])
  const hit = (type:string,strike:string)=>{
    // Deliver to the lower-index victim before the caller publishes the attack event.
    advance([{slot:0,event:{type:'incoming',source:3,detail:'4'}},{slot:3,event:{type,detail:'4'}}])
    return expect(page.locator(`.projectile-cosmic[data-strike="${strike}"][data-from="3"][data-to="0"]`)).toBeVisible()
  }
  await expect(portrait).toHaveAttribute('src',/neutral-.+\.png$/)
  play('simpleAttack')
  await expect(player.locator('.cosmic-portrait')).toHaveAttribute('data-effect','simple')
  await expect.poll(async ()=>(await voices(page)).starts)
    .toContain(assets.find(file=>file.id==='astra' && file.event==='simpleAttack1')!.url)
  await hit('quad','tetris')
  await expect(player.locator('.astra-showcase')).toHaveAttribute('data-scene','attack')
  await expect(page.locator('[data-player="0"] .cosmic-impact')).toBeVisible()
  await hit('tDouble','spin')
  for (const [type,detail,effect,art] of [
    ['combo','3','combo','attack'],['receive','3','damage','damage'],['critical','','danger','danger'],
    ['blitzGuard','2','shield','support'],['teammateDown','','down','danger'],['teammateRevived','','reboot','support'],
  ]) {
    play(type,detail)
    await expect(player.locator('.cosmic-portrait')).toHaveAttribute('data-effect',effect)
    await expect(portrait).toHaveAttribute('src',new RegExp(`/${art}-.+\\.png$`))
  }
  play('zoneStart')
  await expect(player.locator('.cinematic-charge.cinematic-cosmic img')).toBeVisible()
  await expect(portrait).toHaveAttribute('src',/zone-.+\.png$/)
  await hit('zoneEnd','zoneFinish')
  await expect(scene).toContainText(/EVENT\s*HORIZON/)
  await expect(scene).toHaveAttribute('data-delivery','true')
  await expect(page.locator('.blitz-subtitle-callout[data-team="1"] .dialogue-text')).toHaveText(translations.astra.zoneFinish)
  const region = (await scene.boundingBox())!
  for (const field of await page.locator('.player[data-featured="true"] .well').all()) {
    const box = (await field.boundingBox())!
    expect(region.x+region.width<=box.x || box.x+box.width<=region.x ||
      region.y+region.height<=box.y || box.y+box.height<=region.y).toBe(true)
  }
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(anim=>{
    anim.pause()
    anim.currentTime = 640
  }))
  await page.screenshot({path:info.outputPath('astra-event-horizon.png')})
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(anim=>anim.finish()))
  await expect(scene).toHaveCount(0)
  play('zoneEnd','6')
  await expect(scene).toHaveAttribute('data-delivery','false')
  await expect(scene.locator('.cinematic-beam')).toBeHidden()
  await expect(page.locator('.cinematic-impact.cinematic-cosmic')).toHaveCount(0)
  await expect(scene).toHaveCount(0)
  match.sides[1].active = 2
  advance([])
  await expect(player).toHaveAttribute('data-state','reserve')
  await page.emulateMedia({reducedMotion:'reduce'})
  play('zoneEnd','6')
  await expect(scene).toHaveCount(0)
})

test('NIX aparece en el lobby y confirma su selección como IA',async ({page},info)=>{
  await traceVoices(page)
  await page.goto('/')
  await openLobby(page,'blitz')
  const fighter = page.locator('.lobby-fighter[data-slot="1"]')
  await expect(fighter.locator('.lobby-fighter-art img')).toHaveAttribute('src',/master-.+\.png$/)
  await page.locator('[data-seat-settings="1"]').click()
  await page.locator('[data-controller="1"]').selectOption('bot')
  await page.locator('[data-seat-close]:visible').click()
  await page.screenshot({path:info.outputPath('nix-lobby.png')})
  await page.locator('[data-character="1"]').click()
  await expect(page.locator('.arcade-scene:not(.outgoing)')).toHaveAttribute('data-preview','nix')
  const master = page.locator('.arcade-scene:not(.outgoing) .arcade-master')
  await expect.poll(()=>master.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(500)
  await page.screenshot({path:info.outputPath('nix-selector.png'),animations:'disabled'})
  await page.locator('[data-picker-confirm]').click()
  await expect(page.locator('.arcade-caption')).toContainText(translations.nix.selection)
  const voice = voiceFiles().find(file=>file.id==='nix' && file.event==='selection')!
  await expect.poll(async ()=>(await voices(page)).starts).toContain(voice.url)
})

test('NIX muestra efectos glaciares y Absolute Zero sin cubrir las matrices',async ({page},info)=>{
  const {assets,match,frame} = await playbackRoom(page)
  match.sides[0].active = 1
  match.sides[1].active = 2
  frame([])
  const player = page.locator('[data-player="1"]')
  const art = player.locator('.hud-portrait img')
  await expect(art).toHaveAttribute('src',/neutral-.+\.png$/)
  frame([{slot:1,event:{type:'simpleAttack'}}])
  await expect(player.locator('.frost-portrait')).toHaveAttribute('data-effect','simple')
  await expect.poll(async ()=>(await voices(page)).starts)
    .toContain(assets.find(file=>file.id==='nix' && file.event==='simpleAttack1')!.url)
  frame([{slot:0,event:{type:'quad',detail:'4'}},{slot:1,event:{type:'quad',detail:'4'}},
    {slot:2,event:{type:'tDouble',detail:'2'}}])
  await expect(player.locator('.nix-showcase')).toHaveAttribute('data-scene','attack')
  await expect(page.locator('[data-player="2"] .digital-portrait')).toHaveAttribute('data-effect','spin')
  await expect(page.locator('[data-player="0"] .volt-showcase')).toHaveAttribute('data-scene','attack')
  for (const [type,detail,effect,pose] of [
    ['tDouble','2','spin','attack'],['combo','3','combo','attack'],
    ['receive','3','damage','damage'],['critical','','danger','danger'],
    ['blitzGuard','2','shield','support'],['teammateDown','','down','danger'],
    ['teammateRevived','','reboot','support'],
  ]) {
    frame([{slot:1,event:{type,detail}}])
    await expect(player.locator('.frost-portrait')).toHaveAttribute('data-effect',effect)
    await expect(art).toHaveAttribute('src',new RegExp(`/${pose}-.+\\.png$`))
  }
  frame([{slot:1,event:{type:'zoneStart'}}])
  await expect(player.locator('.cinematic-charge.cinematic-frost img')).toBeVisible()
  await expect(art).toHaveAttribute('src',/zone-.+\.png$/)
  match.now++
  frame([{slot:1,event:{type:'zoneEnd',detail:'8'}},{slot:2,event:{type:'incoming',source:1,detail:'4'}}])
  const scene = page.locator('.cinematic-scene.cinematic-frost')
  await expect(scene).toContainText(/ABSOLUTE\s*ZERO/)
  await expect(scene).toHaveAttribute('data-delivery','true')
  await expect(page.locator('.projectile-frost[data-from="1"][data-to="2"]')).toBeVisible()
  for (const image of await scene.locator('img').all()) {
    await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBeGreaterThan(500)
  }
  await expect(blitzCaption(page,1).locator('.dialogue-text')).toHaveText(translations.nix.zoneFinish)
  const region = (await scene.boundingBox())!
  for (const field of await page.locator('.player[data-featured="true"] .well').all()) {
    const box = (await field.boundingBox())!
    expect(region.x+region.width<=box.x || box.x+box.width<=region.x ||
      region.y+region.height<=box.y || box.y+box.height<=region.y).toBe(true)
  }
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>{
    animation.pause()
    animation.currentTime = 640
  }))
  await page.screenshot({path:info.outputPath('nix-absolute-zero.png')})
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>animation.finish()))
  await expect(scene).toHaveCount(0)
  await page.emulateMedia({reducedMotion:'reduce'})
  frame([{slot:1,event:{type:'zoneEnd',detail:'8'}}])
  await expect(scene).toHaveCount(0)
})

test('PIX usa reacciones digitales y System Override en Blitz',async ({page},info)=>{
  await page.setViewportSize({width:1920,height:1080})
  const {match,frame} = await playbackRoom(page)
  match.sides[0].active = 0
  match.sides[1].active = 2
  frame([])
  const player = page.locator('[data-player="2"]')
  const art = player.locator('.hud-portrait img')
  await expect(art).toHaveAttribute('src',/neutral-.+\.png$/)
  for (const [type,detail,effect,pose] of [
    ['quad','4','tetris','attack'],['tDouble','2','spin','attack'],['combo','3','combo','attack'],
    ['receive','3','damage','damage'],['critical','','danger','danger'],['blitzGuard','2','shield','support'],
    ['teammateDown','','down','support'],['teammateRevived','','reboot','support'],
  ]) {
    frame([{slot:2,event:{type,detail}}])
    await expect(player.locator('.digital-portrait')).toHaveAttribute('data-effect',effect)
    await expect(art).toHaveAttribute('src',new RegExp(`/${pose}-.+\\.png$`))
  }
  frame([{slot:2,event:{type:'zoneStart'}}])
  await expect(player.locator('.cinematic-charge.cinematic-digital')).toBeVisible()
  await expect(art).toHaveAttribute('src',/zone-.+\.png$/)
  match.now++
  frame([{slot:2,event:{type:'zoneEnd',detail:'8'}},{slot:0,event:{type:'incoming',source:2,detail:'4'}}])
  const scene = page.locator('.cinematic-scene.cinematic-digital')
  await expect(scene).toContainText(/SYSTEM\s*OVERRIDE/)
  await expect(scene).toHaveAttribute('data-delivery','true')
  await expect(page.locator('.projectile-digital[data-from="2"]')).toBeVisible()
  await expect(scene.locator('.cinematic-pose')).toBeVisible()
  await expect(blitzCaption(page,2).locator('.dialogue-text')).toHaveText(translations.pix.zoneFinish)
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>{
    animation.pause()
    animation.currentTime = 640
  }))
  await page.screenshot({path:info.outputPath('pix-system-override.png')})
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>animation.finish()))
  await expect(scene).toHaveCount(0)
  frame([{slot:2,event:{type:'victory'}}])
  await expect(art).toHaveAttribute('src',/victory-.+\.png$/)
  match.players[2].dead = true
  frame([{slot:2,event:{type:'eliminated'}}])
  await expect(art).toHaveAttribute('src',/defeat-.+\.png$/)
  await page.emulateMedia({reducedMotion:'reduce'})
  frame([{slot:2,event:{type:'zoneEnd',detail:'8'}}])
  await expect(scene).toHaveCount(0)
})

test('Blitz ubica dos tarjetas fuera de los tableros y las muestra en el marco compacto o en reserva',async ({page},info)=>{
  await page.setViewportSize({width:1902,height:896})
  const {match,frame} = await playbackRoom(page,{attackVoices:false,subtitles:true,attackAnimations:false},['nix','pix','volt','pengu'])
  match.sides[0].active = 0
  match.sides[1].active = 2
  frame([])
  const player = page.locator('.player[data-player="2"]')
  const portrait = player.locator('.player-banner .character-portrait')
  await expect(player).toHaveAttribute('data-state','active')
  await expect(page.locator('.player[data-player="3"] .blitz-state')).toHaveText('EN ESPERA')
  await expect.poll(()=>portrait.locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(512)
  frame([{slot:0,event:{type:'quad'}},{slot:2,event:{type:'quad'}}])
  const caption = blitzCaption(page,2)
  await expect(caption.locator('.dialogue-name')).toHaveText('VOLT')
  await expect(caption.locator('.dialogue-text')).toHaveText(translations.volt.tetris)
  await expect(page.locator('.blitz-subtitle-callout:visible')).toHaveCount(2)
  const left = (await page.locator('[data-player="0"]').boundingBox())!
  const right = (await player.boundingBox())!
  const clock = (await page.locator('.blitz-clock').boundingBox())!
  const leftCard = (await blitzCaption(page,0).boundingBox())!
  const rightCard = (await caption.boundingBox())!
  expect(leftCard.x+leftCard.width).toBeLessThan(left.x)
  expect(rightCard.x).toBeGreaterThan(right.x+right.width)
  expect(leftCard.x+leftCard.width<clock.x && rightCard.x>clock.x+clock.width).toBe(true)
  await page.screenshot({path:info.outputPath('dialogos-blitz.png'),animations:'disabled'})
  for (const [width,height,min] of [[1920,1080,150],[1600,900,140],[1366,768,110],[600,820,40]]) {
    await page.setViewportSize({width,height})
    const art = (await portrait.boundingBox())!
    const board = (await player.locator('.well').boundingBox())!
    const banner = (await player.locator('.player-banner').boundingBox())!
    expect(art.width).toBeGreaterThanOrEqual(min)
    if (width>=1140) {
      const field = (await player.boundingBox())!
      const other = (await page.locator('[data-player="0"] .hud-portrait').boundingBox())!
      const timer = (await page.locator('.blitz-clock').boundingBox())!
      const overlaps = (a:typeof art,b:typeof art) => a.x<b.x+b.width && b.x<a.x+a.width && a.y<b.y+b.height && b.y<a.y+a.height
      expect(art.x+art.width).toBeLessThan(field.x)
      expect(overlaps(art,other)).toBe(false)
      expect(overlaps(art,timer)).toBe(false)
      expect(overlaps(other,timer)).toBe(false)
      await page.screenshot({path:info.outputPath(`retratos-blitz-${width}.png`),animations:'disabled'})
    } else expect(art.x).toBe(banner.x)
    expect(banner.y+banner.height).toBeLessThan(board.y)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width<1500) {
      frame([{slot:2,event:{type:'combo',detail:'3'}}])
      await expect(caption.locator('.dialogue-text')).toHaveText(translations.volt.combo)
      await expect(caption).toBeVisible()
      const card = (await caption.boundingBox())!
      expect(card.y+card.height).toBeLessThanOrEqual(board.y)
      expect((await player.locator('.well').boundingBox())!.y).toBe(board.y)
    }
  }
  match.sides[1].active = 3
  match.players[2].zone.energy = 50
  match.players[2].garbage.push({lines:3,hole:0,ready:40,source:1})
  frame([{slot:2,event:{type:'tDouble'}},{slot:1,event:{type:'teammateRevived'}}])
  await expect(player).toHaveAttribute('data-state','reserve')
  await expect(player.locator('.well')).toBeHidden()
  await expect(player.locator('.reserve-readout')).toHaveText(/SURGE 50%.*\+3 basura/)
  await expect(portrait).toBeVisible()
  await expect(caption.locator('.dialogue-text')).toHaveText(translations.volt.spin)
  const reserveLine = page.locator('[data-player="1"] .dialogue-text')
  await expect(reserveLine).toHaveText(translations.pix.teammateRevived)
  expect(await reserveLine.evaluate(line=>line.scrollHeight<=Math.ceil(parseFloat(getComputedStyle(line).lineHeight)*2))).toBe(true)
  await page.setViewportSize({width:1920,height:1080})
  const reserve = (await portrait.boundingBox())!
  expect(reserve.width).toBeGreaterThanOrEqual(48)
  expect(reserve.width).toBeLessThanOrEqual(64)
})

test('el retrato lateral amplía Tetris y Spin sin desplazar el campo y conserva sus expresiones',async ({page},info)=>{
  await page.setViewportSize({width:1920,height:1080})
  const {match,frame} = await playbackRoom(page)
  match.sides[0].active = 0
  match.sides[1].active = 2
  frame([])
  const player = page.locator('[data-player="0"]')
  await expect(player).toHaveAttribute('data-featured','true')
  const portraitFrame = player.locator('.hud-portrait')
  const portrait = portraitFrame.locator('.character-portrait')
  const matrix = player.locator('.well')
  const base = (await portraitFrame.boundingBox())!
  const board = await matrix.boundingBox()
  for (const type of ['quad','combo','blitzGuard','tDouble']) {
    frame([{slot:0,event:{type,detail:'3'}}])
    await expect(portrait).toHaveAttribute('data-portrait',type==='blitzGuard'?'support':'attack')
    await expect(portraitFrame).toHaveAttribute('data-pulsing','')
    expect(await portraitFrame.evaluate(node=>{
      const pulse = node.getAnimations()[0]
      pulse.pause()
      pulse.currentTime = 135.2
      return pulse.effect?.getTiming().duration
    })).toBe(520)
    const expanded = (await portraitFrame.boundingBox())!
    expect(expanded.width/base.width).toBeCloseTo(1.18,2)
    if (type==='blitzGuard') expect(expanded.x).toBeCloseTo(base.x)
    else expect(expanded.x).toBeGreaterThan(base.x)
    const other = (await page.locator('[data-player="2"] .hud-portrait').boundingBox())!
    expect(expanded.x+expanded.width).toBeLessThan(other.x)
    expect(await matrix.boundingBox()).toEqual(board)
    if (type==='quad') await page.screenshot({path:info.outputPath('volt-reaccion-tetris.png')})
    await portraitFrame.evaluate(node=>node.getAnimations()[0].finish())
    await expect(portraitFrame).not.toHaveAttribute('data-pulsing','')
  }
  frame([{slot:0,event:{type:'receive',detail:'3'}}])
  await expect(portrait).toHaveAttribute('data-portrait','damage')
  frame([{slot:0,event:{type:'critical'}}])
  await expect(portrait).toHaveAttribute('data-portrait','danger')
  await expect(portrait).toHaveAttribute('data-portrait','neutral')
  await page.emulateMedia({reducedMotion:'reduce'})
  frame([{slot:0,event:{type:'quad'}}])
  await expect(portrait).toHaveAttribute('data-portrait','attack')
  await expect(portraitFrame).not.toHaveAttribute('data-pulsing','')
})

test('VS4 muestra una cinemática independiente sobre cada tablero',async ({page})=>{
  await page.setViewportSize({width:1920,height:1080})
  await page.addInitScript(()=>localStorage.setItem('quad-blocks-v1',JSON.stringify({characters:['volt','nix','pix','astra']})))
  await page.goto('/')
  await openLobby(page,'versus')
  for (let i=0;i<4;i++) await page.locator(`[data-ready="${i}"]`).click()
  await page.getByRole('button',{name:'Iniciar partida'}).click()
  await expect(page.locator('.arena-grid .player')).toHaveCount(4)
  await expect(page.locator('.arena-grid')).toBeVisible()
})

for (const last of ['astra','blaze','pengu'] as const) test(`VS4 muestra cuatro voces y tarjetas separadas con ${last}`,async ({page},info)=>{
  const lineup = ['volt','nix','pix',last] as const
  await page.addInitScript(characters=>localStorage.setItem('quad-blocks-v1',JSON.stringify({characters})),lineup)
  await traceVoices(page)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  await page.goto('/')
  await openLobby(page,'versus')
  for (let i=0;i<4;i++) await page.locator(`[data-ready="${i}"]`).click()
  await page.getByRole('button',{name:'Iniciar partida'}).click()
  await page.clock.runFor(6800)
  await expect(page.locator('#overlay')).toBeHidden()
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100))
  const players = page.locator('.arena-grid .player')
  await expect(players.locator('.hud-portrait:visible')).toHaveCount(4)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.evaluate(()=>{
    const arena = document.querySelector('.arena-grid')!
    new MutationObserver(()=>{
      const effects = arena.querySelectorAll(':is(.frost-portrait,.digital-portrait,.cosmic-portrait,.fire-portrait,.lunar-portrait)[data-effect="danger"]')
      if (effects.length===3) (arena as HTMLElement).dataset.simultaneousPortraits = '3'
    }).observe(arena,{childList:true,subtree:true})
  })
  for (let round=0;round<14 && await players.first().getAttribute('data-danger')!=='2';round++) {
    await page.evaluate(()=>{
      for (const code of ['KeyW','KeyI','ArrowUp','Numpad8']) {
        for (const type of ['keydown','keyup']) window.dispatchEvent(new KeyboardEvent(type,{code}))
      }
    })
    await page.clock.runFor(34)
  }
  await expect(page.locator('.arena-grid')).toHaveAttribute('data-simultaneous-portraits','3')
  const captions = players.locator('.character-caption')
  await expect(captions.locator('.dialogue-name')).toHaveText(lineup.map(id=>id.toUpperCase()))
  await expect(captions.locator('.dialogue-text')).toHaveText(lineup.map(id=>translations[id].danger))
  await expect.poll(async ()=>(await voices(page)).peak).toBe(4)
  await expect(captions.nth(0).locator('.dialogue-avatar img')).toBeVisible()
  await expect(captions.nth(1).locator('.dialogue-avatar img')).toBeVisible()
  await expect(captions.nth(3).locator('.dialogue-avatar img')).toBeVisible()
  for (const width of [1920,600,320]) {
    await page.setViewportSize({width,height:1080})
    const measure = () => page.evaluate(()=>{
      const bounds = (selector:string) => [...document.querySelectorAll(selector)].map(node=>node.getBoundingClientRect().toJSON())
      const fit = [...document.querySelectorAll<HTMLElement>('.dialogue-text')].every(line=>
        line.scrollHeight<=Math.ceil(parseFloat(getComputedStyle(line).lineHeight)*2) && line.scrollWidth<=line.clientWidth)
      return {cards:bounds('.character-caption:not([hidden])'),boards:bounds('.well'),fit,scrollWidth:document.documentElement.scrollWidth}
    })
    await expect.poll(async ()=>(await measure()).fit,{message:`Subtítulos a ${width}px`}).toBe(true)
    const layout = await measure()
    const overlaps = (a:DOMRect,b:DOMRect) => a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom
    expect(layout.cards).toHaveLength(4)
    expect(layout.cards.every((box,i)=>layout.boards.every(board=>!overlaps(box,board)) &&
      layout.cards.slice(i+1).every(other=>!overlaps(box,other)))).toBe(true)
    expect(layout.scrollWidth).toBeLessThanOrEqual(width)
    if (width===1920) await page.screenshot({path:info.outputPath('dialogos-vs4.png')})
  }
})

test('la definitiva de Volt compone la tormenta y la descarga entre los tableros de Blitz',async ({page},info)=>{
  await page.setViewportSize({width:1902,height:950})
  const {match,frame} = await playbackRoom(page)
  match.sides[0].active = 0
  match.sides[1].active = 2
  frame([])
  const player = page.locator('.player[data-player="0"]')
  const scene = player.locator('.volt-showcase')
  await expect(player).toHaveAttribute('data-state','active')
  const rival = page.locator('.player[data-player="2"]')
  frame([{slot:0,event:{type:'zoneStart'}}])
  await expect(player.locator('.cinematic-charge')).toBeVisible()
  await expect(player.locator('.player-banner .character-portrait')).toHaveAttribute('data-portrait','zone')
  frame([{slot:0,event:{type:'quad'}},{slot:2,event:{type:'incoming',source:0,detail:'4'}}])
  await expect(scene.locator('.volt-attack')).toBeVisible()
  await expect(page.locator('.projectile-electric[data-from="0"][data-to="2"]')).toBeVisible()
  await expect(page.locator('[data-player="2"] .impact')).toBeVisible()
  await rival.evaluate(node=>{
    const observer = new MutationObserver(records=>{
      if (records.some(record=>[...record.addedNodes].some(child=>
        child instanceof HTMLElement && child.classList.contains('cinematic-impact')))) {
        node.setAttribute('data-saw-cinematic-impact','true')
        observer.disconnect()
      }
    })
    observer.observe(node,{childList:true})
  })
  match.now++
  frame([{slot:0,event:{type:'zoneEnd',detail:'8'}},{slot:2,event:{type:'incoming',source:0,detail:'4'}}])
  const ultimate = page.locator('.cinematic-scene')
  await expect(ultimate.locator('.cinematic-title strong')).toHaveText(new RegExp(characterVisuals.volt!.title.join('\\s*')))
  await expect(ultimate).toBeVisible()
  await expect(ultimate).toHaveAttribute('data-layout','center')
  await expect(ultimate).toHaveAttribute('data-delivery','true')
  await expect(ultimate).toHaveAttribute('data-direction','right')
  await expect(ultimate).toHaveCSS('pointer-events','none')
  await expect(player.locator('.hud-portrait')).toHaveCSS('opacity','0')
  const box = (await ultimate.boundingBox())!
  expect(box.x).toBeGreaterThan((await player.boundingBox())!.x+(await player.boundingBox())!.width)
  expect(box.x+box.width).toBeLessThan((await rival.boundingBox())!.x)
  expect(box.y+box.height).toBeLessThan((await page.locator('.blitz-clock').boundingBox())!.y)
  for (const image of await ultimate.locator('img').all()) {
    expect(await image.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(100)
  }
  expect(await ultimate.evaluate(node=>{
    const animations = node.getAnimations({subtree:true})
    for (const animation of animations) { animation.pause(); animation.currentTime = 730 }
    return node.getAnimations()[0].effect?.getTiming().duration
  })).toBe(1100)
  expect((await ultimate.locator('.cinematic-pose').boundingBox())!.height).toBeGreaterThan(350)
  const caption = blitzCaption(page,0)
  await expect(caption.locator('.dialogue-text')).toHaveText(translations.volt.zoneFinish)
  const card = (await caption.boundingBox())!
  expect(card.x+card.width).toBeLessThan(box.x)
  await page.screenshot({path:info.outputPath('volt-surge.png')})
  await expect(rival).toHaveAttribute('data-saw-cinematic-impact','true')
  await ultimate.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>animation.play()))
  await expect(ultimate).toHaveCount(0)
  await page.emulateMedia({reducedMotion:'reduce'})
  frame([{slot:0,event:{type:'zoneEnd',detail:'8'}}])
  await expect(player.locator('.zone-result')).toBeVisible()
  await expect(ultimate).toBeHidden()
})

test('BLAZE reacciona a ataques y rescates y conserva los avisos al reducir efectos',async ({page})=>{
  const {assets,match,frame} = await playbackRoom(page,undefined,['volt','nix','blaze','astra'])
  match.sides[0].active = 0
  match.sides[1].active = 2
  const player = page.locator('[data-player="2"]')
  const portrait = player.locator('.hud-portrait img')
  const mark = (type:string,detail?:string)=>{match.now++; frame([{slot:2,event:{type,detail}}])}
  const rival = page.locator('[data-player="0"]')
  await rival.evaluate(node=>{
    new MutationObserver(records=>{
      for (const record of records) for (const added of record.addedNodes) {
        if (added instanceof HTMLElement && added.classList.contains('fire-impact')) {
          node.setAttribute('data-fire-hits',String(Number(node.getAttribute('data-fire-hits'))+1))
        }
      }
    }).observe(node,{childList:true})
  })
  await expect(portrait).toHaveAttribute('src',/neutral-.+\.png$/)
  mark('simpleAttack')
  const voice = assets.find(file=>file.id==='blaze' && file.event==='simpleAttack1')!
  await expect.poll(async ()=>(await voices(page)).starts).toContain(voice.url)
  for (const [type,detail,effect,art] of [
    ['quad','4','tetris','attack'],['tDouble','2','spin','attack'],['combo','3','combo','attack'],
    ['receive','3','damage','damage'],['critical','','danger','danger'],['blitzGuard','2','shield','support'],
    ['teammateDown','','down','danger'],['teammateRevived','','reboot','victory'],
  ]) {
    match.now++
    frame(type==='quad'||type==='tDouble' ? [{slot:0,event:{type:'incoming',source:2,detail:'4'}},
      {slot:2,event:{type,detail}}] : [{slot:2,event:{type,detail}}])
    await expect(player.locator('.fire-portrait')).toHaveAttribute('data-effect',effect)
    await expect(portrait).toHaveAttribute('src',new RegExp(`/${art}-.+\\.png$`))
    if (type==='quad') await expect(player.locator('.blaze-showcase img')).toBeVisible()
    if (type==='quad'||type==='tDouble') {
      await expect(page.locator(`.projectile-fire[data-strike="${effect}"][data-to="0"]`)).toBeVisible()
      await expect(rival).toHaveAttribute('data-fire-hits',type==='quad'?'1':'2')
    }
  }
  mark('zoneStart')
  await expect(player.locator('.cinematic-charge.cinematic-fire img')).toBeVisible()
  await expect(portrait).toHaveAttribute('src',/zone-.+\.png$/)
  await page.emulateMedia({reducedMotion:'reduce'})
  mark('zoneEnd','8')
  await expect(player.locator('.zone-result')).toBeVisible()
  await expect(page.locator('.cinematic-scene')).toHaveCount(0)
})

test('PENGU confirma el personaje y muestra la maestra aprobada en el lobby',async ({page},info)=>{
  await page.addInitScript(()=>localStorage.setItem('quad-blocks-v1',JSON.stringify({characters:['volt','nix','pix','pengu']})))
  await traceVoices(page)
  await page.goto('/')
  await openLobby(page,'blitz')
  const slot = page.locator('.lobby-fighter[data-slot="3"]')
  const art = slot.locator('.lobby-fighter-art img')
  await expect.poll(()=>art.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(500)
  await page.screenshot({path:info.outputPath('pengu-lobby.png'),animations:'disabled'})
  await page.locator('[data-character="3"]').click()
  const scene = page.locator('.arcade-scene[data-preview="pengu"]:not(.outgoing)')
  await expect(scene.locator('.arcade-master')).toHaveAttribute('src',(await art.getAttribute('src'))!)
  await expect(scene).toContainText('Magia lunar')
  await page.screenshot({path:info.outputPath('pengu-selector.png'),animations:'disabled'})
  await page.locator('[data-picker-confirm]').click()
  await expect(page.locator('.arcade-caption')).toContainText(translations.pengu.selection)
  const voice = voiceFiles().find(file=>file.id==='pengu' && file.event==='selection')!
  await expect.poll(async ()=>(await voices(page)).starts).toContain(voice.url)
})

test('PENGU muestra Starfall, Lunar Twist, Dream Ward y Midnight Reverie',async ({page},info)=>{
  const {assets,match,frame} = await playbackRoom(page,undefined,['astra','pix','pengu','volt'])
  match.sides[0].active=0
  match.sides[1].active=2
  const pengu=page.locator('[data-player="2"]')
  const portrait=pengu.locator('.hud-portrait img')
  const deliver=(events:Frame['events'])=>{match.now++;frame(events)}
  const react=(type:string,detail?:string)=>deliver([{slot:2,event:{type,detail}}])
  await expect(portrait).toHaveAttribute('src',/neutral-.+\.png$/)
  react('simpleAttack')
  const voice=assets.find(file=>file.id==='pengu' && file.event==='simpleAttack1')!
  await expect.poll(async ()=>(await voices(page)).starts).toContain(voice.url)
  for (const [type,detail,effect,expression] of [
    ['quad','4','tetris','attack'],['tDouble','2','spin','attack'],['combo','3','combo','attack'],
    ['receive','3','damage','damage'],['critical','','danger','danger'],['blitzGuard','2','shield','support'],
    ['teammateDown','','down','danger'],['teammateRevived','','reboot','victory'],
  ]) {
    if (effect==='tetris'||effect==='spin') {
      deliver([{slot:0,event:{type:'incoming',source:2,detail:'4'}},{slot:2,event:{type,detail}}])
      await expect(page.locator(`.projectile-lunar[data-strike="${effect}"][data-to="0"]`)).toBeVisible()
    } else react(type,detail)
    await expect(pengu.locator('.lunar-portrait')).toHaveAttribute('data-effect',effect)
    await expect(portrait).toHaveAttribute('src',new RegExp(`/${expression}-.+\\.png$`))
    if (effect==='tetris') await expect(pengu.locator('.pengu-showcase img')).toBeVisible()
  }
  react('zoneStart')
  await expect(pengu.locator('.cinematic-charge.cinematic-lunar img')).toBeVisible()
  await expect(portrait).toHaveAttribute('src',/zone-.+\.png$/)
  deliver([{slot:0,event:{type:'zoneEnd',detail:'6'}},{slot:2,event:{type:'zoneEnd',detail:'8'}},
    {slot:0,event:{type:'incoming',source:2,detail:'4'}}])
  const upper=page.locator('.cinematic-scene[data-channel="team-a"]')
  const lower=page.locator('.cinematic-scene[data-channel="team-b"]')
  await expect(upper).toContainText(/EVENT\s*HORIZON/)
  await expect(lower).toContainText(/MIDNIGHT\s*REVERIE/)
  await expect(lower.locator('.cinematic-moon')).toBeVisible()
  await expect(lower).toHaveAttribute('data-delivery','true')
  await expect(upper.locator('.cinematic-beam')).toBeHidden()
  for (const selector of ['.cinematic-pose','.cinematic-background']) {
    await expect.poll(()=>lower.locator(selector).evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(300)
  }
  await expect(page.locator('.blitz-subtitle-callout[data-team="1"] .dialogue-text')).toHaveText(translations.pengu.zoneFinish)
  const bounds=(await lower.boundingBox())!
  const above=(await upper.boundingBox())!
  expect(bounds.y).toBeGreaterThan(above.y+above.height)
  for (const field of await page.locator('.player[data-featured="true"] .well').all()) {
    const board=(await field.boundingBox())!
    expect(bounds.x+bounds.width<=board.x || board.x+board.width<=bounds.x).toBe(true)
  }
  const channels=page.locator('.cinematic-scene[data-channel]')
  await channels.evaluateAll(nodes=>nodes.forEach(node=>node.getAnimations({subtree:true}).forEach(anim=>{
    anim.pause();anim.currentTime=640
  })))
  await page.screenshot({path:info.outputPath('pengu-midnight-reverie.png')})
  await channels.evaluateAll(nodes=>nodes.forEach(node=>node.getAnimations({subtree:true}).forEach(anim=>anim.finish())))
  await expect(channels).toHaveCount(0)
  react('zoneEnd','6')
  await expect(lower).toHaveAttribute('data-delivery','false')
  await expect(lower.locator('.cinematic-beam')).toBeHidden()
  await expect(channels).toHaveCount(0)
  await page.emulateMedia({reducedMotion:'reduce'})
  react('zoneEnd','6')
  await expect(pengu.locator('.zone-result')).toBeVisible()
  await expect(channels).toHaveCount(0)
})

test('BLAZE y ASTRA usan canales superiores e inferiores simultáneos en Blitz',async ({page},info)=>{
  await page.setViewportSize({width:1920,height:1080})
  const {match,frame} = await playbackRoom(page,undefined,['astra','pix','blaze','volt'])
  match.sides[0].active=0
  match.sides[1].active=2
  frame([])
  frame([
    {slot:0,event:{type:'zoneEnd',detail:'8'}},
    {slot:2,event:{type:'zoneEnd',detail:'8'}},
    {slot:0,event:{type:'incoming',source:2,detail:'4'}},
  ])
  const channels=page.locator('.cinematic-scene[data-channel]')
  await expect(channels).toHaveCount(2)
  const top = channels.filter({hasText:/EVENT\s*HORIZON/})
  const bottom = channels.filter({hasText:/INFERNO\s*BREAK/})
  await expect(top).toHaveAttribute('data-channel','team-a')
  await expect(bottom).toHaveAttribute('data-channel','team-b')
  await expect(top).toHaveAttribute('data-delivery','false')
  await expect(bottom).toHaveAttribute('data-delivery','true')
  await expect(top.locator('.cinematic-beam')).toBeHidden()
  await expect(page.locator('.projectile-fire[data-strike="zoneFinish"][data-from="2"][data-to="0"]')).toBeVisible()
  const a=(await top.boundingBox())!
  const b=(await bottom.boundingBox())!
  expect(Math.abs(a.width-b.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(a.height-b.height)).toBeLessThanOrEqual(1)
  const clock=(await page.locator('.blitz-clock').boundingBox())!
  expect(a.y+a.height).toBeLessThanOrEqual(clock.y)
  expect(b.y).toBeGreaterThanOrEqual(clock.y+clock.height)
  for (const field of await page.locator('.player[data-featured="true"] .well').all()) {
    const box=(await field.boundingBox())!
    for (const scene of [a,b]) expect(scene.x+scene.width<=box.x || box.x+box.width<=scene.x).toBe(true)
  }
  await expect(page.locator('.blitz-subtitle-callout[data-team="0"] .dialogue-text')).toHaveText(translations.astra.zoneFinish)
  await expect(page.locator('.blitz-subtitle-callout[data-team="1"] .dialogue-text')).toHaveText(translations.blaze.zoneFinish)
  await expect(page.locator('.blitz-subtitle-callout[data-team="0"]')).toBeVisible()
  await expect(page.locator('.blitz-subtitle-callout[data-team="1"]')).toBeVisible()
  await channels.evaluateAll(nodes=>nodes.forEach(node=>node.getAnimations({subtree:true}).forEach(anim=>{
    anim.pause()
    anim.currentTime=665
  })))
  await page.screenshot({path:info.outputPath('blitz-dos-cinematicas.png')})
})

test('la definitiva de Volt usa un lateral en Blitz compacto y respeta una descarga cancelada',async ({page},info)=>{
  await page.setViewportSize({width:1366,height:768})
  const {match,frame} = await playbackRoom(page,{attackVoices:false,subtitles:false},['nix','pix','pengu','volt'])
  match.sides[1].active = 3
  match.sides[0].active = 0
  const player = page.locator('[data-player="3"]')
  frame([{slot:3,event:{type:'zoneEnd',detail:'8'}}])
  const scene = page.locator('.cinematic-scene')
  await expect(scene).toHaveAttribute('data-layout','side')
  await expect(scene).toHaveAttribute('data-delivery','false')
  await expect(scene).toHaveAttribute('data-direction','left')
  const box = (await scene.boundingBox())!
  const board = (await player.boundingBox())!
  const summary = (await page.locator('.blitz-team[data-side="1"] .blitz-summary').boundingBox())!
  expect(box.x).toBeGreaterThan(board.x+board.width)
  expect(box.y).toBeGreaterThan(summary.y+summary.height)
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>{
    animation.pause()
    animation.currentTime = 410
  }))
  await page.screenshot({path:info.outputPath('volt-surge-lateral.png')})
  const reserve = page.locator('.blitz-team[data-side="1"] .player[data-featured="false"]')
  await reserve.evaluate(panel=>{ panel.style.paddingBlockEnd = '60px' })
  const summaryAfter = (await page.locator('.blitz-team[data-side="1"] .blitz-summary').boundingBox())!
  await expect.poll(async ()=>(await scene.boundingBox())?.y ?? 0).toBeGreaterThan(summaryAfter.y+summaryAfter.height)
  await page.setViewportSize({width:600,height:800})
  await expect(scene).toHaveCount(0)
  frame([{slot:3,event:{type:'zoneEnd',detail:'8'}}])
  await expect(player.locator('.cinematic-charge')).toBeVisible()
  await expect(player.locator('.zone-result')).toBeVisible()
  await expect(page.locator('.cinematic-impact')).toHaveCount(0)
})

test('eventos de combate y Blitz reproducen el personaje correcto en plazas humanas e IA',async ({page})=>{
  const {assets,lineup,match,frame} = await playbackRoom(page)
  const verify = async (expected:{slot:number;event:VoiceEvent}[])=>{
    for (const {slot,event} of expected) {
      const id = lineup[slot]
      const file = assets.find(asset=>asset.id===id && asset.event===event)!
      await expect.poll(async ()=>(await voices(page)).starts,{message:file.path}).toContain(file.url)
      await expect(blitzCaption(page,slot)).toContainText(translations[id][event])
    }
    await expect.poll(async ()=>(await voices(page)).active).toBe(0)
  }
  frame([{slot:0,event:{type:'quad'}},{slot:1,event:{type:'tDouble',detail:'2'}},
    {slot:2,event:{type:'combo',detail:'3'}},{slot:3,event:{type:'zoneStart'}}])
  await verify([{slot:0,event:'tetris'},{slot:1,event:'spin'},{slot:2,event:'combo'},{slot:3,event:'zoneStart'}])
  frame([{slot:0,event:{type:'zoneEnd',detail:'8'}},{slot:1,event:{type:'critical'}},
    {slot:2,event:{type:'blitzGuard',detail:'2'}},{slot:3,event:{type:'blitzVictory'}}])
  await verify([{slot:0,event:'zoneFinish'},{slot:1,event:'danger'},{slot:2,event:'teamDefense'},{slot:3,event:'victory'}])
  match.players[0].dead = true
  frame([{slot:0,event:{type:'eliminated'}}])
  await verify([{slot:0,event:'defeat'},{slot:1,event:'teammateDown'}])
  match.players[0].dead = false
  frame([{slot:0,event:{type:'blitzRevived'}}])
  await verify([{slot:1,event:'teammateRevived'}])
})

test('las preferencias ocultan voces, subtítulos y animaciones de ataque y conservan los avisos',async ({page})=>{
  const {assets,match,frame} = await playbackRoom(page,{attackVoices:false,subtitles:false,attackAnimations:false})
  match.sides[0].active = 0
  frame([{slot:0,event:{type:'quad'}},{slot:0,event:{type:'critical'}}])
  const danger = assets.find(file=>file.id==='volt' && file.event==='danger')!.url
  await expect.poll(async ()=>(await voices(page)).starts).toEqual([danger])
  await expect.poll(async ()=>(await voices(page)).ends).toEqual([danger])
  await expect(page.locator('.character-caption:visible')).toHaveCount(0)
  frame([{slot:0,event:{type:'zoneEnd',detail:'8'}}])
  const volt = page.locator('[data-player="0"]')
  await expect(volt.locator('.zone-result')).toBeVisible()
  await expect(page.locator('.cinematic-scene')).toHaveCount(0)
})

test('reemplaza Zone, peligro y derrota de inmediato, con subtítulos y plazas independientes en el relevo',async ({page})=>{
  const {assets,match,frame} = await playbackRoom(page)
  const urls = (['zoneStart','danger','zoneFinish','defeat'] as const).map(event=>assets.find(file=>file.id==='volt' && file.event===event)!.url)
  const other = assets.find(file=>file.id==='nix' && file.event==='zoneStart')!.url
  const caption = blitzCaption(page,0)
  const player = page.locator('.player[data-player="0"]')
  const portrait = player.locator('.player-banner [data-character-id="volt"]')
  const shown = (event:VoiceEvent) => expect(caption.locator('.dialogue-text')).toHaveText(translations.volt[event])
  frame([{slot:0,event:{type:'zoneStart'}},{slot:1,event:{type:'zoneStart'}}])
  await shown('zoneStart')
  await expect(portrait.locator('img')).toHaveAttribute('src',/zone-.*\.png$/)
  await expect.poll(async ()=>(await voices(page)).starts,{intervals:[10,25]}).toContain(other)
  match.players[0].danger = 2
  frame([{slot:0,event:{type:'critical'}}])
  await shown('danger')
  await expect(portrait.locator('img')).toHaveAttribute('src',/danger-.*\.png$/)
  frame([{slot:0,event:{type:'zoneEnd',detail:'8'}}])
  await shown('zoneFinish')
  match.sides[0].active = 1
  match.turn = 2
  frame([{slot:0,event:{type:'critical',repeat:true}}])
  await expect(page.locator('.blitz-clock')).toHaveAttribute('data-turn','2')
  await shown('zoneFinish')
  await expect(page.locator('.cinematic-scene')).toBeVisible()
  expect((await voices(page)).pauses).not.toContain(other)
  frame([{slot:0,event:{type:'eliminated'}}])
  await shown('defeat')
  await expect.poll(async ()=>(await voices(page)).ends).toContain(urls[3])
  const log = await voices(page)
  expect(log.starts.filter(url=>urls.includes(url))).toEqual(urls)
  expect(log.times[log.starts.indexOf(urls[1])]-log.times[log.starts.indexOf(urls[0])]).toBeLessThan(1000)
  expect(log.pauses).toEqual(expect.arrayContaining(urls.slice(0,3)))
  await expect(caption).toBeHidden()
})

test('el texto sustituye a la voz de inmediato si el ataque está silenciado o el archivo falta',async ({page})=>{
  await page.setViewportSize({width:1366,height:768})
  await page.addInitScript(()=>{
    const animate = Element.prototype.animate
    const durations:number[] = []
    Object.defineProperty(window,'dialogueDurations',{value:durations})
    Element.prototype.animate = function(frames,options) {
      if (this.classList.contains('character-caption') && typeof options==='object') durations.push(Number(options.duration))
      return animate.call(this,frames,options)
    }
  })
  const {assets,frame} = await playbackRoom(page,{attackVoices:false,subtitles:true})
  const caption = page.locator('.player[data-player="0"] .character-caption')
  const zone = assets.find(file=>file.id==='volt' && file.event==='zoneStart')!.url
  const missing = assets.find(file=>file.id==='volt' && file.event==='danger')!.url
  await page.route(`**${missing}`,route=>route.fulfill({status:404}))
  frame([{slot:0,event:{type:'zoneStart'}}])
  await expect(caption).toContainText(translations.volt.zoneStart)
  frame([{slot:0,event:{type:'quad'}}])
  await expect(caption).toContainText(translations.volt.tetris)
  await expect.poll(async ()=>(await voices(page)).pauses).toContain(zone)
  frame([{slot:0,event:{type:'critical'}}])
  await expect(caption).toContainText(translations.volt.danger)
  expect((await voices(page)).starts).toEqual([zone])
  await expect(caption).toBeHidden({timeout:3500})
  const durations = () => page.evaluate(()=>(window as unknown as {dialogueDurations:number[]}).dialogueDurations)
  expect(await durations()).toEqual([120,120,120,150])
  await page.emulateMedia({reducedMotion:'reduce'})
  frame([{slot:0,event:{type:'quad'}}])
  await expect(caption).toBeVisible()
  expect(await durations()).toEqual([120,120,120,150])
})
