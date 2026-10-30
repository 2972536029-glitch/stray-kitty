import {useCallback, useEffect, useState} from 'react';
import type {ChargeResponse, PaymentTxn, RechargePack} from '../contracts';
import type {GameApiPort} from '../core/ports';
import Modal from './Modal';
import {playSound} from './soundEffects';

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 金枪鱼补给小站:三档礼包 + 模拟卡号(4242 必成功/0000 必失败) + 可折叠流水。
// 支付成功与失败都是正常剧情;失败给治愈文案,成功回执带流水号,并回调刷新钱包。
export default function RechargeDialog({playerId, packs, tuna, api, onCharged, onClose}: {
  playerId: string; packs: RechargePack[]; tuna: number; api: GameApiPort; onCharged: () => Promise<void> | void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(packs[0]?.id ?? '');
  const [cardNo, setCardNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ChargeResponse | null>(null);
  const [history, setHistory] = useState<PaymentTxn[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pack = packs.find(p => p.id === selected) ?? null;
  const refreshHistory = useCallback(async () => {
    try {const data = await api.paymentHistory(playerId);setHistory(data.txns ?? []);setHistoryError(false);}
    catch {setHistoryError(true);}
  }, [api, playerId]);
  useEffect(() => {void refreshHistory();}, [refreshHistory]);
  const pay = async () => {
    if (!pack || busy) return;
    setBusy(true);setError('');setResult(null);
    playSound('send');
    try {
      const data = await api.charge(playerId, pack.id, cardNo.trim());
      setResult(data);
      setCardNo('');
      if (data.status === 'confirmed') await onCharged();
      await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : '支付通道暂时没有回音，请稍后查看记录。');
    } finally {setBusy(false);}
  };
  // 回执音:到账播上行琶音,被退回播低沉闷响。
  useEffect(() => {if (!result) return;playSound(result.status === 'confirmed' ? 'chime' : 'error');}, [result]);
  useEffect(() => {if (error) playSound('error');}, [error]);
  return <Modal title="金枪鱼补给小站" onClose={onClose} className="recharge-dialog">
    <header><div><span className="eyebrow">TUNA SUPPLY STATION</span><h2>🥫 金枪鱼补给小站</h2></div><div className="shop-wallet tuna">🥫 <b>{tuna}</b><small>金枪鱼罐头</small></div></header>
    <p className="recharge-intro">两脚兽的爱心罐头，会变成花房里的高级家具包裹。这里是<b>演示支付</b>：4242 开头的卡必成功，0000 开头的卡必失败，其他卡会被温柔地退回。</p>
    <div className="recharge-grid">{packs.map(p => <button type="button" key={p.id} className={`pack-card ${p.id === selected ? 'selected' : ''}`} aria-pressed={p.id === selected} onClick={() => {setSelected(p.id);setResult(null);setError('');}}>
      <span className="pack-icon" aria-hidden="true">{p.id === 'pack_small' ? '🥫' : p.id === 'pack_medium' ? '🧺' : '📦'}</span>
      <strong>{p.name}</strong>
      <small>{p.desc}</small>
      <b>{money(p.priceCents)} <span>→ 🥫 ×{p.tunaGranted}</span></b>
    </button>)}</div>
    {pack && <div className="recharge-paybox">
      <label htmlFor="recharge-card-no">模拟卡号（12~19 位数字）</label>
      <input id="recharge-card-no" value={cardNo} maxLength={19} placeholder="请输入演示卡号" inputMode="numeric" autoComplete="off" disabled={busy} onChange={e => setCardNo(e.target.value)}/>
      <div className="recharge-demo-tips">
        <button type="button" className="secondary" disabled={busy} onClick={() => setCardNo('4242424242424242')}>填成功卡 (4242)</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setCardNo('0000123412341234')}>填失败卡 (0000)</button>
        <button type="button" disabled={busy || cardNo.trim().length < 12} onClick={() => void pay()}>{busy ? '支付中…' : `支付 ${money(pack.priceCents)}`}</button>
      </div>
    </div>}
    {error && !result && <p className="shop-notice shop-error" role="alert">{error}</p>}
    {result && (result.status === 'confirmed'
      ? <div className="recharge-result ok" role="status">
          <div className="receipt-art" aria-hidden="true">🥫</div>
          <h3>到账啦！+{result.tunaGranted} 罐金枪鱼</h3>
          <p>余额 🥫 {result.tunaBalance}。伙伴们围着罐头山开心地转圈圈。</p>
          <small>流水号 {result.txnId}</small>
          <div className="receipt-actions"><button type="button" onClick={() => setResult(null)}>再买一档</button><button type="button" className="secondary" onClick={onClose}>回去照顾伙伴</button></div>
        </div>
      : <div className="recharge-result declined" role="status">
          <div className="receipt-art" aria-hidden="true">🌧️</div>
          <p>{result.healingMsg}</p>
          <small>{result.reason}</small>
          <div className="receipt-actions"><button type="button" className="secondary" onClick={() => setResult(null)}>换张卡试试</button><button type="button" onClick={onClose}>先去晒太阳</button></div>
        </div>)}
    <details className="recharge-history" open={historyOpen} onToggle={e => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
      <summary>📖 历史充值记录{history ? `（${history.length}）` : ''}</summary>
      {historyError ? <p className="muted">记录暂时没有读到，充值不受影响。</p>
        : !history ? <p className="muted">正在翻小账本……</p>
        : history.length === 0 ? <p className="muted">这里会记下罐头的来来往往，第一笔从你开始。</p>
        : <ul>{history.map(t => <li key={t.id}>
            <span className={t.status === 'confirmed' ? 'is-good' : 'is-declined'}>{t.status === 'confirmed' ? '✓ 成功' : '未成功'}</span>
            <div><b>{t.amount > 0 ? `充值 ${money(t.amount)}` : `${t.currency === 'stamp' ? '✦ 邮票' : '🥫 罐头'} 消耗${t.spent ? ` ${t.spent}` : ''}`}</b><small>{fmtTime(t.createdAt)}{t.cardSuffix ? ` · 卡尾号 ${t.cardSuffix}` : ''}{t.reason ? ` · ${t.reason}` : ''}</small></div>
          </li>)}</ul>}
    </details>
    <footer>演示支付：不产生真实扣款。金枪鱼只用于家园装饰，不影响主线。</footer>
  </Modal>;
}
