from pathlib import Path
from PIL import Image,ImageDraw
import json,base64,numpy as np

base=Path(__file__).resolve().parent
root=base.parents[2]
current=json.loads((base/'current.json').read_text(encoding='utf-8'))
profile=json.loads((base/'trace-profile.json').read_text(encoding='utf-8'))
extra_portals=json.loads((base/'preview-portals.json').read_text(encoding='utf-8'))
guards=json.loads((root/'level_design/chapter4/data/chapter4.surfaces.json').read_text(encoding='utf-8'))
W,H=current['width'],current['height']
def raster(polygons):
    im=Image.new('L',(W,H));d=ImageDraw.Draw(im)
    for polygon in polygons:d.polygon([tuple(p) for p in polygon],fill=255)
    return np.array(im)>127
def native_raster(polygons):
    # Runtime polygon guards sample integer pixel coordinates with ray crossing.
    # Match that convention at the six diagonal bridge-edge pixels as well.
    result=np.zeros((H,W),dtype=bool)
    for polygon in polygons:
        left=max(0,int(min(p[0] for p in polygon)));right=min(W-1,int(max(p[0] for p in polygon)))
        top=max(0,int(min(p[1] for p in polygon)));bottom=min(H-1,int(max(p[1] for p in polygon)))
        y,x=np.mgrid[top:bottom+1,left:right+1];inside=np.zeros_like(x,dtype=bool)
        for i,(xi,yi) in enumerate(polygon):
            xj,yj=polygon[i-1]
            if yj!=yi:inside ^= ((yi>y)!=(yj>y)) & (x<(xj-xi)*(y-yi)/(yj-yi)+xi)
        result[top:bottom+1,left:right+1] |= inside
    return result
def sample(a):
    padded=np.zeros((current['rows']*2,current['cols']*2),dtype='uint8')
    padded[:H,:W]=a
    return padded[1::2,1::2]
def erode(raw,radius,depth):
    result=raw.copy()
    for dy in range(-depth,depth+1):
        for dx in range(-radius,radius+1):
            if dx*dx/(radius*radius)+dy*dy/(depth*depth)>1:continue
            shifted=np.zeros_like(raw)
            shifted[max(0,dy):min(H,H+dy),max(0,dx):min(W,W+dx)]=raw[max(0,-dy):min(H,H-dy),max(0,-dx):min(W,W-dx)]
            result &= shifted
    return result
result={k:current[k] for k in ['width','height','step','cols','rows']}
result.update(previewOnly=True,surfaces={},audit=[])
effective={}
for surface,original in current['surfaces'].items():
    if surface in profile['surfaces']:
        p=profile['surfaces'][surface]
        raw=raster([q['points'] for q in p['walkable']])
        raw &= ~raster([q['points'] for q in p['blocked']]+guards[surface]['blocked'])
        if surface=='L0':
            for name in ['tank-ridge','south-ridge','west-ridge']:
                raw &= np.frombuffer(base64.b64decode(current['surfaces'][name]['raw']),dtype='uint8').reshape(H,W)<128
        # Preserve the previous QA's explicit ground/deck exceptions with the
        # same priority as tunnelGroundMask, especially the lower bridge bank.
        # These are surveyed patches, not permission to open surrounding water.
        raw |= raster(guards[surface]['walkable'])
        for correction in p.get('walkableCorrections',[]):
            patch=raster([correction['points']])
            patch &= ~raster([q['points'] for q in p['blocked'] if q['id'] in correction.get('keepBlocked',[])])
            raw |= patch
        raw &= ~raster(guards[surface].get('blockedAfterWalkable',[]))
        # Bake the permanent guard composition so the preview equals the game.
        raw &= ~native_raster(guards[surface]['blocked'])
        if surface=='L0':
            for name in ['tank-ridge','south-ridge','west-ridge']:
                raw &= np.frombuffer(base64.b64decode(current['surfaces'][name]['raw']),dtype='uint8').reshape(H,W)<128
        raw |= native_raster(guards[surface]['walkable'])
        raw &= ~native_raster(guards[surface].get('blockedAfterWalkable',[]))
        safe=erode(raw,original['radius'],original['depth'])
        effective[surface]=safe
        result['surfaces'][surface]={**original,'raw':base64.b64encode((raw.astype('uint8')*255).tobytes()).decode(),'effective':base64.b64encode(sample(safe).tobytes()).decode()}
    else:
        result['surfaces'][surface]=original
        raw=np.frombuffer(base64.b64decode(original['raw']),dtype='uint8').reshape(H,W)>127
        safe=erode(raw,original['radius'],original['depth']);effective[surface]=safe
    if surface in ['L0','Lm1']:
        fn='chapter4_L0_approved.png' if surface=='L0' else 'chapter4_Lminus1_tunnel_v11.png'
        art=Image.open(root/'level_design/chapter4/art'/fn).convert('RGBA')
        rgba=np.zeros((H,W,4),dtype='uint8');rgba[raw]=[255,185,65,75];rgba[safe]=[26,244,192,75]
        Image.alpha_composite(art,Image.fromarray(rgba)).save(base/(surface+'-candidate.png'))
    print(surface,'candidate safe area',int(safe.sum()))
def nearest(surface,p,max_distance=48):
    mask=effective[surface];x,y=p['x'],p['y'];best=None;dist=float('inf')
    for yy in range(max(0,int(y-max_distance)),min(H,int(y+max_distance)+1)):
        for xx in range(max(0,int(x-max_distance)),min(W,int(x+max_distance)+1)):
            d=(xx-x)**2+(yy-y)**2
            if d<dist and d<=max_distance**2 and mask[yy,xx]:best={'x':xx,'y':yy};dist=d
    return {'point':best,'distance':dist**.5 if best else None}
portals={p['id']:p for p in current['map']['portals']+extra_portals['portals']}
for portal in portals.values():
    raised=({'tank-climb':'tank-ridge','tank-east-descent':'tank-ridge','ridge-climb':'south-ridge','niche-climb':'south-ridge','west-ridge-climb':'west-ridge'}|extra_portals['climbSurfaces']).get(portal['id'])
    for end in ['a','b']:
        p=portal[end];surface=raised if end=='b' and raised else p['layer']
        result['audit'].append({'id':portal['id'],'end':end,'surface':surface,**nearest(surface,p)})
for event in current['map']['events']:
    if event['type'] in ['entry','story_mandatory','fixed_optional','battle_exit']:
        result['audit'].append({'id':event['id'],'end':'event','surface':event['layer'],**nearest(event['layer'],event)})
(base/'candidate.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
print(json.dumps(result['audit']))
