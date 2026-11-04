import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HomeCamera} from '../web/src/modules/home/camera';
import {HOME_SIZE, HOME_SLOTS, HOME_ROAM_NODES, HOME_SHELTER_NODES} from '../web/src/modules/home/layout';
import {HOME_FRAMES, HOME_SPRITES, HOME_ATLASES, HOME_STAGE_SPRITES} from '../web/src/modules/home/assets';
import {homeObjects, homePosePoint} from '../web/src/modules/home/objects';
import {homeWalkable, homeWalkStep} from '../web/src/modules/home/navigation';
import {PARCEL_ART} from '../web/src/modules/lottery/furnitureArt';
import {FURNITURE_CATEGORIES,furnitureWidth,furnitureWidthCm} from '../web/src/modules/home/furnishings';
import {homeInventory} from '../web/src/modules/home/objects';

test('both twelve-piece collections pair real art, placeable slots and the matching original cat interaction',()=>{
  const catalog=JSON.parse(fs.readFileSync('web/content/catalog.json','utf8'));
  assert.equal(catalog.pools.length,2);
  for(const pool of catalog.pools){
    assert.equal(pool.entries.length,12);
    for(const entry of pool.entries){
      const item=catalog.furniture.find((f:{id:string})=>f.id===entry.furnitureId),meta=PARCEL_ART[entry.furnitureId as keyof typeof PARCEL_ART];
      assert.equal(meta.widthCm,item.widthCm);assert.equal(meta.cat,item.interactionCat);assert.equal(meta.pose,item.interaction);assert.equal(meta.slot,item.preferredSlot);
      assert.ok(meta.slot in HOME_SLOTS);assert.ok(fs.existsSync(`web/public/assets/home/parcels/${item.id}.png`));assert.notEqual(item.source,'story');
    }
  }
});

test('every stage and owned furnishing has one placement category and one canonical measured width',()=>{
  const furniture=JSON.parse(fs.readFileSync('web/content/home/furniture.json','utf8')) as {id:string;widthCm:number}[];
  for(const flags of [[],['greenhouse_sealed'],['greenhouse_fortified_full'],['kingdom_founded']]){
    const items=homeInventory({flags,placements:{},furniture:furniture.map(f=>f.id)});
    for(const item of items){assert.ok(item.category in FURNITURE_CATEGORIES,item.layoutKey);assert.ok(item.width>0);}
    for(const record of furniture){const item=items.find(item=>item.furnitureId===record.id)!;assert.equal(item.width,furnitureWidth(record.id));assert.equal(record.widthCm,furnitureWidthCm(record.id));}
  }
  assert.ok(furnitureWidth('willow_sofa')>furnitureWidth('seedling_stool')*2);
  assert.ok(furnitureWidth('blue_bowl')<furnitureWidth('cloud_nest'));
  assert.ok(furnitureWidth('postmark_clock')<furnitureWidth('moss_cottage'));
});

test('the full home fits phones and desktops; zoom, pan and hit projection stay inside the building',()=>{
  for(const [width,height] of [[800,480],[222,480],[800,250]]){
    const camera=new HomeCamera(),fit=camera.frame(width,height);
    assert.ok(fit.x>=-1&&fit.y>=-1);
    assert.ok(fit.x+HOME_SIZE.width*fit.scale<=width+1);
    assert.ok(fit.y+HOME_SIZE.height*fit.scale<=height+1);
    camera.changeZoom(100);camera.pan(-100000,100000,width,height);
    const view=camera.frame(width,height);
    assert.equal(camera.zoom,2.4);
    for(const point of Object.values(HOME_SLOTS)){
      const result=camera.screenToWorld({x:view.x+point.x*view.scale,y:view.y+point.y*view.scale},width,height);
      assert.ok(Math.hypot(result.x-point.x,result.y-point.y)<.001);
    }
    if(HOME_SIZE.width*view.scale>width){assert.ok(view.x<=1);assert.ok(view.x+HOME_SIZE.width*view.scale>=width-1);}
    camera.reset();assert.deepEqual(camera.frame(width,height),fit);
  }
});

test('each measured atlas crop is in bounds and cannot bleed into its neighbours',()=>{
  assert.equal(Object.keys(HOME_FRAMES).length,HOME_SPRITES.length);
  for(const [id,frame] of Object.entries(HOME_FRAMES)){
    const png=fs.readFileSync('web/public'+HOME_ATLASES[frame.sheet]);
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    assert.ok(frame.x>=0&&frame.y>=0&&frame.width>0&&frame.height>0,id);
    assert.ok(frame.x+frame.width<=width&&frame.y+frame.height<=height,id);
    for(const [otherId,other] of Object.entries(HOME_FRAMES))if(otherId!==id&&other.sheet===frame.sheet){
      assert.ok(frame.x+frame.width<=other.x||other.x+other.width<=frame.x||frame.y+frame.height<=other.y||other.y+other.height<=frame.y,id+' / '+otherId);
    }
  }
});

test('repair stages have distinct furnishing schemes, and owned items no longer share recoloured sprites',()=>{
  for(const name of ['shelter','improvised','timber','celebration'] as const)assert.equal(HOME_STAGE_SPRITES[name].length,12);
  const flags=[[],['greenhouse_sealed'],['greenhouse_fortified_full'],['kingdom_founded']];
  const stages=flags.map(flags=>homeObjects({flags,placements:{}}));
  for(const objects of stages){
    const counts=new Map<string,number>();
    for(const object of objects)counts.set(object.sprite,(counts.get(object.sprite)??0)+1);
    assert.ok(Math.max(...counts.values())<=2,'only natural climbing greenery can repeat, not rows of identical furnishings');
  }
  assert.ok(stages[0].every(object=>object.sprite.startsWith('s1.')||object.sprite==='botany.dryvine'));
  assert.ok(stages[1].every(object=>object.sprite.startsWith('s2.')));
  assert.equal(stages[2].find(o=>o.id==='workbench')?.sprite,'s3.bench');
  assert.equal(stages[3].find(o=>o.id==='workbench')?.sprite,'s4.banquet');
  assert.ok(stages[3].some(o=>o.id==='gifts'));
  const furniture=JSON.parse(fs.readFileSync('web/content/home/furniture.json','utf8')) as {id:string}[];
  const sprites=furniture.map(({id})=>homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:id}}).find(o=>o.furnitureId===id)!.sprite);
  assert.equal(new Set(sprites).size,furniture.length,'every catalogue item has its own drawing');
  assert.equal(homeObjects({flags:['kingdom_founded'],placements:{beam:'moon_hammock'}}).filter(o=>o.sprite==='s3.hammock').length,1,'a placed item replaces its default corner');
});

test('all saved furniture remains visible without renaming IDs, and repair gates do not mutate placements',()=>{
  const catalog=JSON.parse(fs.readFileSync('web/content/home/furniture.json','utf8')) as {id:string}[];
  for(const {id} of catalog){
    const state={flags:['greenhouse_fortified_full'],placements:{sun_spot:id}};
    const before=structuredClone(state),object=homeObjects(state).find(item=>item.slot==='sun_spot');
    assert.equal(object?.furnitureId,id);
    assert.ok(HOME_SPRITES.includes(object!.sprite));
    assert.deepEqual(state,before);
    const point=homePosePoint('sun_spot',id);
    assert.ok(Math.hypot(point.x-HOME_SLOTS.sun_spot.x,point.y-HOME_SLOTS.sun_spot.y)<100);
  }
  const placements={beam:'moon_hammock',sun_spot:'soft_blanket'};
  assert.equal(homeObjects({flags:[],placements}).filter(item=>item.slot).length,0);
  assert.equal(homeObjects({flags:['greenhouse_fortified_full'],placements}).filter(item=>item.slot).length,2);
  assert.deepEqual(placements,{beam:'moon_hammock',sun_spot:'soft_blanket'});
});

test('free movement cannot tunnel through large furnishings or the walls; rugs remain walkable',()=>{
  const objects=homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:'box_castle'}});
  for(const point of HOME_ROAM_NODES)assert.ok(homeWalkable(point,objects),JSON.stringify(point));
  for(const point of HOME_SHELTER_NODES)assert.ok(homeWalkable(point,homeObjects({flags:[],placements:{}})));
  const start={x:850,y:575},target={x:1250,y:575};
  const end=homeWalkStep(start,target,400,objects);
  assert.ok(end.x<HOME_SLOTS.sun_spot.x-80,'cannot cross a placed castle even with a large frame delta');
  assert.ok(homeWalkable(end,objects));
  const rug=homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:'clover_rug'}});
  assert.ok(homeWalkable(HOME_SLOTS.sun_spot,rug));
  const folded=homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:'soft_blanket'}});
  assert.equal(homeWalkable(HOME_SLOTS.sun_spot,folded),false,'folded bedding has volume and is not a flat rug');
  assert.equal(homeWalkable({x:820,y:790},objects),false,'the south door is not an idle roaming destination');
  assert.equal(homeWalkable({x:20,y:480},objects),false);
});
