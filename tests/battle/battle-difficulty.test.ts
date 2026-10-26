import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advanceGame} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG,DIFFICULTY_CONFIG,ENEMY_TYPES,normalizeDifficulty} from '../../web/src/modules/battle/l00/config.ts';
import {beginBattle,playBattle} from './helpers.ts';
import type {BattleDifficulty} from '../../web/src/modules/battle/l00/types.ts';
const levels:BattleDifficulty[]=['low','medium','high'];
test('difficulty defaults only on omission and rejects invalid external values',()=>{
 assert.equal(createGame().difficulty,'medium');for(const value of levels)assert.equal(normalizeDifficulty(value),value);
 for(const value of [null,'',0,1,false,'hard','HIGH',{},[],NaN])assert.throws(()=>normalizeDifficulty(value),{code:'INVALID_BATTLE_DIFFICULTY'});
});
test('all three tiers share the same safe tutorial and cannot multiply scripted damage',()=>{
 const comparable=(difficulty:BattleDifficulty)=>{const {difficulty:_,...state}=beginBattle({difficulty});return state;};
 assert.deepEqual(comparable('low'),comparable('medium'));assert.deepEqual(comparable('high'),comparable('medium'));
});
for(const difficulty of levels)test(`${difficulty}: all six waves can be completed with no items and a three-second reaction`,context=>{
 const r=playBattle(beginBattle({difficulty}),{reactionSeconds:3});
 assert.equal(r.state.phase,'won');assert.equal(r.state.wave,6);assert.equal(r.state.spawned,CONFIG.TOTAL_ENEMIES);assert.equal(r.state.defeated+r.state.escaped,CONFIG.TOTAL_ENEMIES);assert.ok(r.state.leaks<3);
 assert.equal(r.spawns.length,17);for(const e of r.spawns){const base=ENEMY_TYPES[e.type];assert.equal(e.maxHp,Math.round(base.maxHp*DIFFICULTY_CONFIG[difficulty].enemyHpMultiplier));assert.equal(e.damage,base.damage);assert.equal(e.speed,base.speed);}
 assert.ok(r.areaCasts>=2&&r.shieldCasts>=1);assert.equal('inventory' in r.state,false);
 context.diagnostic(JSON.stringify({difficulty,seconds:r.battleSeconds,leaks:r.state.leaks,shields:r.shieldCasts,areas:r.areaCasts,retired:r.state.cats.filter(c=>c.status==='retired').map(c=>c.name)}));
});
