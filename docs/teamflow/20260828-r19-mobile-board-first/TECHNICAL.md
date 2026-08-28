<!-- meta: summary="r19 技术方案：S 竖屏 §7.1 重写契约（body flex/100dvh + #main grid areas + #board 等比覆盖 + dock 随流）与 verify-ui/e2e 断言改写清单；ui.js/index.html 零改动" -->
基线依赖：docs/teamflow/20260828-r17-responsive-layout/TECHNICAL.md（断点框架、display:contents 摊平、横屏棋盘等比先例承继）

# r19 移动端棋盘优先一屏适配 TECHNICAL

## 1. 改动面总览

| 文件 | 改动 | 性质 |
|---|---|---|
| `style.css` | §7.1（`@media (max-width:599px)` 竖屏块）整体重写；§7.0 基座、§7.2 横屏变体、§7.3/§7.4 M 档、全部其余章节 0 diff | 唯一实现改动 |
| `scripts/verify-ui.cjs` | 第三条 r17 测试（`--dock-h` 两行 dock calc 形状）改写为 r19 S 档锚点断言；前两条测试与头注同步措辞 | 断言随契约 |
| `scripts/qa-e2e-jsdom.cjs` | r17 静态证据块前两条 check 改写为新锚点；后四条（M media / btn 44 / stat-grid 基座 / index.html 契约）不变；头注措辞同步 | 断言随契约 |
| `index.html` / `ui.js` / `game.js` / `audio.js` / `persist.js` | **0 行 diff** | 红线 |

## 2. style.css §7.1 新契约（S 竖屏 = <600px，横屏由 §7.2 源序接管）

外层块仍为 `@media (max-width: 599px)`（保持源序：先于 §7.2 横屏变体，供 e2e `sP17` 切片）；**dock 几何规则必须嵌套在内层 `@media (orientation: portrait)` 中**——r17 §7.1 同款防线：否则外层规则会源序反超 r16 横屏侧轨（`style.css` §5.5 landscape 块），破坏 72px 轨几何（AC-6）。

### 2.1 视口骨架与网格（as-built，含真机修正）
- `body { display:flex; flex-direction:column; height:100vh; height:100dvh }`（渐进增强双行；**钉高而非 min-height**——min-height 下 #main 以画布固有 560px 撑开 body、dock 落到折叠线下，375×667 实测）。
- `#main { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:auto minmax(0,1fr) auto; grid-template-rows:auto auto minmax(0,1fr); grid-template-areas:'stats stats stats' 'controls controls controls' 'hold board next' }`。
- `#panel-left, #panel-right { display:contents }`（外层共享块，承继 r17 摊平机制）。
- 区块落位：`.stat-grid→stats`、`#controls→controls`、`.hold-well→hold`、`#board-col→board`、`.next-well→next`、`.key-hints { display:none }`（PRD AC-8）。
- `#btn-settings` **绝对定位 `#main` 右上角**（不占轨道——其 ~92px 钮宽若入列会把 col3 撑宽、侵蚀棋盘轨；`width:auto` 豁免 v3.0 基座 `width:100%` 遗留），统计行 `padding-right:112px` 避让。
- 横屏子变体卡片化：r17 卡片玻璃底原在旧 §7.1 外层（横竖屏通用）→ **原样收口至本档内层 `@media (orientation:landscape)` 嵌套**，横屏视觉与 r17 基线逐字段一致（QA stash 对照实测）。
- **结构分层**：外层共享块（`max-width:599px`）保留 ① `#main display:flex; flex-direction:column` 基座（§7.2 横屏变体 `flex-direction:row` 翻转的前提）② r17 ORDER 表（横屏面板 `display:flex` 复位后的面板内排序效应；竖屏显式 grid-area 下不参与自动放置，惰性保留保横屏 0 回归）③ 44px 保底；竖屏全量新布局收口内层 `@media (orientation:portrait)`（防反超 §5.5 横屏侧轨与 §7.2）。
- **废弃**：r17 的 `--dock-h`（S 档声明）、`#main padding-bottom` 预留、两行 dock、16.5vh 中心带、竖屏卡片流。
- 真机修正实录（375×667 无头 Chrome 实测驱动）：① `#board-col/#board-frame` 需 `min-width:0`——网格/弹性项 automatic minimum 以画布固有 280px 为下限，把 1fr 轨撑到 314px、整页横向溢出 511px；② body 钉高（见上）；③ 设置钮 width:auto（见上）。

### 2.2 信息压缩
- `#header` padding 收窄 + `#title` 降为 `--fs-xl`（24px）、字距 0.18em。
- `.stat-grid` 单行四列 `repeat(4,auto)` + `justify-content:space-between` + `padding-right:112px`（避让绝对定位设置钮）；`.stat` 保持纵向（label 上 value 下）；数值统一 `--fs-lg`（18px，≥16 可读性红线），label `--fs-xs`。
- `#controls` 单行横排，三钮 `flex:1; max-width:120px`。
- `html.has-touch .btn { min-height:44px }` 延续。
- 侧栏 label 限宽 48px 居中换行（"Hold/暂存"两行）→ Hold 轨 78→56px，棋盘轨 +22px。

### 2.3 棋盘等比（先例：r17 §7.2）
- `#board-col { grid-area:board; min-height:0 }`（1fr 行内高度链）。
- `#board { width:auto !important; height:auto !important; max-width:100%; max-height:100% }`——覆盖 `renderer.resize()` 写入的内联尺寸，替换元素约束求解保持 280:560 比例。
- `#board-frame { max-height:100% }`（遮罩/toast 包含块随框收缩）。

### 2.4 dock 随流（嵌套 portrait 块内）
- `.touchpad { position:static }`（废弃 fixed 悬浮与滚动预留），padding 沿用 r16 基础块（含 `env(safe-area-inset-bottom)` 双行渐进）。
- `.touchpad .tkey:nth-child(3) { margin-right:0 }` 延续 r17 复位。
- 新增 `@media (orientation:portrait) and (max-width:379px)`：`.touchpad` 左右 padding 降为 `--sp-2`——44px 键 ×6 + 8px 键距 ×5 + 8px 边距 ×2 = 320px 恰好放下（键距/键尺寸红线不动，r16 的 ≤379 块 0 diff）。

### 2.5 宽度验算（PRD AC-1 依据，QA 真值复核）
- dock：375：6×48+5×8+2×12=352 ≤375 ✓；360：352 ≤360 ✓；320：44px 档 6×44+5×8+2×8=320 恰容（AC-3 键距 ≥8 保持）。
- 对局区（375）：351 可用 − Hold 轨 56 − Next 轨 58 − 2×12 gap = 棋盘轨 213 → 画布 179×358（QA 实测 ✓ 1:2）。
- 统计行（320）：四列 ≈141 + 3×12 + 设置钮 92 + 间距 = 269 ≤ 296 ✓。

## 3. 断言改写清单

### 3.1 verify-ui.cjs
| 原断言（r17 test 3） | 新断言（r19） |
|---|---|
| `--dock-h: calc(2*var(--tpad-key)…)` 两行算式 | `grid-template-areas` 含 `'hold board next'` 行 |
| `#main padding-bottom: var(--dock-h)` | `#board { width:auto !important` 等比覆盖 + `max-height:100%` |
| `.touchpad flex-wrap` + `min-height:max(…16.5vh` | `.touchpad { position:static`（随流）+ `.key-hints display:none` |
| `env(safe-area-inset-bottom)` 存在（S 档内） | 沿用，锚点改为全文件（S 档不再重写 padding，避让由 r16 基座承载） |
| `min-height:100vh/100dvh` | 改为 `height:100vh`/`100dvh`（钉高一屏语义） |
| test 1（media 存在性 + L 基座先于首个 @media）、test 2（index.html .stat-grid 包裹契约） | **零改动**（新布局同样满足；`--dock-h`/`display:contents` 锚点仍在——前者由 M 档承载） |

### 3.2 qa-e2e-jsdom.cjs（r17 静态证据块）
| 原 check | 处置 |
|---|---|
| S 竖屏 `flex-direction:column` + order 10/40/70 列序 | **改写**：`grid-template-areas 'hold board next'` + `#board auto !important` + `.key-hints display:none` |
| `--dock-h` 引用 + flex-wrap 两行 + 16.5vh 中心带 | **改写**：`position:static` 随流 dock + `env(` 避让（全文件锚点）+ body `height 100vh/100dvh` 渐进对 |
| M 档 media / btn 44px / stat-grid 基座 / index.html 契约 | 不变 |
| AC-8 跨档 resize 5 轮快照不变 | 不变（JS 仍零档位感知，结构性成立） |

## 4. 风险与对策（含实施期已排雷项）

- **R1 ✓已排雷（实施期）**：网格/弹性项 automatic minimum——`#board-col` 以画布固有 280px 为最小宽把 1fr 轨撑爆（375 视口整页横向溢出实测 511px）→ `#board-col/#board-frame min-width:0` 豁免；body 改 `height`（非 min-height）钉高一屏，防画布固有高把 dock 顶出折叠线。
- **R2 极矮/极宽视口**：不设 overflow 裁剪；棋盘 width-bound 时板框纵向留白（框高 100% 设计使然，遮罩/toast 随框）——QA 记录为 D3 观察。
- **R3 桌面窄窗口**（<600 非触屏）：同享新布局（键区不渲染、控制钮行可用），键位图例隐藏为已确认变更（PRD AC-8）。
- **R4 循环尺寸**：`#board` 双 `max-*` + 双 auto 替换元素约束求解依赖 shrink-to-fit 上下文 → `#board-frame` flex 容器化（align/justify center）+ 高度链 100%；QA 四档视口实测 1:2 无变形。
