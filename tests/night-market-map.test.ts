import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMarketSolid, isMarketTraversable, marketArt, marketEntry, marketItems, marketPortals, marketRoadSigns, nearestMarketRoadSign, marketEAction, marketOptionalHint, marketPortalDisplay, nearestMarketPosition, nightMarketSpatial, onMarketRoute, sweepMarketMove} from '../web/src/modules/nightMarket/map';

test('Night Market keeps the approved native coordinate frame and three exact art assets',()=>{
  assert.deepEqual(nightMarketSpatial.coordinate_space,{width:1672,height:941,origin:'top-left',axis_x:'right',axis_y:'down',units:'native artwork pixels'});
  assert.equal(Object.keys(marketArt).length,3);
  assert.ok(marketArt.L0.endsWith('night_market_L0_streets_1672x941.png'));
});
test('authored routes and L0 collision geometry are layer-specific',()=>{
  assert.equal(onMarketRoute('L0',670,786),true);
  assert.equal(onMarketRoute('L1',1310,426),true);
  assert.equal(onMarketRoute('Lm1',975,429),true);
  assert.equal(onMarketRoute('L1',670,786),false);
  assert.equal(isMarketSolid('L0',580,520),true);
  assert.equal(isMarketSolid('L1',580,520),false);
});
test('market boss is an explicit E action gated by both clues and the authored approach',()=>{
  assert.deepEqual(marketEntry,{floor:'L0',x:670,y:781});
  assert.notDeepEqual(marketEntry,{floor:'L0',x:1310,y:169});
  assert.equal(marketEAction('L0',1310,169,[],[])?.type,'hint');
  assert.equal(marketEAction('L0',1310,169,['market_crow_clue_completed'],[])?.type,'hint');
  assert.deepEqual(marketEAction('L0',1310,169,['market_crow_clue_completed','market_pigeon_clue_completed'],[]),{type:'battle'});
  assert.equal(marketEAction('L0',670,781,['market_crow_clue_completed','market_pigeon_clue_completed'],[]),null);
  assert.equal(marketEAction('L1',1310,169,['market_crow_clue_completed','market_pigeon_clue_completed'],[]),null);
  assert.equal(marketEAction('L0',1310,169,['market_crow_clue_completed','market_pigeon_clue_completed','market_cleared'],[])?.type,'hint');
});

test('all authored market waypoints connect through footprint-safe routes and intended portals',()=>{
  const step=4,cols=Math.ceil(1672/step),rows=Math.ceil(941/step),floors=['L0','L1','Lm1'] as const;
  const id=(f:number,x:number,y:number)=>f*cols*rows+Math.floor(y/step)*cols+Math.floor(x/step);
  const point=(n:number)=>{const f=Math.floor(n/(cols*rows)),cell=n%(cols*rows);return {floor:floors[f],x:(cell%cols)*step+step/2,y:Math.floor(cell/cols)*step+step/2};};
  const nearest=(floor:typeof floors[number],x:number,y:number)=>{let best:number|undefined,d=Infinity;for(let yy=Math.max(0,y-24);yy<=Math.min(941,y+24);yy+=step)for(let xx=Math.max(0,x-24);xx<=Math.min(1672,x+24);xx+=step)if(isMarketTraversable(floor,xx,yy,true)){const dist=Math.hypot(xx-x,yy-y);if(dist<d){d=dist;best=id(floors.indexOf(floor),xx,yy);}}return best;};
  const start=nearest('L0',marketEntry.x,marketEntry.y);assert.notEqual(start,undefined,'entry must clear its own footprint');
  const queue=[start!],seen=new Set(queue),dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let head=0;head<queue.length;head++){
    const current=point(queue[head]);
    for(const [dx,dy] of dirs){const x=current.x+dx*step,y=current.y+dy*step;if(!isMarketTraversable(current.floor,x,y,true))continue;if(dx&&dy&&(!isMarketTraversable(current.floor,current.x+dx*step,current.y,true)||!isMarketTraversable(current.floor,current.x,current.y+dy*step,true)))continue;const next=id(floors.indexOf(current.floor),x,y);if(!seen.has(next)){seen.add(next);queue.push(next);}}
    for(const portal of marketPortals){const ends=[portal.a,portal.b];const from=ends.findIndex(p=>p.layer===current.floor&&Math.hypot(p.x-current.x,p.y-current.y)<=step*1.5);if(from<0)continue;const target=ends[1-from],landing=nearest(target.layer,target.x,target.y);if(landing!==undefined&&!seen.has(landing)){seen.add(landing);queue.push(landing);}}
  }
  for(const item of marketItems.filter(v=>['crow','pigeon','momo','boss','exit'].includes(v.id))){assert.notEqual(nearest(item.layer,item.x,item.y),undefined,`${item.id} has footprint-safe interaction access`);assert.ok(seen.has(nearest(item.layer,item.x,item.y)!),`${item.id} is reachable from the south entry`);}
  for(const portal of marketPortals){for(const end of [portal.a,portal.b]){assert.notEqual(nearest(end.layer,end.x,end.y),undefined,`${portal.id} approach has clearance`);assert.ok(seen.has(nearest(end.layer,end.x,end.y)!),`${portal.id} approach is reachable`);}}
});

test('market movement sweeps across frame steps, slides at obstacle edges, and blocks buildings',()=>{
  const start={x:670,y:781};assert.equal(isMarketTraversable('L0',start.x,start.y),true);
  const moved=sweepMarketMove('L0',start,{x:0,y:-60});assert.ok(moved.position.y<start.y-40,'long movement should advance in small collision-tested steps');
  assert.equal(isMarketTraversable('L0',580,520),false,'building interior remains blocked for the whole cat footprint');
  assert.equal(isMarketTraversable('L0',900,350),false,'the central market building remains solid inside its walkable surface envelope');
  assert.equal(isMarketTraversable('L0',536,481),true,'a diagonal cat footprint may pass a building corner when its circular clearance remains open');
  const blocked=sweepMarketMove('L0',start,{x:40,y:-15});assert.equal(blocked.blocked,true);assert.ok(blocked.position.x>start.x||blocked.position.y<start.y,'movement should slide along a route boundary when an axis is clear');
  assert.match(blocked.condition??'/',/solid|street surface|obstacle|barricade/);
  assert.ok(blocked.blockedAt,'diagnostics retain the first rejected world position');
  const corner=sweepMarketMove('L0',{x:532,y:480},{x:20,y:12});
  assert.equal(corner.blocked,true,'a diagonal approach into the plaza building is rejected');
  assert.ok(corner.position.x>532&&corner.position.y>480,'the cat slides along the genuine building edge instead of getting stuck');
});

test('actual swept movement works both ways across seven L0 streets and across their usable width',()=>{
  const corridors=[
    {name:'northward continuous street',x:760,y:370,dx:0,dy:-1},
    {name:'south through central market',x:1035,y:350,dx:0,dy:1},
    {name:'west around plaza connector',x:700,y:500,dx:-1,dy:0},
    {name:'south through eastern junction',x:1150,y:375,dx:0,dy:1},
    {name:'south outer market road',x:1204,y:590,dx:0,dy:1},
    {name:'south entrance street',x:670,y:743,dx:0,dy:1},
    {name:'battle approach street',x:1310,y:169,dx:0,dy:1},
  ];
  for(const road of corridors)for(const offset of [-15,0,15]){
    const start={x:road.x+(road.dy?offset:0),y:road.y+(road.dx?offset:0)};
    assert.equal(isMarketTraversable('L0',start.x,start.y),true,`${road.name} offset ${offset} belongs to the cat-safe street union`);
    for(const sign of [-1,1]){
      const result=sweepMarketMove('L0',start,{x:road.dx*sign*12,y:road.dy*sign*12});
      assert.equal(result.blocked,false,`${road.name} offset ${offset} direction ${sign} must not hit an artificial ribbon edge`);
      assert.ok(Math.hypot(result.position.x-start.x,result.position.y-start.y)>10,`${road.name} should advance the cat`);
    }
  }
  const cameraIndependent=sweepMarketMove('L0',{x:1150,y:375},{x:0,y:12});
  assert.deepEqual(cameraIndependent.position,{x:1150,y:387},'world collision results do not depend on camera projection');
});

test('reported stair, cargo, southeast and central-east roads allow direct swept travel',()=>{
  const traverse=(name:string,start:{x:number;y:number},delta:{x:number;y:number})=>{
    assert.equal(isMarketTraversable('L0',start.x,start.y),true,`${name} start has full cat clearance`);
    const moved=sweepMarketMove('L0',start,delta);
    assert.equal(moved.blocked,false,`${name} direct road is continuously walkable`);
    assert.ok(Math.hypot(moved.position.x-start.x,moved.position.y-start.y)>=Math.hypot(delta.x,delta.y)-2,`${name} advances without a hidden wall`);
    const back=sweepMarketMove('L0',moved.position,{x:-delta.x,y:-delta.y});
    assert.equal(back.blocked,false,`${name} reverse road is continuously walkable`);
    assert.ok(Math.hypot(back.position.x-start.x,back.position.y-start.y)<2,`${name} returns to its origin`);
  };
  traverse('western underground stair road',{x:669,y:680},{x:0,y:24});
  traverse('southeastern street downward',{x:1204,y:617},{x:0,y:26});
  traverse('southeastern street to the right',{x:1204,y:617},{x:24,y:0});
  traverse('central/eastern junction upward',{x:1150,y:375},{x:0,y:-24});
  const junctions=[{name:'west underground stairs',point:{x:669,y:674}},{name:'southeast street',point:{x:1204,y:617}},{name:'central/east junction',point:{x:1150,y:375}}];
  for(const junction of junctions)for(const direction of [{x:12,y:0},{x:-12,y:0},{x:0,y:12},{x:0,y:-12}]){
    const moved=sweepMarketMove('L0',junction.point,direction);
    assert.equal(moved.blocked,false,`${junction.name} cardinal movement ${direction.x},${direction.y} stays on the walkable surface`);
    assert.ok(Math.hypot(moved.position.x-junction.point.x,moved.position.y-junction.point.y)>10,`${junction.name} advances in each cardinal direction`);
  }
  const westOfCrate={x:875,y:710},eastOfCrate={x:919,y:710};
  assert.equal(isMarketTraversable('L0',westOfCrate.x,westOfCrate.y),true,'southern crate approach is walkable');
  assert.equal(isMarketTraversable('L0',eastOfCrate.x,eastOfCrate.y),true,'crate landing side is walkable');
  assert.equal(sweepMarketMove('L0',westOfCrate,{x:eastOfCrate.x-westOfCrate.x,y:0}).blocked,true,'the cargo obstacle cannot be crossed by ordinary walking');
  assert.ok(nearestMarketPosition('L0',859,717,true),'the authored C approach has valid cat clearance');
  assert.ok(nearestMarketPosition('L0',937,727,true),'the authored C landing has valid cat clearance');
});

test('repositioned crow can be approached from every accessible direction',()=>{
  const crow=marketItems.find(item=>item.id==='crow')!,directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;let reachable=0;
  for(const [dx,dy] of directions){const length=Math.hypot(dx,dy),start={x:crow.x-dx/length*28,y:crow.y-dy/length*28};if(!isMarketTraversable('L0',start.x,start.y))continue;reachable++;const result=sweepMarketMove('L0',start,{x:dx/length*8,y:dy/length*8});assert.ok(Math.hypot(result.position.x-crow.x,result.position.y-crow.y)<Math.hypot(start.x-crow.x,start.y-crow.y),`approach from ${dx},${dy} should make progress`);}
  assert.ok(reachable>=3,`expected multiple accessible approaches, got ${reachable}`);
});

test('portal landings have valid cat clearance and fixed markers exclude random zones',()=>{
  const southeast=marketPortals.find(portal=>portal.id==='se')!;
  assert.equal(isMarketTraversable(southeast.a.layer,southeast.a.x,southeast.a.y,true),false,'authored southeast approach sits too close to obstacle for the cat footprint');
  const landing=nearestMarketPosition(southeast.a.layer,southeast.a.x,southeast.a.y,true);
  assert.ok(landing);assert.ok(Math.hypot(landing.x-southeast.a.x,landing.y-southeast.a.y)<=48);assert.equal(isMarketTraversable(southeast.a.layer,landing.x,landing.y,true),true);
  const visibleFixed=marketItems.filter(item=>['crow','pigeon','momo','boss','exit'].includes(item.id));
  assert.deepEqual(visibleFixed.map(item=>item.id),['crow','pigeon','momo','boss','exit']);
  assert.ok(visibleFixed.some(item=>item.id==='crow'&&item.layer==='L0'));
  assert.ok(visibleFixed.some(item=>item.id==='pigeon'&&item.layer==='L1'));
  assert.ok(!visibleFixed.some(item=>item.kind==='random'));
});

test('crow and optional Momo events are reachable, floor-correct and E-selectable',()=>{
  const crow=marketItems.find(item=>item.id==='crow')!,momo=marketItems.find(item=>item.id==='momo')!;
  assert.deepEqual([crow.x,crow.y,crow.layer],[910,245,'L0']);
  assert.equal(isMarketTraversable('L0',crow.x,crow.y),true);
  assert.ok(Math.hypot(crow.x-745,crow.y-287)>48,'crow does not overlap the western C point');
  assert.deepEqual(marketEAction('L0',crow.x,crow.y,[],[]),{type:'interact',id:'market_crow_stall',layer:'L0'});
  assert.equal(marketEAction('L1',crow.x,crow.y,[],[]),null);
  assert.deepEqual([momo.x,momo.y,momo.layer],[947,160,'L0']);
  assert.equal(isMarketTraversable('L0',momo.x,momo.y),true);
  assert.deepEqual(marketEAction('L0',momo.x,momo.y,['market_crow_clue_completed'],[]),{type:'interact',id:'market_momo_trace',layer:'L0'});
  assert.equal(marketEAction('L0',momo.x,momo.y,['market_crow_clue_completed'],['node:momo_trail_event'])?.type,'hint');
});

test('C and F markers follow floor, approach, active range and locked exit state',()=>{
  const exit=marketPortals.find(portal=>portal.id==='exitClimb')!,stairs=marketPortals.find(portal=>portal.id==='underpassN')!;
  assert.equal(marketPortalDisplay(exit,exit.a,'L0',exit.a.x,exit.a.y,[]) ,null);
  assert.equal(marketPortalDisplay(exit,exit.a,'L0',exit.a.x,exit.a.y,['market_cleared'])?.active,true);
  assert.equal(marketPortalDisplay(exit,exit.a,'L1',exit.a.x,exit.a.y,['market_cleared']),null);
  assert.equal(marketPortalDisplay(stairs,stairs.a,'L0',stairs.a.x+70,stairs.a.y,['market_cleared'])?.alpha,.22);
  assert.equal(marketPortalDisplay(stairs,stairs.a,'L0',stairs.a.x+10,stairs.a.y,['market_cleared'])?.label.startsWith('F · 进入'),true);
  assert.equal(marketPortalDisplay(stairs,stairs.b,'Lm1',stairs.b.x,stairs.b.y,[])?.label.startsWith('F · 返回'),true);
  assert.equal(marketPortalDisplay(exit,exit.a,'L0',exit.a.x+45,exit.a.y,['market_cleared'])?.active,false);
});

test('optional-content guidance gets more specific as the player approaches',()=>{
  const far=marketOptionalHint('L0',300,700,false),middle=marketOptionalHint('L0',650,300,false),near=marketOptionalHint('L0',800,160,false);
  assert.ok(far&&middle&&near);assert.notEqual(far,middle);assert.notEqual(middle,near);
  assert.equal(marketOptionalHint('L1',947,160,false),null);
  assert.equal(marketOptionalHint('L0',300,700,true),null);
});

test('road signs sit beside reachable paths, identify the market areas, and stay separate from gameplay triggers',()=>{
  assert.equal(marketRoadSigns.length,8);
  assert.deepEqual(new Set(marketRoadSigns.map(sign=>sign.floor)),new Set(['L0','Lm1']));
  for(const sign of marketRoadSigns){
    assert.ok(sign.id&&!marketItems.some(item=>item.id===sign.id),'sign landmarks are separate from event nodes');
    assert.ok(sign.directions.length>0&&sign.area.length>0);
    assert.equal(isMarketTraversable(sign.floor,sign.x,sign.y),false,`${sign.id} sits beside the walk lane`);
    const access=nearestMarketPosition(sign.floor,sign.x,sign.y,false,24);
    assert.ok(access,`${sign.id} is reachable from its nearby path`);
    assert.ok(Math.hypot(access!.x-sign.x,access!.y-sign.y)<=24,`${sign.id} remains close to the path`);
  }
  assert.equal(marketRoadSigns.find(sign=>sign.id==='northwest-market-junction')?.directions.includes('北街'),true,'the northern sign indirectly guides players toward Momo without exposing her marker');
  assert.equal(nearestMarketRoadSign('L0',704,748)?.sign.area,'南侧入口');
  assert.equal(nearestMarketRoadSign('Lm1',610,550)?.sign.area,'地下暗道 · 西段');
  assert.equal(nearestMarketRoadSign('L1',610,550),null);
  assert.ok(!marketRoadSigns.some(sign=>/^R[123]/.test(sign.directions)),'random zones never appear on signs');
});
