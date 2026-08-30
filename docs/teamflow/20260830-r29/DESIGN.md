# r29 横屏双轨与三列内容共存（landscape-dual-track-no-overlap）DESIGN

<!-- meta: summary="r29 设计：横屏（has-touch、任意宽度）保持 r28 恒左右双轨十字，但修叠压——M/L（≥600px）横屏 #main 内容区左右各让出双轨宽度（左≈212px、右≈104px+safe-area）形成 [左轨, vw−右轨] 居中走廊，双轨贴边、内容/信息面板/按钮不被遮挡；窄屏 S 横屏沿用 r28 既有变体不引入让位；竖屏 M/L 行式底栏、S dock、桌面非触控零变化；零新增 token/动画；对局区 340px 固定板框与信息面板的可用宽度核算交给 TECH+AC-2 几何探测兜底，防横向滚动" -->

基线依赖：docs/teamflow/20260830-r28-landscape-dual-track（横屏 has-touch 任意宽度恒走左右双轨：左轨=上软降/左/右/下硬降/中心✛、右轨=Hold+旋转，硬降在下；侧轨门控=裸 `@media (orientation: landscape)`；键径 56/80/48、轨宽 212/104、轨高 188、单边描边、四皮肤挂 `.rail`、safe-area 四边、z-index 盖键、三态动效——全部承继零动）。

取代：docs/teamflow/20260830-r28-landscape-dual-track#AC-1/#E1：r28 仅放宽门控，侧轨 `position:fixed` 悬浮层未让内容让位 → ≥600px 宽屏横屏下双轨叠压三列内容（左轨盖左信息面板、右轨盖右系统按钮）。本设计以**内容让位**（#main 内容区左右各让出双轨宽度，双轨贴边、内容居中）为核心修法，并保留「等价非悬浮」为窄走廊各档回退。

> 本迭代为**作用域内布局让位**裁定，非重设计：双轨结构、键位语义、六键契约、四皮肤、三态、safe-area、z-index、行式栏/S dock 全承继。下列条目按【修订】标注变化处，未标注者维持 r26/r27/r28 现状。

---

## 1. 模块与信息架构

单页应用，本次仅改 `style.css` 横屏 ≥600px 分支的内容让位；index.html 结构、双轨 DOM、契约零动。

| 模块 | 本次状态 | 说明 |
|---|---|---|
| 双轨 `.rail--l` / `.rail--r` | 不改 | 结构/键径/键位/皮肤/贴边/safe-area 全承继 r28 |
| **`#main` 内容区（横屏 ≥600px，has-touch）** | 【修订】 | 左右各让出双轨宽度，内容居中于走廊，不叠压（AC-1） |
| 窄屏 S 横屏（<600px，has-touch） | 不改 | 沿用 r28 既有变体（单列卡片流/无左右面板冲突），**不引入让位**（AC-3） |
| 竖屏 M/L 行式底栏 / S dock | 不改 | r24 双簇 / r27 冻结键序，零变化（AC-4） |
| 桌面非触控 | 不改 | `html.has-touch` 门控下不渲染，零变化（AC-5，红线） |

**信息架构**：不变——单屏 `#touch-controls` 内含 `.rail--l`（左轨十字）+ `.rail--r`（右轨 Hold/旋转）；横屏侧轨与竖屏/行式栏共用同一 DOM（`.rail` `display:contents` 中性化），仅改 `#main` 让位，不改 index.html。

**作用域裁定（让位仅横屏 ≥600px has-touch）**：

| 分支 | 让位 | 说明 |
|---|---|---|
| 横屏 S（<600px） | 不引入 | 无左右面板冲突，内容区不缩，视觉与 r28 一致（AC-3） |
| **横屏 M/L（≥600px）【修订】** | **`#main` 左右各让出双轨宽** | 内容居中于走廊，双轨贴边，不叠压（AC-1） |
| 竖屏 M/L 行式底栏 | 不引入 | 底部一行六键，恒玻璃，r27 冻结键序（AC-4） |
| 竖屏 S dock | 不引入 | 3×3 十字 + 纵列（AC-4） |
| 桌面非触控 | — | 无触控区，键盘操作（AC-5） |

## 2. 线框描述

### 2.1 横屏 M/L（≥600px）内容让位【修订 · 核心】

```
┌──────────────────────────── 横屏 M/L（≥600px，has-touch）────────────────────────────┐
│[左轨 .rail--l ≈212px]                #main 内容走廊 [右轨 .rail--r ≈104px]           │
│  ┌十字 56 grid 3×3┐          ┌左信息面板┐┌棋盘(340)┐┌右信息面板┐        ┌Hold 48┐      │
│  │ .  软降 . │      ← 让出 → │分数/最高 ││ 板框   ││ 系统按钮 │    ← 让出 → └────────┘ │
│  │ ◀   ✛  ▶ │   left 212+   │等级/行数 ││ 280×560││ 开始/暂停 │  right 104+  ┌旋转 80┐ │
│  │ .  硬降 . │    safe-left  └─────────┘└────────┘└─────────┘   safe-right └────────┘ │
│  └──────────┘   bottom 贴 safe-a      对齐 start / 居中于走廊          贴 safe        │
└────────────────────────────────────────────────────────────────────────────────────────┘
  走廊 = [212+inset-left , vw−(104+inset-right)] ；#main 内容居中于走廊；双轨贴左右屏幕边缘
```

- **让位机制（AC-1）**：横屏 ≥600px has-touch 下，`#main` 左右各让出双轨宽度 + safe-area-inset，使内容限制在走廊内、双轨贴边、内容不被遮挡：

```
#main {
  padding-left:  calc(212px + env(safe-area-inset-left));    /* 左轨≈212 贴边 */
  padding-right: calc(104px + env(safe-area-inset-right));   /* 右轨≈104 贴边 */
}
```

- **几何边界（AC-1/风险 1，收紧下发给 TECH）**：走廊宽 = `vw − 316px − (inset-left+inset-right)`。板框中央列为固定 340px（grid `340px` 轨道），两侧信息面板 `minmax(180px,1fr)`。各档必须保证**走廊内内容不横向滚动、且双轨与内容盒不相交（AC-2 几何断言）**。工程核算原则：
  - 走廊 ≥ 板框列(340) + 两侧面板最小(180×2) + 2×gap(24) 时，三列/两列完整放入走廊，双轨贴边、内容居中；
  - 走廊不足以完整容纳时，**复用既有 flex 列堆叠回退**（`#main`/面板可列向重排、面板可在板下/板侧收缩），保证其脚布局不落双轨带、不产生横向滚动；此边界为设计级裁定，精确余量交给 TECH 依各断点核算 + AC-2 真实浏览器几何探测兜底（r28 只做算术漏检的针对性补强）。
- **列布局断点**：维持 `#main` 既有 M 两列（600–767：`minmax(0,1fr) 340px`）/ M 三列（768–1023：`minmax(180px,1fr) 340px minmax(180px,1fr)`）/ 基座三列（≥1024：`240|340|240`）栅格不变，仅在横屏 ≥600px 分支叠加让位 padding；宽度断点三档划分不动（非目标）。
- **双轨贴边（不夹进走廊）**：双轨维持 `position:fixed` 贴 `left/right:0` + safe-area，不随内容缩进——让位只作用于 `#main` 内容，双轨始终贴屏幕左右边缘（AC-1）。
- **窄屏 S 横屏不引入让位**：`#main` S 横屏（<600px）沿用 r28 既有卡片流变体，无面板冲突，不加 padding（AC-3 视觉零变化）。

### 2.2 竖屏 M/L 行式底栏（≥600px 竖）【零变化】

保持 r26/r27 现状：基座 `.touchpad` 玻璃底部一行六键（恒 `--glass-bg` + blur + 上描边 + 上投影），键序由 r27 order 冻结为 **硬降 左 右 软降（+Hold 旋转尾簇）**；`#main` `--dock-h` 板底预留照旧，不随本需求调整。

### 2.3 竖屏 S dock / 横屏 S 侧轨【零变化】

S dock（<600px 竖）3×3 十字 + 纵列、S 横屏（<600px）既有单个卡片流变体——键位/尺寸/皮肤全承继，不重述。

## 3. 交互与动效

| 场景 | 行为 | 动效 |
|---|---|---|
| 键按压（r16 三态，承继） | 描边转 `--primary`、标签转 `--accent-hi`、辉光 opacity 0→1、`scale(0.94)` | transform 60ms / border·color 120ms / glow opacity 120ms（r24 定稿值） |
| 横竖屏切换（orientationchange） | 纯媒体查询接管：横屏双轨(with 让位) ↔ 竖屏 dock/行式栏自动切换，无 JS、不重置对局 | 无过渡动画（即切即现，承继） |
| 宽屏横屏按压 | 与窄横屏完全一致（同规则块、同按键尺寸） | 同上 |
| 内容让位（≥600px 横屏） | 纯 CSS：`#main` 让位 padding 随媒体查询生效，内容居中于走廊、不被固定双轨遮挡 | 无过渡动画（即切即现，承继） |
| 多指/触摸（承继） | `touch-action:none`、`-webkit-tap-highlight`、`user-select` 防误触；键 z-index:1 盖轨 | 无 |
| 桌面键鼠 | 全部承继既有行为，触控区不显示 | 无 |

**零新增动画**；`prefers-reduced-motion` 全局裁剪承继。

## 4. 视觉规格

### 4.1 Token 复用（零新增 token）

| 用途 | Token / 值 | 说明 |
|---|---|---|
| 键帽/描边/辉光 | `--surface-2`/`--line`/`--glow-primary` | 圆玻璃键帽三态，不变 |
| 旋转主键 | `color-mix(var(--primary) 55%, transparent)` 常亮环 + `16%` 微底 + 图标 `--primary-hi` | r26 定稿，不变 |
| 侧轨底/单边描边 | `rgba(35,35,45,.45)` / `--line` | 不变 |
| 玻璃底栏（竖屏 M/L） | `--glass-bg` + blur(20px) saturate(140%) + 上描边 + 上投影 | 不变，恒写不染皮肤 |
| 圆角/层级 | `--radius-md` / `--z-touchpad` | 不变 |

### 4.2 尺寸与让位规格（横屏 M/L）

| 项 | 值 |
|---|---|
| 键径 | 左十字 56 / 右 Hold 48 + 旋转 80（gap 10） |
| 左轨 `.rail--l` | ≈212px（`margin-left: env(safe-area-inset-left)`）单边右描边 |
| 右轨 `.rail--r` | ≈104px（`margin-right: env(safe-area-inset-right)`）单边左描边 |
| 轨高 | 188px（3×56+2×10） |
| **`#main` 让位** | `padding-left: calc(212px + env(safe-area-inset-left))`；`padding-right: calc(104px + env(safe-area-inset-right))`（仅横屏 ≥600px has-touch 分支生效） |
| 字号（横屏再缩一档） | 图标 16/13/24、标签 10/9/11；旋转图标 24px `--primary-hi` |

### 4.3 四皮肤 × 承载（承继）

| 皮肤 | 侧轨挂点（r26 定稿，不改） |
|---|---|
| A · 玻璃 dock | `.rail--l/.rail--r` 整面板 `--glass-bg` + blur + 单边描边 |
| B · 无底浮键 | 轨底透明，仅键帽投影 |
| C · 渐隐托盘（默认） | 轨内底部渐入渐变 |
| D · 双簇座舱 | 两簇光环托 `--primary-glow` 系（静态 gradient） |

## 5. 可访问性

- **键语义（承继）**：六键 `aria-label` 双语标签；✛ 中心 `aria-hidden` + 无 data-action + `pointer-events:none` 三层保险，不入读屏。
- **尺寸**：横屏键径 56/48/80 ≥ 44px 最小点击目标（AC-12 基线），宽屏横屏同规格。
- **内容不被遮挡（AC-1 新增可达性意义）**：信息面板与系统按钮在宽屏横屏下可见、可点、不被固定双轨覆盖——键盘操作与读屏路径不受让位影响；`#main` 让位不改变 DOM 结构与 aria 语义。
- **safe-area**：横屏双轨上下左右四边贴 `env(safe-area-inset-*)`；`#main` 让位左右同样叠加 `env(safe-area-inset-*)`，与双轨贴边一致避让（承继）。
- **读屏/焦点**：门控与让位均不改变 DOM 与 aria 树，读屏树对横屏设备无新增/缺失节点；桌面 `:focus-visible` 键盘焦点环不变；多指守卫、按压辨识（描边+标签色+辉光三信号）承继。

## 6. 改动面与契约（实现指引，TECH 细化）

- **style.css（唯一代码改动）**：横屏 ≥600px has-touch 分支对 `#main` 叠加左右让位 padding（`212px+inset-left` / `104px+inset-right`）；门控原则：不倒退裸 `@media (orientation: landscape)`（r28），只在 `#main` 上叠加 `>=600px` 让位（可与 `min-width: 600px` 组合，注意不覆盖倒序规则）；板框/面板栅格断点零改动、S 横屏不引入让位。其余 CSS 零 diff。
- **index.html / ui.js / persist.js / game.js / audio.js**：0 diff（AC-7 红线）。
- **verify-ui.cjs**：新增横屏 M/L `#main` 让位/不叠压断言（让位 padding 存在、双轨贴边、内容居中于走廊）+ §r29 段（AC-8）；承接 r28 §r28 段「双轨存在/不落行式栏」断言。
- **qa-e2e-jsdom.cjs**：追加 §r29 横屏 M/L 让位/不叠压断言（几何不相交或 overlap 面积为 0、无横向滚动）（AC-2/AC-8）；若环境允许补真实浏览器视觉/几何探测。
- **红线复核**：VERSION 不动、TOUCH_KEYS 与回放器 0 逻辑改动、七套脚本全绿、r24/r26/r27/r28 既有断言零回归（AC-6/7/8）。

---

<!-- state -->{"phase":"design","summary":"r29 DESIGN 已交付任务夹：修 r28 横屏双轨叠压——核心裁定=横屏 M/L（≥600px has-touch）下 #main 内容区左右各让出双轨宽度（padding-left calc(212px+env(safe-area-inset-left))、padding-right calc(104px+env(safe-area-inset-right))），形成 [左轨, vw−右轨] 居中走廊，双轨维持 position:fixed 贴左右边缘、内容/信息面板/系统按钮不被遮挡（AC-1）；门控原则不倒退裸 landscape（r28）、只叠加 >=600px 让位、板框 340 固定列与面板栅格断点零改动；窄屏 S 横屏不引入让位（AC-3）、竖屏 M/L 行式底栏与 S dock 零变化（AC-4）、桌面非触控零变化（AC-5）；双轨结构/键径 56/48/80/键位语义/四皮肤挂 .rail/safe-area/z-index 盖键/三态动效全承继零动，零新增 token/动画；走廊几何余量（340 板框+180×2 面板+2×24 gap 与让位后剩余宽度）设计级裁定下发 TECH 核算 + AC-2 真实浏览器几何/视觉探测兜底，防横向滚动与叠压漏检（r28 只做算术漏检的针对性补强）；改动面仅 style.css + verify-ui/qa-e2e 断言 + 条件性真实浏览器探测，index.html/ui/persist/game/audio 0 diff，VERSION 不动、TOUCH_KEYS/回放器 0 逻辑", "memory":["r29 核心设计裁定：横屏 M/L（≥600px has-touch）#main 左右让出双轨宽（≈212px+inset-left / ≈104px+inset-right），内容居中走廊、双轨贴边不叠压；门控=裸 landscape（不倒退 r28）+ 仅在 #main 叠加 >=600px 让位；S 横屏不引入让位、竖屏/桌面零变化","双轨结构/键位(上软降/下硬降)/键径 56/48/80/四皮肤挂 .rail/safe-area/z-index 盖键/三态动效全承继 r26/r28 零动；零新增 token/动画","关键几何风险已识别并下发：走廊宽=vw−316−inset，板框中央列固定 340px、两侧面板 minmax(180px,1fr)，低档走廊容不下完整三列→复用既有 flex 列堆叠回退，精确余量与防横向滚动交 TECH 依断点核算 + AC-2 真实浏览器几何/视觉探测兜底（r28 仅算术漏检的针对性补强）","改动面红线：style.css 唯一代码改动（横屏 >=600px #main 让位）+ verify-ui/qa-e2e 断言（横屏 M/L 让位/不叠压/几何不相交/无横向滚动）；index.html/ui/persist/game/audio 0 diff、VERSION 不动、TOUCH_KEYS 与回放器 0 逻辑、七套全绿、r24/r26/r27/r28 断言零回归"]}<!-- /state -->
