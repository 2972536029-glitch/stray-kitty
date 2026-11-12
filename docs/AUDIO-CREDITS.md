# 音频来源(AUDIO CREDITS)

游戏音效来自 [Kenney](https://kenney.nl) 的 CC0 音频包,可自由使用(含商用),无需署名;本文件作为来源记录保留。

| 包 | 数量 | 协议 | 来源 |
|---|---|---|---|
| Interface Sounds | 100 | CC0 | https://kenney.nl/assets/interface-sounds |
| Impact Sounds | 130 | CC0 | https://kenney.nl/assets/impact-sounds |
| RPG Audio | 52 | CC0 | https://kenney.nl/assets/rpg-audio |
| Music Jingles | 86 | CC0 | https://kenney.nl/assets/music-jingles |

## 使用位置(web/public/assets/sfx/)

| 文件 | 源文件(原始名) | 用途 |
|---|---|---|
| skill-shield-clang | impactTin_medium_000 | 罐盖护盾施放 |
| skill-fury-slam | impactPlate_heavy_000 | 栗盾奋击施放 |
| skill-claw-growl | Mixkit「Angry cartoon kitty meow」(#94,免登录直下,Mixkit License 免费商用) | 橘影连爪起手猫吼 |
| skill-claw-1/2/3 | drawKnife1 / knifeSlice / knifeSlice2 | 橘影连爪三连刀爪音 |
| skill-bell-frost + skill-ice-shimmer | impactBell_heavy_000 + impactGlass_medium_001 | 银铃缓行施放(铃响后三声递升冰叮) |
| skill-star-sparkle | impactGlass_light_001 | 星绒绽放施放 |
| skill-heal-chime | jingles_STEEL10 | 安心呼噜施放(钢片琴治疗叮音) |
| skill-night-swell | question_002 | 夜视护行施放 |
| skill-lantern-swoosh / -shatter | cloth1 / impactGlass_heavy_001 | 巡光护行挥扫+清棘 |
| boss-slam | impactPunch_heavy_000 | 首领技能重砸 |
| attack-hit | impactPunch_medium_000 | 普攻命中(useBattleSfx 按章过滤 kind,150ms 限频) |
| wave-start | question_001 | (预留)波次音——用户听后不要,暂不接线 |
| battle-leak | error_004 | 漏怪警告(useBattleSfx) |
| battle-win / battle-lose | jingles_NES00 / jingles_NES13 | 战斗胜利/失败 |
| dice-roll | tick_002 | 事件掷骰 |
| result-crit / success / partial / fail | jingles_HIT00 / confirmation_001 / pluck_001 / error_002 | 事件四档结果(掷骰仪式揭晓,DiceRollOverlay) |
| ui-click / select / back / open / close | click_001 / select_005 / back_001 / open_001 / close_001 | 全局按钮等 UI 音(已接点击音) |
| skill-lantern-shatter(复用) | impactGlass_heavy_001 | 邮局包裹拆开演出(PostalJournal openParcel) |
| skill-star-sparkle(复用) | impactGlass_light_001 | (预留)抽到稀有闪光——抽卡暂无稀有档位,待 rarity 字段后接 |
| ui-select(复用) | select_005 | 家具摆放确认(FurnitureBackpack 放入场景/确定位置) |
| result-success(复用) | confirmation_001 | 花房修缮完成(HomeRepairOverlay) |
| cat-purr | Mixkit「Big wild cat long purr」(#96,免登录直下,Mixkit License 免费商用;裁至 1.5s 尾部淡出) | 摸摸开心=呼噜(home pokeHomeCat,'pet' 独占组) |
| cat-meow | Mixkit「Sweet kitty meow」(#93,免登录直下,Mixkit License 免费商用) | 摸摸平静=喵;irritated 降调 0.75 复用同文件(home pokeHomeCat) |

## 背景音乐(web/public/assets/bgm/)

以下 MP3 配乐按场景与阶段分曲循环播放，并可在花房「游戏设置 → 花房背景音乐」点播已解锁曲目。

| 文件 | 曲目 | 场景 / 解锁条件 |
|---|---|---|
| title-first-stars.mp3 | 暮夜初星 (`First_Stars_In_The_Evening.mp3`) | 标题主界面（默认解锁） |
| prologue-tall-grass.mp3 | 草丛轻音 (`Notes_in_the_Tall_Grass.mp3`) | 序章 · 金枪鱼事件 |
| alley-rain-streetlights.mp3 | 雨与街灯间 (`Between_Rain_and_Streetlights.mp3`) | 第一章 · 雨夜小巷 |
| market-midnight-lanterns.mp3 | 午夜集市灯笼 (`Midnight_Market_Lanterns.mp3`) | 第二章 · 午夜集市 |
| home-paws-quiet.mp3 | 寂静爪印 (`Paws_in_the_Quiet.mp3`) | 花房 · 初建阶段（1–2 阶） |
| home-sunlight-floorboards.mp3 | 木板日光 (`Sunlight_on_the_Floorboards.mp3`) | 花房 · 温馨阶段（3–4 阶） |
| tunnel-steps-arch.mp3 | 拱洞足音 (`Steps_Beneath_the_Arch.mp3`) | 第四章 · 地下暗道 |
| warehouse-locked-threshold.mp3 | 封锁门扉 (`The_Locked_Threshold.mp3`) | 终章 · 废弃大仓库 |
| lottery-stamps-starlight.mp3 | 邮票与星光 (`Stamps_and_Starlight.mp3`) | 来信寄送与拆包柜台（邮局界面） |
| battle-tiny-brigade.mp3 | 小小猫卫队进行曲 (`March_of_the_Tiny_Brigade.mp3`) | 全关卡守护防线战斗 |
