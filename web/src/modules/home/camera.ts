import {HOME_SIZE, type HomePoint} from './layout';
export interface HomeView {x:number;y:number;scale:number;width:number;height:number}
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export class HomeCamera {
  zoom=1;
  center:HomePoint={x:HOME_SIZE.width/2,y:HOME_SIZE.height/2};
  frame(width:number,height:number):HomeView {
    const scale=Math.min(width/HOME_SIZE.width,height/HOME_SIZE.height)*this.zoom;
    const worldWidth=width/scale,worldHeight=height/scale;
    const cx=worldWidth>=HOME_SIZE.width?HOME_SIZE.width/2:clamp(this.center.x,worldWidth/2,HOME_SIZE.width-worldWidth/2);
    const cy=worldHeight>=HOME_SIZE.height?HOME_SIZE.height/2:clamp(this.center.y,worldHeight/2,HOME_SIZE.height-worldHeight/2);
    return {x:Math.round(width/2-cx*scale),y:Math.round(height/2-cy*scale),scale,width,height};
  }
  reset(){this.zoom=1;this.center={x:HOME_SIZE.width/2,y:HOME_SIZE.height/2};}
  changeZoom(amount:number){this.zoom=clamp(Math.round((this.zoom+amount)*100)/100,1,2.4);}
  pan(dx:number,dy:number,width:number,height:number){const view=this.frame(width,height);this.center.x-=dx/view.scale;this.center.y-=dy/view.scale;const next=this.frame(width,height);this.center={x:(width/2-next.x)/next.scale,y:(height/2-next.y)/next.scale};}
  screenToWorld(point:HomePoint,width:number,height:number):HomePoint {const frame=this.frame(width,height);return{x:(point.x-frame.x)/frame.scale,y:(point.y-frame.y)/frame.scale};}
}
