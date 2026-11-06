import {useCallback, useEffect, useState} from 'react';
import type {ChargeResponse, PaymentConfig, PaymentTxn, RechargePack} from '../contracts';
import type {GameApiPort} from '../core/ports';
import Modal from './Modal';
import {navigateCheckout} from './MobileViewport';
import WindowHeading from './WindowHeading';
import RewardNotice from './RewardNotice';
import './recharge.css';

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 金枪鱼补给小站:三档礼包 + 双支付形态 + 可折叠流水。
// mock 形态用演示卡号(4242 必成功/0000 必失败);xsolla 形态整页跳转沙盒收银台,
// 发货走 webhook 异步入账,返回后由 PaymentReturnNotice 轮询展示。失败给治愈文案,成功回调刷新钱包。
export default function RechargeDialog({playerId, packs, tuna, api, onCharged, onClose, onCheckout, initialPack}: {
  initialPack?:string; onCheckout:(packId:string,knownTxnIds:string[])=>void;
  playerId: string; packs: RechargePack[]; tuna: number; api: GameApiPort; onCharged: () => Promise<void> | void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(initialPack ?? packs[0]?.id ?? '');
  const [cardNo, setCardNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ChargeResponse | null>(null);
  const [history, setHistory] = useState<PaymentTxn[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [receiptOpen,setReceiptOpen]=useState(false);
  const pack = packs.find(p => p.id === selected) ?? null;
  const xsolla = config?.provider === 'xsolla';
  const refreshHistory = useCallback(async () => {
    try {const data = await api.paymentHistory(playerId);setHistory(data.txns ?? []);setHistoryError(false);}
    catch {setHistoryError(true);}
  }, [api, playerId]);
  useEffect(() => {void refreshHistory();}, [refreshHistory]);
  useEffect(() => {
    api.paymentConfig().then(setConfig).catch(() => setConfig({provider: 'mock', sandbox: false}));
  }, [api]);
  useEffect(()=>{
    const returned=()=>{setBusy(false);setLeaving(false);void refreshHistory();};
    window.addEventListener('pageshow',returned);
    return()=>window.removeEventListener('pageshow',returned);
  },[refreshHistory]);
  const pay = async () => {
    if (!pack || busy) return;
    setBusy(true);setError('');setResult(null);
    try {
      const data = await api.charge(playerId, pack.id, cardNo.trim());
      setResult(data);
      setCardNo('');
      if (data.status === 'confirmed') {await onCharged();setReceiptOpen(true);}
      await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : '支付通道暂时没有回音，请稍后查看记录。');
    } finally {setBusy(false);}
  };
  // 跳转形态:换会话链接后整页前往沙盒收银台;回来时 URL 带 ?payment=return,由返回通知接手。
  const payViaXsolla = async () => {
    if (!pack || busy) return;
    setBusy(true);setError('');
    try {
      const history = await api.paymentHistory(playerId);
      const data = await api.paymentSession(playerId, pack.id);
      onCheckout(pack.id,(history.txns??[]).map(txn=>txn.id));
      setLeaving(true);
      navigateCheckout(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '沙盒收银台暂时没有回音，请稍后再试。');
      setBusy(false);
    }
  };
  return <Modal variant="paper" title="金枪鱼补给小站" onClose={onClose} className="recharge-dialog">
    <WindowHeading title="金枪鱼补给小站" icon="supply"/>
    <div className="window-content recharge-content">
    <div className="recharge-summary"><p>为花房添置心仪的家具</p><div className="recharge-balance" aria-label={`罐头余额 ${tuna}`}><b>🥫 {tuna}</b></div></div>
    <div className="recharge-grid">{packs.map(p => <button type="button" key={p.id} className={`pack-card ${p.id === selected ? 'selected' : ''}`} aria-pressed={p.id === selected} disabled={busy} onClick={() => {setSelected(p.id);setResult(null);setError('');}}>
      <span className="pack-icon" aria-hidden="true">{p.id === 'pack_small' ? '🥫' : p.id === 'pack_medium' ? '🧺' : '📦'}</span>
      <strong>{p.name}</strong>
      <small><span className="pack-quantity">{p.tunaGranted}</span> 罐金枪鱼</small>
      <b>{money(p.priceCents)}</b>
    </button>)}</div>
    {pack && config?.provider==='mock' && <div className="recharge-paybox">
      <label htmlFor="recharge-card-no">模拟卡号（12~19 位数字）</label>
      <input id="recharge-card-no" value={cardNo} maxLength={19} placeholder="请输入演示卡号" inputMode="numeric" autoComplete="off" disabled={busy} onChange={e => setCardNo(e.target.value)}/>
      <div className="recharge-demo-tips">
        <button type="button" className="secondary" disabled={busy} onClick={() => setCardNo('4242424242424242')}>填成功卡 (4242)</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setCardNo('0000123412341234')}>填失败卡 (0000)</button>
        <button type="button" disabled={busy || cardNo.trim().length < 12} onClick={() => void pay()}>{busy ? '支付中…' : `支付 ${money(pack.priceCents)}`}</button>
      </div>
    </div>}
    {pack && xsolla && <div className="recharge-paybox">
      <button type="button" disabled={busy || leaving} onClick={() => void payViaXsolla()}>{leaving ? '正在前往沙盒收银台…' : `前往支付 ${money(pack.priceCents)}`}</button>
      <p className="muted">支付完成后自动回到这里</p>
    </div>}
    {error && !result && <p className="shop-notice shop-error" role="alert">{error}</p>}
    {result?.status==='confirmed'&&receiptOpen&&<RewardNotice receipt={{title:'充值到账啦',items:[{currency:'tuna',amount:result.tunaGranted}]}} onClose={()=>{setReceiptOpen(false);setResult(null);}}/>}
    {result?.status==='declined'&&<div className="recharge-result declined" role="status"><p>{result.healingMsg}</p><div className="receipt-actions"><button type="button" onClick={()=>setResult(null)}>换张卡试试</button></div></div>}
    <details className="recharge-history" open={historyOpen} onToggle={e => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
      <summary>📖 历史充值记录{history ? `（${history.length}）` : ''}</summary>
      {historyError ? <p className="muted">记录暂时没有读到，充值不受影响。</p>
        : !history ? <p className="muted">正在翻小账本……</p>
        : history.length === 0 ? <p className="muted">这里会记下罐头的来来往往，第一笔从你开始。</p>
        : <ul>{history.map(t => <li key={t.id}>
            <span className={t.status === 'confirmed' ? 'is-good' : 'is-declined'}>{t.status === 'confirmed' ? '✓ 成功' : '未成功'}</span>
            <div><b>{t.amount > 0 ? `充值 ${money(t.amount)}` : '🥫 消耗'}</b><small>{fmtTime(t.createdAt)}{t.cardSuffix ? ` · 卡尾号 ${t.cardSuffix}` : ''}{t.reason ? ` · ${t.reason}` : ''}</small></div>
          </li>)}</ul>}
    </details>
    <footer>{xsolla?'沙盒支付':'演示支付'} · 不产生真实扣款</footer>
    </div>
  </Modal>;
}
