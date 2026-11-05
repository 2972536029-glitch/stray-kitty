// Stamp the seven static props once, then use drawImage.
// The existing animated dog is drawn by IntegratedRainyAlley, not duplicated here.
import {drawPixelCat} from '../../adapters/canvas/pixelCat';

export const propIds = ['alley_puddle_reflection','alley_empty_fish_can','alley_fish_dry','alley_crate','alley_poster','alley_scratch_marks','alley_blanket_stack'] as const;
export const cellSize = 40;
let atlas: HTMLCanvasElement | undefined;
export function eventPropAtlas() {
  if (atlas) return atlas;
  atlas = document.createElement('canvas'); atlas.width = propIds.length * cellSize; atlas.height = cellSize;
  const c = atlas.getContext('2d')!; c.imageSmoothingEnabled = false;
  const rect = (color: string, x: number, y: number, w: number, h: number) => {c.fillStyle=color;c.fillRect(x,y,w,h);};
  for (const [i,id] of propIds.entries()) {
    c.save();c.translate(i*cellSize,0);
    // Preserve pixel shapes and shaded faces, but separate props from the blue/gold map.
    // Weathered metal, linen and faded green sit in the scene rather than floating like UI icons.
    const edge='#302c2b',wood='#d4b29b',light='#f4dfbf';
    if(id==='alley_puddle_reflection') {
      // Flat, broken rain reflections, without an upright icon silhouette.
      rect('#142c37aa',5,28,29,4);rect('#294853',3,29,32,2);rect('#50717a',7,27,22,1);
      rect('#a99864',12,28,4,1);rect('#d4bd7c',20,29,7,1);rect('#62878e',8,30,10,1);rect('#7aa4a4',23,31,6,1);
    } else if(id==='alley_empty_fish_can') {
      rect('#08101455',8,31,24,3);rect(edge,10,23,21,9);rect('#526864',11,24,19,7);
      rect('#a1aa94',11,22,18,2);rect('#1d3337',13,24,14,3);rect('#8d977b',12,28,16,3);
      rect('#bba477',17,28,7,2);rect('#506353',18,28,3,1);rect('#c6bfa0',12,31,15,1);
      rect(edge,6,20,7,7);rect('#9fa88e',7,21,5,5);rect('#d5cfad',7,21,2,3);rect('#647c6e',11,23,1,3);
    } else if(id==='alley_fish_dry') {
      rect('#14201e55',6,31,28,3);rect('#8c8062',5,24,29,8);rect('#b9ac87',6,25,27,6);rect('#d3c39c',7,25,25,1);
      const fish=(x:number,y:number)=>{rect('#4b3e30',x+4,y-1,14,6);rect('#705539',x,y,4,4);rect('#aa7e49',x+4,y,13,4);rect('#d1ac6d',x+7,y,8,1);rect('#715039',x+7,y+3,8,1);rect('#bd965b',x+1,y+1,4,2);rect('#292e27',x+15,y+1,1,1);};
      fish(6,22);fish(12,28);
    } else if(id==='alley_crate') {
      rect('rgba(8,16,20,.4)',4,32,32,4);
      // Atlas fallback; the live rescue vignette uses the larger cached sprite below.
      c.save();c.beginPath();c.rect(8,7,25,17);c.clip();c.translate(7,4);c.scale(.4,.4);drawPixelCat(c,'diandian','worried');c.restore();
      rect(edge,7,23,27,12);rect(wood,8,24,25,9);rect('#e3c5a7',8,24,17,8);rect('#947485',27,25,6,8);
      rect(edge,3,19,11,6);rect('#dfb8a2',4,20,9,4);rect(edge,27,19,10,6);rect(light,28,20,8,4);
      rect('#fff0d1',9,24,15,1);rect('#735468',23,27,1,7);rect('#a5e0c9',19,25,4,5);rect('#b28f8e',10,32,5,1);
    } else if(id==='alley_poster') {
      rect('rgba(8,16,20,.34)',9,8,23,28);rect(edge,8,5,23,30);rect('#a58b65',9,6,21,28);rect('#ded2b2',10,6,19,27);
      rect('#f0e7ce',11,7,16,1);rect('#a58d67',10,31,6,2);rect('#b4a27d',26,25,3,7);rect('#e4d8ba',25,30,3,2);
      rect('#67624d',16,13,9,8);rect('#67624d',15,11,3,5);rect('#67624d',22,11,3,5);rect('#f0e5ce',18,17,1,1);rect('#f0e5ce',22,17,1,1);
      rect('#89785a',13,24,13,1);rect('#b19d75',15,27,9,1);rect('#d5757c',19,5,3,3);rect('#ffc6b0',19,5,1,1);
    } else if(id==='alley_scratch_marks') {
      for(const [x,y,h] of [[12,18,12],[18,16,13],[24,19,11]]){rect('#253e40',x,y,2,h);rect('#879483',x+2,y,1,h-2);rect('#5f7873',x+1,y+h,2,1);}
    } else {
      rect('#16221e55',4,32,31,3);rect(edge,6,24,27,9);rect('#6f7056',7,25,25,7);rect('#a7a081',8,25,23,2);
      rect('#474f40',8,21,23,5);rect('#c2b18c',7,19,24,5);rect('#d7c5a0',8,19,22,1);rect('#897f61',10,22,19,2);
      rect('#7e886e',11,20,2,11);rect('#b6b896',11,21,2,1);rect('#b6b896',11,27,2,1);rect('#3f4d3d',8,31,22,1);
    }
    c.restore();
  }
  return atlas;
}

let rescueCrate:HTMLCanvasElement|undefined;
function rescueCrateSprite() {
  if(rescueCrate)return rescueCrate;
  rescueCrate=document.createElement('canvas');rescueCrate.width=64;rescueCrate.height=68;
  const c=rescueCrate.getContext('2d')!;c.imageSmoothingEnabled=false;
  const r=(color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  r('#101c2066',6,61,53,5);r('#554334',8,36,48,26);r('#94754e',10,38,44,22);
  c.save();c.translate(8,0);c.scale(.75,.75);drawPixelCat(c,'diandian','worried');c.restore();
  // Flaps sit behind the kitten's paws; a worn front panel hides the lower body.
  r('#493b2c',3,34,17,8);r('#bc9d68',4,35,15,5);r('#e0c393',4,35,15,1);
  r('#493b2c',45,34,16,8);r('#ba9762',46,35,14,5);r('#e0c393',46,35,14,1);
  r('#493b2c',9,40,47,23);r('#b99a6a',10,41,45,20);r('#cfb17f',11,42,33,17);r('#977446',45,42,9,18);
  r('#e0c99e',11,41,43,2);r('#786044',30,44,2,16);r('#b8af85',28,44,5,12);r('#d7c5a1',29,45,2,9);
  r('#8e734e',14,55,10,1);r('#8e734e',14,58,7,1);r('#e2d1b0',18,37,8,5);r('#e2d1b0',39,37,8,5);r('#8a7963',18,41,8,1);r('#8a7963',39,41,8,1);
  return rescueCrate;
}

export function paintEventProp(c:CanvasRenderingContext2D,id:string,x:number,y:number,scale=1,completed=false) {
  if(id==='alley_crate'){
    const top=completed?34:0;c.save();c.imageSmoothingEnabled=false;
    c.drawImage(rescueCrateSprite(),0,top,64,68-top,Math.round(x-32*scale),Math.round(y-(63-top)*scale),64*scale,(68-top)*scale);c.restore();return;
  }
  const i=propIds.indexOf(id as typeof propIds[number]);if(i<0)return;
  c.save();c.imageSmoothingEnabled=false;
  const top=id==='alley_crate'&&completed?19:0;
  c.drawImage(eventPropAtlas(),i*cellSize,top,cellSize,cellSize-top,Math.round(x-20*scale),Math.round(y-(32-top)*scale),cellSize*scale,(cellSize-top)*scale);
  c.restore();
}
