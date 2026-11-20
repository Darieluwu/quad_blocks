import { defineConfig } from '@playwright/test'
const port = Number(process.env.QUAD_TEST_PORT) || 4173
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({testDir:'./tests/e2e', workers:1, use:{channel:process.env.QUAD_BROWSER || undefined, baseURL, viewport:{width:1920,height:1080}}, webServer:{command:`npm run preview -- --port ${port} --strictPort`,url:baseURL,reuseExistingServer:false}})
