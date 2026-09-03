# r32 统计面板（stats-panel）DESIGN

<!-- 基线依赖：docs/teamflow/20260901-r31（自定义按键）+ docs/teamflow/20260830-r28（横屏双轨让位）+ r30（触控=键盘回放器、竖屏 S 行式底栏、旋转锁屏遮罩）；需求正文见同夹 PRD.md（一旗一夹，AC 编号以 PRD 为准） -->

## 0. 设计结论速览

- **形态定稿**：三项会话指标以**独立面板**呈现（非塞入 `.stat-grid`）——原因①PRD AC-6「纯追加、禁重排」；②硬约束：qa-e2e r17 断言 `.stat-grid` 内 `.stat` 恰为 **4** 个（`querySelectorAll('.stat').length === 4`）且 verify-ui 断言四块源序，追加块会打破既有断言（AC-12 旧断言零改动红线）。独立面板同时自然承接 P2 扩展（AC-15）。
- **面板命名**：`#session-stats.session-stats`（role=group，aria-label「本局统计」），三行 `session-stat`：**已放置**（`#ss-placed`）/ **消行总数**（`#ss-lines`）/ **对局时长**（`#ss-time`）。
- **布局策略**：桌面/M 档=左信息面板内**行式明细**（label 左、mono 值右，信息紧凑不挤宽）；S 竖屏=`#main` 网格追加一行 `'session session session'`（位于 stats 行与 controls 行之间）**三列 mini-grid**（label 上/值下，与上方四块 anatomy 对齐）；S 横屏=与既有卡化同款的独立玻璃卡。**横屏双轨形态零新增规则**（见 §2.4 声明）。
- **红线落实**：零新增设计 token / 零新增动画关键帧（复用既有 `stat-flash`）；audio.js / persist.js 0 行；onSfx 事件面不变；`.stat-grid` 规则体零改动；S 竖屏 `#main` grid 仅**追加一行**、既有四区名与细则不动。
- **读屏防刷屏（AC-14）**：已放置/消行沿用 `aria-live=polite` 先例（低频）；**时长值不设 aria-live**，另设视觉隐藏 `#session-announce`（role=status）仅**状态跳变**播报一次（新局/暂停/继续/OVER），每秒刷新零播报。

## 1. 模块与信息架构

### 1.1 单页信息架构（增量）

```
body
└─ #main
   └─ #panel-left（信息面板；玻璃面板，flex 列 gap 20px）
      ├─ .stat-grid（对局统计：分数/最高分/等级/消除行数 —— 零改动，q 4 块契约冻结）
      ├─ #session-stats.session-stats 【新增·r32】本局统计面板（已放置 / 消行总数 / 对局时长）
      ├─ .hold-well / .next-well / #btn-settings（零改动）
      └─ …（其余零改动）
```

- **纯追加**：`#session-stats` 作为 `#panel-left` 第 2 个子节点插入（紧贴 `.stat-grid` 之后、`.hold-well` 之前）；既有节点相对源序不变。DOM 结构见 §2.1。
- **职责**：纯展示（会话级过程指标），无可交互控件、无新设置项、无模式切换、不进入 persist、不参与计分、不发音效（PRD §3 范围内/非目标对齐）。

### 1.2 信息分组与命名（与既有约定对齐）

| 元素 | 类 | 与既有约定关系 |
|---|---|---|
| 容器 | `.session-stats` `role="group" aria-label="本局统计"` | 平行 `stat-grid`（role=group / aria-label=对局统计） |
| 行（×3） | `.session-stat` | 平行 `.stat`，但**独立类名**（不新增 `.stat` 与 `.stat__*`，保护 `.stat` 计数断言） |
| 标签 | `.session-stat__label` | 复用 `.stat__label` 视觉规范（--fs-xs/600/0.08em 大写/--muted） |
| 值 | `.session-stat__value` | 复用 `.stat__value` 规范（--font-mono + tabular-nums + --ink），取 --fs-lg |
| 播报 | `#session-announce`（role=status，视觉隐藏） | 复用 `role=status aria-live=polite` 先例（r31 提示 / #status） |

- 标签文案定稿：**已放置 / 消行总数 / 对局时长**（≤4 字，S 档 3 列可容）；三个 `<output>` 另设 `aria-label` 完整语义名（已放置方块数 / 消行总数 / 对局时长），与 PRD 指标名一一对应。
- 「消行总数」与上方「消除行数」同值显示为**刻意设计**（AC-3 同源恒等），靠行式明细面板 + 「本局统计」分组标题区分语境。

## 2. 线框描述（按档位）

### 2.1 DOM 结构【新增·r32】（纯追加，放 `.stat-grid` 之后）

```html
<div id="session-stats" class="session-stats" role="group" aria-label="本局统计">
  <h3 class="session-stats__title">本局统计</h3>   <!-- 基座/M 档显示；S 档隐藏 -->
  <div id="ss-placed" class="session-stat">
    <span class="session-stat__label">已放置</span>
    <output id="ss-placed-value" class="session-stat__value" aria-live="polite" aria-label="已放置方块数">0</output>
  </div>
  <div id="ss-lines" class="session-stat">
    <span class="session-stat__label">消行总数</span>
    <output id="ss-lines-value" class="session-stat__value" aria-live="polite" aria-label="消行总数">0</output>
  </div>
  <div id="ss-time" class="session-stat">
    <span class="session-stat__label">对局时长</span>
    <output id="ss-time-value" class="session-stat__value" aria-label="对局时长">00:00</output>  <!-- 无 aria-live，防刷屏 -->
  </div>
  <p id="session-announce" class="session-stat__announce" role="status" aria-live="polite"></p>  <!-- 视觉隐藏；仅状态跳变播报 -->
</div>
```

### 2.2 基座 / 桌面 L 与 M 平板（非触屏 ≥600 面板列；S 竖屏以外的通用形态）

- **布局**：`.session-stats` = flex 列 `gap: var(--sp-1)`；标题行 + 3 行明细。每行 `.session-stat` = flex `align-items: baseline; justify-content: space-between`，**label 左、mono 值右**。
- **为何行式**：240px 面板内容宽 ≈200px，3 列纵排下 `1:23:45`（7 字符 mono 24px）会溢出；行式（label 左/值右）宽度无压力、与上方四块大数字在视觉上形成「成绩 vs 会话明细」层级区分，信息密度更适合过程指标。
- **分组感**：标题「本局统计」用 `--fs-xs/600/0.08em 大写/--muted`（与 `.stat__label` 同款），`border-bottom: 1px solid var(--line)` + `padding-bottom: var(--sp-2)` 与下方行分隔；行内不再加分隔线（3 行少，靠 gap）。
- **状态**：初始 `0 / 0 / 00:00`；暂停三项冻结；OVER 定格；重开归零。数值变化复用 `${stat-flash}` 机制（见 §3）。
- M 档（§7.3/§7.4）：`#panel-left` 位于侧列，本面板继承基座行式布局，**§7.3/§7.4 规则零改动**（侧列高度充足，无叠压）。

### 2.3 S 竖屏（portrait <600，行式底栏触控形态）

- **网格**：`#main` grid-template-areas 由
  `'stats stats stats' / 'controls controls controls' / 'hold board next'`
  追加为
  `'stats stats stats' / 'session session session' / 'controls controls controls' / 'hold board next'`。
  既有四区名与「棋盘最后 1fr」语义不变（r19 断言 `'hold board next'` 为子串匹配，追加行不破坏——TECH 复跑确认）。
- **面板**：`.session-stats { grid-area: session; }` 收口竖屏作用域；三行切 **3 列 mini-grid** `repeat(3, minmax(0,1fr)) gap: var(--sp-3)`，每列 `.session-stat` flex 列（label 上/值下，与上方四块 anatomy 对齐），值 `--fs-lg`（18px ≥16 可读性红线，PRD AC-1/AC-4 文字可读）。行高 ≈ 34px。
- **标题隐藏**（竖屏窄宽下省高）；`.session-stat__announce` 同样隐藏文本仅留播报功能。
- **避让**：设置钮（`#btn-settings`）绝对定位于 `#main` 右上、与 stats 行同带（高 ≈40px）；本面板位于其下的新行，无横向冲突、无需 padding-right 避让。设置钮绝对定位规则零改动。
- **触控行式底栏 r30 语义**：仅新增 `'session'` 网格行，不触碰六键底栏 / TOUCH_KEYS / 回放器任何规则（AC-8）。

### 2.4 S 横屏（landscape <600）与横屏双轨【声明】

- **S 横屏布局**：`.session-stats` 以**自包含玻璃卡**呈现（独立规则复刻 §7.1 横屏卡化四项：`--glass-bg` + blur(20px) saturate(140%) + `--line` 描边 + `--radius-md` + `--sp-3` 内距），排列于 `.stat-grid` 卡之下、间距 `var(--sp-2)`，宽/最大宽与既有卡一致（100% / max-width 420px）；'''不加入既有卡化选择器列表'''（保既有规则体字节不变，r31「规则体零动」惯例）。卡内 3 列 mini-grid（同 §2.3）。标题隐藏。
- **高度成本**：≤60px/卡。**声明①**：has-touch + 横屏 + <1024 时 r30 旋转锁屏遮罩（`#rotate-overlay`，z=21）全屏接管、rep触摸键隐藏——该形态不下出对局画面，**面板与玩法同层被遮罩覆盖属 r30 既定行为**（AC-8 零触碰），不为此新增轨道内布局；玩家回竖屏后 OVER/重开数值由引擎会话态复原，无数据丢失。**声明②**：has-touch + 横屏 ≥1024（平板横屏）按 r30 规则不显示触控键、走面板布局（§2.2），无叠压。**结论：横屏双轨形态下本面板无需任何专门布局规则**（PRD AC-7「轨道内让位」以「双轨形态不出游戏视图」满足；若验收方期望双轨下可见，须独立裁定——见 §7 风险）。非触屏 S 横屏（边缘小窗）接受 ≤60px 板面压缩，TECH 复核 `#board` max-height 预留（`calc(100vh - 150px)`）是否需要同步放大。

### 2.5 状态（面板 × 游戏四态【新增·r32 语义，纯只读】）

| 游戏态 | 已放置 | 消行总数 | 对局时长 | 播报（#session-announce） |
|---|---|---|---|---|
| READY（未开始） | 0 | 0 | 00:00 | — |
| RUNNING | 落定实时 +1 | 随消行实时 | 每秒进位（暂停不计） | 新局起播报一次「计时开始」 |
| PAUSED | 冻结 | 冻结 | **停表冻结** | 播报「已暂停，对局时长 xx:xx」 |
| OVER | 定格 | 定格 | **定格最终值** | 播报「游戏结束，最终时长 xx:xx」 |
| 重开 / New Game | 归 0 | 归 0 | 归 0 重计 | 同 RUNNING 起播 |

## 3. 交互与动效

- **零新增交互控件**：无按钮、无焦点、无 Tab 进入、无键盘处理、无模式切换（PRD §4 交互流程摘要）。
- **数据流**：UI 只读渲染引擎快照——已放置=引擎**成功落定会话计数**（软/硬/自然各计 1；Hold/移动/旋转/悬浮 0；单一计数源，AC-2）；消行总数=引擎 lines 快照（与 `#stat-lines` 同源恒等，AC-3）；时长=引擎会话有效秒数（新局 0 起、暂停冻结、OVER 定格、≤1s 墙体容差，AC-4）。**禁止 UI 侧独立累计**（漂移红线）。
- **更新频率**：已放置/消行=事件驱动（lock/clear 帧）；时长=**每秒**（秒进位才写文本；无 rAF 逐帧必要性）。格式：`mm:ss`，≥1 小时自动 `hh:mm:ss`，前导零，`00:00` 初始。
- **动效清单【新增·r32 全部复用既有】**：
  - 已放置/消行变化 → 复用既有 `flash()`（`.is-flashing` + `stat-flash`：120ms scale 1→1.06 + 金光，css 行 363-374）。零新增关键帧；ui.js 仅把两个新值元素注册进既有闪动逻辑。
  - 时长每秒变化 → **不闪**（每秒闪烁是噪音；动效预算禁止）。
  - OVER 定格 → 三项可闪一次（复用同一 flash，标记最终值，可选）。
  - `prefers-reduced-motion`：沿用既有全局静默（无新增动画，时长更新纯文本写入天然低动效）。
- **播报节流（AC-14 核心机制）**：`#session-announce` 仅在**状态跳变**时写入一次文本（见 §2.5 表）；同一状态下数值刷新（含每秒秒数变化）零播报。实现：状态机回调驱动，不得用值变化监听驱动播报。

## 4. 视觉规格

### 4.1 Token 复用（零新增 token，r29/r31 惯例）

`--fs-xs`（标签/标题）、`--fs-lg`（值）、`--font-mono`（值）、`--font-ui`、`--ink`（值）、`--muted`（标签/标题）、`--line`（标题分隔/卡描边）、`--glass-bg` + blur、`--radius-md`、`--sp-1/2/3/5`、`--font-variant-numeric: tabular-nums`（沿用 `.stat__value` 写法，E11 防数字宽度抖动）。**不新增**任何颜色/阴影/半径/字号/动画 token。

### 4.2 组件规格【新增·r32】（独立类名，视觉对齐既有块）

- `.session-stats`：基座 `display:flex; flex-direction:column; gap:var(--sp-1)`；S 竖屏改 3 列 grid；S 横屏叠加自包含卡化（§2.4）。
- `.session-stats__title`：`--fs-xs / weight:600 / letter-spacing:0.08em / uppercase / color:var(--muted)` + `border-bottom:1px solid var(--line); padding-bottom:var(--sp-2)`（基座与 M 显示；S 档 `display:none`）。作为 `<h3>` 保证文档大纲与朗读层级（仅 h3，不打断既有 h 序列——验证 index.html 无其他 h3 冲突）。
- `.session-stat`（行式）：`display:flex; align-items:baseline; justify-content:space-between; gap:var(--sp-3)`；S 竖屏/横屏列式：`flex-direction:column; gap:var(--sp-1)`。
- `.session-stat__label`：同 `.stat__label` 规范（12px/600/0.08em/uppercase/muted）。
- `.session-stat__value`：`font-family:var(--font-mono); font-variant-numeric:tabular-nums; color:var(--ink); line-height:1.1; font-size:var(--fs-lg)`（18px）。独立类名，不触碰 `.stat__value` 既有断言面。
- `.session-stat__announce`：视觉隐藏（`position:absolute; clip-path:inset(50%)` 一类），保留可聚焦/可朗读性；空文本时零渲染副作用。

### 4.3 各档位尺寸核对（写死前验算）

- 桌面行式：label 最长「消行总数」12px×4 ≈ 48px；值 `1:23:45` mono 18px ≈ 76px；行宽 ≈ 130px ≤ 200px（240 面板 − 40 padding）✓。
- S 竖屏 320px：3 列 ≈ (320−24−24)/3 ≈ 90px/列；label「消行总数」≈48px、值 `1:23:45` ≈76px 均容 ✓；行高 ≈ 34px，`#main` 多一行后棋盘高度约 −34px（375×667 估 560→526 高，等比仍可玩；验收人工项目测）。
- S 横屏 568×320：卡高 ≈ 34+24 ≈ 58px；`#board` max-height 预留复核见 §2.4。

## 5. 可访问性

- **语义**：容器 `role="group" aria-label="本局统计"`（平行 stat-grid 先例）；三个值 `<output>` + `aria-label` 完整指标名；标题 `<h3>`。
- **实时区策略（AC-14 核心）**：
  - 已放置/消行：`aria-live="polite"`（低频事件更新，沿用既有 `#score/#lines` 先例）；
  - 时长：**不设 aria-live**，改由 `#session-announce`（role=status，polite）**状态跳变单次播报**——每秒刷新零播报、暂停/OVER/新局各播报一次。读屏人工补测纳入验收清单（M4）。
- **对比度**：label `--muted` ≈ 4.6:1、值 `--ink` ≈ 12:1（既有安全域，AA 达标）。
- **键盘/焦点**：无焦点元素，Tab 序零新增；不打断 `#btn-settings`→棋盘 既有焦点链。
- **动效**：无新增动画；`prefers-reduced-motion` 全局静默覆盖（若复用 flash，沿用既有处理）。

## 6. 改动面与契约（意图层，TECH 细化）

| 文件 | 改动（全部追加/只读，禁止改写既有规则体） |
|---|---|
| `index.html` | `#panel-left` 内 `.stat-grid` 后追加 `#session-stats`（1 节点；含 `#ss-*` 三值 + `#session-announce`） |
| `style.css` | ①基座 `.session-stats` 行式规则；②S 竖屏作用域：`#main` areas **追加 'session session session' 行** + `.session-stats{grid-area:session}` 列式（既有四区名/grid 细则零改）；③S 横屏：`.session-stats` 独立自包含卡化规则（不加进既有选择器列表）；④标题显示/隐藏。`.stat-grid` 规则体零改动 |
| `ui.js` | els 新增 3+1 锚点（`must()`）；快照只读渲染（placed 计数/lines/时长秒）；`flash()` 注册已放置/消行；状态跳变→`#session-announce` 播报；时长格式化 `mm:ss`/`hh:mm:ss`。既有渲染/flash/状态机逻辑零改 |
| `game.js` | **只读追加**：成功落定会话计数 + 会话有效时长（暂停不计）快照暴露；状态迁移/返回值/事件面零变化（AC-9/10） |
| `audio.js` / `persist.js` | **0 行 diff** |
| `verify-game/verify-ui/qa-e2e` | 追加 §r32 断言：面板存在/初值/数值快照等价（落定 N→N、消行累计、时长定格）；播报不刷屏（同态多次刷新仅 1 次 announce）；源码级：`.stat-grid` 块数仍 4、session 类与 TOUCH_KEYS/行式底栏无关联。**既有断言期望零改动** |
| `scripts` 新 `verify-stats` | 可选：与 verify-constants 同链路新增（TECH 定） |

## 7. 风险与验收备注

| 风险 | 处置 |
|---|---|
| 读数双源漂移 | AC-2/3 单一计数源 + 快照断言（ui.js 只读） |
| 时长暂停/切后台漂移 | AC-4 ≤1s 容差断言 + M4 人工补测（暂停计时、切后台 visibilitychange、OVER 定格） |
| S 竖屏加行致棋盘变小 / S 横屏加卡超高 | §2.3/§2.4 行高预算 + M4 真机目测不叠压；`#board` max-height 预留复核 |
| 横屏双轨形态「面板可见」预期 | **设计声明**：<1024 触控横屏被 r30 锁屏遮罩接管（零触碰），面板不新增轨道内布局；若验收方要求，须 r32 独立裁定（见 §2.4） |
| 新增 h3 与既有标题层级冲突 | index.html 全局查 h1-h6 序列后定（TECH 落地前确认） |
| 播放刷屏 | AC-14 播报=状态跳变驱动（非值变化驱动）+ 读屏人工项 |

**后续（给 TECH 阶段）**：快照字段名/暴露形态由 TECH 定（AC-13 锚点）；标「取代」「暂缓」无——本需求纯新增（PRD 声明）。

<!-- state -->{"phase":"design","summary":"r32 统计面板 DESIGN 定稿：形态=独立面板 #session-stats（非塞入 .stat-grid——qa-e2e r17 断言 .stat 恰 4 个 + verify-ui 四块源序，追加块会破 AC-12 红线），行式明细（桌面/M：label 左 mono 值右）、S 竖屏 #main 追加一行 'session' 3 列 mini-grid（棋盘 −34px 预算）、S 横屏独立自包含玻璃卡（不加进既有卡化选择器列表保规则体零动）；时长播报防刷屏=时长 output 不设 aria-live + 视觉隐藏 #session-announce 仅状态跳变播报；全部复用既有 token/stat-flash，零新增 token/关键帧；横屏双轨形态声明=r30 锁屏遮罩接管不新增轨道内布局；audio/persist 0 行、onSfx 不变、.stat-grid 规则体零动；新增 h3 标题需 TECH 查全局 h 序列。","memory":["r32 硬约束发现：qa-e2e r17 断言 .stat-grid 内 .stat 恰 4 个（querySelectorAll('.stat').length===4），verify-ui 断言四块源序+闭合，故新指标必须独立面板、禁止向 .stat-grid 追加块","形态四档：桌面/M=行式明细（label左 mono值右 18px）；S竖屏=#main grid areas 追加 'session session session' 行（既有四区名与 'hold board next' 子串断言不破坏）+3列 mini-grid 行高≈34px；S横屏=自包含卡化（--glass-bg/blur/--line/--radius-md，不加进既有选择器列表）","AC-14 机制=时长 output 无 aria-live + #session-announce（role=status 视觉隐藏）仅状态跳变播报（新局/暂停/继续/OVER 各一次），已放置/消行沿用 aria-live=polite 低频先例","动效全复用：已放置/消行变化走既有 .is-flashing+stat-flash（120ms），时长每秒不闪，OVER 定格可闪一次；零新增 token/关键帧；tabular-nums 防宽度抖动","横屏双轨声明：has-touch+横屏<1024 由 r30 旋转锁屏遮罩接管，面板零新增轨道内布局（若验收期望可见须独立裁定）；≥1024 横屏触控无 rails 走面板布局","改动面：index.html 纯追加 1 节点；style.css 基座/竖屏行/S横屏卡 3 处追加；ui.js els+渲染+播报；game.js 只读计数+时长快照；audio/persist 0 行；断言 §r32 追加旧断言零改"]}<!-- /state -->