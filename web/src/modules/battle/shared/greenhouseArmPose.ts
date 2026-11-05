import {getBossAttackMotion} from './bossAttackMotion';

type Point={x:number;y:number};
type Boss=Point&{width?:number;height?:number;phase:string};
type Arm={shoulder:Point;control:Point;hand:Point};
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** Local hand-to-target coordinates. The tip lags behind the hand during the
 * backswing, unfurls to the hit, then carries its bend through the other side.
 * It is visual feedback on the existing hit clock, not a simulated projectile. */
export function getGreenhouseWhipCurve(distance:number,progress:number):Point[]{
  const length=Math.max(0,Number.isFinite(distance)?distance:0);
  const p=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:1));
  // time, reach, broad bend, curling tip, tip offset
  const keys=[
    [0,.26,-.36,.18,-.12],
    [.18,.4,-.6,.3,-.34],
    [.42,1,0,0,0],
    [.64,.87,.42,-.16,.22],
    [1,.18,.12,0,.14],
  ];
  const index=Math.max(0,Math.min(keys.length-2,keys.findIndex((key,i)=>i>0&&p<=key[0])-1));
  const a=keys[index],b=keys[index+1],t=(p-a[0])/(b[0]-a[0]),ease=t*t*(3-2*t);
  const values=a.map((v,i)=>v+(b[i]-v)*ease);
  const [,reach,bend,curl,tip]=values,amplitude=Math.min(length,150);
  return Array.from({length:25},(_,i)=>{
    const s=i/24,envelope=Math.sin(Math.PI*s);
    return {x:length*reach*s,
      y:amplitude*(envelope*bend+Math.sin(2*Math.PI*s)*envelope*curl+tip*s)};
  });
}

/** One pose owns both the vine arm and the world-space whip attachment. Keeping
 * those together prevents the long vine floating beside a moving hand. */
export function getGreenhouseArmPose(boss:Boss,target?:Point,remaining?:number,cellSize=80){
  const active=target&&remaining!==undefined&&remaining>0&&(boss.phase==='idle'||boss.phase==='defeated');
  const motion=getBossAttackMotion(active?remaining:undefined);
  const dx=target?target.x+.5-boss.x-(boss.width??2)/2:-1;
  const dy=target?target.y+.5-boss.y-(boss.height??2)/2:0;
  const distance=Math.hypot(dx,dy),ux=distance>.001?dx/distance:-1,uy=distance>.001?dy/distance:0;
  const side: -1|1=ux>0?1:-1;
  const scale=1.7*cellSize/80;
  const body={x:boss.x*cellSize+(12+ux*(4*motion.strike-2*motion.pull))*cellSize/80,
    y:boss.y*cellSize+(10+uy*3*motion.strike)*cellSize/80,scale};
  const left:Arm={shoulder:{x:17,y:42},control:{x:-4,y:42},hand:{x:5,y:69}};
  const right:Arm={shoulder:{x:63,y:42},control:{x:83,y:49},hand:{x:71,y:71}};
  const arm=side===-1?left:right;
  if(active){
    const shoulder=arm.shoulder,normal={x:-uy*side,y:ux*side};
    const back={x:shoulder.x-ux*12,y:shoulder.y-27};
    const thrown={x:shoulder.x+ux*37-normal.x*4,y:shoulder.y+uy*37-normal.y*4};
    const follow={x:thrown.x+normal.x*14,y:thrown.y+normal.y*14+3};
    const elbowBack={x:shoulder.x+side*16,y:shoulder.y-6};
    const elbowThrown={x:shoulder.x+ux*18-normal.x*8,y:shoulder.y+uy*18-normal.y*8};
    const elbowFollow={x:shoulder.x+ux*16+normal.x*9,y:shoulder.y+uy*16+normal.y*9};
    const sample=(points:Point[],times:number[])=>{
      const p=motion.progress;
      const segment=Math.min(times.length-2,Math.max(0,times.findIndex((time,i)=>i>0&&p<=time)-1));
      const t=Math.max(0,Math.min(1,(p-times[segment])/(times[segment+1]-times[segment])));
      return mix(points[segment],points[segment+1],t*t*(3-2*t));
    };
    // The elbow leads slightly; the flexible hand follows through and settles.
    arm.hand=sample([arm.hand,back,thrown,follow,arm.hand],[0,.18,.42,.65,1]);
    arm.control=sample([arm.control,elbowBack,elbowThrown,elbowFollow,arm.control],[0,.16,.35,.59,1]);
    arm.shoulder={x:shoulder.x-side*2*motion.pull,y:shoulder.y-4*motion.pull};
  }
  // A still-visible old hit can overlap the separate seed skill's raised arms.
  // Its attachment follows the hand that is actually on screen in that pose.
  const hand=boss.phase==='windup'?{x:side===-1?7:73,y:8}:arm.hand;
  return {body,left,right,side,active:!!active,whipOrigin:{x:body.x+hand.x*scale,y:body.y+hand.y*scale}};
}
