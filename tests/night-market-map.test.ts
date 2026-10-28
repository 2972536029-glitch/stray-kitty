import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMarketSolid, isMarketTraversable, marketArt, marketEntry, marketItems, marketPortals, nearestMarketPosition, nightMarketSpatial, onMarketRoute, shouldTriggerMarketBoss, sweepMarketMove} from '../web/src/modules/nightMarket/map';

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
test('market boss only triggers at its authored point before the mainline clear',()=>{
  assert.deepEqual(marketEntry,{floor:'L0',x:670,y:781});
  assert.notDeepEqual(marketEntry,{floor:'L0',x:1310,y:169});
  assert.equal(shouldTriggerMarketBoss('L0',true,false,1310,169),true);
  assert.equal(shouldTriggerMarketBoss('L0',false,false,1310,169),false);
  assert.equal(shouldTriggerMarketBoss('L0',true,false,670,781),false);
  assert.equal(shouldTriggerMarketBoss('L1',true,false,1310,169),false);
  assert.equal(shouldTriggerMarketBoss('L0',true,true,1310,169),false);
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
  const blocked=sweepMarketMove('L0',start,{x:40,y:-15});assert.equal(blocked.blocked,true);assert.ok(blocked.position.x>start.x||blocked.position.y<start.y,'movement should slide along a route boundary when an axis is clear');
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
