export function explorationFooterText(phase:string,mapId:string,tutorialText:string|undefined,objectiveText:string) {
  if(phase==='explore'&&mapId==='market')return objectiveText;
  if(phase==='explore'&&mapId==='warehouse')return 'WASD / 方向键移动 · 靠近标记按 E · C 上下货架。点亮入口与东侧灯可打开捷径；抵达北侧首领后守住防线，再前往隔间出口。';
  return tutorialText;
}
