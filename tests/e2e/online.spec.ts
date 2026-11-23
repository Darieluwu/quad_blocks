import { expect, test } from '@playwright/test'
import type { Frame, MatchStart } from '../../src/online/protocol'

test.skip(process.env.TETRAVOLT_ONLINE!=='1','Requiere Wrangler local')

for (const preference of ['off','reduced'] as const) test(
  `dos navegadores comparten Blitz y recuperan su plaza con introducción ${preference}`,async ({page,browser},info)=>{
  test.setTimeout(65_000)
  const guestContext = await browser.newContext({baseURL:info.project.use.baseURL})
  try {
    await guestContext.addInitScript(preference=>{
      const storage = localStorage.getItem('quad-blocks-v1')
      localStorage.setItem('quad-blocks-v1',JSON.stringify({...JSON.parse(storage ?? '{}'),battleIntro:preference}))
      const introSounds:string[] = []
      Object.defineProperty(window,'introSounds',{value:introSounds})
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        if (/\/(battle-start|countdown-tick|battle-go)-/.test(this.src)) introSounds.push(this.src)
        return play.call(this)
      }
    },preference)
    const guest = await guestContext.newPage()
    let latest: Frame|undefined
    const starts:MatchStart[] = []
    guest.on('websocket',socket=>socket.on('framereceived',({payload})=>{
      const message = JSON.parse(String(payload))
      if (message.type==='start') starts.push(message)
    }))
    page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
      const message = JSON.parse(String(payload))
      if (message.type==='frame') latest = message
    }))
    await page.goto('/')
    await page.locator('[data-main-action="online"]').click()
    await page.getByLabel('Nombre').fill('Anfitrión de prueba')
    await page.getByRole('button',{name:'Crear sala'}).click()
    const link = page.getByLabel('Enlace de invitación')
    await expect(link).toBeVisible()
    await guest.goto(await link.inputValue())
    await guest.getByLabel('Nombre').fill('Invitada de prueba')
    await guest.getByRole('button',{name:'Unirse',exact:true}).click()
    await expect(guest.getByRole('heading',{name:'Sala Blitz online'})).toBeVisible()
    await page.getByRole('button',{name:'Personaje de J1'}).click()
    await page.locator('[data-picker-id="pengu"]').click()
    await page.locator('[data-picker-confirm]').click()
    await expect(page.locator('.arcade-feedback')).toHaveText('PERSONAJE CONFIRMADO')
    await expect(page.locator('.arcade-caption')).toContainText('PENGU')
    await page.getByRole('button',{name:'Volver a la sala'}).click()
    await expect(page.getByRole('button',{name:'Personaje de J1'})).toHaveAttribute('data-id','pengu')
    await page.locator('[data-seat-settings="1"]').click()
    await page.locator('[data-online-bot="1"]').selectOption('8')
    await expect(guest.locator('.lobby-fighter[data-slot="1"]')).toContainText('IA de nivel 8')
    await page.locator('[data-seat-close]:visible').click()
    await page.getByRole('button',{name:'Personaje de J2'}).click()
    await page.locator('[data-picker-id="blaze"]').click()
    await page.locator('[data-picker-confirm]').click()
    await expect(page.locator('.arcade-caption')).toContainText('BLAZE')
    await expect(guest.locator('[data-selection-caption="1"]')).toBeEmpty()
    await page.getByRole('button',{name:'Volver a la sala'}).click()
    await guest.getByRole('button',{name:'Personaje de J3'}).click()
    await guest.locator('[data-picker-id="pengu"]').click()
    await expect(guest.locator('[data-picker-id="pengu"]')).toContainText('OCUPADO')
    await expect(guest.locator('[data-picker-confirm]')).toBeDisabled()
    await guest.getByRole('button',{name:'Volver a la sala'}).click()
    await guest.getByRole('button',{name:'Marcar listo'}).click()
    await page.screenshot({path:info.outputPath('sala-online.png')})
    await page.getByRole('button',{name:'Iniciar partida'}).click()
    await expect(guest.locator('.online-player')).toHaveText('ONLINE · J3')
    await expect(page.locator('.intro-fighter[data-slot="0"]')).toHaveAttribute('data-character','pengu')
    await expect(page.locator('.intro-fighter[data-slot="1"]')).toHaveAttribute('data-character','blaze')
    if (preference==='off') await expect(guest.locator('.battle-intro')).toHaveCount(0)
    else {
      await expect(guest.locator('.battle-intro')).toHaveAttribute('data-simplified','true')
      for (const slot of [0,1,2,3]) {
        const selector = `.intro-fighter[data-slot="${slot}"]`
        const hostFighter = page.locator(selector)
        const guestFighter = guest.locator(selector)
        await expect(guestFighter).toHaveAttribute('data-character',(await hostFighter.getAttribute('data-character'))!)
        await expect(guestFighter).toHaveAttribute('data-role',(await hostFighter.getAttribute('data-role'))!)
      }
      await expect(guest.locator('.intro-fighter[data-slot="1"] .intro-seat span')).toHaveText('IA 8')
    }
    const guestSlot = guest.locator('#arena [data-player="0"] .hud-portrait [data-character-id]')
    await expect(guestSlot).toHaveAttribute('data-character-id','pengu')
    const counters = [page,guest].map(client=>client.locator('#overlay strong'))
    for (const value of ['3','2','1','¡COMBATE!']) {
      await Promise.all(counters.map(counter=>expect(counter).toHaveText(value)))
      if (value!=='¡COMBATE!') expect(latest).toBeUndefined()
    }
    const sounds = ()=>guest.evaluate(()=>(window as unknown as {introSounds:string[]}).introSounds)
    expect((await sounds()).map(url=>url.match(/(battle-start|countdown-tick|battle-go)-/)?.[1])).toEqual([
      ...(preference==='reduced' ? ['battle-start'] : []),
      'countdown-tick','countdown-tick','countdown-tick','battle-go',
    ])
    await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
    await expect(guest.locator('.player[data-player="0"] .player-banner [data-character-id="pengu"]')).toBeVisible()
    await guest.reload()
    await expect(page.getByRole('heading',{name:'Partida en espera'})).toBeVisible()
    await guest.getByRole('button',{name:'Unirse',exact:true}).click()
    await expect(guest.locator('.online-player')).toHaveText('ONLINE · J3')
    await expect(guest.locator('.player[data-player="0"] .player-banner [data-character-id="pengu"]')).toBeVisible()
    expect(starts[1]).toMatchObject({rejoin:true,countdown:0,characters:starts[0].characters})
    await expect(guest.locator('.battle-intro')).toHaveCount(0)
    await expect(guest.locator('#overlay')).toBeHidden()
    expect(await sounds()).toEqual([])
    await expect(page.locator('#overlay')).toBeHidden()
    const activeHuman = () => latest?.state.transition===0 ?
      latest.state.sides.find(side=>side.active===0 || side.active===2)?.active : undefined
    await expect.poll(activeHuman,{timeout:40000}).not.toBeUndefined()
    const player = activeHuman()!
    const before = latest!.state.players[player].stats.pieces
    await (player===0?page:guest).keyboard.press('KeyW')
    await expect.poll(()=>latest?.state.players[player].stats.pieces).toBeGreaterThan(before)
    await expect(guest.locator('.blitz-stack .player')).toHaveCount(4)
    await guest.getByRole('button',{name:'Salir',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Sala Blitz online'})).toBeVisible()
  } finally { await guestContext.close() }
})
