import type {GameState} from '../contracts';

const resources = [
  {id:'material',name:'修缮材料',icon:'◆',description:'用于修补花房、加固天窗与地板。'},
  {id:'clue',name:'旅途线索',icon:'⌕',description:'探索中找到的消息，用于推进救援与章节。'},
  {id:'food',name:'猫粮',icon:'◒',description:'旅途中收集的食物。'},
];

export default function SupplyInventory({state}:{state:GameState}) {
  return <section className="supply-inventory" aria-label="随身物资">
    <div className="supply-section-heading"><h3>随身物资</h3></div>
    <div className="supply-resource-grid">{resources.filter(item=>item.id!=='food'||(state.inventory.food??0)>0).map(item=><article key={item.id} className="supply-resource">
      <span className="supply-resource-icon" aria-hidden="true">{item.icon}</span>
      <div><h4>{item.name}</h4><p>{item.description}</p></div>
      <strong data-testid={`supply-${item.id}`}>{state.inventory[item.id]??0}</strong>
    </article>)}</div>
  </section>;
}
