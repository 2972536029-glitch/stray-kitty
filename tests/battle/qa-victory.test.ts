import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateVictoryCommand} from '../../web/src/modules/battle/qa';

const stages=['l00_tutorial','alley_rescue','alley_boss','market_boss','greenhouse_boss','tunnel_boss','finale_boss'];

test('QA victory issues the server-gated command for every configured stage', () => {
  for (const stageId of stages) {
    const command=simulateVictoryCommand({id:`attempt-${stageId}`,stageId,status:'active'},stages);
    assert.ok(command);
    assert.equal(command.type,'QA_SIMULATE_VICTORY');
    assert.equal(command.attemptId,`attempt-${stageId}`);
    assert.equal(Object.keys(command).length,2);
  }
});

test('QA victory rejects inactive and unconfigured battle attempts', () => {
  assert.equal(simulateVictoryCommand({id:'inactive',stageId:'tunnel_boss',status:'lost'},stages),null);
  assert.equal(simulateVictoryCommand({id:'future',stageId:'unconfigured',status:'active'},stages),null);
});
