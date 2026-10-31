from pathlib import Path
from PIL import Image
import json,base64,hashlib
base=Path(__file__).resolve().parent;root=base.parents[2]
data=json.loads((base/'candidate.json').read_text(encoding='utf-8'))
for floor,name in [('L0','chapter4_L0_walkable.png'),('Lm1','chapter4_Lminus1_walkable.png')]:
    raw=base64.b64decode(data['surfaces'][floor]['raw'])
    Image.frombytes('L',(data['width'],data['height']),raw).save(root/'level_design/chapter4/collision'/name)
manifest_path=root/'level_design/chapter4/data/integrity_manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
for name in ['collision/chapter4_L0_walkable.png','collision/chapter4_Lminus1_walkable.png','data/chapter4.map.json','data/chapter4.surfaces.json']:
    raw=(root/'level_design/chapter4'/name).read_bytes()
    manifest[name]={'sha256':hashlib.sha256(raw).hexdigest(),'size':len(raw)}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Exported two grayscale collision masks and updated their integration hashes.')
