import {marketArt} from '../nightMarket/map';
import {queueImage} from '../../core/image-loading';

const alleyUrl = new URL('./assets/rainy-alley-background-clean.lossless.webp', import.meta.url).href;
const marketL0Url = new URL('./assets/night_market_L0_streets_1672x941.lossless.webp', import.meta.url).href;
const marketL1Url = new URL('./assets/night_market_L1_rooftops_1672x941.lossless.webp', import.meta.url).href;
const marketLowerUrl = new URL('./assets/night_market_Lminus1_tunnel_1672x941.lossless.webp', import.meta.url).href;
const tunnelL0Url = new URL('./assets/chapter4_L0_approved.lossless.webp', import.meta.url).href;
const tunnelLowerUrl = new URL('./assets/chapter4_Lminus1_tunnel_v11.lossless.webp', import.meta.url).href;
const homeUrl = new URL('./assets/greenhouse-base.lossless.webp', import.meta.url).href;
const alleyOriginal = new URL('../rainyAlley/assets/rainy-alley-background-clean.png', import.meta.url).href;
const tunnelL0Original = new URL('../../../../level_design/chapter4/art/chapter4_L0_approved.png', import.meta.url).href;
const tunnelLowerOriginal = new URL('../../../../level_design/chapter4/art/chapter4_Lminus1_tunnel_v11.png', import.meta.url).href;

// Importing this registry never starts downloads. App chooses the classic eager
// loading policy or warehouse's isolated loading path from the saved map.
const artwork: Record<string, Record<string, readonly [string, string]>> = {
  alley: {L0: [alleyUrl, alleyOriginal]},
  market: {
    L0: [marketL0Url, marketArt.L0],
    L1: [marketL1Url, marketArt.L1],
    Lm1: [marketLowerUrl, marketArt.Lm1],
  },
  tunnel: {L0: [tunnelL0Url, tunnelL0Original], Lm1: [tunnelLowerUrl, tunnelLowerOriginal]},
  greenhouse: {L0: [homeUrl, '/assets/home/greenhouse-base.png']},
};
export type ChapterBackgroundState = 'loading' | 'ready' | 'error';
export type ChapterBackgroundStatus = {mapId: string; floor: string; state: ChapterBackgroundState};
type Artwork = {image: HTMLImageElement; ready: Promise<HTMLImageElement>; state: ChapterBackgroundState};
const cache = new Map<string, Artwork>();
const warming = new Set<string>();
const classicWarming = new Set<string>();
let classicActiveMapId = '';

function load(mapId: string, floor: string, priority: 'high' | 'low' = floor === 'L0' ? 'high' : 'low'): Artwork {
  const [url, fallback] = artwork[mapId][floor];
  const existing = cache.get(url);
  if (existing) {
    if (priority === 'high') existing.image.fetchPriority = 'high';
    return existing;
  }
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = priority;
  const result: Artwork = {image, ready: Promise.resolve(image), state: 'loading'};
  result.ready = new Promise<HTMLImageElement>((resolve, reject) => {
    let usingFallback = false;
    const failed = () => {
      if (!usingFallback) {usingFallback = true;void queueImage(image,fallback);}
      else {result.state = 'error';reject(new Error(`Unable to load ${mapId} ${floor} background`));}
    };
    image.onload = () => {void image.decode().then(() => {result.state = 'ready';resolve(image);}, failed);};
    image.onerror = failed;
    void queueImage(image,url);
  });
  // Renderers can use the image while it loads; a missing fallback must not
  // produce an unhandled rejection in that path.
  void result.ready.catch(() => {});
  cache.set(url, result);
  return result;
}

export function chapterBackground(mapId: string, floor = 'L0'): HTMLImageElement {
  const image = load(mapId, floor).image;
  image.fetchPriority = 'high';
  return image;
}

export function chapterBackgroundState(mapId: string, floor = 'L0'): ChapterBackgroundState {
  return load(mapId, floor, 'high').state;
}

export function retryChapterBackground(mapId: string, floor = 'L0') {
  cache.delete(artwork[mapId][floor][0]);warming.delete(mapId);load(mapId, floor);
}

// Restore early loading for Chapters 1, 2 and 4, including every floor. Finish
// the visible entry image before warming the others on the same connection.
export function preloadClassicChapterArtwork(activeMapId: string) {
  classicActiveMapId = activeMapId;
  if (activeMapId === 'warehouse' || classicWarming.has(activeMapId)) return;
  classicWarming.add(activeMapId);
  const warm = () => {
    classicWarming.delete(activeMapId);
    if (classicActiveMapId !== activeMapId) return;
    for (const mapId of ['alley', 'market', 'tunnel']) {
      for (const floor of Object.keys(artwork[mapId])) load(mapId, floor, 'low');
    }
  };
  if (artwork[activeMapId]) void chapterBackgroundReady(activeMapId).then(warm, () => {classicWarming.delete(activeMapId);});
  else warm();
}

export function chapterBackgroundReady(mapId: string, floor = 'L0'): Promise<HTMLImageElement> {
  return load(mapId, floor, 'high').ready;
}

export function preloadChapterArtwork(mapId: string) {
  if (!artwork[mapId] || warming.has(mapId)) return;
  warming.add(mapId);
  // Give the entry floor the connection first. Alternate floors warm once it
  // is decoded, or immediately if traversal needs them before that point.
  void chapterBackgroundReady(mapId).then(() => {
    for (const floor of Object.keys(artwork[mapId])) if (floor !== 'L0') load(mapId, floor, 'low');
  }, () => {warming.delete(mapId);});
}
