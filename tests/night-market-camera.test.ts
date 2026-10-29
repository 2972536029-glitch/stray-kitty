import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraFrameFor, displayedCanvasRect, FollowCamera, type CameraRect} from '../web/src/adapters/canvas/camera';

const viewport:CameraRect={x:0,y:0,width:800,height:480};
const safe:CameraRect={x:32,y:96,width:736,height:300};

test('follow camera eases toward the cat and places it in the safe gameplay area',()=>{
  const frame=cameraFrameFor(viewport,safe),camera=new FollowCamera();
  camera.snap({x:500,y:450},frame,1672,941);
  const before=camera.x;
  camera.update({x:800,y:650},frame,1672,941,.1);
  assert.ok(camera.x>before);
  for(let i=0;i<30;i++)camera.update({x:800,y:650},frame,1672,941,.1);
  const cat=camera.worldToScreen({x:800,y:650},frame);
  assert.ok(Math.abs(cat.x-(safe.x+safe.width/2))<2);
  assert.ok(Math.abs(cat.y-(safe.y+safe.height/2))<2);
});

test('camera clamps at all four map edges while keeping the cat on screen',()=>{
  const frame=cameraFrameFor(viewport,safe),camera=new FollowCamera();
  for(const [point,x,y] of [
    [{x:0,y:0},0,0],
    [{x:1672,y:0},1672-frame.worldViewWidth,0],
    [{x:0,y:941},0,941-frame.worldViewHeight],
    [{x:1672,y:941},1672-frame.worldViewWidth,941-frame.worldViewHeight]
  ] as const) {
    camera.snap(point,frame,1672,941);
    assert.ok(Math.abs(camera.x-x)<1e-8);
    assert.ok(Math.abs(camera.y-y)<1e-8);
    const projected=camera.worldToScreen(point,frame);
    assert.ok(projected.x>=frame.viewport.x&&projected.x<=frame.viewport.x+frame.viewport.width);
    assert.ok(projected.y>=frame.viewport.y&&projected.y<=frame.viewport.y+frame.viewport.height);
  }
});

test('responsive object-fit projection preserves coordinates and recalculates visible world size',()=>{
  const wide=displayedCanvasRect(1280,720,800,480,'cover');
  const tall=displayedCanvasRect(800,900,800,480,'contain');
  assert.deepEqual(wide,{x:0,y:15,width:800,height:450});
  assert.deepEqual(tall,{x:0,y:0,width:800,height:480});
  const first=cameraFrameFor(wide,{x:20,y:90,width:760,height:300});
  const second=cameraFrameFor(tall,{x:20,y:90,width:760,height:300});
  assert.notEqual(first.scale,second.scale);
  const extraWide=cameraFrameFor({x:0,y:0,width:2400,height:300},{x:0,y:30,width:2400,height:240});
  assert.ok(extraWide.worldViewWidth<=1672&&extraWide.worldViewHeight<=941);
  const camera=new FollowCamera();
  camera.snap({x:900,y:500},first,1672,941);
  const marker={x:1100,y:600},screen=camera.worldToScreen(marker,first);
  const restored=camera.screenToWorld(screen,first);
  assert.ok(Math.abs(restored.x-marker.x)<1e-8);
  assert.ok(Math.abs(restored.y-marker.y)<1e-8);
  camera.update({x:900,y:500},second,1672,941,.016);
  assert.ok(camera.x>=0&&camera.y>=0);
});

test('camera can snap to saved positions on each floor transition',()=>{
  const frame=cameraFrameFor(viewport,safe),camera=new FollowCamera();
  for(const saved of [{x:700,y:780},{x:680,y:170},{x:970,y:430}]) {
    camera.snap(saved,frame,1672,941);
    const cat=camera.worldToScreen(saved,frame);
    assert.ok(cat.x>=frame.viewport.x&&cat.x<=frame.viewport.x+frame.viewport.width);
    assert.ok(cat.y>=frame.viewport.y&&cat.y<=frame.viewport.y+frame.viewport.height);
  }
});
