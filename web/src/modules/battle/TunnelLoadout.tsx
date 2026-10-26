import type {GameCommand} from '../../contracts';
import './chapter-loadout.css';

export function TunnelLoadout({disabled, onCommand}: {
  disabled: boolean; onCommand: (command: GameCommand) => void;
}) {
  return <section className="chapter-loadout" aria-label="第四章试玩准备">
    <span className="chapter-loadout-kicker">第四章 · 地下通道试玩</span>
    <h3>在暗管深处守住归路</h3>
    <p>六位伙伴守住 37 格不规则通道中的三处入口，保护 C2 的喵喵。左上黑影从破管口绕行，点点照料伙伴，墨墨以夜视与护盾应对首领的断灯脉冲。</p>
    <p className="chapter-loadout-note">这是家园独立试玩。守完八波并击败四格首领获胜，最多允许 2 次突破。断灯时伙伴仍可见、照常作战，黑暗会自行结束；技能随战斗时间蓄能，体力耗尽的伙伴本场退场。</p>
    <button type="button" className="chapter-loadout-start" data-testid="tunnel-enter" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'tunnel_boss'})}>进入第四章试玩 →</button>
  </section>;
}
