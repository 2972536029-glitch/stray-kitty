import {useState} from 'react';
import Modal from './Modal';
import {playSound} from './soundEffects';

export type SupplyId = 'warmCan' | 'freezeDry';
export type SupplyAmounts = Record<SupplyId, number>;
export interface StageSupplyConfig {stageId: string; limits: SupplyAmounts; freeSupplies?: SupplyAmounts}
export interface ConfirmedLoadout {stageId: string; inventoryItems: SupplyAmounts; freeItems: SupplyAmounts}
export const DEMO_INVENTORY: SupplyAmounts = {warmCan: 5, freezeDry: 3};
export const PROLOGUE_SUPPLY: StageSupplyConfig = {stageId: 'prologue_tutorial_battle', limits: {warmCan: 2, freezeDry: 1}, freeSupplies: {warmCan: 2, freezeDry: 1}};
const items = [{id: 'warmCan' as SupplyId, name: '暖心罐罐', effect: '恢复 60 点体力', icon: '🥫'}, {id: 'freezeDry' as SupplyId, name: '蹦蹦冻干', effect: '增加 30 点能量', icon: '🐟'}];

export default function WarehousePanel({chapterId, onClose, onConfirm}: {chapterId: string; onClose: () => void; onConfirm: (loadout: ConfirmedLoadout) => void}) {
  const config = chapterId === 'prologue' ? PROLOGUE_SUPPLY : {stageId: `${chapterId}_supply`, limits: {warmCan: 3, freezeDry: 2}};
  const [selected, setSelected] = useState<SupplyAmounts>({warmCan: 0, freezeDry: 0});
  const [notice, setNotice] = useState('');
  const update = (id: SupplyId, delta: number) => setSelected(current => {
    const next = current[id] + delta;
    if (next < 0) return current;
    if (next > DEMO_INVENTORY[id]) {setNotice(`${items.find(item => item.id === id)?.name}库存不足`);playSound('error');return current;}
    if (next > config.limits[id]) {setNotice('已达到本关携带上限');playSound('error');return current;}
    setNotice('');playSound('step');return {...current, [id]: next};
  });
  return <Modal title="家园仓库与出战补给" onClose={onClose} className="warehouse-modal">
    <header><span className="eyebrow">GREENHOUSE PANTRY · DEMO</span><h2>家园仓库</h2><p>选择携带不等于已经消耗；正式锁定由服务端完成。</p></header>
    {config.freeSupplies && <section className="free-supply-block"><b>✦ 序章免费提供</b><span>暖心罐罐 ×2 · 蹦蹦冻干 ×1</span><small>不占玩家库存，未用不退。</small></section>}
    <section className="warehouse-items"><h3>仓库携带区</h3><p className="muted">演示库存：不会扣除、保存或到账。</p>{items.map(item => {const value = selected[item.id]; const max = Math.min(DEMO_INVENTORY[item.id], config.limits[item.id]); const blocked = value >= max; return <article className="warehouse-item" key={item.id}><div className="warehouse-icon">{item.icon}</div><div><div className="warehouse-title"><h3>{item.name}</h3><span>已有 {DEMO_INVENTORY[item.id]}</span></div><p>{item.effect}</p><div className="warehouse-choose"><span>本次携带 <b>{value}</b> 份 <small>上限 {config.limits[item.id]}</small></span><div><button data-sound="step" aria-label={`减少${item.name}`} disabled={!value} onClick={() => update(item.id, -1)}>−</button><button data-sound="step" aria-label={`增加${item.name}`} disabled={blocked} onClick={() => update(item.id, 1)}>＋</button></div></div>{blocked && <small className="warehouse-notice">{DEMO_INVENTORY[item.id] <= config.limits[item.id] ? '库存不足' : '已达本关上限'}</small>}</div></article>;})}</section>
    {notice && <p className="warehouse-notice" role="status">{notice}</p>}
    <footer className="warehouse-actions"><button className="quiet" onClick={onClose}>取消</button><button data-sound="pickup" onClick={() => {playSound('pickup');onConfirm({stageId: config.stageId, inventoryItems: selected, freeItems: config.freeSupplies ?? {warmCan: 0, freezeDry: 0}});}}>确认携带清单</button></footer>
    <p className="warehouse-footnote">当前为前端演示清单，尚未保存、扣除或锁定。</p>
  </Modal>;
}
