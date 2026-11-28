import { expect, it, vi } from 'vitest'
import { CHARACTERS, CHARACTER_IDS, PORTRAITS, VOICE_EVENTS, chooseCharacter, uniqueCharacters } from '../src/characters/catalog'
import { artwork, findAsset, japaneseVoice, subtitleFor } from '../src/characters/assets'
import subtitles from '../src/characters/subtitles/es.json'
import { cueFor, isAttackVoice } from '../src/characters/presentation'
import { loadSettings, saveSettings, MIX } from '../src/settings'

it('carga los subtítulos oficiales con sus claves y su texto exacto',()=>{
  expect(Object.keys(subtitles).sort()).toEqual([...CHARACTER_IDS].sort())
  for (const id of CHARACTER_IDS) {
    expect(Object.keys(subtitles[id]).sort()).toEqual([...VOICE_EVENTS].sort())
    for (const event of VOICE_EVENTS) expect(subtitleFor(id,event)).toBe(subtitles[id][event])
  }
})

it('resuelve todas las voces de personaje a su archivo japonés exacto',()=>{
  const clips = import.meta.glob('../src/characters/voices/ja/*/*.ogg',{
    eager:true,import:'default',query:'?url&no-inline',
  })
  for (const id of CHARACTER_IDS) for (const event of VOICE_EVENTS) {
    const path = `../src/characters/voices/ja/${id}/${event}.ogg`
    expect(clips[path],path).toBeDefined()
    expect(japaneseVoice(id,event),path).toBe(clips[path])
  }
})

it('registra los seis personajes, los nueve retratos y las diecisiete voces de cada uno',()=>{
  expect(CHARACTER_IDS).toEqual(['volt','nix','pix','astra','blaze','pengu'])
  for (const id of CHARACTER_IDS) {
    const {assets} = CHARACTERS[id]
    expect(Object.keys(assets.portraits)).toEqual(PORTRAITS)
    expect(Object.keys(assets.voicesJa)).toEqual(VOICE_EVENTS)
    expect(Object.values(assets.voicesJa).every(ref=>ref.startsWith(`${id}/`))).toBe(true)
    expect(new Set([assets.master,assets.attackPose,assets.zonePose,assets.zoneBackground]).size).toBe(4)
  }
})

it.each(['volt','pix','nix','astra','blaze','pengu'] as const)('resuelve la maestra, las nueve expresiones, las poses y el fondo de %s',id=>{
  const assets = CHARACTERS[id].assets
  for (const key of [assets.master,...Object.values(assets.portraits),assets.attackPose,assets.zonePose,assets.zoneBackground]) {
    expect(artwork(key),key).toMatch(/\.png$/)
  }
})

it('intercambia elecciones provisionales y protege las confirmadas',()=>{
  const picks = uniqueCharacters(['volt','volt','no-existe','pengu'])
  expect(picks).toEqual(['volt','nix','pix','pengu'])
  expect(chooseCharacter(picks,0,'nix',[false,true])).toBeNull()
  expect(chooseCharacter(picks,0,'pengu',[])).toEqual(['pengu','nix','pix','volt'])
  expect(chooseCharacter(picks,0,'blaze',[])).toEqual(['blaze','nix','pix','pengu'])
  expect(picks[0]).toBe('volt')
})

it('tolera recursos ausentes y separa las voces de ataque de los avisos críticos',()=>{
  expect(artwork('pengu/__missing__')).toBeUndefined()
  expect(findAsset({'ja/pengu/danger.mp3':'clip-url'},'ja/pengu/danger',['ogg','mp3'])).toBe('clip-url')
  expect(cueFor({type:'quad'})?.voice).toBe('tetris')
  expect(cueFor({type:'spinL'})?.voice).toBe('spin')
  expect(cueFor({type:'combo',detail:'1'})?.voice).toBeUndefined()
  expect(cueFor({type:'combo',detail:'2'})?.voice).toBe('combo')
  expect(cueFor({type:'combo',detail:'3'})?.voice).toBeUndefined()
  expect(cueFor({type:'combo',detail:'4'})?.voice).toBe('combo2')
  expect(cueFor({type:'combo',detail:'5'})?.voice).toBeUndefined()
  expect(cueFor({type:'combo',detail:'6'})?.voice).toBe('combo3')
  expect(isAttackVoice('tetris2')).toBe(true)
  expect(cueFor({type:'zoneEnd',detail:'0'})?.voice).toBe('zoneFinish')
  expect(cueFor({type:'critical'})?.voice).toBe('danger')
  expect(isAttackVoice('zoneFinish')).toBe(true)
  expect(isAttackVoice('zoneStart')).toBe(false)
  expect(isAttackVoice('danger')).toBe(false)
})

it('define Música y Voces de personajes como controles independientes',()=>{
  expect(MIX.music).toBe(.10)
  expect(MIX.voices).toBe(.85)
})

it('conserva la selección y las preferencias al recuperar la configuración',()=>{
  let stored = '{"characters":["pengu","pengu"],"characterOptions":{"attackAnimations":false}}'
  vi.stubGlobal('localStorage',{getItem:()=>stored,setItem:(_name:string,value:string)=>{stored=value}})
  try {
    const settings = loadSettings()
    expect(settings.characters[0]).toBe('pengu')
    expect(new Set(settings.characters).size).toBe(4)
    expect(settings.characterOptions).toEqual({attackAnimations:false,attackVoices:true,subtitles:true})
    settings.characterOptions.attackVoices = settings.characterOptions.subtitles = false
    expect(saveSettings(settings)).toBe(true)
    expect(loadSettings().characterOptions).toEqual({attackAnimations:false,attackVoices:false,subtitles:false})
  } finally { vi.unstubAllGlobals() }
})
