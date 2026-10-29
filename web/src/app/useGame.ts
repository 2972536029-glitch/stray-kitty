import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import type {Catalog, GameCommand} from '../contracts';
import {GameStore} from '../core/state';
import {ApiError, HttpGameApi} from '../adapters/api/client';
import {GameController} from './controller';

// 装配 API、会话、流程控制器与快照。UI 只提交命令，不维护第二份游戏存档。
export function useGame() {
  const [store] = useState(() => new GameStore());
  const [port] = useState(() => new HttpGameApi());
  const [controller] = useState(() => new GameController(port, store));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const booting = useRef(false);
  const initialize = useCallback(async () => {
    if (booting.current) return;
    booting.current = true;setBusy(true);setError('');
    try {const [data, progress] = await Promise.all([port.catalog(), port.initialize()]);setCatalog(data);store.replace(progress);}
    catch (e) {setError(e instanceof Error ? e.message : '暂时无法连接，请重试。');}
    finally {setBusy(false);booting.current = false;}
  }, [port, store]);
  useEffect(() => {void initialize();}, [initialize]);
  const send = useCallback(async (command: GameCommand) => {
    setBusy(true);setError('');
    try {await controller.dispatch(command);return true;}
    catch (e) {
      setError(e instanceof Error ? e.message : '操作尚未确认，请重试。');
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {try {store.replace(await port.load());} catch { /* 保留错误，等待重试。 */ }}
      return false;
    } finally {setBusy(false);}
  }, [controller, port, store]);
  const skipDialogue = useCallback(async () => {
    setBusy(true);setError('');
    try {
      let cur = store.getSnapshot();
      while (cur && cur.phase === 'dialogue' && cur.storyNodeId) {
        await controller.dispatch({type: 'ADVANCE_STORY', nodeId: cur.storyNodeId});
        cur = store.getSnapshot();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '跳过剧情失败');
    } finally {
      setBusy(false);
    }
  }, [controller, store]);
  // 行走里程上报走静默通道:不锁界面,与其他操作冲突时丢弃本段,下一段再报。
  const reportMove = useCallback(async (distance: number) => {
    try {
      await controller.dispatch({type: 'REPORT_MOVE', distance});
    } catch (e) {
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {try {store.replace(await port.load());} catch { /* 留给下一次操作处理。 */ }}
      else console.warn('REPORT_MOVE discarded:', e); // 静默通道不锁界面,但留痕便于排查。
    }
  }, [controller, port, store]);
  const resetSession = useCallback(() => {
    localStorage.removeItem('stray-kitty.session.v1');
    localStorage.removeItem('stray-kitty.pending.v1');
    // “重新开始丢序章”的根因：服务端新会话本来就从头（prologue_1）开始，
    // 但序章开场动画与守护教学的“已完成”标记留在 localStorage 里，重开后被直接跳过。必须一并清空。
    localStorage.removeItem('stray-kitty.prologue.intro');
    localStorage.removeItem('stray-kitty.tutorial.battle');
    localStorage.removeItem('stray-kitty.tutorial.home');
    localStorage.removeItem('stray-kitty.audio.homeChimed');
    window.location.reload();
  }, []);
  // 支付充值绕过命令通道直接改存档,到账后用它重拉状态刷新钱包。
  const refresh = useCallback(async () => {
    try {store.replace(await port.load());} catch { /* 充值弹窗自己会提示,这里静默保留旧状态。 */ }
  }, [port, store]);
  const retry = useCallback(async () => {
    const pending = port.pending();
    if (!pending) {await initialize();return;}
    setBusy(true);setError('');
    try {
      await port.execute(pending.request, pending.key);
      const [latest, content] = await Promise.all([port.load(), port.catalog()]);
      setCatalog(content);store.replace(latest);
    } catch (e) {setError(e instanceof Error ? e.message : '仍未确认，请稍后再试。');}
    finally {setBusy(false);}
  }, [port, store, initialize]);
  const pending = !!port.pending();
  return {state, catalog, busy, error, pending, send, reportMove, skipDialogue, resetSession, retry, refresh, port, disabled: busy || pending};
}
