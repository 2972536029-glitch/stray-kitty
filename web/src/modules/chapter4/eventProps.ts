// Six static event props: six static pixel props share one 264x44 cached canvas.
export const propIds=['tunnel_false_kitten_trap','tunnel_momo_marks','tunnel_lamp_map','tunnel_light_switch','tunnel_valve_three','tunnel_exit_boss'] as const;
export const cell=44,propScale=1.4;
let atlas:HTMLCanvasElement|undefined;
export function tunnelPropAtlas(){
  if(atlas)return atlas;
  atlas=document.createElement('canvas');atlas.width=propIds.length*cell;atlas.height=cell;
  const c=atlas.getContext('2d')!,r=(color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const ink='#302c3d',cream='#fff0cf',mint='#a7e6d1',coral='#e8a09d',lilac='#ccb3d9',metal='#7c8497';
  for(const [i,id] of propIds.entries()){
    c.save();c.translate(i*cell,0);r('rgba(5,16,24,.42)',5,37,34,4);
    if(id==='tunnel_false_kitten_trap'){
      // A tied bait sack and visible trip cord, not a spawned kitten.
      r(ink,13,7,17,6);r('#a3878c',14,8,15,4);r(cream,16,8,4,2);
      r(ink,10,14,23,20);r(ink,13,11,17,25);r('#bd9da2',12,15,19,18);r('#e1c4b8',14,13,15,6);
      r('#937b91',12,25,19,7);r('#d6b2b8',15,20,12,7);r(cream,15,15,2,10);
      r(ink,11,11,21,4);r(mint,12,12,19,2);r('#6caaa7',26,13,3,8);r(mint,27,18,6,2);
      r(ink,3,31,6,7);r('#b4c6bd',4,32,4,5);r(ink,35,28,5,10);r('#b4c6bd',36,29,3,8);
      r(coral,8,33,29,2);r(cream,30,31,2,2);r(cream,31,30,2,2);
      r(ink,19,21,7,5);r('#755b76',20,22,5,3);r(lilac,20,22,2,1);
    }else if(id==='tunnel_momo_marks'){
      r(ink,7,13,29,25);r(ink,11,8,21,31);r('#9c8aab',9,14,25,21);r('#c8b6cf',12,10,18,5);
      r('#786b88',10,31,24,5);r('#e8d9d4',12,12,18,2);r('#b19cbb',12,17,19,14);
      for(const [x,y] of [[15,18],[21,16],[27,18]]){r(ink,x-1,y-1,4,14);r(mint,x,y,2,11);r(cream,x,y,1,6);}
      r('#d7b9bb',5,33,8,4);r(mint,31,32,6,3);r('#7ba99a',33,30,3,5);
    }else if(id==='tunnel_lamp_map'){
      // Folded survey map under a small lantern.
      r(ink,4,24,35,15);r('#b4969f',5,25,33,12);r(cream,7,26,10,10);r('#e3c7bd',17,25,9,11);r('#fff4d8',26,26,10,10);
      r('#91bdb0',9,28,5,2);r('#91bdb0',12,29,2,5);r('#91bdb0',14,32,10,2);r('#91bdb0',23,29,2,5);r(coral,27,28,5,4);
      r(ink,15,6,13,4);r(ink,13,10,4,14);r(ink,27,10,4,14);r(ink,15,22,14,3);
      r('#a38b9a',17,7,9,2);r('#ceaca7',14,12,2,9);r('#ceaca7',28,12,2,9);
      r('#78b6a0',18,11,8,11);r(mint,19,12,6,9);r(cream,21,13,2,7);r('#d7b9a0',17,23,10,2);
      r(ink,19,2,6,5);r('#c9aab2',20,3,4,3);
    }else if(id==='tunnel_light_switch'){
      r(ink,9,7,27,32);r('#9686a0',11,9,23,27);r(lilac,12,10,20,3);r('#716b85',12,32,21,4);
      r(ink,14,16,17,13);r('#526f79',15,17,15,11);r('#82b6b1',16,18,13,8);
      r(ink,21,18,5,16);r('#d4acb4',22,18,3,14);r(ink,20,15,10,6);r(coral,21,16,8,4);r(cream,22,16,4,1);
      r(ink,14,10,5,5);r(mint,15,11,3,3);r(cream,15,11,1,1);r('#cfb9b7',29,11,2,2);r('#cfb9b7',12,33,2,2);
      r(ink,4,34,8,4);r(metal,5,35,7,2);r('#5f5f79',34,34,6,4);
    }else if(id==='tunnel_valve_three'){
      r(ink,7,28,31,12);r(metal,9,29,27,8);r('#b8b5c6',10,29,24,2);r('#5d6278',10,35,25,3);
      r(ink,17,22,11,13);r('#b9a3ac',19,23,7,11);r(cream,19,24,2,8);
      // Square pixel wheel corners and spokes keep it crisp at native scale.
      r(ink,12,6,20,25);r(ink,7,11,30,15);r('#b77489',14,8,16,21);r('#b77489',9,13,26,11);
      r('#efb5ac',14,8,16,3);r(coral,9,13,4,11);r('#d08d9d',31,13,4,11);r('#d08d9d',14,26,16,3);
      r(ink,14,13,16,11);r('#3f5961',15,14,14,9);r(coral,20,9,4,18);r(coral,11,17,22,4);
      r(ink,18,15,9,9);r(mint,20,17,5,5);r(cream,20,17,2,2);
    }else{
      r(ink,6,9,6,30);r(ink,32,9,6,30);r('#a595ad',7,10,4,27);r('#a595ad',33,10,4,27);
      r(ink,9,6,26,6);r('#d3b9bf',10,7,24,4);r(cream,12,7,19,1);
      r('#6e8291',15,12,3,25);r('#6e8291',26,12,3,25);r('#769e9c',12,30,20,4);
      r(ink,12,16,20,14);r(ink,15,28,14,5);r(ink,19,32,6,4);r('#bd8196',14,18,16,11);r(coral,15,18,13,4);
      r('#d2a5b5',17,27,10,4);r(cream,20,20,4,9);r(cream,17,23,10,3);
      r(mint,3,34,8,4);r(mint,33,34,8,4);r('#ebc5b5',7,10,2,5);r('#ebc5b5',33,10,2,5);
    }
    c.restore();
  }
  return atlas;
}
export function paintTunnelProp(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,alpha=1){
  const i=propIds.indexOf(id as typeof propIds[number]);if(i<0)return;
  ctx.save();ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(tunnelPropAtlas(),i*cell,0,cell,cell,Math.round(x-cell/2*propScale),Math.round(y-38*propScale),cell*propScale,cell*propScale);ctx.restore();
}
