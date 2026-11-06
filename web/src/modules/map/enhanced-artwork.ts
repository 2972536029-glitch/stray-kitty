import {queueImage} from '../../core/image-loading';

const sources: Record<string, Record<string, string>> = {
  market: {
    L0: new URL('./assets/night_market_L0_streets_1672x941.enhanced-v1.lossless.webp', import.meta.url).href,
    L1: new URL('./assets/night_market_L1_rooftops_1672x941.enhanced-v1.lossless.webp', import.meta.url).href,
    Lm1: new URL('./assets/night_market_Lminus1_tunnel_1672x941.enhanced-v1.lossless.webp', import.meta.url).href,
  },
  tunnel: {
    L0: new URL('./assets/chapter4_L0_approved.enhanced-v1.lossless.webp', import.meta.url).href,
    Lm1: new URL('./assets/chapter4_Lminus1_tunnel_v11.enhanced-v1.lossless.webp', import.meta.url).href,
  },
};
const cache = new Map<string, {image: HTMLImageElement; decoded: boolean}>();

/** Upgrade only the active floor after its original is playable; failures retain it. */
export function chapterDisplayArtwork(mapId: string, floor: string, original: HTMLImageElement): HTMLImageElement {
  const url = sources[mapId]?.[floor];
  if (!url || !original.complete || !original.naturalWidth) return original;
  let entry = cache.get(url);
  if (!entry) {
    const image = new Image();image.decoding = 'async';image.fetchPriority = 'low';
    entry = {image, decoded: false};cache.set(url, entry);
    const pending = entry;
    void queueImage(image, url).then(() => image.decode()).then(() => {pending.decoded = true;}).catch(() => {});
  }
  return entry.decoded ? entry.image : original;
}
