import {marketArt} from '../nightMarket/map';

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

// Importing this registry never starts downloads. Only the visible chapter is
// warmed, so warehouse entry still has no competing chapter backgrounds.
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
type Artwork = {image: HTMLImageElement; ready: Promise<HTMLImageElement>};
const cache = new Map<string, Artwork>();
const warming = new Set<string>();

function load(mapId: string, floor: string): Artwork {
  const [url, fallback] = artwork[mapId][floor];
  const existing = cache.get(url);
  if (existing) return existing;
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = floor === 'L0' ? 'high' : 'low';
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    let usingFallback = false;
    const failed = () => {
      if (!usingFallback) {usingFallback = true;image.src = fallback;}
      else reject(new Error(`Unable to load ${mapId} ${floor} background`));
    };
    image.onload = () => {void image.decode().then(() => resolve(image), failed);};
    image.onerror = failed;
    image.src = url;
  });
  // Renderers can use the image while it loads; a missing fallback must not
  // produce an unhandled rejection in that path.
  void ready.catch(() => {});
  const result = {image, ready};
  cache.set(url, result);
  return result;
}

export function chapterBackground(mapId: string, floor = 'L0'): HTMLImageElement {
  return load(mapId, floor).image;
}

export function chapterBackgroundReady(mapId: string, floor = 'L0'): Promise<HTMLImageElement> {
  return load(mapId, floor).ready;
}

export function preloadChapterArtwork(mapId: string) {
  if (!artwork[mapId] || warming.has(mapId)) return;
  warming.add(mapId);
  // Give the entry floor the connection first. Alternate floors warm once it
  // is decoded, or immediately if traversal needs them before that point.
  void chapterBackgroundReady(mapId).then(() => {
    for (const floor of Object.keys(artwork[mapId])) if (floor !== 'L0') load(mapId, floor);
  }, () => {warming.delete(mapId);});
}
