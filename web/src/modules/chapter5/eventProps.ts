// Fixed warehouse interaction objects. Ten 44px cells share one cached canvas, including
// the three lamp controls in both states. No image or model requests are added.
export const cell = 44, propScale = 1.35;
export const propKeys = ['entry_lamp:off','entry_lamp:on','central_spotlight:off','central_spotlight:on','secondary_lamp:off','secondary_lamp:on','warehouse_lookout','warehouse_light_crate','finale_boss','bunker_exit'] as const;
let atlas: HTMLCanvasElement | undefined;

export function warehousePropAtlas() {
  if (atlas) return atlas;
  atlas = document.createElement('canvas'); atlas.width = cell * propKeys.length; atlas.height = cell;
  const c = atlas.getContext('2d')!;
  const r = (color:string,x:number,y:number,w:number,h:number) => {c.fillStyle=color;c.fillRect(x,y,w,h);};
  const ink='#292d3b', metal='#738a8a', mint='#aae8d0', cream='#fff0cf', coral='#eca69b', lilac='#cdb9df';
  for (const [i,key] of propKeys.entries()) {
    c.save(); c.translate(i*cell,0); r('rgba(4,13,20,.5)',4,37,36,4);
    const lit=key.endsWith(':on'),glass=lit?mint:'#698589',shine=lit?cream:'#b7cbc5';
    if (key.startsWith('entry_lamp')) {
      // Wall lantern and a switch at its base.
      r(ink,18,3,10,5);r(lilac,20,4,6,3);r(ink,12,10,22,4);r('#b69ba9',14,11,18,2);
      r(ink,11,14,24,18);r('#8c7c97',13,15,20,15);r(glass,16,16,14,12);r(shine,18,17,3,9);
      r(ink,21,15,3,15);r('#cfacb8',13,29,20,3);r(ink,15,33,16,6);r('#9e93ad',16,34,14,4);
      r(ink,26,33,8,6);r(lit?coral:mint,27,34,5,3);r(cream,28,34,2,1);
    } else if (key.startsWith('central_spotlight')) {
      // A broad spotlight on a short, stable tripod.
      r(ink,20,20,5,18);r(metal,21,21,3,15);r(ink,12,36,22,4);r('#b0a0b5',14,36,18,2);
      r(ink,8,10,28,15);r(ink,11,6,22,23);r('#9484a6',10,12,24,11);r(lilac,13,8,18,4);
      r(ink,14,13,17,13);r(glass,16,14,13,10);r(shine,17,15,4,8);r(lit?'#d4f7d5':'#91aeae',24,15,3,7);
      r(ink,5,15,5,10);r(coral,6,16,3,7);r(ink,29,29,9,8);r('#bba0ad',30,30,7,6);r(lit?mint:coral,32,31,3,3);
    } else if (key.startsWith('secondary_lamp')) {
      // Portable work lamp with its own small switch box.
      r(ink,16,3,13,5);r('#cdb2ba',18,4,9,3);r(ink,11,9,23,25);r('#9f8aa3',13,11,19,21);
      r(ink,16,13,13,16);r(lit?'#f2c4a1':'#8d8a95',17,14,11,14);r(shine,19,15,3,11);
      r(coral,13,11,3,19);r('#e6b7bb',29,11,3,19);r(ink,10,33,26,6);r(metal,12,34,22,3);
      r(ink,4,29,10,9);r(lilac,5,30,8,6);r(lit?mint:coral,7,31,3,3);
    } else if (key==='warehouse_lookout') {
      // A pallet lookout with a binocular stand; no new character is implied.
      r(ink,5,30,35,10);r('#ad8990',7,31,31,7);r('#ddbaa8',8,31,29,2);r('#816e86',9,35,27,2);
      r(ink,20,19,5,15);r(metal,21,20,3,12);r(ink,14,30,18,4);r(lilac,16,30,14,2);
      r(ink,6,12,14,13);r(ink,25,10,14,13);r('#9b8aaf',8,14,10,9);r('#9b8aaf',27,12,10,9);
      r(ink,17,15,12,5);r(coral,19,16,8,3);r(mint,9,15,7,5);r(mint,28,13,7,5);r(cream,10,15,2,4);r(cream,29,13,2,4);
      r(ink,4,27,9,5);r(cream,5,28,7,3);r('#849cab',34,26,5,5);
    } else if (key==='warehouse_light_crate') {
      // The existing suspended lamp crate, including its short hanging cord.
      r(ink,19,1,6,10);r(metal,21,1,2,8);r(ink,16,9,13,5);r(lilac,17,10,11,2);
      r(ink,5,16,34,24);r('#b58b9c',7,18,30,20);r(coral,8,18,28,3);r('#826b86',8,34,28,4);
      r(ink,11,22,23,12);r('#777f95',12,23,21,10);
      for(const x of [14,23]){r(ink,x,23,7,10);r(mint,x+1,24,5,7);r(cream,x+2,24,2,6);}
      r('#e4c4ac',8,20,3,16);r('#e4c4ac',34,20,2,16);r(ink,17,35,10,3);r(lilac,18,35,8,2);
    } else if (key==='finale_boss') {
      // A reinforced rally barricade with a shield, matching the Chapter 4 cue.
      r(ink,5,11,5,29);r(ink,34,11,5,29);r(mint,6,12,3,25);r(mint,35,12,3,25);
      r(ink,8,8,28,6);r('#c0a2bc',9,9,26,4);r(cream,11,9,21,1);
      r(ink,10,19,25,13);r('#8a718f',12,21,21,9);r('#d4adbd',13,22,19,2);
      r(ink,15,14,17,15);r(ink,18,27,11,6);r(coral,17,16,13,11);r('#c889a6',19,27,9,4);
      r(cream,22,18,3,10);r(cream,19,21,9,3);r(lilac,11,35,23,3);
    } else {
      // Rescue compartment door; the existing victory flag controls its use.
      r(ink,7,5,31,35);r('#968ca8',9,7,27,30);r(lilac,10,7,24,3);r('#667b82',11,12,21,24);
      r(ink,14,14,15,14);r(mint,15,15,13,11);r('#6caaa5',16,23,11,3);
      r(cream,19,18,5,5);r(cream,17,16,2,2);r(cream,21,15,2,2);r(cream,25,16,2,2);
      r(ink,28,29,5,5);r(coral,29,30,3,3);r('#c9a9b6',10,34,23,3);r(ink,4,38,37,3);r(metal,5,38,35,2);
    }
    c.restore();
  }
  return atlas;
}

export function paintWarehouseProp(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,lit=false,alpha=1) {
  const lamp=['entry_lamp','central_spotlight','secondary_lamp'].includes(id);
  const index=propKeys.indexOf((lamp?`${id}:${lit?'on':'off'}`:id) as typeof propKeys[number]);
  if(index<0)return;
  ctx.save();ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(warehousePropAtlas(),index*cell,0,cell,cell,Math.round(x-cell*propScale/2),Math.round(y-38*propScale),cell*propScale,cell*propScale);
  ctx.restore();
}
