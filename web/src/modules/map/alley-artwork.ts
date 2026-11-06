import {queueImage} from '../../core/image-loading';

const enhancedUrl = new URL('./assets/rainy-alley-background-clean.enhanced-v1.lossless.webp', import.meta.url).href;
let enhanced: HTMLImageElement | undefined;
let decoded = false;

/** Show the approved entry image immediately, then swap only after enhancement decode. */
export function alleyDisplayArtwork(original: HTMLImageElement): HTMLImageElement {
  if (!original.complete || !original.naturalWidth) return original;
  if (!enhanced) {
    enhanced = new Image();
    enhanced.decoding = 'async';enhanced.fetchPriority = 'low';
    const candidate = enhanced;
    void queueImage(candidate, enhancedUrl).then(() => candidate.decode()).then(() => {decoded = true;}).catch(() => {
      // The original remains playable if the optional enhancement cannot load.
    });
  }
  return decoded ? enhanced : original;
}
