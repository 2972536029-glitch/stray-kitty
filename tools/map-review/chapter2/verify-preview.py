from pathlib import Path
from collections import deque
import json,base64,numpy as np,hashlib,subprocess
b=Path(__file__).resolve().parent;c=json.loads((b/'candidate.json').read_text(encoding='utf-8'));s=json.loads((b/'current.json').read_text(encoding='utf-8'));w,h=s['cols'],s['rows'];yy,xx=np.mgrid[:h,:w];X,Y=xx*2+1,yy*2+1
base={f:np.frombuffer(base64.b64decode(c['floors'][f]['effective']),dtype='uint8').reshape(h,w).copy() for f in ['L0','L1','Lm1']}
def segment(a,bb):
 dx,dy=bb[0]-a[0],bb[1]-a[1];t=np.clip(((X-a[0])*dx+(Y-a[1])*dy)/(dx*dx+dy*dy or 1),0,1);return np.hypot(X-a[0]-t*dx,Y-a[1]-t*dy)
def run(cleared):
 arrays={f:a.copy() for f,a in base.items()};labels={}
 for o in s['spatial']['actionObstacles']:arrays['L0'][segment(o['a'],o['b'])<o['radius']+10]=0
 bar=s['spatial']['battleBarrier'];arrays[bar['layer']][segment(bar['a'],bar['b'])<bar['radius']+10+(3 if cleared else 0)]=0
 for f,a in arrays.items():
  label=np.zeros_like(a,dtype='int32');n=0
  for y,x in zip(*np.where(a)):
   if label[y,x]:continue
   n+=1;q=deque([(int(x),int(y))]);label[y,x]=n
   while q:
    px,py=q.popleft()
    for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
     nx,ny=px+dx,py+dy
     if 0<=nx<w and 0<=ny<h and a[ny,nx] and not label[ny,nx]:label[ny,nx]=n;q.append((nx,ny))
  labels[f]=label
 def near(p):
  f=p.get('layer',p.get('floor'));x,y=p['x'],p['y'];best=None;d=1e9
  for py in range(max(0,int(y-48)//2),min(h,int(y+48)//2+1)):
   for px in range(max(0,int(x-48)//2),min(w,int(x+48)//2+1)):
    dist=np.hypot(px*2+1-x,py*2+1-y)
    if dist<d and dist<=48 and arrays[f][py,px]:best=f+':'+str(labels[f][py,px]);d=dist
  return best
 edges={}
 for p in s['portals']:
  if p.get('requiresFlag') and not cleared:continue
  a,bb=near(p['a']),near(p['b']);assert a and bb,p['id'];edges.setdefault(a,set()).add(bb);edges.setdefault(bb,set()).add(a)
 start=near(s['entry']);seen={start};q=[start]
 for a in q:
  for bb in edges.get(a,[]):
   if bb not in seen:seen.add(bb);q.append(bb)
 status={p['id']:near(p) in seen for p in s['items'] if p['id'] in ['entry','crow','pigeon','momo','boss','exit']}
 assert all(status[k] for k in ['entry','crow','pigeon','momo','boss'])
 assert status['exit']==cleared,status
 return status
paths=['web/public/assets/night-market/night_market_L0_streets_1672x941.png','web/public/assets/night-market/night_market_L1_rooftops_1672x941.png','web/public/assets/night-market/night_market_Lminus1_tunnel_1672x941.png','specs/night-market/night_market_v016_spatial_reference.json','web/src/modules/nightMarket/map.ts','web/src/modules/nightMarket/transitions.ts']
checks=[]
for name in paths:
 actual=subprocess.check_output(['git','hash-object','--path='+name,name],text=True).strip();expected=subprocess.check_output(['git','rev-parse','HEAD:'+name],text=True).strip();checks.append({'path':name,'unchangedFromMain':actual==expected,'sha256':hashlib.sha256(Path(name).read_bytes()).hexdigest()})
assert all(x['unchangedFromMain'] for x in checks)
proof={'previewOnly':True,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'beforeVictoryReachable':run(False),'afterVictoryReachable':run(True),'sourceChecks':checks,'scope':'2px sampled candidate surface connectivity with existing cargo/battle gates and C/F links; not a complete gameplay run'}
(b/'proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:proof[k] for k in ['beforeVictoryReachable','afterVictoryReachable']},ensure_ascii=False));print('All six source/art files unchanged from main.')
