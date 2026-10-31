import type {CSSProperties} from 'react';

export type CapsulePhase='idle'|'turning'|'dropping'|'opening'|'result';
const balls=[[93,111,-22],[137,94,16],[184,108,-10],[222,126,24],[77,150,20],[124,144,-16],[173,151,30],[212,169,-8],[98,183,18],[146,185,-28],[181,198,16],[125,215,5]];
export default function CapsuleMachine({premium,phase,disabled,onTurn}:{premium:boolean;phase:CapsulePhase;disabled:boolean;onTurn:()=>void}){
  const active=['turning','dropping','opening'].includes(phase),colors=premium?['#8d9eb7','#d5bf86','#a7a0bd','#6e8b9c']:['#8caa78','#d4b67f','#a6b99e','#bc9774'];
  return <div className={`gacha-machine ${active?'running':''}`} data-phase={phase}>
    <svg viewBox="0 0 320 370" role="img" aria-label={premium?'月海观星主题扭蛋机':'苔叶来信主题扭蛋机'}>
      <defs>
        <linearGradient id={`glass-${premium}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={premium?'#d4e7ec':'#f0efcf'}/><stop offset=".45" stopColor={premium?'#a2bcc7':'#aebf9b'} stopOpacity=".85"/><stop offset="1" stopColor="#e5d4a1" stopOpacity=".65"/></linearGradient>
        <linearGradient id={`case-${premium}`} x1="0" x2="1"><stop stopColor={premium?'#40556b':'#536347'}/><stop offset=".25" stopColor={premium?'#69849a':'#91a178'}/><stop offset=".7" stopColor={premium?'#536d82':'#70845b'}/><stop offset="1" stopColor={premium?'#354b5e':'#405239'}/></linearGradient>
        <linearGradient id="capsule-brass" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f3dca8"/><stop offset=".35" stopColor="#b99759"/><stop offset=".65" stopColor="#d6b675"/><stop offset="1" stopColor="#8f6d3e"/></linearGradient>
        <pattern id="capsule-wood" width="17" height="45" patternUnits="userSpaceOnUse"><path d="M2 0V24M4 29V45M13 0V12M11 17V45" stroke="#f6e3b6" strokeWidth="1" opacity=".13"/><path d="M8 2V36M16 32V45" stroke="#392e1e" opacity=".18"/></pattern>
        <clipPath id="capsule-glass-clip"><path d="M82 82V65H97V50H116V42H204V50H223V65H238V82L252 200V229H68V200Z"/></clipPath>
      </defs>
      <ellipse cx="160" cy="351" rx="107" ry="10" fill="#493c3626"/>
      <path d="M72 244H248L262 339H58Z" fill={`url(#case-${premium})`} stroke="#514638" strokeWidth="4"/>
      <path d="M72 244H248L262 339H58Z" fill="url(#capsule-wood)"/>
      <path d="M80 254L69 326H252L240 254" fill="none" stroke="#bdab75" strokeWidth="2"/>
      <path d="M76 254L67 326M245 254L254 326" fill="none" stroke="#394a38" strokeWidth="3"/>
      <path d="M80 342H97V354H76V348ZM223 342H240L244 348V354H223Z" fill="#765c3b" stroke="#493b2a" strokeWidth="3"/>
      <path d="M61 325H259V342H61Z" fill="#9c784e" stroke="#514638" strokeWidth="4"/>
      <path d="M68 243H252V258H68Z" fill="#d5b47d" stroke="#514638" strokeWidth="4"/>
      <path d="M82 82V65H97V50H116V42H204V50H223V65H238V82L252 200V229H68V200Z" fill={`url(#glass-${premium})`} stroke="#655b47" strokeWidth="7"/>
      <path d="M82 82V65H97V50H116V42H204V50H223V65H238V82L252 200V229H68V200Z" fill="none" stroke="#d3bd88" strokeWidth="2"/>
      <path d="M86 91V77H100V63H120V56H143" fill="none" stroke="#fff9df" strokeWidth="7" opacity=".7"/>
      <path d="M231 105L238 191" stroke="#fff9df" strokeWidth="4" opacity=".45"/>
      <g className="gacha-ball-chamber" clipPath="url(#capsule-glass-clip)">{balls.map(([x,y,angle],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}><g className="gacha-ball" style={{'--ball':i} as CSSProperties}><circle cx="1" cy="3" r="23" fill="#493f2c22"/><circle r="22" fill="#efe1ba" stroke="#706247" strokeWidth="2"/><path d="M-22 0A22 22 0 0 1 22 0Z" fill={colors[i%4]} stroke="#706247" strokeWidth="2"/><path d="M-13-9Q-8-16-2-15" stroke="#fff9e4" strokeWidth="3" opacity=".8" fill="none"/><path d="M-18 4Q0 13 18 4" stroke="#c4b795" strokeWidth="2" fill="none"/><circle cx="1" cy="-8" r="3" fill="#e5d9b4" opacity=".75"/></g></g>)}</g>
      <path d="M96 82L115 65L109 195L93 204Z" fill="#fff9dc" opacity=".18"/>
      <path d="M229 101L237 192L230 203L221 113Z" fill="#fff9dc" opacity=".15"/>
      <path d="M64 221H256V245H64Z" fill="url(#capsule-brass)" stroke="#514638" strokeWidth="4"/>
      <path d="M87 232H233" stroke="#f5dfae" strokeWidth="3"/>
      <path d="M111 29H96L89 21L97 13L109 17M209 29H224L231 21L223 13L211 17" fill={premium?'#b3bbc9':'#8d9c6b'} stroke="#6e6749" strokeWidth="2"/>
      <path d="M113 10H207V43H113Z" fill="url(#capsule-brass)" stroke="#514638" strokeWidth="3"/>
      <rect x="119" y="15" width="82" height="26" rx="2" fill={premium?'#586b83':'#6e855e'} stroke="#514638" strokeWidth="2"/>
      <text x="160" y="38" textAnchor="middle" fill="#fff0c7" fontSize="23">{premium?'☾':'❧'}</text>
      <rect x="83" y="263" width="42" height="24" rx="3" fill="url(#capsule-brass)" stroke="#514638" strokeWidth="2"/>
      <rect x="88" y="271" width="32" height="6" rx="2" fill="#3f423b" stroke="#ede0b4"/>
      <circle cx="161" cy="278" r="29" fill="url(#capsule-brass)" stroke="#483e32" strokeWidth="3"/>
      <circle cx="161" cy="278" r="19" fill={premium?'#647d92':'#7b8f6c'} stroke="#493f33" strokeWidth="2"/>
      <g className="gacha-handle"><rect x="138" y="273" width="46" height="10" rx="4" fill="#f7e4b4" stroke="#514638" strokeWidth="2"/><circle cx="161" cy="278" r="5" fill="#c49c65"/></g>
      <path d="M208 265H237V304H202V276Z" fill="#35443d" stroke="#cfad78" strokeWidth="3"/>
      <path d="M205 303H241" stroke="#edd2a0" strokeWidth="4"/>
      <path d="M96 306L104 296L112 306L104 316Z" fill="none" stroke="#b9ba8b" strokeWidth="2"/>
      <path d="M148 315H174M153 319H169" stroke="#e1c489" strokeWidth="2"/>
      <path d="M93 311H184" stroke="#b2b69a" strokeWidth="2" opacity=".5"/>
      <circle cx="76" cy="331" r="3" fill="#f0d39d"/><circle cx="244" cy="331" r="3" fill="#f0d39d"/>
    </svg>
    <button className="gacha-crank" aria-label="转动扭蛋机把手" disabled={disabled} onClick={onTurn} title="转动一次"/>
    <div className="gacha-prize-ball" aria-hidden="true"><i className="capsule-top"/><i className="capsule-bottom"/><span>✦</span></div>
  </div>;
}
