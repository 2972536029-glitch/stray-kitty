# 《小猫回家记》音效全面测试与审计报告

> **给 0 上下文会话**:本文件自包含。项目在 `C:\Users\asus\.zcode\workspace\draft-77bf19d0-e626-4548-b57d-49a707907805\stray-kitty`;
> 本地 `npm run dev`(前端 http://127.0.0.1:5017,API http://127.0.0.1:8017);验证:`npx tsc --noEmit -p web` +
> `npx tsx --test tests/battle/*.test.ts`(683 个)+ `npm run check`(CI 全门禁)。上游交接文件见根目录 `SFX-WAVE2-HANDOFF.md`(任务背景),
> 本文件是**全量音效审计**(不限于该任务)。
> 审计方法:静态代码审读(逐触发点核对触发条件与音源)+ 用户(余尧)实机听感反馈。声音无法被 683 个测试断言,回归全靠人工听感,故附手动清单(§6)。
> 最后更新:2026-11-11,基于 main `6ac8cbf` + 工作树未提交改动(见 §8)。

## 0. 结论速览

- 音效系统为**两套并存**:`useAudioManager`(WebAudio 合成音,受设置滑条控制)+ `core/sound.ts` `playSfx`(OGG 文件音,§3-P1:不受滑条控制)。
- 共清点 **26 个触发点**(§2 清单)。其中 OGG 16 处、合成音 10 处(含全局按钮双系统各 1 处)。
- **发现问题 10 项**(§3,P1×2 / P2×8),**不优雅点 8 项**(§4),**未接线 11 项**(§5 单列)。
- 本会话已修复 4 项(§7 已修清单,勿重复报):preservesPitch、摸摸声重叠、呼噜过长、波次音(按用户要求移除)。
- 683 测试与 `npm run check` 当前全绿;**改动尚未提交**(§8 有提交计划)。

## 1. 音效系统架构(两套并存)

| | 系统 A:`ui/useAudioManager.ts` | 系统 B:`core/sound.ts` |
|---|---|---|
| 技术 | WebAudio 合成(blip/琶音/三角波喵) | OGG/MP3 文件(`web/public/assets/sfx/`,31 个文件) |
| 入口 | `playSound(id)`(ui/soundEffects.ts 注册器) | `playSfx(url, vol, rate, group?)` |
| 音量控制 | **受设置滑条**(sfxVolume → sfxGain 总线) | **不受滑条**,固定 `audio.volume` 常量 |
| 测试环境防御 | `player?.()` 未注册时静默 | `typeof Audio === 'undefined'` 直接返回 |
| 归属 | 轩扬(ui 模块) | 第一波 MR `!207` 引入 |
| 触发点 | 10 处 | 16 处 |

系统 A 的 pointerdown 监听同时承担 **AudioContext 解锁**(BGM 环境音都靠它拉起),动它必须保留 unlock()。

## 2. 全量触发点清单(审计基准)

### 系统 B(playSfx,OGG)

| # | 触发点 | 文件:行 | 触发条件 | 音源 | 音量/rate | 审计备注 |
|---|---|---|---|听感步骤见 §6|---|
| 1 | 全局按钮 | core/sound.ts:51 | pointerdown 于任何未禁用 button | ui-click 0.3 | 与系统A按钮音重叠(§3-P1) |
| 2 | 技能施放 | SkillBanner.tsx:102-105 | banner emit(六章+l00,仅接受施放) | BANNER_SFX 8 技能映射,默认 0.6 | 名字字符串映射脆弱(§4-2);l00 也走这里(l00/BattleViewport.tsx:208) |
| 3 | 首领重砸 | battleFx.ts:9 | boss.slams 递增(useBattleLoop 内比较) | boss-slam 0.55 | 正确;reduced-motion 只跳过抖动不跳过声音(设计如此) |
| 4 | 胜负 jingle | BattleResultScreen.tsx:33 | won?win:lose,useEffect [won] | 0.5 | 用户听感:胜利音"像失败",已决策**保持原状**(2026-11-11) |
| 5 | 事件掷骰 | DiceEvent.tsx:30 | choose() 发命令时 | dice-roll 0.45 | 服务端驳回时骰声已出(§3-P2) |
| 6 | 掷骰揭晓 | DiceRollOverlay.tsx:101 | 仪式 reveal,按 tier | result-crit/success/partial/fail 0.5 | 本会话由好/坏二分合成音**替换**(原 chime/meow 合成弃用) |
| 7 | 漏怪 | useBattleSfx.ts:31 | leaks 数值递增(20Hz diff,重开不误触) | battle-leak 0.5 | wave2 新增 |
| 8 | 普攻命中 | useBattleSfx.ts:43 | attack-kind effect 出现,150ms 限频 | attack-hit 0.35 | wave2 新增;六章 kind 过滤(attack/elite-attack/ally-attack/l00 projectiles) |
| 9 | 摸摸开心 | scene.ts:1062 | petCat mood=happy | cat-purr 0.5 | 'pet' 独占组;音源裁至 1.5s |
| 10 | 摸摸平静 | scene.ts:触发| petCat mood=neutral | cat-meow 0.5/1 | 同上 |
| 11 | 摸摸烦躁 | scene.ts:1061 | mood=irritated | cat-meow 0.45 rate 0.75 | 同上;preservesPitch 修复后才有真降调 |
| 12 | 拆包裹 | PostalJournal.tsx:86 | 单包裹拆开动画起手 | skill-lantern-shatter 0.4 | 复用技能音源(§4-5) |
| 13 | 摆家具确认 | FurnitureBackpack.tsx:66 | 「确定位置」按钮 | ui-select 0.4 rate 0.8 | |
| 14 | 放入场景 | FurnitureBackpack.tsx:156 | 「放入场景」按钮 | ui-select 0.4 rate 0.8 | 放在 commit 前是有意的:commit 也会被取消恢复路径调用 |
| 两处 playSfxSequence | 技能序列音 | SkillBanner.tsx:104 | 多 cue 技能(三连爪/银铃缓行) | gap 90ms | preservesPitch 修复后变速才真变调 |

### 系统 A(playSound,合成音)

| # | 触发点 | 文件:行 | 音效 | 审计备注 |
|---|---|---|---|已修/问题见 §3|
| 1 | 全局按钮 | useAudioManager.ts:200 | click blip 620Hz | 与 B#1 重叠(§3-P1) |
| 2 | 错误横幅 | App.tsx:121 | error | 合理 |
| 3 | 首次回家 | App.tsx:125 | chime | 每存档一次(localStorage 记忆),合理 |
| 4 | 修缮动画完成 | scene.ts:661 | chime | 与 B#修缮成功音(result-success)是两个时刻:确认时 + 动画完成时;听感可接受但建议 owner 确认 |
| 5-9 | 邮局流程 | PostalJournal.tsx:73-110 | step/send/open/pickup/chime | 流程音齐;拆包瞬间原 'open' 已替换为 OGG(B#12) |
| 10 | 首通奖励 | GameScreen.tsx:80 | pickup | rewardMoment 按 revision 记忆,合理 |

**已死代码**:useAudioManager.ts:180-192 的 'meow' 合成音在 DiceRollOverlay 替换后**无任何调用方**(本会话造成,§4-4)。

## 3. 已发现问题(按严重度)

**P1-1 设置滑条管不到 OGG 音效**——设置面板「按钮与游戏音效」滑条(SettingsPanel.tsx:14)只走系统 A 的 sfxGain 总线;系统 B `playSfx` 直接设 `audio.volume` 常量(core/sound.ts:17)。用户把滑条拉 0,技能音/普攻/胜负/摸摸声**照样响**。修法方向:playSfx 读全局音量(模块级变量 + setter,App 在滑条变化时同步),或 OGG 全部迁入 sfxGain 总线(WebAudio MediaElementSource,注意 CORS 与 unlock 时序)。**owner:音效系统作者,需对齐后改。**

**P1-2 全局按钮双音**——App.tsx:45 `installClickSfx`(OGG 0.3)与 useAudioManager.ts:196-204(合成 blip)对同一 pointerdown 各响一次;全库仅 PrologueSequence.tsx:152 一个 `data-sound` 按钮豁免(它豁免的还只是系统 A)。修法:删 useAudioManager handler 里的 `play('click')`,**保留 unlock()**(AudioContext 解锁靠它)。**owner:ui 模块。**

**P2-1 键盘无按钮音(可访问性)**——两套按钮音都只监听 `pointerdown`(sound.ts:48 / useAudioManager.ts:197);Enter/Space 激活按钮不产生 pointerdown → 键盘用户零反馈。修法:补 `keydown` 监听(过滤非按钮)或改 `click` 事件(需处理触摸 300ms 问题,pointerdown 是为即时感选的)。

**P2-2 dice-roll 时序**——DiceEvent.tsx:30 在发命令瞬间响;若服务端驳回(busy 结束无 resolution),仪式 150ms 后静默收场(GameScreen.tsx:73-77),骰声已出。轻微;修法可在 ceremonyResolution 出现时才响,但会损失"按下即响"手感。owner 决策。

**P2-3 l00 无 boss-slam 触发路径**——triggerBossSkillShake 只在 useBattleLoop(五章);l00 无首领重砸机制,合理,但若 l00 后续加 boss 需记得接。备注性发现。

**P2-4 两系统音色标准不一**——OGG 常量音量 0.3~0.6 手工调,合成音 gainMul 手工调,无响度归一(§4-3)。

**P2-5 呼噜/meow 是 mp3,其余 ogg**——格式混杂无碍播放(playSfx 不看扩展名),但 AUDIO-CREDITS 与资产规范上最好统一;补声时注意。

**P2-6 BANNER_SFX 未命中静默**——BANNER_SFX[name] 查不到就无声(SkillBanner.tsx:102-105 无 else 兜底);content 改名即静默失声,无告警。与 §4-2 同源,列测试项:施放全部技能确认都有声。

**P2-7摸摸跨猫互斥是全局的**——'pet' 独占组是全局一个声道,摸 A 猫的呼噜会被 B 猫的喵顶掉。设计上"注意力转移"可接受,若想要每猫独立改为 `pet:${cat.breed}` 即可。owner 决策。

**P2-8 设置音量持久化未验证**——滑条值是否落 localStorage 未在本次审计核实;测试时顺手验证(改滑条→刷新→是否保留)。

## 4. 代码不优雅点

1. **两套音效系统并存**(§1)——语义分裂(音量控制、测试防御各一套)。长期方向:playSfx 接入 sfxVolume,或统一到一套。大改,需 owner 立项。
2. **BANNER_SFX 按技能名字符串映射**(SkillBanner.tsx:29)——content 改技能名即静默失声。建议映射键改为 catId 或 content 增加 sfxKey 字段。
3. **无响度标准**——各触发点音量 0.3~0.6 逐个手调,没有统一参考响度,新人接新点只能"凭感觉"。建议定响度基准(如主互动 0.5、背景层 0.35)写进 ARCHITECTURE.md。
4. **useAudioManager 'meow' 成死代码**(useAudioManager.ts:180-192)——本会话替换 DiceRollOverlay 后无调用方。删除或保留作备份,owner 决策。
5. **拆包音复用技能音源**(PostalJournal.tsx:86 用 skill-lantern-shatter)——命名与用途错位;长期应补专用纸箱/纸张音源。
6. **useBattleSfx 无依赖数组**(useBattleSfx.ts:28)——每渲染跑 diff;有注释说明设计意图,数值比较保证不误触。可改 `[game, options.effects, options.attackKinds]` 依赖数组,但 options 字面量每渲染新建反而增加 churn,现实现是合理取舍。
7. **键盘无按钮音**(同 §3-P2-1)——既是缺陷也是优雅度问题。
8. **installClickSfx 豁免逻辑与系统 A 不对称**——installClickSfx 只豁免 disabled,不豁免 data-sound;两系统对"哪个按钮自己管声音"约定不一致(唯一 data-sound 按钮目前双豁免恰好正常)。统一豁免约定。

## 5. 未接线清单(单独列出,含原因)

| 音效点 | 状态 | 原因/备注 |
|---|---|---|
| ui-open / ui-close / ui-back | 音源在库,**未接线** | Modal 弹窗开关音;接了要考虑与全局 click 音的叠加,需 owner 决策是否要 |
| wave-start(波次音) | 接了又**按用户反馈摘除**(2026-11-11) | 音源闲置;credits 已注明"用户听后不要" |
| boss 基础攻击('boss-attack' kind) | **故意不接** | 避免与 boss-slam 音色定位混淆;boss 声音身份 = 重砸 |
| 敌人死亡('defeat' kind) | 未接 | 音源库无对应音频 |
| 商店购买成功 | 未接 | 购买走 fire-and-forget onCommand,无本地成功回调;要接需 diff 货币,超出最小侵入,待 owner 对齐 |
| 抽到稀有闪光 | 未接 | 契约无 rarity 字段(skill-star-sparkle 备好未用) |
| 探索拾取 | 未接 | 探索无独立拾取时刻;首通奖励已有 pickup 音 |
| 猫咪真实猫声 | **本会话已接**(摸摸三分支) | 已从"未接线"转为"已接线" |
| CarryPanel USE_CARRY(援护道具) | 未接 | 战斗次级交互,可作下波候选 |
| 撤离战斗/确认弹窗 | 未接 | 同上 |
| 家具活动邀请(useFurniture) | 未接 | 家园次级交互,可作下波候选 |

## 6. 手动听感测试清单(照此回归)

> **注**:本节面向**人耳**回归。若交给只读测试会话(不能听、不能改),改用根目录 `SFX-TEST-BRIEF.md`——
> 它是给 AI 测试窗口的机检版指令(页面埋 play() 监听器 + 断言 + 严格回报格式),两者互补不互替。

前置:`npm run dev`,浏览器 **Ctrl+F5 强清缓存**(OGG/MP3 会被浏览器缓存),系统音量开。
会话内已验证过的项标 ✅(2026-11-11,余尧本机通过)。

### 战斗(六章:小巷/集市/花房/暗道/终局 + l00 教学关)
- [ ] 施放全部 8 个技能:各有一声专属音(技能名→音映射,验证 P2-6 是否有漏网技能)
- [ ] 银铃缓行:铃响后三声冰叮**逐个升调**(preservesPitch 修复后的新行为)
- [ ] 普攻命中:低哑 hit 声,150ms 内连击只响一声;**技能施放不触发它**(kind 过滤)
- [ ] 漏怪:黑影过线一声 error 警告;重开战斗不误响
- [ ] 首领重砸:每次重砸一声(沙袋/路障落地感)
- [ ] 胜利/失败 jingle:胜利音按用户决策**保持原状**(明知听感存疑,勿再改)
- [ ] l00 教学关:技能有声、普攻有声(projectiles 路径)、无 boss-slam(无此机制,正常)
- [ ] 波次切换:**静音**(波次音已按用户反馈摘除;听到波次音=回归)

### 事件
- [ ] 掷骰:按下即 tick 声;仪式揭晓时四档各播专属 jingle(crit/success/partial/fail)
- [ ] 揭晓音与画面特效档位对得上;**没有**旧合成 chime/meow 叠加
- [ ] 服务端驳回(断网重试):骰声已出、无揭晓音(已知 P2-2,记现象即可)

### 家园/花房
- [ ] 摸摸·开心:呼噜 ~1.5s(醒着的普通猫,隔 9s 后第一摸;喵喵/墨墨第一摸是平静,性格设定)
- [ ] 摸摸·平静:喵(睡觉/吃饭的猫第一摸;或同猫连摸第 3 下;或摸喵喵/墨墨第一下)
- [ ] 摸摸·烦躁:降调喵(醒着的猫连摸第 4 下;或睡觉/吃饭的猫第 2 摸)——**与平静喵音高明显不同**(preservesPitch 修复点)
- [ ] 快速连摸:呼噜被下一个声顶掉,**永不重叠**('pet' 独占组)
- [ ] 摆家具:确定位置/放入场景两按钮一声降调 select;拖动/取消不响
- [ ] 修缮:确认时一声 success;动画完成再一声 chime(两个时刻,owner 待确认是否嫌多)
- [ ] 首次回家:一声 chime(每存档一次)
- [ ] 拆包裹(邮局):起手玻璃碎裂声 + 揭晓 chime;十连抽逐个拆不串音

### 全局
- [ ] 任意按钮点击:ui-click 一声 —— **注意:目前会叠合成 blip(P1-2),听到"电子嘀+啪"两层属已知问题**
- [ ] 设置滑条「音效音量」:拉 0 后合成音(chime/error)消失,但 OGG 音(技能/摸摸)**仍在**(P1-1 已知缺陷,记现象)
- [ ] 错误横幅:低沉 error 声
- [ ] 键盘 Tab+Enter 按按钮:无声(P2-1 已知缺口)

## 7. 本会话已修复(勿重复报)

| 项 | 修复 | 位置 |
|---|---|---|
| 波次音按用户要求不接 | useBattleSfx 摘除 wave diff | useBattleSfx.ts |
| 摸摸声重叠 | playSfx 加第 4 参独占组,摸摸走 'pet' 组 | core/sound.ts:6-30, scene.ts:1061-1063 |
| 呼噜过长 | 音源裁至 1.5s 尾部淡出,原地替换 | web/public/assets/sfx/cat-purr.mp3 |
| 变速不变调 | playSfx 设 audio.preservesPitch=false(rate 契约本是升降调;银铃缓行顺带修正) | core/sound.ts:21-23 |

### 7.1 只读测试窗口核验结果(2026-11-11,机检+少量实测)

- 覆盖:B 组 24 项 + S 组 6 项中 **28 项通过**(4 项浏览器 spy 实测实证:B-01/05/06/09,其中 108 条 attack-hit 最小间隔 151ms 限频零违规;其余代码核验)。
- **ISSUE-1(P3,已修)**:AUDIO-CREDITS.md:20 把 `skill-ice-shimmer` 误写为 `skill-ice-shatter`(第一波笔误)——已更正。
- **ISSUE-2(P2,brief 判据错,非代码问题)**:B-10 原预期"暂停/继续零条目"与全局按钮音设计冲突(暂停/继续就是 btl-play-toggle 同一按钮)——brief 已改为"按钮各 1 条 ui-click,拖动/悬停零条目"。
- **ISSUE-3(P3,已知行为,不改)**:同帧批量漏怪合并为 1 条 battle-leak(状态 diff 按 tick;同 URL 覆盖语义下连播 N 次也是 1 声,无听感差异)——brief B-08 已注明,不修代码。
- 测试窗口的重要排除:实测败战 0 条 battle-leak 疑点,经代码核验为"猫全退场"败因路径而非漏怪音缺失,leaks 接线正常。
- B-03 口径修正:无任何一场战斗同时拥有全部 8 技能(设计如此),判据改为"本场可施放技能全有声"。

## 8. 新窗口接手须知(同步信息)

**当前状态**:main `6ac8cbf`(wave1 已上线);本地分支 `feat/skill-sfx`(旧名)上有**未提交**的 wave2 改动:11 文件修改 + 3 新文件
(web/src/modules/battle/shared/useBattleSfx.ts、web/public/assets/sfx/cat-meow.mp3、cat-purr.mp3)。
根目录 3 个未跟踪文件(**SFX-WAVE2-HANDOFF.md、SFX-AUDIO-TEST-REPORT.md、design/events/demo-script.md、docs/business-metrics-survey.md**)是工作文档,**不提交**。

**验证状态**:tsc 零错误;683 battle 测试全绿;`npm run check`(content/api/architecture/typecheck/测试/go vet/go test/build)全绿;ARCHITECTURE.md 无需再生(shared/ 是既有目录)。

**提交计划(用户已确认方向,尚未执行)**:
```bash
git checkout -b feat/sfx-wave2          # 从当前 HEAD(=main 6ac8cbf)开
git add web/src/modules/battle/shared/useBattleSfx.ts web/src/modules/battle/{chapter,market,greenhouse,tunnel,finale,l00} web/src/ui/DiceRollOverlay.tsx web/src/modules/lottery/PostalJournal.tsx web/src/modules/home/{FurnitureBackpack,HomeRepairOverlay}.tsx web/src/examples/demo/scene.ts web/src/core/sound.ts docs/AUDIO-CREDITS.md
git commit -m "feat: wire remaining game sound cues"   # body 中文列要点
git add web/public/assets/sfx/cat-meow.mp3 web/public/assets/sfx/cat-purr.mp3
git commit -m "feat: add petting cat sounds"          # 或并入上一条,用户曾倾向两个 commit
git push origin feat/sfx-wave2
```
注意:`git add` 集合**不含**三个工作文档;push 前先 `git diff --staged` 给用户过目(团队硬性规范)。

**MR 流程**(照 SFX-WAVE2-HANDOFF.md §6):分支 feat/sfx-wave2 → push → GitLab API 建 MR(令牌 `C:\Users\asus\.zcode\secrets\xsolla-gitlab-api.token`,**仅限 school-gitlab.xsolla.dev,PRIVATE-TOKEN 头,项目路径 `haozhe_wang%2Fstray-kitty`,不回显不进 git**)→ 409=已有 MR 先查重 → 轮询流水线 → merge → main 流水线到 manual → 找 deploy_apply job → play → 健康检查 https://starry-kitty.duckdns.org/healthz → 删源分支 → 本地清理。

**MR description 要点(用户要求写进)**:四段式"已加上/还没加上/验证/边界";**必须包含**:P1-1 滑条缺口与 P1-2 双击音作为已知问题移交 owner;preservesPitch 修复对银铃缓行的正向副作用(给 battle owner 知会);摸摸音源 Mixkit 协议与裁剪;**无玩家可见文案改动**(仅代码注释与 AUDIO-CREDITS 文档);未接线清单引用本报告 §5。

**其他**:用户 GitHub 私人镜像 `github` remote,**用户开口才推**;完成后按惯例问用户是否归档学习总结(D:\game-ai-journey\learning-progress.md)。
