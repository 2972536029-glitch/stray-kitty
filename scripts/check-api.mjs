import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
import {readCatalog, validateContent} from './content.mjs';
await SwaggerParser.validate('docs/openapi.json');
const spec=JSON.parse(fs.readFileSync('docs/openapi.json','utf8'));
const validate=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/Catalog'});
if(!validate(JSON.parse(fs.readFileSync('web/content/catalog.json','utf8'))))throw Error(JSON.stringify(validate.errors));
const commandSchema=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/GameCommand'});
for(const command of [{type:'ADVANCE_STORY',nodeId:'prologue_1'},{type:'START_STORY',nodeId:'market_intro_1'},{type:'GO_EXPLORE'},{type:'GO_EXPLORE',mapId:'market'},{type:'START_BATTLE',stageId:'l00_tutorial'},{type:'START_BATTLE',stageId:'alley_rescue'},{type:'START_BATTLE',stageId:'market_boss'},{type:'START_BATTLE',stageId:'greenhouse_boss'},{type:'COMPLETE_BATTLE',attemptId:'tutorial-attempt',outcome:'won'},{type:'COMPLETE_BATTLE',attemptId:'chapter-attempt',outcome:'won',report:{leaks:0,bossDefeated:true}}]) {
  if(!commandSchema(command))throw Error(`Valid command rejected: ${JSON.stringify(commandSchema.errors)}`);
}
for(const command of [{type:'UNKNOWN'},{type:'START_STORY'},{type:'GO_EXPLORE',mapId:123},{type:'START_BATTLE',stageId:'alley_boss',supplies:{}},{type:'COMPLETE_BATTLE',attemptId:'chapter-attempt',outcome:'won',usedSupplies:{}}]) {
  if(commandSchema(command))throw Error(`Invalid command accepted: ${JSON.stringify(command)}`);
}
const carryIds=['lantern','mirror','bell','box','dog','dove'];
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
console.log('OpenAPI specification and generated content response schema verified.');
