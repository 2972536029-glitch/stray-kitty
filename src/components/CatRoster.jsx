import PixelCat, { breeds } from './PixelCat'

export default function CatRoster({ active='miaomiao' }) {
  return <aside className="cat-roster">
    <small>伙伴图鉴</small>
    {Object.entries(breeds).map(([key,cat], index)=><div key={key} className={`roster-cat ${key===active?'active':''} ${index>1?'locked':''}`}>
      <PixelCat breed={key} size={54}/><span>{cat.name.split(' · ')[1]}<i>{index>1?'未相遇':index===1?'新伙伴':'领队'}</i></span>
    </div>)}
  </aside>
}
