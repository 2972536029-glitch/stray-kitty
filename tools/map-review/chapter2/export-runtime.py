from pathlib import Path
import json,base64
base=Path(__file__).resolve().parent
root=base.parents[2]
candidate=json.loads((base/'candidate.json').read_text(encoding='utf-8'))
result={'resolution':2,'columns':836,'rows':471,'collisionRadius':10,'floors':{}}
for floor,data in candidate['floors'].items():
    pixels=base64.b64decode(data['effective']);runs=[];start=None
    for i,value in enumerate(pixels+b'\0'):
        if value and start is None:start=i
        elif not value and start is not None:runs.append([start,i]);start=None
    result['floors'][floor]=runs
target=root/'specs/night-market/night_market_traced_mask.json'
target.write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf-8')
print('Exported reviewed masks:',target.name,target.stat().st_size,'bytes')
