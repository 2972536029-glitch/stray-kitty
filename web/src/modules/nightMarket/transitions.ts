import type {MarketFloor, MarketTransitionRequest} from './map';

export type MarketTransitionFrame={id:string;exit:boolean;x:number;y:number;height:number;floor:MarketFloor;done:boolean;cameraPolicy:'hold'};
type RunningTransition={request:MarketTransitionRequest;start:{x:number;y:number};elapsedMs:number};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const smooth=(value:number)=>value*value*(3-2*value);

export function sampleMarketTransition(request:MarketTransitionRequest,start:{x:number;y:number},elapsedMs:number):MarketTransitionFrame {
  const progress=clamp(elapsedMs/request.durationMs,0,1),approachEnd=.18;
  let x:number,y:number,height=0,flightProgress=0;
  if(progress<=approachEnd){
    const amount=smooth(progress/approachEnd);x=start.x+(request.from.x-start.x)*amount;y=start.y+(request.from.y-start.y)*amount;
  } else {
    flightProgress=smooth((progress-approachEnd)/(1-approachEnd));
    x=request.from.x+(request.to.x-request.from.x)*flightProgress;y=request.from.y+(request.to.y-request.from.y)*flightProgress;
    if(request.animation!=='stairs')height=Math.sin(Math.PI*flightProgress)*request.arcHeight;
  }
  const floor=request.fromFloor!==request.toFloor&&flightProgress>=.52?request.toFloor:request.fromFloor;
  return {id:request.id,exit:request.exit,x,y,height,floor,done:progress>=1,cameraPolicy:'hold'};
}

export class MarketTransitionController {
  private running:RunningTransition|null=null;
  get active(){return this.running!==null;}

  begin(request:MarketTransitionRequest,start:{x:number;y:number}) {
    if(this.running)return false;
    this.running={request,start,elapsedMs:0};
    return true;
  }

  advance(deltaMs:number):MarketTransitionFrame|null {
    if(!this.running)return null;
    this.running.elapsedMs+=Math.max(0,deltaMs);
    const frame=sampleMarketTransition(this.running.request,this.running.start,this.running.elapsedMs);
    if(frame.done)this.running=null;
    return frame;
  }

  cancel(){const previous=this.running;this.running=null;return previous?{floor:previous.request.fromFloor,position:previous.start}:null;}
}
