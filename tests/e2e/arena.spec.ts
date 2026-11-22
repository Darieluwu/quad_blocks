import { expect, test, type Page } from '@playwright/test'

async function lobby(page: Page) {
  await page.getByRole('button',{name:'Jugar Versus Zone'}).click()
  await expect(page.getByRole('heading',{name:'Sala Versus Zone'})).toBeVisible()
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
  await expect(page.getByRole('heading',{name:/TETRA\s*VOLT\./})).toBeVisible()
  await expect(page.getByRole('button',{name:/VS[23]/})).toHaveCount(0)
  await expect(page.getByRole('button',{name:/Equipos 2v2/})).toBeEnabled()
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

test('J1 puede reasignar K con J2 en mando y detecta el choque si J2 cambia a teclado', async ({page}) => {
  await page.addInitScript(() => {
    const pad = {id:'Mando J2',index:0,connected:true,mapping:'standard',
      buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[0,0]}
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]})
  })
  await page.goto('/')
  await lobby(page)
  await page.locator('[data-device="1"]').selectOption('0')
  await page.locator('main').getByRole('button',{name:'Controles',exact:true}).click()
  await page.locator('[data-action="left"]').click()
  await page.keyboard.press('KeyK')
  await expect(page.getByRole('status')).toContainText('Asignación guardada: K')
  await page.getByRole('button',{name:'Volver'}).click()
  await page.locator('[data-device="1"]').selectOption('')
  await expect(page.getByRole('alert')).toContainText('K → J1')
  await expect(page.locator('[data-device="1"]')).toHaveValue('0')
  await page.locator('main').getByRole('button',{name:'Controles',exact:true}).click()
  await page.locator('[data-control-player="1"]').click()
  await page.locator('[data-action="soft"]').click()
  await page.keyboard.press('KeyY')
  await expect(page.getByRole('status')).toContainText('Asignación guardada: Y')
  await page.getByRole('button',{name:'Usar teclado'}).click()
  await expect(page.getByRole('status')).toContainText('Teclado asignado a J2')
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

test('carga Zone jugando, sintetiza sonidos y entrega su ataque al terminar', async ({page},info) => {
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.clock.install()
  await page.addInitScript(() => {
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this,keyframes,options)
      if (this.classList.contains('projectile')) animation.pause()
      return animation
    }
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
  const meter = page.getByLabel('Líneas por cuarto de Zone (0 = por fases)')
  await expect(meter).toHaveValue('0')
  await meter.fill('2')
  await page.getByText('Tabla de ataques',{exact:true}).click()
  await page.getByLabel('Bonificación Zone',{exact:true}).fill('3')
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await start(page)
  const j1 = page.locator('[data-player="0"]')
  const j2 = page.locator('[data-player="1"]')
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100))
  const press = async (key: string) => {
    await page.keyboard.press(key)
    // The game processes horizontal input before hard drop within a simulation tick.
    await page.clock.runFor(34)
  }
  async function place(rotation: number, column: number, keys = ['KeyE','KeyR','KeyA','KeyD','KeyW']) {
    if (rotation) await press(keys[rotation-1])
    for (let x=3;x!==column;x+=Math.sign(column-3)) await press(keys[x>column?2:3])
    await press(keys[4])
  }
  for (const [r,x] of [[0,3],[0,1],[0,7],[1,-1],[2,5],[2,4]]) {
    await place(r,x)
    await place(r,x,['KeyO','KeyP','KeyJ','KeyL','KeyI'])
  }
  await expect(j1.locator('.zone-label strong')).toHaveText('25%')
  await expect(j2.locator('.zone-label strong')).toHaveText('25%')
  await press('KeyC')
  await expect(j1).toHaveClass(/zoned/)
  await expect(j1.locator('.zone-badge')).toBeVisible()
  await expect(j2).not.toHaveClass(/zoned/)
  for (const [r,x] of [[0,0],[0,-1],[1,1],[0,7]]) await place(r,x)
  await expect(j1.locator('.zone-label strong')).toContainText('1 L')
  const banked = await j1.locator('canvas.board').evaluate(canvas => {
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')!
    return [13,39,65,247].every(x=>{
      const [r,g,b] = ctx.getImageData(x,(canvas as HTMLCanvasElement).height-13,1,1).data
      return r===255 && g===218 && b===120
    })
  })
  expect(banked).toBe(true)
  await page.clock.resume()
  await page.screenshot({path:info.outputPath('zone.png')})
  await expect(j2.locator('.incoming')).toHaveText('0')
  await expect(j1.locator('.zone-result')).toContainText('ZONE COMPLETADA', {timeout:6000})
  await expect(j1.locator('.zone-result')).toContainText('Single')
  await expect(j1.locator('.zone-result')).toContainText('1 línea')
  await expect(j1.locator('.zone-result')).toHaveCSS('animation-name','zone-result-in')
  expect(await j1.locator('.well .zone-result').count()).toBe(0)
  const projectile = page.locator('.projectile[data-from="0"][data-to="1"]')
  await expect(projectile).toBeVisible()
  expect(await page.evaluate(()=>(window as unknown as {testFrequencies:number[]}).testFrequencies)).not.toContain(746)
  await projectile.evaluate(el=>{ el.getAnimations()[0].currentTime = 155 })
  await page.screenshot({path:info.outputPath('proyectil.png')})
  await projectile.evaluate(el=>{ el.getAnimations()[0].play() })
  await expect(projectile).toHaveCount(0)
  await expect(j2.locator('.well')).toHaveClass(/hit/)
  await expect(j2.locator('.incoming')).toHaveText('4')
  await expect(j2.locator('.attackers')).toContainText('J1 +4')
  const projection = j2.locator('.projection')
  await expect(projection).toHaveText(/\+4 · ALTURA \d+/)
  await expect(j2.locator('.impact')).toHaveText('+4 ENTRANTES')
  await page.screenshot({path:info.outputPath('ataque.png')})
  const frequencies = await page.evaluate(()=>(window as unknown as {testFrequencies:number[]}).testFrequencies)
  expect(frequencies).toEqual(expect.arrayContaining([110,620,880,82,746]))
  await press('KeyN')
  await expect(j2).toHaveClass(/zoned/)
  await expect(projection).toBeHidden()
  expect(await j2.locator('canvas.forecast').evaluate((canvas:HTMLCanvasElement)=>
    canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data.some(Boolean))).toBe(false)
  await expect(j2.locator('.incoming')).toHaveText('4')
  await expect(projection).toBeVisible({timeout:5500})
  await expect(j1.locator('.zone-result')).toBeHidden()
})

async function pauseFinalFall(page: Page) {
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.addInitScript(()=>{
    const animate = Element.prototype.animate
    Element.prototype.animate = function(keyframes,options) {
      const animation = animate.call(this,keyframes,options)
      if (this.classList.contains('board-fall')) animation.pause()
      return animation
    }
  })
}

test('el tablero final cae intacto en VS4 y deja al ganador, estadísticas y revancha', async ({page},info) => {
  await pauseFinalFall(page)
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
  const defeat = page.locator('li:has([data-result-player="3"]) .character-caption')
  await expect(defeat).toBeVisible()
  await expect(defeat.locator('.dialogue-name')).toHaveText('ASTRA')
  await expect(page.locator('.result-boards .player')).toHaveAttribute('data-player','0')
  await expect(page.locator('.result-mvp')).toContainText('MVP')
  const falling = page.locator('.board-fall[data-player="3"]')
  await expect(falling).toBeVisible()
  expect(await falling.evaluate((canvas:HTMLCanvasElement)=>{
    const pixels = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data
    return pixels.some((value,index)=>index%4===0 && Math.max(value,pixels[index+1],pixels[index+2])>140)
  })).toBe(true)
  await expect(page.locator('.final-burst i')).toHaveCount(14)
  await falling.evaluate(canvas=>canvas.getAnimations().forEach(animation=>animation.play()))
  await expect(falling).toHaveCount(0)
  const winner = await page.locator('.result-boards .player').boundingBox()
  expect(winner!.x+winner!.width/2).toBeCloseTo(960,0)
  await page.screenshot({path:info.outputPath('final-vs4.png')})
  await page.getByRole('button',{name:'Revancha'}).click()
  await expect(page.getByText('PREPÁRATE')).toBeVisible()
  await expect(page.locator('.player.dead')).toHaveCount(0)
})

test('Versus Zone comienza con dos o tres plazas listas y conserva sus posiciones', async ({page}) => {
  await page.goto('/')
  await lobby(page)
  const play = page.getByRole('button',{name:'Iniciar partida'})
  await page.locator('[data-ready="1"]').click()
  await expect(play).toBeDisabled()
  await page.locator('[data-ready="3"]').click()
  await expect(play).toBeEnabled()
  await play.click()
  await expect(page.locator('.board')).toHaveCount(2)
  await expect(page.locator('[data-player="1"] .target')).toContainText('J4')
  await expect(page.locator('[data-player="3"] .target')).toContainText('J2')
  await page.getByRole('button',{name:'Pausa',exact:true}).click()
  await page.getByRole('button',{name:'Volver a la sala'}).click()
  await page.locator('[data-ready="0"]').click()
  await play.click()
  await expect(page.locator('.board')).toHaveCount(3)
  await expect(page.locator('[data-player="2"]')).toHaveCount(0)
  await expect(page.locator('.game-info strong')).toHaveText('1v1v1')
})

test('la sala ofrece Aleatorio y Defensa y conserva la opción elegida', async ({page}) => {
  await page.goto('/')
  await lobby(page)
  const target = page.getByLabel('Objetivos')
  await target.selectOption({label:'Aleatorio'})
  await expect(target).toHaveValue('random')
  await target.selectOption({label:'Defensa'})
  await page.reload()
  await lobby(page)
  await expect(target).toHaveValue('counter')
})

test('la pila crítica activa el marco rojo y la alarma sintetizada', async ({page},info) => {
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createOscillator
    const frequencies: number[] = []
    Object.defineProperty(window,'alarmFrequencies',{value:frequencies})
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
  await page.getByLabel('Semilla').fill('alerta')
  await page.getByLabel('Voces de ataques').uncheck()
  await page.getByRole('button',{name:'Volver'}).click()
  await lobby(page)
  await start(page)
  const player = page.locator('[data-player="0"]')
  for (let i=0;i<14 && await player.getAttribute('data-danger')!=='2';i++) {
    await page.keyboard.press('KeyW',{delay:25})
  }
  await expect(player.locator('.danger-label')).toHaveText('¡ALARMA!')
  const caption = player.locator('.character-caption')
  await expect(caption.locator('.dialogue-name')).toHaveText('VOLT')
  await expect(caption.locator('.dialogue-text')).toHaveText('Tch... ¡Esto se complica!')
  const captionBox = await caption.boundingBox()
  const wellBox = await player.locator('.well').boundingBox()
  expect(captionBox!.y+captionBox!.height).toBeLessThanOrEqual(wellBox!.y)
  await expect(player.locator('.spawn-label')).toContainText('APARICIÓN')
  const guide = await player.locator('canvas.spawn-guide').evaluate(el=>{
    const canvas = el as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    let cells = 0
    for (let y=0;y<6;y++) for (let x=0;x<10;x++) if (ctx.getImageData(x*26+13,y*26+13,1,1).data[3]) cells++
    return {cells,height:canvas.height}
  })
  expect(guide).toEqual({cells:4,height:24*26})
  await expect(player).toHaveCSS('border-top-color','rgb(255, 82, 112)')
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {alarmFrequencies:number[]}).alarmFrequencies))
    .toEqual(expect.arrayContaining([587,392]))
  await page.screenshot({path:info.outputPath('alarma.png')})
})

test('Equipos 2v2 admite personas e IA, jugar y volver a cargar las dificultades', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:/Equipos 2v2/}).click()
  await expect(page.getByRole('heading',{name:'Sala Equipos 2v2'})).toBeVisible()
  const start = page.getByRole('button',{name:'Iniciar partida'})
  await page.locator('[data-controller="1"]').selectOption('bot')
  await page.locator('[data-level="1"]').selectOption('10')
  await page.locator('[data-controller="3"]').selectOption('bot')
  await page.locator('[data-level="3"]').selectOption('1')
  await expect(page.locator('[data-level="1"] option:checked')).toHaveText('10 · Ultra experto')
  await expect(start).toBeDisabled()
  await page.locator('[data-ready="0"]').click()
  await expect(start).toBeDisabled()
  await page.locator('[data-ready="2"]').click()
  await start.click()
  await expect(page.locator('#overlay')).toBeHidden({timeout:8000})
  await expect(page.locator('.game-info strong')).toHaveText('2v2')
  await expect(page.locator('[data-player="1"] .bot-tag')).toHaveText('IA 10')
  await expect(page.locator('[data-player="3"] .bot-tag')).toHaveText('IA 1')
  await expect(page.locator('[data-player="1"] .target')).toContainText('J3')
  await expect(page.locator('[data-player="3"] .target')).toContainText('J1')
  const before = await snapshot(page,1)
  await expect.poll(()=>snapshot(page,1)).not.toBe(before)
  await page.reload()
  await page.getByRole('button',{name:/Equipos 2v2/}).click()
  await expect(page.locator('[data-controller="1"]')).toHaveValue('bot')
  await expect(page.locator('[data-level="1"]')).toHaveValue('10')
  await expect(page.locator('[data-level="3"]')).toHaveValue('1')
})

test('el resultado de un 2v2 incluye al compañero eliminado en el equipo ganador', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByRole('button',{name:'Volver'}).click()
  await page.getByRole('button',{name:/Equipos 2v2/}).click()
  await start(page)
  for (const [slot,key] of [[1,'KeyI'],[2,'ArrowUp'],[3,'Numpad8']] as const) {
    for (let i=0;i<14;i++) await page.keyboard.press(key,{delay:19})
    if (slot!==3) await expect(page.locator(`.player[data-player="${slot}"]`)).toHaveClass(/dead/)
  }
  await expect(page.getByRole('heading',{name:'Equipo A gana'})).toBeVisible()
  await expect(page.locator('.ranking li b')).toHaveText(['1','1','2','2'])
  await expect(page.locator('.ranking li').nth(1)).toContainText('Jugador 2')
  await expect(page.locator('.result-boards .player')).toHaveAttribute('data-player','0')
  await expect(page.locator('.final-fx')).toHaveCount(0)
})

test('Blitz reutiliza mandos y teclado, intercambia dos tableros y conserva la reserva', async ({page},info) => {
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.addInitScript(()=>{
    const buttons = Array.from({length:17},()=>({pressed:false,value:0}))
    Object.defineProperty(window,'blitzButtons',{value:buttons})
    Object.defineProperty(navigator,'getGamepads',{value:()=>[
      {id:'Mando Blitz',index:0,connected:true,mapping:'standard',buttons,axes:[0,0]},
    ]})
  })
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByLabel('Semilla').fill('blitz-vista')
  await page.getByRole('button',{name:'Volver'}).click()
  await page.getByRole('button',{name:/2v2 Blitz/}).click()
  await expect(page.getByRole('heading',{name:'Sala 2v2 Blitz'})).toBeVisible()
  await page.locator('[data-device="3"]').selectOption('0')
  await page.getByText('Reglas de Blitz',{exact:true}).click()
  await page.getByLabel('Turno (segundos)',{exact:true}).fill('5')
  await page.getByLabel('Cuenta regresiva (segundos)',{exact:true}).fill('2')
  await start(page)
  const front = page.locator('.blitz-stack .player[data-state="active"]')
  const back = page.locator('.blitz-stack .player[data-state="reserve"]')
  const clock = page.getByRole('timer',{name:'Segundos para el relevo'})
  await expect(front).toHaveCount(2)
  await expect(back).toHaveCount(2)
  await expect(page.locator('.game-bar #elapsed')).toHaveCount(0)
  await expect(clock).toHaveText(/^\d+$/)
  const position = await clock.evaluate(node=>{
    const clock = node.getBoundingClientRect()
    const arena = node.parentElement!.getBoundingClientRect()
    return [clock.x+clock.width/2-arena.x-arena.width/2,clock.y+clock.height/2-arena.y-arena.height/2]
  })
  expect(position.every(value=>Math.abs(value)<1)).toBe(true)
  expect((await front.first().locator('.well').boundingBox())!.height).toBeGreaterThan(780)
  expect(await front.locator('.player-stats').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().bottom<=innerHeight))).toBe(true)
  const active = (await front.evaluateAll(nodes=>nodes.map(node=>Number((node as HTMLElement).dataset.player))))
  const reserve = active.map(slot=>slot^1)
  const frozen = await Promise.all(reserve.map(i=>snapshot(page,i)))
  await page.keyboard.press(['KeyT','KeyV','BracketLeft','NumpadDivide'][active[0]])
  await expect(front.first().locator('.blitz-stance')).toHaveAttribute('data-stance','defense')
  await expect(page.locator('.combat-hud')).toHaveCount(0)
  await expect(front.first().locator('.rail .blitz-zone .zone-label')).toHaveText('0%')
  await page.keyboard.press(['KeyW','KeyI','ArrowUp','Numpad8'][reserve[0]])
  await page.screenshot({path:info.outputPath('blitz.png')})
  expect(await snapshot(page,reserve[0])).toBe(frozen[0])
  const endangered = page.locator(`[data-player="${active[0]}"]`)
  for (let i=0;i<14 && await endangered.getAttribute('data-danger')==='0';i++) {
    await page.keyboard.press(['KeyW','KeyI'][active[0]],{delay:28})
  }
  await expect(endangered).toHaveAttribute('data-danger',/[12]/)
  await clock.evaluate(node=>{
    const observer = new MutationObserver(()=>{
      if (node.textContent==='¡CAMBIO!') {
        const view = node as HTMLElement
        view.dataset.sawChange = 'true'
        view.dataset.changeWidth = String(node.getBoundingClientRect().width/innerWidth)
        view.dataset.changeFont = getComputedStyle(node.querySelector('strong')!).fontSize
      }
    })
    observer.observe(node,{childList:true,subtree:true})
  })
  await expect(clock).toHaveAttribute('data-warning','true')
  await expect(clock).toHaveText('2')
  await expect(clock.locator('strong')).toHaveCSS('animation-name','blitz-digit-even')
  await expect(clock).toHaveAttribute('data-turn','2',{timeout:7500})
  await expect(clock).toHaveAttribute('data-saw-change','true')
  expect(Number(await clock.getAttribute('data-change-width'))).toBeGreaterThan(.7)
  expect(parseFloat((await clock.getAttribute('data-change-font'))!)).toBeGreaterThan(180)
  await expect(endangered).toHaveAttribute('data-state','reserve')
  await expect(endangered).toHaveAttribute('data-reserve-danger','true')
  await expect(endangered).toHaveCSS('border-top-color','rgb(255, 82, 107)')
  await expect(endangered).toHaveCSS('animation-name','reserve-shiver')
  const drop = endangered.locator('.reserve-sweat i').first()
  await expect(drop).toBeVisible()
  await expect(drop).toHaveCSS('animation-name','reserve-drop')
  await page.screenshot({path:info.outputPath('blitz-reserva.png')})
  expect(await front.evaluateAll(nodes=>nodes.map(node=>Number((node as HTMLElement).dataset.player)))).toEqual(reserve)
  expect(await Promise.all(reserve.map(i=>snapshot(page,i)))).toEqual(frozen)
  if (reserve.includes(3)) {
    await expect(clock).toHaveText('5')
    await page.evaluate(()=>{
      const buttons = (window as unknown as {blitzButtons:{pressed:boolean;value:number}[]}).blitzButtons
      buttons[3] = {pressed:true,value:1}
    })
    await expect(page.locator('[data-player="3"] .blitz-stance')).toHaveAttribute('data-stance','defense')
  }
  await page.getByRole('button',{name:'Pausa',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Partida en pausa'})).toBeVisible()
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect(endangered).toHaveCSS('animation-name','none')
  await expect(drop).toBeHidden()
  await page.setViewportSize({width:1366,height:768})
  expect(await front.locator('.player-stats').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().bottom<=innerHeight))).toBe(true)
  await page.getByRole('button',{name:'Reiniciar'}).click()
  await expect(clock).toHaveAttribute('data-turn','1')
})

test('la música de Blitz hace bucle, conserva el nivel con efectos y sigue las pausas',async ({page})=>{
  await page.addInitScript(()=>{
    const create = AudioContext.prototype.createMediaElementSource
    const ramp = AudioParam.prototype.setTargetAtTime
    const music:{track?:HTMLMediaElement; gain?:AudioParam; targets:number[]} = {targets:[]}
    Object.defineProperty(window,'testMusic',{value:music})
    AudioContext.prototype.createMediaElementSource = function(track) {
      const source = create.call(this,track)
      if (!new URL(track.src).pathname.endsWith('.mp3')) return source
      music.track = track
      const connect = source.connect.bind(source)
      source.connect = ((destination:GainNode)=>{
        music.gain = destination.gain
        return connect(destination)
      }) as typeof source.connect
      return source
    }
    AudioParam.prototype.setTargetAtTime = function(value,time,constant) {
      if (this===music.gain) music.targets.push(value)
      return ramp.call(this,value,time,constant)
    }
  })
  const state = () => page.evaluate(()=>{
    const {track,gain,targets} = (window as unknown as {testMusic:{track?:HTMLMediaElement;gain?:AudioParam;targets:number[]}}).testMusic
    return track ? {loop:track.loop,paused:track.paused,duration:track.duration,time:track.currentTime,targets,src:track.currentSrc,gain:gain?.value} : null
  })
  await page.goto('/')
  expect(await state()).toBeNull()
  await page.getByRole('button',{name:/2v2 Blitz/}).click()
  await start(page)
  await expect.poll(async ()=>(await state())?.paused).toBe(false)
  await expect.poll(async ()=>(await state())?.duration).toBeGreaterThan(1)
  expect(await state()).toMatchObject({loop:true,src:expect.stringMatching(/blitz-.+\.mp3$/)})
  const slot = Number(await page.locator('.blitz-stack [data-state="active"]').first().getAttribute('data-player'))
  const before = (await state())!
  await page.keyboard.press(['KeyT','KeyV','BracketLeft','NumpadDivide'][slot])
  await expect(page.locator(`[data-player="${slot}"] .blitz-stance`)).toHaveAttribute('data-stance','defense')
  expect(before.gain).toBeCloseTo(.10,5)
  expect(await state()).toMatchObject({gain:before.gain,targets:before.targets})
  await page.evaluate(()=>{
    const {track} = (window as unknown as {testMusic:{track:HTMLMediaElement}}).testMusic
    track.currentTime = track.duration-.15
  })
  await expect.poll(async ()=>(await state())?.time).toBeLessThan(3)
  await page.getByRole('button',{name:'Pausa',exact:true}).click()
  await expect.poll(async ()=>(await state())?.paused).toBe(true)
  await page.getByRole('button',{name:'Continuar'}).click()
  await expect.poll(async ()=>(await state())?.paused).toBe(false)
  await page.getByRole('button',{name:'Pausa',exact:true}).click()
  await page.getByRole('button',{name:'Volver a la sala'}).click()
  expect(await state()).toMatchObject({paused:true,time:0})
})

test('Blitz oculta el contador en el duelo final y muestra misiones al costado',async ({page},info)=>{
  await pauseFinalFall(page)
  await page.goto('/')
  await page.getByRole('button',{name:'Configuración'}).click()
  await page.getByLabel('Gravedad inicial (celdas/s)').fill('0')
  await page.getByLabel('Semilla').fill('alerta')
  await page.getByRole('button',{name:'Volver'}).click()
  await page.getByRole('button',{name:/2v2 Blitz/}).click()
  await page.getByText('Reglas de Blitz',{exact:true}).click()
  await page.getByLabel('Turno (segundos)',{exact:true}).fill('3')
  await start(page)
  const front = page.locator('.blitz-stack [data-state="active"]')
  const first = await front.evaluateAll(nodes=>nodes.map(el=>Number((el as HTMLElement).dataset.player)))
  for (const slot of first) {
    for (let i=0;i<14;i++) await page.keyboard.press(['KeyW','KeyI','ArrowUp','Numpad8'][slot],{delay:21})
    await expect(page.locator(`[data-player="${slot}"]`)).toHaveAttribute('data-state','down')
    await expect(page.locator('.blitz-clock')).toHaveAttribute('data-transition','')
  }
  await expect(page.locator('.blitz-stack [data-state="down"]')).toHaveCount(2)
  await expect(front).toHaveCount(2)
  await expect(page.getByRole('timer',{name:'Segundos para el relevo'})).toBeHidden()
  await expect(page.locator('.blitz-rescue:visible [data-state="active"] .rescue-title')).toHaveText(['Tetris o T-Spin','Tetris o T-Spin'])
  await expect(page.locator('.blitz-rescue:visible [data-state="locked"] .rescue-title')).toHaveText(['Líneas de ataque','Líneas de ataque'])
  await expect(page.locator('.rescue-alert').first()).toHaveCSS('animation-name','rescue-alert')
  const geometry = await page.locator('.blitz-team').evaluateAll(teams=>teams.map((team,i)=>{
    const mission = team.querySelector('.blitz-rescue')!.getBoundingClientRect()
    const well = team.querySelector('[data-state="active"] .well')!.getBoundingClientRect()
    return i===0 ? mission.right<well.left : mission.left>well.right
  }))
  expect(geometry).toEqual([true,true])
  await expect(front.first().locator('canvas.next')).toHaveAttribute('width','64')
  await page.screenshot({path:info.outputPath('blitz-duelo.png')})
  const finalRival = Number(await front.nth(1).getAttribute('data-player'))
  const finalWinner = await front.first().getAttribute('data-player')
  for (let i=0;i<14;i++) await page.keyboard.press(['KeyW','KeyI','ArrowUp','Numpad8'][finalRival],{delay:21})
  await expect(page.getByRole('heading',{name:'Equipo A gana'})).toBeVisible()
  await expect(page.locator('.result-boards .player')).toHaveAttribute('data-player',finalWinner!)
  await expect(page.locator('.result-mvp')).toBeVisible()
  await expect(page.locator('.ranking li')).toHaveCount(4)
  const falling = page.locator(`.board-fall[data-player="${finalRival}"]`)
  await expect(falling).toBeVisible()
  await falling.evaluate(canvas=>canvas.getAnimations().forEach(animation=>animation.play()))
  await expect(falling).toHaveCount(0)
  await page.screenshot({path:info.outputPath('final-blitz.png')})
})
