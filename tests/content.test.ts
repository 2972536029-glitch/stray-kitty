import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error 内容脚本由 Node 直接运行，测试复用同一校验器。
import {readCatalog,validateContent} from '../scripts/content.mjs';
test('所有内容 ID 与跨模块引用一致',()=>{assert.doesNotThrow(()=>validateContent(readCatalog()));});
test('坏地图引用、重复猫咪、无效抽取权重会阻止打包',()=>{
 const c=readCatalog();c.maps[0].interactions[0].eventId='missing';c.cats.push(c.cats[0]);c.pools[0].entries[0].weight=-1;assert.throws(()=>validateContent(c));
});
