import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
await SwaggerParser.validate('docs/openapi.json');
const spec=JSON.parse(fs.readFileSync('docs/openapi.json','utf8'));
const validate=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/Catalog'});
if(!validate(JSON.parse(fs.readFileSync('web/content/catalog.json','utf8'))))throw Error(JSON.stringify(validate.errors));
const commandSchema=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/GameCommand'});
for(const command of [{type:'ADVANCE_STORY',nodeId:'prologue_1'},{type:'START_STORY',nodeId:'market_intro_1'},{type:'GO_EXPLORE'},{type:'GO_EXPLORE',mapId:'market'}]) {
  if(!commandSchema(command))throw Error(`Valid command rejected: ${JSON.stringify(commandSchema.errors)}`);
}
for(const command of [{type:'UNKNOWN'},{type:'START_STORY'},{type:'GO_EXPLORE',mapId:123}]) {
  if(commandSchema(command))throw Error(`Invalid command accepted: ${JSON.stringify(command)}`);
}
console.log('OpenAPI specification and generated content response schema verified.');
