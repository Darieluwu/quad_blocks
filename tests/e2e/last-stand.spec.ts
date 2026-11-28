import { expect, test } from '@playwright/test'
import type { Frame } from '../../src/online/protocol'
import { openLobby } from './navigation'

test.describe('Last Stand local',()=>{
  test.use({locale:'es-CL',viewport:{width:1366,height:768}})

  test('conserva la configuración y presenta una ruleta tras un top-out',async ({page},info)=>{
    await page.addInitScript(()=>{
      if (localStorage.getItem('quad-blocks-v1')) return
      localStorage.setItem('quad-blocks-v1',JSON.stringify({battleIntro:'off',rules:{seed:'local-stand-e2e',gravity:0},
        controllers:[{}, {bot:true,level:8}, {bot:true,level:8}, {bot:true,level:8}]}))
    })
    await page.goto('/')
    await page.clock.install()
    await openLobby(page,'teams')
    const rule = page.getByLabel('Last Stand Roulette')
    await expect(rule.locator('option:checked')).toHaveText('Activada')
    await rule.selectOption('off')
    await page.reload()
    await openLobby(page,'teams')
    await expect(rule.locator('option:checked')).toHaveText('Desactivada')
    await rule.selectOption('on')
    for (let slot=0;slot<4;slot++) await page.locator(`[data-ready="${slot}"]`).click()
    await page.getByRole('button',{name:'Iniciar partida'}).click()
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100))
    await page.clock.runFor(3400)
    for (let i=0;i<18 && !await page.locator('.player[data-player="0"]').evaluate(node=>node.classList.contains('dead'));i++) {
      await page.keyboard.press('KeyW')
      await page.clock.runFor(34)
    }
    await expect(page.locator('.player[data-player="0"]')).toHaveClass(/\bdead\b/)
    await expect(page.locator('.stand-overlay')).toBeHidden()
    await page.clock.runFor(3120)
    const cinematic = page.locator('.stand-overlay')
    await expect(cinematic.getByRole('heading',{name:'Último en pie'})).toBeVisible()
    const time = await page.locator('#elapsed').textContent()
    await page.clock.runFor(3150)
    await expect(cinematic.locator('.stand-wheel span')).toHaveCount(6)
    await expect(cinematic.locator('.stand-result')).toBeVisible()
    await expect(cinematic.locator('.stand-result-description')).toBeVisible()
    await expect(cinematic.locator('.stand-portrait img')).toBeVisible()
    await expect(page.locator('#elapsed')).toHaveText(time!)
    await page.screenshot({path:info.outputPath('last-stand-local.png')})
    await page.clock.runFor(3350)
    await expect(cinematic).toBeHidden()
    await expect(page.locator('.stand-hud[data-slot="1"] strong')).toBeInViewport()
  })
})

test('dos clientes ven un Double Last Stand autoritativo en idiomas distintos',async ({browser},info)=>{
  test.skip(process.env.TETRAVOLT_ONLINE!=='1','Requiere Wrangler local')
  test.setTimeout(45_000)
  const baseURL = info.project.use.baseURL
  const hostContext = await browser.newContext({baseURL,locale:'es-CL',viewport:{width:1440,height:900}})
  const guestContext = await browser.newContext({baseURL,locale:'en-US',reducedMotion:'reduce',viewport:{width:980,height:720}})
  try {
    const host = await hostContext.newPage(), guest = await guestContext.newPage()
    const frames = new Map<string,Frame>()
    for (const [name,page] of [['host',host],['guest',guest]] as const) {
      page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
        const message = JSON.parse(String(payload))
        if (message.type==='frame') frames.set(name,message)
      }))
    }
    await host.goto('/')
    await host.locator('[data-main-action="online"]').click()
    await host.getByLabel('Nombre').fill('Host')
    await host.locator('[name="format"]').selectOption('teams')
    await host.getByRole('button',{name:'Crear sala'}).click()
    await expect(host.getByRole('heading',{name:'Sala 2v2 tradicional online'})).toBeVisible()
    await guest.goto(await host.locator('#online-link').inputValue())
    await guest.getByLabel('Nombre').fill('Guest')
    await guest.getByRole('button',{name:'Unirse'}).click()
    const hostRule = host.getByLabel('Last Stand Roulette'), guestRule = guest.getByLabel('Last Stand Roulette')
    await expect(guestRule).toBeDisabled()
    await hostRule.selectOption('off')
    await expect(guestRule.locator('option:checked')).toHaveText('Disabled')
    await hostRule.selectOption('on')
    await expect(guestRule.locator('option:checked')).toHaveText('Enabled')
    await host.getByRole('button',{name:'Marcar listo'}).click()
    await guest.getByRole('button',{name:'Marcar listo'}).click()
    await host.getByRole('button',{name:'Iniciar partida'}).click()
    await expect.poll(()=>frames.get('host')?.state.now,{timeout:12_000}).toBeGreaterThan(0)
    for (let drop=0;drop<22 && !frames.get('host')?.state.teams?.stand?.event;drop++) {
      await host.keyboard.press('KeyW')
      await guest.keyboard.press('KeyW')
      const tick = frames.get('host')!.state.now
      if (!frames.get('host')?.state.teams?.stand?.event) {
        await expect.poll(()=>frames.get('host')?.state.now,{intervals:[25,40]}).toBeGreaterThan(tick)
      }
    }
    const frozen = frames.get('host')!.state
    expect(frozen.teams?.stand?.event?.kind).toBe('double')
    await expect.poll(()=>frames.get('guest')?.state.teams?.stand?.event).toEqual(frozen.teams?.stand?.event)
    await expect(host.locator('.stand-overlay')).toContainText('Últimos en pie')
    await expect(guest.locator('.stand-overlay')).toContainText('Final Duel')
    await expect(guest.locator('.stand-overlay')).toHaveAttribute('data-reduced','true')
    await expect(host.locator('.stand-wheel')).toHaveCount(2)
    await expect(host.locator('.stand-result').first()).toBeVisible({timeout:12_000})
    await expect(guest.locator('.stand-result-description')).toHaveCount(2)
    expect(frames.get('host')?.state.now).toBe(frozen.now)
    expect(frames.get('guest')?.state.now).toBe(frozen.now)
    await host.screenshot({path:info.outputPath('double-last-stand.png')})
    await expect.poll(()=>frames.get('guest')?.state.teams?.stand?.active).toBe('double')
    await expect(host.locator('.stand-overlay')).toBeHidden()
    await expect(guest.locator('.stand-hud').filter({hasText:'Final Duel'})).toHaveCount(2)
  } finally {
    await Promise.all([hostContext.close(),guestContext.close()])
  }
})
