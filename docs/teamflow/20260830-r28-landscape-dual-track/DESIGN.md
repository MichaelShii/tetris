# r28 横屏双轨十字布局（landscape-dual-track）DESIGN

<!-- meta: summary="r28 设计：横屏（has-touch、任意宽度）恒走左右双轨十字——仅放宽 style.css 横屏侧轨媒体门控（移除 and (max-width:599px)），键径/轨宽/皮肤挂点/三态/键位全承继 r26/r24，十字键零改动（DOM 源序+r27 互换后 nth-child grid-area 映射天然一致：上=软降/下=硬降）；竖屏 M/L 行式底栏（基座 .touchpad + r27 order 冻结）与 S dock、桌面非触控零变化；零新增 token/动画" -->

基线依赖：docs/teamflow/20260830-r27-dpad-hard-soft-swap（十字键 上=softDrop/下=hardDrop 互换语义、.tkey[data-action] ↔ TOUCH_KEYS 六值契约、M/L 行式底栏键序冻结逻辑不得回归；交互基线承继 r16 三态/touch-action、r21 has-touch 门控与 z-index 盖键、r24 双簇结构、r26 .rail 元素化与皮肤挂点）。

取代：docs/teamflow/20260829-r26-touchpad-keys-dock-skin#AC-3（M/L 横屏恒行式底栏裁定 R-D1）→ 横屏任意宽度恒走左右双轨十字；其 DESIGN §2.3 侧轨结构/§4.3 皮肤挂点/§4.4 四皮肤承载沿用不取代。

> 本迭代为**布局作用域裁定变更**，非重设计：TOUCH_KEYS 契约、六键功能、四皮肤语义、`dockSkin` 持久化全部保持。下列条目按【修订】标注变化处，未标注者维持 r26/r27/r24 现状。**核心结论：十字键行为与视觉零改动（DOM 源序 + 既有 nth-child grid-area 映射已锁定 r27 互换语义），唯一 CSS 变化是横屏侧轨媒体查询的宽度门控放宽。**

---

## 1. 模块与信息架构

单页应用，本次仅 1 处媒体查询门控变化，改动面收口到最小：

| 模块 | 本次状态 | 说明 |
|---|---|---|
| 顶栏 / 棋盘区 / 面板布局 | 不改 | 桌面键鼠视觉零变化（AC-4）；S/M/L 面板断点不调整（非目标） |
| **触控操作区** `#touch-controls` 横屏分支 | 【修订】 | 门控放宽：横屏任意宽度走双轨（AC-1） |
| 竖屏 M/L 行式底栏（≥600px 竖） | 不改 | 基座 `.touchpad` 玻璃行式栏 + r27 order 冻结键序（AC-3） |
| 竖屏 S dock（<600px 竖） | 不改 | 3×3 十字簇 + 纵列主键簇，r27 互换语义（AC-3） |
| 桌面非触控 | 不改 | `html.has-touch` 门控下不渲染，零视觉变化（AC-4） |

**信息架构**：不变——单屏 `#touch-controls` 内含 `.rail--l`（左轨十字簇）+ `.rail--r`（右轨 Hold/旋转簇）；横屏侧轨与竖屏/行式栏共用同一 DOM（`.rail` 基座 `display:contents` 中性化），本次不改 index.html 结构。

**作用域总表（横屏四分支裁定重述，AC-1/3/4）**：

| 分支 | 布局 | 键帽正圆 | 旋转主键 | 四皮肤 | 轨/底 | 十字键位语义 |
|---|---|---|---|---|---|---|
| S 竖屏 dock（<600px 竖） | r24 双簇 | ✅ | ✅ | ✅ | 皮肤类 | 上软降/左/右/下硬降（r27） |
| **横屏侧轨（任意宽度横）【修订】** | **双轨 rail--l/rail--r** | ✅ | ✅ | ✅（挂 `.rail`） | 皮肤类 | 上软降/左/右/下硬降（r27，天然一致） |
| M/L 行式底栏（≥600px 竖） | 底部一行六键 | ❌ | ❌ | ❌ | 恒 `--glass-bg` | 硬降 左 右 软降 Hold 旋转（r27 order 冻结） |
| 桌面非触控 | 无触控区 | — | — | — | — | 键盘操作 |

> **取代声明**：r26 表中「手机横屏侧轨（<600px 横）」分支的宽度下限取消，与 S 竖屏不构成映射——原 M/L 横屏恒行式裁定作废，行式底栏仅保留于竖屏。

## 2. 线框描述

### 2.1 横屏双轨（has-touch，任意宽度）【修订 · 仅门控，规则体零动】

```
┌─────────────────────────────── 横屏（任意宽度，取代 <600px 门控）───────────────────────────────┐
│[.rail--l]  border-right:1px --line  中列板框(居中于 [212, vw−212]，≥600px 宽屏余量更大)   [.rail--r]
│ 左轨≈212px  bg rgba(35,35,45,.45)    （宽屏下中列不再贴 599px 下沿，余量自然放大）        │右轨≈104px
│  ┌十字 56×56 grid 3×3 gap10┐                                                    border-left:1px    │
│  │ .  软降(▼) . │            │  底贴 safe-area-inset-bottom；左右贴 inset-left/right     │ ┌Hold 48 正圆┐
│  │ ◀   ✛   ▶  │            │  z-index:var(--z-touchpad)、键 z-index:1 盖轨（r21 承继）  │ └──────────┘ │
│  │ .  硬降(⤓) . │            │                                                          │ ┌旋转 80 常亮环┐
│  └──────────────────┘          │                                                          │ └────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **门控（本次唯一修订点）**：`style.css` §5.5 `@media (orientation: landscape) and (max-width: 599px)`（r26 R-D1）→ **`@media (orientation: landscape)`**（移除宽度上限）。效果：横屏任意宽度（含 ≥600px 宽屏/平板横屏）的 `#touch-controls` 走本双轨规则块。
- **桌面零影响（AC-4）**：`.touchpad` 基座 `display:none` 且仅 `html.has-touch` 时才 `display:flex`——门控放宽只作用于触屏设备，键鼠桌面不渲染触控区，视觉零变化。
- **键位语义（AC-1/2，零改动）**：十字键 DOM 源序（index.html）为 `softDrop → moveLeft → moveRight → hardDrop`，横屏与竖屏共用同组 nth-child grid-area 映射（`.tkey:nth-child(1)→up / 2→lf / 3→rt / 4→dn`）→ **上=软降、下=硬降自动成立，与竖屏 r27 互换后语义逐位一致**；左右=横移、中心 ✛ 装饰（无 data-action、`pointer-events:none`、`aria-hidden` 三层保险承继）。
- **布局与尺寸（AC-1，全承继）**：左轨 `.rail--l` ≈212px（3×56+2×10+2×12）、右轨 `.rail--r` ≈104px（80+2×12）、轨高 188px、键径 56/48/80、gap 10、单边描边（左轨右 / 右轨左）、`border-radius:var(--radius-md)`、底 `rgba(35,35,45,.45)`、safe-area 四边贴边——与 r26 侧轨块逐字节相同。
- **宽屏行为（≥600px 横屏）【裁定延伸】**:中列板框仍居中于 `[212, vw−212]`，宽度越大中列余量越大、无任何新增约束；板面布局沿用既有 M/L 面板规则（本次不触碰 §7 板面媒体查询——S 横屏 599px 板面块与侧轨门控是两条独立媒体查询，仅侧轨门控放宽）。
- **皮肤（AC 承继）**：四皮肤规则挂 `.rail--l/.rail--r`（`--skin-glass/float/fade/pod`），因门控放宽天然扩展到宽屏横屏，视觉语义与 S dock 一致；M/L 行式底栏不染皮肤（恒 `--glass-bg`）的既有裁定照旧。

### 2.2 竖屏 M/L 行式底栏（≥600px 竖）【零变化】

保持 r26/r27 现状：基座 `.touchpad`（1043–1056）玻璃底栏——`left/right/bottom:0` 双簇横排、恒 `--glass-bg` + blur(20px) saturate(140%) + 上描边 + 上投影；键序由 r27 order 规则冻结为 **硬降 左 右 软降（+Hold 旋转右簇）**，`order` 规则天然只作用于行式栏（十字簇 grid-area 对其无效）。横屏下本行式栏不再出现（被侧轨块覆盖），竖屏完全不受影响。

### 2.3 竖屏 S dock（<600px 竖）【零变化】

3×3 十字簇（64/96/56 标准档、56/80/48 紧凑档）+ 右纵列 Hold/旋转，r27 互换语义成立，不赘述。

## 3. 交互与动效

| 场景 | 行为 | 动效 |
|---|---|---|
| 键按压（r16 三态，承继） | 描边转 `--primary`、标签转 `--accent-hi`、辉光 `::before` opacity 0→1、`scale(0.94)` | transform 60ms / border·color 120ms / glow opacity 120ms（r24 定稿值） |
| 横竖屏切换（orientationchange） | 纯媒体查询接管：横屏双轨 ↔ 竖屏 dock/行式栏自动切换，无 JS、不重置对局 | 无过渡动画（即切即现，承继） |
| 宽屏横屏按压 | 与窄横屏完全一致（同规则块、同按键尺寸） | 同上 |
| 多指/触摸（承继） | `touch-action:none`、`-webkit-tap-highlight`、`user-select` 防误触；键 z-index:1 盖轨（r21 修复） | 无 |
| 桌面键鼠 | 全部承继既有行为，触控区不显示 | 无 |

**零新增动画**；`prefers-reduced-motion` 全局裁剪承继。

## 4. 视觉规格

### 4.1 Token 复用（零新增色板/阴影/半径 token）

| 用途 | Token / 值 | 说明 |
|---|---|---|
| 键帽底/描边 | `--surface-2` / `--line` | 圆形玻璃键帽，不变 |
| 键帽辉光 | `--glow-primary`（`::before`） | 三态承继 |
| 键图标/标签 | `--ink` / `--muted`（按压 `--accent-hi`） | 不变 |
| 旋转主键 | `color-mix(var(--primary) 55%, transparent)` 常亮环 + `16%` 微底 + 图标 `--primary-hi` | r26 定稿，不变 |
| 侧轨底/单边描边 | `rgba(35,35,45,0.45)` / `--line` | 不变 |
| 玻璃底栏（M/L 竖屏） | `--glass-bg` + blur(20px) saturate(140%) + `--line` 上描边 + 上投影 | 不变，恒写不染皮肤 |
| 圆角/层级 | `--radius-md` / `--z-touchpad` | 不变 |

### 4.2 尺寸规格（横屏侧轨，全承继）

| 项 | 值 |
|---|---|
| 键径 | 左十字 56 / 右 Hold 48 + 旋转 80（gap 10） |
| 左轨 `.rail--l` | ≈212px（单边右描边） |
| 右轨 `.rail--r` | ≈104px（单边左描边） |
| 轨高 | 188px（3×56+2×10） |
| 字号（横屏再缩一档） | 图标 16/13/24、标签 10/9/11；旋转图标 24px `--primary-hi` |

### 4.3 四皮肤 × 承载（横屏作用域随门控自然延展）

| 皮肤 | 侧轨挂点（r26 定稿，不改） |
|---|---|
| A · 玻璃 dock | `.rail--l/.rail--r` 整面板 `--glass-bg` + blur + 单边描边保留 |
| B · 无底浮键 | 轨底透明，仅键帽投影 |
| C · 渐隐托盘（默认） | 轨内底部渐入渐变（不画整带） |
| D · 双簇座舱 | 两簇光环托 `--primary-glow` 系（静态 gradient） |

### 4.4 作用域约束（裁定重述）

门控放宽后，皮肤/正圆/旋转主色规则**只消费**「S 竖屏 dock + 横屏侧轨（任意宽度）」两条分支；M/L **竖屏**行式底栏恒玻璃；桌面零变化（AC-4/AC-5 红线）。

## 5. 可访问性

- **键语义（承继）**：六键 `aria-label` 双语标签自说明（软降/左移/右移/硬降/Hold 暂存/旋转）；✛ 中心 hub `aria-hidden="true"` + 无 data-action + `pointer-events:none` 三层保险，不入读屏、不产生可聚焦节点。
- **尺寸**：横屏键径 56/48/80 ≥ 44px 最小点击目标（AC-12 基线），宽屏横屏同规格。
- **按压辨识**：描边+标签色+辉光三信号，不依赖颜色单通道（承继）。
- **safe-area**：横屏双轨上下左右四边贴 `env(safe-area-inset-*)`（承继）；与竖屏 dock/行式栏各自独立避让。
- **读屏/焦点**：门控放宽不改变 DOM 结构与 aria 语义（横屏双轨与 S dock 同一 DOM），读屏树对横屏设备无新增或缺失节点；桌面 `:focus-visible` 键盘焦点环不变。

## 6. 改动面与契约（实现指引，TECH 细化）

- **style.css（唯一代码改动）**：§5.5 横屏侧轨媒体查询 `@media (orientation: landscape) and (max-width: 599px)` → `@media (orientation: landscape)`（行 1321）；规则体（键径/轨宽/皮肤/正圆/常亮环/字号）零动；更新该块注释（取代 R-D1 裁定声明）。其余 2000 行 CSS 零 diff。
- **index.html / ui.js / persist.js / game.js / audio.js**：0 diff（AC-5 红线）。
- **verify-ui.cjs**：横屏侧轨门控与行式底栏判定断言改写（横屏分支改恒双轨判定，取代 r26#AC-3 门控断言）+ 新增 §r28 段（AC-6）。
- **qa-e2e-jsdom.cjs**：追加 §r28 横屏双轨断言（双轨存在、键位映射、≥600px 横屏不落行式栏）（AC-6）。
- **红线复核**：VERSION 不动、TOUCH_KEYS 与回放器 0 逻辑改动、七套脚本全绿、r24/r26/r27 既有断言零回归（AC-5/6）。

---

<!-- state -->{"phase":"design","summary":"r28 DESIGN 已交付任务夹：横屏（has-touch、任意宽度）恒走左右双轨十字——唯一 CSS 改动是 style.css §5.5 横屏侧轨媒体查询门控 `@media (orientation: landscape) and (max-width: 599px)` → `@media (orientation: landscape)`（行 1321），取代 r26#AC-3 M/L 横屏恒行式裁定；规则体（左轨≈212/右轨≈104、键径 56/48/80、轨高 188、单边描边、四皮肤挂 .rail、safe-area 四边、z-index 盖键、三态动效）全承继零动；十字键零改动（DOM 源序 softDrop→moveLeft→moveRight→hardDrop + 横竖屏共用 nth-child grid-area 映射 → 上=软降/下=硬降天然一致）；竖屏 M/L 行式底栏（基座 .touchpad + r27 order 冻结键序恒玻璃）与 S dock 零变化、桌面由 html.has-touch 门控保证零影响；>=600px 宽屏横屏中列余量自然放大无新增约束；零新增 token/动画；index.html/ui.js/persist/game/audio 0 diff，改动面仅 css+verify-ui/qa-e2e 断言", "memory":["r28 设计核心裁定：横屏侧轨门控 = 唯一代码变化，`and (max-width: 599px)` 移除后横屏任意宽度恒双轨（取代 r26#AC-3 R-D1）；规则体与键位全承继，十字键零改动","十字键键位一致性根因：DOM 源序 softDrop/moveLeft/moveRight/hardDrop + 横竖屏共用 nth-child grid-area 映射 → 上软降/下硬降自动成立，r27 互换语义零额外工作","作用域重述：皮肤/正圆/旋转主色仅消费 S dock + 横屏双轨两分支；M/L 行式底栏仅存竖屏（恒 --glass-bg、r27 order 冻结键序）；桌面 non-touch 由 html.has-touch display 门控零影响","宽屏横屏（>=600px）无新增约束：中列板框居中 [212, vw-212] 余量自然放大；S 横屏 599px 板面媒体查询与侧轨门控是两条独立查询，仅侧轨门控放宽、面板断点不调整","改动面红线：style.css 仅 1321 行门控+注释；index.html/ui.js/persist/game/audio 0 diff；verify-ui 门控断言改写 + §r28 段、qa-e2e 追加 §r28 双轨断言；VERSION 不动、TOUCH_KEYS/回放器 0 逻辑改动、七套全绿"]}<!-- /state -->