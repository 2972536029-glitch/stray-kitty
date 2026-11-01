// Five static event icons share one small cached canvas; no image downloads.
export const icons=['crow','pigeon','momo','boss','exit'] as const;
export const cell=44,iconScale=1.4;
let atlas:HTMLCanvasElement|undefined;
export function marketEventAtlas(){
  if(atlas)return atlas;
  atlas=document.createElement('canvas');atlas.width=cell*icons.length;atlas.height=cell;
  const c=atlas.getContext('2d')!;c.imageSmoothingEnabled=false;
  const r=(color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const ink='#302c3d',mint='#a7e6d1',cream='#fff0cf',lilac='#ccb3d9',coral='#e8a09d';
  for(const [i,id] of icons.entries()){
    c.save();c.translate(i*cell,0);
    if(id==='crow'){
      r('rgba(10,19,26,.4)',6,36,32,4);
      // Little merchant's perch; the bird keeps its dark feather identity.
      r(ink,9,32,23,6);r('#ba9181',10,33,21,4);r('#e9c6a5',11,33,18,1);
      r(ink,12,35,3,7);r(ink,28,35,3,7);r('#e7cba5',17,29,2,4);r('#e7cba5',25,29,2,4);
      r(ink,11,7,15,11);r(ink,9,10,18,8);r('#665475',11,8,13,10);r('#9b88ab',12,8,9,2);
      r(ink,5,13,7,4);r('#edc6a2',5,14,7,2);r('#fff7dc',13,11,4,3);r('#232631',13,12,2,2);
      r(ink,17,16,17,13);r('#61516f',18,17,15,11);r('#8e779d',19,18,9,3);r('#b6a0c5',20,18,6,1);
      r('#44374f',26,22,8,6);r('#a18aac',20,22,7,2);r('#82708f',22,25,7,1);
      r(ink,31,25,8,5);r(ink,35,28,6,3);r('#7d658e',33,26,5,2);r('#b397bf',36,29,4,1);
      r(ink,14,16,12,4);r('#6dbba9',15,17,10,3);r(mint,16,17,7,1);r('#ddedd0',18,20,2,3);
      r(ink,9,24,9,8);r('#be8c9d',10,25,7,6);r('#f4d0cc',11,25,4,1);r('#e4dbc0',12,28,3,2);
    }else if(id==='pigeon'){
      r('rgba(10,19,26,.4)',7,36,31,4);
      r(ink,12,31,23,7);r('#8d799e',13,32,21,5);r(lilac,14,32,18,2);r('#dfcfe2',13,36,21,1);
      r('#c7878e',18,28,2,5);r('#c7878e',28,28,2,5);r('#f0b2ab',17,32,5,1);r('#f0b2ab',27,32,5,1);
      r(ink,11,7,15,12);r(ink,9,10,18,8);r('#f0e5d4',12,8,12,11);r('#fff9e8',13,8,9,2);
      r(ink,5,13,6,4);r('#ddaa99',5,14,7,2);r('#3e354c',14,12,2,3);r('#ffffff',14,12,1,1);
      r(ink,16,17,19,13);r('#d2c4da',17,18,17,11);r('#eee3e9',18,18,10,4);r('#a08bac',26,22,8,6);
      r('#b7a0c2',20,23,8,3);r('#f6e7e5',20,23,7,1);r(ink,32,25,7,5);r('#eee3d9',33,26,5,3);
      r(ink,12,17,13,4);r('#b67080',13,18,11,3);r(coral,13,18,9,1);r('#f3c1ad',21,20,3,5);
      r(ink,6,25,11,6);r(cream,7,26,9,4);r('#bba186',8,27,7,1);r('#ebd2a9',7,30,9,1);
    }else if(id==='momo'){
      // A trail rather than a spawned Momo: no change to optional-story meaning.
      const paw=(x:number,y:number,color:string)=>{
        r(ink,x+2,y+5,9,6);r(ink,x,y+1,3,4);r(ink,x+4,y-1,3,4);r(ink,x+8,y,3,4);r(ink,x+12,y+3,3,4);
        r(color,x+3,y+6,7,4);r(color,x+1,y+2,1,2);r(color,x+5,y,1,2);r(color,x+9,y+1,1,2);r(color,x+13,y+4,1,2);r('#f0ffde',x+4,y+6,4,1);
      };
      paw(6,29,mint);paw(19,19,'#c5b1dd');paw(9,7,'#8ed5cc');
      r('#c8e5d5',30,10,3,1);r('#c8e5d5',31,9,1,3);
    }else if(id==='boss'){
      r('rgba(10,19,26,.35)',7,36,30,4);
      // Pixel swords and a shield signal a battle, not another talk interaction.
      for(let n=0;n<8;n++){r(ink,7+n*3,7+n*3,5,5);r(cream,8+n*3,7+n*3,2,4);r(ink,31-n*3,7+n*3,5,5);r('#c0d9d2',32-n*3,7+n*3,2,4);}
      r('#ba8d99',7,29,9,3);r('#ba8d99',29,29,9,3);r(ink,8,31,4,6);r(ink,32,31,4,6);r('#edb5a5',9,31,2,5);r('#edb5a5',33,31,2,5);
      r(ink,12,16,20,16);r(ink,15,30,14,5);r(ink,19,34,6,3);r('#b7748d',14,18,16,13);r(coral,15,18,13,5);
      r('#d7a3b0',16,23,12,7);r('#eac6c0',18,30,8,3);r('#f9ddbd',15,18,12,1);
      r('#fff0cf',20,21,4,8);r('#fff0cf',17,24,10,3);r('#8c677e',27,20,2,10);
    }else{
      r('rgba(10,19,26,.35)',6,37,32,3);
      r(ink,9,11,5,28);r(ink,30,11,5,28);r(ink,12,8,20,5);r('#bca6a8',10,12,3,26);r('#bca6a8',31,12,3,26);r('#e3d2bb',12,9,19,2);
      r('#82bdab',14,14,16,24);r('#4e857f',17,15,12,22);r('#b9e7ce',14,15,2,21);r('#dcf2ce',18,34,10,2);
      r(cream,21,18,3,11);r(cream,18,20,9,3);r(cream,20,18,5,3);r('#e1b6a4',7,35,5,4);r('#e1b6a4',33,34,5,5);
      r('#447e70',7,30,3,6);r(mint,5,29,4,3);r(mint,9,27,3,4);r(coral,31,7,6,5);r('#ffe5c3',33,8,2,2);r('#7eb8a0',33,12,2,6);
    }
    c.restore();
  }
  return atlas;
}
export function paintMarketEvent(c:CanvasRenderingContext2D,id:string,x:number,y:number,alpha=1){
  const i=icons.indexOf(id as typeof icons[number]);if(i<0)return;
  c.save();c.globalAlpha*=alpha;c.imageSmoothingEnabled=false;
  c.drawImage(marketEventAtlas(),i*cell,0,cell,cell,Math.round(x-cell/2*iconScale),Math.round(y-38*iconScale),cell*iconScale,cell*iconScale);c.restore();
}
