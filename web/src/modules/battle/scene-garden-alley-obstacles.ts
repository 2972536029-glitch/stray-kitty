/** Shared by the combat canvas and its exterior backdrop; coordinates use 80 px cells. */
export const ALLEY_JOINED_OBSTACLE_CELLS:readonly {x:number;y:number}[]=[{x:4,y:0},{x:4,y:1},{x:4,y:2}];
export const GREENHOUSE_JOINED_OBSTACLE_CELLS:readonly {x:number;y:number}[]=[{x:2,y:2},{x:2,y:3},{x:3,y:3}];
type Context=CanvasRenderingContext2D;
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
function blocks(ctx:Context,color:string,items:readonly number[][]){for(const [x,y,w,h] of items)r(ctx,color,x,y,w,h);}

/** A single storage wing joins the building east of the three blocked alley cells.
 * Its complete silhouette stays within x=320..440, y=0..240, clear of both lanes. */
export function paintAlleyObstacleScenery(ctx:Context){
  ctx.save();ctx.imageSmoothingEnabled=false;
  // One uninterrupted wall and roof cover the two former internal tile seams.
  blocks(ctx,'#172f383e',[[325,222,113,14],[330,236,102,3]]);
  r(ctx,'#233944',323,8,117,221);
  r(ctx,'#3a505b',329,82,111,142);
  for(let row=0;row<11;row++){
    const y=86+row*12;r(ctx,'#233a446e',329,y,111,1);
    for(let x=329+(row%2?14:0);x<439;x+=31){
      r(ctx,'#243b447a',x,y,1,11);
      if(x+21<440)r(ctx,'#80918a32',x+3,y+2,17,1);
    }
  }
  // The roof reaches into the missing cells, where the backdrop draws its continuation.
  r(ctx,'#273f49',324,9,116,76);r(ctx,'#485e68',328,12,112,68);
  for(let y=19;y<77;y+=11){
    r(ctx,'#2a424a99',328,y,112,2);
    for(let x=335+(Math.floor(y/11)%2)*13;x<429;x+=29){r(ctx,'#8c9d9145',x,y-4,15,1);r(ctx,'#263e4899',x,y-4,1,4);}
  }
  blocks(ctx,'#627378',[[348,26,32,19],[350,24,27,2]]);
  blocks(ctx,'#a6a68b4f',[[351,27,25,1],[352,31,3,2],[372,39,3,2]]);
  r(ctx,'#273e47',322,80,118,9);r(ctx,'#7e8d87',324,81,116,2);r(ctx,'#526973',324,84,116,3);
  // One shutter, one small window and a continuous downpipe make a building facade.
  r(ctx,'#213943',357,128,57,92);r(ctx,'#736c56',361,132,49,83);
  for(let y=137;y<213;y+=8){r(ctx,'#3d4944',361,y,49,2);r(ctx,'#aaa07c5c',362,y-2,47,1);}
  blocks(ctx,'#344a50',[[361,132,3,83],[407,132,3,83],[375,184,22,4]]);
  blocks(ctx,'#aaa17d',[[379,185,14,1],[387,189,2,4]]);
  r(ctx,'#253c43',352,96,65,24);r(ctx,'#45636a',356,99,57,17);
  blocks(ctx,'#94b1a258',[[358,100,3,13],[362,101,17,2],[397,101,13,1]]);
  blocks(ctx,'#283f44',[[382,99,3,17],[355,114,59,3]]);
  r(ctx,'#839184',351,119,67,2);r(ctx,'#263e46',351,121,67,3);
  blocks(ctx,'#223b44',[[334,87,6,133],[337,214,12,6]]);
  blocks(ctx,'#8b9b9277',[[335,89,1,124],[336,98,4,2],[336,169,4,2]]);
  // The worn plinth is continuous, not three separate object bases.
  r(ctx,'#253c45',322,219,118,12);r(ctx,'#667870',324,219,116,3);r(ctx,'#40554f',324,223,116,6);
  blocks(ctx,'#7d89714f',[[342,223,18,2],[423,224,12,2],[376,228,25,1]]);
  blocks(ctx,'#40584a',[[326,213,5,9],[329,219,11,3],[414,226,13,3]]);
  ctx.restore();
}

function gardenLeaves(ctx:Context,x:number,y:number,size:number){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  blocks(ctx,'#314f37',[[-14,-6,28,8],[-10,-14,21,10],[-3,-21,8,12]]);
  blocks(ctx,'#58774a',[[-12,-6,9,5],[-8,-13,7,9],[-2,-19,5,12],[4,-11,7,8],[6,-3,7,4]]);
  blocks(ctx,'#92a374',[[-7,-12,2,6],[-1,-18,2,8],[6,-10,4,1],[-10,-5,4,1]]);
  r(ctx,'#728756',0,-8,2,13);ctx.restore();
}

/** One L-shaped raised cold frame, with a shared soil bed and damaged glazing.
 * The playable northeast notch (3,2) is completely outside its silhouette. */
export function paintGreenhouseObstacleScenery(ctx:Context){
  ctx.save();ctx.imageSmoothingEnabled=false;
  // Overlapping arms form one foundation; the old y=240 and x=240 seams disappear.
  blocks(ctx,'#1d352c45',[[163,166,74,151],[237,244,80,73],[168,317,145,2]]);
  blocks(ctx,'#344839',[[165,164,71,151],[231,244,84,71]]);
  blocks(ctx,'#6a6d50',[[171,169,59,128],[226,250,83,47]]);
  blocks(ctx,'#45462f',[[177,175,47,118],[222,255,80,38]]);
  blocks(ctx,'#6c624141',[[181,186,33,26],[184,254,22,32],[241,264,37,17]]);
  // Low upright stone front and side faces carry the whole L shape.
  r(ctx,'#596348',168,294,144,19);r(ctx,'#2e4537',168,309,144,5);
  for(let x=171;x<306;x+=24){r(ctx,'#344937',x,296,1,13);r(ctx,'#8991744d',x+3,297,16,1);}
  r(ctx,'#344b38',167,171,7,122);r(ctx,'#818b68',167,170,3,123);
  r(ctx,'#42583d',228,172,6,75);r(ctx,'#99a58270',228,172,2,72);
  r(ctx,'#334b36',306,251,7,44);r(ctx,'#84946a',307,252,2,41);
  // Glazing is one long cold-frame lid turning the corner, not one pot per tile.
  blocks(ctx,'#61847c50',[[178,177,45,109],[224,255,77,31]]);
  blocks(ctx,'#9bb5a537',[[181,180,7,46],[190,181,16,3],[181,237,5,35],[244,257,32,3],[290,264,4,14]]);
  blocks(ctx,'#4b6651',[[173,170,56,5],[173,175,4,116],[221,175,5,77],[225,249,82,5],[302,250,4,42],[175,289,130,5]]);
  blocks(ctx,'#8f9f7d',[[174,170,55,1],[174,176,1,110],[223,176,1,68],[228,250,76,1],[176,289,126,1]]);
  blocks(ctx,'#526d57',[[177,224,45,4],[197,176,3,47],[200,228,3,60],[252,254,3,35]]);
  // The missing panes expose soil and a few jagged glass remnants around the bend.
  blocks(ctx,'#41462e',[[205,234,14,39],[220,259,21,27],[237,268,13,18]]);
  blocks(ctx,'#9ab5a579',[[207,234,11,3],[207,237,7,3],[208,240,4,3],[222,260,4,8],[226,263,4,8],[230,267,5,7],[238,279,9,3]]);
  blocks(ctx,'#c0c9a96b',[[208,234,9,1],[222,260,1,7],[230,267,4,1],[240,279,6,1]]);
  // Uneven planting connects across the bend and leaves visible bare soil.
  gardenLeaves(ctx,190,216,.85);gardenLeaves(ctx,211,275,.72);gardenLeaves(ctx,281,280,1.05);
  blocks(ctx,'#7c7c50',[[186,250,2,21],[181,253,6,2],[188,259,7,2],[193,254,2,6]]);
  blocks(ctx,'#aba378',[[182,252,3,1],[193,254,1,4]]);
  blocks(ctx,'#918b6a',[[181,282,9,4],[242,281,6,3],[262,273,4,3]]);
  blocks(ctx,'#b1aa824f',[[182,282,6,1],[243,281,4,1]]);
  blocks(ctx,'#41573b',[[170,301,17,4],[174,305,8,3],[291,301,15,3]]);
  ctx.restore();
}
