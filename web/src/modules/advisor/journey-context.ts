import type {Catalog, GameState} from '../../contracts';

export interface JourneySceneObservation {
  nearby?: {id: string; label: string};
  position?: {x: number; y: number};
  floor?: string;
}
const clip = (s: string, limit = 180) => Array.from(s).slice(0, limit).join('');
const count = (n: number | undefined) => Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0;
const phases: Record<GameState['phase'], string> = {dialogue: '剧情对话', explore: '地图探索', event: '随机事件', preparation: '战前准备', battle: '战斗', settlement: '战后结算', home: '家园'};
const resourceNames: Record<string, string> = {food: '鱼干', fish: '鱼干', material: '修缮材料', clue: '线索', stamp: '猫爪邮票', stamps: '猫爪邮票', tuna: '金枪鱼罐头'};
const carryNames: Record<string, string> = {lantern: '小灯', mirror: '镜片', bell: '铃铛', box: '纸箱', dog: '老黄', dove: '鸽子', rats: '鼠群轮巡', kitten: '获救小猫'};
export const journeySceneKey = (state: GameState) => JSON.stringify([state.phase, state.chapterId, state.mapId, state.storyNodeId, state.pendingEventId, state.activeBattle?.id ?? '']);
export function journeySceneLabel(state: GameState, catalog: Catalog): string {
  const place = state.phase === 'home' ? '花房' : catalog.maps.find(m => m.id === state.mapId)?.name ?? state.mapId;
  return `${clip(place, 50)} · ${phases[state.phase]}`;
}

function nextStep(s: GameState): string {
  const has = (flag: string) => s.flags.includes(flag), stage = s.activeBattle?.stageId;
  if (s.phase === 'dialogue') return '阅读当前对话，使用继续按钮推进；剧情提到的人物和事件以当前已展示内容为准。';
  if (s.phase === 'event') return '先阅读眼前事件和可见选项，再选择行动掷骰；结果由服务端结算，阿策不能保证骰点或替你选择。';
  if (s.phase === 'settlement') {
    if (s.lastResult.outcome === 'lost') return stage === 'l00_tutorial' ? '本次教学未守住，点击重新开始教学再试一次。' : '本次防线未守住，点击调整防线，再试一次，回到准备阶段。';
    if (stage === 'l00_tutorial') return '教学已完成，继续进入第一章雨夜小巷。';
    if (s.activeBattle?.mainline && stage === 'market_boss') return '继续返回集市探索，再从北侧出口离开；主线不会在结算后直接回家。';
    if (s.activeBattle?.mainline && stage === 'tunnel_boss' && s.mapId === 'tunnel') return '继续救援故事，安顿这次救出的伙伴。';
    if (s.activeBattle?.mainline && stage === 'finale_boss' && s.mapId === 'warehouse') return '继续仓库战后的故事，完成撤离流程；请以接下来的可见指引为准。';
    if (stage === 'alley_rescue' && !has('rescue_story_done')) return '继续救援故事，然后寻找巷尾的寻猫启事，再带伙伴回家。';
    return '本场已结束，使用结算页的继续按钮返回家园。';
  }
  if (s.phase === 'battle') return '参考眼前血量、能量和预警调整站位；实时战斗问题以本场棋盘快照为准，阿策只提供建议。';
  if (s.phase === 'preparation') {
    if (stage) return '在当前关卡的准备面板确认伙伴与布阵，再开始本场守护。';
    if (s.mapId === 'market') return '查看刚获得的情报与物资，再继续探索集市；完成集市防卫后从北侧出口离开。';
    if (s.mapId === 'warehouse') return '伙伴已集结，确认准备后开始仓库防线战斗。';
    return '查看本次事件收获与战斗支援，确认伙伴后开始守护。';
  }
  if (s.phase === 'home') {
    if (has('finale_completed') || has('kingdom_founded')) return '家园已经落成，可以整理家具、和伙伴相处，或重访已解锁的地图。';
    if (has('tunnel_explored') && has('cats_rescued_batch1')) {
      if (has('finale_started')) return '在家园旅程入口继续探索仓库。';
      return count(s.inventory.clue) < 3 ? `仓库启程还需至少3条线索，当前${count(s.inventory.clue)}条；回集市继续打听情报。` : '救援与线索条件已满足，可以从家园的第五章入口开始仓库旅程。';
    }
    if (has('chapter_3_started') && has('momo_joined') && !has('greenhouse_fortified')) return '墨墨已经加入，下一步先完成花房保卫战，守住花房防线后才能进入地下通道。';
    if (has('greenhouse_fortified')) return has('chapter_4_started') ? '通过家园旅程入口继续地下通道探索。' : '花房防线已守住，通过家园旅程入口开启第四章。';
    if (has('market_cleared') && has('market_exit_crossed')) return '继续第三章花房故事，和伙伴一起准备守护家园。';
    return has('rescue_story_done') ? '通过家园旅程入口前往午夜集市，寻找伙伴与线索。' : '整理家园，并按当前旅程入口继续已解锁的故事。';
  }
  // Current map wins over permanent chapter flags when revisiting earlier maps.
  if (s.mapId === 'alley') return !has('alley_rescued') ? '探索眼前小巷，寻找纸箱里的叫声，完成事件后准备救援。' : !has('lost_poster_found') ? '点点已获救，先查看巷尾墙上的寻猫启事，再回花房。' : '可以继续探索小巷，或回到花房查看下一步旅程。';
  if (s.mapId === 'market') return has('market_cleared') ? '可以继续打听情报和收集线索；离开集市时从北侧木箱翻越至出口。' : '向集市中可交互的伙伴打听情报，完成集市防卫后才能从北侧出口离开。';
  if (s.mapId === 'tunnel') return !has('tunnel_false_kitten_trap_found') ? '沿地下通道探索，留意可交互的声音与陷阱提示。' : !has('valve_three_investigated') ? '陷阱已经识破，继续调查3号泄洪阀门；具体路线以眼前交互提示为准。' : '阀门调查已完成，继续沿通道前往战斗区域，守住救援防线。';
  if (s.mapId === 'warehouse') return has('finale_boss_victory') ? '仓库防线已守住，沿已打开的北侧闸门前往隔间出口，继续护送伙伴。' : '探索仓库，点亮灯光和捷径，抵达北侧首领区域；货架上的两处调查是可选内容。';
  return '按当前页面已展示的目标与交互提示继续旅程。';
}

function observations(scene?: JourneySceneObservation): JourneySceneObservation {
  return {
    ...(scene?.nearby ? {nearby: {id: clip(scene.nearby.id, 80), label: clip(scene.nearby.label, 120)}} : {}),
    ...(scene?.floor ? {floor: clip(scene.floor, 24)} : {}),
    ...(scene?.position && Number.isFinite(scene.position.x) && Number.isFinite(scene.position.y) ? {position: {x: Math.round(scene.position.x), y: Math.round(scene.position.y)}} : {}),
  };
}
function resourceList(values: Record<string, number | undefined>, catalog: Catalog) {
  return Object.entries(values).filter(([, n]) => count(n) > 0).slice(0, 24).map(([id, n]) => ({名称: clip(resourceNames[id] ?? catalog.items.find(i => i.id === id)?.name ?? id, 50), 数量: count(n)}));
}
function homeProject(state: GameState, catalog: Catalog) {
  if (state.phase !== 'home' || state.flags.includes('finale_completed') || state.flags.includes('kingdom_founded')) return null;
  const project = [...catalog.renovations ?? []].sort((a, b) => a.stage - b.stage).find(r => !state.flags.includes(r.grantsFlag));
  if (!project || project.requiredFlag && !state.flags.includes(project.requiredFlag)) return null;
  const costs = (value: Record<string, number | undefined>) => Object.entries(value).filter(([, n]) => count(n) > 0).slice(0, 5).map(([key, n]) => ({名称: resourceNames[key] ?? clip(key, 30), 需要: count(n), 现有: count((key === 'stamp' || key === 'tuna' ? state.currencies : state.inventory)[key])}));
  return {名称: clip(project.name), 部件: (project.parts ?? []).slice(0, 24).map(part => ({
    名称: clip(part.name, 80), 已完成: !!state.homeRepairs?.includes(part.id), 成本: costs(part.cost),
    尚缺前置: (part.requires ?? []).filter(id => !state.homeRepairs?.includes(id)).map(id => clip(project.parts?.find(p => p.id === id)?.name ?? '前置修缮', 80)),
  })), ...(!project.parts?.length ? {成本: costs(project.cost ?? {})} : {})};
}
function visibleContext(state: GameState, catalog: Catalog, scene?: JourneySceneObservation) {
  const node = state.phase === 'dialogue' ? catalog.story.find(n => n.id === state.storyNodeId) : undefined;
  const event = state.phase === 'event' ? catalog.events.find(e => e.id === state.pendingEventId) : undefined;
  const revealFates = !!event?.tags.includes('trap') && state.cats.includes('diandian');
  const recent = state.eventState?.lastResolution;
  const previousEvent = recent ? catalog.events.find(e => e.id === recent.eventId) : undefined;
  const support = state.activeBattle?.modifiers?.carry ?? state.eventState?.pendingModifiers.carry;
  return {
    当前: {阶段: phases[state.phase], 章节: clip(catalog.chapters.find(c => c.id === state.chapterId)?.title ?? state.chapterId, 80), 地点: journeySceneLabel(state, catalog)},
    当前目标: nextStep(state), scene: observations(scene),
    已结识伙伴: state.cats.slice(0, 16).map(id => clip(catalog.cats.find(c => c.id === id)?.name ?? id, 40)),
    已有物品: resourceList(state.inventory, catalog), 资源: resourceList({stamp: state.currencies.stamp, tuna: state.currencies.tuna}, catalog),
    ...(node ? {当前台词: {说话者: clip(node.speaker, 40), 内容: clip(node.text, 800)}} : {}),
    ...(event ? {当前事件: {标题: clip(event.title), 内容: clip(event.text, 800),
      可见选项: event.options.filter(o => !o.requireCat || state.cats.includes(o.requireCat)).slice(0, 8).map(o => ({名称: clip(o.label, 160),
        ...(revealFates ? {点点已揭示的资源后果: (['crit', 'success', 'partial', 'fail'] as const).map(tier => ({档位: tier,
          资源: resourceList({...o.outcomes[tier].reward}, catalog), 黑影压力: tier === 'success' ? 0 : o.outcomes[tier].tdMod?.shadowPressure ?? 0}))} : {}),
      })), 鼓励剩余次数: count(state.pushTokens), 规则: '两颗六面骰点数相加决定结果；伙伴鼓励消耗一次，掷两组取总和较高的一组。',
      ...(state.cats.includes('tuanzi') && event.tags.includes('foraging') ? {伙伴提示: '团子同行时，觅食失败仍有资源保底，具体获得以结算为准。'} : {}),
    }} : {}),
    ...(recent ? {最近已结算事件: {名称: clip(previousEvent?.title ?? '此前相遇'), 已选行动: clip(previousEvent?.options.find(o => o.id === recent.optionId)?.label ?? '已选择的行动'),
      实际结果: clip(recent.outcome.text, 600), 获得: resourceList({...recent.outcome.reward}, catalog)}} : {}),
    ...(support ? {当前事件支援: carryNames[support] ?? '已获得的战斗支援'} : {}),
    ...(state.phase === 'settlement' ? {本场结算: {结果: state.lastResult.outcome === 'won' ? '胜利' : state.lastResult.outcome === 'lost' ? '失败' : '已结算', 说明: clip(state.lastResult.message, 500)}} : {}),
    家园修缮: homeProject(state, catalog),
    信息边界: '只知道此刻已展示的信息和最近一次事件，不代表完整历史；坐标不是可达路线。阿策只解释，不移动角色、不推进剧情、不消耗物品、不替玩家付款。',
  };
}
export function buildJourneyAdvisorContext(state: GameState, catalog: Catalog, scene?: JourneySceneObservation): string {
  return JSON.stringify(visibleContext(state, catalog, scene));
}
function localAnswer(state: GameState, catalog: Catalog, question: string, scene?: JourneySceneObservation): {title: string; text: string} {
  const ctx = visibleContext(state, catalog, scene), q = question.trim();
  if (/线索/.test(q) && !state.flags.includes('tunnel_explored') && !state.flags.includes('finale_started')) return {title: '当前线索', text: `当前有${count(state.inventory.clue)}条线索。${ctx.当前目标}`};
  if (/线索|第五章|终章|仓库/.test(q) && (state.flags.includes('tunnel_explored') || state.flags.includes('finale_started'))) {
    const clues = count(state.inventory.clue), rescued = state.flags.includes('tunnel_explored') && state.flags.includes('cats_rescued_batch1');
    return {title: '仓库启程条件', text: `当前有${clues}条线索。首次进入仓库需要完成地下通道救援，并收集至少3条线索。${!rescued ? '地下通道救援尚未全部完成，先按当前目标继续救援。' : clues < 3 ? '线索还不够，回集市继续打听情报。' : '前置条件已满足，可从家园的第五章入口继续。'}`};
  }
  if (/修|材料|屋顶|窗|地板/.test(q) && state.phase === 'home') {
    const completed = catalog.renovations?.flatMap(r => (r.parts ?? []).filter(part => state.flags.includes(r.grantsFlag) || state.homeRepairs?.includes(part.id))).find(part => q.includes(part.name));
    if (completed) return {title: '家园修缮', text: `「${clip(completed.name, 80)}」已经修好，不需要再次花费资源。可以在花房查看尚未完成的修缮。`};
    const p = ctx.家园修缮;
    if (!p) return {title: '家园修缮', text: `当前没有可开始的新修缮工程。${ctx.当前目标}`};
    const available = p.部件.filter(part => !part.已完成), selected = available.find(part => q.includes(part.名称)) ?? available.find(part => !part.尚缺前置.length) ?? available[0];
    const costText = (cost: {名称: string; 需要: number; 现有: number}[]) => cost.map(c => `${c.名称}需要${c.需要}，现有${c.现有}`).join('；');
    return {title: '家园修缮', text: selected ? `当前工程是「${p.名称}」。${selected.名称}：${costText(selected.成本)}。${selected.尚缺前置.length ? `先完成${selected.尚缺前置.join('、')}。` : selected.成本.some(c => c.现有 < c.需要) ? '资源不足，先继续探索收集材料。' : '条件已满足，可在花房场景点选这处修补位置。'}` : `当前工程是「${p.名称}」，${costText(p.成本 ?? [])}。请在家园界面查看当前修缮入口。`};
  }
  if (/刚才|上次/.test(q) && ctx.最近已结算事件) return {title: '最近一次相遇', text: `在「${ctx.最近已结算事件.名称}」中，你选择了「${ctx.最近已结算事件.已选行动}」。${ctx.最近已结算事件.实际结果}`};
  if (/事件|选|骰|鼓励|发生|结果/.test(q) && ctx.当前事件) return {title: ctx.当前事件.标题, text: `${ctx.当前事件.内容} 可选行动：${ctx.当前事件.可见选项.map(o => o.名称).join('；')}。${/鼓励|骰/.test(q) ? `${ctx.当前事件.规则}当前鼓励${ctx.当前事件.鼓励剩余次数}次。` : '先按选项说明选择；没有已公开的结果时，我不会猜测隐藏奖励或保证成功。'}`};
  if (/刚才|上次|获得|选择.*后|结果/.test(q) && ctx.最近已结算事件) return {title: '最近一次相遇', text: `在「${ctx.最近已结算事件.名称}」中，你选择了「${ctx.最近已结算事件.已选行动}」。${ctx.最近已结算事件.实际结果}`};
  if (/鱼干|邮票|罐头|资源|物品|背包/.test(q)) return {title: '当前物资', text: `目前记录的物资：${[...ctx.已有物品, ...ctx.资源].map(r => `${r.名称}${r.数量}`).join('、') || '暂无'}。具体使用条件以当前页面的操作说明为准。`};
  if (/谁|伙伴|猫咪|几只猫/.test(q)) return {title: '旅途中的伙伴', text: `目前已结识的伙伴有：${ctx.已结识伙伴.join('、') || '暂无记录'}。这是旅程名单，实际战斗出场名单以当前战斗为准。`};
  if (/哪里|哪儿|怎么走|往哪|路线|方向/.test(q)) return {title: '眼前的路', text: `你现在在${ctx.当前.地点}。${ctx.scene.floor ? `所在楼层：${ctx.scene.floor}。` : ''}${ctx.scene.nearby ? `附近可交互的是「${ctx.scene.nearby.label}」。` : ''}${ctx.当前目标}我没有完整可通行路线，具体方向请以地图和交互提示为准。`};
  if (/剧情|对话|在说|什么意思/.test(q) && ctx.当前台词) return {title: '当前故事', text: `${ctx.当前台词.说话者}正在说：“${ctx.当前台词.内容}” 更细的解释暂时需要模型恢复；我不会提前透露后面的剧情。`};
  return {title: '当前旅程建议', text: `你现在在${ctx.当前.地点}。${ctx.当前目标}这次只能提供本地已知指引，暂时无法完整回答更具体的问题。`};
}
export function getJourneyLocalAnswer(state: GameState, catalog: Catalog, question: string, scene?: JourneySceneObservation): {title: string; text: string} {
  const answer = localAnswer(state, catalog, question, scene);
  return {title: clip(answer.title, 80), text: clip(answer.text, 1200)};
}
