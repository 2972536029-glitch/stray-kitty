import {test} from 'node:test';
import assert from 'node:assert/strict';
import {marketPortals,marketTransitionAt,isMarketTraversable,sweepMarketMove} from '../web/src/modules/nightMarket/map';
import {MarketTransitionController,sampleMarketTransition} from '../web/src/modules/nightMarket/transitions';
import {explorationFooterText} from '../web/src/ui/explorationFooter';

test('all authored C/F portals resolve to collision-valid approaches and landings in both directions',()=>{
  for(const portal of marketPortals){
    const flags=portal.requiresFlag?[portal.requiresFlag]:[];
    for(const [from,to] of [[portal.a,portal.b],[portal.b,portal.a]]){
      const request=marketTransitionAt(from.layer,portal.key,from.x,from.y,flags,flags.includes('market_cleared'));
      assert.ok(request,`${portal.id} has a transition from ${from.layer}`);
      assert.equal(request.fromFloor,from.layer);assert.equal(request.toFloor,to.layer);
      assert.equal(isMarketTraversable(request.fromFloor,request.from.x,request.from.y,true),true,`${portal.id} source is walkable`);
      assert.equal(isMarketTraversable(request.toFloor,request.to.x,request.to.y,true),true,`${portal.id} landing is walkable`);
      const escapes=[[8,0],[-8,0],[0,8],[0,-8]].some(([dx,dy])=>{
        const moved=sweepMarketMove(request.toFloor,request.to,{x:dx,y:dy},true);
        return !moved.blocked&&Math.hypot(moved.position.x-request.to.x,moved.position.y-request.to.y)>4&&isMarketTraversable(request.toFloor,moved.position.x,moved.position.y,true);
      });
      assert.equal(escapes,true,`${portal.id} landing permits movement back onto its floor`);
      for(const [dx,dy] of [[8,0],[-8,0],[0,8],[0,-8]]){
        let position={...request.to};
        for(let frame=0;frame<4;frame++){
          const move=sweepMarketMove(request.toFloor,position,{x:dx/4,y:dy/4},true);
          assert.equal(isMarketTraversable(request.toFloor,move.position.x,move.position.y,true),true,`${portal.id} frame ${frame} stays clear on its landing floor`);
          position=move.position;
        }
      }
      assert.equal(request.animation,portal.animation);assert.equal(request.durationMs,portal.durationMs);
    }
  }
});

test('time-based transitions move the cat continuously, hold the camera, and release controls at landing',()=>{
  const portal=marketPortals.find(value=>value.id==='nw')!;
  const flags=[] as string[];
  const request=marketTransitionAt('L0','c',portal.a.x,portal.a.y,flags,false)!;
  const start={x:request.from.x-8,y:request.from.y};
  const controller=new MarketTransitionController();
  assert.equal(controller.begin(request,start),true);
  assert.equal(controller.begin(request,start),false,'a transition cannot retrigger while active');
  let previous=start,peak=0,raised=false;
  for(let elapsed=16;elapsed<=request.durationMs;elapsed+=16){
    const frame=sampleMarketTransition(request,start,elapsed);
    const movement=Math.hypot(frame.x-previous.x,frame.y-previous.y);
    assert.ok(movement<12,`16ms frame moves smoothly (${movement.toFixed(2)}px)`);
    peak=Math.max(peak,movement);raised||=frame.height>0;
    assert.equal(frame.cameraPolicy,'hold','the follow camera stays stationary during the transition');
    previous={x:frame.x,y:frame.y};
  }
  const landing=sampleMarketTransition(request,start,request.durationMs);
  assert.deepEqual({x:landing.x,y:landing.y},{x:request.to.x,y:request.to.y});
  assert.equal(landing.done,true);assert.ok(raised,'the cat visibly rises during a climb');assert.ok(peak>0);
  let remaining=request.durationMs;while(controller.active){const step=Math.min(16,remaining);controller.advance(step);remaining-=step;}
  assert.equal(controller.active,false,'normal movement can resume after the landing frame');
});

test('transition interruption restores the starting floor and position',()=>{
  const portal=marketPortals.find(value=>value.id==='underpassN')!;
  const request=marketTransitionAt('L0','f',portal.a.x,portal.a.y,[],false)!;
  const start={x:request.from.x+2,y:request.from.y+2},controller=new MarketTransitionController();
  controller.begin(request,start);controller.advance(160);
  assert.deepEqual(controller.cancel(),{floor:'L0',position:start});
  assert.equal(controller.active,false);
});

test('Night Market exploration uses its objective instead of the permanent generic controls tutorial',()=>{
  assert.equal(explorationFooterText('explore','market','WASD move · E inspect · C climb · F stairs','Explore the market clues'), 'Explore the market clues');
  assert.equal(explorationFooterText('explore','alley','WASD move · E inspect · C climb · F stairs','Find the rescue crate'),'WASD move · E inspect · C climb · F stairs');
});
