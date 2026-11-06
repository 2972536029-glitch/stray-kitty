import {coveredImageOrigin} from './resolution';

export interface CameraRect {x:number;y:number;width:number;height:number}
export interface CameraPoint {x:number;y:number}
export interface CameraFrame {
  viewport:CameraRect;
  safe:CameraRect;
  scale:number;
  worldViewWidth:number;
  worldViewHeight:number;
}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function followCameraPoint(current:CameraPoint,target:CameraPoint,deltaSeconds:number,smoothing=9):CameraPoint {
  const amount=1-Math.exp(-deltaSeconds*smoothing);
  return {x:current.x+(target.x-current.x)*amount,y:current.y+(target.y-current.y)*amount};
}

export function displayedCanvasRect(boxWidth:number,boxHeight:number,logicalWidth:number,logicalHeight:number,fit:'cover'|'contain'):CameraRect {
  const scale=fit==='cover'
    ? Math.max(boxWidth/logicalWidth,boxHeight/logicalHeight)
    : Math.min(boxWidth/logicalWidth,boxHeight/logicalHeight);
  const offsetX=(boxWidth-logicalWidth*scale)/2,offsetY=(boxHeight-logicalHeight*scale)/2;
  const left=clamp(-offsetX/scale,0,logicalWidth),top=clamp(-offsetY/scale,0,logicalHeight);
  const right=clamp((boxWidth-offsetX)/scale,0,logicalWidth),bottom=clamp((boxHeight-offsetY)/scale,0,logicalHeight);
  return {x:left,y:top,width:right-left,height:bottom-top};
}

export function cameraFrameFor(viewport:CameraRect,safe:CameraRect,targetWorldArea=900*520,worldWidth=1672,worldHeight=941):CameraFrame {
  const scale=Math.max(Math.sqrt(viewport.width*viewport.height/targetWorldArea),viewport.width/worldWidth,viewport.height/worldHeight);
  return {viewport,safe,scale,worldViewWidth:viewport.width/scale,worldViewHeight:viewport.height/scale};
}

/** Presentation only: keep simulation smoothing, camera scale and projection intact. */
export function pixelAlignedCameraPosition(position: CameraPoint, frame: CameraFrame, worldWidth: number, worldHeight: number, density: CameraPoint): CameraPoint {
  const {viewport, scale} = frame;
  const x = coveredImageOrigin(viewport.x - position.x * scale, worldWidth * scale, viewport.width, density.x, viewport.x);
  const y = coveredImageOrigin(viewport.y - position.y * scale, worldHeight * scale, viewport.height, density.y, viewport.y);
  return {x: (viewport.x - x) / scale, y: (viewport.y - y) / scale};
}

export class FollowCamera {
  x=0;
  y=0;

  private target(player:CameraPoint,frame:CameraFrame,worldWidth:number,worldHeight:number):CameraPoint {
    const focusX=frame.safe.width?frame.safe.x+frame.safe.width/2:frame.viewport.x+frame.viewport.width/2;
    const focusY=frame.safe.height?frame.safe.y+frame.safe.height/2:frame.viewport.y+frame.viewport.height/2;
    return {
      x:clamp(player.x-(focusX-frame.viewport.x)/frame.scale,0,Math.max(0,worldWidth-frame.worldViewWidth)),
      y:clamp(player.y-(focusY-frame.viewport.y)/frame.scale,0,Math.max(0,worldHeight-frame.worldViewHeight))
    };
  }

  snap(player:CameraPoint,frame:CameraFrame,worldWidth:number,worldHeight:number) {
    const point=this.target(player,frame,worldWidth,worldHeight);
    this.x=point.x;this.y=point.y;
  }

  update(player:CameraPoint,frame:CameraFrame,worldWidth:number,worldHeight:number,deltaSeconds:number) {
    const point=this.target(player,frame,worldWidth,worldHeight),next=followCameraPoint(this,point,deltaSeconds);
    this.x=next.x;this.y=next.y;
  }

  worldToScreen(point:CameraPoint,frame:CameraFrame):CameraPoint {
    return {x:frame.viewport.x+(point.x-this.x)*frame.scale,y:frame.viewport.y+(point.y-this.y)*frame.scale};
  }

  screenToWorld(point:CameraPoint,frame:CameraFrame):CameraPoint {
    return {x:this.x+(point.x-frame.viewport.x)/frame.scale,y:this.y+(point.y-frame.viewport.y)/frame.scale};
  }
}
