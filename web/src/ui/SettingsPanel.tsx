import {useState} from 'react';
import type {GameState} from '../contracts';
import {BGM_TRACKS, isHomeBgmUnlocked, type HomeBgmChoice} from '../core/audio';
import GameIcon from './GameIcon';
import Modal from './Modal';
import WindowHeading from './WindowHeading';

export default function SettingsPanel({
  musicVolume,
  sfxVolume,
  muted,
  homeBgm,
  inHome,
  state,
  onMusicVolume,
  onSfxVolume,
  onToggleMute,
  onHomeBgm,
  onClose,
  onLogin,
  onRegister,
  onReset,
  disabled,
}: {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  homeBgm: HomeBgmChoice;
  inHome: boolean;
  state: GameState | null;
  onMusicVolume: (value: number) => void;
  onSfxVolume: (value: number) => void;
  onToggleMute: () => void;
  onHomeBgm: (choice: HomeBgmChoice) => void;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onReset: () => void;
  disabled: boolean;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const unlockedCount = BGM_TRACKS.filter(track => isHomeBgmUnlocked(track.id, state)).length;
  const activeChoice: HomeBgmChoice = homeBgm !== 'auto' && isHomeBgmUnlocked(homeBgm, state) ? homeBgm : 'auto';

  return <Modal variant="paper" title="游戏设置" onClose={onClose} className="settings-modal">
    <WindowHeading title="游戏设置" icon="settings"/>
    <div className="window-content">
      <section className="settings-section">
        <h3>声音</h3>
        <div className="setting-mute-row">
          <div>
            <strong>全部声音</strong>
            <small>{muted ? '当前已在本设备静音' : '音乐与音效正常开启'}</small>
          </div>
          <button
            type="button"
            className={`setting-mute-btn${muted ? ' is-muted' : ''}`}
            data-mute-control="true"
            aria-pressed={muted}
            onClick={onToggleMute}
          >
            <GameIcon name={muted ? 'speakerOff' : 'speaker'}/>
            <span>{muted ? '已静音 · 点击恢复' : '开启中 · 点击静音'}</span>
          </button>
        </div>
        <label className="setting-row">
          <span>背景音乐与环境音 <output>{muted ? `已静音 (${musicVolume}%)` : `${musicVolume}%`}</output></span>
          <input type="range" min="0" max="100" value={musicVolume} aria-label="背景音乐音量" onChange={e => onMusicVolume(Number(e.target.value))}/>
        </label>
        <label className="setting-row">
          <span>按钮与游戏音效 <output>{muted ? `已静音 (${sfxVolume}%)` : `${sfxVolume}%`}</output></span>
          <input type="range" min="0" max="100" value={sfxVolume} aria-label="音效音量" onChange={e => onSfxVolume(Number(e.target.value))}/>
        </label>
      </section>

      <section className="settings-section settings-home-bgm">
        <div className="settings-bgm-head-row">
          <h3>花房背景音乐</h3>
          <span className="settings-bgm-meta">
            已解锁 {unlockedCount} / {BGM_TRACKS.length} 首 · {inHome ? '切换后在花房立即生效' : '仅在花房生效'}
          </span>
        </div>
        <button
          type="button"
          className={`settings-bgm-option settings-bgm-auto${activeChoice === 'auto' ? ' is-selected' : ''}`}
          aria-pressed={activeChoice === 'auto'}
          onClick={() => onHomeBgm('auto')}
        >
          <span className="settings-bgm-title-row">
            <b>自动匹配花房阶段（默认）</b>
            <em>{activeChoice === 'auto' ? '使用中' : '可选'}</em>
          </span>
          <small>一至二阶播放《寂静爪印》，三至四阶播放《木板日光》</small>
        </button>
        <div className="settings-bgm-grid">
          {BGM_TRACKS.map(track => {
            const unlocked = isHomeBgmUnlocked(track.id, state);
            const selected = activeChoice === track.id;
            return (
              <button
                key={track.id}
                type="button"
                className={`settings-bgm-option${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`}
                aria-pressed={selected}
                disabled={!unlocked}
                onClick={() => onHomeBgm(track.id)}
              >
                <span className="settings-bgm-title-row">
                  <b>{track.title}</b>
                  <em>{selected ? '使用中' : unlocked ? '已解锁' : '未解锁'}</em>
                </span>
                <small>{unlocked ? track.sceneLabel : track.unlockHint}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <h3>小猫账号</h3>
        <p>游客旅程按浏览器分别保存。注册可绑定当前进度，在其他设备登录同一账号即可接着玩。</p>
        <div className="settings-actions">
          <button disabled={disabled} onClick={onLogin}>登录账号</button>
          <button className="secondary" disabled={disabled} onClick={onRegister}>注册并保存旅程</button>
        </div>
      </section>

      <section className="settings-section settings-reset">
        <h3>本机数据</h3>
        {confirmReset ? (
          <div className="settings-reset-confirm" role="group" aria-label="确认清空本机旅程">
            <p>将移除本机保存的旅程凭证并从头开始。未注册的游客旅程将无法通过本机找回；已绑定账号的云端进度仍可登录取回。</p>
            <div className="settings-actions">
              <button className="settings-danger" disabled={disabled} onClick={onReset}>确认清空并重新开始</button>
              <button className="secondary" onClick={() => setConfirmReset(false)}>保留当前旅程</button>
            </div>
          </div>
        ) : (
          <>
            <p>退出当前本机旅程，从新的游客存档开始。</p>
            <button className="settings-clear" disabled={disabled} onClick={() => setConfirmReset(true)}>清空本机旅程</button>
          </>
        )}
      </section>
    </div>
  </Modal>;
}
