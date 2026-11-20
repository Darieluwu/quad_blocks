import { defineConfig } from '@playwright/test'
export default defineConfig({testDir:'./tests/e2e', workers:1, use:{baseURL:'http://127.0.0.1:4173', viewport:{width:1920,height:1080}}, webServer:{command:'npm run preview -- --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false}})
