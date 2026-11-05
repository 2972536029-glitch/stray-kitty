import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ChapterBattleViewport} from '../../web/src/modules/battle/chapter/ChapterBattleViewport';
import {MarketBattleViewport} from '../../web/src/modules/battle/market/MarketBattleViewport';
import {GreenhouseBattleViewport} from '../../web/src/modules/battle/greenhouse/GreenhouseBattleViewport';
import {TunnelBattleViewport} from '../../web/src/modules/battle/tunnel/TunnelBattleViewport';
import {FinaleBattleViewport} from '../../web/src/modules/battle/finale/FinaleBattleViewport';
import {BattleViewport} from '../../web/src/modules/battle/l00/BattleViewport';
import '../../web/src/ui/styles.css';
import '../../web/src/ui/theme-cozy.css';
import '../../web/src/ui/layout-viewport.css';
import '../../web/src/ui/layout-battle.css';
import '../../web/src/ui/mobile-landscape.css';
import '../../web/src/modules/battle/immersive.css';

// Actual UI + original engine factories. No API, persistent save, or engine transform.
const views={chapter:ChapterBattleViewport,market:MarketBattleViewport,greenhouse:GreenhouseBattleViewport,tunnel:TunnelBattleViewport,finale:FinaleBattleViewport};
type Chapter=keyof typeof views|'l00';
const root=createRoot(document.getElementById('root')!);
let chapter:Chapter='chapter',attempt=0,paused=false;
const results:unknown[]=[];
function render(){
  const onResult=(result:unknown)=>{results.push(result);};
  if(chapter==='l00'){
    flushSync(()=>root.render(createElement(BattleViewport,{key:`l00-${attempt}`,context:{attempt:{id:`drag-l00-${attempt}`,stageId:'alley_rescue',status:'active'},stage:{id:'alley_rescue',name:'序章',status:'ready',lanes:3,columns:7,waves:6},catIds:['miaomiao'],modifiers:[]},paused,onResult})));
  }else{
    const View=views[chapter];
    flushSync(()=>root.render(createElement(View,{attemptId:`drag-${chapter}-${attempt}`,difficulty:'medium',paused,onResult})));
  }
}
const fixture={open(value:Chapter){chapter=value;attempt++;paused=false;render();},retry(){attempt++;render();},setPaused(value:boolean){paused=value;render();},diagnostics(){return {chapter,attempt,paused,results};}};
(window as unknown as {battleDragFixture:typeof fixture}).battleDragFixture=fixture;
if(new URLSearchParams(location.search).has('controls')){
  const toolbar=document.createElement('nav');toolbar.setAttribute('aria-label','本地战斗演示');
  toolbar.innerHTML='<strong>本地战斗体验</strong><select aria-label="选择章节"><option value="chapter">第一章 · 小巷</option><option value="market">第二章 · 夜市</option><option value="greenhouse">第三章 · 温室</option><option value="tunnel">第四章 · 通道</option><option value="finale">第五章 · 仓库</option><option value="l00">序章 · 教学</option></select><button type="button">重新开始</button><span>可直接拖动猫咪 · 不修改游戏存档</span>';
  Object.assign(toolbar.style,{height:'54px',display:'flex',alignItems:'center',gap:'14px',padding:'0 16px',background:'#152925',color:'#f0e8ca',fontFamily:'Microsoft YaHei,sans-serif',fontSize:'13px',overflowX:'auto',whiteSpace:'nowrap'});
  toolbar.querySelector('select')!.onchange=event=>fixture.open((event.target as HTMLSelectElement).value as Chapter);
  toolbar.querySelector('button')!.onclick=()=>fixture.retry();
  document.getElementById('root')!.style.height='calc(100vh - 54px)';document.body.prepend(toolbar);
}
render();
