// AI-owned projection of public battle definitions. No map, wave or enemy data.
// Run: node --import tsx scripts/advisor-battle-reference.ts [--check]
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as l00 from '../web/src/modules/battle/l00/config';
import * as chapter from '../web/src/modules/battle/chapter/config';
import * as market from '../web/src/modules/battle/market/config';
import * as greenhouse from '../web/src/modules/battle/greenhouse/config';
import * as tunnel from '../web/src/modules/battle/tunnel/config';
import * as finale from '../web/src/modules/battle/finale/config';

type Definition = Record<string, unknown>;
const skillKeys = ['name', 'description', 'targeting', 'cost', 'damage', 'shield', 'duration', 'heal', 'attackMultiplier', 'slowMultiplier', 'slowDuration', 'nightVision', 'clearHazards'] as const;
const catKeys = ['name', 'role', 'maxHp', 'damage', 'block', 'range'] as const;
const root = new URL('../', import.meta.url);
const stages = JSON.parse(fs.readFileSync(new URL('web/content/battles/stages.json', root), 'utf8')) as {id: string; name: string}[];
const target = new URL('server/internal/service/advisor_battle_reference.json', root);
const staticBoundary = '这是本关公开的静态定义，不是实时战况；maxHp是体力上限，damage是未加成定义伤害，不代表当前体力或实际伤害。技能效果和数值只适用于这一关，不能跨章套用。暂停停止战斗计时与蓄能；蓄满后仍由玩家手动施放。';

function pick(input: object, keys: readonly string[]): Definition {
  const source = input as Definition;
  return Object.fromEntries(keys.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
}
function skill(input: object): Definition {
  // New configuration fields require deliberate review instead of silently
  // widening this AI projection (offsets describe targeting, not needed here).
  for (const key of Object.keys(input)) {
    if (key !== 'offsets' && !skillKeys.includes(key as typeof skillKeys[number])) throw Error(`Review new public skill field: ${key}`);
  }
  return pick(input, skillKeys);
}
function stage(stageId: string, config: {CAT_DEFINITIONS: object; SKILLS: object; RULES: {energyPerSecond: number; maxEnergy: number; maxLeaks: number; maxCats: number}}) {
  const definitions = config.CAT_DEFINITIONS as Record<string, Definition>;
  const skills = config.SKILLS as Record<string, Definition>;
  return {
    stageId, name: stages.find(value => value.id === stageId)?.name ?? stageId,
    referenceOnly: true, ruleSummary: staticBoundary,
    publicRules: pick(config.RULES, ['energyPerSecond', 'maxEnergy', 'maxLeaks', 'maxCats']),
    cats: Object.entries(definitions).map(([id, cat]) => ({id, ...pick(cat, catKeys), attackInterval: cat.interval, skill: skill(skills[id])})),
  };
}
const tutorial = {
  stageId: 'l00_tutorial', name: stages.find(value => value.id === 'l00_tutorial')!.name,
  referenceOnly: true,
  ruleSummary: `${staticBoundary}序章蓄能和施法还须按教学步骤解锁，不能把正式守线规则套到尚未完成的教学阶段。喵喵是保护目标，不攻击、不阻挡、不施放战斗技能。`,
  publicRules: {energyPerSecond: l00.CONFIG.ENERGY_PER_SECOND, maxEnergy: l00.CONFIG.MAX_ENERGY, maxLeaks: l00.CONFIG.MAX_LEAKS, maxCats: l00.CONFIG.MAX_DEPLOYED_CATS},
  cats: Object.entries(l00.CAT_TYPES).filter(([, cat]) => cat.combatant).map(([id, cat]) => ({id, ...pick(cat, catKeys), attackInterval: cat.interval, skill: skill(l00.SKILLS[id as keyof typeof l00.SKILLS])})),
};
const references = [tutorial, stage('alley_boss', chapter), stage('market_boss', market), stage('greenhouse_boss', greenhouse), stage('tunnel_boss', tunnel), stage('finale_boss', finale)];
const generated = JSON.stringify(references, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== generated) throw Error('AI public battle reference is stale; run node --import tsx scripts/advisor-battle-reference.ts');
  console.log(`AI public battle references match ${references.length} live configurations.`);
} else {
  fs.writeFileSync(target, generated);
  console.log(`Generated ${references.length} AI public battle references: ${fileURLToPath(target)}`);
}
