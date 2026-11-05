/* The same 64-unit, stepped outlines and broad colour blocks as pixelCat. */
const ink='#4b3b30',fur='#e4bf82',shade='#c79b60',ear='#a7794d',cream='#fff0cf';
type Shape={path:Path2D;fill:string;outline?:boolean};
const shape=(path:string,fill:string,outline=false):Shape=>({path:new Path2D(path),fill,outline});
const body=[
  shape('M18 42h29v5h5v9H12v-8h6z',shade,true),
  shape('M19 43h24v8H19z',fur),
  shape('M12 51h16v8H9v-5h3zM39 51h15v3h3v5H39z',cream,true),
  shape('M15 55h1v3h-1zM22 55h1v3h-1zM45 55h1v3h-1zM51 55h1v3h-1z',ink),
];
const head=[
  shape('M18 13h28v4h6v7h3v18h-5v5H14v-5H9V24h3v-7h6z',fur,true),
  shape('M44 16h4v9h5v16h-5v4h-5z',shade),
  shape('M11 18h7v6h-2v16h-5v-3H7V23h4zM47 18h7v5h4v14h-4v3h-5V24h-2z',ear,true),
  shape('M10 23h3v12h-3zM52 23h3v12h-3z','#bb905f'),
  shape('M27 17h10v7h-2v8h-6v-8h-2z',cream),
  shape('M22 32h20v4h5v7h-5v3H22v-3h-5v-7h5z',cream),
  shape('M28 33h8v5h-2v2h-4v-2h-2z',ink),
  shape('M29 34h3v1h-3z','#9c8872'),
  shape('M31 39h2v4h-2zM26 42h5v2h-5zM33 42h5v2h-5z',ink),
  shape('M20 23h7v2h-7zM38 23h7v2h-7z','#f8e7c4'),
  shape('M16 17h3v5h-3zM20 15h4v2h-4z','#fff4d37d'),
];
function stamp(ctx:CanvasRenderingContext2D,shapes:readonly Shape[]) {
  for(const s of shapes){ctx.fillStyle=s.fill;ctx.fill(s.path);if(s.outline){ctx.strokeStyle=ink;ctx.stroke(s.path);}}
}
export function drawPixelDog(ctx:CanvasRenderingContext2D,alert:boolean,time:number) {
  const lift=Math.round(Math.sin(time/(alert?300:760))*.75),wag=Math.sin(time/(alert?110:320));
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.lineJoin='round';ctx.lineWidth=2.5;
  ctx.save();ctx.translate(48,45);ctx.rotate(wag*(alert?.35:.12));
  ctx.fillStyle=ink;ctx.fillRect(0,-4,12,6);ctx.fillRect(8,-10,5,9);
  ctx.fillStyle=fur;ctx.fillRect(1,-3,10,3);ctx.fillRect(9,-8,3,7);ctx.restore();
  stamp(ctx,body);
  ctx.save();ctx.translate(0,-lift);stamp(ctx,head);
  ctx.fillStyle=ink;
  if(alert){ctx.fillRect(21,27,4,6);ctx.fillRect(39,27,4,6);ctx.fillStyle='#fff9e8';ctx.fillRect(22,27,1,2);ctx.fillRect(40,27,1,2);}
  else {ctx.fillRect(20,29,7,2);ctx.fillRect(37,29,7,2);}
  ctx.restore();
  ctx.fillStyle='#466b60';ctx.fillRect(20,46,24,4);ctx.fillRect(28,50,8,4);ctx.fillRect(30,54,4,2);
  ctx.fillStyle='#9db79a';ctx.fillRect(22,46,19,1);ctx.fillStyle='#d5b477';ctx.fillRect(30,48,4,3);
  ctx.restore();
}
