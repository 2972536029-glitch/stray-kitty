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
    // Mint, dusty coral and lilac accents remain distinct without a glowing marker plate.
    const edge='#302c2b',wood='#d4b29b',light='#f4dfbf';
    if(id==='alley_puddle_reflection') {
      rect('#284653',4,26,30,6);rect('#284653',8,24,22,10);rect('#4b9d9c',6,26,28,4);rect('#75bdb5',10,25,18,7);
      rect('#c5f5df',7,27,7,1);rect('#e0ffec',23,28,8,1);rect('#b1e1d0',11,33,9,1);
      // Broken reflection rather than an upright second cat.
      rect('#b1e3d3',17,27,8,3);rect('#ddf5da',16,27,2,2);rect('#ddf5da',23,27,2,2);rect('#86cfc2',18,30,6,2);
    } else if(id==='alley_empty_fish_can') {
      rect('rgba(8,16,20,.38)',8,31,24,4);rect(edge,10,21,21,11);rect('#b37188',11,22,19,8);
      rect('#efdabd',11,21,18,2);rect('#4c3c50',13,23,14,3);rect('#d99eab',12,27,16,3);
      rect('#e5e3bc',16,27,8,2);rect('#fff3d5',18,27,2,1);rect('#f5e6ce',12,30,15,1);
      // Open, bent lid on the left: readable silhouette and one cool highlight.
      rect(edge,6,16,7,9);rect('#b2cbb7',7,17,5,7);rect('#e0f2d4',7,17,2,5);rect('#708e83',11,19,1,5);
      rect('#514435',29,29,3,3);
    } else if(id==='alley_fish_dry') {
      rect('rgba(8,16,20,.36)',5,30,29,4);rect('#705464',5,29,28,2);
      const fish=(x:number,y:number)=>{rect(edge,x+4,y-1,14,7);rect(edge,x,y,4,5);rect('#d2817a',x+4,y,13,5);rect('#ffd0af',x+7,y,8,2);rect('#965867',x+7,y+4,9,1);rect('#eaa88e',x+1,y+1,4,3);rect('#252c2c',x+15,y+1,1,1);rect('#fff0c7',x+8,y+2,1,2);rect('#fff0c7',x+11,y+2,1,2);};
      fish(6,21);fish(12,28);rect('#c6dac6',6,18,24,1);rect('#8fae9b',9,18,1,4);rect('#8fae9b',25,18,1,4);
    } else if(id==='alley_crate') {
      rect('rgba(8,16,20,.4)',4,32,32,4);
      // Diandian peeking over a battered box. Uses the same character painter.
      c.save();c.beginPath();c.rect(8,7,25,17);c.clip();c.translate(7,4);c.scale(.4,.4);drawPixelCat(c,'diandian','worried');c.restore();
      rect(edge,7,23,27,12);rect(wood,8,24,25,9);rect('#e3c5a7',8,24,17,8);rect('#947485',27,25,6,8);
      rect(edge,3,19,11,6);rect('#dfb8a2',4,20,9,4);rect(edge,27,19,10,6);rect(light,28,20,8,4);
      rect('#fff0d1',9,24,15,1);rect('#735468',23,27,1,7);rect('#a5e0c9',19,25,4,5);rect('#b28f8e',10,32,5,1);
    } else if(id==='alley_poster') {
      rect('rgba(8,16,20,.34)',9,8,23,28);rect(edge,8,5,23,30);rect('#ad86b2',9,6,21,28);rect('#e2d1ea',10,6,19,27);
      rect('#fff1f0',11,7,16,1);rect('#a0779c',10,31,6,2);rect('#b298bc',26,25,3,7);rect('#f7e5ed',25,30,3,2);
      rect('#64496e',16,13,9,8);rect('#64496e',15,11,3,5);rect('#64496e',22,11,3,5);rect('#f0e5ce',18,17,1,1);rect('#f0e5ce',22,17,1,1);
      rect('#84648d',13,24,13,1);rect('#a083a7',15,27,9,1);rect('#d5757c',19,5,3,3);rect('#ffc6b0',19,5,1,1);
    } else if(id==='alley_scratch_marks') {
      // Mint-lit claw scores and stone chips keep the clue visible against warm walls.
      rect('rgba(18,27,31,.25)',8,21,24,13);
      for(const [x,y,h] of [[12,15,14],[18,13,15],[24,16,13]]){rect('#374b4a',x,y,2,h);rect('#c1e7d1',x+2,y,1,h-2);rect('#6b9f91',x+1,y+h,2,2);rect('#f3ffe0',x+3,y+1,1,4);}
      rect('#bcddc1',11,32,3,1);rect('#89ae9c',26,31,2,2);rect('#e2f5ce',19,33,2,1);
    } else {
      rect('rgba(8,16,20,.4)',3,32,33,4);rect(edge,5,23,29,11);rect('#87618e',6,24,27,8);rect('#c5a2c9',7,24,24,2);
      rect(edge,8,15,24,11);rect('#b68abf',9,16,22,8);rect('#ecd3e6',10,16,19,2);rect('#946a9f',12,20,19,3);
      rect('#a3cbb8',10,17,3,8);rect('#e7efce',10,18,3,1);rect('#e7efce',10,21,3,1);
      rect('#75507f',24,24,6,8);rect('#c9a5d0',24,25,4,1);rect('#513e61',8,31,16,1);rect('#d0b1a8',8,33,2,2);rect('#d0b1a8',13,33,2,1);
    }
    c.restore();
  }
  return atlas;
}

export function paintEventProp(c:CanvasRenderingContext2D,id:string,x:number,y:number,scale=1,completed=false) {
  const i=propIds.indexOf(id as typeof propIds[number]);if(i<0)return;
  c.save();c.imageSmoothingEnabled=false;
  const top=id==='alley_crate'&&completed?19:0;
  c.drawImage(eventPropAtlas(),i*cellSize,top,cellSize,cellSize-top,Math.round(x-20*scale),Math.round(y-(32-top)*scale),cellSize*scale,(cellSize-top)*scale);
  c.restore();
}
