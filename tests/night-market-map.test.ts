import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMarketSolid, marketArt, nightMarketSpatial, onMarketRoute, shouldTriggerMarketBoss} from '../web/src/modules/nightMarket/map';

test('Night Market keeps the approved native coordinate frame and three exact art assets',()=>{
  assert.deepEqual(nightMarketSpatial.coordinate_space,{width:1672,height:941,origin:'top-left',axis_x:'right',axis_y:'down',units:'native artwork pixels'});
  assert.equal(Object.keys(marketArt).length,3);
  assert.ok(marketArt.L0.endsWith('night_market_L0_streets_1672x941.png'));
});
test('authored routes and L0 collision geometry are layer-specific',()=>{
  assert.equal(onMarketRoute('L0',670,786),true);
  assert.equal(onMarketRoute('L1',1310,426),true);
  assert.equal(onMarketRoute('Lm1',975,429),true);
  assert.equal(onMarketRoute('L1',670,786),false);
  assert.equal(isMarketSolid('L0',580,520),true);
  assert.equal(isMarketSolid('L1',580,520),false);
});
test('market boss only triggers at its authored point before the mainline clear',()=>{
  assert.equal(shouldTriggerMarketBoss('L0',true,false,1310,169),true);
  assert.equal(shouldTriggerMarketBoss('L0',false,false,1310,169),false);
  assert.equal(shouldTriggerMarketBoss('L0',true,false,670,781),false);
  assert.equal(shouldTriggerMarketBoss('L1',true,false,1310,169),false);
  assert.equal(shouldTriggerMarketBoss('L0',true,true,1310,169),false);
});
