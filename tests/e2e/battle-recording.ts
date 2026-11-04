import type {PlaywrightWorkerOptions} from '@playwright/test';

const mode = process.env.KITTY_E2E_KEEP_ARTIFACTS === '1' ? 'on' : 'retain-on-failure';

// These suites use the page fixture, so Playwright manages the video's full lifecycle.
// Keep action/DOM/network/source diagnostics without archiving thousands of JPEG frames.
export const battleRecording = {
  trace:{mode,screenshots:false,snapshots:true,sources:true,attachments:true},
  video:{mode,size:{width:800,height:610},fps:10}
} satisfies Pick<PlaywrightWorkerOptions,'trace'|'video'>;
