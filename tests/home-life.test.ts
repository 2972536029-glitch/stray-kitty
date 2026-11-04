import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeObjects,type HomeObject} from '../web/src/modules/home/objects';
import {catOverlap,freeCatPoint,furnitureActivity,useFurniture,socialize,endSocial,settleCats,releaseFurniture,stepHomeLife,SOCIAL_KINDS,type LifeCat} from '../web/src/modules/home/life';
import {homeWalkable} from '../web/src/modules/home/navigation';
import {furnitureBlocksCat} from '../web/src/modules/home/spatial';
import {homeResidentLayers} from '../web/src/modules/home/resident-layers';
import type {CatBreed} from '../web/src/adapters/canvas/pixelCat';
import {petCat,nearbyFurnitureCat,canChatter} from '../web/src/modules/home/reactions';
import {currentCatMood,PET_LINES,FURNITURE_LINES,SOCIAL_LINES,furnitureLine,setCatMood,socialLines} from '../web/src/modules/home/dialogue';
import {residentContains,residentWorldPoint,residentLocalPoint} from '../web/src/modules/home/catPainter';
const cat=(breed:CatBreed,x:number,y:number):LifeCat=>({breed,x,y,pose:null,action:'sit',thinkAt:0,facing:1,seed:breed.length*7,nodes:[{x:650,y:500},{x:1000,y:650}],nodeIndex:0,noseUntil:0,noseCooldownUntil:0,bubble:null,bubbleUntil:0,startledUntil:0});
const objects=homeObjects({flags:['greenhouse_fortified_full'],placements:{}});
test('every functional stage and catalogue furniture has a shared action and can be used by any original breed',()=>{
  const owned=(JSON.parse(fs.readFileSync('web/content/home/furniture.json','utf8')) as {id:string}[]).map(f=>f.id);
  const examples:HomeObject[]=[...[[],['greenhouse_sealed'],['greenhouse_fortified_full'],['kingdom_founded']].flatMap(flags=>homeObjects({flags,placements:{}})),...owned.map(id=>homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:id}}).find(o=>o.furnitureId===id)!)];
  const actions=new Set<string>();
  for(const object of examples)for(const breed of ['miaomiao','tuanzi','diandian','momo'] as CatBreed[]){
    const resident=cat(breed,800,500),activity=furnitureActivity(object);actions.add(activity.pose);
    assert.ok(activity.line);assert.ok(Number.isFinite(activity.point.x)&&Number.isFinite(activity.point.y));
    assert.equal(useFurniture(resident,object,[resident],[],0),true,object.layoutKey);
    stepHomeLife([resident],[],1200,1200,3);assert.equal(resident.pose,activity.pose);assert.equal(resident.breed,breed);
    assert.equal(resident.slot,object.slot??object.layoutKey);
  }
  for(const pose of ['castle_peek','hammock_sleep','knead','belly','bowl_eat','scratch','perch','paw_table','investigate','sniff','watch','bat_ball','bat_chime'])assert.ok(actions.has(pose),pose);
});
test('one furniture reservation prevents stacking cats, then releases after its activity finishes',()=>{
  const a=cat('miaomiao',700,500),b=cat('momo',800,600),object=objects.find(o=>o.id==='cat-tower')!;
  assert.ok(useFurniture(a,object,[a,b],objects,0));assert.equal(useFurniture(b,object,[a,b],objects,10),false);
  stepHomeLife([a,b],objects,1200,1200,3);assert.equal(a.pose,'perch');
  stepHomeLife([a,b],objects,18000,16800,3);assert.equal(a.slot,undefined);assert.equal(a.pose,null);assert.equal(catOverlap(a,b),false);
});
test('all five social activities reserve distinct positions; moving one partner ends both sides',()=>{
  for(const kind of SOCIAL_KINDS){const a=cat('tuanzi',700,510),b=cat('diandian',790,540),cats=[a,b];assert.ok(socialize(a,b,kind,cats,objects,0));assert.equal(catOverlap(a,b),false);
    stepHomeLife(cats,objects,1600,1600,3);assert.equal(a.social?.kind,kind);assert.equal(b.social?.partner,a.breed);assert.equal(catOverlap(a,b),false);
    endSocial(a,cats,1700);assert.equal(a.social,undefined);assert.equal(b.social,undefined);
  }
});
test('crowded autonomous cats remain separated throughout two minutes and keep changing activity',()=>{
  const cats=[cat('miaomiao',730,510),cat('tuanzi',730,510),cat('diandian',730,510),cat('momo',730,510)],seen=new Set<string>();
  for(let time=0;time<120000;time+=100){stepHomeLife(cats,objects,time,100,3);for(const c of cats)seen.add(c.pose??c.social?.kind??c.action);for(let i=0;i<cats.length;i++)for(let j=0;j<i;j++)assert.equal(catOverlap(cats[i],cats[j]),false,`${time}/${cats[i].breed}/${cats[j].breed}`);}
  assert.ok(seen.size>=5,JSON.stringify([...seen]));
  const point=freeCatPoint(cats[0],cats,objects);assert.ok(point);assert.ok(cats.every(c=>!catOverlap(point,c)));
});

test('petting has individual moods, repeated-touch boundaries and recovery; sleep and meals get gentler responses',()=>{
  const a=cat('tuanzi',700,500),b=cat('momo',900,500);
  assert.equal(petCat(a,0)?.mood,'happy');assert.equal(petCat(b,0)?.mood,'neutral');
  assert.equal(petCat(a,100),undefined);assert.equal(a.petPressure,1);
  assert.equal(petCat(a,500)?.mood,'happy');assert.equal(petCat(a,1000)?.mood,'neutral');assert.equal(petCat(a,1500)?.mood,'irritated');
  assert.equal(currentCatMood(a,11000),'neutral');assert.equal(petCat(a,11500)?.mood,'happy');assert.equal(a.petPressure,1);
  const seen=new Set<string>();for(let i=0;i<6;i++)seen.add(petCat(a,22000+i*10000)!.line);assert.ok(seen.size>=4);
  for(const pose of ['hammock_sleep','bowl_eat']){const c=cat('diandian',800,500);c.pose=pose;assert.equal(petCat(c,0)?.mood,'neutral');assert.equal(petCat(c,600)?.mood,'irritated');assert.equal(c.pose,pose);}
});

test('context banks cover all moods without repeating furniture or partner dialogue on consecutive interactions',()=>{
  for(const voice of Object.values(PET_LINES))for(const lines of Object.values(voice))assert.ok(new Set(lines).size>=4);
  for(const [pose,moods]of Object.entries(FURNITURE_LINES))for(const mood of ['happy','neutral','irritated'] as const){
    assert.ok(moods[mood].length>=3);const c=cat('miaomiao',700,500),seen=new Set<string>();
    for(let i=0;i<3;i++)seen.add(furnitureLine(c,pose,mood,i*5000));assert.equal(seen.size,3);
  }
  for(const kind of SOCIAL_KINDS)for(const mood of ['happy','neutral','irritated'] as const){
    const a=cat('miaomiao',700,500),b=cat('tuanzi',800,500),count=SOCIAL_LINES[kind][mood].length,seen=new Set<string>();
    for(let i=0;i<count;i++)seen.add(socialLines(a,b,kind,mood,i*8000).join('|'));assert.equal(seen.size,count);
  }
  const a=cat('miaomiao',700,500),object=objects.find(o=>o.id==='cat-tower')!;setCatMood(a,'irritated',0);
  assert.ok(useFurniture(a,object,[a],objects,200));assert.ok(FURNITURE_LINES.perch.irritated.includes(a.bubble!));
  assert.equal(canChatter([a],300),false);assert.equal(canChatter([a],9500),true);
});

test('picking follows the painted body through lying, sleeping, turning and jumping; transparent pixels do not count',()=>{
  const c=cat('miaomiao',700,500);
  for(const pose of [null,'belly','hammock_sleep','knead','castle_peek','scratch','sniff'])for(const facing of [-1,1] as const)for(const time of [0,345,1300]){
    c.pose=pose;c.facing=facing;c.scriptedHeight=25;
    const point=residentWorldPoint(c,time,32,30),local=residentLocalPoint(c,time,point.x,point.y);
    assert.ok(Math.abs(local.x-32)<.001&&Math.abs(local.y-30)<.001);
    assert.equal(residentContains(c,time,point.x,point.y,()=>true),true);
    assert.equal(residentContains(c,time,point.x,point.y,()=>false),false);
    assert.equal(residentContains(c,time,point.x+300,point.y+300),false);
  }
  c.pose='belly';c.scriptedHeight=0;const head=residentWorldPoint(c,0,32,30);
  assert.ok(Math.abs(head.x-c.x)>15,'lying cat head really moved horizontally');
});

test('furniture clicks can invite nearby free cats, never a distant preferred cat or a busy cat',()=>{
  const distant=cat('momo',1300,650),near=cat('tuanzi',800,500);
  assert.equal(nearbyFurnitureCat([distant],800,474,'momo',0),undefined);
  assert.equal(nearbyFurnitureCat([distant,near],800,474,'momo',0),near);
  near.manualUntil=1000;assert.equal(nearbyFurnitureCat([near],800,474,'tuanzi',0),undefined);
  near.manualUntil=0;near.slot='occupied';assert.equal(nearbyFurnitureCat([near],800,474,'tuanzi',0),undefined);
});

test('folded bedding and leaves reserve body clearance; old free cats are moved out and releases stay clear',()=>{
  for(const id of ['soft_blanket','sprout_planter','nebula_planter']){
    const object=homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:id}}).find(o=>o.furnitureId===id)!;
    const resident=cat('tuanzi',object.x,object.y),nearby=[resident];
    assert.equal(homeWalkable(resident,[object]),false,id);
    settleCats(nearby,[object],0);assert.equal(homeWalkable(resident,[object]),true,id);
    assert.ok(useFurniture(resident,object,nearby,[object],100));stepHomeLife(nearby,[object],1300,1200,3);
    if(id!=='soft_blanket')assert.equal(furnitureBlocksCat(object,resident),false,'sniffing is beside the planter');
    releaseFurniture(resident,[object],nearby,1500);assert.equal(homeWalkable(resident,[object]),true,'leaving cannot hide the cat under its host');
  }
});

test('rugs paint below every cat and furniture users share their host depth rather than overlaying unrelated furnishings',()=>{
  const rug=homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:'clover_rug'}}).find(o=>o.furnitureId==='clover_rug')!;
  const host=objects.find(o=>o.id==='cat-tower')!,resident=cat('diandian',host.x,host.y-100);resident.slot=host.slot??host.layoutKey;
  const behind=cat('tuanzi',600,host.y-30),layers=homeResidentLayers([rug,host],[behind,resident]);
  assert.equal(layers[0].object,rug);
  assert.ok(layers.findIndex(l=>l.object===host)<layers.findIndex(l=>l.cat===resident));
  assert.ok(layers.findIndex(l=>l.cat===behind)<layers.findIndex(l=>l.object===host));
});

test('advisor uses the same petting, furniture reservation and social actions without entering the owned roster',()=>{
  const advisor:LifeCat={...cat('tuanzi',720,520),breed:'advisor'},partner=cat('momo',820,520),cats=[advisor,partner];
  assert.ok(petCat(advisor,0)?.line);assert.ok(PET_LINES.advisor.happy.length>=4);
  assert.ok(socialize(advisor,partner,'nose',cats,[],3000));assert.equal(partner.social?.partner,'advisor');
  endSocial(advisor,cats,4000);
  const nest=homeObjects({flags:['greenhouse_fortified_full'],placements:{sun_spot:'soft_blanket'}}).find(o=>o.furnitureId==='soft_blanket')!;
  partner.x=500;partner.y=500;assert.ok(useFurniture(advisor,nest,cats,[nest],5000));
  stepHomeLife(cats,[nest],6200,1200,3);assert.equal(advisor.slot,nest.slot??nest.layoutKey);
});
