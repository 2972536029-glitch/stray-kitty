import {defineConfig} from '@playwright/test';
const testPort = Number(process.env.KITTY_TEST_PORT ?? 8117);
const externalPreview = process.env.KITTY_TEST_EXTERNAL_SERVER === '1';
export default defineConfig({
  testDir:'./tests/e2e',workers:1,timeout:60000,expect:{timeout:10000},
  use:{baseURL:`http://127.0.0.1:${testPort}`,headless:true,launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{},viewport:{width:1440,height:1100},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:externalPreview?undefined:{command:'node scripts/preview.mjs',url:`http://127.0.0.1:${testPort}/healthz`,reuseExistingServer:false,timeout:120000},
  reporter:[['list']]
});
