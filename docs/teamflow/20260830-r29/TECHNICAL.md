# r29 横屏双轨与三列内容共存（landscape-dual-track-no-overlap）TECHNICAL

<!-- meta: summary="r29 技术方案：唯一生产代码改动 = style.css 新增 1 个媒体查询块 `@media (orientation: landscape) and (min-width: 600px)`，内含 `html.has-touch #main` 内容让位规则——#main 左右各让出双轨宽（padding-left calc(212px+inset-left) / padding-right calc(104px+inset-right)）并把 grid 覆盖为 flex-column 单列居中（复用 §3 ≤1100 基座 + §7.2 面板卡化），形成 [左轨, vw−右轨] 居中走廊、双轨贴边不叠压；特异性 html.has-touch #main(1,1,1) > §7.3/7.4 #main(1,0,0) → 源序无关反超，桌面(非 has-touch)横屏 grid 零变化；S <600 横屏 / 竖屏 M-L 行式栏 / S dock / 桌面零回归；game/audio/persist/ui.js/index.html 0 diff、VERSION 不动；verify-ui §r29 源码断言 + qa-e2e §r29 源码级让位断言（含 AC-2 条件性真实浏览器几何/视觉探测，jsdom 无几何）" -->

基线依赖：docs/teamflow/20260830-r28-landscape-dual-track（横屏 has-touch 任意宽度恒走左右双轨：左轨=上软降/左/右/下硬降/中心✛、右轨=Hold+旋转，硬降在下；侧轨门控=裸 `@media (orientation: landscape)`；双轨结构/键径 56/80/48/轨宽 212/104/轨高 188/单边描边/四皮肤挂 `.rail`/safe-area 四边/z-index 盖键/三态动效——全部承继零动；`#main` 三列 M/L 栅格、`--dock-h` 板底预留、r27 行式栏 order 冻结、r26 侧轨结构/dock/skin）。

取代：docs/teamflow/20260830-r28-landscape-dual-track#AC-1/#E1：r28 仅放宽侧轨门控，`.touchpad` `position:fixed` 悬浮层未让内容让位 → ≥600px 宽屏横屏下双轨叠压三列内容（左轨叠左信息面板、右轨叠右系统按钮）。本方案以**内容让位**（#main 内容区左右各让出双轨宽 + 单列居中）为唯一修法，并承接 r28#E1 的板底悬浮观测项（以横向让位完成几何不相交，板底 188px 轨高与 `--dock-h` 64px 预留差以内容单列 + 横向带宽避让覆盖，不做竖向预留覆写——见 §4.3）。

> 本迭代为**作用域内布局让位**裁定（非重设计）：无数据模型、无 API、无状态变化；唯一生产代码改动是 style.css 新增 1 个媒体查询块（约 +14 行），其余 0 diff。下列 §1~§3 为「不变契约重述」防回归，§4 为核心实现点与级联/特异性证明，§5 测试策略，§6 任务拆分，§7 工程约束。

---

## 1. 数据模型与存储（零变化）

| 面 | 现状（承继） | 本需求 |
|---|---|---|
| 对局状态 | game.js 闭包内不可变棋盘/快照（`getSnapshot()`） | 0 diff |
| 持久化 | persist.js `createPersistence`（settings：音量/静音/`dockSkin` 四枚举） | 0 diff；值域与存储通道逐字节不动 |
| `dockSkin` | ui.js `DOCK_SKINS` ↔ persist `DOCK_SKINS` ↔ index.html radio value 三处单一事实来源 | 不动——四皮肤挂 `.rail` 随横屏分支已存在，r29 仅对 `#main` 让位，不触皮肤值域 |

**结论**：内容让位是纯 CSS 表现层裁定，与网格 `--dock-h`/双轨同为布局变量，无任何数据/存储新增。`--dock-h`（1966/1987）为既有板面变量，本需求不持有、不动（AC-4 竖屏行式栏板底预留照旧）。

## 2. API 设计（零新增；契约重述）

静态 `file://` 单页，无路由、无后端 API。公开面仅 UMD 契约，本需求全部 0 逻辑改动：

| 契约 | 位置 | 签名/值域 | 本需求 |
|---|---|---|---|
| `TetrisUI.TOUCH_KEYS` | ui.js:1062 | 六值表（softDrop/moveLeft/moveRight/hardDrop/hold/rotate）——回放器单一事实来源 | 0 逻辑改动（AC-6） |
| `TetrisUI.createTouchControls(els, game, opts?)` | ui.js:1121 | `touchstart`→preventDefault+RUNNING 守卫+activeKeys 注册+合成 keydown；长按 game.js held Map/DAS 驱动 | 0 逻辑改动 |
| `TetrisUI.createUI(opts)` | ui.js ~1867 | `touch` 能力检测 → `html.has-touch` 类 + createTouchControls | 0 逻辑改动（`html.has-touch` 类沿用，r29 纯 CSS 消费它） |

**键位映射参数**（入参零变化）：`.tkey[data-action]`（index.html:119-122、130-131）↔ `TOUCH_KEYS[].action`。回放器锚点 `[data-action=moveLeft/hold/rotate]` 穿越 `.rail` 包裹命中（r26 已锚定）。r29 不改 `.tkey`/`.rail`/`#touch-controls` 任何 DOM 或 data-action。

## 3. 前端结构与状态管理

**DOM（单模板三作用域，零改动）**：`#touch-controls`（index.html:113-134）唯一实例——`.rail--l > .tpad-cross`（源序 softDrop→moveLeft→moveRight→hardDrop + ✛ hub）+ `.rail--r > .tpad-main`（hold→rotate）；S 竖屏 dock / 横屏双轨 / M-L 行式底栏均为 CSS 重排同一 DOM（构造保证 AC-3 双作用域同步）。r29 不改 DOM。

**作用域裁定（本需求修订仅「横屏 M/L ≥600px has-touch」的 `#main` 内容让位一行）**：

| 作用域 | 布局 | 双轨 vs 内容 | 本次 |
|---|---|---|---|
| 横屏 S（<600px，has-touch） | §7.2 卡片流变体 + §5.5 双轨 | 轨在底、卡片流居中，无面板冲突 | 不改（AC-3） |
| **横屏 M/L（≥600px，has-touch）【修订】** | **§5.5 双轨 + `#main` 内容左右让位、单列居中** | **让位使内容居中于 [左轨, vw−右轨]，双轨贴边不叠压** | **AC-1 核心** |
| 竖屏 M/L 行式底栏 | 一行六键（恒玻璃、r27 order 冻结） | `#main` `--dock-h` 板底预留 | 不改（AC-4） |
| 竖屏 S dock | r24 双簇 | — | 不改（AC-4） |
| 桌面非触控 | 无触控区 | 基座三列 grid | 0 变化（AC-5，`html.has-touch` 门控） |

**状态管理**：无 JS 状态参与——横竖屏切换纯媒体查询接管（orientationchange 无 JS 监听、即切即现、不重置对局）；触控控制器 activeKeys/DAS 复用 game.js held Map 零改动；`html.has-touch` 类由 createUI 既有能力检测管理，本需求仅以它为让位门控选择器前缀，不动 JS。

## 4. 关键实现点与边界

### 4.1 唯一代码改动（style.css，§7.5 之后新增 1 块，约 1960 行后、2001 行文件尾前）

在文件末尾（L ≥1024px 说明注释之后）追加一个媒体查询块。选择器与媒体查询组合为**唯一门控**：

```css
/* r29 AC-1 横屏 ≥600px 内容让位（取代 r28#AC-1 叠压 + r28#E1 悬浮观测项升级）：
   横屏（has-touch、min-width:600px）下 #main 内容左右各让出双轨宽，内容单列居中于
   [左轨, vw−右轨] 走廊、双轨贴边不叠压；html.has-touch 门控保桌面横屏零变化（AC-5）。
   特异性 html.has-touch #main(1,1,1) > §7.3/7.4 #main(1,0,0) → 源序无关反超其 grid；
   覆盖 grid 回退 flex-column（复用 §3 ≤1100 基座），面板卡化承继 §7.2 外观（AC-1/AC-2）。 */
@media (orientation: landscape) and (min-width: 600px) {
  html.has-touch #main {
    display: flex;
    flex-direction: column;                
    align-items: center;                    /* 内容单列居中于走廊 */
    padding-left:  calc(212px + env(safe-area-inset-left));   /* 左轨≈212 贴边让位 */
    padding-right: calc(104px + env(safe-area-inset-right));  /* 右轨≈104 贴边让位 */
  }
  /* #main 改为 flex-column 后，左右面板（DOM 子块即卡片）摊平承继 §7.2 卡化，居中限宽 */
  html.has-touch #main > #panel-left,
  html.has-touch #main > #panel-right { display: contents; }
  html.has-touch #main .stat-grid,
  html.has-touch #main .next-well,
  html.has-touch #main .hold-well,
  html.has-touch #main .key-hints,
  html.has-touch #main #controls,
  html.has-touch #main #btn-settings {
    width: 100%;
    max-width: 420px;
    background: var(--glass-bg);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: var(--sp-3);
    margin: var(--sp-2) 0;
  }
  html.has-touch #main #board-col { width: 100%; padding: 0; }
  /* 棋盘 CSS 等比缩放（承继 §7.2 模式）：横屏高 360-600px，保留页头/卡片余量，1:2 自适应 */
  html.has-touch #main #board {
    width: auto !important;
    height: auto !important;
    max-width: 100%;
    max-height: calc(100vh - 180px);
  }
}
```

**门控/特异性三重保证（关键论证）**：

| 维度 | 结论 |
|---|---|
| 媒体查询正交性 | `(orientation: landscape) and (min-width: 600px)`：竖屏（portrait）不命中 → AC-4 竖屏行式栏/dock 零影响；S <600 横屏不命中 → AC-3 §7.2 卡片流原样；桌面横屏也命中 min-width 但被 `html.has-touch` 前缀排除 → AC-5 桌面零变化。 |
| 特异性反超 | `html.has-touch #main` = (1,1,1)；§7.3/§7.4 的 `#main` = (1,0,0)。由特异性决定，**与源序无关**——即使本块在 §7.4 之后，grid 声明也不反超。非 has-touch 时本块不匹配，§7.3/7.4 grid 保持（AC-5 零变化）。 |
| 子块选择器特异性 | 卡化子块选择器 `html.has-touch #main .next-well` 等为 (1,2,0)+，高于既有单类 `.next-well`，且本块在文件尾（源序最晚）→ 双保险。`#controls`/`#btn-settings`/`#board-col` 用 `html.has-touch #main #controls` 等 (2,1,0) 显式抬特异。 |

**为何必须回退 flex-column（设计 §2.1 几何边界）**：走廊宽 = `vw − 316px − (inset-left+inset-right)`。r29 三列/两列栅格在走廊内必然放不下——600–767（`minmax(0,1fr) 340px`，600 时走廊 284px < 340 固定列）与 768–1023（`minmax(180px,1fr) 340px minmax(180px,1fr)`，768 时走廊 452px < 748px 需求）与 ≥1024 L（`240|340|240`，1024 时走廊 708px < 868px 需求）全被 340px 固定板框列或双侧面板最小宽撑爆 → 若沿用 grid 必定横向溢出（**设计 §2.1 风险 1：M 档溢出漏检的针对性修复**）。故**唯一可行解 = 覆盖 grid 为 flex-column 单列**，各子块 `max-width:420px` 居中、棋盘等比缩放，内容全程收口在走廊内、无横向滚动。此为 r28 只做算术漏检（E1 观测项）+ r29 不做栅格断点推倒（非目标「不调整断点三档」）两者的折中裁定的必然结果。

### 4.2 双轨贴边（不夹进走廊，AC-1）

让位只作用于 `#main` 内容盒。双轨 `.touchpad`/`.rail--l`/`.rail--r` 维持 `position:fixed`（基座 1028 `position:fixed` + §5.5 `left/right:0`，rail 贴 `env(safe-area-inset-*)`）——**不随 `#main` 缩进**，始终贴屏幕左右边缘。内容经 `#main` 左右 padding 让出对应带宽，故左轨与左信息面板盒、右轨与右系统按钮盒**水平带宽互斥**（左轨占 [0,212+inset]，内容从 212+inset 起；右轨占 [vw−104−inset, vw]，内容到 vw−104−inset 止）→ 几何不相交（AC-2 判据）。r29 **不做** `#main` 竖向 `padding-bottom` 覆写（r28#E1 板底 188px vs `--dock-h` 64px 差）：横向带宽避让已保证盒不相交；竖向预留差只在内容与轨同列时才有意义，而横向让位已把内容排除出轨列，故竖向预留覆写**不在本期必要**（避免 M 档板底断点覆写的回归面）。

### 4.3 边角与防回归

- **S <600px 横屏**：本块 min-width:600px，不命中 → §7.2 卡片流变体 + §5.5 双轨原样，零变化（AC-3）。
- **竖屏 M/L 行式栏/S dock**：media `orientation:landscape` 不命中 → §7.1 portrait 内层 dock / 基座行式栏原样，`--dock-h` 板底预留不动（AC-4）。
- **桌面横屏≥600px**：`html.has-touch` 类不挂 → 本块不匹配，§7.3/§7.4/§7.5 grid 原样，`#main` 无让位 padding（AC-5，verify-ui/qa-e2e 源码断言兜底）。
- **`--dock-h` 与让位并存**：横屏 ≥600px has-touch 下 `#main` 由 §7.3/§7.4 改 flex-column，其 `padding-bottom:var(--dock-h)`（1973/1994）仍随 `--dock-h` 生效——但本块 `html.has-touch #main`(1,1,1) 覆盖了 `#main`(1,0,0) 的 `padding` 简写吗？⚠ **必须注意**：`#main` base（246-255）与 §7.3/§7.4 均用 `padding-bottom` 长属性或 `padding` 简写。r29 块内 `#main` 用 `padding-left/padding-right` **长属性**，不碰 `padding-bottom`/`padding-top`；CSS 逐长属性合并，`padding-bottom:var(--dock-h)` 来自其他块的长属性仍生效（无冲突）。**但 `#main` 在 flex-column 时 `--dock-h` 是板底预留**——其值（`--tpad-key` 64px）是为底栏预留，横屏双轨（fixed 底 188px）下预留不足。因横向带宽已避让（§4.2 论证），**板底预留值不必调整**；但为消除纵向过长，`#main` 在 flex-column 时 content 天然随流（board max-height 约束），`.touchpad` fixed 底轨与内容列同高的横向排除已生效（AC-2）。若真机板底仍有视觉残留，仅作 AC-7 人工补测观测项，不入本期代码。
- **`#board` max-height 值**：§7.2 S 档用 `calc(100vh - 150px)`；r29 M/L 档页头/卡片余量略大，取 `calc(100vh - 180px)`（经验值，dev 以 768×400 / 1024×600 两样本目测调优，保证 1:2 等比、无横向/纵向溢出、内容单屏）。此值为显示层，不触画布分辨率/渲染逻辑。

## 5. 测试策略

### 5.1 verify-ui.cjs §r29 段（追加于 998 行末尾，纯追加）

jsdom 不执行媒体查询 → 全部为**源码断言**（cssText 源扫描即行为证明）：

1. **让位规则存在**：`css` 含 `html.has-touch #main` 规则，且其声明含 `padding-left: *212px*` 与 `padding-right: *104px*`（各含 `env(safe-area-inset-*)`）——取 `indexOf('html.has-touch #main')` 后截到 `}` 断言。
2. **门控组合**：存在 `@media (orientation: landscape) and (min-width: 600px)`（裸组合，**不得**含 `max-width` 尾缀），与 §5.5 裸 `@media (orientation: landscape)` 并存互不合并。
3. **回退 flex-column**：让位规则声明含 `display: flex` 且 `flex-direction: column`（grid 被覆盖的证据）。
4. **桌面零变化（负面断言）**：非 `html.has-touch` 前缀的 `@media (orientation: landscape)` / `(min-width:600px)` 块内**无**任何新的 `#main` padding 让位声明；§7.3/§7.4/§7.5 grid 模板文本（`minmax(0,1fr) 340px` / `minmax(180px,1fr) 340px minmax(180px,1fr)` / `240px 340px 240px`）原样存在（AC-5）。
5. **既有门控/结构断言零回归**：r24/r26/r27/r28 §r24/§r26/§r27/§r28 段全部不动（§5.5 裸 landscape、nth-child 双作用域同串、rail 212/104、四皮肤挂 `.rail`）。

### 5.2 qa-e2e-jsdom.cjs §r29 段（追加于 r28 段结束 2666 行后、2668 汇总前）

沿用 r28 harness（`createUI({root, touch:true, persist})` + 合成 touch）。jsdom 无几何/媒体查询 → **源码级**断言（cssText 源扫描）：

1. **让位规则存在（源扫描）**：`css18` 含 `@media (orientation: landscape) and (min-width: 600px)` 前缀，其内 `html.has-touch #main` 块含 `calc(212px + env(safe-area-inset-left))` 与 `calc(104px + env(safe-area-inset-right))`（AC-1 让位登记）。
2. **双轨 DOM 不变（r28 承继）**：`.rail--l`/`.rail--r` 恰 2、三件套互不串簇、六键 data-action 集合不变、hub 三保险 —— 对照 r28 §r28 段断言零回归（AC-6/8）。
3. **触控语义零回归**：源序首键 touch→y+1、末键 touch→落锁（r28 序列承继，AC-6）。
4. **桌面非触控零触控区**：`createUI({touch:false})` 下 `#touch-controls` 无 `.rail`、`html` 无 `has-touch`（AC-5）。
5. **竖屏/S 横屏零回归（源扫描）**：§7.1 portrait dock、§7.2 S 横屏卡片流、§7.3/§7.4 grid 模板原文仍在（`minmax(0,1fr) 340px` / `minmax(180px,1fr) 340px minmax(180px,1fr)`），M 两档切片仍零 `.touchpad/.rail` 触控规则（AC-3/4，兼 r28「不落行式栏」断言）。
6. **段内 dispose 无异常 + has-touch 归属回收**（mirror r28 2665）。

> **真实浏览器/几何探测（AC-2，条件性）**：jsdom 无 getBoundingClientRect 布局与媒体查询求值 → 几何不相交/overlap 断言必须在真实浏览器（emulate 768×400 / 1024×600 横屏 has-touch）下执行。若流水线环境允许（playwright/puppeteer 或 chrome headless），落地独立 `scripts/r29-browser-overlap.cjs`（仅在该脚本内读 `getBoundingClientRect`，断言 `rail--l` 与 `#panel-left`、`rail--r` 与 `#panel-right` 的 `getBoundingClientRect` 相交面积为 0，且 `#main` `scrollWidth <= clientWidth`——无横向滚动）；若环境不允许，以「源码让位断言 + 实机截图人工比对」退化为 AC-2 等效，并留 AC-7 人工补测。**该脚本仅在检测到 ad-hoc 浏览器时运行，不进入 verify-ui/qa-e2e 常规七套**（避免无浏览器环境挂红）。

### 5.3 出口命令（产品根，七套全绿 AC-8）

`node scripts/verify-game.cjs` / `verify-audio.cjs` / `verify-ui.cjs` / `verify-constants.cjs` / `verify-persist.cjs` / `assembly-check.cjs` / `qa-e2e-jsdom.cjs`。r24/r26/r27/r28 既有断言零回归（AC-8 基线语义）。

### 5.4 红线复核（AC-7）

- game.js / audio.js / persist.js / ui.js / index.html：0 diff；`VERSION` 三模块一致且不动；`TOUCH_KEYS` 六值 ↔ `.tkey[data-action]` 交叉零变化（r16/r24/r27 既有断言即红线，零回归即绿）。
- 承继项：`:active` 三态 / `touch-action:none` / safe-area 四边 / 多指守卫（canvas touchstart/touchmove preventDefault）/ hub 三层保险——全由既有规则体与 ui.js 承载，r29 仅新增 `#main` 让位声明，不触碰。

## 6. 任务拆分（文件边界互不相交 → 并行）

| 任务 | 文件 | 规格 | 验收判据 |
|---|---|---|---|
| **T1** style.css 内容让位块 | `/style.css` | 文件尾追加 `@media (orientation: landscape) and (min-width: 600px)` + `html.has-touch #main` 让位（4.1 规则体，含 flex-column + 面板卡化 + `#board` 等比）；门控不定 `max-width`；其余 0 diff | 规则体与 §4.1 逐条一致；`git diff style.css` 仅 +14 行左右的追加块；`html.has-touch #main` 含 212/104 让位与 flex-column |
| **T2** verify-ui §r29 段 | `/scripts/verify-ui.cjs` | 998 行末尾追加 §r29 源码断言（5.1 五组） | `node scripts/verify-ui.cjs` 全绿，含新增 5 项；r24/r26/r27/r28 断言零回归 |
| **T3** qa-e2e §r29 段 | `/scripts/qa-e2e-jsdom.cjs` | r28 段（2666）后追加 §r29 六组源码断言（5.2）；条件性 `scripts/r29-browser-overlap.cjs` 单独落（不入七套） | `node scripts/qa-e2e-jsdom.cjs` 全绿、无既有回归；r29 段恰 6 项源码断言 |
| **T4** 红线复核（只读核验） | `/game.js` `/audio.js` `/persist.js` `/ui.js` `/index.html` | `git diff` 与 verify-constants/assembly/persist 复核 0 diff、VERSION 一致、`TOUCH_KEYS` 交叉不变 | 上述文件相对 HEAD 0 diff；`verify-constants` 三模块 VERSION 一致 |
| **T5** 回归+提交 | 全部 | T1-T4 完成后七套全绿（含 §r29 新增）+ 条件性浏览器探测脚本单独执行（若环境允许）；main HEAD 单 commit 同批含任务夹（§7） | 七套全绿 + `git status` 干净（仅任务夹与改动文件入 commit） |

依赖：T1/T2/T3 文件互不相交 → 并行；T4 依赖 T1（对照变化面复核红线）；T5 依赖 T1-T4。T2/T3 可先于 T1 完成（断言描述目标态），合流后统一跑七套全绿。

## 7. 工程约束（PRD §7 第 4 条，执行要求）

- 基于 **main 当前 HEAD** 实施，**不开新分支**。
- 工作区未提交改动仅任务夹 `docs/teamflow/20260830-r29/`（host 已创建，含 meta.json），随交付**同批单提交**，不另行处理。
- memory.md 不动（产品行为缺陷修复，非新团队约定/技术栈决策；记录于本任务夹）。

---

<!-- blueprint -->{"summary":"横屏 M/L ≥600px 内容让位 = 纯 CSS 作用域内布局裁定：唯一生产代码改动 style.css 新增 1 个 `@media (orientation: landscape) and (min-width: 600px)` + `html.has-touch #main` 让位块（左右让出 212/104px+inset + grid→flex-column 回退 + 面板卡化 + 棋盘等比），依托特异性 (1,1,1)>(1,0,0) 反超 §7.3/7.4 grid 且被 html.has-touch 门控保证桌面零变化；其余 0 diff，断言登记于 verify-ui/qa-e2e §r29，T1/T2/T3 文件不相交可并行","modules":{"/style.css":{"responsibility":"文件尾追加 `@media (orientation: landscape) and (min-width: 600px)` 块：`html.has-touch #main` 左右让位（padding-left calc(212px+inset-left)/padding-right calc(104px+inset-right)）+ grid→flex-column 单列居中 + 面板卡化 + #board 等比缩放与 max-height","dependsOn":["/index.html（#main/面板/board DOM 结构契约）","/style.css 既有 §5.5 双轨门控与 §7.3/7.4 grid"],"assemblyOrder":1,"why":"布局让位由媒体查询+级联特异性裁决；html.has-touch 前缀既复用 createUI 既有能力检测门控桌面零变化，又以 (1,1,1)>(1,0,0) 反超 §7.3/7.4 grid 避免乱源序；走廊几何证伪 arithmetric 三列容积（340+180×2+48>452 等）故必须 flex-column 回退才无横向滚动"},"/scripts/verify-ui.cjs":{"responsibility":"尾部追加 §r29 源码段：让位规则存在（#main 含 212/104+inset）、门控组合（landscape and min-width:600 且无 max-width）、flex-column 回退、桌面零变化负面断言、既有 grid 模板原文保持","dependsOn":["/style.css"],"assemblyOrder":2,"why":"jsdom 不执行媒体查询，CSS 源扫描是媒体查询布局行为最廉价可靠的断言面；负面断言捕获「误波及桌面/S/竖屏」边界"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"r28 段后追加 §r29 六组源码断言（让位规则存在/双轨 DOM 承继/触控语义零回归/桌面非触控零触控区/竖屏与 S 横屏及 M 两档 grid 模板零回归/dispose 回收）；另条件性 scripts/r29-browser-overlap.cjs 真实浏览器几何探测（不入七套）","dependsOn":["/index.html","/style.css"],"assemblyOrder":3,"why":"复用 r28 harness（createUI touch:true + 合成 touch）走触控=键盘回放器路径；真实浏览器几何探测因 jsdom 无布局求值而拆为独立条件脚本，缺省退化为源码断言+实机比对"},"/index.html":{"responsibility":"0 diff 红线：#main/面板/board DOM 结构、#touch-controls 单模板、六键 data-action、hub 三层保险为让位与触控契约单一来源","dependsOn":[],"assemblyOrder":0,"why":"单模板三作用域（S/M-L 均 CSS 重排同一 DOM）——零改动，仅作契约锚点；让位只作用 #main，不触 DOM 结构"},"/ui.js":{"responsibility":"0 diff：TOUCH_KEYS 六值表 + createTouchControls 回放器（touchstart→合成 keydown）+ html.has-touch 能力检测类","dependsOn":["/index.html"],"assemblyOrder":0,"why":"键位语义由 DOM 源序 + 媒体查询落位锁死；html.has-touch 类被 r29 让位块复用为前缀，JS 层无需感知布局让位"},"/scripts/r29-browser-overlap.cjs":{"responsibility":"条件性真实浏览器（playwright/puppeteer/chrome-headless）：emulate 768×400/1024×600 横屏 has-touch，getBoundingClientRect 断言 rail--l 与 #panel-left、rail--r 与 #panel-right 相交面积为 0 且 #main scrollWidth<=clientWidth","dependsOn":["/index.html","/style.css"],"assemblyOrder":4,"why":"jsdom 无布局与媒体查询求值，几何不相交/无横向滚动只能在真实浏览器验证；拆独立脚本避免无浏览器环境挂红，满足 AC-2 条件性要求"}},"duplications":["面板卡化与 §7.2 的卡片规则（stat-grid/next-well/hold-well/key-hints/controls 的 glass+blur+max-width:420px）在 §7.2 与 r29 块各存一份：为刻意内存（§7.2 仅 <600px 生效，r29 仅 ≥600px has-touch 生效，两作用域互斥），断言按两切片各自存在防漂移，不抽取共享混入断点","nth-child grid-area 映射（§5.5/竖屏块）与轨道结构为 r28 既有共享，r29 不触碰不合并（避免重开 r28 级联面）；断言承继 r28 §r28 段零回归"],"tasks":[{"title":"T1 style.css 内容让位块","files":["/style.css"],"spec":"文件尾追加 @media (orientation: landscape) and (min-width: 600px) + html.has-touch #main 让位（4.1 规则体：左右 212/104+inset、flex-column、面板卡化、#board 等比 max-height 100vh-180px）；门控不定 max-width"},{"title":"T2 verify-ui.cjs §r29 源码段","files":["/scripts/verify-ui.cjs"],"spec":"998 行末尾追加 §r29 五组源码断言（让位规则/门控组合/flex-column 回退/桌面零变化负面/grid 模板原文）"},{"title":"T3 qa-e2e-jsdom.cjs §r29 源码段 + 条件性浏览器脚本","files":["/scripts/qa-e2e-jsdom.cjs","/scripts/r29-browser-overlap.cjs"],"spec":"r28 段后追加 §r29 六组源码断言；独立 r29-browser-overlap.cjs（真实浏览器相交面积 0 + 无横向滚动），不入七套"},{"title":"T4 红线复核（只读核验）","files":["/game.js","/audio.js","/persist.js","/ui.js","/index.html"],"spec":"git diff 复核 0 diff、VERSION 三模块一致、TOUCH_KEYS 交叉不变"},{"title":"T5 回归+提交","files":["!"],"spec":"T1-T4 后七套全绿 + 条件性浏览器探测（若环境允许）；main HEAD 单 commit 同批含任务夹"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r29 技术方案定稿：唯一生产代码改动 = style.css 文件尾新增 `@media (orientation: landscape) and (min-width: 600px)` 块，内含 `html.has-touch #main` 内容让位（padding-left calc(212px+inset-left)/padding-right calc(104px+inset-right)）+ grid→flex-column 单列居中 + 面板卡化（承继 §7.2 外观）+ #board 等比缩放 max-height 100vh-180px；依托特异性 html.has-touch #main(1,1,1) > §7.3/7.4 #main(1,0,0) 源序无关反超其 grid，且 html.has-touch 门控保桌面横屏零变化（AC-5）；关键论证=走廊几何证伪三列/两列成本（600→284<340、768→452<748、1024→708<868）故 flex-column 回退是唯一无横向滚动解（设计§2.1 风险1 针对性修复）；横向带宽让位已使左轨/右轨与内容盒带宽互斥 → 几何不相交（AC-2），故不做竖向 --dock-h 覆写（r28#E1 以横向让位覆盖，差项入 AC-7 人工补测）；S<600/竖屏 M-L 行式栏/S dock 因 media 不命中零回归；verify-ui §r29 五组源码断言 + qa-e2e §r29 六组源码断言 + 条件性独立浏览器几何脚本 r29-browser-overlap.cjs（不入七套）；T1/T2/T3 文件不相交并行 + T4 红线复核 + T5 七套全绿 main 单 commit，game/audio/persist/ui.js/index.html 0 diff、VERSION 不动、TOUCH_KEYS/回放器 0 逻辑","memory":["r29 技术方案：唯一代码改动 style.css 文件尾 `@media (orientation: landscape) and (min-width: 600px)` + `html.has-touch #main` 让位块（212/104+inset 左右 padding、flex-column 单列居中、面板卡化、#board max-height 100vh-180px）","特异性 html.has-touch #main(1,1,1) > §7.3/7.4 #main(1,0,0) → 源序无关反超 grid；html.has-touch 门控保桌面横屏零变化（AC-5）；media 不命中竖屏/S 横屏 → AC-3/4 零回归","关键几何论证：M/L 横屏走廊（600→284 / 768→452 / 1024→708px）容不下固定 340 板框列+双侧面板最小宽+gap → 必须 grid→flex-column 回退才无横向滚动（设计§2.1 风险1 针对性修复，非目标不断点）","横向带宽让位使左轨[0,212]/右轨[vw-104,vw]与内容盒带宽互斥 → 几何不相交（AC-2）；∴ 不做竖向 --dock-h 覆写（r28#E1 以横向让位覆盖，板底 188 vs 64 差项入 AC-7 人工补测不入代码）","verify-ui §r29 五组源码断言（让位/门控组合无 max-width/flex-column 回退/桌面零变化负面/grid 模板原文）；qa-e2e §r29 六组源码断言（让位存在/双轨承继/触控语义/桌面非触控/S-竖屏-M 两档模板零回归/dispose）","AC-2 真实浏览器几何探测：jsdom 无布局与媒体查询求值 → 独立 scripts/r29-browser-overlap.cjs（相交面积 0 + scrollWidth<=clientWidth），条件性执行不入七套，缺省退化源码断言+实机比对","任务 T1 style.css 让位块 / T2 verify-ui §r29 / T3 qa-e2e §r29+浏览器脚本 文件不相交并行；T4 红线复核（0 diff+VERSION+TOUCH_KEYS）；T5 七套全绿 main HEAD 单 commit 含任务夹"]}<!-- /state -->
