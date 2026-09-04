<!-- meta: summary="r34 全局统计面板设计：新增第三卡 #global-stats（最高分同源镜像+累计方块/消行/时长/次数），既有 .stat-grid 与 #session-stats 两冻结契约逐字不动；「本局组」= 既有两卡合的得分/等级/消行/已放置/时长；S 竖屏 #main areas 纯追加 'global' 行 3+2 mini-grid（高度预算 +68px）；全部复用既有 token/stat-flash，零新增关键帧。" -->

# r34 全局统计持久化 — DESIGN（统计面板「本局 + 全局」双组展示）

> **基线**：docs/teamflow/20260903-r32-stats-panel（本局组三项会话指标语义/布局零回归）+ r33（即时前序）。本设计为**增量扩展**，不取代任何既有设计条目；唯一有意的语义调整（突破 r32「统计不入持久化」非目标）已在 PRD §1 声明，DESIGN 聚焦展示面，不复述。

## 0. 设计结论速览

- **形态定稿**：统计面板由两卡变三卡——**既有两卡逐字不动**（`.stat-grid` 恰 4 块 `.stat` 断言 + `#session-stats` 恰 3 行 `.session-stat` 断言，均为 r17/r32 冻结契约，AC-10 旧期望零改动红线），**纯追加第三卡** `#global-stats.global-stats`（全局统计）于 `#session-stats` 闭合之后、`.hold-well` 之前。
- **「本局组 / 全局组」落位（AC-8）**：「本局组」= 既有两卡合计——得分/等级/消行（`.stat-grid` 的 #score/#level/#lines）+ 已放置/时长（`#session-stats` 的 #ss-placed/#ss-time），全部会话实时、新局归零；「全局组」= 新增 `#global-stats` 五项——最高分（**与 #hi-score 同源镜像**）+ 累计方块/累计消行/累计时长/对局次数，随入账/补记时点刷新。
- **刻意设计声明①（最高分双处显示）**：`.stat-grid` 中的 #hi-score 块属冻结契约（禁移动/改名/重排），其全局语义由 `#global-stats` 首行同源镜像承担——沿 r32「消行总数 / 消除行数 同值并列」先例，靠分组标题区分语境。
- **刻意设计声明②（S 竖屏高度预算）**：`#main` areas 追加 `'global global global'` 行（既有行相对顺序 stats→session→controls 作为子序列不变），3+2 两行 mini-grid，高度成本 ≈+68px（r32 已预算 −34px 之上再 −68px）；TECH 须复核 `#board` 可玩高度（估算 375×667：526→≈458px，等比仍可玩，P1 人工核对）。
- **红线落实**：零新增设计 token / 零新增动画关键帧（复用既有 `stat-flash`）；`.stat-grid` / `#session-stats` 的 DOM 与规则体逐字不动；S 竖屏 `#main` areas **仅追加一行**、既有四区名不动；`#session-announce` 播报文本断言冻结（r34 不新增播报）；全局统计**不进 game 快照**（AC-1 不追加快照字段），UI 只读镜像 persist 层数据。

## 1. 模块与信息架构

### 1.1 左信息面板信息架构（增量）

```
#panel-left（信息面板；玻璃面板，flex 列 gap 20px）
├─ .stat-grid（对局统计：分数 / 最高分 / 等级 / 消除行数 —— 冻结契约，零改动）
├─ #session-stats.session-stats（【既有·r32】本局统计：已放置 / 消行总数 / 对局时长 —— 冻结契约，零改动）
├─ #global-stats.global-stats 【新增·r34】全局统计（最高分 / 累计方块 / 累计消行 / 累计时长 / 对局次数）
└─ .hold-well（Hold 预览 —— 既有，零改动）
```

- **职责**：纯展示（持久化累计过程指标）；无可交互控件、无新设置项、无模式切换、无音效、不参与计分（PRD §3 范围对齐）。
- **数据边界（设计关键）**：全局统计**不属于引擎快照**（game.js 快照键集冻结，AC-1/AC-9）；其值为持久化载荷镜像（persist.js 单键 + saveStats 出口），UI 经**入账/补记事件**刷新，**禁止 UI 侧独立累计**（沿 r32 单计数源红线）。

### 1.2 「本局组 / 全局组」字段映射（AC-8 落位核对表）

| 组 | 字段 | 物理载体（DOM） | 更新时点 | 持久化 |
|---|---|---|---|---|
| 本局组 | 得分 | `#score`（stat-grid 冻结块） | 实时（既有） | 否（会话内存） |
| 本局组 | 等级 | `#level`（stat-grid 冻结块） | 实时（既有） | 否 |
| 本局组 | 消行 | `#lines`（stat-grid 冻结块） | 实时（既有） | 否 |
| 本局组 | 已放置方块数 | `#ss-placed-value`（session-stats 既有） | 落定实时（r32） | 否 |
| 本局组 | 本局时长 | `#ss-time-value`（session-stats 既有） | 每秒（r32） | 否 |
| 全局组 | 最高分 | `#gs-hi-value`（新增，镜像 #hi-score 同源） | 破纪录时点 / 入账后整组刷新 | 是（既有 highScore 字段） |
| 全局组 | 累计已放置方块数 | `#gs-placed-value`（新增） | 入账 / 补记时点 | 是 |
| 全局组 | 累计消行总数 | `#gs-lines-value`（新增） | 入账 / 补记时点 | 是 |
| 全局组 | 累计游戏时长 | `#gs-time-value`（新增） | 入账 / 补记时点 | 是（毫秒整型） |
| 全局组 | 对局次数 | `#gs-games-value`（新增） | 入账时点 | 是 |

> 注：`.stat-grid` 中的「最高分」块物理上落在本局组区域中间，属冻结契约留存；其全局语义由全局组首行同源镜像承担（声明①）。

### 1.3 命名与分组约定（对齐 r32）

| 容器 | `.global-stats` `role="group" aria-label="全局统计"` | 平行 `.session-stats`（aria-label=本局统计） |
|---|---|---|
| 行 | `.global-stat`（5 行） | 平行 `.session-stat`（3 行） |
| 标题 | `<h3 class="global-stats__title">全局统计</h3>` | 平行 `session-stats__title` |
| 值 | `<output>` + `aria-label` 完整语义名 | 平行先例 |

- 可见标签 ≤4 字（**最高分 / 累计方块 / 累计消行 / 累计时长 / 对局次数**，S 档 3 列可容）；`aria-label` 用完整名（最高分 / 累计已放置方块数 / 累计消行总数 / 累计游戏时长 / 对局次数），与 PRD 指标名一一对应——沿 r32「已放置（aria=已放置方块数）」缩写先例。
- 「最高分」双处同值（stat-grid 冻结块 + 全局组镜像）= **刻意设计**（同源恒等，沿 r32「消行总数」并列先例）。

## 2. 线框描述（按档位）

### 2.1 DOM 结构【新增·r34】（纯追加，`#session-stats` 闭合之后、`.hold-well` 之前）

```html
<div id="global-stats" class="global-stats" role="group" aria-label="全局统计">
  <h3 class="global-stats__title">全局统计</h3>
  <div id="gs-hi" class="global-stat">
    <span class="global-stat__label">最高分</span>
    <output id="gs-hi-value" class="global-stat__value" aria-live="polite" aria-label="最高分">0</output>
  </div>
  <div id="gs-placed" class="global-stat">
    <span class="global-stat__label">累计方块</span>
    <output id="gs-placed-value" class="global-stat__value" aria-live="polite" aria-label="累计已放置方块数">0</output>
  </div>
  <div id="gs-lines" class="global-stat">
    <span class="global-stat__label">累计消行</span>
    <output id="gs-lines-value" class="global-stat__value" aria-live="polite" aria-label="累计消行总数">0</output>
  </div>
  <div id="gs-time" class="global-stat">
    <span class="global-stat__label">累计时长</span>
    <output id="gs-time-value" class="global-stat__value" aria-live="polite" aria-label="累计游戏时长">00:00</output>
  </div>
  <div id="gs-games" class="global-stat">
    <span class="global-stat__label">对局次数</span>
    <output id="gs-games-value" class="global-stat__value" aria-live="polite" aria-label="对局次数">0</output>
  </div>
</div>
```

初值：装配时从 persist 载荷读入（缺省 0 / 00:00;最高分行与 #hi-score 同源——同一载荷字段），**不经引擎快照**。

### 2.2 基座 / 桌面 L 与 M（非触屏 ≥600 面板列；S 竖屏以外的通用形态）

- **布局**：`.global-stats` = flex 列 `gap: var(--sp-1)`；标题行 + 5 行明细。每行 `.global-stat` = flex `align-items: baseline; justify-content: space-between`，**label 左、mono 值右**（镜像 .session-stat，r32 行式先例）。
- **分组感**：标题「全局统计」`--fs-xs/600/0.08em 大写/--muted` + `border-bottom: 1px solid var(--line)` + `padding-bottom: var(--sp-2)`；行内不加分隔线（5 行少，靠 gap）。
- 卡位：`#panel-left` flex 列中第三子卡（session-stats 之后、hold-well 之前），无叠压。
- M 档（§7.3/§7.4）侧列：继承基座行式，**§7.3/§7.4 规则零改动**（侧列高度充足）。

### 2.3 S 竖屏（portrait <600，行式底栏触控形态）

- **#main 网格**：areas 在 `'session session session'` 与 `'controls controls controls'` 之间**追加一行** `'global global global'`；`grid-template-rows` 由 `auto auto auto minmax(0,1fr)` → `auto auto auto auto minmax(0,1fr)`。既有行相对顺序（stats→session→controls→hold/board/next）保持子序列，r19「`hold board next`」与 r32「含 session 行」断言仍命中（均为块内子串匹配，TECH 复验）。
- **面板**：`.global-stats { grid-area: global; }`；5 项走 **3 列 mini-grid 两行（3+2）**：`repeat(3, minmax(0,1fr)) gap: var(--sp-3)`，第 1 行 = 最高分/累计方块/累计消行，第 2 行 = 累计时长/对局次数（grid 自动排布左→右填满，第 4 槽起换行）；每列 `.global-stat` flex 列（label 上/值下，与上方 anatomy 对齐），值 `--fs-lg`（18px ≥16 可读性红线）。行高 ≈34px，两行 + gap ≈ 68px。
- **避让**：无横向冲突（设置钮在 stats 行同带，本卡在其下）；行式底栏（controls）冻结语义不变，仅整体下移一行。

### 2.4 S 横屏（landscape <600）与横屏双轨【声明】

- **S 横屏布局**：`.global-stats` 以**自包含玻璃卡**呈现（独立规则复刻 r32 session 卡四件套：`--glass-bg` + `blur(20px) saturate(140%)` + `--line` 描边 + `--radius-md` + `--sp-3` 内距 + `margin: var(--sp-2) 0`，宽/最大宽 `100% / max-width 420px`），排列于 `#session-stats` 卡之下；**不进既有卡化选择器列表**（保既有规则体字节不变，r32 惯例）。卡内 3 列 mini-grid 两行（同 §2.3），标题隐藏。高度成本 ≈70px。
- **横屏双轨声明**：沿 r32 §2.4 结论——has-touch + 横屏 <1024 由 r30 旋转锁屏遮罩（`#rotate-overlay`）全屏接管，本卡与玩法同层被遮罩覆盖属 r30 既定行为，**不新增轨道内布局**；≥1024 触控横屏无触控键、走面板布局（§2.2），无叠压。

### 2.5 状态（面板 × 游戏四态【新增·r34 语义，纯只读】）

| 游戏态 | 本局组（既有两卡，零改动） | 全局组（#global-stats） |
|---|---|---|
| READY / 初始（新局） | 五项归 0，时长 00:00 | 持久化原值显示（不变） |
| RUNNING | 实时（得分/等级/消行/落定+1/每秒秒数） | 四项累计**不变**；最高分行随破纪录实时同源升（镜像 #hi-score 更新路径） |
| PAUSED | 停表定格 | **不变**（暂停不计，不补记） |
| OVER 定格 | 五项定格（r32 语义） | **一次性入账**（次数+1、累计 += 定格值，幂等）→ 整组刷新并持久化 |
| 隐藏 / 卸载（进行中且未暂停） | 会话随页丢弃（预期行为） | 补记当前局时长并入累计并持久化（幂等，只记一次） |
| 重开页面 | 归零 | 读单键载荷恢复显示（旧载荷四项按 0 起步，AC-3） |

## 3. 交互与动效

- **交互面**：无新增可交互控件 / 设置项 / 模式切换；生命周期补记（visibilitychange / pagehide / beforeunload）对用户透明（PRD §4）。暂停语义与既有完全一致（暂停不计时长，不触发补记）。
- **数据流**：全局组组件只读渲染——入参来自 persist 层数据快照（`saveStats` 出口回读 + 入账/补记事件携带载荷）；`update({hi, placed, lines, timeMs, games})` 由「入账 / 补记」事件驱动（TECH 定挂接点：引擎 opaque 入账回调或 persist 变更回调）；**禁** UI 读 localStorage、禁 UI 侧独立累计（漂移红线，AC-4）。最高分行挂入既有 #hi-score 更新路径（破纪录时点），与 stat-grid 同帧更新、同源恒等。
- **更新频率**：四项累计 = 事件驱动（入账/补记时点，每局至多 1 次 OVER 入账 + 若干补记，低频）；最高分行 = 破纪录时点；**无每秒刷新**（与 session 时长每秒刷新的语义区分，也天然防读屏刷屏）。
- **动效**：四项累计变化 → 复用 `flash()`（`.is-flashing` 挂 `.global-stat` 行 + `stat-flash` 120ms，css 行 363-374）；最高分行 → 复用既有 #hi-score 闪动路径。**零新增关键帧**（红线）；`prefers-reduced-motion` 下动画 none（镜像 r32 行）。
- **时长格式**：累计时长沿用 `formatSessionTime`（`mm:ss`，≥1h 自动 `hh:mm:ss`，前导零）——与 r32 本局时长同函数同格式（PRD AC-8「时长格式沿 r32」）。

## 4. 视觉规格

### 4.1 Token 复用（零新增 token，r29/r31/r32 惯例）

`--fs-xs`（标签/标题）、`--fs-lg`（值）、`--font-mono`（值）、`--font-ui`、`--ink`（值）、`--muted`（标签/标题）、`--line`（标题分隔/卡描边）、`--glass-bg` + blur、`--radius-md`、`--sp-1/2/3/5`、`--font-variant-numeric: tabular-nums`（沿用 `.stat__value` 写法，防数字宽度抖动）。**不新增**任何颜色/阴影/半径/字号/动画 token。

### 4.2 组件规格【新增·r34】（独立类名，视觉对齐既有块）

- 基座：`.global-stats` 无卡化（透明面板直挂 #panel-left flex 列，gap 20px 承接）；`.global-stats__title` / `.global-stat__label` / `.global-stat__value` 逐字镜像 `.session-*` 对应规则（font-size/weight/letter-spacing/uppercase/color/mono/tabular-nums/line-height 同款）。
- S 竖屏：`.global-stat.is-flashing .global-stat__value { animation: stat-flash 120ms ease-out; }`（镜像 r32 行 2175）+ reduced-motion 变体。
- S 横屏：自包含玻璃卡四件套（§2.4）。

### 4.3 各档位尺寸核对（写死前验算）

- 桌面行式：label 最长「累计时长」4 字 12px×4 ≈ 48px；值最长 `12:34:56`（8 字符 mono 18px ≈ 86px）；行宽 ≈ 140px ≤ 200px（240 面板 − 40 padding）✓。
- S 竖屏 320px：3 列 ≈ (320−24×2)/3 ≈ 90px/列；label 4 字 ≈48px ✓、值 `12:34:56` ≈86px ≤ 90px ✓；两行行高 ≈ 34×2 + gap ≈ 68px，`#main` 多一行后棋盘再约 −68px（375×667 估 526→≈458px，等比仍可玩；P1 人工项目测，TECH 复核 `#board` max-height 预留 `calc(100vh - ...)`）。
- S 横屏卡：宽 100% / max-width 420px，3 列 mini-grid 两行。

## 5. 可访问性

- **语义**：容器 `role="group" aria-label="全局统计"`（平行 session-stats 先例）；5 个值 `<output>` + `aria-label` 完整指标名；标题 `<h3 class="global-stats__title">`（h 序列核对：h1 标题 → h2 overlay/settings → h3 组标题，与 session-stats__title / settings-group__title 同级，序列无破坏——TECH 复验）。
- **aria-live**：4 项累计 + 最高分行 `aria-live="polite"`（**低频事件更新**——入账/补记为每局 ≤ 数次，破纪录低频；沿用 r32 已放置/消行 polite 先例）。读屏不刷屏：全局组**无每秒刷新**，不新增任何播报；`#session-announce` 及其文本断言冻结（r32 AC-14 机制零改动）；P1 人工抽查读屏朗读新面板文本不刷屏。
- **动效降级**：`prefers-reduced-motion` 下 `.global-stat.is-flashing` 动画 none（镜像 r32）。
- **对比度 / 可读性**：沿用既有 token（label --muted / 值 --ink），值字阶 ≥16px（--fs-lg 18px），tablular-nums 防抖动；S 档 3 列下 label 4 字不截断。

## 6. 改动面与契约（意图层，TECH 细化）

| 文件 | 改动 |
|---|---|
| `index.html` | **纯追加** `#global-stats` 卡（`#session-stats` 闭合后、`.hold-well` 前）；stat-grid / session-stats 逐字不动 |
| `style.css` | **纯追加** `.global-*` 规则：基座（镜像 session 行式）/ `order: 13`（599px 档，槽位 12 与 20 之间）/ S 竖屏 `grid-area: global` + areas 追加一行 + 3+2 mini-grid / S 横屏自包含卡 / reduced-motion。既有规则体零动 |
| `ui.js` | 新增 `createGlobalStats` 组件（签名平行 `createSessionStats`，纯只读镜像，入参 = persist 载荷快照 + 入账/补记事件）；装配锚点 `must()` ×5（#gs-hi-value / #gs-placed-value / #gs-lines-value / #gs-time-value / #gs-games-value）；最高分行挂 #hi-score 更新路径（复用既有 flash）；**既有 createHud/createSessionStats 逻辑零改** |
| `persist.js` | 增量：stats 字段 + `saveStats` 出口（AC-2/3，TECH 细化：单键载荷、PAYLOAD_VERSION=1、清洗、降级） |
| `game.js` | 入账/补记通道 + 幂等标记（AC-4/5/6/7；沿用 r32 计数源与计时器，不新造计数；**快照键集不变**） |
| 验证 | **纯追加** §r34 段：verify-ui（#global-stats 节点契约：位置序 stat-grid<session-stats<global-stats<hold-well、恰 5 行 .global-stat、role/aria、S 档 areas 含 global 行、order:13、flash 复用 stat-flash、卡化列表不含 .global-stats）、verify-persist（AC-2/3）、verify-game（AC-1/4/5/6/7）、qa-e2e（面板双组快照 + 补记幂等 + 刷新不丢）。**既有断言期望零改动** |

## 7. 风险与验收备注

| 风险 | 对策 |
|---|---|
| S 竖屏高度预算再 −68px 压缩棋盘 | 设计声明：3+2 两行 mini-grid 为 AC-8「全部档位可见」最小成本方案；TECH 复核 `#board` 可玩高度；若验收方裁定不可接受，备选 = 全局卡合入 session 行区域（须另行评估 r32 断言影响，**不默认采用**）；P1 人工项目测 |
| 最高分双处显示的「同源恒等」漂移 | 最高分行与 #hi-score 同一载荷字段、同帧更新（声明①）；P1 人工核对破纪录时两处同步 |
| 既有 areas/order 断言被误伤 | areas 纯追加一行 + order 13 槽位，既有子串断言（r19 `hold board next`、r32 session 行、order:12）均保持命中；TECH 先登记再改（AC-10） |
| 读屏刷屏 | 全局组无每秒刷新 + polite 低频先例；`#session-announce` 零改动；AC-11 P1 人工抽查 |
| S 横屏卡不进既有卡化列表导致样式重复 | 沿 r32 自包含卡惯例（独立规则体，保既有字节不变）；`verify-ui §r34` 源码级断言列表不含 `.global-stats` |

<!-- state -->{"phase":"design","summary":"r34 统计面板设计定稿：第三卡 #global-stats（最高分同源镜像+累计方块/消行/时长/次数五项）纯追加于 #session-stats 后 .hold-well 前，既有 .stat-grid（.stat 恰4）与 #session-stats（.session-stat 恰3）两冻结契约逐字不动；「本局组」=既有两卡合的得分/等级/消行/已放置/时长（AC-8 落位表），「全局组」=新卡，最高分双处同源恒等为刻意声明；桌面/M 行式明细镜像 session 行式，S 竖屏 areas 纯追加 'global' 行 +3+2 mini-grid（高度预算+68px，TECH 复核棋盘），S 横屏自包含玻璃卡不进卡化列表；全局统计不入 game 快照、UI 只读镜像 persist 载荷、四项累计随入账/补记事件低频刷新（+polite，天然防读屏刷屏）、#session-announce 零改动；动效全复用 .is-flashing+stat-flash，零新增 token/关键帧；改动面=index.html/style.css/ui.js 纯追加+persist/game 增量（TECH 细化）。","memory":["r34 形态：两冻结契约卡（.stat-grid 恰 4 块 .stat、#session-stats 恰 3 行 .session-stat，verify-ui r32 断言）=两卡合计构成「本局组」；新增第三卡 #global-stats=「全局组」五项（最高分与 #hi-score 同源镜像+累计方块/消行/时长/次数），纯追加挂载点 session-stats 闭合<global-stats 开<hold-well 开","DOM 契约：#global-stats role=group aria-label=全局统计 + h3 标题 + 恰 5 行 .global-stat，可见标签≤4字（最高分/累计方块/累计消行/累计时长/对局次数），output aria-label 用完整指标名（沿 r32 缩写先例）；值 mono --fs-lg + tabular-nums","布局四档：桌面/M=行式明细（label左 mono值右）卡三；S竖屏=#main areas stats/session/global/controls/hold board next 纯追加一行+grid-template-rows 4 auto、3+2 mini-grid 两行（行高≈34px×2+gap≈68px，棋盘 526→≈458px 预算）；S横屏=自包含玻璃卡（不进既有卡化选择器列表）3+2 mini-grid；order:13 槽位（12 与 20 之间）","时长与动效：累计时长沿用 formatSessionTime（mm:ss/≥1h hh:mm:ss）；四项累计变化复用 .is-flashing+stat-flash 120ms（零新增关键帧），最高分行挂既有 #hi-score 更新路径；prefers-reduced-motion 动画 none","数据与可访问性：全局统计不进 game 快照（AC-1 键集冻结）、UI 只读镜像 persist 载荷、禁独立累计；全局组随入账/补记事件低频刷新（polite 不刷屏）、无每秒刷新、#session-announce 文本断言冻结；h3 序列 h1→h2→h3 无破坏","改动面（意图层）：index.html 纯追加卡、style.css 纯追加 .global-*（基座/order13/S竖屏 areas+grid-area/mini-grid/S横屏卡/reduced-motion）、ui.js 新增 createGlobalStats（签名平行 createSessionStats，must()×5 锚点）、persist.js 增量 stats+saveStats、game.js 入账/补记+幂等；验证纯追加 §r34 段，既有断言期望零改动"]}<!-- /state -->