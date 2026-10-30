import {paintDetailedJoinedObstacle} from './scene-detailed-exteriors';
/** Shared by the combat canvas and its exterior backdrop; coordinates use 80 px cells. */
export const ALLEY_JOINED_OBSTACLE_CELLS:readonly {x:number;y:number}[]=[{x:4,y:0},{x:4,y:1},{x:4,y:2}];
export const GREENHOUSE_JOINED_OBSTACLE_CELLS:readonly {x:number;y:number}[]=[{x:2,y:2},{x:2,y:3},{x:3,y:3}];
type Context=CanvasRenderingContext2D;
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
function blocks(ctx:Context,color:string,items:readonly number[][]){for(const [x,y,w,h] of items)r(ctx,color,x,y,w,h);}
function silhouette(ctx:Context,color:string,points:readonly (readonly [number,number])[]){
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(const [x,y] of points.slice(1))ctx.lineTo(x,y);
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function refuseBag(ctx:Context,x:number,y:number,size:number,light=false){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  blocks(ctx,'#20393448',[[3,34,29,5],[7,39,21,1]]);
  silhouette(ctx,'#2d423e',[[12,7],[22,7],[22,10],[26,10],[26,14],[29,14],[29,19],[32,19],[32,26],[33,26],[33,33],[30,33],[30,36],[25,36],[25,38],[8,38],[8,36],[4,36],[4,32],[2,32],[2,23],[4,23],[4,17],[7,17],[7,12],[12,12]]);
  silhouette(ctx,light?'#66756a':'#4c6259',[[12,10],[21,10],[21,13],[25,13],[25,17],[28,17],[28,24],[30,24],[30,32],[26,32],[26,35],[9,35],[9,33],[6,33],[6,24],[8,24],[8,17],[12,17]]);
  blocks(ctx,light?'#839080':'#748579',[[11,15,2,5],[9,20,1.5,7],[8,28,1,4],[14,11,4,1],[12,13,1,4],[10,33,11,.5]]);
  blocks(ctx,'#293f3a70',[[20,13,1,5],[21,18,1,7],[22,25,1.5,7],[25,32,3,.5],[14,27,.5,7],[15,22,.5,5]]);
  blocks(ctx,'#a1aa8b52',[[11,19,.5,4],[9.5,27,.5,4],[16,12,1,.5],[16,33,4,.5]]);
  blocks(ctx,'#3b5147',[[13,5,8,5],[12,2,4,4],[19,3,4,3]]);
  blocks(ctx,'#8c9679',[[13,7,8,1],[14,3,1,3],[20,4,1,2]]);
  ctx.restore();
}
function cardboard(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#273b344d',x+1,y+h-3,w+1,5);
  r(ctx,'#4c4e3e',x,y+5,w,h-5);r(ctx,'#8c7a57',x+1,y+6,w-2,h-8);
  r(ctx,'#645b43',x+w-9,y+6,8,h-8);r(ctx,'#b0a07a',x+2,y+6,w-12,1);
  r(ctx,'#4b4834',x+4,y+2,w-9,8);r(ctx,'#76684b',x+5,y+3,w-11,5);
  silhouette(ctx,'#aa9570',[[x,y+5],[x+4,y],[x+w-11,y],[x+w-8,y+5],[x+w-11,y+7],[x+4,y+6]]);
  silhouette(ctx,'#7c6b4b',[[x+w-8,y+5],[x+w-5,y+1],[x+w,y+3],[x+w,y+11],[x+w-6,y+9]]);
  blocks(ctx,'#c2b28b85',[[x+4,y+1,w-17,.5],[x+3,y+11,.5,h-16],[x+7,y+h-5,w-20,.5]]);
  blocks(ctx,'#454a3690',[[x+w-9,y+10,.5,h-14],[x+7,y+16,8,.5],[x+10,y+17,5,.5],[x+w-5,y+h-7,2,1]]);
  blocks(ctx,'#b2a988',[[x+w*.4,y+7,3,h-10],[x+w*.4-1,y+3,4,3]]);
  r(ctx,'#d0c4a54d',x+w*.4+.5,y+9,.5,h-14);
}
function oldBucket(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#213a3745',x+2,y+h-3,w-3,5);
  r(ctx,'#344d49',x+1,y+5,w-2,h-7);r(ctx,'#667c70',x+3,y+6,w-6,h-10);
  r(ctx,'#85958a',x+4,y+7,1,h-13);r(ctx,'#3f5850',x+w-7,y+7,4,h-11);
  blocks(ctx,'#3b514b',[[x+3,y+2,w-6,2],[x+1,y+4,w-2,4],[x+3,y+h-4,w-6,2]]);
  blocks(ctx,'#a3ad95',[[x+3,y+3,w-6,1],[x+1,y+5,2,1],[x+w-3,y+5,1,1],[x+5,y+h-4,w-12,.5]]);
  r(ctx,'#293f3b',x+4,y+5,w-8,3);r(ctx,'#556c5f',x+5,y+7,w-10,.5);
  blocks(ctx,'#928467',[[x+6,y+13,3,1],[x+7,y+14,1,3],[x+w-9,y+h-10,3,1],[x+w-8,y+h-9,1,2]]);
  blocks(ctx,'#a1ad916e',[[x,y+10,1,8],[x+1,y+17,2,.5],[x+w-1,y+9,1,8]]);
}
function bottle(ctx:Context,x:number,y:number,color:string){
  r(ctx,'#243d3449',x,y+13,7,2);
  blocks(ctx,'#2f493e',[[x+2,y,3,4],[x+1,y+4,5,2],[x,y+6,7,8]]);
  blocks(ctx,color,[[x+2.5,y+1,2,3],[x+1,y+6,5,7]]);
  blocks(ctx,'#c1c5a665',[[x+2,y+6,.5,5],[x+3,y+1,1,.5],[x+1,y+12,4,.5]]);
  r(ctx,'#a5a48a',x+1,y+8,5,3);r(ctx,'#767f665c',x+2,y+9,3,.5);
}

/** One low household corner beside the eastern house. Every pixel stays within
 * x=320..440, y=0..240, clear of the narrow lane and the main road. */
export function paintAlleyObstacleScenery(ctx:Context){
  if(paintDetailedJoinedObstacle(ctx,'refuse'))return;
  ctx.save();ctx.imageSmoothingEnabled=false;
  // Shared low curb and drain connect the piles across the former tile seams.
  blocks(ctx,'#293c3740',[[330,22,110,208],[325,227,112,9]]);
  blocks(ctx,'#52625738',[[341,29,89,78],[341,110,84,111]]);
  blocks(ctx,'#2d4546',[[323,17,7,215],[326,13,114,10],[326,222,114,10]]);
  blocks(ctx,'#667971',[[324,17,4,212],[328,14,112,3],[328,223,112,3]]);
  blocks(ctx,'#9da58a80',[[324,18,.5,209],[328,14,112,.5],[328,223,112,.5]]);
  for(const y of [39,66,103,137,176,205]){r(ctx,'#344e4775',324,y,4,.5);r(ctx,'#acb1963d',325,y+1.5,2,.5);}
  blocks(ctx,'#203b3a66',[[330,24,8,196],[338,214,91,6]]);
  blocks(ctx,'#70877b61',[[331,25,.5,188],[332,215,93,.5]]);
  r(ctx,'#314b48',330,182,8,26);
  for(let y=185;y<207;y+=3){r(ctx,'#1f3939',331,y,6,1);r(ctx,'#8a99845e',331,y-.5,6,.5);}
  blocks(ctx,'#5f7c682e',[[333,70,2,37],[332,102,3,41],[333,141,2,26],[338,215,27,1]]);
  oldBucket(ctx,395,31,32,39);
  blocks(ctx,'#7b8270',[[397,27,28,4],[400,25,22,2]]);
  blocks(ctx,'#a9b09a78',[[401,25,18,.5],[398,28,24,.5]]);
  blocks(ctx,'#324d45',[[409,25,8,1],[406,24,10,1]]);
  refuseBag(ctx,345,61,.98,true);refuseBag(ctx,372,80,1.12);
  // Paper and irregular pile heights avoid one object centred in each cell.
  blocks(ctx,'#3e51413b',[[342,118,32,9],[352,125,24,4]]);
  silhouette(ctx,'#a3a58a',[[344,113],[363,115],[370,120],[367,126],[350,124],[341,119]]);
  blocks(ctx,'#d1cdb04f',[[345,114,10,.5],[348,116,14,.5],[350,120,11,.5]]);
  blocks(ctx,'#70796589',[[346,117,8,.5],[354,118,10,.5],[351,121,8,.5],[365,120,.5,4]]);
  cardboard(ctx,362,131,43,35);cardboard(ctx,404,155,27,27);
  silhouette(ctx,'#8e9278',[[344,167],[358,164],[365,169],[360,177],[346,175]]);
  blocks(ctx,'#bac0a070',[[347,168,10,.5],[349,170,10,.5],[348,173,7,.5]]);
  refuseBag(ctx,344,179,.91);
  oldBucket(ctx,407,187,24,29);bottle(ctx,389,201,'#647856');bottle(ctx,398,198,'#658476');
  blocks(ctx,'#6c8173',[[379,207,7,9],[380,205,5,2]]);
  blocks(ctx,'#b2b79a',[[380,205,5,.5],[380,208,.5,6],[380,214,4,.5]]);
  // Wear is concentrated at contact points rather than spread across the floor.
  blocks(ctx,'#617b5359',[[329,220,8,2],[334,218,3,3],[422,218,9,1],[427,216,3,2]]);
  blocks(ctx,'#91a2764a',[[330,220,3,.5],[424,218,4,.5],[426,216,1,.5]]);
  ctx.restore();
}

function gardenLeaves(ctx:Context,x:number,y:number,size:number){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  blocks(ctx,'#263e2e3b',[[-13,1,25,3],[-8,4,15,1]]);
  // Narrow, individual leaf blades replace the broad block-shaped crowns.
  const blades:readonly (readonly (readonly [number,number])[])[]=[
    [[-1,-12],[-5,-13],[-9,-18],[-10,-21],[-6,-19],[-2,-15]],
    [[1,-16],[3,-21],[7,-26],[9,-27],[9,-23],[5,-18]],
    [[2,-11],[5,-16],[11,-18],[14,-18],[11,-14],[6,-11]],
    [[-2,-3],[-6,-4],[-11,-8],[-14,-12],[-9,-11],[-4,-7]],
    [[2,-3],[7,-8],[12,-9],[14,-8],[10,-5],[5,-2]],
    [[0,-19],[-2,-24],[-1,-29],[1,-31],[3,-27],[2,-22]],
  ];
  blades.forEach((points,index)=>silhouette(ctx,index%2?'#577447':'#3f623d',points));
  blocks(ctx,'#78945d',[[-8,-19,1,2],[-7,-17,1,2],[-6,-15,1.5,1],[7,-24,.5,3],[5,-21,1,2],[3,-18,1,2],[10,-17,2,.5],[7,-15,2,.5],[-10,-10,1.5,1],[-8,-8,2,.5],[8,-7,3,.5],[-.5,-28,.5,5]]);
  blocks(ctx,'#a5b68170',[[-8,-19,.5,1],[7,-25,.5,2],[10,-17,2,.5],[-10,-10,1,.5],[9,-7,2,.5],[0,-28,.5,2]]);
  blocks(ctx,'#7c8f5a',[[0,-18,.75,20],[-1,-10,1,7],[-2,-7,1,3],[1,-16,1,3],[2,-17,1,2],[1,-6,2,.5]]);
  ctx.restore();
}
function soilGrains(ctx:Context){
  // Authored patches, stone fragments and root fibres leave most soil unmarked.
  for(const [x,y,w] of [[183,184,3],[211,194,2],[188,226,4],[181,249,2],[215,279,3],[239,273,2],[268,263,3],[293,283,2]]){
    r(ctx,'#262e245e',x-1,y+1,w+2,1);r(ctx,'#867a555f',x,y,w,.5);
  }
  blocks(ctx,'#8e82635c',[[185,263,4,.5],[189,263,.5,3],[190,267,3,.5],[266,282,6,.5],[271,279,.5,3]]);
  silhouette(ctx,'#7c7960',[[181,281],[185,280],[188,282],[187,284],[181,284]]);
  blocks(ctx,'#b0a78362',[[182,281,3,.5],[243,280,3,.5],[291,268,2,.5]]);
  blocks(ctx,'#4e593a',[[206,205,1,3],[207,205,2,.5],[291,267,3,2],[242,280,5,2]]);
}

/** One L-shaped raised cold frame. Half-pixel seams and wear belong to materials,
 * while the intact northeast notch (3,2) remains outside the full silhouette. */
export function paintGreenhouseObstacleScenery(ctx:Context){
  if(paintDetailedJoinedObstacle(ctx,'cold-frame'))return;
  ctx.save();ctx.imageSmoothingEnabled=false;
  blocks(ctx,'#1d352c45',[[163,166,74,151],[237,244,80,73],[168,317,145,2]]);
  blocks(ctx,'#344839',[[165,164,71,151],[231,244,84,71]]);
  blocks(ctx,'#6a6d50',[[171,169,59,128],[226,250,83,47]]);
  blocks(ctx,'#45462f',[[177,175,47,118],[222,255,80,38]]);
  silhouette(ctx,'#5d593c48',[[180,183],[205,181],[216,191],[210,201],[184,204],[179,195]]);
  silhouette(ctx,'#313c2b48',[[182,242],[198,244],[205,264],[197,281],[181,277]]);
  silhouette(ctx,'#6d604126',[[234,263],[269,258],[295,266],[293,282],[267,284],[242,278]]);
  soilGrains(ctx);gardenLeaves(ctx,190,216,.85);gardenLeaves(ctx,281,280,1.05);
  // Slim stone courses and irregular chipped mortar retain a substantial base.
  r(ctx,'#596348',168,294,144,19);r(ctx,'#2e4537',168,310,144,4);
  r(ctx,'#93a17b70',169,294,141,.5);r(ctx,'#394d365e',169,302,141,.5);
  for(const [x,y,w] of [[174,296,21],[201,296,24],[232,296,18],[257,296,24],[288,296,19],[182,304,25],[215,304,27],[251,304,24],[283,304,23]]){
    r(ctx,'#33493780',x,y,.5,6);r(ctx,'#a0a78338',x+2,y,w-4,.5);
  }
  blocks(ctx,'#344b38',[[167,171,7,122],[228,172,6,75],[306,251,7,44]]);
  blocks(ctx,'#7c8b65',[[167,170,2,123],[228,172,1.5,72],[307,252,1.5,41]]);
  blocks(ctx,'#b4bd9450',[[167,172,.5,118],[228,175,.5,67],[307,253,.5,39]]);
  // Plants sit under lightly layered glass, with directional reflection kept sparse.
  blocks(ctx,'#648b831f',[[178,177,45,109],[224,255,77,31]]);
  blocks(ctx,'#97b5a91a',[[179,178,17,45],[179,229,20,56],[256,256,44,13]]);
  blocks(ctx,'#b1cbc136',[[181,179,1,42],[183,180,.5,33],[185,180,7,.5],[181,231,1,41],[183,234,.5,20],[258,257,38,.5],[294,260,.5,18]]);
  blocks(ctx,'#3d655852',[[218,180,3,42],[218,230,3,52],[256,283,43,2]]);
  // Cold-frame ironwork: dark rebate, half-pixel edge light, hinges and local rust.
  blocks(ctx,'#354c3e',[[173,170,56,4],[173,174,3.5,117],[222,174,4,78],[225,249,82,4],[302,250,4,42],[175,289,130,5]]);
  blocks(ctx,'#667960',[[174,171,54,1.5],[174,175,1.5,113],[223,175,1.5,72],[228,250,76,1.5],[303,253,1.5,35],[176,290,127,1.5]]);
  blocks(ctx,'#a6b18e80',[[174,171,54,.5],[174,176,.5,110],[223,176,.5,68],[228,250,76,.5],[303,254,.5,33],[176,290,126,.5]]);
  blocks(ctx,'#3e5948',[[177,224,45,2.5],[197,176,2,47],[200,228,2,60],[252,254,2,35]]);
  blocks(ctx,'#90a18470',[[178,224.5,42,.5],[197.5,178,.5,43],[200.5,229,.5,57],[252.5,256,.5,31]]);
  for(const [x,y] of [[177,171],[219,171],[174,226],[223,246],[254,250],[300,250],[201,290],[301,290]]){
    r(ctx,'#a28a6070',x,y,2.5,1);r(ctx,'#68583d90',x+.5,y+1,1,2);r(ctx,'#c0b18a65',x,y,1,.5);
  }
  blocks(ctx,'#394c3d',[[186,168.5,7,3],[211,168.5,7,3],[269,248,7,3]]);
  blocks(ctx,'#a5ad8b',[[187,169,5,.5],[212,169,5,.5],[270,248.5,5,.5]]);
  // Missing panes have angular remnants instead of solid stair-shaped glass blocks.
  silhouette(ctx,'#40452f',[[205,234],[219,234],[220,260],[240,263],[247,278],[241,287],[205,287]]);
  silhouette(ctx,'#7eaa9571',[[205,234],[218,234],[213,240],[214,249],[209,244],[207,247]]);
  silhouette(ctx,'#95b3a45c',[[222,256],[229,263],[228,271],[223,266],[221,273]]);
  silhouette(ctx,'#8aa99a65',[[234,279],[246,277],[243,284],[239,282],[236,285]]);
  blocks(ctx,'#c3d2bb91',[[206,234,11,.5],[212,240,.5,7],[222,257,.5,7],[223,266,1,.5],[239,279,4,.5]]);
  // Thin broken lines stay local to two panes, leaving the other glass quiet.
  blocks(ctx,'#c4d2bd6b',[[207,186,.5,5],[205,191,2,.5],[204.5,191,.5,4],[202,195,2.5,.5],[201.5,196,.5,3],[207.5,190,3,.5],[210.5,190,.5,2],[272,265,4,.5],[276,265,.5,4],[277,269,3,.5],[280,269,.5,3],[276,269,.5,5]]);
  // One shoot rises through the missing pane; thin dry stems contrast with live leaves.
  gardenLeaves(ctx,213,280,.65);
  blocks(ctx,'#837e55',[[185.5,248,.75,22],[181,252,5,.5],[180.5,249,.5,3],[186,258,7,.5],[192.5,254,.5,4],[184,263,2,.5]]);
  blocks(ctx,'#b2aa795c',[[186,249,.5,16],[181,250,.5,2],[192.5,254,.5,2]]);
  blocks(ctx,'#435b3b',[[170,301,9,2],[174,303,3,3],[178,301,8,.5],[295,301,10,1],[299,302,4,2]]);
  blocks(ctx,'#8fa06c59',[[171,301,3,.5],[175,303,1,.5],[297,301,4,.5]]);
  ctx.restore();
}
