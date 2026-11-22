# 音效测试指令(给只读测试窗口)

> **你的角色**:你是一个**只读**测试会话。你不修改任何文件、不 commit、不修复;
> 你执行测试、收集证据、按 §5 格式输出问题报告(作为聊天消息输出,由用户带回给修复窗口)。
> 测试对象:`C:\Users\asus\.zcode\workspace\draft-77bf19d0-e626-4548-b57d-49a707907805\stray-kitty` 的**当前工作树**
> (含未提交的音效第二波改动;main=`6ac8cbf`)。背景(可选读):根目录 `SFX-AUDIO-TEST-REPORT.md`(审计报告)、`SFX-WAVE2-HANDOFF.md`(任务交接)。
>
> **重要认知**:声音无法被"听"。本测试验证的是**触发调用与参数**(哪条音频被调、音量/速率/次数/时序/互斥),
> 不是扬声器出声。方法 = 页面内埋 play() 监听器 + 断言日志。听感主观项(如"胜利音像失败")不在你范围内,已由用户人工裁决。

## 0. 环境准备

1. 确认服务存活:`http://127.0.0.1:5017` 可打开、`http://127.0.0.1:8017/healthz` 返回 ok。
   **若服务没起:不要自己启动(你没有运行权限的约定)——在报告里记"环境不可用"并跳过全部运行时项,只做 §4 静态项;同时提醒用户手动 `npm run dev`。**
2. 用无痕/干净浏览器档打开 `http://127.0.0.1:5017`(避免旧音频缓存干扰判断;测试本身不依赖听到声,缓存只影响加载)。
3. 进入游戏:标题页点击进入 → 按序章引导走(l00 教学战 → 雨巷探索 → 救纸箱猫 → 家园)。卡关/到不了的场景,该项记 `SKIP(不可达)`,不要硬绕。
4. 每次进入页面或刷新后,**先装监听器再操作**(§1 的 spy 在 `play()` 调用时记录,无需声音真的播出)。

## 1. 安装 SFX 监听器(每个测试项之前确保已装)

在浏览器 JS 控制台(或你的浏览器工具的 evaluate)执行:

```js
(() => {
  if (window.__sfxLog) return 'already';
  window.__sfxLog = [];
  const orig = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    window.__sfxLog.push({ t: Date.now(), src: this.src, vol: this.volume, rate: this.playbackRate, el: this });
    return orig.call(this);
  };
  return 'installed';
})()
```

辅助命令:

```js
window.__sfxClear = () => { window.__sfxLog.length = 0; };          // 每个测试项前清空
window.__sfxSince = (ms) => { const cut = Date.now() - ms;
  return window.__sfxLog.filter(e => e.t >= cut)
    .map(e => ({ f: e.src.split('/').pop(), vol: e.vol, rate: e.rate })); };
```

说明:项目里还有一套 WebAudio 合成音(ui/useAudioManager 的 chime/click blip 等),**Audio 元素监听不到它们**;
合成音相关项标注为"参考证据"(可选补装 createOscillator 记录器,见 §3-A 组),最终以用户人耳确认为准。

## 2. B 组:文件音效(playSfx/OGG/MP3)——逐项步骤与断言

通用规则:每项开始 `__sfxClear()` → 按步骤操作 → 立即 `__sfxSince(15000)` 取证据 → 对照"预期"。
**预期列就是判定标准;不一致 → 记 ISSUE(§5 格式)。**

### 战斗(进任意守护战;技能在猫咪菜单能量满 100 后点击释放)

| # | 操作步骤 | 预期(`__sfxSince` 结果) |
|---|---|---|
| B-01 | 进战斗点「开始守护」按钮 | 恰好 1 条 `{f:'ui-click.ogg', vol:0.3}`(合成 blip 另有,spy 看不到) |
| B-02 | 把一只猫能量挂满(每模拟秒+5),点技能球施放 | 按技能名播对应音(§3 映射表),vol=0.6;序列技能(橘影连爪/银铃缓行/巡光护行)为多条、间隔 ~90ms |
| B-03 | 逐一施放**本场战斗拥有的全部技能**(各章技能数不同:序章 2/一章 4/市场 6/花房 6/隧道 6/终章 6,全 8 种需跨章凑齐) | 每种都有对应音;**任何一个可施放技能零音频 = ISSUE(P2-6 静默失声)** |
| B-04 | 银铃缓行施放 | 4 条:bell-frost + ice-shimmer×3,rate 分别 1/1.25/1.5(修 preservesPitch 后真升调) |
| B-05 | 等首领放重砸(举路障→落地) | 每次落地恰 1 条 `boss-slam.ogg vol:0.55`;举伞预告阶段不响 |
| B-06 | 普攻命中(猫与黑影交战,观察 30 秒) | `attack-hit.ogg vol:0.35` 多条;**相邻两条间隔 ≥150ms**(限频断言:取 t 值算差) |
| B-07 | 施放技能的瞬间 | **不出现** attack-hit(skill/heal/slam/boss-attack kind 已过滤;若技能时也响 = ISSUE) |
| B-08 | 故意放 1~2 只黑影过线 | 每次过线 1 条 `battle-leak.ogg vol:0.5`;同帧(同一 50ms 发布 tick)漏两只合并为 1 条——状态 diff 按 tick 判定,同 URL 覆盖语义下无听感差异,已知行为非缺陷 |
| B-09 | 打赢/打输一场 | 恰 1 条 `battle-win.ogg` 或 `battle-lose.ogg`,vol:0.5;结算界面停留期间不重复播 |
| B-10 | 战斗中:①点速度切换按钮;②点暂停/继续(与「开始守护」是同一个 btl-play-toggle 按钮);③拖动猫咪;④悬停地格 | ①②各恰好 1 条 `ui-click.ogg vol:0.3`(全局按钮音,设计如此);③④**零新增条目**(canvas 指针操作无音) |
| B-11 | 撤离/重开同一关(数值回落) | 重开瞬间**无** leak/attack/wave 类残留触发 |

### 事件(探索踩到随机事件;dev 模式顶栏「验收」工具可跳事件,优先用它)

| # | 操作步骤 | 预期 |
|---|---|---|
| B-12 | 选一个选项掷骰 | 立即 1 条 `dice-roll.ogg vol:0.45`;~2.3s 后揭晓 1 条 `result-<tier>.ogg vol:0.5`(tier=crit/success/partial/fail 与画面档位一致) |
| B-13 | 至少见到 partial 与 fail 各一次(重掷可刷) | 各自 `result-partial.ogg` / `result-fail.ogg`;**无**旧合成 chime/meow 叠加(合成 spy 参考) |

### 家园/花房(回家;摸猫 = 点击场上的猫)

心情规则:摸摸压力值每次+1、隔 3s 回落 1、隔 9s 重置为 1;300ms 内连点不触发。喵喵(miaomiao)/墨墨(momo)第一摸固定是平静。

| # | 操作步骤 | 预期 |
|---|---|---|
| B-14 | 摸一只醒着的普通猫(团子/点点),此前 9s 没摸过 | 1 条 `cat-purr.mp3 vol:0.5 rate:1` |
| B-15 | 摸睡觉(吊床)或吃饭的猫第一下 | 1 条 `cat-meow.mp3 vol:0.45 rate:1` |
| B-16 | 醒着的猫按 ~0.5s 节奏连摸 4 下 | 第 1~2 下 purr(普通猫),第 3 下 meow,第 4 下 `cat-meow.mp3 vol:0.45 rate:0.75`(降调抗议) |
| B-17 | B-14 之后 1.5s 内立刻触发 B-15 类条件 | **前一个音频元素 paused===true**(独占组断言:`__sfxLog` 里 purr 条目的 `el.paused === true`;若仍 false = 重叠回归) |
| B-18 | 300ms 内疯狂连点 | 仅第一次出条目(防抖);无爆量条目 |
| B-19 | 布置模式:点「放入场景」和「确定位置」各一次 | 各 1 条 `ui-select.ogg vol:0.4 rate:0.8`;拖动/取消/撤销不响 |
| B-20 | 修缮一个部位(确认时) | 确认瞬间 1 条 `result-success.ogg vol:0.5`(动画完成时的合成 chime spy 看不到,记录即可) |
| B-21 | 邮局抽 1 份 → 拆单包裹 | 起手 1 条 `skill-lantern-shatter.ogg vol:0.4`;十连逐个拆不串音 |

### 全局

| # | 操作步骤 | 预期 |
|---|---|---|
| B-22 | 设置滑条「音效音量」拉到 0,然后点任意按钮、摸猫 | **ui-click.ogg 与 cat-meow.ogg 仍然出条目**(=P1-1 缺口复现:OGG 不受滑条控制);把滑条恢复 |
| B-23 | 键盘 Tab 聚焦按钮后按 Enter/Space | **零新增条目**(=P2-1 键盘缺口复现) |
| B-24 | 出错误横幅(可用断网/非法操作触发,难则 SKIP) | 参考:合成 error 音(spy 不可见),OGG 无条目 |

## 3. 附录:技能名 → 期望音频映射(判 B-02/03/04 用)

| 技能名 | 期望文件(按序) |
|---|---|
| 星绒绽放 | skill-star-sparkle.ogg |
| 罐盖护盾 | skill-shield-clang.ogg |
| 橘影连爪 | skill-claw-growl.mp3 → skill-claw-1/2/3.ogg(4 条序列) |
| 安心呼噜 | skill-heal-chime.ogg |
| 栗盾奋击 | skill-fury-slam.ogg |
| 银铃缓行 | skill-bell-frost.ogg → skill-ice-shimmer.ogg(rate 1/1.25/1.5)(4 条序列) |
| 夜视护行 | skill-night-swell.ogg |
| 巡光护行 | skill-lantern-swoosh.ogg → skill-lantern-shatter.ogg(2 条序列) |

## 4. 静态核对项(不需要浏览器,只读文件即可)

| # | 核对 | 期望 |
|---|---|---|
| S-01 | `web/src/core/sound.ts` | playSfx 第 4 参 group;`audio.preservesPitch = false` 存在 |
| S-02 | `web/src/modules/battle/shared/useBattleSfx.ts` | 只有 leaks + attack 两类 diff,**无 wave-start** |
| S-03 | `web/src/examples/demo/scene.ts` pokeHomeCat | 三分支均带 `'pet'` 组参数 |
| S-04 | `web/public/assets/sfx/` | cat-meow.mp3 与 cat-purr.mp3 存在;31 个音频文件 |
| S-05 | 全 `web/src` grep 中文文案 diff 面 | 触摸得到的用户可见字符串与 main 无差异(仅代码注释/文档变化) |
| S-06 | `docs/AUDIO-CREDITS.md` | 每个在库音频都有来源行;wave-start 标注"暂不接线" |

## 5. 问题输出格式(严格遵守,修复窗口靠它定位)

每个问题一条,顺序输出;最后附通过清单与汇总表。**只报事实与证据,不要给修复方案**(方案由修复窗口定);
不要修改任何文件;证据里的 JSON/日志原样贴。

```
### ISSUE-<序号> <一句话概括>
- 项: <清单编号,如 B-16 / S-02>
- 严重度: P1(功能坏/回归)| P2(与预期不符)| P3(瑕疵)
- 预期: <照抄本指令"预期"列>
- 实际: <__sfxSince 输出原样 JSON,或静态核对的文件:行号摘录>
- 复现步骤: <从哪个界面、什么顺序操作>
- 备注: <是否稳定复现(试了几次)、是否与环境有关>
```

结尾三段:
1. `### 通过项`:`B-01 ✅、B-02 ✅…`(全部列出,含 SKIP 及原因)
2. `### 汇总`:`共测 N 项,通过 X,问题 Y(Z 个 P1),跳过 W`
3. `### 环境`:浏览器/是否无痕、服务是否中途挂过、测试总耗时

## 6. 排障

- 条目全是空的:确认 spy 安装返回 'installed';确认操作发生在**安装之后**(刷新会丢 spy,重装)。
- `Audio play() rejected` 属正常(浏览器自动播放策略),spy 记录的是"调用发生",不受影响。
- 服务挂了:提醒用户 `npm run dev`,别自己起。
- 事件/结局难触发:用 dev 顶栏「验收」工具;仍不可达就 SKIP,不要伪造结果。
