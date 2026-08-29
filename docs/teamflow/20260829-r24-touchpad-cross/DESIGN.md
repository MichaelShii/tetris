# 触控操作区重设计 DESIGN（掌机十字 + 旋转簇 + 背景四方案）

<!-- meta: summary="r24 触控区设计：S 竖屏 dock 重排为左十字簇（上硬降/左横移/右横移/下软降/中心✛纯装饰）+ 右旋转簇（Hold 上/旋转下），标准 64/96/56·紧凑 56/80/48·键距12(紧凑10)；横屏侧轨左十字右Hold+旋转（56/80/48）贴safe-area零遮挡；操作区背景四方案(A玻璃/B浮键/C渐隐默认/D座舱)设为设置弹层新「外观」组、即时生效+持久化+非法回退，作用域仅S dock+横屏侧轨、M/L恒玻璃；互动沿用r16三态(scale改0.94)、零新增色板/动画，AC-14/15 可访问性与token一致" -->

基线依赖：docs/teamflow/20260829-r23-back-to-back-multiplier（视觉/交互/动效规范沿用，B2B 计分与 Toast 视觉零触碰）；触控层基线承继 r16（触屏三态/键盘回放器/守卫/token 体系）、r19（一屏零滚动五行骨架/随流 dock）、r21（has-touch 门控/侧轨 z-index）、r9（设置弹层毛玻璃/分组结构）。

取代：docs/teamflow/20260828-r19-mobile-board-first#AC-3 —— S 竖屏 dock 六键单行 48px 随流排布 → 掌机式左十字 + 右旋转簇（详见 §3.1）。互动语言本身不取代：r16 三态反馈、`touch-action:none`、safe-area、多指并发、DAS/软降 repeat 全数承继。

**实施唯一视觉依据**：用户已评审设计稿 `docs/teamflow/drafts/20260829-touchpad-cross-design-draft.html`（标准档、紧凑档、横屏、四套背景均已确认）。本文件将其固化为实现规格；冲突时以 PRD AC 与设计稿为准。

---

## 1. 模块与信息架构

单页结构不变；仅触控区模块与设置弹层分组变化（对局视口骨架承继 r19 五行，如下）：

```
┌─ 行1 header（TETRIS + 状态点）          ─ r19 现状，本次零改动
├─ 行2 统计行 + ⚙ 设置钮（#btn-settings）  ─ r19 现状，本次零改动
├─ 行3 系统钮行（开始/暂停/重新开始）       ─ r19 现状，本次零改动
├─ 行4 棋盘区（Hold | 板框 | 分数）        ─ r19 现状；行高随 dock 让高（flex:1）
└─ 行5 触控 dock（#touch-controls.touchpad）─ 【r24】双簇重排（本设计核心）
横屏： rail--l(十字) | 中列(sysrow+板框) | rail--r(Hold+旋转)  【r24】侧轨重排
设置弹层 settings-modal： 音频组 | 辅助组 | 【r24】外观组（操作区背景四档）
```

控制点：
- S 竖屏 dock 为**随流行**（非 fixed，r19 约定），双簇横排两端对齐；横屏拆为左右侧轨（r16 思路换十字布局）。
- 设置弹层新增「外观」分组（`settings-group--appearance`），置于辅助组之后；非触屏（has-touch=false，r21 判定）整组**不渲染**。
- 其余模块（统计行/系统钮/棋盘/遮罩/图例）DOM 与样式零改动。

## 2. 线框描述

### 2.1 S 竖屏 dock（标准档 64/96/56，键距 12）

```
┌──────────────────────────────────────────┐ padding 14/16 + safe-area
│      [⤓ 硬降]                             │
│  [◀左] [ ✛ ] [▶右]    [📦 Hold]          │
│      [▼ 软降]          [⟳ 旋转]          │
│   └── 左十字簇（grid 3×3）──┘ └右簇(纵列)┘ │
└──────────────────────────────────────────┘ 上缘：皮肤相关（§5.3）
```

- **左十字簇 `.tpad-cross`**：`display:grid; grid-template:64px×3 / 64px×3; gap:12px; grid-template-areas: ". up ." "lf hub rt" ". dn ."`。四个方向键为圆形玻璃键帽；中心 `hub` 为 ✛ 装饰（`aria-hidden`、`pointer-events:none`、无 `data-action`）。动作分配：up=硬降、lf=左移、rt=右移、dn=软降。
- **右旋转簇 `.tpad-main`**：纵向 `gap:12px`，上=Hold 卫星键（56px），下=旋转主键（96px，主色微底 + 常亮细环，全操作区最大接触面）。
- 六键 `.tkey[data-action]` 的 action 字面量、数量、顺序与 r16/TOUCH_KEYS 完全一致（零改名零重映射，AC-1）；ui.js 按 `data-action` 绑定，绑定逻辑 0 改动。

### 2.2 紧凑档（portrait && (width≤359 || height≤639) → 56/80/48，键距 10）

- 同一 DOM，纯 CSS 媒体查询覆盖尺寸变量（`.touchpad` 根定义标准档，两个媒体查询分支 `(orientation:portrait) and (max-width:359px)` / `(orientation:portrait) and (max-height:639px)` 覆盖为紧凑值），无 JS 切换。
- 320px 宽度验算（AC-4）：左右 padding 16×2=32 + 十字簇 3×56+2×10=188 + 右簇 80 + 簇间最小间距 16 = **316 ≤ 320** ✓ 横向零溢出。
- 高度：紧凑 dock 行高 ≈ 3×56+2×10 + 上 14 + 下 14+safe-area ≈ 222px；棋盘 `flex:1` 让高，矮屏（320×568/375×667）保持 r19 一屏零滚动（AC-5）。

### 2.3 横屏侧轨（AC-10）

```
┌──┬──────────────────────────────┬──┐
│⤓ │  行头(sysrow+⚙)              │📦│  rail padding 10/12 + safe-area 底部
│◀✛▶│  板框（中列，零遮挡）          │⟳│  键径按紧凑档：十字 56 / Hold 48 / 旋转 80
│▼ │                              │  │
└──┴──────────────────────────────┴──┘
```

- 左轨 `.rail--l`：十字（56px，gap 10）；右轨 `.rail--r`：Hold（48）上 + 旋转（80）下。
- 键径按 PRD AC-10 分派 56/80/48（取代设计稿内 52/76/46 的再缩值）；轨宽 = 十字 188 + padding 24 ≈ 212px，与中列板框零重叠；轨背景沿用 `rgba(35,35,45,0.45)` + 单边 `--line` 描边；底部 `padding-bottom: calc(… + env(safe-area-inset-bottom))`；`z-index: var(--z-touchpad)`（承继 r21 修复，不遮键）。

### 2.4 设置弹层「外观」组（AC-7）

- 新增分组 `settings-group--appearance`，置于辅助组之后；组标题「外观」（沿用 r9：`--fs-sm`/`--muted`/左对齐/下距 `--sp-2`）。
- 设置项「操作区背景」：**四档单选 segmented** —— A 玻璃 dock / B 无底浮键 / C 渐隐托盘 / D 双簇座舱，默认 C（选中态沿用既有选中视觉：微金描边/主色高亮）。
- 切换即时生效：仅替换 `#touch-controls` 上的皮肤类，不重载、不重置对局、引擎快照无漂移（AC-7）；选择写持久化，重开/刷新恢复（AC-8）。
- 持久化：persist 通道新增键 `tetris.dockSkin`（枚举 `glass|float|fade|pod`，默认 `fade`）；缺省/非法值回退 `fade`；无旧存档首装即默认 C（AC-8）。

## 3. 交互与动效

全部沿用既有语言，零新动效、零新速率常量：

| 项 | 规格 | 来源 |
|---|---|---|
| 按压反馈（r16 三态）| 描边 `--primary` + 标签转 `--accent-hi` + 辉光 `::before` opacity 0→1 + `scale(0.94)`；transition transform 60ms / border-color·color 120ms / glow opacity 120ms | 【r24】scale 0.94 改自 r16 0.96（设计稿定稿）|
| 辉光实现红线 | 走伪元素 `opacity`，**不动画 `box-shadow`** | 产品性能红线 |
| 触摸语义 | `touchstart`=keydown、`touchend`=keyup、`touchcancel`=复位；每键独立无互斥按钮 → 多指天然并行；长按 DAS/软降 repeat 复用引擎键盘路径既有机制 | r16 承继 |
| 防默认 | dock 与棋盘区 `touch-action:none`；触摸序列 preventDefault；`-webkit-tap-highlight-color:transparent` | r16 承继 |
| 皮肤切换 | 即时 class 替换、无过渡动画（设置项即时生效语义） | 【r24】|
| 入场动画 | dock 常驻，无入场动画；hover 仅 `(hover:hover)`；reduced-motion 全局规则兼容 | r16/r19 承继 |
| 设置弹层 | 打开/关闭 160ms ease-out、焦点陷阱、关闭后游戏状态不变 | r9 承继 |

## 4. 视觉规格

### 4.1 Token 复用（AC-15：零新增色板/阴影体系）

| 元素 | 复用 token |
|---|---|
| 键帽底/描边 | `--surface-2` / `--line`（圆形，radius 50%）|
| 图标/标签 | 图标 `--ink`、标签 `--muted`（按压态标签 `--accent-hi`）|
| 按压辉光 | `--glow-primary`（`::before`）|
| 旋转主键 | 底 `color-mix(in oklch, var(--primary) 16%, var(--surface-2))`（fallback `#363050`）、描边 primary 55%、常亮细环 `::after` 静态 `box-shadow:0 0 10px rgba(139,124,246,.22)`（非动画）|
| 玻璃 dock（A 皮肤）/M·L 底栏 | `--glass-bg` + `blur(20px) saturate(140%)` + `--line` 上描边 |
| ✛ 中心 | `rgba(154,154,172,.45)`，15px，letter-spacing 2px |
| 安全区 | `env(safe-area-inset-bottom)` |
| z-index | `--z-touchpad:5`（承继 r16/r21）|
| 尺寸 token | 【r24】`--tpad-key` 单值 → `--tpad-key-dir` / `--tpad-key-hero` / `--tpad-key-hold` 三元组 + 键距 |

字号沿用既有阶梯：键图标 19px（Hold 15 / 旋转 30）、键标签 11px（Hold 10 / 旋转 `--fs-sm`）；横屏侧轨再缩一档（图标 16/13/24、标签 10/9/11）。

### 4.2 尺寸规格（AC-2/AC-4/AC-10）

| 档位 | 触发 | 方向 | 旋转 | Hold | 键距 | 校验 |
|---|---|---|---|---|---|---|
| 标准 | portrait 且 (宽≥360 且 高≥640) | 64 | 96 | 56 | 12 | dock 行高 ≈ 248px |
| 紧凑 | portrait && (宽≤359 ∥ 高≤639) | 56 | 80 | 48 | 10 | 320px：316 ≤ 320 零溢出（AC-4）|
| 横屏侧轨 | landscape | 56 | 80 | 48 | 10 | 与紧凑档同径（AC-10，取代稿内 52/76/46）|

computed-size 实测与规格偏差 ≤1px（verify-ui 静态断言 ±1px）。

### 4.3 操作区背景四方案（AC-7/AC-9，皮肤类挂 `#touch-controls`）

| 皮肤 | 类 | 背景规则 | 得失（设计稿结论）|
|---|---|---|---|
| A 玻璃 dock | `.touchpad--skin-glass` | `--glass-bg` + blur + `--line` 上描边 + 上投影 | 区域感最强，但整条灰带显闷 |
| B 无底浮键 | `.touchpad--skin-float` | 去容器底/描边/投影；键帽自带 `0 6px 16px rgba(0,0,0,.5)` 投影 | 最透气，键帽轮廓略低 |
| **C 渐隐托盘（默认）** | `.touchpad--skin-fade` | 无描边；`linear-gradient(180deg, rgba(23,23,23,0), rgba(35,35,45,.82) 36%, rgba(26,26,34,.95))`，无 blur | 保留区域感又去硬切线，与深底自然融合 |
| D 双簇座舱 | `.touchpad--skin-pod` | 无整条底；十字/右簇各带一枚主色径向光环托（`::before`，十字 inset -16 圆、右簇 inset -18/-22） | 手柄感强，光环强度须克制 |

**作用域约束（AC-9）**：皮肤类规则只消费「S 竖屏 dock + 横屏侧轨」两条分支；M/L（≥600px）行式底栏背景**恒写 `--glass-bg`**（不依赖皮肤变量）→ 键盘桌面视觉零变化（AC-12）。皮肤类不含任何 `box-shadow` 动画（D 光环为静态 gradient，非动画）。

## 5. 可访问性（AC-14/AC-15）

- **目标尺寸**：全部触控键实测 ≥44px（最小为紧凑档 Hold 48px ≥ 44 ✓）；键距 12px（紧凑 10px）≥ WCAG 2.5.8 相邻目标建议。
- **键语义**：真实 `<button>` + `aria-label`（"左移"/"右移"/"旋转"/"软降"/"硬降"/"Hold 暂存"）；瞬时动作**不加** `aria-pressed`；✛ 装饰 `aria-hidden`、不入读屏、不产生任何输入/回放事件（AC-3）。
- **「外观」组键盘可达**：四档单选带 radio 语义（`role=radio`+`aria-checked` 或原生 radio），`:focus-visible` 沿用全局 `--accent` 2px 外环；非触屏桌面整组不渲染（AC-12）。
- **对比度**：`--ink`/`--surface-2`、`--accent-hi`/深玻璃均 ≥4.5:1（v2.9 §6 已验）；C 渐隐默认态不降低棋盘辨识度/对比度（AC-15）。
- **图例**：`.has-touch` 隐藏键盘图例（r16 AC-13 承继）；触屏键位自说明（图标+文字双层标签），键位含义与左右脑分区图例一致，不误导（AC-14）。

## 6. 改动面与契约（实现指引，TECH 细化）

- **index.html**：`#touch-controls` 内两簇 wrapper（`.tpad-cross` / `.tpad-main`），6 个 `.tkey[data-action]` 原样保留；设置弹层新增 `settings-group--appearance`（四档单选 + 组标题）。
- **style.css**：重写 `.touchpad` 布局块；`--tpad-key` → `--tpad-key-dir/-hero/-hold` 三元组 + 紧凑档两条媒体查询；4 个皮肤类；M/L 恒玻璃作用域约束。
- **ui.js**：`dockSkin` 设置项读写（枚举 `glass|float|fade|pod`，默认 `fade`），装配时挂类、设置弹层切换即时生效；触控绑定逻辑零改动。
- **persist.js**：`tetris.dockSkin` 白名单键 + 非法回退默认；沿用「能力探测失败降级内存」约定。
- **验证脚本（断言纯追加/登记改写）**：verify-ui（data-action↔TOUCH_KEYS 交叉、computed-size ±1px、紧凑断点、皮肤类↔枚举交叉、M/L 恒玻璃、外观组 has-touch 显隐）、qa-e2e（切换即时生效 + restart 保持、320px 零溢出、一屏零滚动、✛ 点击零事件）。
- **零改动红线**：game.js / audio.js 0 diff、VERSION 不动、回放器路径 0 逻辑 diff、TOUCH_KEYS 字面量不动、桌面视觉 0 变化。

---

<!-- state -->
{"phase":"design","summary":"r24 DESIGN 已交付：S 竖屏 dock 重排为左十字簇(grid 3×3, 上硬降/左右横移/下软降/中心✛纯装饰aria-hidden) + 右旋转簇(Hold上卫星56/旋转主键96主色微底+常亮细环)；标准64/96/56键距12、紧凑(portrait&&(宽≤359∥高≤639))56/80/48键距10纯CSS媒体查询无JS、320px验算316≤320零溢出、dock行高标准248/紧凑222、棋盘flex让高保r19一屏零滚动；横屏侧轨左十字右Hold+旋转按AC-10取56/80/48(取代稿内52/76/46)、贴safe-area零遮挡中列、z-index承继r21；操作区背景四方案(A玻璃/B浮键/C渐隐默认/D座舱)设设置弹层新外观组四档单选、即时class替换无动画、持久化tetris.dockSkin(glass|float|fade|pod)非法回退fade、作用域仅S dock+横屏侧轨、M/L恒玻璃；互动承继r16三态(scale改0.94)、touch-action/preventDefault/DAS复用全承继、辉光伪元素opacity不动画box-shadow；零新增色板token(仅尺寸token --tpad-key→dir/hero/hold三元)、AC-14(≥44px/radio语义/图例)AC-15(对比度C不降辨识度)；改动面index.html/style.css/ui.js/persist.js+验证脚本, game/audio 0 diff VERSION不动","memory":["r24 触控区重设计规格定稿：标准64/96/56键距12、紧凑56/80/48键距10(portrait且宽≤359或高≤639, 纯CSS媒体查询)、横屏侧轨56/80/48(AC-10取代稿内52/76/46)","左十字grid 3×3: . up . / lf hub rt / . dn .，上硬降左/右横移下软降，hub=✛ aria-hidden+pointer-events:none无data-action无输入事件","320px验算: 32 padding+188十字+80右簇+16间距=316≤320零溢出; dock行高标准≈248紧凑≈222; 棋盘flex:1让高保持一屏零滚动(承继r19 AC-1)","背景四方案皮肤类.touchpad--skin-glass/-float/-fade(默认)/-pod挂#touch-controls; 设置弹层新增外观组四档单选即时生效, persist键tetris.dockSkin(glass|float|fade|pod)非法回退fade, 作用域仅S dock+横屏侧轨、M/L恒--glass-bg零回归, 非触屏整组不渲染","互动承继r16三态(scale改0.94/transition 60ms)、touch-action:none+preventDefault+tap-highlight透明、DAS/软降repeat复用引擎、辉光走伪元素opacity不动画box-shadow、无入场动画reduced-motion兼容","token: 零新增色板, 仅尺寸token --tpad-key→--tpad-key-dir/-hero/-hold三元+键距; 可访问性=键≥44px(最小紧凑Hold48)+真实button+aria-label+✛aria-hidden+radio语义外观组+对比度沿v2.9§6已验","改动面: index.html两簇wrapper+外观组 / style.css重写.touchpad+紧凑媒体查询+4皮肤类+M/L作用域 / ui.js dockSkin读写即时切换 / persist.js白名单+非法回退; game.js audio.js 0 diff VERSION不动, 七套全绿出口, 设计稿docs/teamflow/drafts/20260829-touchpad-cross-design-draft.html为实施唯一依据"]}
<!-- /state -->