export default function XsollaMark({ compact=false }) {
  return <div className={`xsolla-mark ${compact?'compact':''}`} aria-label="Xsolla">
    <svg className="xsolla-symbol" viewBox="0 0 100 100" role="img" aria-label="Xsolla 标志">
      <g fill="currentColor">
        <circle cx="50" cy="50" r="30"/><circle cx="50" cy="25" r="22"/><circle cx="50" cy="75" r="22"/><circle cx="25" cy="50" r="22"/><circle cx="75" cy="50" r="22"/>
      </g>
      <circle cx="34" cy="49" r="14" fill="white"/><circle cx="66" cy="49" r="14" fill="white"/>
      <rect x="31" y="43" width="8" height="13" fill="currentColor"/><rect x="61" y="43" width="8" height="13" fill="currentColor"/>
    </svg>
    <b>XSOLLA</b>
  </div>
}
