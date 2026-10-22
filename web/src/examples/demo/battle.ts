export interface Shadow {id: number; lane: number; x: number; hp: number}
// 可替换的接入样例；正式塔防由模块负责人实现 BattleContext → BattleResult。
export class DemoBattle {
  elapsed=0; energy: number; lives=3; placed: {lane:number;column:number;cooldown:number}[]=[];
  shadows: Shadow[]=[]; spawned=0; outcome: 'won'|'lost'|null=null;
  constructor(readonly lanes=3, readonly waves=2, bonus=false, readonly shadowPressure: -1 | 0 | 1 = 0) {this.energy=bonus?8:6;}
  place(lane:number,column:number): boolean {
    if(this.outcome||!Number.isInteger(lane)||!Number.isInteger(column)||lane<0||lane>=this.lanes||column<0||column>=5||this.energy<2||this.placed.some(p=>p.lane===lane&&p.column===column))return false;
    this.energy-=2;this.placed.push({lane,column,cooldown:0});return true;
  }
  update(delta:number) {
    if(this.outcome||!Number.isFinite(delta)||delta<=0)return;
    const dt=Math.min(delta,.25), before=this.elapsed;this.elapsed+=dt;
    if(Math.floor(this.elapsed/4)>Math.floor(before/4))this.energy=Math.min(12,this.energy+1);
    if(this.spawned<this.lanes*this.waves&&this.elapsed>=2+this.spawned*1.2) {
      this.shadows.push({id:this.spawned,lane:this.spawned%this.lanes,x:740,hp:3});this.spawned++;
    }
    for(const p of this.placed) {
      p.cooldown-=dt;const target=this.shadows.filter(s=>s.lane===p.lane&&s.hp>0).sort((a,b)=>a.x-b.x)[0];
      if(target&&p.cooldown<=0){target.hp--;p.cooldown=.85;}
    }
    // 接入事件压力的参考效果；正式塔防参数由模块负责人调整。
    for(const shadow of this.shadows) {shadow.x-=dt*36*(1+this.shadowPressure*.2);if(shadow.hp>0&&shadow.x<95){shadow.hp=0;this.lives--;}}
    this.shadows=this.shadows.filter(s=>s.hp>0);
    if(this.lives<=0)this.outcome='lost';
    else if(this.spawned===this.lanes*this.waves&&this.shadows.length===0)this.outcome='won';
  }
}
