import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error 内容脚本由 Node 直接运行，测试复用同一校验器。
import {readCatalog,validateContent} from '../scripts/content.mjs';
test('所有内容 ID 与跨模块引用一致',()=>{assert.doesNotThrow(()=>validateContent(readCatalog()));});
test('坏地图引用、重复猫咪、无效抽取权重会阻止打包',()=>{
 const c=readCatalog();c.maps[0].interactions[0].eventId='missing';c.cats.push(c.cats[0]);c.pools[0].entries[0].weight=-1;assert.throws(()=>validateContent(c));
});
test('商品必须引用真实家具，并使用有效的邮票价格',()=>{
 const c=readCatalog();c.products[0].furnitureId='missing';c.products[1].price=-1;assert.throws(()=>validateContent(c));
});
test('事件四档完整、局势指向有效剧情，剧情事件不能进入随机池',()=>{
 for(const mutate of [
  (c:any)=>{delete c.events[0].options[0].outcomes.fail;},
  (c:any)=>{c.events[0].options[0].outcomes.fail.situation.storyNodeId='missing';},
  (c:any)=>{c.events[0].triggers.push('random');},
  (c:any)=>{c.maps[0].dangerLevel=4;}
 ]){const c=readCatalog();mutate(c);assert.throws(()=>validateContent(c));}
});
