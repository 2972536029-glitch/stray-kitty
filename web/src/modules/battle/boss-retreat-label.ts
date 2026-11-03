/** A readable board landmark after a boss leaves. Its plate stays inside the
 * reserved boss footprint; callers draw live enemies and partners afterwards. */
export function paintBossRetreatLabel(
  ctx:CanvasRenderingContext2D,label:string,x:number,y:number,width:number,height:number,
){
  if(width<=16||height<=16)return;
  ctx.save();
  const fontSize=width<120?14:width>=220?18:16,lineHeight=fontSize+4,maxWidth=width-16;
  ctx.font=`700 ${fontSize}px "Microsoft YaHei", sans-serif`;
  // The market boss occupies one cell. Two readable lines fit that cell without
  // shrinking its lettering or allowing the label into neighbouring lanes.
  const lines=ctx.measureText(label).width>maxWidth-20&&label.endsWith('已退去')
    ?[label.slice(0,-3),'已退去']:[label];
  const textWidth=Math.max(...lines.map(line=>ctx.measureText(line).width));
  const plateWidth=Math.min(maxWidth,Math.max(62,Math.ceil(textWidth)+20));
  const plateHeight=Math.min(height-16,lines.length*lineHeight+12);
  const left=Math.round(x+(width-plateWidth)/2)+.5,top=Math.round(y+(height-plateHeight)/2)+.5;
  const right=left+plateWidth-1,bottom=top+plateHeight-1,corner=3;
  ctx.beginPath();ctx.moveTo(left+corner,top);ctx.lineTo(right-corner,top);
  ctx.lineTo(right,top+corner);ctx.lineTo(right,bottom-corner);ctx.lineTo(right-corner,bottom);
  ctx.lineTo(left+corner,bottom);ctx.lineTo(left,bottom-corner);ctx.lineTo(left,top+corner);ctx.closePath();
  ctx.fillStyle='#142f2ef2';ctx.fill();ctx.strokeStyle='#c7b780';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#fff1c9';ctx.textAlign='center';ctx.textBaseline='middle';
  const centerX=x+width/2,firstY=y+height/2-(lines.length-1)*lineHeight/2;
  lines.forEach((line,index)=>ctx.fillText(line,centerX,firstY+index*lineHeight));
  ctx.restore();
}
