<!-- meta: summary="r19 设计规格：S 竖屏游戏视口布局——压缩信息条 + 侧栏预览 + 等比棋盘 + 单行随流 dock；其余档位承继 r17 DESIGN 不变" -->
基线依赖：docs/teamflow/20260828-r17-responsive-layout/DESIGN.md（S 横屏变体/M/L 视觉规格与全部 token 承继）

# r19 移动端棋盘优先一屏适配 DESIGN

## 0. 设计立场

移动端对局界面是**游戏视口**（game viewport），不是文档流页面：一屏之内棋盘是唯一主角，其余信息全部压缩成窄条。r17 的失误在于把桌面「信息面板」线性化搬运到竖屏（信息优先），r19 反转为**棋盘优先**（game-first）。视觉语言（深色 + 毛玻璃 + 霓虹）与全部 token 承继 DESIGN §5，零新增色值/字号档。

## 1. S 竖屏布局几何（<600px 且 portrait）

```
┌──────────────────────────────┐
│ #header（压缩）：TETRIS ●READY │  ← 行1：标题降为 fs-xl 24px、间距收窄
│ #main 网格                     │
│ ┌─ 统计行 ────────────── ⚙ ┐  │  ← 行2：四统计横排（label+value 同组）+ 设置钮
│ ├─ 控制行：开始 暂停 重开    ─┤  │  ← 行3：三钮单行
│ ├ Hold ┐┌ 棋盘 1:2 ┌┌ Next ┤  │  ← 行4（1fr）：侧栏细轨 + 棋盘吃满
│ │ 48×24 ││ 等比缩放 ││ 48×80 │  │
│ └──────┘└──────────┘└──────┘  │
│ ◀左 ▶右 ⟳旋 ▼软 ⤓硬 📦Hold     │  ← 行5：dock 单行随流（非 fixed）
└──────────────────────────────┘
```

### 1.1 页头（行1）
- `#title` 字号 36px → 24px（`--fs-xl`），字距 0.35em → 0.18em；`#header` padding 收窄为 `--sp-2 --sp-4`。
- `#status` 状态灯胶囊样式不变（token 承继）。
- 视口骨架：body `height:100vh/100dvh` 渐进对（**钉高**而非 min-height——min-height 下 #main 以画布固有高度撑开 body、dock 落到折叠线下，真机实测）+ 纵向 flex。

### 1.2 统计行（行2）
- `.stat-grid` 由 2×2 大卡改为单行四列：`display:grid; grid-template-columns:repeat(4,auto)` + `justify-content:space-between`，每组 `.stat` 保持纵向（label 上、value 下，移动端 HUD 惯例）。
- 数值字号统一 `--fs-lg`（18px ≥ 16 可读性红线），label 维持 `--fs-xs`。
- `#btn-settings` 绝对定位 `#main` 右上角（与统计行同带）：不占网格轨道（否则 ~90px 钮宽把 Next 侧栏轨道撑宽、侵蚀棋盘轨）；`width:auto` 豁免 v3.0 基座 `width:100%`；统计行右留 112px 内距避让。
- 320px 宽度验算：四列 ≈141px + 3×12 gap + 设置钮 92px + 间距 = 269px ≤ 296px 可用 ✓。

### 1.3 控制行（行3）
- `#controls` 由纵向改单行横排 `flex-direction:row; justify-content:center; gap:var(--sp-3)`；三钮等宽 `flex:1; max-width:120px`。

### 1.4 对局区（行4，剩余高度）
- 网格三轨：`grid-template-columns:auto 1fr auto`（Hold 轨 | 棋盘轨 | Next 轨，auto = 侧栏收窄自适应，开关关闭时轨道塌缩、棋盘自动加宽）。
- `.hold-well` / `.next-well` 保持竖排（label 上、画布下），画布自带描边/辉光（基座样式）；label 限宽 48px 居中（"Hold/暂存"两行），侧栏收窄到画布同宽 56~58px；画布内联尺寸不变（48×24 / 48×80），槽位竖排渲染零改动。
- `#board-col` 占 1fr 轨：`min-width:0; min-height:0`（豁免网格项 automatic minimum，否则画布固有 280px 宽把轨道撑爆、整页横向溢出）→ `#board-frame` 高度 100% → `#board` `width/height auto !important` + `max-width/max-height:100%` 等比缩放（先例 r17 §7.2 横屏档）。
- `.key-hints` 隐藏（已确认行为变更，PRD AC-8）。

### 1.5 触控 dock（行5）
- 从 fixed 悬浮改**文档流末尾随流**：`position:static`，单行 `flex-wrap:nowrap`，居中。
- 键 48px；≤379px 44px 兜底延续 r16；`padding-bottom calc(... + env(safe-area-inset-bottom))` 避让延续。
- 取消：两行 flex-wrap、`min-height 16.5vh` 中心带、`--dock-h` 滚动预留（一屏零滚动后无滚动重叠问题）。

## 2. 交互与动效

- 零新增动效；既有按钮/触控键三态、遮罩三态、toast、消行动效全部承继。
- 跨档切换为纯 CSS 重排（承继 r17 AC-8：零 JS、引擎零触达）。

## 3. 可访问性

- 可点目标 ≥44px：触控键 48/44、按钮 40→触屏 44 保底（r17 规则延续）。
- 可读性：正文 ≥12px、统计数值 ≥16px（PRD AC-4）。
- `env(safe-area-inset-bottom)` 避让延续（PRD AC-3）。
- 遮罩按钮覆盖棋盘（一屏适配后天然首屏可见），焦点管理零改动。

## 4. 其余档位

S 横屏变体（§7.2）/ M（§7.3/§7.4）/ L 基线规格全部承继 r17 DESIGN，零视觉变更。其中横屏子变体的卡片玻璃底原写在 r17 §7.1 外层（横竖屏通用），r19 重写后**原样收口至 §7.1 内层 `orientation:landscape` 嵌套**（几何与 r17 基线逐字段一致，QA 实测）。
