from pathlib import Path
from collections import deque
import json,base64,numpy as np
b=Path(__file__).resolve().parent;c=json.loads((b/'candidate.json').read_text());s=json.loads((b/'current.json').read_text());w,h=s['cols'],s['rows'];labels={};arrays={};counts={}
for floor in ['L0','L1','Lm1']:
 a=np.frombuffer(base64.b64decode(c['floors'][floor]['effective']),dtype='uint8').reshape(h,w);arrays[floor]=a
 label=np.zeros_like(a,dtype='int32');sizes=[]
 for yy,xx in zip(*np.where(a)):
  if label[yy,xx]:continue
  n=len(sizes)+1;q=deque([(int(xx),int(yy))]);label[yy,xx]=n;size=0
  while q:
   x,y=q.popleft();size+=1
   for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
    nx,ny=x+dx,y+dy
    if 0<=nx<w and 0<=ny<h and a[ny,nx] and not label[ny,nx]:label[ny,nx]=n;q.append((nx,ny))
  sizes.append(size)
 labels[floor]=label;counts[floor]=sorted(sizes,reverse=True)
def nearest(p):
 f=p['layer'];x,y=p['x'],p['y'];best=None;d=1e9
 for yy in range(max(0,int(y-48)//2),min(h,int(y+48)//2+1)):
  for xx in range(max(0,int(x-48)//2),min(w,int(x+48)//2+1)):
   dist=((xx*2+1-x)**2+(yy*2+1-y)**2)**.5
   if dist<d and dist<=48 and arrays[f][yy,xx]:d=dist;best={'x':xx*2+1,'y':yy*2+1,'layer':f,'component':int(labels[f][yy,xx]),'distance':dist}
 return best
landings=[]
for p in s['portals']:landings.append({'id':p['id'],'a':nearest(p['a']),'b':nearest(p['b'])})
items=[{'id':p['id'],'nearest':nearest(p)} for p in s['items']]
report={'componentsByFloor':counts,'portalLandings':landings,'items':items}
(b/'trace-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True))
