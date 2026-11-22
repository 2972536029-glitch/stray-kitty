# 《小猫回家记》音效第二波接线 · 交接说明(0 上下文可直接执行)

> 给新会话的 AI:本文件是完整交接。按此执行即可,**不需要向用户询问背景**。
> 用户:余尧(团队里负责随机事件模块)。写完代码后:展示 diff → 用户确认 → commit → MR → 上线,全程按本文件第 6 节流程。
> 最后更新:2026-11-11,基于 main `6ac8cbf`(音效第一波已合并上线)。

## 0. 任务一句话

第一波音效(8 技能施放音、首领重砸、胜负 jingle、掷骰、全局按钮音)已上线;本任务把**剩余音效点全部接线**(音源文件已全部入库,只差代码挂载),走完整 MR + 上线流程。

## 1. 项目速览

- 本地路径:`C:\Users\asus\.zcode\workspace\draft-77bf19d0-e626-4548-b57d-49a707907805\stray-kitty`
- 远程:`origin` = https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty.git(团队仓库,MR 走这);`github` = git@github.com:2972536029-glitch/stray-kitty.git(用户私人镜像,用户没说**不要主动推**)
- 技术栈:前端 React+TS+Canvas 2D(`web/`),后端 Go(`server/`);游戏命令全部走 Go API,前端只演出
- 本地开发:`npm run dev`(前端 http://127.0.0.1:5017,API http://127.0.0.1:8017)
- 验证:`npx tsc --noEmit -p web` + `npm run build` + `npx tsx --test tests/battle/*.test.ts`(683 个,必须全绿)
- GitLab API 令牌:`C:\Users\asus\.zcode\secrets\xsolla-gitlab-api.token`(**仅限 school-gitlab.xsolla.dev 使用,不回显、不进 git**);请求头用 `PRIVATE-TOKEN`,项目路径 URL 编码为 `haozhe_wang%2Fstray-kitty`

## 2. 音效系统现状(第一波已上线)

### 核心 API:`web/src/core/sound.ts`

```ts
playSfx(url: string, volume = 0.6, rate = 1): void          // 单音;缓存复用;重播归零;rate 升降调
playSfxSequence(cues: readonly SfxCue[], gapMs = 110, volume = 0.6): void  // 序列;SfxCue = {url, rate?}
installClickSfx(): () => void                                // 全局按钮点击音(事件委托),App.tsx 已安装
```

铁律:
- **所有声音必须走 `playSfx`**,不要绕过它直接 `new Audio`——它有 `typeof Audio === 'undefined'` 防御(node 测试环境无 Audio,绕过会让 683 个测试崩,battleFx 测试踩过)
- 音效文件放 `web/public/assets/sfx/`(29 个已入库),代码里用绝对路径 `/assets/sfx/xxx.ogg`
- `prefers-reduced-motion` 只管动效,**声音不受它限制**(battleFx.ts 的先例:播声在 reduced-motion 判断之前)

### 音效来源记录

`docs/AUDIO-CREDITS.md`——**每接入一个新音效点,必须同步更新此表**(文件名 / Kenney 原名 / 用途)。

### 已接线清单(不要重复做)

| 点 | 挂点文件 | 方式 |
|---|---|---|
| 8 技能施放音 | `web/src/modules/battle/SkillBanner.tsx` 的 `BANNER_SFX` 映射 | emit 时按技能名播(支持序列+变速,银铃缓行=铃+三声递升冰叮) |
| 首领重砸 | `web/src/modules/battle/battleFx.ts` `triggerBossSkillShake` | 函数入口处 playSfx('boss-slam.ogg', 0.55) |
| 战斗胜负 jingle | `web/src/modules/battle/BattleResultScreen.tsx` 的 `useEffect([won])` | won ? battle-win : battle-lose |
| 事件掷骰 | `web/src/ui/DiceEvent.tsx` 的 `choose()` | playSfx('dice-roll.ogg', 0.45) |
| 全局按钮 | `web/src/app/App.tsx` | `useEffect(installClickSfx,[])` |

## 3. 第二波任务清单(按优先级,全部音源已在库里)

### 3.1 战斗循环音(普攻/波次/漏怪)——动战斗展示层,最小侵入

音源已入库:`attack-hit.ogg` / `wave-start.ogg` / `battle-leak.ogg`。

**挂点方案(推荐):在各章 Viewport 组件里做 state diff effect,不改 `shared/useBattleLoop.ts`**(那是战斗核心,LoopState 接口只有 boss.slams,扩接口侵入大,团队规范要求最小侵入)。

六章 viewport 文件(结构同构):
- `web/src/modules/battle/chapter/ChapterBattleViewport.tsx`
- `web/src/modules/battle/market/MarketBattleViewport.tsx`
- `web/src/modules/battle/greenhouse/GreenhouseBattleViewport.tsx`
- `web/src/modules/battle/tunnel/TunnelBattleViewport.tsx`
- `web/src/modules/battle/finale/FinaleBattleViewport.tsx`(注意:它有 `allies` 字段,shields 数组含 allies)
- `web/src/modules/battle/l00/BattleViewport.tsx`(独立实现,state 结构不同,先确认字段再接)

写一个共享 hook 放 `web/src/modules/battle/shared/`(注意:放 shared 是**新增文件**,不改既有文件,符合最小侵入):

```ts
// web/src/modules/battle/shared/useBattleSfx.ts
import {useEffect, useRef} from 'react';
import {playSfx} from '../../../core/sound';

/** Presentational state-diff cues: wave starts, leaks, basic-attack hits.
 * Reads only the fields it is given; battle engines stay untouched. */
export function useBattleSfx<State extends {wave?: number; leaks?: number; effects?: unknown[]}>(game: State): void {
  const prev = useRef(game);
  useEffect(() => {
    const p = prev.current;
    if (game.wave !== undefined && p.wave !== undefined && game.wave > p.wave) playSfx('/assets/sfx/wave-start.ogg', 0.5);
    if (game.leaks !== undefined && game.leaks > (p.leaks ?? 0)) playSfx('/assets/sfx/battle-leak.ogg', 0.5);
    if (game.effects && p.effects && game.effects.length > p.effects.length) playSfx('/assets/sfx/attack-hit.ogg', 0.35); // 限频见下
    prev.current = game;
  }, [game]);
}
```

注意:
- `game` 每 50ms 才同步一次 React state(useBattleLoop 节流),普攻音会天然限频到最多 20/s;如果实测太密,在 hook 里加一个 `lastHitAt` ref 做 150ms 最小间隔
- **先确认各章 state 真有这些字段**(grep `wave` / `leaks` / `effects` 于各章 `engine.ts` / `types.ts`;finale 的普攻可能来自 allies,若字段名不同按实际改)
- **l00 教学关 state 字段名可能不同**(如 `waveCount`),接之前 grep 确认;接不上就跳过 l00,在 MR 描述注明
- 每章 viewport 的组件体内加一行 `useBattleSfx(game);`(紧挨 `useBattleLoop` 调用处)

### 3.2 事件四档结果音——用户(余尧)自己的模块,随便动

音源已入库:`result-crit.ogg` / `result-success.ogg` / `result-partial.ogg` / `result-fail.ogg`。

服务端结算后,`GameState.eventState.lastResolution` 含 `{eventId, optionId, dice, tier, outcome}`,`tier` ∈ `"crit"|"success"|"partial"|"fail"`(定义见 `server/internal/domain/events.go` 的 `EventResolution`;前端类型在 `web/src/contracts/index.ts`,grep `lastResolution` 或 `eventState` 确认字段名)。

**挂点方案**:渲染事件卡的容器组件里(先 grep `lastResolution` 在 `web/src` 的引用点,大概率在 `web/src/ui/GameScreen.tsx` 或 events 相关展示组件)加一个 effect 对比 tier:

```ts
const prevTier = useRef<string>('');
useEffect(() => {
  const tier = state?.eventState?.lastResolution?.tier;
  if (tier && tier !== prevTier.current) {
    prevTier.current = tier;
    playSfx(`/assets/sfx/result-${tier === 'crit' ? 'crit' : tier}.ogg`, 0.5);
  }
}, [state?.eventState?.lastResolution]);
```

(文件名与 tier 值一一对应:crit/success/partial/fail)

### 3.3 家园/邮局/商店(跨模块,每个都是一行级接入,不动既有逻辑)

| 音效点 | 音源(已入库) | 挂点(先 grep 定位再插一行) |
|---|---|---|
| 包裹开箱(抽卡核心演出) | `skill-lantern-shatter.ogg` 可复用,或留待补纸箱声 | `web/src/modules/lottery/` 内开箱动画触发处(grep `opening` 或 `ParcelDialog`) |
| 家具购买成功 | `ui-select.ogg` 或补金币声 | `web/src/modules/shop/` 购买成功回调 |
| 家具摆放 | `ui-select.ogg` 降调(rate 0.8) | `web/src/modules/home/FurnitureBackpack.tsx` 放置确认处 |
| 修缮完成 | `result-success.ogg` | `web/src/modules/home/` REPAIR_HOME 成功回调 |
| 抽到稀有闪光 | `skill-star-sparkle.ogg` 可复用 | lottery 开箱结果稀有分支 |

策略:**只加一行 playSfx 调用**,不重构;如果挂点深且含业务逻辑,宁可跳过并在 MR 描述注明"待与模块 owner 对齐后接"。这些模块的 owner 按 `docs/ARCHITECTURE.md` 分工表(§4 接入与分工)确认。

### 3.4 探索拾取(可选,时间不够就跳过)

拾取音源未单独入库(可复用 `ui-select.ogg` 升调)。挂点在探索交互成功回调(`web/src/examples/demo/scene.ts` 或 rainyAlley 模块的 INTERACT 响应处理)。**探索场景文件名带 demo 不代表未接入**(架构文档原话),不要被目录名骗了。

### 3.5 猫咪互动真实猫声(需要用户先去下载,未完成)

音效库里没有动物声。需要用户从 Freesound(注册+CC0 过滤)下载 `cat meow` / `cat purr` 1~2 个,然后:`web/public/assets/sfx/cat-meow.ogg` + 挂点到猫咪摸摸互动(`web/src/modules/home/` 的 reactions,grep `摸摸` 或 `reactions`)。**用户没给文件就跳过此点**,MR 描述注明。

## 4. 已知坑(全部踩过,别再踩)

1. **CI `architecture:check` 会因新增文件失败**:`docs/ARCHITECTURE.md` 是从目录结构生成的。任何新增文件/目录后必须跑 `npm run architecture:build`,把更新的 ARCHITECTURE.md 一起 commit(第一波 pipeline 8602 就这么挂的)
2. **node 测试环境无 Audio**:声音必须走 `core/sound.ts` 的 playSfx(内含防御)
3. **不需要 content:sync**:那只在改 `web/content/` 数据时用;音效不涉及
4. **dev server 常挂**:跑 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5017/` 检查,000 就 `npm run dev` 重启(后台跑,等 ~12 秒)
5. **Windows Python 读文件一律显式 encoding='utf-8'**,否则 GBK 乱码;临时脚本用真实盘路径不用 /tmp
6. **团队规范**:不动别人的既有代码结构,新增文件优先,既有文件只做一行级插入;`modules/battle` 是闫琦雯的、`ui` 是轩扬的、`core/story` 是王浩哲的、`modules/events`+`content/events` 是用户余尧的(详见 ARCHITECTURE.md §4)

## 5. 验收方式

1. `npx tsc --noEmit -p web` + `npm run build` 零错误
2. `npx tsx --test tests/battle/*.test.ts` 683 全绿
3. `npm run dev` 起本地,让用户实测:进战斗放技能听普攻/波次/漏怪、事件掷骰听四档结果、家园抽卡听开箱
4. 用户验收 OK 才 commit(MR 描述参照第一波 `!207` 的格式,分"已加上/验证/边界说明")

## 6. 提交 → MR → 上线流程(照抄即可)

```bash
git checkout -b feat/sfx-wave2          # 从最新 main 开
# ...改代码...
npm run architecture:build              # 新增文件后必跑!
git add <相关文件> && git commit -m "feat: wire remaining game sound cues"
git push origin feat/sfx-wave2          # 网络慢可能要几分钟,耐心等
```

然后用 GitLab API(令牌见第 1 节,读文件不回显):

1. `GET /api/v4/projects/haozhe_wang%2Fstray-kitty/merge_requests?source_branch=feat/sfx-wave2&state=opened` 查重(应为 `[]`)
2. `POST .../merge_requests` 建 MR(title 英文短句 `feat: wire remaining game sound cues`,description 中文分"已加上/还没加上/验证"三段,`remove_source_branch: true`)
3. 轮询 `GET .../merge_requests/<iid>` 的 `head_pipeline.status` 直到非 running(45s 一次)
4. success 后 `PUT .../merge_requests/<iid>/merge` 合并
5. `GET .../pipelines?ref=main&per_page=1` 轮询 main 流水线到 `manual` 状态
6. `GET .../pipelines/<id>/jobs` 找 `deploy_apply` 的 job id → `POST .../jobs/<id>/play`
7. 轮询 job 到 success → `curl https://starry-kitty.duckdns.org/healthz` 验证(本机 DNS 偶发挂,失败可让用户浏览器自测,或用 ZCode 的 WebFetch 从服务端验证)
8. 合并后源分支自动删;本地 `git pull origin main` + 删本地分支 + `git fetch --prune`

## 7. 完成后的收尾

- 更新 `docs/AUDIO-CREDITS.md` 使用位置表
- 问用户是否同步 GitHub 镜像(`git push github main`,用户说了才推)
- 用户如果要继续调音(换音/调音量/加变速效果),映射都在 `SkillBanner.tsx` 的 `BANNER_SFX` 和各挂点行,改参数即改
