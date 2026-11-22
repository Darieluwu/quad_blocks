import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { CHARACTER_IDS, VOICE_EVENTS, type CharacterId, type VoiceEvent } from '../../src/characters/catalog'
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

test('las 72 grabaciones exactas se sirven y decodifican en el navegador desde el build',async ({page})=>{
  const files = voiceFiles()
  expect(new Set(files.map(file=>file.url)).size).toBe(72)
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
  await page.getByRole('button',{name:'Jugar Versus Zone'}).click()
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
  await page.getByRole('button',{name:'Jugar online'}).click()
  await page.getByRole('button',{name:'Crear sala'}).click()
  await expect(page.locator('.online-player')).toHaveText('ONLINE · J1')
  return {assets:voiceFiles(),lineup,match,frame:(events:Frame['events'])=>send({type:'frame',state:snapshot(match),events,fallen:[]})}
}

test('Blitz ubica dos tarjetas en el centro o el marco y las traslada con el relevo',async ({page},info)=>{
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
  const caption = player.locator('.character-caption')
  await expect(caption.locator('.dialogue-name')).toHaveText('VOLT')
  await expect(caption.locator('.dialogue-text')).toHaveText(translations.volt.tetris)
  await expect(page.locator('.character-caption:visible')).toHaveCount(2)
  const left = (await page.locator('[data-player="0"]').boundingBox())!
  const right = (await player.boundingBox())!
  const clock = (await page.locator('.blitz-clock').boundingBox())!
  const centerCards = await page.locator('.character-caption:visible').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().toJSON()))
  for (const card of centerCards) {
    expect(card.left).toBeGreaterThan(left.x+left.width)
    expect(card.right).toBeLessThan(right.x)
    expect(card.bottom<=clock.y || card.top>=clock.y+clock.height).toBe(true)
  }
  expect(centerCards[0].bottom).toBeLessThan(centerCards[1].top)
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
  await expect(player.locator('.reserve-readout')).toHaveText(/Zone 50%.*\+3 basura/)
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
  for (const type of ['quad','tDouble','combo','blitzGuard']) {
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
    expect(expanded.x).toBeGreaterThan(base.x)
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

test('VS4 muestra cuatro voces y tarjetas separadas sin invadir las matrices',async ({page},info)=>{
  await traceVoices(page)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button',{name:'Jugar Versus Zone'}).click()
  for (let i=0;i<4;i++) await page.locator(`[data-ready="${i}"]`).click()
  await page.getByRole('button',{name:'Iniciar partida'}).click()
  await expect(page.locator('#overlay')).toBeHidden()
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100))
  const players = page.locator('.arena-grid .player')
  await expect(players.locator('.hud-portrait:visible')).toHaveCount(4)
  for (let round=0;round<14 && await players.first().getAttribute('data-danger')!=='2';round++) {
    await page.evaluate(()=>{
      for (const code of ['KeyW','KeyI','ArrowUp','Numpad8']) {
        for (const type of ['keydown','keyup']) window.dispatchEvent(new KeyboardEvent(type,{code}))
      }
    })
    await page.clock.runFor(34)
  }
  const captions = players.locator('.character-caption')
  await expect(captions.locator('.dialogue-name')).toHaveText(['VOLT','NIX','PIX','ASTRA'])
  await expect(captions.locator('.dialogue-text')).toHaveText(CHARACTER_IDS.slice(0,4).map(id=>translations[id].danger))
  await expect.poll(async ()=>(await voices(page)).peak).toBe(4)
  await expect(captions.nth(0).locator('.dialogue-avatar img')).toBeVisible()
  await expect(captions.nth(1).locator('.dialogue-avatar span > span')).toHaveText('NI')
  await expect(captions.nth(1).locator('.dialogue-avatar img')).toBeHidden()
  for (const width of [1920,600,320]) {
    await page.setViewportSize({width,height:1080})
    const layout = await page.evaluate(()=>{
      const bounds = (selector:string) => [...document.querySelectorAll(selector)].map(node=>node.getBoundingClientRect().toJSON())
      const fit = [...document.querySelectorAll<HTMLElement>('.dialogue-text')].every(line=>
        line.scrollHeight<=Math.ceil(parseFloat(getComputedStyle(line).lineHeight)*2) && line.scrollWidth<=line.clientWidth)
      return {cards:bounds('.character-caption:not([hidden])'),boards:bounds('.well'),fit,scrollWidth:document.documentElement.scrollWidth}
    })
    const overlaps = (a:DOMRect,b:DOMRect) => a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom
    expect(layout.cards).toHaveLength(4)
    expect(layout.cards.every((box,i)=>layout.boards.every(board=>!overlaps(box,board)) &&
      layout.cards.slice(i+1).every(other=>!overlaps(box,other)))).toBe(true)
    expect(layout.fit).toBe(true)
    expect(layout.scrollWidth).toBeLessThanOrEqual(width)
    if (width===1920) await page.screenshot({path:info.outputPath('dialogos-vs4.png')})
  }
})

test('Thunder Overdrive compone la tormenta y la descarga entre los tableros de Blitz',async ({page},info)=>{
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
  await expect(ultimate).toContainText(/THUNDER\s*OVERDRIVE/)
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
  const caption = player.locator('.character-caption')
  await expect(caption.locator('.dialogue-text')).toHaveText(translations.volt.zoneFinish)
  expect((await caption.boundingBox())!.y).toBeGreaterThan(box.y+box.height)
  await page.screenshot({path:info.outputPath('thunder-overdrive.png')})
  await expect(rival).toHaveAttribute('data-saw-cinematic-impact','true')
  await ultimate.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>animation.play()))
  await expect(ultimate).toHaveCount(0)
  await page.emulateMedia({reducedMotion:'reduce'})
  frame([{slot:0,event:{type:'zoneEnd',detail:'8'}}])
  await expect(player.locator('.zone-result')).toBeVisible()
  await expect(ultimate).toBeHidden()
})

test('Thunder Overdrive usa un lateral en Blitz compacto y respeta una descarga cancelada',async ({page},info)=>{
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
  await expect(page.locator('.character-caption:visible')).toHaveCount(0)
  await scene.evaluate(node=>node.getAnimations({subtree:true}).forEach(animation=>{
    animation.pause()
    animation.currentTime = 410
  }))
  await page.screenshot({path:info.outputPath('thunder-overdrive-lateral.png')})
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
      await expect(page.locator(`.player[data-player="${slot}"] .character-caption`)).toContainText(translations[id][event])
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
  const caption = page.locator('.player[data-player="0"] .character-caption')
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
