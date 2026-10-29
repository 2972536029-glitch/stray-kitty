interface Rect {left:number;top:number;right:number;bottom:number}
interface TooltipSize {width:number;height:number}

/** Keep the explanation beside its menu; narrow screens use the nearest vertical space. */
export function placeSkillTooltip(anchor:Rect,bounds:Rect,size:TooltipSize){
  const gap=8;
  const maxLeft=Math.max(bounds.left,bounds.right-size.width);
  let left:number,top:number,maxHeight=Math.max(1,bounds.bottom-bounds.top);
  if(anchor.right+gap+size.width<=bounds.right){
    left=anchor.right+gap;top=anchor.top;
  }else if(anchor.left-gap-size.width>=bounds.left){
    left=anchor.left-gap-size.width;top=anchor.top;
  }else{
    left=(anchor.left+anchor.right-size.width)/2;
    const above=Math.max(0,anchor.top-bounds.top-gap);
    const below=Math.max(0,bounds.bottom-anchor.bottom-gap);
    const placeBelow=below>=above;
    maxHeight=Math.max(1,placeBelow?below:above);
    top=placeBelow?anchor.bottom+gap:anchor.top-Math.min(size.height,maxHeight)-gap;
  }
  return {
    left:Math.max(bounds.left,Math.min(maxLeft,left)),
    top:Math.max(bounds.top,Math.min(bounds.bottom-Math.min(size.height,maxHeight),top)),
    maxHeight,
  };
}

/** Bounds include the visible board, viewport, and any clipping host panels. */
export function getSkillTooltipPosition(field:HTMLElement,view:Rect,anchor:Rect,tooltip:HTMLElement){
  const bounds={left:Math.max(view.left+6,6),right:Math.min(view.right-6,window.innerWidth-6),
    top:Math.max(view.top+6,6),bottom:Math.min(view.bottom-6,window.innerHeight-6)};
  for(let ancestor=field.parentElement;ancestor;ancestor=ancestor.parentElement){
    const style=getComputedStyle(ancestor),clip=ancestor.getBoundingClientRect();
    if(/auto|scroll|hidden|clip/.test(style.overflowY)){
      bounds.top=Math.max(bounds.top,clip.top+6);bounds.bottom=Math.min(bounds.bottom,clip.bottom-6);
    }
    if(/auto|scroll|hidden|clip/.test(style.overflowX)){
      bounds.left=Math.max(bounds.left,clip.left+6);bounds.right=Math.min(bounds.right,clip.right-6);
    }
  }
  const border=tooltip.offsetHeight-tooltip.clientHeight;
  const position=placeSkillTooltip(anchor,bounds,{width:tooltip.offsetWidth,height:tooltip.scrollHeight+border});
  const origin=field.getBoundingClientRect();
  return {...position,left:position.left-origin.left,top:position.top-origin.top};
}
