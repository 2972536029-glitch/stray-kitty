import {useEffect, useRef, useState} from 'react';
import type {PaymentTxn, RechargePack} from '../contracts';
import type {GameApiPort} from '../core/ports';
import Modal from './Modal';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 10;
const RECENT_WINDOW_MS = 10 * 60 * 1000;

// 沙盒支付返回页:从收银台跳回(URL 带 ?payment=return)后只读轮询流水,
// 等 webhook → 支付服务 → 游戏入账链路完成。前端只展示,绝不发货(PRD §4)。
export default function PaymentReturnNotice({playerId, packs, api, onClose}: {
  playerId: string; packs: RechargePack[]; api: GameApiPort; onClose: () => void;
}) {
  const [txns, setTxns] = useState<PaymentTxn[] | null>(null);
  const [tries, setTries] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async (round: number) => {
      if (cancelled) return;
      try {
        const data = await api.paymentHistory(playerId);
        if (cancelled) return;
        setTxns(data.txns ?? []);
        const fresh = (data.txns ?? []).some(t => t.id.startsWith('xs-') && t.status === 'confirmed' && Date.now() - new Date(t.createdAt).getTime() < RECENT_WINDOW_MS);
        if (fresh) return;
      } catch { /* 网络抖动不中断轮询 */ }
      if (round >= POLL_MAX_TRIES) return;
      timer.current = setTimeout(() => {if (!cancelled) {setTries(round);void poll(round + 1);}}, POLL_INTERVAL_MS);
    };
    void poll(1);
    return () => {cancelled = true;if (timer.current) clearTimeout(timer.current);};
  }, [api, playerId]);
  const credited = txns?.find(t => t.id.startsWith('xs-') && t.status === 'confirmed' && Date.now() - new Date(t.createdAt).getTime() < RECENT_WINDOW_MS) ?? null;
  const pack = credited ? packs.find(p => p.id === credited.packId) ?? null : null;
  return <Modal title="沙盒支付返回" onClose={onClose} className="recharge-dialog">
    <header><div><span className="eyebrow">SANDBOX PAYMENT</span><h2>🧾 沙盒支付回执</h2></div></header>
    {credited
      ? <div className="recharge-result ok" role="status">
          <div className="receipt-art" aria-hidden="true">🥫</div>
          <h3>到账啦！{pack ? `+${pack.tunaGranted} 罐金枪鱼` : '罐头已在路上'}</h3>
          <p>Xsolla 沙盒的那笔支付已完成入账，伙伴们围着罐头山开心地转圈圈。</p>
          <small>流水号 {credited.id}</small>
        </div>
      : <div className="recharge-result" role="status">
          <div className="receipt-art" aria-hidden="true">⏳</div>
          {tries >= POLL_MAX_TRIES
            ? <p>暂时还没等到入账回执。别担心，支付已在渠道侧完成，金枪鱼最迟几分钟内自动到账，稍后打开补给小站看流水就好。</p>
            : <p>正在等沙盒收银台的入账回执……（{tries * 3} 秒）</p>}
        </div>}
    <div className="receipt-actions"><button type="button" onClick={onClose}>回到花房</button></div>
    <footer>沙盒支付：不产生真实扣款。发货由服务端 webhook 完成，页面刷新不影响入账。</footer>
  </Modal>;
}
