import {rainyAlleyMapData} from './mapData';
import type {RainyFixedObject} from './mapData';
export type {RainyFixedObject, RainyZone} from './mapData';
import backgroundUrl from '../../../../level_design/rainy_alley/art/rainy_alley_background.png';
import doorwayUrl from '../../../../level_design/rainy_alley/art/doorway_foreground.svg';

export const rainyAlleySource = {
  ...rainyAlleyMapData,
  backgroundUrl,
  doorwayUrl
};

export const rainyAlleyObject = (id: string) => rainyAlleySource.objects.fixed.find(object => object.id === id);

export function rainyAlleyObjectEligible(object: RainyFixedObject, flags: readonly string[]) {
  if (object.requiresFlag && !flags.includes(object.requiresFlag)) return false;
  if (object.id === 'alley_crate' && flags.includes('alley_rescued')) return false;
  if (object.id === 'alley_fish_dry' && flags.includes('alley_fish_collected')) return false;
  if (object.id === 'alley_poster' && flags.includes('lost_poster_found')) return false;
  if (object.id === 'alley_blanket_stack' && ['blanket_secured', 'blanket_half', 'blanket_lost'].some(flag => flags.includes(flag))) return false;
  return true;
}

// Locked v1.2.1 registration. Background stays in native image space while every
// gameplay-space element uses this single transform.
export const rainyAlleyRegistration = (() => {
  const worldWidth = rainyAlleyMapData.geometry.coordinate_space.width;
  const worldHeight = rainyAlleyMapData.geometry.coordinate_space.height;
  const [artWidth, artHeight] = rainyAlleyMapData.geometry.future_art_registration.approved_png_dimensions;
  return {worldWidth, worldHeight, artWidth, artHeight, sx: 1.425, sy: 1.345, tx: -51, ty: -83};
})();
