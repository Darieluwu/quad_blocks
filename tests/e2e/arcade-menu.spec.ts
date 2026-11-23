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
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight)).toBe(true)
  await page.screenshot({path:'test-results/arcade-modes.png',fullPage:true})

  await page.keyboard.press('Escape')
  await expect(page.locator('.home-menu')).toBeVisible()
})
