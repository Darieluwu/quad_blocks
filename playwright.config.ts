import { defineConfig } from '@playwright/test'
const online = process.env.TETRAVOLT_ONLINE==='1'
const port = Number(process.env.TETRAVOLT_TEST_PORT || process.env.QUAD_TEST_PORT) || 4173
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({testDir:'./tests/e2e', workers:1,
  use:{channel:process.env.TETRAVOLT_BROWSER || process.env.QUAD_BROWSER || undefined,baseURL,viewport:{width:1920,height:1080}},
  webServer:{command:online?`npm run online:dev -- --port ${port}`:`npm run preview -- --port ${port} --strictPort`,
    env:{WRANGLER_SEND_METRICS:'false'},url:baseURL,reuseExistingServer:false}})
