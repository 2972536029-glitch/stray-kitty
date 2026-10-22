// 移植自轩扬 MR !2，2.0.0@a553076；纯展示，不读写进度。
const stars = [
  [90,88],[184,132],[305,75],[438,116],[570,70],[714,140],[852,82],[980,122],[1124,65],[1260,138],[1395,89],[1512,152],
]

const windows = Array.from({ length: 42 }, (_, i) => ({
  x: 30 + (i * 71) % 1510,
  y: 405 + ((i * 37) % 98),
  lit: i % 5 === 0 || i % 11 === 0,
}))

export default function StartMenuBackdrop() {
  return <svg className="start-menu-backdrop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="dusk-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#354960"/><stop offset=".46" stopColor="#627187"/><stop offset=".72" stopColor="#a47d70"/><stop offset="1" stopColor="#c69773"/>
      </linearGradient>
      <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#92735e"/><stop offset="1" stopColor="#493e3a"/></linearGradient>
      <filter id="warm-glow"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    <rect width="1600" height="900" fill="url(#dusk-sky)"/>
    <rect y="280" width="1600" height="75" fill="#bd8a72" opacity=".26"/>
    {stars.map(([x,y],i)=><g key={i} className="pixel-star" fill="#e4d6ad" opacity={i%3===0?.9:.55} shapeRendering="crispEdges"><rect x={x} y={y} width="4" height="4"/><rect x={x+1} y={y-3} width="2" height="10"/><rect x={x-2} y={y+1} width="8" height="2"/></g>)}
    <g transform="translate(1295 92)" shapeRendering="crispEdges"><rect x="25" y="0" width="40" height="8" fill="#e1c987"/><rect x="8" y="8" width="74" height="50" fill="#e1c987"/><rect x="0" y="18" width="90" height="30" fill="#e1c987"/><rect x="25" y="58" width="40" height="7" fill="#e1c987"/><rect x="48" y="8" width="42" height="50" fill="#5b6579"/></g>
    <g fill="#7f8490" opacity=".65" shapeRendering="crispEdges"><rect x="104" y="235" width="160" height="22"/><rect x="129" y="213" width="106" height="22"/><rect x="880" y="195" width="150" height="20"/><rect x="905" y="175" width="98" height="20"/></g>
    <path d="M0 475h58v-54h40v22h55v-78h50v38h43v-61h70v95h47v-83h58v47h65v-92h78v127h58v-68h54v40h70v-78h62v48h67v-103h74v139h61v-84h66v51h76v-112h82v151h64v-72h55v42h85v-83h79v144h64v-65h66v99H0z" fill="#384552" shapeRendering="crispEdges"/>
    {windows.map((w,i)=><rect key={i} x={w.x} y={w.y} width="8" height="12" fill={w.lit?'#d9b36b':'#66717b'} opacity={w.lit?.85:.35} shapeRendering="crispEdges"/>)}
    <path d="M0 540L0 435l85-36 68 29 68-52 75 64 72-47 91 48 69-61 97 68 83-56 90 61 88-78 98 78 69-51 104 73 90-60 93 62 81-43 109 60 61-34 110 67v129H0z" fill="#253c38" shapeRendering="crispEdges"/>
    <path d="M0 602L0 515l108-49 80 38 112-62 95 68 100-45 104 65 115-76 99 75 104-56 100 50 118-71 112 73 102-53 111 63 110-48 50 35v130z" fill="#315044" shapeRendering="crispEdges"/>
    <g transform="translate(1190 420)" shapeRendering="crispEdges">
      <rect x="-18" y="35" width="250" height="138" fill="#2c4238" stroke="#1f2927" strokeWidth="6"/><path d="M0 35L53 0h112l48 35z" fill="#684c3e" stroke="#1f2927" strokeWidth="6"/>
      <rect x="22" y="69" width="60" height="59" fill="#c59b5e" opacity=".2"/><rect x="142" y="68" width="54" height="58" fill="#c59b5e" opacity=".2"/>
      <rect x="31" y="78" width="42" height="40" fill="#d6b76d"/><rect x="151" y="77" width="36" height="41" fill="#d6b76d"/><rect x="98" y="96" width="43" height="77" fill="#59483e"/>
      <rect x="31" y="97" width="42" height="4" fill="#57463d"/><rect x="50" y="78" width="4" height="40" fill="#57463d"/><rect x="151" y="96" width="36" height="4" fill="#57463d"/><rect x="168" y="77" width="4" height="41" fill="#57463d"/>
      <rect x="10" y="168" width="214" height="12" fill="#668460"/>
    </g>
    <ellipse cx="1310" cy="526" rx="160" ry="100" fill="#d6ac62" opacity=".14" filter="url(#warm-glow)"/>
    <path d="M0 585h160l93-30 108 34 125-46 112 49 123-39 112 49 117-36 126 45 117-34 132 35 108-24 167 43v269H0z" fill="#263e34"/>
    <path d="M0 670h210l109-48 125 58 110-44 127 54 122-39 112 46 139-52 122 51 111-36 112 44 101-31 100 35v192H0z" fill="#35533e"/>
    <path d="M650 900L720 690l73-63 66 60 96 213z" fill="url(#road)" stroke="#2a3030" strokeWidth="7"/>
    <path d="M733 900l40-213 20-21 20 20 54 214z" fill="#b38b69" opacity=".35"/>
    <path d="M0 760h225v-25h86v19h116v-31h92v29h102v-20h85v35H0zM1005 760h105v-22h99v18h117v-31h87v28h187v147h-595z" fill="#476a48" shapeRendering="crispEdges"/>
    <rect y="832" width="1600" height="68" fill="#26392f"/>
    <g transform="translate(256 650)" shapeRendering="crispEdges"><rect x="17" y="0" width="10" height="145" fill="#2a302e"/><rect x="0" y="-8" width="44" height="15" fill="#343b37"/><rect x="7" y="6" width="30" height="35" fill="#d5ad63"/><rect x="11" y="10" width="22" height="27" fill="#ead08c"/><rect x="4" y="140" width="36" height="9" fill="#222b29"/></g>
    <ellipse cx="278" cy="680" rx="82" ry="90" fill="#d9ae5e" opacity=".1" filter="url(#warm-glow)"/>
    <rect width="1600" height="900" fill="#192622" opacity=".08"/>
  </svg>
}
