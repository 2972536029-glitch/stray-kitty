from pathlib import Path
from collections import deque
import json,base64,numpy as np
b=Path(__file__).resolve().parent;c=json.loads((b/'candidate.json').read_text(encoding='utf-8'));src=json.loads((b/'current.json').read_text(encoding='utf-8'));w,h=c['cols'],c['rows'];labels={};sizes={}
for name,data in c['surfaces'].items():
 a=np.frombuffer(base64.b64decode(data['effective']),dtype='uint8').reshape(h,w);lab=np.zeros((h,w),dtype='int32');counts=[]
 for y,x in zip(*np.where(a)):
  if lab[y,x]:continue
  n=len(counts)+1;lab[y,x]=n;q=deque([(int(x),int(y))]);count=0
  while q:
   xx,yy=q.popleft();count+=1
   for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
    nx,ny=xx+dx,yy+dy
    if 0<=nx<w and 0<=ny<h and a[ny,nx] and not lab[ny,nx]:lab[ny,nx]=n;q.append((nx,ny))
  counts.append(count)
 labels[name]=lab;sizes[name]=sorted(counts,reverse=True)
def component(row):
 p=row['point']
 if not p:return None
 return row['surface']+':'+str(labels[row['surface']][min(h-1,p['y']//2),min(w-1,p['x']//2)])
audit={(r['id'],r['end']):r for r in c['audit']};edges={}
for p in src['map']['portals']:
 a,bb=component(audit[(p['id'],'a')]),component(audit[(p['id'],'b')]);edges.setdefault(a,set()).add(bb);edges.setdefault(bb,set()).add(a)
start=component(audit[('tunnel_entry','event')]);seen={start};q=[start]
for a in q:
 for bb in edges.get(a,[]):
  if bb not in seen:seen.add(bb);q.append(bb)
status={r['id']:component(r) in seen for r in c['audit'] if r['end']=='event'}
report={'components':sizes,'reachable':status,'missedEnds':[{**r,'component':component(r)} for r in c['audit'] if component(r) not in seen]}
assert all(status.values()),report
assert not report['missedEnds'],report['missedEnds']
import subprocess,hashlib
root=b.parents[2]
paths=['level_design/chapter4/art/chapter4_L0_approved.png','level_design/chapter4/art/chapter4_Lminus1_tunnel_v11.png','level_design/chapter4/data/chapter4.lighting.json','web/src/modules/chapter4/TunnelWalkableMask.ts','web/src/modules/chapter4/navigation.ts']
checks=[]
for name in paths:
 actual=subprocess.check_output(['git','hash-object',name],cwd=root,text=True).strip();expected=subprocess.check_output(['git','rev-parse','HEAD:'+name],cwd=root,text=True).strip();assert actual==expected,name
 checks.append({'path':name,'unchanged':True,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()})
for ridge in ['tank-ridge','south-ridge','west-ridge']:assert c['surfaces'][ridge]==src['surfaces'][ridge],ridge
for surface in c['surfaces']:
 for key in ['raw','effective']:assert c['surfaces'][surface][key]==src['surfaces'][surface][key],(surface,key)
report.update(previewOnly=True,sourceChecks=checks,raisedSurfacesUnchanged=True,runtimeMasksMatchCandidate=True)
(b/'proof.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'reachable':status,'sourceFilesUnchanged':len(checks),'raisedSurfacesUnchanged':True}))
