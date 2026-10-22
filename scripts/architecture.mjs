import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'docs/ARCHITECTURE.md');
if (!process.argv.includes('--check') && !fs.existsSync(target)) fs.writeFileSync(target, '');
const excluded = new Set(['node_modules', '.git', '.runtime', 'data', 'output', 'tmp', 'test-results', 'playwright-report', 'dist', 'artifacts', 'coverage', '.idea', '.vscode']);
const labels = {
  web: '浏览器前端', 'web/src': '运行代码', 'web/src/app': '启动、装配与 GameController',
  'web/src/contracts': '公共状态、命令与模块输入输出', 'web/src/core': '公共流程',
  'web/src/core/flow': '阶段与命令检查', 'web/src/core/story': '剧情与任务',
  'web/src/core/state': 'GameStore 状态快照', 'web/src/core/rules': '公共条件与资源判断',
  'web/src/core/ports': 'API 与会话存储接口', 'web/src/modules': '正式模块接入口',
  'web/src/modules/map': '地图 · Jenny', 'web/src/modules/events': '随机事件 · 余尧',
  'web/src/modules/battle': '塔防 · 闫琦雯', 'web/src/modules/cats': '猫咪档案、救援与成长',
  'web/src/modules/home': '家园建设、摆放与互动', 'web/src/modules/inventory': '道具与家具持有',
  'web/src/modules/economy': '货币、扣费与奖励', 'web/src/modules/lottery': '奖池、抽取与结果',
  'web/src/modules/shop': '商品与购买 · 预留', 'web/src/ui': '界面与样式 · 轩扬',
  'web/src/adapters': '具体运行能力', 'web/src/adapters/canvas': '原生 Canvas 2D',
  'web/src/adapters/api': 'HTTP 请求', 'web/src/adapters/storage': '浏览器会话与待确认请求',
  'web/src/adapters/platform': '输入与设备能力', 'web/src/adapters/telemetry': '本地诊断',
  'web/src/adapters/payment': '支付动作 · 预留', 'web/src/examples': '参考实现',
  'web/src/examples/demo': '可替换的贯通 Demo', 'web/src/config': '运行配置',
  'web/src/shared': '通用工具 · 预留', 'web/content': '独立内容数据',
  'web/content/story': '章节与对话', 'web/content/maps': '地图与交互点',
  'web/content/events': '事件与选项', 'web/content/cats': '猫咪档案',
  'web/content/battles': '关卡与波次', 'web/content/home': '家具与摆放位置',
  'web/content/items': '道具', 'web/content/economy': '经济配置 · 预留',
  'web/content/lottery': '奖池', 'web/content/shop': '商品配置 · 预留',
  'web/content/tutorials': '操作提示', 'web/content/assets': '素材索引',
  'web/public': '静态资源', 'web/public/assets': '图片、动画、声音与字体',
  server: 'Go 服务端', 'server/cmd': '服务入口', 'server/cmd/api': 'HTTP 启动',
  'server/internal': '服务实现', 'server/internal/transport': '请求、认证与参数检查',
  'server/internal/service': '长期规则、判定、奖励与结算', 'server/internal/domain': '状态、命令与错误',
  'server/internal/repository': '单进程 JSON 文件事务', 'server/internal/platform': '嵌入内容配置',
  'server/internal/integrations': '外部集成', 'server/internal/integrations/payment': '支付渠道 · 预留',
  'server/migrations': 'MySQL 结构 · 尚未接入', docs: '仅三份文档',
  tests: '自动验证', 'tests/e2e': '浏览器流程', scripts: '启动、生成与检查', deploy: '部署模板',
  '.dockerignore': '容器构建排除', '.env.example': '非秘密环境变量示例',
  '.gitattributes': '换行与二进制规则', '.gitignore': '本地生成文件排除',
  '.gitlab-ci.yml': '检查与构建流水线', 'package.json': '依赖与工程命令',
  'package-lock.json': '锁定依赖', 'playwright.config.ts': '浏览器测试配置',
  '启动开发.cmd': 'Windows 开发入口', 'docs/PRD.md': '需求与分工',
  'docs/ARCHITECTURE.md': '架构、目录与接入', 'docs/openapi.json': 'API 规范'
};
let directoryCount = 0;
function tree(relative = '', prefix = '') {
  const entries = fs.readdirSync(path.join(root, relative), {withFileTypes: true})
    .filter(entry => entry.isDirectory() ? !excluded.has(entry.name) : relative === '' || relative === 'docs')
    .filter(entry => entry.isDirectory() || entry.isFile())
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
  Repository --> Save["data/game.json"]
  Service -->|返回 GameState| Store["GameStore：界面状态快照"]
  Store --> View
\`\`\`

移动、碰撞和逐帧战斗在前端运行；事件判定、抽奖、长期奖励和摆放经过 Go。商城和真实付费尚未实现，未来同样由服务端验证和发货。

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

home 管建设与摆放，lottery 管抽奖，shop 管购买；economy 统一余额与结算，inventory 统一拥有状态。抽到／买到家具后再交 home 摆放。真实付费预留在前后端 payment 目录，本次没有支付实现。

## 4. 接入与分工

| 负责人 | 主要位置 | 输入 → 输出 |
| --- | --- | --- |
| 王浩哲 | core/story、core/flow、app；content/story | 状态与剧情节点 → 阶段、任务和跨模块衔接 |
| Jenny | modules/map；content/maps | MapContext → interactionId → INTERACT |
| 余尧 | modules/events；content/events | EventContext → eventId、optionId → CHOOSE_EVENT |
| 闫琦雯 | modules/battle；content/battles | BattleContext → BattleResult → COMPLETE_BATTLE |
| 轩扬 | ui 与各模块展示组件 | 订阅状态、展示结果 → 受控操作回调 |

上表代码路径相对 web/src，内容路径相对 web；其他模块扩展待认领。modules 当前主要提供 types.ts 接口，参考画面和玩法在 examples/demo。各成员在本人模块开发，完成后逐个替换 Demo 中的对应部分。

- 公共契约在 web/src/contracts/index.ts；长期变更通过 app/controller.ts，不直接修改快照。
- 战斗输入包含服务端 attemptId、关卡、伙伴和事件效果；输出 attemptId 与 won/lost。正式模块实现 start、pause、stop，退出释放监听与计时器。
- 新增长期规则时同步 Go service、TypeScript 契约与 [OpenAPI](openapi.json)。服务端负责奖励，UI 不直接加余额或发家具。
- 修改内容后执行 npm run content:sync，提交 web/content/catalog.json 和 server/internal/platform/catalog.json 两份生成物。

## 5. 启动与检查

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

开发存档在 data/game.json；浏览器测试用独立端口 8117 和 .runtime/e2e-save.json。环境变量示例见 .env.example，程序读取进程环境变量，不自动加载 .env。

当前存档只支持单进程，MySQL 只有 DDL；战斗胜负仍由客户端原型上报。Docker、K8s 与 GitLab CI 是待团队环境验证的模板。首次上传先把旧 main 保存到备份分支，再以本目录作为新 main 内容。

目录变化后运行 npm run architecture:build；npm run architecture:check 会检查本文件与实际文件夹是否一致。需求见 [PRD](PRD.md)。
`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== document) throw Error('架构目录已变化，请运行 npm run architecture:build');
} else {
  fs.writeFileSync(target, document);
}
console.log(`Architecture matches ${directoryCount} source directories.`);
