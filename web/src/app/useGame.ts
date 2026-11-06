import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';
import type {RewardReceipt} from '../ui/RewardNotice';
import {GameStore} from '../core/state';
import {ApiError, HttpGameApi} from '../adapters/api/client';
import {GameController} from './controller';
import {rewardStatus} from '../modules/lottery/model';

// 装配 API、会话、流程控制器与快照。UI 只提交命令，不维护第二份游戏存档。
export function useGame() {
  const [store] = useState(() => new GameStore());
  const [port] = useState(() => new HttpGameApi());
  const [controller] = useState(() => new GameController(port, store));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rewardReceipt,setRewardReceipt]=useState<RewardReceipt|null>(null);
  const showClaimReceipt=(command:GameCommand,before:GameState|null)=>{
    if(command.type!=='CLAIM_PARCEL_REWARD'||!before)return;
    const after=store.getSnapshot();
    const reward=catalog?.parcelRewards?.find(reward=>reward.id===command.rewardId);
    if(!after||!reward||rewardStatus(before,reward).claimed||!rewardStatus(after,reward).claimed)return;
    const items=(['stamp','tuna'] as const).map(currency=>({currency,amount:reward[currency]})).filter(item=>item.amount>0);
    if(items.length)setRewardReceipt({title:'领取成功',subtitle:reward.name,items});
  };
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const booting = useRef(false);
  const initialize = useCallback(async () => {
    if (booting.current) return;
    booting.current = true;setBusy(true);setError('');
    try {const [data, progress] = await Promise.all([port.catalog(), port.initialize()]);setCatalog(data);store.replace(progress);setSessionUnavailable(false);}
    catch (e) {setError(e instanceof Error ? e.message : '暂时无法连接，请重试。');setSessionUnavailable(e instanceof ApiError && e.code === 'UNAUTHORIZED');}
    finally {setBusy(false);booting.current = false;}
  }, [port, store]);
  useEffect(() => {void initialize();}, [initialize]);
  const send = useCallback(async (command: GameCommand) => {
    const before=store.getSnapshot();
    setBusy(true);setError('');
    try {await controller.dispatch(command);showClaimReceipt(command,before);return true;}
    catch (e) {
      setError(e instanceof Error ? e.message : '操作尚未确认，请重试。');
      setSessionUnavailable(e instanceof ApiError && e.code === 'UNAUTHORIZED');
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {try {store.replace(await port.load());} catch { /* 保留错误，等待重试。 */ }}
      return false;
    } finally {setBusy(false);}
  }, [controller, port, store, catalog]);
  const skipDialogue = useCallback(async (optionId?: 'proud' | 'honest') => {
    if (busy || port.pending() || !catalog) return false;
    setBusy(true);setError('');
    try {
      await controller.skipDialogue(catalog, optionId);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '跳过剧情失败');
      setSessionUnavailable(e instanceof ApiError && e.code === 'UNAUTHORIZED');
      return false;
    } finally {
      setBusy(false);
    }
  }, [controller, catalog, busy, port]);
  // 行走里程上报走静默通道:不锁界面,与其他操作冲突时丢弃本段,下一段再报。
  const reportMove = useCallback(async (distance: number) => {
    try {
      await controller.dispatch({type: 'REPORT_MOVE', distance});
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {setError(e.message);setSessionUnavailable(true);return;}
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {try {store.replace(await port.load());} catch { /* 留给下一次操作处理。 */ }}
      else console.warn('REPORT_MOVE discarded:', e); // 静默通道不锁界面,但留痕便于排查。
    }
  }, [controller, port, store]);
  const resetSession = useCallback(() => {
    localStorage.removeItem('stray-kitty.session.v1');
    localStorage.removeItem('stray-kitty.account.v1');
    localStorage.removeItem('stray-kitty.pending.v1');
    sessionStorage.removeItem('stray-kitty.payment-return.v1');
    // “重新开始丢序章”的根因：服务端新会话本来就从头（prologue_1）开始，
    // 但序章开场动画与守护教学的“已完成”标记留在 localStorage 里，重开后被直接跳过。必须一并清空。
    localStorage.removeItem('stray-kitty.prologue.intro');
    localStorage.removeItem('stray-kitty.tutorial.battle');
    localStorage.removeItem('stray-kitty.tutorial.home');
    localStorage.removeItem('stray-kitty.audio.homeChimed');
    window.location.reload();
  }, []);
  const startNewJourney = useCallback(async () => {
    setBusy(true);setError('');
    try {
      const [data, progress] = await Promise.all([port.catalog(), port.startNewJourney()]);
      setCatalog(data);store.replace(progress);setSessionUnavailable(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法创建新旅程，请重试。');
      setSessionUnavailable(e instanceof ApiError && e.code === 'UNAUTHORIZED');
    } finally {setBusy(false);}
  }, [port, store]);
  // 支付充值绕过命令通道直接改存档,到账后用它重拉状态刷新钱包。
  const refresh = useCallback(async () => {
    try {store.replace(await port.load());} catch { /* 充值弹窗自己会提示,这里静默保留旧状态。 */ }
  }, [port, store]);
  const retry = useCallback(async () => {
    const pending = port.pending();
    if (!pending) {await initialize();return;}
    setBusy(true);setError('');
    const before=store.getSnapshot();
    try {
      await port.execute(pending.request, pending.key);
      const [latest, content] = await Promise.all([port.load(), port.catalog()]);
      setCatalog(content);store.replace(latest);setSessionUnavailable(false);
      showClaimReceipt(pending.request.command,before);
    } catch (e) {setError(e instanceof Error ? e.message : '仍未确认，请稍后再试。');setSessionUnavailable(e instanceof ApiError && e.code === 'UNAUTHORIZED');}
    finally {setBusy(false);}
  }, [port, store, initialize, catalog]);
  const pending = !!port.pending();
  return {state, catalog, busy, error, pending, rewardReceipt, dismissReward:()=>setRewardReceipt(null), accountName:port.accountName(), sessionUnavailable, startNewJourney, send, reportMove, skipDialogue, resetSession, retry, refresh, port, disabled: busy || pending};
}
