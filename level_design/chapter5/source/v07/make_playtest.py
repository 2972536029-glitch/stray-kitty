#!/usr/bin/env python3
from pathlib import Path
import json
import re

DIR=Path(__file__).parent
G=json.loads((DIR/'warehouse_geometry_v07.json').read_text())

def svg_inner(s):
    # All world layers share identical viewBox and definitions. Keep one defs block from L0.
    s=re.sub(r'^<svg[^>]*>\s*','',s)
    s=re.sub(r'\s*</svg>\s*$','',s)
    return s

a=svg_inner((DIR/'warehouse_L0_graybox_v07.svg').read_text())
b=svg_inner((DIR/'warehouse_L1_graybox_v07.svg').read_text())
props=svg_inner((DIR/'warehouse_visual_outcomes_v07.svg').read_text())
a_defs=re.search(r'<defs>.*?</defs>',a,flags=re.S).group(0)
a=re.sub(r'<defs>.*?</defs>\s*','',a,flags=re.S)
b=re.sub(r'<defs>.*?</defs>\s*','',b,flags=re.S)

html=r'''<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Chapter 5 Warehouse — Standalone Graybox Playtest v07</title><style>
:root{color-scheme:dark;--bg:#0a131c;--panel:#14222e;--line:#395265;--white:#e3edf1;--muted:#9cb0bc;--mint:#a0e0bb;--amber:#f0c782;--blue:#8acdf3}
*{box-sizing:border-box}body{background:var(--bg);margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--white)}.top{display:flex;align-items:center;flex-wrap:wrap;gap:14px;padding:13px 20px;border-bottom:1px solid var(--line);background:#0e1b26}.top strong{font-size:18px;letter-spacing:.01em}.small{font-size:12px;color:var(--muted)}.badge{padding:4px 10px;border:1px solid #6b8191;border-radius:99px;font-size:12px}.app{display:grid;grid-template-columns:minmax(0,1fr) 290px;min-height:calc(100vh - 69px)}.stagecol{display:flex;flex-direction:column;min-height:0}.stage{min-height:540px;height:min(77vh,830px);position:relative;overflow:hidden;border:1px solid #4c6a7b;background:#07111a;outline:none}.stage:focus{box-shadow:inset 0 0 0 1px #8acdf3}svg{width:100%;height:100%;display:block}.overlay{position:absolute;pointer-events:none;background:#0c1b27c7;border:1px solid #527186;padding:8px 10px;border-radius:6px;max-width:75%;font-size:13px}.hint{right:12px;top:12px;min-width:210px;text-align:right;color:#e9e2cf}.tophint{top:12px;left:12px}.bar{display:flex;flex-wrap:wrap;gap:9px;align-items:center;padding:12px 16px;background:#111f2b;border-top:1px solid #3c5669}button{color:#eaf2f4;background:#253b4a;border:1px solid #537083;padding:7px 11px;border-radius:6px;cursor:pointer;font:inherit}button:hover{border-color:#b4e9df}.smallbtn{font-size:12px}button.active{background:#30515d;border-color:#95c9a8}.side{border-left:1px solid #456070;padding:20px 18px;background:#10202b}.side h2{margin:0 0 7px;font-size:16px}.side p{margin:0 0 14px;color:#b4c7d0}.tile{background:#172c39;border:1px solid #345366;border-radius:8px;padding:12px;margin-bottom:12px}.label{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#9cb7c5}.k{font-weight:700;color:#f0d39a}.log{max-height:230px;overflow:auto;font-size:12px;color:#b2c6d2}.log div{padding:6px 0;border-bottom:1px solid #294452}kbd{background:#304452;border-radius:3px;padding:2px 5px;font:inherit}.modal{position:fixed;z-index:20;inset:0;background:#03101acd;display:none;align-items:center;justify-content:center;padding:22px}.modal.open{display:flex}.modal-content{max-width:480px;width:100%;background:#172b38;border:1px solid #83a7af;border-radius:12px;padding:22px}.modal-content h2{margin:0 0 8px}.modal-content p{color:#aec5ce}.actions{display:flex;gap:9px;flex-wrap:wrap}#lightOverlay{pointer-events:none}#floor1{display:none}#catShape{filter:drop-shadow(0px 0px 7px #a9f3df77)}.waypoint{left:12px;bottom:12px;top:auto;right:auto;min-width:230px;color:#d7efd3}.planning-markers,.planning-zones{display:none!important}.planning-routes{display:none}.targetmarker{filter:drop-shadow(0 0 5px #e0d28e88)}.targetmarker circle{stroke-width:4}.targetmarker text{paint-order:stroke;stroke:#142633;stroke-width:3;stroke-linejoin:round;font-weight:800}select{background:#253b4a;color:var(--white);border:1px solid #58748a;padding:7px;width:100%;border-radius:5px;margin:4px 0 10px;font:inherit}.debuglabel{font-size:12px;color:#c9d8da;display:block}.zone-overlay{fill:#e3687c;fill-opacity:.055;stroke:#e3687c;stroke-width:3;stroke-dasharray:11 8}@media(max-width:960px){.app{grid-template-columns:1fr}.side{border-left:0;border-top:1px solid var(--line)}.stage{height:68vh;min-height:400px}}
</style></head><body>
<header class="top"><strong>Chapter 5 · Abandoned Warehouse</strong><span class="badge">Concept graybox · standalone v07</span><span class="small">Geometry from warehouse_geometry_v07.json · all positions in 1672×941 world coordinates</span></header>
<div class="app"><main class="stagecol"><div id="stage" class="stage" tabindex="0" aria-label="Playable warehouse graybox">
<svg id="world" xmlns="http://www.w3.org/2000/svg" viewBox="470 480 800 500" preserveAspectRatio="xMidYMid meet">__DEFS__
<g id="floor0">__L0__</g><g id="floor1">__L1__</g>
<g id="outcomeProps">__PROPS__</g>
<defs>
<radialGradient id="softMask"><stop offset="0" stop-color="#000"/><stop offset=".36" stop-color="#101010"/><stop offset=".75" stop-color="#888"/><stop offset="1" stop-color="#fff"/></radialGradient>
<mask id="darknessMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941"><rect x="0" y="0" width="1672" height="941" fill="white"/><circle id="catVisibility" cx="833" cy="882" r="108" fill="url(#softMask)"/>
<circle id="lampGlow1" cx="316" cy="582" r="245" fill="url(#softMask)" style="display:none"/><circle id="lampGlow2" cx="833" cy="557" r="262" fill="url(#softMask)" style="display:none"/><circle id="lampGlow3" cx="1420" cy="775" r="238" fill="url(#softMask)" style="display:none"/>__AMBIENT_LAMPS__</mask>
</defs>
<g id="lightOverlay"><rect x="0" y="0" width="1672" height="941" fill="#020a17" opacity=".87" mask="url(#darknessMask)"/></g>
<g id="navMarkers"></g><g id="zoneMarkers"></g>
<g id="catShape" transform="translate(833 882)"><path d="M-11 -13 L-15 -22 L-4 -18 L4 -18 L15 -22 L11 -13 A16 15 0 1 1 -11 -13" fill="#f7eacb" stroke="#293844" stroke-width="3"/><circle cx="-5" cy="-3" r="2" fill="#233547"/><circle cx="5" cy="-3" r="2" fill="#233547"/><path d="M-2 4 L0 6 L2 4" fill="none" stroke="#243845" stroke-width="1.8"/></g>
</svg>
<div class="overlay tophint" id="cameraStats">L0 · (833, 882)</div><div class="overlay hint" id="interactionHint">WASD move · E interact · C climb</div><div class="overlay waypoint" id="wayfinding">Guide: West lamp</div></div>
<div class="bar"><button id="focus">Focus game</button><button id="toggleLighting" class="active">Lighting: ON</button><button id="toggleZones" class="active">Zones: ON</button><button id="zoomIn">Zoom +</button><button id="zoomOut">Zoom −</button><button id="showMarkers" class="active">Markers: ON</button><button id="showRoutes">Routes: OFF</button><button id="reset">Reset prototype</button><span class="small">Move <kbd>WASD</kbd>/<kbd>↑↓←→</kbd> · interact <kbd>E</kbd> · climb <kbd>C</kbd> · light overlay <kbd>L</kbd> · reset <kbd>R</kbd></span></div>
</main><aside class="side"><h2>Movement / state</h2><p>Single world coordinate system. L1 occupies a short shelf-top route; the final bunker is reachable only through the boss gate.</p>
<div class="tile"><div class="label">Current floor</div><div id="floorValue" class="k">L0</div><div class="label" style="margin-top:9px">Objective</div><div id="objective">Activate the west lamp</div></div>
<div class="tile"><div class="label">Lighting stations</div><div id="lights">West OFF · Hub EAST · Secondary OFF</div><div class="label" style="margin-top:9px">Fixed events</div><div id="fixed">0 / 2 examined</div><div class="label" style="margin-top:9px">C1/C2 climbs</div><div id="climbs">0 / 2 used</div><div class="label" style="margin-top:9px">Random events</div><div id="encounters">0 / 2 encounters · 0 / 4 zone attempts</div></div>
<div class="tile"><div class="label">Prototype contract</div><p style="margin:6px 0">Clue ≥3 is an upstream requirement and is not simulated here. The two L1 fixed nodes are OPTIONAL (not boss prerequisites). The battle handoff is test-only. No event cards, rewards, or narrative text are reimplemented.</p></div>
<div class="tile"><div class="label">Existing event outcome visuals · preview controls</div><p class="small" style="margin:8px 0">These selectors simulate saved event flags for visual QA ONLY. They do not resolve event cards, roll dice, or grant rewards. The real game will read authoritative flags instead.</p>
<label class="debuglabel" for="supplyOutcome">Existing box-haul result · L0 loading bay</label>
<select id="supplyOutcome"><option value="">No outcome applied</option><option value="supply_post_built">Supply station built</option><option value="supply_post_paused">Unfinished station</option></select>
<label class="debuglabel" for="lookoutOutcome">Existing lookout result · L1</label>
<select id="lookoutOutcome"><option value="">No outcome applied</option><option value="watch_post_set">Watch post completed</option><option value="lookout_surveyed">Surveyed routes</option><option value="watch_post_one_route">Limited watch post</option><option value="watch_post_wet">Wet watch post</option><option value="lookout_partial">Partial survey</option><option value="lookout_recce">Route marked</option></select>
<label class="debuglabel" for="crateOutcome">Existing lamp-crate result · L1</label>
<select id="crateOutcome"><option value="">No outcome applied</option><option value="light_crate_found">Lamp recovered</option><option value="light_crate_dinged">Dented lamp</option><option value="finale_light_stashed">Lamp cache covered</option><option value="light_crate_stashed">Location marked</option><option value="light_stash_rough">Partly covered</option></select>
<button id="clearOutcomes" class="smallbtn">Clear visual preview flags</button>
<p id="outcomeStatus" class="small" style="margin:9px 0 0">No visual outcome flags set.</p></div>
<div class="tile"><div class="label">Test log</div><div class="log" id="log"><div>Ready. Entry corresponds to finale_intro_1–4.</div></div></div>
</aside></div>
<div id="fixedModal" class="modal"><div class="modal-content"><div class="label">Existing warehouse fixed event — preview only</div><h2 id="fixedTitle"></h2><p id="fixedDescription"></p><p class="small">The live game uses the existing event card, options, 2d6 result and rewards. This standalone only verifies the interaction point.</p><div class="actions"><button id="markFixed">Mark encountered</button><button id="closeFixed">Close</button></div></div></div>
<div id="battleModal" class="modal"><div class="modal-content"><h2>Finale boss handoff — prototype</h2><p>Authored location: <code>finale_intro_5 → finale_boss → finale_intro_6</code>. This dialog is only for testing the gate; the real battle is handled by the game server.</p><div class="actions"><button id="win">Simulate battle victory</button><button id="lose">Simulate battle defeat</button><button id="cancelBattle">Cancel</button></div></div></div>
<script>
'use strict';
const G=__GEOM__;
const world=document.querySelector('#world');const stage=document.querySelector('#stage');
const get=id=>document.getElementById(id);
const FIXED_TEXT={
 warehouse_lookout:{title:'货架顶的瞭望位',text:'最高一排货架的顶上,两脚兽留了一块没搬走的栈板——干净,平稳,还晒不到漏下来的雨。整座仓库,再没有第二个这样的位置。'},
 warehouse_light_crate:{title:'吊在半空的灯具箱',text:'行车吊钩上挂着一箱两脚兽的探照灯,离地三猫高,箱子破了一角,能看见里面成排的灯罩还挂着出厂的膜。终章要护送灯具逐段推进——这一箱,就是天生的军火库。'}
};
const state={visualFlags:new Set(),x:833,y:882,floor:'L0',radius:G.world.catRadius,west:false,east:false,hub:'west',won:false,visited:new Set(),attempted:new Set(),events:0,lighting:true,zones:true,markers:true,routes:false,zoom:770,climbed:new Set(),pendingFixed:null,notice:'',noticeUntil:0,modal:false};
const keys=new Set();const randChance=G.prototypePacing.randomZoneChance;
const polygons=G.walkable.L0;
function inPolygon(x,y,poly){let on=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])on=!on;}return on;}
function inRects(x,y,arr){return arr.some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);}
function insideFloor(x,y,layer){if(layer==='L1')return inRects(x,y,G.l1WalkableRectangles);return polygons.some(p=>inPolygon(x,y,p));}
function circleRectHit(x,y,r,rect){let dx=Math.max(rect.x-x,0,x-(rect.x+rect.w));let dy=Math.max(rect.y-y,0,y-(rect.y+rect.h));return dx*dx+dy*dy<r*r;}
function solidAt(x,y,layer){if(layer==='L1')return false;if(G.solids.some(v=>circleRectHit(x,y,state.radius,v)))return true;
 const boss=G.dynamicGates.boss;if(!state.won&&circleRectHit(x,y,state.radius,boss))return true;
 if(G.dynamicGates.shadow.some(g=>!((g.unlock==='entry_lamp'&&state.west)||(g.unlock==='secondary_lamp'&&state.east))&&circleRectHit(x,y,state.radius,g)))return true;return false;}
function canOccupy(x,y,layer){if(solidAt(x,y,layer))return false;
 for(let k=0;k<16;k++){const a=k*Math.PI/8;const sx=x+Math.cos(a)*state.radius,sy=y+Math.sin(a)*state.radius;if(!insideFloor(sx,sy,layer))return false;}return true;}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function near(list,rad=58){return list.filter(i=>i.floor===state.floor&&distance(state,i)<=rad).sort((a,b)=>distance(state,a)-distance(state,b))[0]||null;}
function nearestClimb(){return G.climbs.filter(i=>Math.hypot(i.x-state.x,i.y-state.y)<=54).sort((a,b)=>distance(state,a)-distance(state,b))[0]||null;}
function eventItems(){return G.interactions.filter(i=>i.kind!=='start');}
function showHint(s){state.notice=s;state.noticeUntil=performance.now()+2800;}
function log(s){const node=document.createElement('div');node.textContent=s;get('log').prepend(node);while(get('log').children.length>15)get('log').lastChild.remove();}
function interact(){if(state.modal)return;const i=near(eventItems());if(!i){showHint('Move closer to a marked E / B / X location');return;}
 switch(i.id){case 'entry_lamp':state.west=true;log('Entrance lamp activated (persistent).');break;
 case 'central_spotlight':state.hub=state.hub==='west'?'east':'west';log('Central spotlight redirected '+state.hub.toUpperCase()+'.');break;
 case 'secondary_lamp':state.east=true;log('Secondary lamp activated (persistent).');break;
 case 'warehouse_light_crate':case 'warehouse_lookout':openFixedEvent(i);return;
 case 'finale_boss':if(!(state.west&&state.east&&state.hub==='east')){showHint('Complete the light corridor: west + secondary ON, hub facing EAST');return;}if(state.won){showHint('Battle victory recorded. Proceed to the bunker exit.');return;}state.modal=true;get('battleModal').classList.add('open');keys.clear();return;
 case 'bunker_exit':if(state.won)log('Rescue / exit reached → finale_intro_6; ending continues at greenhouse.');else showHint('The mandatory boss must be defeated first.');break;
 }sync();}
function openFixedEvent(i){state.modal=true;state.pendingFixed=i.id;keys.clear();const copy=FIXED_TEXT[i.id];get('fixedTitle').textContent=copy.title;get('fixedDescription').textContent=copy.text;get('fixedModal').classList.add('open');}
function closeFixedEvent(mark){if(mark&&state.pendingFixed){state.visited.add(state.pendingFixed);log('Fixed node encountered: '+state.pendingFixed+' (preview only; no event rewards or dice simulated).');}state.pendingFixed=null;state.modal=false;get('fixedModal').classList.remove('open');sync();stage.focus();}
function climb(){if(state.modal)return;const c=nearestClimb();if(!c){showHint('Move close to C1 or C2');return;}const next=state.floor==='L0'?'L1':'L0';if(!canOccupy(c.x,c.y,next)){showHint('Climb destination obstructed');return;}
 state.floor=next;state.x=c.x;state.y=c.y;state.climbed.add(c.id);log(`${c.id}: switched to ${next}.`);showHint('Climbed '+c.id+' → '+next);sync();}
function updateZones(){if(state.floor!=='L0'||state.modal)return;
 for(const z of G.randomZones){if(state.attempted.has(z.id))continue;if(distance(state,z)>z.r)continue;
 state.attempted.add(z.id);if(state.events<2&&Math.random()<randChance){state.events++;log(`${z.id}: random encounter opportunity triggered (${state.events}/2). Card selection is server-owned.`);showHint(`${z.id} event opportunity — backend card pending`);}else{log(`${z.id}: attempt consumed, no encounter.`);}break;}}
// Production adapter contract: pass actual server-owned flags here. This function
// only updates decorative layers. It never calls an event or modifies event rewards.
function applyWarehouseVisualFlags(flags){
 const allowed=G.visualOutcomeMapping;
 state.visualFlags=new Set(Array.from(flags||[]).filter(flag=>Object.prototype.hasOwnProperty.call(allowed,flag)));
 sync();
}
function syncVisualOutcomes(){
 for(const node of document.querySelectorAll('#outcomeProps [data-flag]')){
   node.style.display=state.visualFlags.has(node.dataset.flag)&&node.dataset.floor===state.floor?'':'none';
 }
 const victory=get('outcomeProps').querySelector('[data-progression="boss-cleared"]');
 if(victory)victory.style.display=(state.floor==='L0'&&state.won)?'':'none';
 get('outcomeStatus').textContent=state.visualFlags.size
   ?'Active existing flags: '+[...state.visualFlags].join(', ')
   :'No visual outcome flags set.';
}
function sync(){get('floor0').style.display=state.floor==='L0'?'':'none';get('floor1').style.display=state.floor==='L1'?'':'none';get('floorValue').textContent=state.floor;renderMarkers();syncVisualOutcomes();
 for(const gate of [G.dynamicGates.boss,...G.dynamicGates.shadow]){const node=get('visual_'+gate.id);if(!node)continue;const cleared=gate.id==='boss_gate'?state.won:(gate.unlock==='entry_lamp'?state.west:state.east);node.style.display=cleared?'none':'';}
 get('lampGlow1').style.display=(state.floor==='L0'&&state.west)?'':'none';get('lampGlow2').style.display=(state.floor==='L0'&&state.hub==='east')?'':'none';get('lampGlow3').style.display=(state.floor==='L0'&&state.east)?'':'none';document.querySelectorAll('.ambientMask').forEach(n=>{n.style.display=(n.dataset.floor===state.floor)?'':'none';});
 get('lightOverlay').style.display=state.lighting?'':'none';get('lights').textContent=`West ${state.west?'ON':'OFF'} · Hub ${state.hub.toUpperCase()} · Secondary ${state.east?'ON':'OFF'}`;
 get('fixed').textContent=`${state.visited.size} / 2 examined`;get('climbs').textContent=`${state.climbed.size} / 2 used`;
 get('encounters').textContent=`${state.events} / 2 encounters · ${state.attempted.size} / 4 zone attempts`;
 get('objective').textContent=state.won?'Proceed to bunker exit':!state.west?'Activate entrance lighting':!state.east?'Explore and activate secondary lighting':state.hub!=='east'?'Orient central spotlight east':'Reach mandatory boss gate';
 get('toggleLighting').classList.toggle('active',state.lighting);get('toggleLighting').textContent='Lighting: '+(state.lighting?'ON':'OFF');get('toggleZones').classList.toggle('active',state.zones);get('toggleZones').textContent='Zones: '+(state.zones?'ON':'OFF');
 document.querySelectorAll('#zoneMarkers .zone-overlay').forEach(n=>{n.style.display=state.zones&&state.floor==='L0'?'':'none';});get('showMarkers').classList.toggle('active',state.markers);get('showMarkers').textContent='Markers: '+(state.markers?'ON':'OFF');get('showRoutes').classList.toggle('active',state.routes);get('showRoutes').textContent='Routes: '+(state.routes?'ON':'OFF');document.querySelectorAll('.planning-routes').forEach(n=>n.style.display=state.routes?'inline':'none');
}
function guideTarget(){
 if(!state.west)return G.interactions.find(i=>i.id==='entry_lamp');
 if(state.floor==='L1'&&!state.visited.has('warehouse_lookout'))return G.interactions.find(i=>i.id==='warehouse_lookout');
 if(state.floor==='L1'&&!state.visited.has('warehouse_light_crate'))return G.interactions.find(i=>i.id==='warehouse_light_crate');
 if(state.floor==='L1')return G.climbs.find(i=>i.id==='C2');
 // The two fixed L1 node events are OPTIONAL; never steer the main objective
 // toward them as prerequisites to the boss. They remain visible on L1.
 if(!state.east)return G.interactions.find(i=>i.id==='secondary_lamp');
 if(state.hub!=='east')return G.interactions.find(i=>i.id==='central_spotlight');
 if(!state.won)return G.interactions.find(i=>i.id==='finale_boss');
 return G.interactions.find(i=>i.id==='bunker_exit');
}
function guideHint(){const tgt=guideTarget();const deltaX=tgt.x-state.x,deltaY=tgt.y-state.y;
 const arrow=['→','↘','↓','↙','←','↖','↑','↗'][Math.round(((Math.atan2(deltaY,deltaX)+Math.PI*2)%(Math.PI*2))/(Math.PI/4))%8];
 const name=tgt.kind==='fixed_event'?FIXED_TEXT[tgt.id].title:(tgt.id==='C1'?'C1 · Shelf climb':tgt.label||tgt.id);
 return `Next: ${name}  ${arrow} ${Math.round(Math.hypot(deltaX,deltaY))}wu`;
}
const NS='http://www.w3.org/2000/svg';
function nodeSVG(tag, attrs){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
const allMarkers=[...G.interactions.filter(i=>i.kind==='fixed_event'||i.kind==='light'||i.kind==='battle'||i.kind==='exit'),...G.climbs.flatMap(c=>['L0','L1'].map(f=>({...c,id:c.id+'-'+f,floor:f,kind:'climb'})))];
for(const item of allMarkers){const g=nodeSVG('g',{class:'targetmarker'});g.dataset.floor=item.floor;g.dataset.x=item.x;g.dataset.y=item.y;g.dataset.id=item.id;
 const palette={fixed_event:'#8fdbf8',climb:'#c8a1ff',light:'#eccc85',battle:'#f98d94',exit:'#8ed9d3'};const hue=palette[item.kind]||'#ffffff';
 const c=nodeSVG('circle',{cx:item.x,cy:item.y,r:item.kind==='climb'?27:23,fill:'#162934',stroke:hue});g.appendChild(c);
 const t=nodeSVG('text',{x:item.x,y:item.y+5,'text-anchor':'middle','font-size':'17',fill:hue});t.textContent=item.kind==='climb'?'C':item.kind==='light'?'E':item.kind==='battle'?'B':item.kind==='exit'?'X':'E';g.appendChild(t);
 const name=nodeSVG('text',{x:item.x,y:item.y-37,'text-anchor':'middle','font-size':'16',fill:'#f5f0e4'});name.textContent=item.kind==='climb'?item.id.replace(/-L[01]$/,'')+' CLIMB':item.kind==='fixed_event'?FIXED_TEXT[item.id].title:item.label;g.appendChild(name);
 get('navMarkers').appendChild(g);}
for(const z of G.randomZones){const n=nodeSVG('circle',{cx:z.x,cy:z.y,r:z.r,class:'zone-overlay'});get('zoneMarkers').appendChild(n);}
function renderMarkers(){for(const g of get('navMarkers').children){const d=Math.hypot(Number(g.dataset.x)-state.x,Number(g.dataset.y)-state.y);g.style.display=state.markers&&g.dataset.floor===state.floor&&d<330?'':'none';}}
function focusHint(){let i=near(eventItems());const c=nearestClimb();if(state.notice&&performance.now()<state.noticeUntil)return state.notice;
 if(i&&(!c||distance(state,i)<distance(state,c)))return `E · ${i.label}`;
 if(c)return `C · ${state.floor==='L0'?'Climb to L1':'Descend to L0'} (${c.id})`;
 return 'WASD · Explore shared aisles | E · Interact | C · Climb';}
function tick(t){const dt=Math.min((t-(tick.last||t))/1000,.05);tick.last=t; if(!state.modal){let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
 let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);const len=Math.hypot(dx,dy)||1;dx=dx/len*172*dt;dy=dy/len*172*dt;
 if(dx||dy){const increments=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/3));for(let k=0;k<increments;k++){if(canOccupy(state.x+dx/increments,state.y,state.floor))state.x+=dx/increments;if(canOccupy(state.x,state.y+dy/increments,state.floor))state.y+=dy/increments;}updateZones();}}
 const ratio=Math.max(.7,stage.clientWidth/Math.max(1,stage.clientHeight));const cw=Math.min(state.zoom,G.world.width,G.world.height*ratio);const ch=cw/ratio;let camX=Math.max(0,Math.min(G.world.width-cw,state.x-cw*.5));let camY=Math.max(0,Math.min(G.world.height-ch,state.y-ch*.53));
 world.setAttribute('viewBox',`${camX.toFixed(2)} ${camY.toFixed(2)} ${cw} ${ch.toFixed(2)}`);get('catShape').setAttribute('transform',`translate(${state.x.toFixed(2)} ${state.y.toFixed(2)})`);get('catVisibility').setAttribute('cx',state.x);get('catVisibility').setAttribute('cy',state.y);
 get('cameraStats').textContent=`${state.floor} · (${Math.round(state.x)}, ${Math.round(state.y)}) · ${Math.round(cw)}wu view`;
 get('interactionHint').textContent=focusHint();get('wayfinding').textContent=guideHint();renderMarkers();requestAnimationFrame(tick);}
function reset(){Object.assign(state,{x:833,y:882,floor:'L0',west:false,east:false,hub:'west',won:false,visited:new Set(),attempted:new Set(),climbed:new Set(),events:0,notice:'',modal:false,visualFlags:new Set()});
 for(const id of ['supplyOutcome','lookoutOutcome','crateOutcome'])get(id).value='';keys.clear();get('battleModal').classList.remove('open');get('fixedModal').classList.remove('open');log('Prototype reset.');sync();stage.focus();}
window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();if(key==='e'&&!e.repeat)interact();else if(key==='c'&&!e.repeat)climb();else if(key==='r'&&!e.repeat)reset();else if(key==='l'&&!e.repeat){state.lighting=!state.lighting;sync();}keys.add(key);});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
get('focus').onclick=()=>stage.focus();get('toggleLighting').onclick=()=>{state.lighting=!state.lighting;sync();};get('toggleZones').onclick=()=>{state.zones=!state.zones;sync();};get('zoomIn').onclick=()=>{state.zoom=Math.max(440,state.zoom-110);};get('zoomOut').onclick=()=>{state.zoom=Math.min(1400,state.zoom+110);};get('showMarkers').onclick=()=>{state.markers=!state.markers;sync();};get('showRoutes').onclick=()=>{state.routes=!state.routes;sync();};get('reset').onclick=reset;
for(const id of ['supplyOutcome','lookoutOutcome','crateOutcome'])get(id).onchange=()=>{
 applyWarehouseVisualFlags(['supplyOutcome','lookoutOutcome','crateOutcome'].map(key=>get(key).value).filter(Boolean));
 log('DEBUG ONLY: visual preview flags changed; no event outcomes or rewards applied.');
};
get('clearOutcomes').onclick=()=>{
 for(const id of ['supplyOutcome','lookoutOutcome','crateOutcome'])get(id).value='';
 applyWarehouseVisualFlags([]);
};
// Called by a future authoritative state adapter. Explicitly kept separate
// from random/fixed event code and test-only success/defeat simulation.
window.previewWarehouseVisualFlags=flags=>{
 applyWarehouseVisualFlags(flags);
 for(const id of ['supplyOutcome','lookoutOutcome','crateOutcome']){
   const el=get(id);el.value=[...state.visualFlags].find(f=>Array.from(el.options).some(o=>o.value===f))||'';
 }
};
get('markFixed').onclick=()=>closeFixedEvent(true);get('closeFixed').onclick=()=>closeFixedEvent(false);get('win').onclick=()=>{state.won=true;state.modal=false;get('battleModal').classList.remove('open');log('TEST ONLY: simulated finale_boss victory; boss gate opened.');sync();stage.focus();};get('lose').onclick=()=>{state.modal=false;get('battleModal').classList.remove('open');log('TEST ONLY: simulated battle defeat; gate stays locked.');stage.focus();};get('cancelBattle').onclick=()=>{state.modal=false;get('battleModal').classList.remove('open');stage.focus();};
sync();stage.focus();requestAnimationFrame(tick);
</script></body></html>'''
ambient=''.join(f'<circle class="ambientMask" data-floor="{v["floor"]}" cx="{v["x"]}" cy="{v["y"]}" r="{v["r"]}" fill="url(#softMask)" />' for v in G['ambientLamps'])
html=html.replace('__AMBIENT_LAMPS__',ambient)
html=html.replace('__PROPS__',props)
html=html.replace('__DEFS__',a_defs).replace('__L0__',a).replace('__L1__',b).replace('__GEOM__',json.dumps(G,ensure_ascii=False))
(DIR/'warehouse_playtest_v07.html').write_text(html)
print('wrote playtest bytes',len(html.encode()))
