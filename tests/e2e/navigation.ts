import type { Page } from '@playwright/test'

export async function openLobby(page:Page,mode:'versus'|'teams'|'blitz') {
  await page.locator('[data-main-action="play"]').click()
  await page.locator(`[data-mode="${mode}"]`).click()
  await page.locator('[data-mode-confirm]').click()
}
