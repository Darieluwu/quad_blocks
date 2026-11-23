import { expect, test } from '@playwright/test'

test('renders and navigates the arcade menu', async ({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await expect(page.locator('.home-menu')).toBeVisible()
  await expect(page.locator('.arcade-brand')).toContainText('TETRA')
  await expect(page.locator('.volt-character img')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight)).toBe(true)
  await page.screenshot({path:'test-results/arcade-home.png',fullPage:true})

  await page.keyboard.press('Enter')
  await expect(page.locator('.mode-menu')).toBeVisible()
  await expect(page.getByText('VERSUS SURGE')).toBeVisible()
  await expect(page.locator('.mode-cover img')).toHaveCount(3)
  await expect(page.locator('.arcade-mode.is-selected img')).toHaveAttribute('src',/vs4/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.arcade-mode.is-selected img')).toHaveAttribute('src',/2v2/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.arcade-mode.is-selected img')).toHaveAttribute('src',/2v2blitz/)
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight)).toBe(true)
  await page.screenshot({path:'test-results/arcade-modes.png',fullPage:true})

  await page.keyboard.press('Escape')
  await expect(page.locator('.home-menu')).toBeVisible()
})

test('fits the official cover selector at multiple resolutions', async ({page})=>{
  for (const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768},{width:390,height:844}]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.keyboard.press('Enter')
    await expect(page.locator('.mode-cover img')).toHaveCount(3)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await page.screenshot({path:`test-results/arcade-modes-${viewport.width}.png`,fullPage:true})
  }
})
