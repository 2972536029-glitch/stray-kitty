import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import map from '../level_design/chapter4/data/chapter4.map.json';
import {TunnelWalkableMask} from '../web/src/modules/chapter4/TunnelWalkableMask';

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
  return new TunnelWalkableMask(width,height,pixels);
}

const mask=(file:string)=>decodeGrayPng(fileURLToPath(new URL(`../level_design/chapter4/collision/${file}`,import.meta.url)));

test('approved raster masks admit the authored spawn and all eight C/F/Space connector landings',()=>{
  const l0=mask('chapter4_L0_walkable.png'),lm1=mask('chapter4_Lminus1_walkable.png');
  assert.deepEqual([l0.width,l0.height],[map.world.width,map.world.height]);
  assert.deepEqual([lm1.width,lm1.height],[map.world.width,map.world.height]);
  assert.equal(l0.isWalkable({x:845,y:135}),true);
  for(const connector of map.portals) for(const point of [connector.a,connector.b]) {
    const field=point.layer==='L0'?l0:lm1;
    assert.equal(field.isWalkable(point),true,`${connector.id} ${point.layer} landing`);
    let moved=false;
    for(const [x,y] of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,3],[3,-3],[-3,-3]]) {
      const result=field.move(point,{x,y}); assert.equal(field.isWalkable(result.position),true,`${connector.id} movement left valid ground`);
      if(Math.hypot(result.position.x-point.x,result.position.y-point.y)>1)moved=true;
    }
    assert.equal(moved,true,`${connector.id} landing has no continued movement`);
  }
});

test('normal diagonal and sustained frame movement remains inside the cat footprint mask on both floors',()=>{
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
