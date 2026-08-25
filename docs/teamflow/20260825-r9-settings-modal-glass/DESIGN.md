# 俄罗斯方块（Tetris）简化版 — 设置弹层毛玻璃风格设计文档（DESIGN）

- 版本：**v3.0**（v2.9 → v3.0 增量：**设置弹层毛玻璃风格**——将设置项从左面板移出至齿轮图标触发的毛玻璃风格设置弹层，按分组展示，保持科技玻璃设计语言一致）
- 关联文档：`docs/teamflow/20260825-r9-settings-modal-glass/PRD.md`（v3.0 设置弹层毛玻璃风格，本文所有验收项以其为准）
- 交付形态：单页静态 Web 应用，全部 CSS/JS 内联于 `index.html`，`file://` 双击即玩，零外部依赖
- 基线依赖：20260825-r9-settings-modal-glass（本需求首个任务夹，无既往依赖）

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v3.0 | 2026-08-25 | 初版：设置弹层毛玻璃风格设计，对应 PRD AC-01~08，迁移现有4个设置项至独立模态框 |

---

## 0. 现状与约束（先读）

1. **工作区场景**：项目已有完整前端代码（`index.html` / `game.js` / `audio.js` / `ui.js` / `style.css`）与既有设计规范（`docs/teamflow/design/DESIGN.md` v1.0~v2.9 累积）。**本次设计不推翻既有规范**，在既有 token / 布局 / 组件体系上做**最小 UI 增量**，新增/修订部分一律以「**【v3.0】**」标注。
2. **PRD 硬约束（不可协商）**：
   - 视觉风格为「科技玻璃」：深色背景（背景主色亮度 ≤ 15%）、毛玻璃 `backdrop-filter: blur()` 生效、霓虹光效 ≥ 1 种、信息面板（AC-07）。
   - 零外部依赖：禁止 CDN 库/字体/图片，字体用系统字体栈（§5.1）。
   - 单文件内联：不使用 ES Module、不发起任何网络请求（AC-08）。
   - 仅键盘操作、桌面优先；兼容 Chrome/Edge ≥ 90、Firefox ≥ 95、Safari ≥ 15。
   - 运行帧率 ≥ 55 FPS、操作响应 ≤ 100ms、数值刷新 ≤ 200ms（AC-02/AC-06）。
3. **设计定位**：玻璃与霓虹是 PRD 强制项，但按「product register」克制使用——毛玻璃仅用于静态面板与遮罩，霓虹光效用于「状态与反馈」，不用于装饰堆砌。开关控件遵循既有「科技玻璃紧凑按钮」体系（`.btn--audio`），不另造新组件形态。
4. **【v3.0】本次变更边界（AC-01~08）**：设置弹层为**UI 结构重组**，UI 侧新增齿轮图标入口 + 毛玻璃模态框，迁移现有设置项：
   - 不改变既有**视觉 token**（§5.1 全部颜色/字号/间距/圆角/辉光原样保留），弹层**复用** `#overlay` 的 `--glass-bg` + `backdrop-filter: blur(20px) saturate(140%)` + `--radius-lg` 毛玻璃规范；
   - 不改变既有**开关控件**（`.btn--audio` + `aria-pressed` 模式），迁移后开关样式/行为/持久化完全保持；
   - 不改变既有**游戏逻辑**（引擎、计分、难度等），仅 UI 层重组；
   - 不新增**设置项**（仅迁移现有4项：音量/静音、幽灵块、BGM、踢墙旋转）；
   - 弹层关闭后**游戏状态保持**（不暂停、不重置），与 `#overlay` 行为一致。

---

## 1. 设计定位与原则

### 1.1 氛围一句话（调色板锚点）

> 「深夜霓虹街机厅：近乎纯黑的空间里，玻璃面板折射靛紫与琥珀金双色辉光，方块如霓虹灯管逐格点亮。」

### 1.2 设计原则（5 条）

| # | 原则 | 落地 |
|---|---|---|
| P1 | **界面让位于方块** | 板面是唯一焦点；面板/按钮只承担信息与操作，亮度与饱和度均低于方块。**【v3.0】设置弹层为临时覆盖层，关闭后完全隐藏，不干扰游戏视觉焦点** |
| P2 | **状态即光效** | 霓虹只表达状态与反馈；开关「开」态用微金描边/高亮表达，与实体块霓虹辉光区分 |
| P3 | **毫秒级响应** | 所有操作反馈 ≤ 100ms 内完成（帧内处理），数值变化 ≤ 200ms 可见。【v3.0】弹层打开/关闭动画 ≤ 200ms，设置切换即时生效（≤100ms） |
| P4 | **动效服务于节奏** | 动效时长 ≤ 800ms，缓动用 ease-out 指数曲线；`prefers-reduced-motion` 时全部降级为瞬时/淡化 |
| P5 | **自包含即优雅** | 系统字体栈 + 内联资源 + 逐项降级（backdrop-filter、OKLCH、网格），老浏览器核心玩法不失效 |

---

## 2. 页面/模块清单与信息架构

### 2.1 信息架构（单页应用结构树）

```
┌─ <body>
│  ├─ 背景层（page-bg）         静态径向渐变 + 微弱网格纹理
│  ├─ 顶部标题区（header）
│  │   ├─ 标题 "TETRIS"（霓虹字效）
│  │   └─ 状态指示灯（READY/PLAYING/PAUSED/GAME OVER 四态小圆点 + 文本）
│  ├─ 主区（main，3 列 CSS Grid）
│  │   ├─ 左信息面板（panel-left）
│  │   │   ├─ 【v3.0】齿轮图标按钮（#btn-settings，触发设置弹层）
│  │   │   ├─ 统计块：分数（score）/ 等级（level）/ 消除行数（lines）
│  │   │   └─ 下一个方块预览（next-well）
│  │   │   └─ 【v3.0】移除原有设置区（#audio-controls, #ghost-control, #bgm-control, #wallkick-control）
│  │   ├─ 游戏板（board）        Canvas：10×20 网格、当前方块、已固定方块、网格线、幽灵块落点轮廓
│  │   └─ 右操作面板（panel-right）
│  │       ├─ 操作说明（key-hints：←→ ↑ X ↓ 空格 P/R 键位图例）
│  │       └─ 控制按钮组（btn-start / btn-pause / btn-restart）
│  ├─ 遮罩层（overlay）          三态（READY/PAUSED/GAME_OVER）
│  ├─ 【v3.0】设置弹层（settings-modal）   毛玻璃风格模态框，按分组展示设置项
│  │   ├─ 弹层背景遮罩（settings-modal__backdrop）
│  │   ├─ 弹层卡片（settings-modal__card）
│  │   │   ├─ 弹层标题（settings-modal__title）
│  │   │   ├─ 音频组（settings-group--audio）
│  │   │   │   ├─ 组标题（settings-group__title）
│  │   │   │   ├─ 音量控制（#audio-controls）
│  │   │   │   └─ BGM开关（#btn-bgm）
│  │   │   ├─ 辅助组（settings-group--assist）
│  │   │   │   ├─ 组标题（settings-group__title）
│  │   │   │   ├─ 幽灵块开关（#btn-ghost）
│  │   │   │   └─ 踢墙旋转开关（#btn-wallkick）
│  │   │   └─ 关闭按钮（settings-modal__close）
│  │   └─ 焦点陷阱容器（settings-modal__focus-trap）
│  └─ 反馈层（feedback）         LEVEL UP toast + 分数变化高亮
```

### 2.2 模块清单

| 模块 | 职责 | 技术实现 | 交互状态 |
|---|---|---|---|
| page-bg | 提供深色底与玻璃折射源 | CSS 渐变 + 重复线性网格（极低透明度） | 静态 |
| header | 标题 + 游戏状态指示 | DOM + CSS 霓虹字效 | 随游戏态变化文字/颜色 |
| panel-left | 分数/等级/行数/下一个方块 + **齿轮图标入口** | DOM（数值）+ 迷你 Canvas（预览）+ 设置按钮 | 数值变化高亮；齿轮图标 hover/focus 状态 |
| board | 网格、当前/固定方块渲染 + 幽灵块落点轮廓 | 单个 `<canvas>`（唯一渲染层） | PLAYING 实时重绘；PAUSED 冻结 |
| panel-right | 键位图例 + 控制按钮 | DOM | 按钮随状态启用/禁用 |
| overlay | 三态遮罩（开始/暂停/结束） | DOM + 玻璃面板 + 焦点管理 | READY/PAUSED/GAME_OVER |
| **settings-modal** | **设置弹层：齿轮图标触发，分组展示设置项** | DOM + 玻璃面板 + 焦点陷阱 | CLOSED/OPEN |
| feedback | LEVEL UP 提示 | DOM toast | 升级瞬间，800ms |

### 2.3 状态机视图（四态 × 模块可见性，v3.0 新增设置弹层状态）

| 状态 | page-bg | header | panel-left | board | panel-right | overlay | **settings-modal** | feedback |
|---|---|---|---|---|---|---|---|---|
| READY | ✅ | ✅ | ✅ | ✅ | ✅ | ✅（遮罩+开始按钮） | ✅（可打开） | - |
| PLAYING | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅（可打开） | ✅（升级时） |
| PAUSED | ✅ | ✅ | ✅ | ✅（冻结） | ✅ | ✅（遮罩+继续按钮） | ✅（可打开） | - |
| GAME_OVER | ✅ | ✅ | ✅ | ✅（冻结） | ✅ | ✅（遮罩+重开按钮） | ✅（可打开） | - |
| **SETTINGS_OPEN** | ✅ | ✅ | ✅ | ✅（继续运行） | ✅ | - | **✅（模态框）** | - |

**关键状态转换**：
- `ANY → SETTINGS_OPEN`：点击齿轮图标（`#btn-settings`）
- `SETTINGS_OPEN → ANY`：点击关闭按钮 / 按ESC / 点击弹层外部
- **游戏状态在设置弹层打开期间保持不变**（PLAYING 继续运行，PAUSED 保持暂停）

---

## 3. 关键页面线框

### 3.1 整体布局（1920×1080 基准，居中）

布局结构、三列尺寸（`240px | 340px | 240px`）、游戏板规格**与既有 v2.9 规范完全一致**。左信息面板**移除设置区**后，高度更紧凑，齿轮图标按钮新增于顶部。

```
┌──────────────────────────────────────────────────────────────┐
│                    TETRIS   ◉ PLAYING                        │  header（64px）
├───────────────┬──────────────────────┬───────────────────────┤
│ 左面板 240px   │    游戏板 340px      │  右面板 240px         │  main（gap 24px）
│ ┌───────────┐ │  ┌────────────────┐  │ ┌───────────────────┐ │
│ │ ⚙ 设置    │ │  │┌─┬─┬─┬─┬─┬─┬─┐│  │ │ 操作说明          │ │
│ │ 分数       │ │  ││ │ │ │▣│▣│ │ ││  │ │  ←→ 移动   ↑/X 旋转 │ │
│ │ 012340     │ │  ││ │ │ │ │▣│▣│ ││  │ │  ↓ 软降   空格 硬降  │ │
│ │ 等级/行数  │ │  ││ │ │ │ │ │ │ ││  │ │  P/Esc 暂停  R 重开  │ │
│ │ 下一个预览 │ │  │└─┴─┴─┴─┴─┴─┴─┘│  │ ├───────────────────┤ │
│ │            │ │  │   （幽灵块轮廓）  │  │ │ [ 开始游戏 ]       │ │
│ │            │ │  │                  │  │ │ [ 暂停/继续 ]      │ │
│ │            │ │  │                  │  │ │ [ 重新开始 ]       │ │
│ └───────────┘ │  └────────────────┘  │ └───────────────────┘ │
└───────────────┴──────────────────────┴───────────────────────┘
```

### 3.2 齿轮图标按钮（#btn-settings，AC-01）

```
┌───────────────────┐
│ ⚙ 设置            │  ← 齿轮图标 + "设置" 文字，高度 32px
├───────────────────┤
│ 分数               │
│ 012340             │
│ 等级/行数          │
│ 下一个预览         │
└───────────────────┘
```

**组件规范**：
- **位置**：左信息面板顶部（`panel-left` 内第一个元素）
- **尺寸**：高度 32px（与 `.btn--audio` 一致），宽度 100%
- **图标**：齿轮 Unicode 字符 `⚙`（U+2699），字号 16px
- **文字**："设置"，字号 `var(--fs-sm)`（14px）
- **样式**：复用 `.btn--secondary` 科技玻璃按钮风格，hover 时 `border-color: var(--accent)`，focus 时 `outline: 2px solid var(--accent)`
- **ARIA**：`aria-label="打开设置"`，`role="button"`
- **交互**：点击触发设置弹层打开

### 3.3 设置弹层模态框（settings-modal，AC-02~04）

```
┌─────────────────────────────────────────────┐
│ 遮罩层（rgba(5,5,8,0.62) + blur(6px)）      │
│  ┌─────────────────────────────────────┐    │
│  │ 设置                          ×    │    │  ← 弹层标题 + 关闭按钮
│  ├─────────────────────────────────────┤    │
│  │ 音频设置                            │    │  ← 音频组标题
│  │ ┌─────────────────────────────────┐ │    │
│  │ │ 音量                            │ │    │
│  │ │ [🔊 静音]  [−] [80%] [+]       │ │    │  ← 音量控制组
│  │ ├─────────────────────────────────┤ │    │
│  │ │ 背景音乐                        │ │    │
│  │ │ [🎵 BGM：关]                   │ │    │  ← BGM开关
│  │ └─────────────────────────────────┘ │    │
│  ├─────────────────────────────────────┤    │
│  │ 辅助设置                            │    │  ← 辅助组标题
│  │ ┌─────────────────────────────────┐ │    │
│  │ │ 幽灵块                          │ │    │
│  │ │ [👻 幽灵块：开]                │ │    │  ← 幽灵块开关
│  │ ├─────────────────────────────────┤ │    │
│  │ │ 踢墙旋转                        │ │    │
│  │ │ [🔄 踢墙旋转：开]              │ │    │  ← 踢墙旋转开关
│  │ └─────────────────────────────────┘ │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**组件规范**：
- **遮罩层**：与 `#overlay` 一致，`background: rgba(5,5,8,0.62)`，`backdrop-filter: blur(6px)`
- **弹层卡片**：与 `#overlay-card` 一致，`background: var(--glass-bg)`，`backdrop-filter: blur(20px) saturate(140%)`，`border-radius: var(--radius-lg)`
- **标题**：左侧对齐，字号 `var(--fs-lg)`（18px），颜色 `var(--text)`
- **关闭按钮**：右侧对齐，`×` 符号，尺寸 24px×24px，hover 时颜色 `var(--accent)`
- **分组标题**：字号 `var(--fs-sm)`（14px），颜色 `var(--muted)`，左侧对齐，下方间距 `var(--sp-2)`
- **设置项容器**：每个分组内使用 `.settings-group__content`，间距 `var(--sp-2)`
- **开关控件**：迁移自左面板，样式/行为/ARIA 完全保持（`.btn--audio` + `aria-pressed`）

### 3.4 弹层内部布局（AC-03）

```
settings-modal__card
├── settings-modal__header
│   ├── settings-modal__title
│   └── settings-modal__close (×)
├── settings-modal__body
│   ├── settings-group--audio
│   │   ├── settings-group__title ("音频设置")
│   │   └── settings-group__content
│   │       ├── audio-controls (#audio-controls)
│   │       └── bgm-control (#bgm-control)
│   └── settings-group--assist
│       ├── settings-group__title ("辅助设置")
│       └── settings-group__content
│           ├── ghost-control (#ghost-control)
│           └── wallkick-control (#wallkick-control)
└── settings-modal__footer (可选，预留未来扩展)
```

---

## 4. 交互与动效说明

### 4.1 输入映射（v3.0 新增一个点击入口）

| 输入 | 动作 | 状态转换 |
|---|---|---|
| 点击齿轮图标（`#btn-settings`） | 打开设置弹层 | `ANY → SETTINGS_OPEN` |
| 点击弹层关闭按钮（`×`） | 关闭设置弹层 | `SETTINGS_OPEN → ANY` |
| 按 ESC 键 | 关闭设置弹层 | `SETTINGS_OPEN → ANY` |
| 点击弹层外部遮罩 | 关闭设置弹层 | `SETTINGS_OPEN → ANY` |
| 在弹层内 Tab/Shift+Tab | 焦点在弹层内循环（焦点陷阱） | `SETTINGS_OPEN → SETTINGS_OPEN` |
| 在弹层内 Enter/Space | 激活当前焦点控件（开关切换等） | `SETTINGS_OPEN → SETTINGS_OPEN` |

### 4.2 弹层打开/关闭流程（AC-02, AC-04）

**打开流程**：
1. 用户点击齿轮图标（`#btn-settings`）
2. 显示 `settings-modal`（`display: flex`）
3. 播放打开动画：背景遮罩从透明到半透明（160ms），弹层卡片从 `opacity: 0.6; transform: scale(0.98)` 到 `opacity: 1; transform: scale(1)`（160ms，ease-out）
4. 焦点移动到弹层关闭按钮（初始焦点）
5. 启用焦点陷阱（Tab/Shift+Tab 在弹层内循环）

**关闭流程**：
1. 用户点击关闭按钮 / 按 ESC / 点击弹层外部
2. 播放关闭动画：背景遮罩从半透明到透明（160ms），弹层卡片从 `opacity: 1; transform: scale(1)` 到 `opacity: 0.6; transform: scale(0.98)`（160ms，ease-out）
3. 动画结束后隐藏 `settings-modal`（`display: none`）
4. 焦点返回到齿轮图标按钮（触发元素）
5. 禁用焦点陷阱

### 4.3 焦点管理（AC-06）

**焦点陷阱实现**：
- 弹层打开时，焦点容器（`settings-modal__focus-trap`）捕获 Tab/Shift+Tab 事件
- 焦点循环顺序：关闭按钮 → 音量控制 → BGM开关 → 幽灵块开关 → 踢墙开关 → 返回关闭按钮
- 弹层关闭时，焦点返回到触发元素（齿轮图标）

**键盘操作**：
- **Tab**：在弹层内按顺序移动焦点
- **Shift+Tab**：在弹层内反向移动焦点
- **Enter/Space**：激活当前焦点控件（开关切换、按钮点击）
- **ESC**：关闭弹层

**ARIA 属性**：
- `role="dialog"`：弹层容器
- `aria-modal="true"`：模态框标识
- `aria-label="设置"`：弹层标签
- `aria-describedby`：指向弹层标题（可选）
- 内部开关保持原有 `aria-pressed` 属性

### 4.4 动效清单（AC-07）

与既有 `#overlay` 动效**完全一致**，复用 CSS 动画：

```css
/* 打开动画（复用 #overlay.is-open #overlay-card） */
@keyframes overlay-in {
  0% { transform: scale(0.98); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}

/* 关闭动画（反向） */
@keyframes overlay-out {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.98); opacity: 0.6; }
}

/* 遮罩层过渡 */
#settings-modal__backdrop {
  transition: opacity 160ms ease-out;
}
```

**动画时长**：打开/关闭均为 160ms（与 `#overlay` 一致）
**缓动函数**：`ease-out`
**降级方案**：`prefers-reduced-motion` 时，动画降级为瞬时切换（`animation: none; transition: none`）

---

## 5. 视觉规范

### 5.1 设计 Token（CSS 自定义属性）

全部 token **与既有 v2.9 完全一致，本次零新增、零覆盖**。色彩体系（近黑底 + 靛紫主色 + 琥珀金强调）、字体栈、字号 rem 阶梯、间距、圆角/辉光/z-index 原样保留（完整清单见 `docs/teamflow/design/DESIGN.md` §5.1）。设置弹层**直接消费既有 token**，无需新增：

| 用途 | 复用 token |
|---|---|
| 弹层背景 | `--glass-bg`（`rgba(35,35,45,0.72)` 或 `color-mix(in oklch, var(--surface) 72%, transparent)`） |
| 弹层模糊 | `backdrop-filter: blur(20px) saturate(140%)`（与 `#overlay-card` 一致） |
| 弹层圆角 | `--radius-lg`（12px） |
| 弹层边框 | `--line`（1px solid var(--line)） |
| 弹层内边距 | `--sp-6`（24px）上下，`--sp-7`（32px）左右 |
| 分组标题颜色 | `--muted` |
| 设置项间距 | `--sp-2`（8px） |
| 关闭按钮 hover | `--accent` |
| 焦点环 | `--accent`（2px solid） |

### 5.2 弹层视觉规范（AC-07）

**弹层卡片**：
```css
.settings-modal__card {
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--sp-6) var(--sp-7);
  min-width: 320px;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}
```

**弹层标题**：
```css
.settings-modal__title {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text);
  margin: 0 0 var(--sp-4) 0;
}
```

**分组标题**：
```css
.settings-group__title {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--muted);
  margin: 0 0 var(--sp-2) 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

**分组容器**：
```css
.settings-group {
  margin-bottom: var(--sp-4);
}

.settings-group__content {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
```

### 5.3 响应式与分辨率适配（v3.0）

- **1920×1080 / 1366×768**：弹层居中显示，宽度 320~400px，高度自适应（最大 80vh，允许滚动）
- **移动端（≤480px）**：弹层宽度 90vw，高度 80vh，边距缩小（`--sp-4`）
- **视口 ≤ 1100px**：弹层宽度 90vw，居中显示，不改变内部布局
- 不用流体字号（product register），仅用固定 rem + 布局级断点

### 5.4 兼容性与降级（保持，v3.0 无关）

同既有 v2.9 §5.5，本次零改动。

---

## 6. 可访问性要点（v3.0 增量）

### 6.1 ARIA 属性（AC-06）

| 元素 | ARIA 属性 | 说明 |
|---|---|---|
| 齿轮图标按钮 | `role="button"`, `aria-label="打开设置"` | 触发元素 |
| 弹层容器 | `role="dialog"`, `aria-modal="true"`, `aria-label="设置"` | 模态框标识 |
| 弹层标题 | `id="settings-modal__title"` | 可被 `aria-describedby` 引用 |
| 关闭按钮 | `aria-label="关闭设置"` | 关闭弹层 |
| 内部开关 | 保持原有 `aria-pressed` 属性 | 开关状态 |

### 6.2 键盘导航（AC-06）

- **Tab 顺序**：关闭按钮 → 音量控制 → BGM开关 → 幽灵块开关 → 踢墙开关 → 返回关闭按钮
- **焦点陷阱**：弹层打开时，Tab/Shift+Tab 在弹层内循环，防止焦点逃逸到游戏区域
- **焦点返回**：弹层关闭时，焦点返回到齿轮图标按钮（触发元素）
- **ESC 关闭**：任意时刻按 ESC 可关闭弹层

### 6.3 屏幕阅读器支持

- 弹层打开时，屏幕阅读器应宣布："设置对话框"
- 关闭按钮应宣布："关闭设置"
- 开关状态变化应通过 `aria-pressed` 实时通知

### 6.4 视觉可访问性

- **焦点环**：所有可交互元素（齿轮图标、关闭按钮、开关）在 `:focus-visible` 时显示 2px solid `var(--accent)` 焦点环
- **对比度**：文本颜色（`var(--text)` / `var(--muted)`）与背景（`var(--glass-bg)`）对比度 ≥ 4.5:1（WCAG AA）
- **颜色非唯一信号**：开关状态通过 `aria-pressed` + 文案（"开"/"关"）+ 颜色三重信号传递（AC-19.7 模式）

---

## 7. 性能注意（支撑 ≥ 55 FPS / 响应 ≤ 100ms）

1. **弹层显示/隐藏**：使用 CSS `display: none/flex` 切换，避免 DOM 重排
2. **动画**：使用 CSS `transform` 和 `opacity`，触发 GPU 合成层，避免重绘
3. **焦点陷阱**：使用事件委托，避免在每个焦点元素上绑定事件
4. **设置同步**：开关切换后，设置状态立即写入 `ui.js` 闭包 + `localStorage`，无延迟

---

## 8. 交付清单（给前端实现者的落地建议，v3.0 标注本次项）

### 8.1 HTML 变更（index.html）

1. **左面板**：移除 `#audio-controls`、`#ghost-control`、`#bgm-control`、`#wallkick-control`
2. **左面板顶部**：新增齿轮图标按钮 `<button id="btn-settings" class="btn btn--secondary" aria-label="打开设置">⚙ 设置</button>`
3. **body 末尾**：新增设置弹层 DOM（完整结构见 §3.3）
4. **设置项迁移**：将原左面板的设置项 DOM 移动到弹层内对应分组

### 8.2 CSS 变更（style.css）

1. **齿轮图标按钮**：复用 `.btn--secondary` 样式，新增 `width: 100%` 和 hover/focus 规则
2. **设置弹层**：新增 `.settings-modal` 系列样式（复用 `#overlay` / `#overlay-card` 规则）
3. **分组样式**：新增 `.settings-group` / `.settings-group__title` / `.settings-group__content`
4. **动画**：新增 `@keyframes settings-modal-in/out`（复用 `overlay-in` 逻辑）
5. **响应式**：新增移动端适配规则（≤480px）

### 8.3 JS 变更（ui.js 或新增 settings-modal.js）

1. **齿轮图标事件**：监听 `#btn-settings` 点击，打开设置弹层
2. **弹层控制**：打开/关闭函数（显示/隐藏 + 焦点管理 + 焦点陷阱）
3. **焦点陷阱**：实现 Tab/Shift+Tab 循环逻辑
4. **ESC 关闭**：监听键盘事件关闭弹层
5. **点击外部关闭**：监听遮罩层点击关闭弹层
6. **焦点返回**：弹层关闭时，焦点返回到齿轮图标
7. **设置项迁移**：确保开关事件绑定正确（迁移后 DOM 变化，事件委托或重新绑定）

### 8.4 验证要求

1. **七套验证脚本全绿**：`verify-game.cjs`、`verify-audio.cjs`、`verify-ui.cjs`、`verify-constants.cjs`、`assembly-check.cjs`、`qa-e2e-jsdom.cjs`、人工验证
2. **AC-01~08 逐项验收**：对照 PRD 验收标准
3. **回归测试**：确保 AC-01~19 功能不变（特别是开关状态、持久化、游戏逻辑）

### 8.5 分支管理

- 从主干创建分支 `feat/settings-modal-glass`
- 处理未提交改动（任务夹目录属于文档，不影响开发）
- 完成后合并到 main，打版本标签 v3.0

---

<!-- state -->{"phase":"design","summary":"DESIGN v3.0 已交付：设置弹层毛玻璃风格为 UI 结构重组，左面板移除设置区，新增齿轮图标入口(#btn-settings)触发全屏模态框(settings-modal)，弹层复用 #overlay 的 --glass-bg + backdrop-filter:blur(20px) saturate(140%) + --radius-lg 毛玻璃规范，按音频组/辅助组分组展示4个迁移设置项(音量/幽灵/BGM/踢墙)，开关保持原有 .btn--audio + aria-pressed 三信号模式，弹层关闭后游戏状态保持不变，焦点陷阱防止Tab逃逸，打开/关闭动画160ms ease-out 与 overlay 一致，响应式适配移动端(≤480px)，零新增 token/动效/布局，零视觉回归，改动面仅 index.html 重构 + style.css 弹层样式 + ui.js 弹层控制逻辑。","version":"v3.0","memory":["DESIGN v3.0：设置弹层为 UI 结构重组，左面板移除设置区，新增齿轮图标入口触发全屏模态框","弹层复用 #overlay 的毛玻璃规范(--glass-bg + blur(20px) saturate(140%) + --radius-lg)","按音频组/辅助组分组展示4个迁移设置项，开关保持原有 .btn--audio + aria-pressed 模式","弹层关闭后游戏状态保持不变，焦点陷阱防止Tab逃逸，打开/关闭动画160ms ease-out","响应式适配移动端(≤480px)，零新增 token/动效/布局，零视觉回归"]}<!-- /state -->