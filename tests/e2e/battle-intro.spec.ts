import { expect, test, type Page } from '@playwright/test'
import { openLobby } from './navigation'

async function start(page:Page, mode:'versus'|'teams'|'blitz', beforeStart?:()=>Promise<unknown>) {
  await openLobby(page,mode)
  await expect.poll(()=>page.locator('.lobby-fighter-art img').evaluateAll(images=>
    images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true)
  for (let slot=0;slot<4;slot++) await page.locator(`[data-ready="${slot}"]`).click()
  await beforeStart?.()
  await page.getByRole('button',{name:'Iniciar partida'}).click()
}

for (const {mode,title,width,height} of [
  {mode:'versus',title:'FREE FOR ALL',width:1920,height:1080},
  {mode:'teams',title:'VS',width:1600,height:900},
  {mode:'blitz',title:'2v2 BLITZ',width:1366,height:768},
] as const) {
  test(`presentación ${mode} y transición al HUD`,async ({page},info)=>{
    await page.setViewportSize({width,height})
    await page.addInitScript(()=>{
      localStorage.setItem('quad-blocks-v1',JSON.stringify({characters:['pengu','blaze','pix','kira'],
        controllers:[{},{bot:true,level:8},{bot:true,level:5},{bot:true,level:5}]}))
    })
    await page.goto('/')
    await page.clock.install()
    await start(page,mode)
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100))
    const intro = page.locator('.battle-intro')
    await expect(intro.locator('.intro-fighter')).toHaveCount(4)
    for (const [slot,id] of ['pengu','blaze','pix','kira'].entries()) {
      const fighter = intro.locator(`[data-slot="${slot}"]`)
      await expect(fighter).toHaveAttribute('data-character',id)
      await expect(fighter.locator('.intro-master')).toHaveCSS('object-fit','contain')
    }
    await expect(intro.locator('[data-slot="1"]')).toContainText('IA 8')
    if (mode==='versus') await expect(intro.locator('.intro-team')).toHaveCount(0)
    else {
      for (const side of [0,1]) {
        const team = intro.locator(`.intro-team[data-team="${side}"]`)
        await expect(team.locator('.intro-fighter')).toHaveCount(2)
        for (const slot of [side*2,side*2+1]) await expect(team.locator(`[data-slot="${slot}"]`)).toHaveCount(1)
      }
    }
    if (mode==='blitz') {
      for (const role of ['active','reserve']) {
        const seats = (selector:string)=>page.locator(selector).evaluateAll(nodes=>nodes.map(node=>
          (node as HTMLElement).dataset.slot ?? (node as HTMLElement).dataset.player).sort())
        expect(await seats(`.intro-fighter[data-role="${role}"]`)).toEqual(await seats(`#arena .player[data-state="${role}"]`))
      }
    }
    await expect.poll(()=>intro.locator('.intro-master').evaluateAll(images=>
      images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true)
    await page.clock.runFor(mode==='blitz' ? 1320 : mode==='teams' ? 1120 : 920)
    const opacity = await intro.getByRole('heading',{name:title,exact:true}).evaluate(node=>
      Number(getComputedStyle(node.parentElement!).opacity))
    expect(opacity).toBeGreaterThan(.92)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({path:info.outputPath(`${mode}.png`)})
    const matrixSelector = mode==='blitz' ? '#arena [data-state="active"] .board' : '#arena .board'
    const bounds = ()=>page.locator(matrixSelector).evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()))
    const original = await bounds()
    await page.clock.resume()
    await expect(page.locator('#overlay strong')).toHaveText('3')
    await expect(intro).toHaveCount(0)
    expect(await bounds()).toEqual(original)
    await expect(page.locator('#overlay strong')).toHaveText('2')
    await expect(page.locator('#overlay strong')).toHaveText('1')
    await expect(page.locator('#overlay strong')).toHaveText('¡COMBATE!')
    await expect(page.locator('#overlay')).toBeHidden()
  })
}

test('audio por fase, revancha y preferencias persistentes',async ({page})=>{
  await page.addInitScript(()=>{
    const media:string[] = []
    Object.defineProperty(window,'introMedia',{value:media})
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      media.push(new URL(this.src).pathname.split('/').pop()!)
      return play.call(this)
    }
  })
  const sounds = (pattern:string)=>page.evaluate(pattern=>
    (window as unknown as {introMedia:string[]}).introMedia.filter(url=>new RegExp(pattern).test(url)).length,pattern)
  await page.goto('/')
  await page.locator('[data-main-action="settings"]').click()
  await page.getByLabel('Introducciones de batalla').selectOption('reduced')
  await page.getByLabel('Reducir efectos').check()
  await page.getByRole('button',{name:'Volver'}).click()
  const selectionPattern = '^selection-.*\\.ogg$'
  let selectionVoices = 0
  await start(page,'blitz',async ()=>{ selectionVoices = await sounds(selectionPattern) })
  const intro = page.locator('.battle-intro')
  await expect(intro).toHaveAttribute('data-quiet','true')
  await expect(intro).toHaveAttribute('data-simplified','true')
  await expect(intro.locator('.intro-sparks i')).toHaveCount(0)
  await expect.poll(()=>sounds('^battle-start-')).toBe(1)
  await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
  expect(await sounds('^countdown-tick-')).toBe(3)
  expect(await sounds('^battle-go-')).toBe(1)
  expect(await sounds('^blitz-')).toBe(1)
  expect(await sounds(selectionPattern)).toBe(selectionVoices)
  await page.getByRole('button',{name:'Pausa',exact:true}).click()
  await page.getByRole('button',{name:'Reiniciar'}).click()
  await expect(intro).toHaveAttribute('data-simplified','true')
  expect(await sounds('^battle-start-')).toBe(2)
  await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
  expect(await sounds('^countdown-tick-')).toBe(6)
  expect(await sounds('^battle-go-')).toBe(2)
  expect(await sounds(selectionPattern)).toBe(selectionVoices)
  await page.reload()
  await page.locator('[data-main-action="settings"]').click()
  await expect(page.getByLabel('Introducciones de batalla')).toHaveValue('reduced')
  await page.getByLabel('Introducciones de batalla').selectOption('off')
  await page.getByRole('button',{name:'Volver'}).click()
  await start(page,'versus')
  await expect(intro).toHaveCount(0)
  expect(await sounds('^battle-start-')).toBe(0)
  await expect(page.locator('#overlay strong')).toHaveText('3')
  await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
  expect(await sounds('^countdown-tick-')).toBe(3)
  expect(await sounds('^battle-go-')).toBe(1)
})

test('movimiento reducido, retratos de respaldo e inputs al inicio oficial',async ({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.addInitScript(()=>{
    localStorage.setItem('quad-blocks-v1',JSON.stringify({rules:{gravity:0}}))
  })
  await page.route('**/assets/master-*.png',route=>route.abort())
  await page.goto('/')
  await start(page,'versus')
  const intro = page.locator('.battle-intro')
  await expect(intro).toHaveAttribute('data-quiet','true')
  await expect(intro.locator('.intro-sparks i')).toHaveCount(0)
  await expect(intro.locator('.intro-art.master-ready')).toHaveCount(0)
  const fallback = intro.locator('.intro-fallback')
  await expect(fallback).toHaveCount(4)
  await expect.poll(()=>fallback.evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true)
  const matrix = page.locator('#arena [data-player="0"] .board')
  const board = ()=>matrix.evaluate(canvas=>(canvas as HTMLCanvasElement).toDataURL())
  const initial = await board()
  await page.keyboard.press('KeyW')
  await expect(page.locator('#overlay strong')).toHaveText('3')
  expect(await board()).toBe(initial)
  await expect(page.locator('#overlay strong')).toHaveText('¡COMBATE!')
  await page.keyboard.press('KeyW')
  await expect.poll(board).not.toBe(initial)
})
