import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { defaultSlot } from '../../src/input'

const subtitles = JSON.parse(readFileSync(new URL('../../src/characters/subtitles/es.json',import.meta.url),'utf8'))

test('usa la maestra y el retrato de Volt tanto en una plaza humana como de IA',async ({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Jugar Versus Zone'}).click()
  const preview = page.locator('[data-slot="0"] [data-character-id="volt"] img')
  await expect(preview).toHaveAttribute('src',/master-.*\.png$/)
  await expect.poll(()=>preview.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0)
  const play = page.getByRole('button',{name:'Iniciar partida'})
  await page.locator('[data-ready="0"]').click()
  await page.locator('[data-ready="1"]').click()
  await play.click()
  const portrait = page.locator('[data-player="0"] [data-character-id="volt"]')
  await expect(portrait.locator('img')).toHaveAttribute('src',/neutral-.*\.png$/)
  await portrait.evaluate(node=>{
    new MutationObserver(()=>{
      if (node.querySelector('img')?.src.match(/blink-.*\.png$/)) (node as HTMLElement).dataset.sawBlink='yes'
    }).observe(node,{attributes:true,subtree:true,attributeFilter:['src']})
  })
  await expect(portrait).toHaveAttribute('data-saw-blink','yes',{timeout:6800})
  await page.getByRole('button',{name:'Pausa',exact:true}).click()
  await page.getByRole('button',{name:'Volver a la sala'}).click()
  await page.locator('[data-controller="0"]').selectOption('bot')
  await play.click()
  await expect(page.locator('[data-player="0"] .bot-tag')).toBeVisible()
  await expect.poll(()=>portrait.locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(512)
})

test('elige personajes con mando y teclado y los conserva al entrar a VS4',async ({page})=>{
  const j1Config = defaultSlot(0), j2Config = defaultSlot(1)
  j1Config.pad.right = 'B10'
  j1Config.pad.cw = 'B11'
  j1Config.device = {id:'Mando para personajes',index:0}
  j2Config.keys.left = 'KeyY'
  j2Config.keys.cw = 'KeyG'
  await page.addInitScript(slots=>{
    localStorage.setItem('quad-blocks-v1',JSON.stringify({slots}))
    const buttons = Array.from({length:17},()=>({pressed:false,value:0,touched:false}))
    Object.defineProperty(window,'characterButtons',{value:buttons})
    Object.defineProperty(navigator,'getGamepads',{value:()=>[
      {id:'Mando para personajes',index:0,mapping:'standard',connected:true,buttons,axes:[0,0,0,0],timestamp:0},
    ]})
  },[j1Config,j2Config])
  const errors:string[] = []
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button',{name:'Jugar Versus Zone'}).click()
  const j1 = page.getByLabel('Personaje de J1')
  const j2 = page.getByLabel('Personaje de J2')
  await expect(page.locator('[data-device="0"]')).toHaveValue('0')
  await expect(j1.locator('option')).toHaveCount(6)
  const pad = (index:number,pressed:boolean) => page.evaluate(({index,pressed})=>{
    const buttons = (window as unknown as {characterButtons:{pressed:boolean;value:number;touched:boolean}[]}).characterButtons
    buttons[index] = {pressed,value:Number(pressed),touched:pressed}
  },{index,pressed})
  await pad(10,true)
  await expect(j1).toHaveValue('nix')
  await expect(j2).toHaveValue('volt')
  await pad(10,false)
  await pad(11,true)
  await expect(page.locator('[data-ready="0"]')).toHaveAttribute('aria-pressed','true')
  await expect(j2.locator('option[value="nix"]')).toBeDisabled()
  await expect(page.locator('[data-selection-caption="0"]')).toContainText(subtitles.nix.selection)
  await pad(11,false)
  await j2.focus()
  await j2.press('KeyY')
  await expect(j2).toHaveValue('pengu')
  await j2.press('KeyG')
  await expect(page.locator('[data-ready="1"]')).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('[data-selection-caption="1"]')).toContainText(subtitles.pengu.selection)
  await expect(page.locator('[data-selection-caption="0"]')).toContainText(subtitles.nix.selection)
  for (const i of [2,3]) await page.locator(`[data-ready="${i}"]`).click()
  await page.getByRole('button',{name:'Iniciar partida'}).click()
  await expect(page.locator('.player[data-player="0"] .character-portrait')).toHaveAttribute('data-character-id','nix')
  await expect(page.locator('.player[data-player="1"] .character-portrait')).toHaveAttribute('data-character-id','pengu')
  await expect(page.locator('.player .character-portrait')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('persiste las preferencias de personajes al recargar',async ({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  const preferences = ['Reducir efectos','Animaciones de ataques','Voces de ataques','Subtítulos de personajes']
  await page.getByLabel(preferences[0]).check()
  for (const label of preferences.slice(1)) await page.getByLabel(label).uncheck()
  await page.reload()
  await page.getByRole('button',{name:'Configuración'}).click()
  await expect(page.getByLabel(preferences[0])).toBeChecked()
  for (const label of preferences.slice(1)) await expect(page.getByLabel(label)).not.toBeChecked()
})
