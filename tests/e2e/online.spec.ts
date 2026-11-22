import { expect, test } from '@playwright/test'
import type { Frame } from '../../src/online/protocol'

test.skip(process.env.TETRAVOLT_ONLINE!=='1','Requiere Wrangler local')

test('dos navegadores comparten Blitz online por enlace y recuperan su plaza',async ({page,browser},info)=>{
  test.setTimeout(65_000)
  const guestContext = await browser.newContext({baseURL:info.project.use.baseURL})
  try {
    const guest = await guestContext.newPage()
    let latest: Frame|undefined
    page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
      const message = JSON.parse(String(payload))
      if (message.type==='frame') latest = message
    }))
    await page.goto('/')
    await page.getByRole('button',{name:'Jugar online'}).click()
    await page.getByLabel('Nombre').fill('Anfitrión de prueba')
    await page.getByRole('button',{name:'Crear sala'}).click()
    const link = page.getByLabel('Enlace de invitación')
    await expect(link).toBeVisible()
    await guest.goto(await link.inputValue())
    await guest.getByLabel('Nombre').fill('Invitada de prueba')
    await guest.getByRole('button',{name:'Unirse',exact:true}).click()
    await expect(guest.getByRole('heading',{name:'Sala Blitz online'})).toBeVisible()
    await page.getByLabel('Personaje de J1').selectOption('pengu')
    await expect(page.getByLabel('Personaje de J1')).toHaveValue('pengu')
    await page.getByRole('button',{name:'Marcar listo'}).click()
    await expect(guest.getByLabel('Personaje de J3').locator('option[value="pengu"]')).toBeDisabled()
    await guest.getByRole('button',{name:'Marcar listo'}).click()
    await page.screenshot({path:info.outputPath('sala-online.png')})
    await page.getByRole('button',{name:'Iniciar partida'}).click()
    await expect(guest.locator('.online-player')).toHaveText('ONLINE · J3')
    await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
    await expect(guest.locator('.player[data-player="0"] .player-banner [data-character-id="pengu"]')).toBeVisible()
    await guest.reload()
    await expect(page.getByRole('heading',{name:'Partida en espera'})).toBeVisible()
    await guest.getByRole('button',{name:'Unirse',exact:true}).click()
    await expect(guest.locator('.online-player')).toHaveText('ONLINE · J3')
    await expect(guest.locator('.player[data-player="0"] .player-banner [data-character-id="pengu"]')).toBeVisible()
    await expect(page.locator('#overlay')).toBeHidden()
    await expect.poll(()=>latest?.state.sides.find(side=>side.active===0 || side.active===2)?.active,
      {timeout:35000}).not.toBeUndefined()
    const player = latest!.state.sides.find(side=>side.active===0 || side.active===2)!.active
    const before = latest!.state.players[player].stats.pieces
    await (player===0?page:guest).keyboard.press('KeyW')
    await expect.poll(()=>latest?.state.players[player].stats.pieces).toBeGreaterThan(before)
    await expect(guest.locator('.blitz-stack .player')).toHaveCount(4)
    await guest.getByRole('button',{name:'Salir',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Sala Blitz online'})).toBeVisible()
  } finally { await guestContext.close() }
})
