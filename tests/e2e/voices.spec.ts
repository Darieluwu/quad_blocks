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
    const log = {starts:[] as string[],ends:[] as string[],active:0,peak:0}
    Object.defineProperty(window,'voiceLog',{value:log})
    AudioContext.prototype.createMediaElementSource = function(track) {
      const node = real.call(this,track)
      const url = new URL(track.src).pathname
      if (!url.endsWith('.ogg')) return node
      track.addEventListener('playing',()=>{
        log.starts.push(url)
        log.peak = Math.max(log.peak,++log.active)
      },{once:true})
      track.addEventListener('ended',()=>{ log.ends.push(url); log.active-- },{once:true})
      return node
    }
  })
}
type VoiceLog = {starts:string[]; ends:string[]; active:number; peak:number}
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

async function playbackRoom(page:Page, mutedAttacks=false) {
  const lineup = ['volt','nix','pix','pengu'] as const
  const levels = [null,5,null,5]
  const match = makeMatch('voice-validation',levels)
  let connection!:WebSocketRoute
  const send = (message:ServerMessage) => connection.send(JSON.stringify(message))
  await traceVoices(page)
  if (mutedAttacks) await page.addInitScript(()=>localStorage.setItem('quad-blocks-v1',JSON.stringify({
    characterOptions:{attackVoices:false,subtitles:false},
  })))
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

test('las preferencias silencian voces de ataque y subtítulos mientras se reproduce la voz de peligro',async ({page})=>{
  const {assets,frame} = await playbackRoom(page,true)
  frame([{slot:0,event:{type:'quad'}},{slot:0,event:{type:'critical'}}])
  const danger = assets.find(file=>file.id==='volt' && file.event==='danger')!.url
  await expect.poll(async ()=>(await voices(page)).starts).toEqual([danger])
  await expect.poll(async ()=>(await voices(page)).ends).toEqual([danger])
  await expect(page.locator('.character-caption:visible')).toHaveCount(0)
})
