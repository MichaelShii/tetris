# r17 全面响应式重排 — 技术方案（TECHNICAL）

> meta 摘要：Tetris v3.4 响应式重排技术方案——纯 CSS 四档布局（S 竖屏单列 / S 横屏变体 / M 平板多列 / L 桌面零改动），`display:contents`+`order` 跨面板列序而 DOM 不重排，`--dock-h` 单一事实来源垫底保 0 重叠；ui.js/engine 零改动，VERSION 不升（r16 先例）；改动面仅 index.html / style.css / verify-ui.cjs / qa-e2e-jsdom.cjs；任务 T1~T4 并行 → T5 串行收口（git 动作随收口）。
> 基线依赖：docs/teamflow/20260827-r16-mobile-touch-controls（AC-1~14 全部不得回归：六键逐键等效/显隐/多指/防默认行为/PAUSED·OVER 无副作用）；取代：无（本需求只重排布局，不改任何既有已验证行为）。
> 设计依据：本夹 PRD §3 断点规格 + DESIGN §3/§5（本方案是其数值实现层，含两处算术订正，见 §6.8）。

---

## 0. 结论速览（决策清单）

| # | 决策 | 结论 | 依据 |
|---|---|---|---|
| D1 | 布局实现方式 | **纯 CSS 媒体查询**，断点切换零 JS、零引擎触达 | PRD §3 R2；DESIGN M3 |
| D2 | S 档跨面板列序 | `display:contents` + `order`，**DOM 不重排**（保 L 档 grid 基线） | DESIGN §0.3 / §3.1 |
| D3 | 底部 dock 几何 | S 竖屏**两行 dock**，`min-height: max(--dock-h, 16.5vh)` 中心带全样本达标 | PRD AC-11；见 §6.4 算术订正 |
| D4 | M 档列数算术 | ≥768 三列 `minmax(180px,1fr) 340px minmax(180px,1fr)`；600–767 两列 `minmax(0,1fr) 340px` | PRD AC-6；DESIGN §3.3 总宽 688 系印刷误算（740+48=788>768），改 minmax 吸收 |
| D5 | VERSION | **代码头 VERSION 不升**（三模块保持 '2.3.0' 一致，verify-constants 零改动全绿）；产品版本 v3.4 在 memory 迭代索引登记 | r16 TECH 先例「VERSION 不升（沿用 2.3.0）」；memory §版本号语义 |
| D6 | verify-constants 存量漂移 | **不顺手修正**：统一升号须动 game/audio 代码头（违反 0-diff）+ memory 约定「仅外发升位」；维持现状，待办追加「r17 复核」注记 | PRD §9 交本方案裁定 |
| D7 | AC-4 按钮 44px | S/M 档 `html.has-touch .btn { min-height:44px }`；L ≥1024 保持 r16 基线按钮 40px（鼠标态，几何零回归优先，48px tkey 满足触屏核心操作） | PRD AC-4 P0；AC-7 优先 |
| D8 | ui.js | **0 行改动**（红线段），布局纯 CSS 表达 | DESIGN §8.3 |

---

## 1. 背景与范围

**目标**：移动端界面贴合操作习惯的全面响应式重排（G1~G4，PRD §1）。本方案与 r16 的关系：**只动布局层**——引擎/音效/持久化/输入语义全部按 r16 交付态原样继承。

**改动红线（0-diff）**：`game.js` / `audio.js` / `persist.js` / `ui.js` / `scripts/verify-game.cjs` / `scripts/verify-audio.cjs` / `scripts/verify-persist.cjs` / `scripts/verify-constants.cjs` / `scripts/assembly-check.cjs` 一律不动（收口时 `git diff --stat HEAD -- <名单>` 须为空）。`VERSION` 不升（D5）。

**改动面（仅 4 文件）**：

| 文件 | 改动性质 | 对应 AC |
|---|---|---|
| `index.html` | .stat-grid 包裹（4 统计块）+ viewport-fit=cover | AC-1/AC-3/AC-7 |
| `style.css` | 断点框架（§7 新增大区，全部规则在媒体查询内；外加 1 条 .stat-grid 基座规则） | AC-1~11 |
| `scripts/verify-ui.cjs` | +3 断点结构断言（17→20） | AC-13 |
| `scripts/qa-e2e-jsdom.cjs` | +r17 段（AC-8 跨档状态不变 / AC-5 显隐复用 / 静态证据） | AC-1/2/5/8/12 |

---

## 2. 数据模型与存储

**无新增数据模型、无新增持久化字段**。布局档位不是状态——由 CSS 媒体查询派生，不进 game.js 快照、不进 persist 载荷、不进任何 JS 闭包。理由：

1. **档位=派生值而非状态**：断点切换只重算样式（AC-8「无重载、无引擎重置」由构造保证而非运行时保证）；若把档位写进 JS 状态，就引入了「状态-样式」同步点，违背 DESIGN M3 与 PRD R2「断点切换纯净 CSS、禁止触达引擎状态」。
2. **存储契约不变**：persist.js 的 `load/saveHighScore/saveSettings` 载荷（volume/muted/ghostEnabled/bgmEnabled/wallKickEnabled/holdEnabled/previewQueueEnabled）逐字段不增不减——布局偏好（如「是否记住档位」）明确不做，属于随时变环境，应实时响应视口而非记忆。
3. **唯一新增「常量」在样式层**：`--dock-h`（媒体查询内重声明的自定义属性，见 §6.4），是布局几何的单一事实来源，不属于游戏数据模型。禁在 ui.js 数字硬编码对应值（否则两处漂移）。

---

## 3. API 设计

### 3.1 运行时 API：零变更

ui.js 导出面（`createUI/createBoardRenderer/.../TOUCH_KEYS/isTouchDevice/createTouchControls`）与 game.js/audio.js/persist.js 导出面全部不变；装配根 index.html 内联脚本零改动。`createUI` 的 `opts.touch`/`onSnapshot` 等既有选项语义不变。

### 3.2 断点「伪 API」：媒体查询规格（实现侧唯一契约）

四条媒体规则与既有规则的关系（**全部追加在 style.css 文件末尾新增大区 §7，源序靠后=胜出，不修改既有任何规则**）：

| 规则 | 命中视口 | 覆盖关系（源序胜出） |
|---|---|---|
| `@media (max-width: 599px)` | S 竖屏（含 ≤379 窄屏既有兜底仍生效） | 覆盖既有 `≤1100px` 堆叠（flex column）→ 单列卡片流 |
| `@media (max-width: 599px) and (orientation: landscape)` | S 横屏变体（568×320 等，h<w） | 覆盖上一条的竖屏布局 → 横排紧凑 |
| `@media (min-width: 600px) and (max-width: 767px)` | M 窄版（600–767） | 覆盖既有 `≤1100px` 堆叠 → 两列（棋盘主区+信息列） |
| `@media (min-width: 768px) and (max-width: 1023px)` | M 宽版（768–1023） | 覆盖既有 `≤1100px` 堆叠 → 三列（棋盘居中） |
| L ≥1024px | **零新增规则** | 既有基座三列 `240|340|240` + 既有 `≤1100px` 堆叠（1024–1100 降级）原样 |

**边界互斥**：599/600 无重叠无缝隙（max-width:599 vs min-width:600）；767/768 同理。L 档一条新规则都没有 → r16 基线几何快照天然通过（AC-7）。

### 3.3 测试 API：verify-ui 断点结构断言（Node 零 DOM）

verify-ui 沿用 r16「Node 契约+交叉校验」先例，新增 3 条**源结构断言**（读取 style.css/index.html 文本做正则/包含断言，不引入 jsdom、不做运行时布局计算——PRD R4 明确 jsdom 无法验证真实视口几何，几何落 QA 真机清单）。断言契约见 §7.2。

---

## 4. 前端结构与组件拆分

### 4.1 index.html（最小改动，2 处）

1. **`.stat-grid` 包裹**（AC-1）：`#stat-score` / `#stat-hi` / `#stat-level` / `#stat-lines` 四个 `.stat` 原序包入
   `<div class="stat-grid" role="group" aria-label="对局统计">…</div>`。`#stat-hi`、`.hold-well`、`.next-well`、`#btn-settings` 及其余 DOM 零改动。
   **L 档几何保真关键**：`.stat-grid` 需一条**非媒体基座规则**复刻原间距（见 §5.1 S0），否则包裹后四个 `.stat` 失去 `#panel-left` 的 flex gap，L 档快照会漂移（AC-7）。
2. **`viewport-fit=cover`**（AC-3）：`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`——iOS 下 `env(safe-area-inset-bottom)` 非零的前提；缺它刘海/底部条设备 AC-3 永远 0 值无法验证。

### 4.2 style.css（断点框架 = 本需求主体）

新增大区 **`/* ═══ 7. 响应式断点框架（r17）═══ */`**（文件末尾、§6 之后；源序保证所有新规则压过既有 ≤1100 堆叠与 379/480 窄屏规则）。规则明细见 §5。

### 4.3 ui.js（0 改动契约）

- `createUI` 在 S/M/L 任意档位下装配路径相同：`#touch-controls` 存在即建触屏控制器、`has-touch` 类归属 add/remove、`resize` 监听仅重烘焙 DPR——**全部不感知档位**。
- 触控区两行 dock 只改 `.touchpad` 容器 CSS（`flex-wrap`），六键 `.tkey` 组件/事件绑定/`TOUCH_KEYS` 逐字节不变（AC-4、r16 AC-9/AC-12 天然保持）。
- 若 QA 暴露个别弹层布局问题，允许 ui.js 只读 DOM 类判断（不允许新状态、不允许触达引擎）；**验收前 ui.js 必须 0 diff**，任何动 ui.js 的需求须在 PRD 层追加取代项。

### 4.4 组件归属（S 档卡片化后不变：组件体系零新增）

模块清单与 r16 完全一致（背景/header/panel-left/board-col/panel-right/遮罩/toast/设置弹层/touchpad）。S 档新增的只是「同一批组件在单列流中的组织方式」：`.stat-grid`、`#btn-settings`、`.next-well`、`#board-col`、`.hold-well`、`.key-hints`、`#controls` 各自成玻璃卡（复用 `--glass-bg`/`--line`/`--radius-md`/`--sp-3` 内边距/`--sp-4` 外距），无新 DOM 层、无新 token。

---

## 5. 关键实现规格（style.css 逐条）

### 5.0 基座（非媒体查询，唯一一条）

```css
/* r17：统计块归一包裹 —— L 档复刻 #panel-left 原 flex gap(20px)：
   无此规则则包裹后四个 .stat 失去间距，L 快照漂移（AC-7） */
.stat-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
```

### 5.1 S 竖屏单列 `@media (max-width: 599px)`

```css
:root {
  /* 底部预留单一事实来源：两行 dock 净高 = 2×键 + 行距16 + 上下内边距 2×16 + safe insets */
  --dock-h: calc(2 * var(--tpad-key) + var(--sp-4) + 2 * var(--sp-4) + env(safe-area-inset-bottom));
}
/* env() 渐进增强兜底（不支持 env 的旧内核 → 退化 0）：
   所有含 env() 的新声明先写无 env 兜底行、再写 env 行；--dock-h 同理双行。 */

#main {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: var(--dock-h);   /* 滚底时最后一块卡停在 dock 上沿（AC-2 零重叠） */
}
#panel-left,
#panel-right { display: contents; }  /* 摊平：子块参与 #main flex 的 order 排序 */

/* 列序（ORDER 表 = PRD US-1 信息流：标题→统计→设置→预览→棋盘→Hold→按钮） */
.stat-grid   { order: 10; }
#btn-settings{ order: 20; }
.next-well   { order: 30; }
#board-col   { order: 40; }
.hold-well   { order: 50; }
.key-hints   { order: 60; }
#controls    { order: 70; }

/* 卡片化（玻璃卡：--glass-bg + blur + 1px --line + --radius-md + --sp-3 内距 --sp-4 间距） */
.stat-grid, #btn-settings, .next-well, #board-col, .hold-well, .key-hints, #controls {
  width: 100%;
  max-width: 420px;                 /* 320~430 样本下不撑满、不溢出（AC-1） */
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: var(--sp-3);
  margin: var(--sp-2) 0;
}
#board-col { padding: 0; }          /* 板框自带 16px 内距，卡化不叠加 */

/* HUD 2×2（AC-1/AC-10） */
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

/* 两行 dock（AC-2/3/4/11）：仅容器 flex-wrap，.tkey 组件零改动 */
.touchpad {
  flex-wrap: wrap;
  align-content: center;            /* 行间空间均分，中心带见 §6.4 表 */
  gap: var(--sp-4) var(--sp-2);     /* 行距 16 ≥8、键距 8（AC-11） */
  padding: var(--sp-4) var(--sp-4) calc(var(--sp-4) + env(safe-area-inset-bottom));
  min-height: max(calc(2 * var(--tpad-key) + var(--sp-4) + 2 * var(--sp-4) + env(safe-area-inset-bottom)), 16.5vh);
}
.touchpad .tkey:nth-child(3) { margin-right: 0; }  /* r16 组距规则在新两行布局复位 */

/* AC-4：触屏下 S 档全部可点元素 ≥44（按钮 40px 基座抬高到 44） */
html.has-touch .btn { min-height: 44px; }

/* AC-10 可读性下限：既有 token 已满足（分数 32、数值 24、标签 12），
   本档复查保证无缩放；如开发微调字号，以下为下限锚点：
   .stat-grid .stat__value { font-size: max(var(--fs-lg), 16px); } */
```

> 溢出保障（AC-1）：`body{overflow-x:hidden}` 既有；卡宽 `max-width:420px` + 100%，320px 视口下棋盘卡内板框 312px ≤ 320 ✓。
> 触控区为 `position:fixed`，不参与文档流（AC-1 包围盒断言只测流内面板）。

### 5.2 S 横屏变体 `@media (max-width: 599px) and (orientation: landscape)`

```css
#main {
  flex-direction: row;              /* 覆盖 5.1 的 column 与既有 ≤1100 堆叠（源序胜出） */
  align-items: center;
  justify-content: center;
  padding-bottom: 0;                /* 竖屏预留对本档无意义 */
}
#panel-left,
#panel-right { display: flex; }     /* 复位 display:contents → 正常横排（DOM 序：左面板|棋盘|右面板） */
#panel-left, #panel-right { width: auto; flex: 0 0 auto; }
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));  /* HUD 横带（AC-9） */
  gap: var(--sp-2);
}
#title { font-size: var(--fs-xl); } /* 标题压缩 36→24（省空间） */
/* 棋盘 CSS 等比缩放（显示层，不碰画布分辨率/渲染逻辑）：
   renderer.resize() 写入的 inline 尺寸需 !important 覆盖；内核保持 280:560 比例自动缩放 */
#board {
  width: auto !important;
  height: auto !important;
  max-height: calc(100vh - <header+hud+按钮+安全区 预留量，开发期以 568×320 / 640×360 双样本对拍微调>);
}
html.has-touch .btn { min-height: 44px; }
```

> 键位保留 r16 侧轨（`@media (orientation:landscape)` 既有规则零改动）：左 ◀▶⟳ / 右 ▼⤓Hold（AC-4/AC-9）。
> 本档不适用两行 dock 与 `--dock-h` 预留（中心带断言仅限 S 竖屏，DESIGN §5.3）。

### 5.3 M 平板两列 `@media (min-width: 600px) and (max-width: 767px)`

```css
:root {
  --dock-h: calc(var(--tpad-key) + 2 * var(--sp-2) + env(safe-area-inset-bottom)); /* 单行底栏 64+inset */
}
#main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;  /* 棋盘主区 | 信息列 */
  gap: var(--sp-6);
  align-items: start;
  padding-bottom: var(--dock-h);                /* AC-6：与棋盘 0 重叠 */
}
#board-col   { grid-column: 1; grid-row: 1 / span 2; }
#panel-left  { grid-column: 2; grid-row: 1; }
#panel-right { grid-column: 2; grid-row: 2; }
html.has-touch .btn { min-height: 44px; }
```

### 5.4 M 平板三列 `@media (min-width: 768px) and (max-width: 1023px)`

```css
:root { --dock-h: calc(var(--tpad-key) + 2 * var(--sp-2) + env(safe-area-inset-bottom)); }
#main {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 340px minmax(180px, 1fr); /* 768: (768−340−48)/2=190 ✓ */
  gap: var(--sp-6);
  align-items: start;
  padding-bottom: var(--dock-h);
}
/* 三子块 grid 自动放置 = 左面板 | 棋盘 | 右面板（信息分居两侧，AC-6「≥2 列分布」） */
html.has-touch .btn { min-height: 44px; }
```

> 算术订正（D4）：DESIGN §3.3「200px 340px 200px + gap24 = 总宽 688」系误算（740+48=788，768 视口会溢出）；改为 `minmax(180px,1fr)` 双侧吸收 → 768 处每侧 190px，AC-6 无横向滚动成立。两列/三列拆成两条互斥媒体查询（600–767 / 768–1023），比 DESIGN 嵌套写法更干净。

### 5.5 L 桌面 ≥1024px

**零新增规则**。既有基座三列 `240|340|240` + 既有 `≤1100px` 单列堆叠 + r16 触屏规则全部原样。AC-7 几何快照比对 = 与 r16 基线逐像素一致（`git diff style.css` 在 ≥1024 路径下无新选择器即为证据，收口时人工比对截图）。

---

## 6. 关键实现点与边界情况

1. **`display:contents` 支持面**：Chrome 65+/Firefox 37+/Safari 11.1+（现代移动 WebView 全覆盖）。降级路径：不支持的浏览器下 S 档退化为「两面板纵向叠放」（`#main` flex column 仍生效），可玩但非卡片流——登记为已知降级，不做 polyfill（零依赖红线）。
2. **`order` 生效前提**：`display:contents` 摊平后子块是 `#main`（flex 容器）的直接子项，`order` 才有效；若误把 order 挂在 `.panel` 上（display:contents 无盒）会静默失效——verif-u 静态断言 S 档含 `display: contents` 规则防此漂移（§7.2）。
3. **`--dock-h` 单一事实来源**（AC-2）：`#main` 的 `padding-bottom` 与 `.touchpad` 的净高共用同一 calc（两行：`2×键+行距+2×内边距+inset`；M：`键+2×边距+inset`）。**禁在 ui.js 或常量表发生硬编码数字副本**（如 136px），否则断点内计算与预留漂移 → 0 重叠失效。
4. **中心带算术订正（D3，相对 DESIGN §3.5 表）**：DESIGN 表内 430×932 行用 h=136 时中心 = (932−68)/932 = **92.7% > 92% 反而不达标**（其 152 与前文公式自相矛盾）。修正为：`--dock-h` 基础值用 `2×--sp-4` 内边距（48px 键 → 144+inset），并加 `min-height: max(…, 16.5vh)` 抬升矮高比宽屏。全样本验算：

   | 样本（key/inset） | --dock-h 基础 | min-height 实际 | dock 中心 | 上缘 | 总高≤45% | 中心带 55–92% |
   |---|---|---|---|---|---|---|
   | 320×568（44px/0） | 136 | max(136, 93.7)=136 | 88.0% | 76.1% | ✓ | ✓ |
   | 375×667（48px/0） | 144 | max(144, 110.1)=144 | 89.2% | 78.4% | ✓ | ✓ |
   | 390×844（48px/0） | 144 | max(144, 139.3)=144 | 91.5% | 82.9% | ✓ | ✓ |
   | 430×932（48px/0） | 144 | max(144, 153.8)=153.8 | 91.7% | 83.5% | ✓ | ✓ |
   | 390×844（48px/34） | 178 | max(178, 139.3)=178 | 89.5% | 78.9% | ✓ | ✓ |
   | 430×932（48px/34） | 178 | max(178, 153.8)=178 | 90.5% | 80.9% | ✓ | ✓ |

   ≤379px 窄屏键 44px 既有规则保持（基础 h=136），568 高上中心 88.0% 仍达标。
5. **safe-area 渐进增强**（AC-3）：所有新增 env() 声明前一行写无 env 兜底（如 `padding-bottom: calc(var(--sp-4) + 8px)` 再写 env 行）——旧内核把未知函数整条声明作废时退回 8px 底线；`viewport-fit=cover`（§4.1）是 iOS env() 非零的前提。
6. **断点切换与状态（AC-8）**：resize/旋转 = 媒体查询命中重算 → 瞬时重排、**无过渡动画**（避免重排中间态被几何断言误判）；ui.js 的 resize 监听只重烘焙 DPR（既有行为），不触引擎。390→1024→390、320×568↔568×320 全程无重载无重置（构造保证 + e2e 断言，§7.3）。
7. **读取与无障碍**：S 档焦点序 = DOM 序（视觉 Hold 在棋盘后、焦点序在前）——保 L 基线不重排 DOM 的必然取舍（DESIGN §5.3；AC-12 只要求可达可点）。卡片化不破坏原生 `<button>`（settings/controls/overlay 按钮全部保留）；`:focus-visible` 既有 2px 外环不受影响。
8. **AC-4 按钮 44px 判定**（D7）：S/M 档 has-touch 下 `min-height:44px` 规则覆盖全部 `.btn`；L ≥1024 保持 r16 基线（鼠标 40px、触屏 Surface 用 48px tkey 完成核心操作，与 r16 验收口径一致——若产品验收坚持 L 触屏桌面按钮同样 44，追加 `@media (min-width:1024px){ html.has-touch .btn{min-height:44px} }` 一条并同步 AC-7 快照口径，需在验收记录标注）。
9. **`#board` 横屏缩放**：renderer `resize()` 写入 inline `width/height:280/560px` → 横屏媒体规则必须 `!important` 覆盖并同时置 `width:auto;height:auto`（保持固有 1:2 比例缩放）；改动仅显示层，画布分辨率/渲染逻辑零影响（AC-9 最小代价）。
10. **jsdom 局限（PRD R4）**：jsdom 无真实布局/媒体查询求值 → 几何类断言全部以「源结构断言 + 静态证据」（cssText/htmlText 正则，r16 先例）+「e2e 行为断言」表达；真实几何（包围盒/中心带/滚动位移）进 QA 真机补测清单。

---

## 7. 测试策略

### 7.1 七套脚本出口（AC-13）

| 脚本 | 本轮动作 | 出口 |
|---|---|---|
| verify-game / verify-audio / verify-persist | 不动 | 全绿（0 行 diff） |
| verify-ui | **+3**（17→20） | 全绿 |
| verify-constants | 不动（EXPECTED_VERSION 仍 '2.3.0'，D5） | 全绿 |
| assembly-check | 不动（`#stat-score .stat__value` 为后代选择器，包裹后仍命中） | 全绿 |
| qa-e2e-jsdom | **+r17 段**（含 AC-8 跨档/AC-5 显隐/静态证据） | 全绿 |

### 7.2 verify-ui.cjs 新增 3 条（Node 源结构断言，零 DOM）

1. **r17 断点框架存在性**：`style.css` 文本含 `@media (max-width: 599px)`、`@media (max-width: 599px) and (orientation: landscape)`、`@media (min-width: 600px) and (max-width: 767px)`、`@media (min-width: 768px) and (max-width: 1023px)`、`--dock-h`、`display: contents`（防 §6.2 静默失效）；且基座 `grid-template-columns: 240px 340px 240px` 仍在媒体查询外（L 档零改动证据）。
2. **index.html .stat-grid 契约**：`<div class="stat-grid"` 包裹 `#stat-score`…`#stat-lines` 四块且先于 `.hold-well`/`.next-well`（源序正则）；`viewport-fit=cover` 存在。
3. **dock 单一事实来源**：S 档 `--dock-h` 定义含 `2 * var(--tpad-key)` 与 `env(safe-area-inset-bottom)`；`#main { padding-bottom: var(--dock-h) }` 存在；`.touchpad` 在 S 媒体内含 `flex-wrap` 与 `min-height: max(`。

### 7.3 qa-e2e-jsdom.cjs 新增 r17 段（AC-8/AC-5/AC-12 + 静态证据）

- **AC-8 跨档不丢状态**：createUI（autoLoop:false, rng 固定）→ start → 手动 tick → 捕获快照摘要（score/lines/level/board 首尾行/piece/queue/hold）；连续 5 轮向 window 派发不同宽度 resize（含 390↔1024、568×320↔320×568 的 matchMedia 桩切换）→ 每轮断言摘要逐字段一致、phase 仍 RUNNING、`location.hash`/history 未变（无重载信号）→ 再 tick 一次仍可继续游玩。
- **AC-5 显隐不重置**：`{touch:true}` 实例下增删 `html.has-touch` 类 + rotate snap 前后一致（r16 AC-1 已有，r17 段复用以 cover 各档语义）。
- **AC-12 全流程可达保持**：既有按钮流（READY→RUNNING→PAUSED→OVER→RESTART）与触屏六键语义断言原样保留，r17 段不降级。
- **静态证据**（沿用 r16 段 cssText/htmlText 先例）：S 档 `flex-direction: column` + order 表存在；`--dock-h` + padding-bottom 引用存在；M media 存在；`html.has-touch .btn` 44px 规则存在；`.stat-grid` 基座 gap `var(--sp-5)` 存在（AC-7 保真锚点）。
- 已有 237+ 断言全部保持原语义，r17 段只增不减。

### 7.4 QA 真机人工补测清单（几何不可自动化部分，来自 DESIGN §8.5）

iOS 刘海/底部条 inset=34 与 Android 手势条下 dock 内容完整可见（AC-3）；568×320 横屏全面板可见可玩（AC-9）；平板 768/834 横竖各档无溢出、棋盘居中（AC-6）；多指同压互不串扰（AC-11）；旋转中断点切换 5 次无漂移（AC-8）；L 档与 r16 基线截图几何比对（AC-7）；S 档中心带 55–92% 与滚动前后 dock 位置不变（AC-2/AC-11）。

---

## 8. 任务拆分（按文件边界，与 PRD 工程约束对齐）

**并行策略**：T1/T2 文件互斥可并行 → T3（依赖 T2 的规则形态）与 T4（依赖 T1 的 DOM）在 T1/T2 稳定后并行 → T5 串行收口。**红线**：任何任务不得触碰 game.js/audio.js/persist.js/ui.js/其余五个脚本；`git diff --stat HEAD` 仅允许 4 个改动文件 + 任务夹。

| # | 任务 | 文件 | 接口/验收点 |
|---|---|---|---|
| **T1** | index.html 最小改动：.stat-grid 包裹四统计块（原序）+ viewport-fit=cover | `/index.html` | `#stat-score .stat__value` 等后代选择器仍命中（assembly-check 绿）；verify-ui r17-2 过；L 档装配无感 |
| **T2** | style.css 断点框架：§7 新区（S 竖屏 §5.0/5.1 + S 横屏 §5.2 + M 两列 §5.3 + M 三列 §5.4 + --dock-h 双档）+ .stat-grid 基座 | `/style.css` | verify-ui r17-1/r17-3 过；既有 ≤1100/379/480 规则原样未动；e2e 静态证据过 |
| **T3** | verify-ui.cjs +3 断点结构断言（17→20） | `/scripts/verify-ui.cjs` | `node scripts/verify-ui.cjs` 20/20 绿；断言只读源文本，不引 jsdom |
| **T4** | qa-e2e-jsdom.cjs r17 段：AC-8 跨档 5 次状态不变 + AC-5 复用 + 静态证据 | `/scripts/qa-e2e-jsdom.cjs` | `node scripts/qa-e2e-jsdom.cjs` 全绿；既有断言逐条保持 |
| **T5** | 收口：七套全绿逐条执行 + `git diff --stat HEAD -- game.js audio.js persist.js ui.js …` 为空 + verify-constants 存量漂移按 D6 记录（memory 待办追加「r17 复核」注记）+ memory 迭代索引登记 v3.4 行 + **git 提交**（分支 feat/responsive-layout：任务夹 PRD/DESIGN/TECHNICAL + 实现 4 文件 + memory.md 同批一次提交，仿 r16 先例） | 全仓 | 七条命令全绿日志入 logs/teamflow/；提交信息 `feat(Tetris v3.4): 全面响应式重排 - 竖屏单列+底部触控区+三档断点（+ r17 任务夹产物入库）` |

> git 动作（PRD §9）：全程保持分支 `feat/responsive-layout`；实现基线 HEAD 9546d07；提交动作**只在 T5**，任务夹未提交产物与实现代码同批入库；开发过程中不新建分支、不中途提交。

---

<!-- blueprint -->{"summary":"r17 响应式重排 = 纯 CSS 断点框架（media query 四档 + display:contents/order 跨面板列序 + --dock-h 单一事实来源垫底），ui.js/引擎全 0 改动，验证层以源结构断言表达 jsdom 不可达的几何","modules":{"/index.html":{"responsibility":".stat-grid 包裹四统计块（S 档 2×2 卡的数据来源）+ viewport-fit=cover（iOS safe-area 前提）；其余 DOM 零改动","dependsOn":[],"assemblyOrder":1,"why":"DOM 顺序=L 档 grid 自动放置基线，禁重排；仅加无样式包裹层与 meta 一处，改动最小且可被 verify-ui 源断言钳制"},"/style.css":{"responsibility":"§7 断点框架：S 竖屏单列卡片流（display:contents+order）+/两行 dock+16.5vh 中心带/S 横屏横排+棋盘缩放/M 两列·三列/L 零新增+--dock-h 双档 calc+has-touch 按钮 44px；外加 .stat-grid 基座 gap:sp-5 复刻 L 间距","dependsOn":["/index.html"],"assemblyOrder":2,"why":"布局全部 CSS 派生→断点切换零 JS 零引擎触达（AC-8 构造保证）；--dock-h 单一事实来源防主区预留与 dock 高度漂移；全部新规则源序追加压过既有 ≤1100 堆叠，L 档无新选择器=AC-7 快照即证据"},"/scripts/verify-ui.cjs":{"responsibility":"+3 断点源结构断言（17→20）：断点 media 存在性与 L 基座不动/stat-grid 包裹契约/dock 单一事实来源 calc 形状","dependsOn":["/style.css","/index.html"],"assemblyOrder":3,"why":"Node 零 DOM 可跑（PRD R4：jsdom 无法验证真实视口几何），只断言样式/class 层结构防实现漂移；沿用 r16 TOUCH_KEYS 交叉校验的源断言先例"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"+r17 段：AC-8 跨档 resize 5 次快照逐字段不变（无重载无重置）+AC-5 has-touch 显隐复用+静态证据（cssText 正则：S 列序/--dock-h/M media/按钮 44/.stat-grid 基座）","dependsOn":["/index.html","/style.css"],"assemblyOrder":4,"why":"jsdom 内可行为验证的部分（引擎状态不因 resize 漂移、类切换不重置）走真实 DOM 装配，几何部分以源文本静态证据表达（r16 段同款），真机几何留 QA 人工清单"},"/ui.js":{"responsibility":"不改（0 diff 红线）：createUI 装配路径/触屏控制器/has-touch 类归属/resize 仅重烘焙 DPR 全不感知档位","dependsOn":[],"assemblyOrder":0,"why":"布局纯 CSS 表达即不引入 JS 档位状态；两行 dock 只改 .touchpad 容器 flex-wrap，.tkey 组件/TOUCH_KEYS 逐字节不变→r16 AC-9/AC-12 天然保持"},"/game.js,/audio.js,/persist.js":{"responsibility":"不改（0 diff 红线）；引擎状态唯一事实来源，跨档切换不得触达（PRD R2）","dependsOn":[],"assemblyOrder":0,"why":"断点=派生样式非状态；一旦 JS 介入即产生状态-样式同步点，破坏纯 CSS 承诺"},"/scripts/verify-constants.cjs":{"responsibility":"不改：EXPECTED_VERSION 保持 '2.3.0' 与三模块代码头一致（D5/D6 裁定：代码头 VERSION 不升、存量漂移待办不顺手修正，维持全绿）","dependsOn":[],"assemblyOrder":0,"why":"升号须动 game/audio 代码头违反 0-diff 且与 memory「仅外发升位」约定冲突；v3.4 只是文档层发布版本登记"},"duplications":["--dock-h 计算与 .touchpad 自身 padding/净高必须同源（calc 形状复用），禁止 ui.js/常量表出现 136/144px 等硬编码副本（§6.3 红线）","D4 算术订正：DESIGN §3.3『200|340|200 + gap24 = 688』与 §3.5『430×932 h=136 达中心带』均为印刷误算，本方案以 minmax 吸收与 16.5vh min-height 修正（§6.4/§5.4）","r16 组距规则 .tkey:nth-child(3) margin-right 在 S 两行 dock 内产生非对称行尾，须 S 媒体内复位（§5.1）"]},"tasks":[{"title":"T1 index.html：.stat-grid 包裹 + viewport-fit=cover","files":["/index.html"],"spec":"四统计块原序包入无样式包裹层，meta 增 viewport-fit=cover；L 档装配无感、assembly-check 后代选择器仍命中"},{"title":"T2 style.css：§7 断点框架全量（S/M/横屏/dock/--dock-h/基座）","files":["/style.css"],"spec":"按 §5.0~5.5 逐条落地，媒体规则源序追加不改既有任何规则；verify-ui r17-1/3 与 e2e 静态证据全过"},{"title":"T3 verify-ui.cjs：+3 断点源结构断言","files":["/scripts/verify-ui.cjs"],"spec":"17→20 条全绿；断言只读 style.css/index.html 源文本，不引 jsdom"},{"title":"T4 qa-e2e-jsdom.cjs：r17 段（AC-8 跨档/AC-5/静态证据）","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"resize 风暴 5 轮快照逐字段不变+类切换不重置+cssText 静态证据；既有断言零改动"},{"title":"T5 收口：七套全绿 + 0-diff 核验 + VERSION 裁定记录 + git 同批提交","files":["/index.html","/style.css","/scripts/verify-ui.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"七条命令全绿日志入 logs/teamflow/；git diff 仅 4 文件+任务夹；memory 登记 v3.4；分支 feat/responsive-layout 单次提交"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r17 响应式重排 TECH 已单次写入任务夹：纯 CSS 四档（S<600 单列 display:contents+order 卡片流+两行 dock / S 横屏横排+棋盘等比缩放 / M 600-767 两列·768-1023 三列 minmax 吸收 / L≥1024 零新增规则），--dock-h 双档 calc 单一事实来源垫 main padding-bottom 保 0 重叠；ui.js/engine/持久化 0 行 diff，代码头 VERSION 不升（r16 先例，verify-constants 存量漂移裁定不顺手修正），产品版本 v3.4 走 memory 登记；改动面仅 index.html(.stat-grid+viewport-fit=cover)/style.css(§7 新区+stat-grid 基座复刻 L gap)/verify-ui+3 源结构断言/qa-e2e+r17 段(AC-8 resize 5 轮快照不变+静态证据)；两处算术订正(DESIGN 200|340|200=688 误算→minmax(180,1fr)；430×932 h=136 中心 92.7% 破带→--dock-h 2×sp-4+min-height:max(..,16.5vh) 全样本 88-91.7% 达标)；T1/T2 并行→T3/T4 并行→T5 串行收口(git 同批提交 feat/responsive-layout)","memory":["r17 TECH：布局=派生样式非状态，断点切换零 JS 零引擎触达（AC-8 构造保证）；档位不进快照/持久化/JS 闭包","index.html 仅 2 处：.stat-grid 包裹（配合基座 .stat-grid{gap:var(--sp-5)} 复刻 L 间距防 AC-7 漂移）+ viewport-fit=cover（iOS env() 非零前提）","--dock-h 双档：S 竖屏=2×键+sp-4+2×sp-4+inset（基 144,min-height:max(..,16.5vh)，六样本中心 88.0-91.7% 全达）；M=键+2×sp-2+inset（单行底栏）；禁 ui.js 硬编码副本","M 档算术订正：≥768 用 minmax(180px,1fr) 340px minmax(180px,1fr)（768 处每侧 190px，DESIGN 688 误算），600-767 两列 minmax(0,1fr) 340px；拆两条互斥媒体查询","AC-4 决策：S/M 档 html.has-touch .btn{min-height:44px}；L≥1024 保持 r16 基线 40px（tkey 48px 满足触屏，零回归优先，验收可加回退规则）","VERSION 裁定：代码头不升（保持 2.3.0 三一致，verify-constants 零改动全绿）；v3.4 登记 memory 迭代索引；verify-constants 存量漂移不顺手修正（动头违反 0-diff），待办追加 r17 复核注记（T5 落实）","测试：verify-ui +3 源结构断言（media 存在性+stat-grid 契约+dock calc 形状，17→20）；qa-e2e r17 段 AC-8 resize 风暴 5 轮快照逐字段不变+AC-5 类切换+静态证据；jsdom 不可达几何全入 QA 真机清单"]}<!-- /state -->