import { expect, test, type Page } from '@playwright/test'

async function lobby(page: Page) {
  await page.getByRole('button',{name:'Jugar VS4'}).click()
  await expect(page.getByRole('heading',{name:'Sala VS4'})).toBeVisible()
}
async function start(page: Page) {
  const start = page.getByRole('button',{name:'Iniciar partida'})
  await expect(start).toBeDisabled()
  for (let i=0;i<4;i++) await page.locator(`[data-ready="${i}"]`).click()
  await start.click()
  await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
}
const board = (page: Page,i: number) => page.locator(`[data-player="${i}"] canvas.board`)
async function snapshot(page: Page,i: number) {
  return board(page,i).evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
}

test('menú, cuatro tableros horizontales, controles de teclado, pausa y reinicio sin red', async ({page,context},info) => {
  const errors: string[] = []
  page.on('pageerror',error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'QUAD BLOCKS.'})).toBeVisible()
  await expect(page.getByRole('button',{name:/VS2/})).toBeDisabled()
  await page.screenshot({path:info.outputPath('menu.png')})
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByLabel('Semilla').fill('offline-seed')
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await context.setOffline(true)
  await start(page)
  await expect(page.getByText('offline-seed')).toBeVisible()
  const bounds = await Promise.all([0,1,2,3].map(i=>board(page,i).boundingBox()))
  expect(bounds.every((box,i)=> box && box.y===bounds[0]!.y && (!i || box.x>bounds[i-1]!.x))).toBe(true)
  const before = await Promise.all([0,1,2,3].map(i=>snapshot(page,i)))
  await page.keyboard.press('KeyA')
  await expect.poll(()=>snapshot(page,0)).not.toBe(before[0])
  for (const i of [1,2,3]) expect(await snapshot(page,i)).toBe(before[i])
  await page.keyboard.press('KeyL')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Numpad6')
  for (const i of [1,2,3]) await expect.poll(()=>snapshot(page,i)).not.toBe(before[i])
  const moved = await snapshot(page,0)
  await page.keyboard.press('KeyW')
  await expect.poll(()=>snapshot(page,0)).not.toBe(moved)
  await page.screenshot({path:info.outputPath('arena.png')})
  await page.keyboard.press('Digit1')
  await expect(page.getByRole('heading',{name:'Partida en pausa'})).toBeVisible()
  await page.getByRole('button',{name:'Reiniciar'}).click()
  await expect(page.getByText('PREPÁRATE')).toBeVisible()
  await expect.poll(()=>snapshot(page,0)).toBe(before[0])
  expect(errors).toEqual([])
})

test('edita y conserva configuración, nombre y teclado, con guardado y conflictos', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'Ver controles'}).click()
  await page.locator('[data-action="left"]').click()
  await page.keyboard.press('KeyJ')
  await expect(page.getByRole('status')).toContainText('Conflicto')
  await page.locator('[data-action="left"]').click()
  await page.keyboard.press('KeyG')
  await expect(page.getByRole('status')).toContainText('Asignación guardada')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Generador').selectOption('bag14')
  await page.getByLabel('Secuencia compartida').uncheck()
  await page.getByLabel('Reducir efectos').check()
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await page.locator('[data-name="0"]').fill('Ada <3')
  await page.reload()
  await lobby(page)
  await expect(page.locator('[data-name="0"]')).toHaveValue('Ada <3')
  await page.getByRole('button',{name:'Reglas de partida'}).click()
  await expect(page.getByLabel('Generador')).toHaveValue('bag14')
  await expect(page.getByLabel('Secuencia compartida')).not.toBeChecked()
  await expect(page.getByLabel('Reducir efectos')).toBeChecked()
  await page.getByRole('button',{name:'Volver'}).click()
  await page.locator('main').getByRole('button',{name:'Controles',exact:true}).click()
  await expect(page.locator('[data-action="left"]')).toHaveText('G')
  await page.getByRole('button',{name:'Restaurar predeterminados'}).click()
  await expect(page.locator('[data-action="left"]')).toHaveText('A')
})

test('cuatro mandos simulados, diagnóstico, reasignación de eje y reconexión segura', async ({page}) => {
  await page.addInitScript(() => {
    const pads = Array.from({length:4},(_,index) => ({
      id:'Mando de prueba '+index,index,connected:true,mapping:index===3?'':'standard',
      buttons:Array.from({length:index===3?12:17},() => ({pressed:false,value:0,touched:false})),
      axes:[0,0,0,0],timestamp:0,
    }))
    Object.defineProperty(window,'testPads',{value:pads})
    Object.defineProperty(navigator,'getGamepads',{value:()=>pads.map(p=>p.connected?p:null)})
  })
  const axis = (index: number, value: number, axisIndex = 0) => page.evaluate(([i,v,a]) => {
    const pads = (window as unknown as {testPads:Gamepad[]}).testPads
    ;(pads[i].axes as number[])[a] = v
  },[index,value,axisIndex])
  const button = (index: number, key: number, pressed: boolean) => page.evaluate(([i,k,on]) => {
    const pads = (window as unknown as {testPads:{buttons:{pressed:boolean;value:number}[]}[]}).testPads
    pads[Number(i)].buttons[Number(k)] = {pressed:!!on,value:on?1:0}
  },[index,key,pressed])
  const connect = (connected: boolean) => page.evaluate(value=>{
    const pads = (window as unknown as {testPads:{connected:boolean}[]}).testPads
    pads[1].connected = value
  },connected)
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await page.locator('main').getByRole('button',{name:'Controles',exact:true}).click()
  for (let i=0;i<4;i++) {
    await page.locator(`[data-control-player="${i}"]`).click()
    await page.getByRole('button',{name:'Asignar pulsando un botón'}).click()
    if (i===1) {
      await button(0,1,true)
      await expect(page.getByRole('status')).toContainText('ya pertenece a J1')
      await button(0,1,false)
    }
    await button(i,0,true)
    await expect(page.getByRole('status')).toContainText(`Mando asignado a J${i+1}`)
    await button(i,0,false)
    await expect(page.locator('[data-action="left"]')).toHaveText(i===3?'Eje 0 -':'Cruceta ←')
  }
  await page.getByRole('button',{name:'Diagnóstico'}).click()
  await expect(page.getByText('Personalizada')).toBeVisible()
  await axis(3,-0.84)
  await expect(page.getByText(/A0: -0.84/)).toBeVisible()
  await axis(3,0)
  await page.getByRole('button',{name:'Controles',exact:true}).click()
  await page.locator('[data-control-player="3"]').click()
  await page.getByRole('button',{name:'Mando',exact:true}).click()
  await page.locator('[data-action="left"]').click()
  await axis(3,-1,2)
  await expect(page.locator('[data-action="left"]')).toHaveText('Eje 2 -')
  await axis(3,0,2)
  await page.reload()
  await lobby(page)
  for (let i=0;i<4;i++) await expect(page.locator(`[data-device="${i}"]`)).toHaveValue(String(i))
  await start(page)
  const before = await Promise.all([0,1,2,3].map(i=>snapshot(page,i)))
  await button(0,14,true); await button(1,15,true); await button(2,14,true); await axis(3,-1,2)
  for (const i of [0,1,2,3]) await expect.poll(()=>snapshot(page,i)).not.toBe(before[i])
  await button(0,14,false); await button(1,15,false); await button(2,14,false); await axis(3,0,2)
  await button(0,9,true)
  await expect(page.getByRole('heading',{name:'Partida en pausa'})).toBeVisible()
  await page.waitForTimeout(220)
  await expect(page.getByRole('heading',{name:'Partida en pausa'})).toBeVisible()
  await button(0,9,false)
  await page.getByRole('button',{name:'Continuar'}).click()
  await connect(false)
  await expect(page.getByText(/Mando desconectado.*Jugador 2/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Continuar'})).toBeDisabled()
  await connect(true)
  await expect(page.getByRole('button',{name:'Continuar'})).toBeEnabled()
  await page.getByRole('button',{name:'Continuar'}).click()
  await expect(page.locator('#overlay')).toBeHidden()
})

test('carga Zone jugando, sintetiza sonidos y entrega su ataque al terminar', async ({page}) => {
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createOscillator
    const frequencies: number[] = []
    Object.defineProperty(window,'testFrequencies',{value:frequencies})
    AudioContext.prototype.createOscillator = function () {
      const osc = create.call(this)
      const start = osc.start.bind(osc)
      osc.start = when => { frequencies.push(osc.frequency.value); start(when) }
      return osc
    }
  })
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByLabel('Progresión por línea').fill('0')
  await page.getByLabel('Semilla').fill('zone-arena')
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await start(page)
  const j1 = page.locator('[data-player="0"]')
  const j2 = page.locator('[data-player="1"]')
  const press = (key: string) => page.keyboard.press(key,{delay:19})
  async function place(rotation: number, column: number) {
    if (rotation) await press(rotation===1?'KeyE':'KeyR')
    for (let x=3;x!==column;x+=Math.sign(column-3)) await press(x>column?'KeyA':'KeyD')
    await press('KeyW')
  }
  for (const [r,x] of [[0,3],[0,1],[0,7],[1,-1],[2,5],[2,4]]) await place(r,x)
  await expect(j1.locator('.zone-label strong')).toHaveText('25%')
  await press('KeyC')
  await expect(j1).toHaveClass(/zoned/)
  await expect(j2).not.toHaveClass(/zoned/)
  for (const [r,x] of [[0,0],[0,-1],[1,1],[0,7]]) await place(r,x)
  await expect(j1.locator('.zone-label strong')).toContainText('1 L')
  await expect(j2.locator('.incoming')).toHaveText('0')
  await expect(j1.locator('.effect')).toContainText('ZONE COMPLETADA', {timeout:6000})
  await expect(j2.locator('.incoming')).toHaveText('3')
  const frequencies = await page.evaluate(()=>(window as unknown as {testFrequencies:number[]}).testFrequencies)
  expect(frequencies).toEqual(expect.arrayContaining([110,620,880,82]))
})

test('muestra clasificación y permite revancha al finalizar una partida de cuatro', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await start(page)
  for (const key of ['KeyI','ArrowUp','Numpad8']) {
    for (let i=0;i<14;i++) {
      await page.keyboard.press(key)
      await page.waitForTimeout(18)
    }
  }
  await expect(page.getByRole('heading',{name:'Jugador 1 gana'})).toBeVisible()
  await expect(page.locator('.ranking li')).toHaveCount(4)
  await expect(page.locator('.ranking li').nth(1)).toContainText('Jugador 4')
  await page.getByRole('button',{name:'Revancha'}).click()
  await expect(page.getByText('PREPÁRATE')).toBeVisible()
  await expect(page.locator('.player.dead')).toHaveCount(0)
})
