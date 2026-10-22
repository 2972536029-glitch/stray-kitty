import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
await SwaggerParser.validate('docs/openapi.json');
const spec=JSON.parse(fs.readFileSync('docs/openapi.json','utf8'));
const validate=new Ajv2020({strict:false,allErrors:true}).compile({components:spec.components,$ref:'#/components/schemas/Catalog'});
if(!validate(JSON.parse(fs.readFileSync('web/content/catalog.json','utf8'))))throw Error(JSON.stringify(validate.errors));
console.log('OpenAPI specification and generated content response schema verified.');
