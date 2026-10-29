export function explorationFooterText(phase:string,mapId:string,tutorialText:string|undefined,objectiveText:string) {
  if(phase==='explore'&&mapId==='market')return objectiveText;
  return tutorialText;
}
