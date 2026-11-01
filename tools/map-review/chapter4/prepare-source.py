from pathlib import Path
from PIL import Image
import json,base64
base=Path(__file__).resolve().parent
root=base.parents[2]
files={'L0':'chapter4_L0_walkable.png','Lm1':'chapter4_Lminus1_walkable.png'}
source={floor:base64.b64encode(Image.open(root/'level_design/chapter4/collision'/name).convert('RGB').getchannel('R').tobytes()).decode() for floor,name in files.items()}
(base/'source-masks.json').write_text(json.dumps(source),encoding='utf-8')
