import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeObjects,type HomeObject} from '../web/src/modules/home/objects';
import {catOverlap,freeCatPoint,furnitureActivity,useFurniture,socialize,endSocial,stepHomeLife,SOCIAL_KINDS,type LifeCat} from '../web/src/modules/home/life';
import type {CatBreed} from '../web/src/adapters/canvas/pixelCat';
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
