import './goal-label.css';

/** Goal cells already expose their role to assistive technology; keep labels out of the hit area. */
export function GoalLabel({showName=true}:{showName?:boolean}){
  return <span className="btl-goal-label" data-testid="battle-goal-label" aria-hidden="true">{showName&&<strong className="btl-goal-name">喵喵</strong>}<span className="btl-goal-caption">守护点</span></span>;
}
