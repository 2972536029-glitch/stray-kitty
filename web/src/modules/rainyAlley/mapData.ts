import geometrySource from '../../../../level_design/rainy_alley/source/geometry.json';
import objectsSource from '../../../../level_design/rainy_alley/source/level_objects.json';

export interface RainyFixedObject {
  id: string; label: string; kind: 'inspection' | 'node_event' | 'pickup_proposed' | 'story';
  x: number; y: number; text?: string; eventId?: string; storyNodeId?: string; requiresFlag?: string; once?: boolean;
}

export interface RainyZone {id: string; x: number; y: number; r: number}
export interface RainyMapObjects {interactionRadius: number; fixed: RainyFixedObject[]; zones: RainyZone[]}

export const rainyAlleyMapData = {
  geometry: geometrySource,
  objects: objectsSource as RainyMapObjects
};
