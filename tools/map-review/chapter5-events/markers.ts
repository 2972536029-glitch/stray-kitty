import {warehouseOptionalInvestigationHint} from '../../../web/src/modules/chapter5/eventHints';
import type {MarkerState} from '../../../web/src/modules/chapter5/eventMarkers';
export {WarehouseEventMarkers as WarehouseMarkerPreview,fixedPoints,names,type Point,type Floor,type MarkerState} from '../../../web/src/modules/chapter5/eventMarkers';
export function optionalInvestigationHint(state:MarkerState){
  return warehouseOptionalInvestigationHint({phase:state.floor==='L0'?'explore':'',mapId:'warehouse',flags:[...state.flags],drawnEvents:[...state.drawn]},state.near?.id);
}
