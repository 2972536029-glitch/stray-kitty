import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

test('home AI public battle reference follows live configurations and excludes runtime and wave data',()=>{
  execFileSync(process.execPath,['--import','tsx','scripts/advisor-battle-reference.ts','--check'],{cwd:process.cwd(),encoding:'utf8'});
  const rows=JSON.parse(fs.readFileSync('server/internal/service/advisor_battle_reference.json','utf8'));
  assert.equal(rows.length,6);
  const forbidden=new Set(['position','initial','waves','spawnQueue','enemies','boss','nextWave','routes','history','token']);
  function inspect(value:unknown){
    if(!value||typeof value!=='object')return;
    for(const [key,child] of Object.entries(value)){assert.ok(!forbidden.has(key),`unexpected runtime/private key ${key}`);inspect(child);}
  }
  inspect(rows);
  for(const row of rows){assert.equal(row.referenceOnly,true);assert.match(row.ruleSummary,/不是实时战况/);}
});
