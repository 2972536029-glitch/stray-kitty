import geometrySource from '../../../../level_design/rainy_alley/source/geometry.json';
import objectsSource from '../../../../level_design/rainy_alley/source/level_objects.json';
import backgroundUrl from '../../../../level_design/rainy_alley/art/rainy_alley_background.png';

export interface RainyFixedObject {
  id: string;
  label: string;
  kind: 'inspection' | 'node_event' | 'pickup_proposed' | 'story';
  x: number;
  y: number;
  text?: string;
  eventId?: string;
  storyNodeId?: string;
  requiresFlag?: string;
  once?: boolean;
}

export interface RainyZone {id: string; x: number; y: number; r: number}

export const rainyAlleySource = {
  geometry: geometrySource,
  objects: objectsSource as {interactionRadius: number; fixed: RainyFixedObject[]; zones: RainyZone[]},
  backgroundUrl
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
  const worldWidth = geometrySource.coordinate_space.width;
  const worldHeight = geometrySource.coordinate_space.height;
  const [artWidth, artHeight] = geometrySource.future_art_registration.approved_png_dimensions;
  return {worldWidth, worldHeight, artWidth, artHeight, sx: 1.425, sy: 1.345, tx: -51, ty: -83};
})();
