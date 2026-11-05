import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ChapterBattleViewport} from '../../web/src/modules/battle/chapter/ChapterBattleViewport';
import {MarketBattleViewport} from '../../web/src/modules/battle/market/MarketBattleViewport';
import {GreenhouseBattleViewport} from '../../web/src/modules/battle/greenhouse/GreenhouseBattleViewport';
import {TunnelBattleViewport} from '../../web/src/modules/battle/tunnel/TunnelBattleViewport';
import {FinaleBattleViewport} from '../../web/src/modules/battle/finale/FinaleBattleViewport';
import {MAP as chapterMap} from '../../web/src/modules/battle/chapter/config';
import {MAP as marketMap} from '../../web/src/modules/battle/market/config';
import {MAP as greenhouseMap} from '../../web/src/modules/battle/greenhouse/config';
import {MAP as tunnelMap} from '../../web/src/modules/battle/tunnel/config';
import {MAP as finaleMap} from '../../web/src/modules/battle/finale/config';
import '../../web/src/ui/styles.css';
import '../../web/src/ui/theme-cozy.css';
import '../../web/src/ui/layout-viewport.css';
import '../../web/src/ui/layout-battle.css';
import '../../web/src/ui/mobile-landscape.css';
import '../../web/src/modules/battle/immersive.css';

const views = {chapter: ChapterBattleViewport, market: MarketBattleViewport,
  greenhouse: GreenhouseBattleViewport, tunnel: TunnelBattleViewport, finale: FinaleBattleViewport};
const maps = {chapter: chapterMap, market: marketMap, greenhouse: greenhouseMap, tunnel: tunnelMap, finale: finaleMap};
type Chapter = keyof typeof views;
const root = createRoot(document.getElementById('root')!);
let chapter: Chapter = 'chapter', attempt = 0;
function render() {
  // Keep the same component mounted on retry, exercising the production attempt reset effect.
  const View = views[chapter];
  flushSync(() => root.render(createElement(View, {
    attemptId: `boss-retreat-${chapter}-${attempt}`, difficulty: 'medium', paused: false,
    onResult: () => {throw new Error('This fixture must not finish a whole battle.');},
  })));
}
const fixture = {
  open(value: Chapter) {chapter = value; attempt++; render(); return maps[chapter];},
  retry() {attempt++; render();},
};
(window as unknown as {bossRetreatFixture: typeof fixture}).bossRetreatFixture = fixture;
