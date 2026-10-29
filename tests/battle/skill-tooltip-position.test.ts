import test from 'node:test';
import assert from 'node:assert/strict';
import {placeSkillTooltip} from '../../web/src/modules/battle/skillTooltipPosition.ts';

type Rect=Parameters<typeof placeSkillTooltip>[0];
type Size=Parameters<typeof placeSkillTooltip>[2];

function positioned(anchor:Rect,bounds:Rect,size:Size){
  const position=placeSkillTooltip(anchor,bounds,size);
  const rect={left:position.left,top:position.top,right:position.left+size.width,
    bottom:position.top+Math.min(size.height,position.maxHeight)};
  assert.ok(rect.left>=bounds.left&&rect.right<=bounds.right,'explanation stays within horizontal bounds');
  assert.ok(rect.top>=bounds.top&&rect.bottom<=bounds.bottom,'explanation stays within vertical bounds');
  assert.ok(rect.right<=anchor.left||rect.left>=anchor.right||rect.bottom<=anchor.top||rect.top>=anchor.bottom,
    'explanation must leave the skill menu unobstructed');
  return {...position,rect};
}

const desktop={left:12,top:40,right:812,bottom:640};
const description={width:228,height:180};

test('skill explanation stays beside the menu at the left board edge',()=>{
  const anchor={left:12,top:180,right:104,bottom:272};
  const result=positioned(anchor,desktop,description);
  assert.equal(result.left,anchor.right+8);
  assert.equal(result.top,anchor.top);
});

test('skill explanation flips left at the right board edge',()=>{
  const anchor={left:720,top:180,right:812,bottom:272};
  const result=positioned(anchor,desktop,description);
  assert.equal(result.rect.right,anchor.left-8);
  assert.equal(result.top,anchor.top);
});

test('side placement keeps a bottom-edge explanation fully visible',()=>{
  const anchor={left:12,top:548,right:104,bottom:640};
  const result=positioned(anchor,desktop,description);
  assert.equal(result.left,anchor.right+8);
  assert.equal(result.rect.bottom,desktop.bottom);
});

test('narrow board uses space below the skill menu',()=>{
  const bounds={left:40,top:80,right:320,bottom:680};
  const anchor={left:134,top:140,right:226,bottom:232};
  const result=positioned(anchor,bounds,description);
  assert.equal(result.top,anchor.bottom+8);
});

test('narrow board uses space above a low skill menu',()=>{
  const bounds={left:40,top:80,right:320,bottom:680};
  const anchor={left:134,top:550,right:226,bottom:642};
  const result=positioned(anchor,bounds,description);
  assert.equal(result.rect.bottom,anchor.top-8);
});

test('vertical fallback also clamps explanations at both horizontal edges',()=>{
  const bounds={left:40,top:80,right:320,bottom:680};
  for(const anchor of [{left:40,top:140,right:132,bottom:232},{left:228,top:140,right:320,bottom:232}]){
    const result=positioned(anchor,bounds,description);
    assert.equal(result.top,anchor.bottom+8);
  }
});

test('long narrow-screen descriptions get a scrollable height without covering the menu',()=>{
  const bounds={left:0,top:0,right:280,bottom:500};
  const longDescription={width:228,height:900};
  for(const anchor of [{left:94,top:100,right:186,bottom:192},{left:94,top:308,right:186,bottom:400}]){
    const result=positioned(anchor,bounds,longDescription);
    assert.ok(result.maxHeight<longDescription.height,'long content requires scrolling');
    const gapBelow=result.top-anchor.bottom,gapAbove=anchor.top-result.rect.bottom;
    assert.ok(gapBelow===8||gapAbove===8,'scrolling panel remains adjacent with an eight-pixel gap');
  }
});

test('long side descriptions use the full available height while leaving controls clear',()=>{
  const anchor={left:12,top:180,right:104,bottom:272};
  const result=positioned(anchor,desktop,{width:228,height:900});
  assert.equal(result.left,anchor.right+8);
  assert.equal(result.top,desktop.top);
  assert.equal(result.maxHeight,desktop.bottom-desktop.top);
});
