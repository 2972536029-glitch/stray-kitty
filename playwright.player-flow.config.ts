import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'integrated-player-flow.spec.ts', workers: 1,
  timeout: 120000, expect: {timeout: 10000},
  use: {baseURL: 'http://127.0.0.1:8179', headless: true, viewport: {width: 1440, height: 1100},
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {},
    trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  reporter: [['list'], ['json', {outputFile: 'output/player-flow/results.json'}]],
});
