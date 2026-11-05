import {useState} from 'react';
import Modal from './Modal';
export default function SettingsPanel({musicVolume,sfxVolume,onMusicVolume,onSfxVolume,onClose,onLogin,onRegister,onReset,disabled}: {
  musicVolume:number;sfxVolume:number;onMusicVolume:(value:number)=>void;onSfxVolume:(value:number)=>void;
  onClose:()=>void;onLogin:()=>void;onRegister:()=>void;onReset:()=>void;disabled:boolean;
}) {
  const [confirmReset,setConfirmReset] = useState(false);
  return <Modal title="游戏设置" onClose={onClose} className="settings-modal">
    <header><span className="eyebrow">OUR LITTLE JOURNEY</span><h2>游戏设置</h2></header>
    <section className="settings-section"><h3>声音</h3>
      <label className="setting-row"><span>背景音乐与环境音 <output>{musicVolume}%</output></span><input type="range" min="0" max="100" value={musicVolume} aria-label="背景音乐音量" onChange={e=>onMusicVolume(Number(e.target.value))}/></label>
      <label className="setting-row"><span>按钮与游戏音效 <output>{sfxVolume}%</output></span><input type="range" min="0" max="100" value={sfxVolume} aria-label="音效音量" onChange={e=>onSfxVolume(Number(e.target.value))}/></label>
    </section>
    <section className="settings-section"><h3>小猫账号</h3><p>游客旅程按浏览器分别保存。注册可绑定当前进度，在其他设备登录同一账号即可接着玩。</p>
      <div className="settings-actions"><button disabled={disabled} onClick={onLogin}>登录账号</button><button className="secondary" disabled={disabled} onClick={onRegister}>注册并保存旅程</button></div>
    </section>
    <section className="settings-section settings-reset"><h3>本机数据</h3>{confirmReset ? <div className="settings-reset-confirm" role="group" aria-label="确认清空本机旅程"><p>将移除本机保存的旅程凭证并从头开始。未注册的游客旅程将无法通过本机找回；已绑定账号的云端进度仍可登录取回。</p><div className="settings-actions"><button className="settings-danger" disabled={disabled} onClick={onReset}>确认清空并重新开始</button><button className="secondary" onClick={()=>setConfirmReset(false)}>保留当前旅程</button></div></div> : <><p>退出当前本机旅程，从新的游客存档开始。</p><button className="settings-clear" disabled={disabled} onClick={()=>setConfirmReset(true)}>清空本机旅程</button></>}
    </section>
  </Modal>;
}
