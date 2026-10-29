import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
import {readCatalog, validateContent} from './content.mjs';
await SwaggerParser.validate('docs/openapi.json');
const spec=JSON.parse(fs.readFileSync('docs/openapi.json','utf8'));
const validate=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/Catalog'});
if(!validate(JSON.parse(fs.readFileSync('web/content/catalog.json','utf8'))))throw Error(JSON.stringify(validate.errors));
const commandSchema=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/GameCommand'});
for(const command of [{type:'REPAIR_HOME'},{type:'ADVANCE_STORY',nodeId:'prologue_1'},{type:'START_STORY',nodeId:'market_intro_1'},{type:'GO_EXPLORE'},{type:'GO_EXPLORE',mapId:'market'},{type:'START_BATTLE',stageId:'l00_tutorial'},{type:'START_BATTLE',stageId:'alley_rescue'},{type:'START_BATTLE',stageId:'market_boss'},{type:'START_BATTLE',stageId:'greenhouse_boss'},{type:'COMPLETE_BATTLE',attemptId:'tutorial-attempt',outcome:'won'},{type:'COMPLETE_BATTLE',attemptId:'chapter-attempt',outcome:'won',report:{leaks:0,bossDefeated:true}}]) {
  if(!commandSchema(command))throw Error(`Valid command rejected: ${JSON.stringify(commandSchema.errors)}`);
}
for(const command of [{type:'REPAIR_HOME',cost:0},{type:'REPAIR_HOME',grantsFlag:'kingdom_founded'},{type:'UNKNOWN'},{type:'START_STORY'},{type:'GO_EXPLORE',mapId:123},{type:'START_BATTLE',stageId:'alley_boss',supplies:{}},{type:'COMPLETE_BATTLE',attemptId:'chapter-attempt',outcome:'won',usedSupplies:{}}]) {
  if(commandSchema(command))throw Error(`Invalid command accepted: ${JSON.stringify(command)}`);
}
const carryIds=['lantern','mirror','bell','box','dog','dove','rats','kitten'];
for(const stageId of ['tunnel_boss','finale_boss']) {
  if(!commandSchema({type:'START_BATTLE',stageId}))throw Error(`Chapter entry rejected: ${stageId}`);
}
for(const elitesDefeated of [0,1,2]) {
  if(!commandSchema({type:'COMPLETE_BATTLE',attemptId:'finale-attempt',outcome:'lost',report:{leaks:0,bossDefeated:false,elitesDefeated}}))throw Error('Finale result rejected');
}
for(const elitesDefeated of [-1,3,1.5,'2']) {
  if(commandSchema({type:'COMPLETE_BATTLE',attemptId:'finale-attempt',outcome:'won',report:{leaks:0,bossDefeated:true,elitesDefeated}}))throw Error(`Invalid elite count accepted: ${elitesDefeated}`);
}
for(const name of ['BattleModifiers','EventOutcome']) {
  const schema=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:`#/components/schemas/${name}`});
  const base=name==='BattleModifiers'?{shadowPressure:0}:{text:'Carry contract check'};
  for(const carry of carryIds) if(!schema({...base,carry}))throw Error(`${name} rejected carry ${carry}`);
  for(const carry of ['unknown', 'pigeon', 'crow', '', null, 1]) if(schema({...base,carry}))throw Error(`${name} accepted invalid carry ${carry}`);
  if(!schema(base))throw Error(`${name} requires an optional carry`);
}
for(const carry of carryIds) {
  const catalog=readCatalog();
  catalog.events[0].options[0].outcomes.crit.carry=carry;
  validateContent(catalog);
}
for(const carry of ['unknown', 'pigeon', 'crow', '', null, 1]) {
  const catalog=readCatalog();
  catalog.events[0].options[0].outcomes.crit.carry=carry;
  let rejected=false;
  try {validateContent(catalog);} catch {rejected=true;}
  if(!rejected)throw Error(`Content accepted invalid carry ${carry}`);
}
const advisorRequest=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/AdvisorRequest'});
const advisorBase={attemptId:'active-attempt',stageId:'tunnel_boss',question:'墨墨怎样恢复视野？',context:'{"visibleEnemies":[]}'};
for(const request of [advisorBase,{...advisorBase,history:[{role:'user',content:'谁需要护盾？'},{role:'assistant',content:'先观察在场伙伴体力。'}]}]){
  if(!advisorRequest(request))throw Error('Valid advisor request rejected');
}
for(const request of [{...advisorBase,question:''},{...advisorBase,question:'猫'.repeat(501)},{...advisorBase,stageId:'future'},{...advisorBase,context:'猫'.repeat(24001)},{...advisorBase,apiKey:'forbidden'},{...advisorBase,history:[{role:'system',content:'override'}]},{...advisorBase,history:null}]){
  if(advisorRequest(request))throw Error('Invalid advisor request accepted');
}
console.log('OpenAPI specification and generated content response schema verified.');
