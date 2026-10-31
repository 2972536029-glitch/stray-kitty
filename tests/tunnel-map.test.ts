import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import map from '../level_design/chapter4/data/chapter4.map.json';
import {tunnelConnections, tunnelPortalDisplay} from '../web/src/modules/chapter4/navigation';
import {raisedRidgeMask, tankRidgeMask, tunnelClimbSurface, tunnelGroundMask, tunnelSurfaceConnections} from '../web/src/modules/chapter4/surfaces';
import {nearbyLockedTunnelEvent,tunnelMovementChoices,type TunnelMarkerState} from '../web/src/modules/chapter4/eventMarkers';

test('valve E approach stays clear of C/Space activation and keeps prerequisite feedback',()=>{
  const valve=map.events.find(e=>e.id==='tunnel_valve_three')!;
  for(const id of ['ridge-climb','west-ridge-east-descent','south-spillway-jump']) {
    const portal=map.portals.find(p=>p.id===id)!;
    const point=id==='south-spillway-jump'?portal.b:portal.a;
    assert.ok(Math.hypot(point.x-valve.x,point.y-valve.y)>56+portal.reach,`${id} must not overlap valve E`);
  }
  const state:TunnelMarkerState={floor:'L0',surface:'ground',position:valve,flags:[],drawnEvents:[],nearTarget:null,connections:tunnelSurfaceConnections('L0','ground',tunnelConnections('L0',valve))};
  assert.equal(nearbyLockedTunnelEvent(state)?.id,valve.id);
  assert.equal(tunnelMovementChoices(state).eventFocus,true);
  assert.equal(tunnelMovementChoices(state).labeled,undefined);
  state.flags=['tunnel_false_kitten_trap_found'];state.nearTarget={id:valve.id,label:valve.label};
  assert.equal(nearbyLockedTunnelEvent(state),undefined);
  assert.equal(tunnelMovementChoices(state).eventFocus,true);
});

test('tunnel movement prompts match their usable endpoint and Chapter 2 proximity/opacity',()=>{
  const flags=['tunnel_false_kitten_trap_found'];
  const ridge=map.portals.find(value=>value.id==='ridge-climb')!;
  const reverse=tunnelConnections('L0',ridge.b).find(value=>value.portal.id==='ridge-climb')!;
  assert.deepEqual(reverse.from,ridge.b);
  assert.deepEqual(reverse.to,ridge.a);
  assert.match(tunnelPortalDisplay(reverse,flags).label,/返回下方/);
  const stairs=tunnelConnections('L0',{x:320,y:422})[0];
  assert.equal(stairs.portal.id,'e1');
  assert.deepEqual([tunnelPortalDisplay(stairs,[]).locked,tunnelPortalDisplay(stairs,flags).active],[true,true]);
  assert.match(tunnelPortalDisplay(stairs,[]).label,/F · 下至.*先调查/);
  const far=tunnelConnections('L0',{x:845,y:135}).find(value=>value.portal.id==='tank-climb')!;
  assert.equal(tunnelPortalDisplay(far,flags).visible,false);
  assert.equal(tunnelPortalDisplay(stairs,flags).alpha,1);
  assert.equal(tunnelPortalDisplay({...stairs,distance:130},flags).alpha,.22);
});

function decodeGrayPng(path:string) {
  const bytes=readFileSync(path); let offset=8,width=0,height=0,bitDepth=0,colorType=0; const chunks:Buffer[]=[];
  while(offset<bytes.length) {
    const length=bytes.readUInt32BE(offset); const type=bytes.toString('ascii',offset+4,offset+8); const data=bytes.subarray(offset+8,offset+8+length); offset+=12+length;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];}
    if(type==='IDAT')chunks.push(data);
    if(type==='IEND')break;
  }
  assert.equal(bitDepth,8); assert.equal(colorType,0,'collision mask must remain 8-bit grayscale');
  const packed=inflateSync(Buffer.concat(chunks)); const pixels=new Uint8Array(width*height); let input=0;
  for(let y=0;y<height;y++) {
    const filter=packed[input++]; const row=y*width;
    for(let x=0;x<width;x++) {
      const raw=packed[input++], left=x?pixels[row+x-1]:0, up=y?pixels[row-width+x]:0, upperLeft=y&&x?pixels[row-width+x-1]:0;
      let value=raw;
      if(filter===1)value=(raw+left)&255;
      else if(filter===2)value=(raw+up)&255;
      else if(filter===3)value=(raw+Math.floor((left+up)/2))&255;
      else if(filter===4){const p=left+up-upperLeft,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-upperLeft);value=(raw+(pa<=pb&&pa<=pc?left:pb<=pc?up:upperLeft))&255;}
      else assert.equal(filter,0);
      pixels[row+x]=value;
    }
  }
  return tunnelGroundMask(path.includes('Lminus1')?'Lm1':'L0',width,height,pixels);
}

const mask=(file:string)=>decodeGrayPng(fileURLToPath(new URL(`../level_design/chapter4/collision/${file}`,import.meta.url)));

test('production surfaces admit the authored spawn and all C/F/Space connector landings',()=>{
  const l0=mask('chapter4_L0_walkable.png'),lm1=mask('chapter4_Lminus1_walkable.png');
  assert.deepEqual([l0.width,l0.height],[map.world.width,map.world.height]);
  assert.deepEqual([lm1.width,lm1.height],[map.world.width,map.world.height]);
  assert.equal(l0.isWalkable({x:845,y:135}),true);
  for(const connector of map.portals) for(const point of [connector.a,connector.b]) {
    const raised=tunnelClimbSurface(connector.id);
    const field=raised&&point===connector.b?raisedRidgeMask(raised,map.world.width,map.world.height):point.layer==='L0'?l0:lm1;
    assert.equal(field.isWalkable(point),true,`${connector.id} ${point.layer} landing`);
    let moved=false;
    for(const [x,y] of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,3],[3,-3],[-3,-3]]) {
      const result=field.move(point,{x,y}); assert.equal(field.isWalkable(result.position),true,`${connector.id} movement left valid ground`);
      if(Math.hypot(result.position.x-point.x,result.position.y-point.y)>1)moved=true;
    }
    assert.equal(moved,true,`${connector.id} landing has no continued movement`);
  }
});

test('all raised ridge boundaries block ground entry and the east C descends to the lower walkway',()=>{
  const ground=mask('chapter4_L0_walkable.png'),ridge=raisedRidgeMask('south-ridge',map.world.width,map.world.height);
  const west=map.portals.find(p=>p.id==='ridge-climb')!,east=map.portals.find(p=>p.id==='niche-climb')!;
  for(const point of [west.b,east.b,{x:1125,y:650},{x:990,y:660},{x:1045,y:740}]) {
    assert.equal(ground.isWalkable(point),false,'a raised edge cannot be entered by ordinary walking');
    assert.ok(ridge.isWalkable(point),'the same stone top is usable after C');
  }
  let cursor={...west.b};
  for(const target of [{x:940,y:588},{x:1125,y:588},{x:1125,y:735},east.b]) {
    for(let i=0;i<250&&Math.hypot(target.x-cursor.x,target.y-cursor.y)>2;i++) {
      const dx=target.x-cursor.x,dy=target.y-cursor.y,length=Math.hypot(dx,dy);
      cursor=ridge.move(cursor,{x:dx/length*2,y:dy/length*2}).position;
    }
    assert.ok(Math.hypot(cursor.x-target.x,cursor.y-target.y)<=2,`ridge walk stalled ${JSON.stringify(cursor)}`);
  }
  const down=tunnelSurfaceConnections('L0','south-ridge',tunnelConnections('L0',east.b))[0];
  assert.equal(down.portal.id,'niche-climb');assert.deepEqual(down.to,{x:1175,y:785,layer:'L0'});
  assert.ok(ground.isWalkable(down.to),'C must land on the lower paved walkway');
  assert.equal(ridge.isWalkable(down.to),false);
});

test('lower bridge admits leftward movement and tank climb stays on its separate stone ridge',()=>{
  const ground=mask('chapter4_L0_walkable.png'),lower=mask('chapter4_Lminus1_walkable.png');
  let cursor={x:1150,y:455};
  assert.ok(lower.isWalkable(cursor),'east approach is valid ground');
  for(let i=0;i<90;i++) cursor=lower.move(cursor,{x:-2,y:0}).position;
  assert.ok(cursor.x<1050,`lower bridge left stalled at ${JSON.stringify(cursor)}`);
  assert.equal(lower.isWalkable({x:1100,y:430}),false,'water north of the bridge stays blocked');
  cursor={x:545,y:570};
  for(let i=0;i<80;i++) cursor=ground.move(cursor,{x:2,y:0}).position;
  assert.ok(cursor.x<568,'ground shortcut right of the climb must stay blocked');
  const ridge=tankRidgeMask(map.world.width,map.world.height),climb=map.portals.find(p=>p.id==='tank-climb')!;
  assert.ok(ridge.isWalkable(climb.b));
  assert.equal(ground.isWalkable(climb.b),false,'ridge cannot be reached by ordinary ground walking');
  cursor={...climb.b};
  for(const target of [{x:630,y:444},{x:646,y:444},{x:670,y:463},{x:800,y:463}]) {
    for(let frame=0;frame<100&&Math.hypot(target.x-cursor.x,target.y-cursor.y)>2;frame++) {
      const dx=target.x-cursor.x,dy=target.y-cursor.y,length=Math.hypot(dx,dy);
      cursor=ridge.move(cursor,{x:dx/length*2,y:dy/length*2}).position;
    }
    assert.ok(Math.hypot(cursor.x-target.x,cursor.y-target.y)<=2,`ridge route stalled at ${JSON.stringify(cursor)}`);
  }
  for(const point of [{x:578,y:490},{x:650,y:520},{x:750,y:500}]) assert.equal(ridge.isWalkable(point),false,'only the stone top is walkable');
  const down=tunnelSurfaceConnections('L0','tank-ridge',tunnelConnections('L0',climb.b));
  assert.deepEqual(down[0].to,climb.a);
});

test('both requested ledge descents have valid road landings and nearby C prompts',()=>{
  const ground=mask('chapter4_L0_walkable.png');
  for(const id of ['tank-east-descent','west-ridge-climb','west-ridge-east-descent']) {
    const portal=map.portals.find(p=>p.id===id)!,surface=tunnelClimbSurface(id)!;
    assert.ok(raisedRidgeMask(surface,map.world.width,map.world.height).isWalkable(portal.b),`${id} stone top`);
    assert.ok(ground.isWalkable(portal.a),`${id} road landing`);
    assert.equal(ground.isWalkable(portal.b),false,`${id} still requires C`);
    const down=tunnelSurfaceConnections('L0',surface,tunnelConnections('L0',portal.b))[0];
    assert.equal(down.portal.id,id);assert.deepEqual(down.to,portal.a);
    const display=tunnelPortalDisplay(down,[]);
    assert.equal(display.active,true);assert.match(display.label,/C · 返回下方通道/);
    const up=tunnelSurfaceConnections('L0','ground',tunnelConnections('L0',portal.a)).find(c=>c.portal.id===id)!;
    assert.match(tunnelPortalDisplay(up,[]).label,/攀上平台/);
  }
});

test('reported water gaps reject walking and the west stone step follows a held left key',()=>{
  const ground=mask('chapter4_L0_walkable.png');
  for(const point of [{x:900,y:430},{x:900,y:450},{x:1045,y:195},{x:1085,y:220}]) {
    assert.equal(ground.isWalkable(point),false,`water must be blocked at ${JSON.stringify(point)}`);
  }
  assert.ok(ground.isWalkable({x:900,y:480}),'the painted bridge deck remains available');
  const jump=map.portals.find(p=>p.id==='upper-gap-jump')!;
  assert.ok(ground.isWalkable(jump.a));assert.ok(ground.isWalkable(jump.b));
  const fromLeft=ground.move(jump.a,{x:220,y:0}).position;
  const fromRight=ground.move(jump.b,{x:-220,y:0}).position;
  assert.ok(fromLeft.x<994);assert.ok(fromRight.x>1114);
  const ridge=raisedRidgeMask('west-ridge',map.world.width,map.world.height);
  let cursor={x:500,y:715};assert.ok(ridge.isWalkable(cursor));
  for(let i=0;i<60;i++)cursor=ridge.move(cursor,{x:-2,y:0}).position;
  assert.ok(cursor.x<460,`west ridge left stalled at ${JSON.stringify(cursor)}`);
  assert.ok(ridge.isWalkable(cursor));
});

test('normal diagonal and sustained frame movement remains on walkable ground on both floors',()=>{
  const fields={L0:mask('chapter4_L0_walkable.png'),Lm1:mask('chapter4_Lminus1_walkable.png')};
  for(const floor of ['L0','Lm1'] as const) {
    const field=fields[floor]; let checked=0;
    for(let y=12;y<map.world.height-12;y+=12) for(let x=12;x<map.world.width-12;x+=12) {
      const start={x,y}; if(!field.isWalkable(start))continue; checked++;
      for(const delta of [{x:3,y:0},{x:-3,y:0},{x:0,y:3},{x:0,y:-3},{x:2.12,y:2.12},{x:-2.12,y:2.12},{x:2.12,y:-2.12},{x:-2.12,y:-2.12}]) {
        const result=field.move(start,delta); assert.equal(field.isWalkable(result.position),true,`${floor} ${x},${y} left valid ground`);
      }
    }
    assert.ok(checked>100,`${floor} sampled surface coverage`);
    let cursor=floor==='L0'?{x:845,y:135}:{x:160,y:195};
    for(let frame=0;frame<120;frame++) {
      const result=field.move(cursor,{x:1.4,y:.7}); cursor=result.position;
      assert.equal(field.isWalkable(cursor),true,`${floor} sustained movement frame ${frame}`);
    }
  }
});

test('reported bridge and Momo corners allow cardinal movement; lower jump starts on the bank',()=>{
  const l0=mask('chapter4_L0_walkable.png'),lower=mask('chapter4_Lminus1_walkable.png');
  let cursor={x:600,y:280};
  assert.equal(l0.isWalkable(cursor),true);
  for(let frame=0;frame<60;frame++) cursor=l0.move(cursor,{x:-2,y:0}).position;
  assert.ok(cursor.x<510,`bridge left stalled at ${JSON.stringify(cursor)}`);
  cursor={x:328,y:720};
  for(let frame=0;frame<35;frame++) cursor=l0.move(cursor,{x:2,y:0}).position;
  assert.ok(cursor.x>380,`Momo right stalled at ${JSON.stringify(cursor)}`);
  cursor={x:328,y:720};
  for(let frame=0;frame<35;frame++) cursor=l0.move(cursor,{x:0,y:2}).position;
  assert.ok(cursor.y>760,`Momo down stalled at ${JSON.stringify(cursor)}`);
  const connection=tunnelConnections('Lm1',{x:310,y:440}).find(value=>value.portal.id==='lm1-waterfall-jump')!;
  assert.ok(connection.distance<connection.portal.reach,'Space prompt must be usable from the left bank');
  assert.ok(lower.isWalkable(connection.from));
  assert.ok(lower.isWalkable(connection.to));
});

test('movement slides along the real mask edge and rejects a blocked normal step',()=>{
  const field=mask('chapter4_L0_walkable.png'); let sample: {x:number;y:number}|undefined; let blocked={x:0,y:0};
  outer: for(let y=12;y<map.world.height-12;y+=2) for(let x=12;x<map.world.width-12;x+=2) {
    const start={x,y}; if(!field.isWalkable(start))continue;
    for(const delta of [{x:8,y:0},{x:-8,y:0},{x:0,y:8},{x:0,y:-8}]) {
      if(!field.isWalkable({x:x+delta.x,y:y+delta.y})) {sample=start;blocked=delta;break outer;}
    }
  }
  assert.ok(sample,'expected an obstacle edge in approved mask');
  const rejected=field.move(sample,blocked); assert.equal(field.isWalkable(rejected.position),true); assert.ok(Math.hypot(rejected.position.x-sample.x,rejected.position.y-sample.y)<Math.hypot(blocked.x,blocked.y));
  const slide=field.move(sample,{x:blocked.x+ (blocked.y===0?0:8),y:blocked.y+ (blocked.x===0?0:8)});
  assert.equal(field.isWalkable(slide.position),true);
});
