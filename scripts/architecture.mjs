import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'docs/ARCHITECTURE.md');
// Map-specific source is maintained separately; inject into the generated architecture.
const explorationArchitecture = fs.readFileSync(path.join(root, 'docs/LEVEL-EXPLORATION-ARCHITECTURE.md'), 'utf8').trim();
if (!process.argv.includes('--check') && !fs.existsSync(target)) fs.writeFileSync(target, '');
// Only committed/staged source paths belong in the generated architecture tree.
// Filesystem scans alone include local .zip/.exe/.patch files ignored by Git.
const trackedFiles = new Set(execFileSync('git', ['ls-files', '--cached', '-z'], {cwd: root, encoding: 'utf8'})
  .split('\0').filter(Boolean).map(name => name.replaceAll('\\', '/')));
const trackedDirectories = new Set();
for (const file of trackedFiles) {
  const parts = file.split('/');
  for (let i = 1; i < parts.length; i++) trackedDirectories.add(parts.slice(0, i).join('/'));
}
const excluded = new Set(['node_modules', '.git', '.runtime', 'data', 'output', 'tmp', 'test-results', 'playwright-report', 'dist', 'artifacts', 'coverage', '.idea', '.vscode']);
const labels = {
  web: '浏览器前端', 'web/src': '运行代码', 'web/src/app': '启动、装配与 GameController',
  'web/src/contracts': '公共状态、命令与模块输入输出', 'web/src/core': '公共流程',
  'web/src/core/flow': '阶段与命令检查', 'web/src/core/story': '剧情与任务',
  'web/src/core/state': 'GameStore 状态快照', 'web/src/core/rules': '公共条件与资源判断',
  'web/src/core/ports': 'API 与会话存储接口', 'web/src/modules': '正式模块接入口',
  'web/src/modules/map': '地图 · Jenny', 'web/src/modules/events': '随机事件 · 余尧',
  'web/src/modules/nightMarket': 'Chapter 2 Night Market spatial map and progression',
  'web/src/modules/battle': '塔防 · 闫琦雯', 'web/src/modules/cats': '猫咪档案、救援与成长',
  'web/src/modules/home': '家园建设、摆放与互动', 'web/src/modules/inventory': '道具与家具持有',
  'web/src/modules/qa': '按游戏流程组织的验收操作与服务端能力检查',
  'web/src/modules/economy': '货币、扣费与奖励', 'web/src/modules/lottery': '通用邮寄手账、明信片涂画、家具包裹、图鉴与收据',
  'web/src/modules/shop': '商品与购买', 'web/src/ui': '界面与样式 · 轩扬',
  'web/src/adapters': '具体运行能力', 'web/src/adapters/canvas': '原生 Canvas 2D',
  'web/src/adapters/api': 'HTTP 请求', 'web/src/adapters/storage': '浏览器会话与待确认请求',
  'web/src/adapters/platform': '输入与设备能力', 'web/src/adapters/telemetry': '本地诊断',
  'web/src/adapters/payment': '支付动作 · 预留', 'web/src/examples': '参考实现',
  'web/src/examples/demo': '可替换的贯通 Demo', 'web/src/config': '运行配置',
  'web/src/shared': '通用工具 · 预留', 'web/content': '独立内容数据',
  'web/content/story': '章节与对话', 'web/content/maps': '地图与交互点',
  'web/content/events': '事件与选项', 'web/content/cats': '猫咪档案',
  'web/content/battles': '关卡与波次', 'web/content/home': '家具与摆放位置',
  'web/content/items': '道具', 'web/content/economy': '模拟充值商品',
  'web/content/lottery': '奖池', 'web/content/shop': '家具商品配置',
  'web/content/tutorials': '操作提示', 'web/content/assets': '素材索引',
  'web/public': '静态资源', 'web/public/assets': '图片、动画、声音与字体',
  'web/public/assets/home': '无猫建筑、四阶修缮与主题家具透明图集',
  'web/public/assets/home/stages': '四阶段四十八件正向透明家具组件',
  'web/public/assets/home/parcels': '两套主题的二十四件独立透明家具组件',
  'web/public/assets/lottery': '通用邮寄拼贴手账底图与透明包裹开合图集',
  server: 'Go 服务端', 'server/cmd': '服务入口', 'server/cmd/api': 'HTTP 启动',
  'server/internal': '服务实现', 'server/internal/transport': '请求、认证与参数检查',
  'server/internal/service': '长期规则、判定、奖励与结算', 'server/internal/domain': '状态、命令与错误',
  'server/internal/repository': '单进程 JSON 文件事务', 'server/internal/platform': '嵌入内容配置',
  'server/internal/integrations': '外部集成', 'server/internal/integrations/payment': '独立模拟支付与账本',
  'server/migrations': 'MySQL 结构 · 尚未接入', docs: '需求、架构、接口与集成记录',
  design: '模块设计', 'design/tower-defense': '塔防规则与关卡规格',
  'web/src/modules/battle/finale': '第五章74格仓库、九格终极首领、双精英与固定援军', 'design/tower-defense/levels/L05-final-warehouse': '第五章终极仓库设计', 'docs/L05-INTEGRATION.md': '第五章光路援军与独立试玩边界',
  'web/src/modules/battle/tunnel': '第四章37格不规则暗道、断灯脉冲与墨墨夜视', 'design/tower-defense/levels/L04-underground-tunnel': '第四章地下通道设计', 'docs/L04-INTEGRATION.md': '第四章夜视护盾与独立试玩边界',
  'web/src/modules/battle/greenhouse': '第三章34格不规则棋盘、墨墨与四格荆冠首领', 'design/tower-defense/levels/L03-abandoned-greenhouse': '第三章废弃花房设计', 'docs/L03-INTEGRATION.md': '第三章不规则棋盘与独立试玩边界',
  'web/src/modules/battle/market': '第二章六猫、七入口与单格横扫首领', 'design/tower-defense/levels/L02-midnight-market': '第二章午夜集市设计', 'docs/L02-INTEGRATION.md': '第二章独立试玩与参数边界',
  'web/src/modules/battle/chapter': '第一章紧凑棋盘、四猫与固定首领', 'web/src/modules/battle/l00': '固定 L00 局内实现', 'docs/L01-INTEGRATION.md': '第一章四猫与当前接入', 'docs/L00-INTEGRATION.md': 'L00 六波新手教学与接入',
  'web/src/modules/battle/shared': '第一至第五章共享的时钟、几何、路线、视口循环与接入校验',
  'web/src/modules/advisor': '阿策入口、公开规则说明与白名单请求准备',
  tests: '自动验证', 'tests/e2e': '浏览器流程', scripts: '启动、生成与检查', deploy: '部署模板',
  'server/internal/advisor': '阿策服务端模型客户端与限流',
  'docs/BATTLE-ADVISOR-MODEL.md': '阿策模型配置、可见战况与回退边界',
  '.dockerignore': '容器构建排除', '.env.example': '非秘密环境变量示例',
  '.gitattributes': '换行与二进制规则', '.gitignore': '本地生成文件排除',
  '.gitlab-ci.yml': '检查与构建流水线', 'package.json': '依赖与工程命令',
  'package-lock.json': '锁定依赖', 'playwright.config.ts': '浏览器测试配置',
  '启动开发.cmd': 'Windows 开发入口', 'docs/PRD.md': '需求与分工',
  'docs/ARCHITECTURE.md': '架构、目录与接入', 'docs/openapi.json': 'API 规范', 'docs/BATTLE-EVENT-CARRY.md': '事件携带物与协助者六枚举对接'
};
let directoryCount = 0;
function tree(relative = '', prefix = '') {
  const entries = fs.readdirSync(path.join(root, relative), {withFileTypes: true})
    .filter(entry => {
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return !excluded.has(entry.name) && trackedDirectories.has(relativePath);
      return entry.isFile() && (relative === '' || relative === 'docs') && trackedFiles.has(relativePath);
    })
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'en'));
  return entries.flatMap((entry, index) => {
    const last = index === entries.length - 1;
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
    const directory = entry.isDirectory();
    if (directory) directoryCount++;
    const line = `${prefix}${last ? '└─ ' : '├─ '}${entry.name}${directory ? '/' : ''}${labels[relativePath] ? '  ' + labels[relativePath] : ''}`;
    return [line, ...(directory ? tree(relativePath, prefix + (last ? '   ' : '│  ')) : [])];
  });
}
const directory = ['stray-kitty/', ...tree()].join('\n');
const document = `# 架构与文件目录

## 1. 技术与数据流

React + TypeScript + 原生 Canvas 2D；Go API；当前采用单进程 JSON 存档。不使用 Phaser。

\`\`\`mermaid
flowchart TD
  View["React UI / Canvas 场景"] --> Module["地图、事件、战斗等模块"]
  Module -->|移动与战斗局内模拟| View
  Module -->|长期操作意图| Controller["GameController：流程与命令"]
  Controller --> HTTP["GameApiPort → HttpGameApi"]
  HTTP --> Transport["Go transport：认证与校验"]
  Transport --> Service["Go service：判定、抽取与结算"]
  Service --> Repository["repository：状态与收据一起提交"]
  Repository --> Save[".runtime/game.json via dev launcher; data/game.json API fallback"]
  Service -->|返回 GameState| Store["GameStore：界面状态快照"]
  Store --> View
  Module -->|手动提问与可见战况| Advisor["POST /api/v1/advisor：只读场次校验"]
  Advisor --> Model["服务端模型客户端：限时、限流、密钥隔离"]
  Model -->|建议或本地回退| View
\`\`\`

移动、碰撞和逐帧战斗在前端运行；事件判定、抽奖、长期奖励、摆放和游戏内家具购买经过 Go。真实付费尚未实现。

## 2. 实际目录

以下从实际源码文件夹生成；node_modules、data、.runtime、output、tmp、构建和测试输出不入库，不列入源码树。预留空目录用 .gitkeep 保留。

\`\`\`text
${directory}
\`\`\`

## 3. 状态与模块边界

| 数据 | 放在哪里 |
| --- | --- |
| 长期进度：章节、任务标记、伙伴、资源、家具、摆放、首次奖励与阶段 | 服务端 GameState；前端 GameStore 只保存返回快照 |
| 局内状态：坐标、镜头、敌人、生命、弹道、能量与计时 | 地图／战斗模块内部 |
| 当前面板、选中家具、按钮状态 | React UI |
| 剧情、地图、事件、猫咪、关卡、家具、道具与奖池定义 | web/content |
| 会话与结果未知的原始请求 | adapters/storage；不作为权威存档 |
| 阿策最近三轮手动问答、请求取消状态 | 战斗页面内存；切换场次清空，不写存档 |

home 管自由布置、场景修缮与原猫咪互动，保留十二个旧槽位的兼容入口；lottery 管苔叶来信与月海观星两个主题池（各十二件新家具）、概率、开箱和收据。Go 的 service/lottery.go 在原命令事务内扣费、计保底、补偿重复和签收日常／里程碑奖励；旧家具由剧情确定性赠送。旧存档的 lottery 字段惰性初始化，家具与摆放不重命名。免费池每抽 1 邮票，付费池每抽 60 罐头，最多三抽得未拥有家具；两个池独立累计，历史保留 50 次。模拟支付已有进程内和独立服务两种形态，真实支付尚未接入。

ParcelDialog 装配 PostalJournal，使用通用邮寄拼贴手账；ThemePreview 先展示真实花房与十二件套装家具，选择一份或十份后翻出 PostcardCanvas，以归一化点记录本地连续一笔，笔迹不上传。preview → drawing → sending → arriving → parcels → opening → result 连续过渡，松开笔迹即寄出，盖戳后明信片收起；ParcelDelivery 十连在原位立即换成 FurnitureArt，不进入单件展示和动画，已拆家具不保留纸箱底座。CollectionPolaroid 在当前卡池内每次随机轮播一件家具。未拆包收据与笔迹按玩家保存在本地，重新打开继续，已拆完清除；服务端仍是家具、货币与保底的唯一所有者。DRAW_FURNITURE 增加可选 count=1|10，同一事务内逐份调用原抽奖规则；任一失败全部回滚，lastResult.draws 返回本批收据，draw 兼容旧客户端。CapsuleCollection 保留独立家具图鉴；历史回看不提交抽奖，网络重试沿用原幂等键，减少动态偏好使用短过渡。

花房使用 modules/home 的 assets、layout、objects、painter 共用 1672×941 室内布局：建筑底图与透明组件不含猫咪，HomeMap 和场景使用同一装配；四套阶段家具和独立植物图集的裁切坐标放在模块内的 atlas.json／stage-atlas.json，每种购买家具有独立图稿，默认陈设让位于已保存的摆放。camera 管缩放、拖动与点击坐标转换，navigation 按对象地面占位阻挡，原有像素猫按家具脚点排序，前墙藤蔓和家具前缘独立遮挡。story 在对白期间接管角色和站位，空闲 home 阶段才运行日常行为；四阶外观从既有修缮与终章标记推导，图集仅在需要花房时加载。FurnitureBackpack 通过 DemoScene 的投影与编辑接口在同一张 Canvas 预览本地草稿，底部背包覆盖在原场景上，不重建场景或相机；编辑时暂停并隐藏猫咪，退出后恢复。可选 homeLayout 记录默认及收藏家具的位置与收纳状态，SAVE_HOME_LAYOUT 校验后整批提交。HomeRepairOverlay 将目录 parts 的坐标投影为破损处标记，REPAIR_HOME 的可选 repairId 在服务端校验工程、前置部位与库存，单处扣费并保存到可选 homeRepairs；全部部位修完才写入原阶段 flag。省略 repairId 的旧命令只结算本阶段剩余成本，已完成的阶段 flag 对旧存档继续有效。HomeMap 与现场共享局部修缮后的绘制。

GameScreen 在原顶栏分别提供家园手册、邮局、商店、章节地图、仓库与布置按钮，沿用设置按钮样式，家园顶栏移除资源与充值常驻展示。modules/home/HomeHub 复用居中原生 dialog 容器，每次直接打开对应模块，不再提供统一功能导航；设置保持独立 SettingsPanel。家园手册合并 HomeMap 和共享 JourneyRecord，分类按钮放左、文案放右，伙伴资料集中在猫咪伙伴分类；章节路线使用移除花房图片后的 WorldMap。HomePanel 只处理主线下一步与已解锁故事回顾，关卡试玩由 AcceptancePanel 承接。Modal 的 EmbeddedModalContext 仅消耗一层，供邮局、商店、仓库与补给在各自窗口内复用，家具详情等子弹窗仍为独立原生 dialog。ShopPanel 移除旧家具陈列，使用 lottery/ParcelRewards 签收来信、猫咪心愿与里程碑；该组件沿用原服务端命令与北京时间刷新，ParcelDialog 专注主题池和开箱。货币余额只在使用场景展示；顶栏布置按钮直接使用原 FurnitureBackpack，不修改其画布、相机与保存流程。HomeRepairOverlay 的场景标记保留自身定位变换，不受全局按钮悬停、按下或禁用变换影响。home/renovation 在服务端快照新增修缮部位或提升阶段后，缓存一次旧画面并绘制施工、渐显与暖光；场景在过渡期间暂停猫咪与点击，标记隐藏，完成后恢复。首次加载和家具布置不触发修缮动画，后台或菜单暂停，减少动态偏好使用短淡入。

home/dialogue 按性格、动作和情绪维护台词轮换，reactions 管逐猫摸摸间隔、短时情绪恢复、闲聊节流及家具邀请距离。catPainter 共享正向／逆向身体变换与原猫图稿的透明度命中，picking 检查家具纹理遮挡；点击、拖起和放到伙伴身边共用可见猫判定。鼠标按下命中猫后，松开只处理该猫，防抖期间也不会落到家具邀请。日常状态仅在 Canvas 场景内存中，剧情接管与暂停逻辑保持优先。家园住客类型单独包含 advisor，沿用战斗头像图稿和原猫咪交互，不写入拥有伙伴或战斗名册。furnishings 从 home/furniture 与 home/decor 读取尺寸和十种布置分类；parcelWidth、旧家具与服务端布局边界采用相同的 1.7 比例。spatial 维护可见体积避让和地毯／墙饰深度，resident-layers 由日常与修缮快照共同使用，布置命中也沿用相同层级。

家园顶栏「问阿策」与场景阿策点击共用 App 的 advisor 弹层，挂载 advisor/HomeAdvisor，复用 AdvisorProvider、旅程上下文和原只读问答，不登记战斗快照。聊天弹层暂停家园日常，其自身暂停不作为 Provider 的 blocked。HomeRepairOverlay 回传修缮卡与演出状态，GameScreen 回传家园教学状态，home-presentation 统一决定能否打开和当前外观文案；外部操作、关闭、切场景与后台取消等待。story/advisor-home.json 提供经剧情核对的短摘要和全部可见条件，由 knownHomeStorySummaries 筛选后供面板展开查看；试玩记录和 QA 进度不解锁亲历摘要。数据不扩展存档或 API，服务端 AI 仍读取现有公开知识，六章战斗会话保持独立。

## 4. 接入与分工

| 负责人 | 主要位置 | 输入 → 输出 |
| --- | --- | --- |
| 王浩哲 | core/story、core/flow、app；content/story | 状态与剧情节点 → 阶段、任务和跨模块衔接 |
| Jenny | modules/map；content/maps | MapContext → interactionId → INTERACT |
| 余尧 | modules/events；content/events | EventContext → eventId、optionId → CHOOSE_EVENT |
| 闫琦雯 | modules/battle；content/battles | BattleContext → BattleResult → COMPLETE_BATTLE |
| 轩扬 | ui 与各模块展示组件 | 订阅状态、展示结果 → 受控操作回调 |

上表代码路径相对 web/src，内容路径相对 web；战斗引擎、结果结算和联调由闫琦雯维护，家园仓库展示由 UI 协作；其余经济、运维与数据库适配继续按团队认领。app/App.tsx 装配，app/useGame.ts 处理会话、请求和恢复，ui 提供受控展示组件。战斗阶段由 modules/battle/BattleHost.tsx 按场次路由 L00、L01、L02、L03、L04 与 L05 六套实现，其他阶段保留 examples/demo 的探索、地图、家园及剧情场景；其余模块按各自接口继续接入。

- 公共契约在 web/src/contracts/index.ts；长期变更通过 app/controller.ts，不直接修改快照。
- 阿策手动问答走同源只读 API，服务端保管模型配置并在调用前后校验活动场次；只发送可见战况白名单，模型不可用时保留本地规则。自动教学不调用模型，建议不获得游戏操作权限。详见 docs/BATTLE-ADVISOR-MODEL.md。
- 战斗使用服务端 attemptId 和保存的难度快照，七个入口对应六套地图：l00_tutorial 为 3×7／六波教学；alley_rescue 和 alley_boss 共用 5×10 包围框内 26 格／八波四猫首领战；market_boss 为 5×8／八波六猫试玩；greenhouse_boss 为 6×9 包围框内 34 个真实格／八波六猫试玩。L03 缺失格不绘制、不部署、不作为技能中心，墨墨替代点点提供护盾并清除已生成荆棘，四格 Boss 共享体力。tunnel_boss 为 5×8 包围框内 37 格／八波六猫试玩，九处障碍，墨墨以夜视和全员护盾应对断灯；L04 缺失格同样不可绘制、部署或作为技能中心。finale_boss 为 7×12 包围框内 74 格／十波终章试玩，六名可移动主力与三批固定援军，永夜之王占九格，另有两名独立精英；光路随第 3／5／7 波推进，夜视用于暂时识破护幕。
- 新命令无 supplies／usedSupplies；L01–L05 结果包含 leaks 与 bossDefeated，L05 胜负另必报整数 elitesDefeated（0–2），胜利必须为 2，旧章可省略。L02／L03／L04／L05 仅从家园独立进入，完成第一章救援即可分别试玩，不要求按章节顺序先赢前一试玩；胜利只记录本关完成，不发物资、长期伙伴或鼓励奖励，不推进剧情，不清理主线 PendingModifiers。L05 不写终章及建国标记。失败回原关准备并保留失败场次快照，重新挑战创建新 ID、沿用难度；离开准备页清理临时失败身份。
- 所有在场可移动主力猫正常每模拟秒自动 +5 能量（L02 横扫可短暂停止自然蓄能），0 血本场退场，无库存补给或休整。L05 固定援军按间隔自动支援、不能移动或复活，主力六猫全部退场仍判负；灯车与援军不占 carry 通道。L01–L05 另外消费活动场次 carry 的八种事件加成（lantern/mirror/bell/box/dog/dove/rats/kitten），不改基础数值，不恢复背包；L00 忽略 carry。L01 失败准备保留旧 attempt 完整快照，重试创建新 ID 并继承压力和 carry；离开准备清临时身份。暂停与卸载沿用宿主生命周期，刷新同场次从 ready 重建。
- 新增长期规则时同步 Go service、TypeScript 契约与 [OpenAPI](openapi.json)。服务端负责奖励，UI 不直接加余额或发家具。
- 修改内容后执行 npm run content:sync，提交 web/content/catalog.json 和 server/internal/platform/catalog.json 两份生成物。

当前无道具规则与旧预留返还见 [L01 接入](L01-INTEGRATION.md)；序章教程见 [L00 接入](L00-INTEGRATION.md)，第二章七口六猫试玩见 [L02 接入](L02-INTEGRATION.md)，第三章不规则棋盘与墨墨补位见 [L03 接入](L03-INTEGRATION.md)，第四章暗道与夜视护盾见 [L04 接入](L04-INTEGRATION.md)，第五章终极首领、双精英、光路及固定援军见 [L05 接入](L05-INTEGRATION.md)。旧仓库存量保留，新版本不抽取或消耗战斗物品。\n\n## 5. 启动与检查

环境：Node.js 22.12+、Go 1.24+，无需先安装数据库。

\`\`\`bash
npm ci
npm run dev
# 页面 http://127.0.0.1:5017；API http://127.0.0.1:8017
npm run check
# 首次安装测试浏览器，然后验证流程
npx playwright install chromium
npm run test:e2e
\`\`\`

npm run dev 在当前 worktree 使用忽略的 .runtime/game.json；直接运行 API 时默认使用相对 data/game.json，GAME_DATA_FILE 可显式覆盖。不同 worktree 的存档彼此独立，不要合并。浏览器测试用独立端口 8117 和 .runtime/e2e-save.json。环境变量示例见 .env.example，程序读取进程环境变量，不自动加载 .env。端口冲突诊断、启动/停止、切换 worktree 与安全清理步骤见 [本地开发说明](DEVELOPMENT.md)。

当前存档只支持单进程，MySQL 只有 DDL；战斗胜负仍由客户端原型上报。Docker、K8s 与 GitLab CI 是待团队环境验证的模板。GitLab main 已采用本架构；旧 main 保存在 react-demo 分支，历史不变。

## 6. react-demo 接入记录

来源：[轩扬的 react-demo 原型](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/tree/react-demo)，基准提交 b740853；以下为在新架构中的移植，原分支未修改。

| 原型内容 | 当前入口与变化 |
| --- | --- |
| 开场、红蓝黄视觉、像素猫 | ui/StartScreen.tsx、ui/styles.css、ui/PixelCat.tsx；Canvas 与 UI 共用 adapters/canvas/pixelCat.ts 的原像素造型 |
| App / Zustand 状态 | app/App.tsx 与 app/useGame.ts；统一经过 GameController、GameStore、GameApiPort；不导入第二套游戏状态机 |
| 对话与寻猫启事 | content/story/nodes.json 与 ui/DialoguePanel.tsx；保留既有节点 ID 和存档字段，追加兼容节点 |
| 骰子界面 | ui/DiceEvent.tsx；选择后请求 CHOOSE_EVENT，Go 决定骰点；界面不随机发奖 |
| 章节地图 | ui/WorldMap.tsx；读取 Catalog 和真实解锁状态，路线切换仍走 GO_HOME / GO_EXPLORE |
| 家具商店 | ui/ShopPanel.tsx、content/shop/products.json、service/shop.go；新增 BUY_FURNITURE，单件购买、服务端定价、校验、扣费和发货，复用事务与幂等收据 |
| 获救伙伴与结算 | ui/GameScreen.tsx；伙伴与首次奖励读取 GameState，不再使用静态解锁或固定结算 |
| 探索与塔防 | 探索保留 examples/demo 的 Canvas 场景；战斗由 BattleHost 路由 L00–L05 六套模块，不覆盖探索／家园画面；未导入旧原型的 onComplete 无条件胜利接口 |

地图和商店采用原生 dialog，打开时暂停局内模拟；Escape 关闭、焦点约束和关闭后恢复焦点。返回标题保留存档，刷新后可继续；待确认的请求仍按原幂等键重试。新增商品与剧情为兼容内容补充，沿用当前 contentVersion，不清空已有玩家。

## 7. 余尧事件设计 v0.3 接入

来源：[余尧 MR !1](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/merge_requests/1)，提交 410fae4 的 docs/random-events-design.md。原交付为设计文档；本仓库把判定与跨模块衔接落成参考实现，事件模块与正式卡片内容仍由余尧负责。

- **已接入**：服务端独立掷两颗 D6；12 大成功、9–11 成功、6–8 有代价、2–5 失败推进。四档概率依次 1/36、9/36、16/36、10/36；12 不重复计入普通成功。
- **四通道 Outcome**：reward 的 fish → inventory.food、stamps → currencies.stamp、clue / material → inventory 同名键；tdMod.shadowPressure → 下场战斗的 modifiers；situation → 指定的衔接剧情；flags → 长期剧情标记。骰点、资源、后果与收据一起保存。
- **局势已运行**：参考纸箱卡的绕路 / 紧急撤离先进入配置指定的剧情节点，确认后进入 preparation；失败仍能营救点点。寻猫启事按固定剧情节拍出现，推进时记录 lost_poster_found，不进随机池。
- **塔防接入**：START_BATTLE 保留 activeBattle.modifiers 字段，事件修正随场次保存。事件侧负责判断档位，各章宿主将场次 shadowPressure 的 -1／0／1 转为 low／medium／high，缺省普通、非法值拒绝；不随最新 EventState 改档。L00 首次教学固定普通，失败重试复制旧场次快照，结算不消费待用修正。L01 胜利清空待用修正。L02／L03／L04／L05 独立试玩可快照已有压力，但胜负均保留主线 PendingModifiers，重试沿用失败场次难度。战斗侧只应用一次三档敌人体力倍率，不重新评分，也不叠加旧 Demo 压力速度倍率。
- **代码位置**：contracts/index.ts 公共契约；modules/events/types.ts、presentation.ts 接入与展示映射；content/events/events.json 三个选项 × 四档参考后果；Go domain/events.go 判定；service/events.go 原子结算与剧情衔接；ui/DiceEvent.tsx、EventResult.tsx 双骰与后果展示。
- **只预留，尚未运行**：MapDefinition.dangerLevel 0–3（现为示例配置）、节点 / 随机触发类型与已抽事件 ID 输入。区域无放回随机池、触发频率与类型配比、半秒预告、伙伴技能、强制后续事件及其余正式事件卡待余尧与地图 / UI 负责人继续接入；未将 10 张设计目标写成已完成内容。
- **兼容与分工**：保留原 crate_event、search / comfort 标识，新增 eventState 和 battle.modifiers 均为可选字段；旧单骰存档仍可继续，旧 event_success 加成仅为旧战斗保留。当前沿用内容版本；新增参考卡文案、危险度和压力数值均是接入样例，正式定稿由原模块负责人维护。原 MR 和分支未修改，未自动合并。

## 8. 2.0.0 / MR !2 的兼容移植

来源：[轩扬 MR !2「小猫回家记 2.0.0」](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/merge_requests/2)，参考提交 a553076。分支以 e0676ab 为共同基点，恢复了旧根目录 src、Vite 入口和 package.json，原 MR 未自动合并。

| 新内容 | 接入位置与处理 |
| --- | --- |
| 暮色菜单、城市 / 树林 / 花房 / 路灯 | ui/StartMenuBackdrop.tsx、ui/StartScreen.tsx，纯展示层，不管理会话与存档 |
| 纸木色、森林绿、灯光金主题 | ui/theme-cozy.css；适配当前布局，单独导入，未叠加原分支七层主题文件 |
| 更细致的 64×64 猫咪 | adapters/canvas/pixelCat.ts 的共享路径；ui/PixelCat.tsx 渲染 SVG，CanvasPainter 按同一图稿绘制；浏览器保留矢量清晰度 |
| 望京 SOHO 风格像素城市 | 作者 StartBackdrop.jsx 导出为 public/assets/city-backdrop.svg，并登记素材目录；参考小巷 Canvas 加载为背景层，移动边界、障碍物、观察点和纸箱坐标保持现有配置 |
| 四档事件 UI | 颜色与布局接入现有 DiceEvent / EventResult；仍读取 Go 返回的两颗骰子与 Outcome |

两处兼容取舍：原分支的团子为暹罗猫，而当前剧情、档案与王浩哲新增文案均为橘猫，因此保留橘猫身份、移植新造型与条纹；原 eventRules.js 明确是临时适配器，采用加成及 12/8/5 阈值，继续由当前 Go 的无加成 12/9/6 四档判定统一结算。

当前入口、workspace 工程命令、JSON 存档、服务端定价与发货、双骰后果包均保留。王浩哲新增的序章、对话态度、环境观察及 protect 事件选项继续运行。外部库不增加 Zustand 或 Framer Motion。MR 的旧状态机、临时结算、根目录工程配置与旧剧情数据未纳入本次移植。

## 9. 当前战斗集成\n\n当前已有 L00–L05 六套战斗地图、七个服务入口。正式序章 l00_tutorial 使用五步教学与六波实战；第一章首次救援 alley_rescue 与家园 alley_boss 共用四猫首领战。家园 market_boss、greenhouse_boss、tunnel_boss 和 finale_boss 分别提供第二至第五章独立试玩，不插入正式主线，不清理主线待用压力。L03 保留原图 34 格不规则边界，点点本章留守，墨墨以护盾与清棘补位；本关名单不改长期招募或其他模块故事。L04 的 tunnel_boss 另提供地下通道独立试玩：37 格不规则边界，六猫含点点与墨墨，A2 暗管绕 A1/B1/C1 接近 C2。四格首领断灯脉冲暂时限制远处小怪可见性，所有猫保持可见且照常作战；墨墨本章以夜视加全员护盾应对。第三章技能不变。\n\nL05 的 finale_boss 使用 74 格不规则仓库、十波 44 小怪、九格永夜之王和两名各自计血的精英护卫。团子、点点、墨墨与绒绒、斑斑、栗栗构成六名主力；铃铃、桃桃、音音于第 3／5／7 波从固定位置支援，不能移动、复活或代替主力全退场判负。灯车同期推进光路，墨墨夜视识破首领护幕并提供全队护盾，不复用第四章断灯。结算除了 Boss 本体还必须报告 elitesDefeated，胜利要求两精英均败；十波普通敌人仍须全部生成处理。终章正式接点仅列为 finale_intro_5 → 战斗 → finale_intro_6 的候选，不写 finale_started／finale_completed／kingdom_founded。\n\n所有已实现章节无库存补给、休整或同场复活，主力技能使用自然蓄能；第一章起额外接收事件来源的单个 carry，六枚举、第一版效果与生命周期见 [事件战斗对接](BATTLE-EVENT-CARRY.md)。旧 active 预留在新版结算时全额返还且只执行一次。公共规则和各章设计见 [塔防索引](../design/tower-defense/README.md)。\n\n目录变化后运行 npm run architecture:build；npm run architecture:check 会检查本文件与实际文件夹是否一致。需求见 [PRD](PRD.md)。

## 10. 战斗与阿策共享代码的维护位置

第一至第五章保留各自配置、地图、技能、Boss、波次和绘图。相同的基础算法集中在 modules/battle/shared，原引擎的导出接口保持兼容。序章教程使用自己的状态机；第一章特殊支巷路径也继续由本章处理。

| 要修改的内容 | 维护位置 | 保留在调用方的差异 |
| --- | --- | --- |
| 暂停、倍速与固定步进 | battle/shared/clock.ts | 各章 tick 和终局规则 |
| 实际地格、攻击范围、Boss 占格距离 | battle/shared/geometry.ts | 各章地格、技能目标模式和部署限制 |
| 第二至第五章路径与阻挡 | battle/shared/pathing.ts | 路线表、接触距离、事件携带物倍率；援军不进入主力阻挡列表 |
| 页面可见性、绘图循环、Boss 施法震动 | battle/shared/useBattleLoop.ts | 各章绘图、场次重置与结果报告 |
| 猫咪菜单、技能说明定位与阿策头像 | battle/shared/useBattleInspectionLayout.ts、AdvisorPortrait.tsx | 各章 JSX、样式与教程 |
| 已保存场次的入口与配置校验 | battle/shared/stage-context.ts、battle/BattleHost.tsx | 关卡 ID、名称、尺寸、波数和终章精英报告 |
| 家园与旅程的公开事件说明 | advisor/public-event-rules.ts | 问题匹配顺序与当前场景；概率读取 events/presentation.ts 的公开表 |
| 战斗 AI 请求白名单 | advisor/prepare-battle-request.ts | 独立入口与 Provider 的会话、回退和取消生命周期 |
| 模型调用前后的只读场景校验 | server/internal/service/advisor_scene.go | 各范围的语义进度指纹、超时和实际模型载荷 |

新增章节优先接入上述公共能力，章节机制通过原本的配置和函数传入。不要把不同的护盾、暂停判定、隐藏信息、援军或教程规则合并成隐含默认值。修改公共实现需运行受影响各章测试，并检查暂停、换位、技能、结算和窄屏菜单；AI 修改同时检查可见信息、迟到响应及服务端状态变化。
`;
const finalDocument = document.replace('## 5. 启动与检查', explorationArchitecture + '\n\n## 5. 启动与检查');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== finalDocument) throw Error('架构目录已变化，请运行 npm run architecture:build');
} else {
  fs.writeFileSync(target, finalDocument);
}
console.log(`Architecture matches ${directoryCount} source directories.`);
