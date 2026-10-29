#!/usr/bin/env python3
"""Generate Chapter 5 warehouse L0/L1 graybox, geometry and standalone playtest.

Single source of world geometry: coordinates/constants below. No external art assets.
"""
from __future__ import annotations
from collections import deque
from dataclasses import dataclass
from html import escape
from pathlib import Path
import json
import math
import zipfile
from shapely.geometry import Point, Polygon, LineString, box as sbox
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent
W, H = 1672, 941
CAT_RADIUS = 13
MAIN = [
    # Abandoned loading alcoves and irregular storage wings; same compact world frame.
    (162,281),(225,281),(225,215),(366,215),(366,186),(620,186),
    (620,207),(808,207),(808,235),(1040,235),(1040,282),
    (1410,282),(1410,325),(1500,325),(1500,375),(1540,375),
    (1540,536),(1496,536),(1496,601),(1520,601),(1520,810),
    (1360,810),(1360,852),(1141,852),(1141,828),(1045,828),
    (1045,856),(965,856),(965,924),(756,924),(756,853),
    (597,853),(597,875),(310,875),(310,838),(189,838),
    (189,778),(143,778),(143,607),(111,607),(111,360),(162,360)
]
BUNKER = [(1190,65),(1455,65),(1455,210),(1347,210),(1347,282),(1258,282),(1258,210),(1190,210)]
SHELFS = [
    # Upper-left: one lopsided tall rack and a broken pallet field.
    ("west_upper_tall_rack",393,244,151,101,"rack"),
    ("west_wide_rack",416,412,166,96,"rack"),
    ("west_lower_rack",409,595,151,99,"rack"),
    ("west_crates",255,667,106,91,"crate"),
    ("west_service_equipment",205,457,91,102,"machine"),
    ("west_repair_pallet",174,355,61,53,"crate"),
    ("west_broken_shelf",346,705,49,95,"rack"),
    # Middle: offset geometry creates two cross-aisles at different Y positions.
    ("center_upper_rack",637,261,134,83,"rack"),
    ("center_mid_container",630,424,144,112,"container"),
    ("center_lower_rack",637,629,113,113,"rack"),
    ("southwest_pallets",548,775,76,43,"crate"),
    ("center_fallen_boxes",759,633,49,65,"crate"),
    # East: intentionally denser and staggered, no equal mirrored shelf rows.
    ("east_upper_container",897,276,132,113,"container"),
    ("east_mid_rack",932,445,108,96,"rack"),
    ("east_lower_container",909,641,127,90,"container"),
    ("east_top_rack",1127,320,121,77,"rack"),
    ("east_center_rack",1124,462,108,81,"rack"),
    ("east_lower_crates",1148,639,112,88,"crate"),
    ("far_east_top_machine",1359,394,114,94,"machine"),
    ("far_east_bottom",1367,654,101,91,"container"),
    ("southeast_pallets",1090,774,67,45,"crate"),
    ("northeast_spare_drums",1257,333,56,72,"machine"),
    ("northeast_tilted_container",1265,458,77,88,"container"),
    ("east_mid_crate_stack",1402,536,78,83,"crate"),
    # Shifted west 60 units to leave a wide passage along its eastern side.
    ("east_loading_rejects",1215,743,72,62,"crate"),
    ("south_loading_crate",850,797,74,52,"crate"),
    ("upper_access_pallet",1064,294,42,64,"crate"),
    ("west_cross_spill",325,521,68,32,"crate"),
    ("central_misplaced_pallet",805,459,72,35,"crate"),
    ("east_transverse_rubble",1055,548,64,39,"crate"),
    ("east_spare_forklift",1273,556,59,54,"machine"),
    # v07 abandoned-storage disruptions: once-regular loading and shelving now interrupted.
    # Larger clusters produce alternate approaches and purposeful detours, not random pixel noise.
    # Removed west_broken_cart: it was pinching the west loading passage in v03.
    ("west_overturned_pallets",402,260,46,28,"crate"),
    ("west_collapsed_upright",307,449,91,28,"rack"),
    # Lowered this crate 20 units to widen the passage beside west_service_equipment.
    ("west_loading_rejects",155,640,86,39,"crate"),
    ("south_central_scrap",763,750,47,36,"crate"),
    ("upper_east_fallen_rack",1014,460,60,48,"rack"),
    ("upper_east_cross_pallet",1178,413,57,33,"crate"),
    ("east_dock_displaced_stack",1387,383,70,31,"crate"),
    # Removed east_loading_broken_equipment (1191,763,67,43): its 17-unit
    # gap against east_loading_rejects was too narrow for the 26-unit cat.
]
# L1 is a narrow supported walkway with widened platforms. No additional floor art outside this footprint.
L1_RECTS = [
    ("lookout_platform",274,258,112,128),
    ("west_catwalk",333,278,335,54),
    ("north_connector",617,278,60,152),
    ("east_catwalk",617,370,238,62),
    ("crate_platform",524,250,116,94),
    ("c2_landing",773,372,94,91),
]
# Pairs are same world XY, different layers. Climb targets are deliberately unobstructed on both floors.
CLIMBS = [
    {"id":"C1", "x":320,"y":343,"from":"L0","to":"L1","label":"West shelf climb"},
    {"id":"C2", "x":816,"y":409,"from":"L0","to":"L1","label":"Central catwalk descent"},
]
INTERACTIONS = [
    {"id":"entry_lamp", "x":316,"y":582,"floor":"L0","kind":"light","label":"Entrance lamp","type":"permanent"},
    {"id":"central_spotlight", "x":833,"y":557,"floor":"L0","kind":"light","label":"Central spotlight","type":"toggle"},
    {"id":"secondary_lamp", "x":1420,"y":775,"floor":"L0","kind":"light","label":"Secondary lamp","type":"permanent"},
    {"id":"warehouse_lookout", "x":316,"y":287,"floor":"L1","kind":"fixed_event","label":"货架顶的瞭望位"},
    {"id":"warehouse_light_crate", "x":574,"y":292,"floor":"L1","kind":"fixed_event","label":"吊在半空的灯具箱"},
    {"id":"finale_boss", "x":1302,"y":294,"floor":"L0","kind":"battle","label":"Mandatory finale boss","storyBefore":"finale_intro_5","storyAfterWin":"finale_intro_6"},
    {"id":"bunker_exit", "x":1310,"y":126,"floor":"L0","kind":"exit","label":"Rescue / Exit (victory only)"},
    {"id":"warehouse_entry", "x":833,"y":882,"floor":"L0","kind":"start","label":"Entrance from tunnel"},
]
ZONES = [
    {"id":"R1", "x":657,"y":765,"r":47,"floor":"L0","label":"Loading storage","examples":["sack_row_event","box_haul_event"]},
    {"id":"R2", "x":266,"y":404,"r":43,"floor":"L0","label":"Western shelving","examples":["fake_meow_event","moving_shelves_event","warm_nest_event"]},
    {"id":"R3", "x":1364,"y":566,"r":44,"floor":"L0","label":"East cross-aisle","examples":["moving_shelves_event","warm_nest_event","fake_meow_event"]},
    {"id":"R4", "x":1094,"y":402,"r":42,"floor":"L0","label":"Upper shared road","examples":["shadow_captain_event","fake_meow_event","moving_shelves_event"]},
]
# One and only way into bunker is via north neck. Crossing it requires actual battle victory.
BOSS_GATE = {"id":"boss_gate","x":1257,"y":251,"w":91,"h":22,"floor":"L0","unlock":"finale_boss_victory"}
# No other softlock barriers: side passages always offer a way home.
SHADOW_GATES = [
    {"id":"west_shortcut","x":587,"y":356,"w":23,"h":47,"floor":"L0","unlock":"entry_lamp"},
    {"id":"east_shortcut","x":1061,"y":524,"w":27,"h":44,"floor":"L0","unlock":"secondary_lamp"},
]

AMBIENT_LAMPS = [
    {"id":"bay_window_lamp", "x":360,"y":252,"r":177,"floor":"L0", "label":"West bay safety light"},
    {"id":"upper_cross_lamp", "x":1070,"y":262,"r":174,"floor":"L0", "label":"Upper service lamp"},
    {"id":"east_dock_lamp", "x":1468,"y":385,"r":181,"floor":"L0", "label":"East bay safety light"},
    {"id":"lookout_guide_lamp", "x":320,"y":310,"r":156,"floor":"L1", "label":"Lookout platform light"},
]
bounds = unary_union([Polygon(MAIN),Polygon(BUNKER)]).buffer(0)
solid_union = unary_union([sbox(x,y,x+w,y+h) for _,x,y,w,h,_ in SHELFS]); floor0 = bounds.difference(solid_union)
floor1 = unary_union([sbox(x,y,x+w,y+h) for _,x,y,w,h in L1_RECTS]);

GEOM = {
    "id":"warehouse_ch5_graybox_v07", "status":"concept-graybox; not production-approved", 
    "world":{"width":W,"height":H,"coordinateSystem":"common L0/L1 SVG pixel coordinates", "catRadius":CAT_RADIUS},
    "walkable":{"L0":[MAIN,BUNKER],"L1":[[list(q) for q in poly.exterior.coords[:-1]] for poly in (list(floor1.geoms) if hasattr(floor1,'geoms') else [floor1])]},
    "walkableSemantics":"L0 union of polygons MINUS solid rectangles; L1 union of rectangles. Dynamic gates have independent state.",
    "solids":[{"id":n,"x":x,"y":y,"w":w,"h":h,"style":t,"floor":"L0"} for n,x,y,w,h,t in SHELFS],
    "l1WalkableRectangles":[{"id":n,"x":x,"y":y,"w":w,"h":h} for n,x,y,w,h in L1_RECTS],
    "climbs":CLIMBS, "interactions":INTERACTIONS, "randomZones":ZONES, "ambientLamps":AMBIENT_LAMPS,
    "dynamicGates":{"boss":BOSS_GATE,"shadow":SHADOW_GATES},
    "storyContract":{"entry":"finale_intro_1..finale_intro_4", "finaleClueRequirement":3,
                     "beforeBoss":"finale_intro_5","stage":"finale_boss","afterWin":"finale_intro_6", 
                     "ending":"finale_intro_7..finale_intro_9 (greenhouse)"},
    "eventPoolRandom":["fake_meow_event","moving_shelves_event","warm_nest_event","sack_row_event","shadow_captain_event","box_haul_event"],
    "eventPoolFixed":["warehouse_light_crate","warehouse_lookout"],
    "visualOutcomeMapping": {
        "supply_post_built": {"floor":"L0", "anchor":[445,757], "appearance":"supply_station", "sourceEvent":"box_haul_event"},
        "supply_post_paused": {"floor":"L0", "anchor":[445,757], "appearance":"unfinished_supply_post", "sourceEvent":"box_haul_event"},
        "watch_post_set": {"floor":"L1", "anchor":[316,287], "appearance":"watch_post", "sourceEvent":"warehouse_lookout"},
        "watch_post_one_route": {"floor":"L1", "anchor":[316,287], "appearance":"partial_watch_post", "sourceEvent":"warehouse_lookout"},
        "watch_post_wet": {"floor":"L1", "anchor":[316,287], "appearance":"wet_watch_post", "sourceEvent":"warehouse_lookout"},
        "lookout_surveyed": {"floor":"L0", "anchor":[833,557], "appearance":"surveyed_landmarks", "sourceEvent":"warehouse_lookout"},
        "lookout_partial": {"floor":"L1", "anchor":[316,287], "appearance":"partial_survey", "sourceEvent":"warehouse_lookout"},
        "lookout_recce": {"floor":"L1", "anchor":[316,287], "appearance":"safe_route_mark", "sourceEvent":"warehouse_lookout"},
        "light_crate_found": {"floor":"L1", "anchor":[574,292], "appearance":"lamp_recovered", "sourceEvent":"warehouse_light_crate"},
        "light_crate_dinged": {"floor":"L1", "anchor":[574,292], "appearance":"dented_lamp", "sourceEvent":"warehouse_light_crate"},
        "light_crate_stashed": {"floor":"L1", "anchor":[574,292], "appearance":"crate_location_marked", "sourceEvent":"warehouse_light_crate"},
        "finale_light_stashed": {"floor":"L1", "anchor":[574,292], "appearance":"covered_lamp_crate", "sourceEvent":"warehouse_light_crate"},
        "light_stash_rough": {"floor":"L1", "anchor":[574,292], "appearance":"partially_covered_crate", "sourceEvent":"warehouse_light_crate"}
    },
    "visualOutcomeNotes": "Appearance only; read existing server flags. Boss victory uses the existing cleared-battle state, not a newly awarded event flag. Supply post is illustrated in the loading bay because prior event zone of origin may not be persisted.",
    "prototypePacing":{"randomZoneChance":0.5,"maxRandomEncounters":2,"oneAttemptPerZone":True,
                       "note":"provisional level-design values; backend dangerLevel compatibility unverified"},
}

# Visual circulation examples are computed on the actual walkable geometry.
# Their centerlines do not cross storage collision or invented passages.
from heapq import heappush, heappop
STEP_ROUTE = 5
route_clearance = floor0.buffer(-CAT_RADIUS,join_style=2)
route_walkable = {}
def route_open(q):
    if q not in route_walkable:
        route_walkable[q] = route_clearance.covers(Point(q[0]*STEP_ROUTE,q[1]*STEP_ROUTE))
    return route_walkable[q]
def route_segment(start,end):
    st=(round(start[0]/STEP_ROUTE),round(start[1]/STEP_ROUTE))
    ed=(round(end[0]/STEP_ROUTE),round(end[1]/STEP_ROUTE))
    assert route_open(st) and route_open(ed),f'Bad route checkpoint: {start} {end}'
    queue=[(0,st)];prev={st:None};dist={st:0.0}
    around=[(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
    while queue:
        _,cur=heappop(queue)
        if cur==ed: break
        cx,cy=cur
        for dx,dy in around:
            v=(cx+dx,cy+dy)
            if not route_open(v):continue
            if dx and dy and (not route_open((cx+dx,cy)) or not route_open((cx,cy+dy))):continue
            nd=dist[cur]+math.hypot(dx,dy)
            if nd>=dist.get(v,math.inf):continue
            dist[v]=nd;prev[v]=cur
            heappush(queue,(nd+math.hypot(ed[0]-v[0],ed[1]-v[1]),v))
    if ed not in prev:raise AssertionError(f'No route {start}->{end}')
    res=[];p0=ed
    while p0 is not None:res.append((p0[0]*STEP_ROUTE,p0[1]*STEP_ROUTE));p0=prev[p0]
    res.reverse();out=[res[0]]
    for j in range(1,len(res)-1):
        last=res[j-1];cur=res[j];next=res[j+1]
        d1=(cur[0]-last[0],cur[1]-last[1]);d2=(next[0]-cur[0],next[1]-cur[1])
        if d1!=d2:out.append(cur)
    out.append(res[-1]);return out

def multi_route(waypoints):
    points=[]
    for i in range(len(waypoints)-1):
        chunk=route_segment(waypoints[i],waypoints[i+1])
        points.extend(chunk if not points else chunk[1:])
    return points

ROUTES = [
    ('shared_approach','#a6d7d7', multi_route([(833,882),(833,557)]),'none'),
    ('recon','#a5d9b8',multi_route([(833,557),(657,765),(316,582),(266,404),(320,343)]),'10 8'),
    ('lighting','#f4c97e',multi_route([(833,557),(1364,566),(1420,775),(1094,402),(1302,294)]),'10 8'),
    ('crosslink','#91afd7',multi_route([(816,409),(833,557),(1055,607)]),'7 10'),
]
GEOM['exampleRoutes']=[{'id':name,'points':[list(q) for q in pts]} for name,_,pts,_ in ROUTES]
(ROOT/'warehouse_geometry_v07.json').write_text(json.dumps(GEOM,indent=2,ensure_ascii=False)+'\n')

# IDs in playable HTML are drawn from GEOM; no duplicate hardcoded coordinate sources.
(ROOT / "warehouse_geometry_v07.json").write_text(json.dumps(GEOM,indent=2,ensure_ascii=False)+'\n')

def polygon_path(coords):
    return 'M '+' L '.join(f'{x},{y}' for x,y in coords)+' Z'

def rect_svg(x,y,w,h,**kw):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '+ ' '.join(f'{k.replace("_","-")}="{escape(str(v))}"' for k,v in kw.items())+'/>'

def marker_circle(x,y,col,label,r=17):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="#142634" stroke="{col}" stroke-width="5"/><text x="{x}" y="{y+5}" font-size="16" text-anchor="middle" font-weight="800" fill="{col}">{escape(label)}</text>'

def floor_svg(layer):
    p=[]
    p.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" aria-label="Chapter 5 warehouse {layer} graybox">')
    p.append('''<defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#536a7d" stroke-width=".6" opacity=".35"/></pattern>
        <pattern id="rack" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 2 H18 M2 0 V18" stroke="#718b99" stroke-width=".9" fill="none" opacity=".55"/></pattern>
        <pattern id="gate" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="7" height="14" fill="#d9dce1"/><rect x="7" width="7" height="14" fill="#262e3a"/></pattern>
        <filter id="lampGlow"><feGaussianBlur stdDeviation="17"/></filter>
        <clipPath id="l0mask"><path d="'''+polygon_path(MAIN)+polygon_path(BUNKER)+'''" clip-rule="evenodd"/></clipPath>
        </defs>''')
    p.append(rect_svg(0,0,W,H,fill="#0b1722"))
    if layer=='L0':
        p.append(f'<g id="l0-floor" fill="#30424f" stroke="#8c9aa9" stroke-width="5"><path d="{polygon_path(MAIN)}"/><path d="{polygon_path(BUNKER)}"/></g>')
        p.append(f'<g clip-path="url(#l0mask)">{rect_svg(0,0,W,H,fill="url(#grid)")}</g>')
        for n,x,y,w,h,t in SHELFS:
            fills={"rack":"#566470","container":"#425365","crate":"#795d48","machine":"#4b6267"}
            p.append(f'<g id="{n}" class="solid" data-id="{n}">'+rect_svg(x,y,w,h,rx=2,fill=fills[t],stroke="#a1afbc",stroke_width=2.3)+rect_svg(x+6,y+6,w-12,h-12,fill="url(#rack)",opacity=".6")+f'<text x="{x+w/2}" y="{y+h/2+5}" font-size="15" fill="#d2dae0" text-anchor="middle" font-weight="600">{t.upper()}</text></g>')
        # Two example movement journeys use the SAME physical corridors. These are
        # explanatory routes, not collision masks or guaranteed gameplay paths.
        p.append('<g class="planning-routes" pointer-events="none">')
        for name,col,pts,dash in ROUTES:
            route_d='M '+' L '.join(f'{x},{y}' for x,y in pts)
            dashes='' if dash=='none' else f' stroke-dasharray="{dash}"'
            p.append(f'<path id="route-{name}" d="{route_d}" fill="none" stroke="{col}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"{dashes} opacity=".72"/>')
        p.append('</g>')
        # light pools and equipment -- low-detail reference, not baked into future art.
        for x,y in [(316,582),(833,557),(1420,775)]:
            p.append(f'<circle cx="{x}" cy="{y}" r="77" fill="#b7914c" opacity=".11" filter="url(#lampGlow)"/>')
        for light in AMBIENT_LAMPS:
            if light['floor']=='L0':
                p.append(f'<circle cx="{light["x"]}" cy="{light["y"]}" r="21" fill="#f3d294" opacity=".9"/><circle cx="{light["x"]}" cy="{light["y"]}" r="{light["r"]}" fill="#e3ab55" opacity=".08"/>')
        p.append('<g class="planning-zones">')
        for z in ZONES:
            p.append(f'<circle cx="{z["x"]}" cy="{z["y"]}" r="{z["r"]}" fill="#e3687c" fill-opacity=".12" stroke="#f07d92" stroke-width="3.2" stroke-dasharray="12 10"/>')
            p.append(f'<text x="{z["x"]}" y="{z["y"]+6}" fill="#ff9aa7" font-size="20" font-weight="800" text-anchor="middle">{z["id"]}</text>')
        p.append('</g>')
        for gate in SHADOW_GATES:
            p.append(rect_svg(gate['x'],gate['y'],gate['w'],gate['h'],id="visual_"+gate['id'],fill="url(#gate)",stroke="#f0d8a8",stroke_width=2,opacity=".9"))
        p.append(rect_svg(BOSS_GATE['x'],BOSS_GATE['y'],BOSS_GATE['w'],BOSS_GATE['h'],id="visual_boss_gate",fill="url(#gate)",stroke="#ff6e80",stroke_width=3))
        # Level markers show stable anchor locations only; movement paths are not authoritative.
        p.append('<g class="planning-markers">')
        for a in INTERACTIONS:
            if a['floor']!='L0':continue
            kind=a['kind'];col={"light":"#eec47a","battle":"#fc7281","exit":"#82dfe1","start":"#9fe0bc"}[kind]
            lab={"light":"E","battle":"B","exit":"X","start":"S"}[kind]
            p.append(marker_circle(a['x'],a['y'],col,lab,17 if kind!='battle' else 23))
            yoff=-29 if kind!='start' else 45
            p.append(f'<text x="{a["x"]}" y="{a["y"]+yoff}" text-anchor="middle" fill="#ffffff" font-size="17" font-weight="700">{escape(a["label"])}</text>')
        for c in CLIMBS:p.append(marker_circle(c['x'],c['y'],"#be93ee",c['id'],22))
        p.append('</g>')
        p.append(f'<text x="1303" y="185" fill="#f19aa0" font-weight="900" font-size="30" text-anchor="middle">FINAL BUNKER</text>')
        p.append(f'<text x="1140" y="290" fill="#c8e8f1" font-weight="700" font-size="18" text-anchor="end">Boss must-pass neck →</text>')
    else:
        p.append(f'<g id="l0-context" opacity=".24" fill="#3b4a58" stroke="#788a9d" stroke-width="3"><path d="{polygon_path(MAIN)}"/><path d="{polygon_path(BUNKER)}"/></g>')
        for _,x,y,w,h,_ in SHELFS:p.append(rect_svg(x,y,w,h,fill="#657281",opacity=".35"))
        for n,x,y,w,h in L1_RECTS:p.append('<g class="elevated" data-id="'+n+'">'+rect_svg(x,y,w,h,rx=3,fill="#456b77",stroke="#a1e8e1",stroke_width=3)+rect_svg(x+6,y+6,w-12,h-12,fill="url(#rack)",opacity=".7")+'</g>')
        p.append('<path d="M 320,343 L 320,298 L 572,298 L 646,298 L 646,402 L 816,402" stroke="#9ccfeb" stroke-width="9" fill="none" stroke-dasharray="16 10" opacity=".83" stroke-linejoin="round" stroke-linecap="round"/>')
        p.append('<g class="planning-markers">')
        for a in INTERACTIONS:
            if a['floor']!='L1':continue
            p.append(marker_circle(a['x'],a['y'],"#82cef2","E"))
            p.append(f'<text x="{a["x"]}" y="{a["y"]-34}" font-size="20" text-anchor="middle" font-weight="800" fill="#fff">{escape(a["label"])}</text>')
        for c in CLIMBS:
            p.append(marker_circle(c['x'],c['y'],"#be93ee",c['id'],22))
        p.append('</g>')
        p.append(f'<text x="673" y="455" fill="#b9efe4" font-size="23" text-anchor="middle" font-weight="800">L1 CATWALK · C1 ↔ C2</text>')
    p.append('</svg>')
    return '\n'.join(p)

L0 = floor_svg('L0'); L1 = floor_svg('L1')
(ROOT / 'warehouse_L0_graybox_v07.svg').write_text(L0)
(ROOT / 'warehouse_L1_graybox_v07.svg').write_text(L1)

# Route-and-clearance validation: offset geometry for full cat footprint, ignore the intentionally locked gate.
# 10px cell grid, cardinal moves only. All interactions must be reachable at their respective floor.
STEP=10
reachable0=floor0.buffer(-CAT_RADIUS,join_style=2)
reachable1=floor1.buffer(-CAT_RADIUS,join_style=2)

def onfloor(pt,layer):
    return (reachable0 if layer=='L0' else reachable1).covers(Point(pt))

def locate_closest(point,layer,max_dist=20):
    x,y=point
    for r in range(0,max_dist+1,STEP):
        for dx in range(-r,r+1,STEP):
            for dy in range(-r,r+1,STEP):
                p=(round((x+dx)/STEP)*STEP,round((y+dy)/STEP)*STEP)
                if onfloor(p,layer):return p
    raise AssertionError(f'{layer} point inaccessible: {point}')

def connected_components(layer):
    geom=reachable0 if layer=='L0' else reachable1
    return 1 if not hasattr(geom,'geoms') else len(geom.geoms)

# inspect all checkpoints (some props can make travel blocked if accidentally placed in walkway)
checks=[]
for item in INTERACTIONS:
    checks.append((item['id'],item['floor'],(item['x'],item['y'])))
for c in CLIMBS:
    checks.extend([(c['id']+'-L0','L0',(c['x'],c['y'])),(c['id']+'-L1','L1',(c['x'],c['y']))])
for z in ZONES:checks.append((z['id'],'L0',(z['x'],z['y'])))
# Targeted regression: the C1 interaction marker and R2 chance ring must not visually overlap.
assert math.hypot(ZONES[1]["x"]-CLIMBS[0]["x"], ZONES[1]["y"]-CLIMBS[0]["y"]) > ZONES[1]["r"] + 27 + 8, "R2 still overlaps C1 climbing marker"
# R1 center follows the cat's demonstrated clear position near the lower cross-aisle.
assert (ZONES[0]["x"], ZONES[0]["y"]) == (657,765), "R1 target position drifted"
problems=[]
for name,layer,p in checks:
    if not onfloor(p,layer): problems.append((name,layer,p))
assert not problems, f'Checkpoint cannot fit cat footprint: {problems}'
assert connected_components('L0')==1, f'L0 disconnected: {connected_components("L0")}'
assert connected_components('L1')==1, f'L1 disconnected: {connected_components("L1")}'
# Boss neck is only connection to bunker. With gate expanded by cat radius, the northern area must be unreachable.
locked=reachable0.difference(sbox(BOSS_GATE['x']-CAT_RADIUS,BOSS_GATE['y']-CAT_RADIUS,
                                 BOSS_GATE['x']+BOSS_GATE['w']+CAT_RADIUS,
                                 BOSS_GATE['y']+BOSS_GATE['h']+CAT_RADIUS))
assert hasattr(locked,'geoms') and len(locked.geoms)>=2, 'Boss lock is bypassable or ineffective.'
assert not any(g.covers(Point(833,882)) and g.covers(Point(1310,126)) for g in locked.geoms), 'Boss exit bypass detected.'
# All required L0 anchors must remain reachable from spawn with both shadow shortcuts CLOSED.
closed=reachable0
for gate in [BOSS_GATE,*SHADOW_GATES]:
    closed=closed.difference(sbox(gate['x']-CAT_RADIUS,gate['y']-CAT_RADIUS,
                                  gate['x']+gate['w']+CAT_RADIUS,gate['y']+gate['h']+CAT_RADIUS))
spawn_component=next((region for region in (list(closed.geoms) if hasattr(closed,'geoms') else [closed])
                      if region.covers(Point(833,882))),None)
assert spawn_component is not None, 'Spawn inaccessible with lights off'
for node in INTERACTIONS:
    if node['floor']=='L0' and node['id']!='bunker_exit':
        assert spawn_component.covers(Point(node['x'],node['y'])), f'Unreachable with all lights off: {node["id"]}'
for node in ZONES+CLIMBS:
    assert spawn_component.covers(Point(node['x'],node['y'])), f'Unreachable zone/climb with lights off: {node["id"]}'


# Regression test for the southeast pinch reported in the v04 manual playtest.
# A continuous, 40-unit-wide test corridor must fit through the formerly
# obstructed region, around the displaced crate, and reach the secondary lamp.
SOUTHEAST_APPROACH = LineString([
    (1185,758), (1185,830), (1315,830),
    (1315,780), (1420,780), (1420,775),
])
assert (closed.covers(SOUTHEAST_APPROACH) and \
        floor0.covers(SOUTHEAST_APPROACH.buffer(20, join_style=2))), \
    'Southeast lamp approach narrowed or blocked (40-unit corridor required)'
assert SOUTHEAST_APPROACH.distance(floor0.boundary) >= 20, \
    'Southeast lamp approach clearance fell below 20 world units'

# quick conservative walkable boundary check for CAT_RADIUS on both climb points.
status={'L0WalkableComponents':connected_components('L0'),'L1WalkableComponents':connected_components('L1'),
        'checkpointsFit':len(checks),'bossGateDisconnectsBunker':True,
        'activeL0Obstacles':len(SHELFS),'randomZones':len(ZONES),'lightStations':3,'climbs':len(CLIMBS),
        'secondaryLampApproachOpenWithLightsOff':True,
        'secondaryLampTestPathClearanceRadius':20,
        'relocatedRandomZones':{'R1':[657,765],'R2':[266,404]},'r2ClimbMarkerOverlap':False}
(ROOT/'validation_v07.json').write_text(json.dumps(status,indent=2)+'\n')
print(json.dumps(status,indent=2))
