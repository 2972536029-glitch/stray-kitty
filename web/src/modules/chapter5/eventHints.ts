type HintState={phase:string;mapId:string;flags:readonly string[];drawnEvents?:readonly string[]};

// A local, optional reminder. It never changes battle eligibility or reveals a
// random card, and disappears once both upper-floor investigations are complete.
export function warehouseOptionalInvestigationHint(state:HintState,nearbyId?:string){
  return state.phase==='explore'&&state.mapId==='warehouse'&&nearbyId==='finale_boss'
    &&!state.flags.includes('finale_boss_victory')
    &&['warehouse_lookout','warehouse_light_crate'].some(id=>!state.drawnEvents?.includes('node:'+id))
    ?'可选：货架高处还有未调查的线索，开战前可以先去看看。':null;
}
