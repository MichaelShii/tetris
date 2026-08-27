<!-- meta: summary="移动端触屏控制 UI/UX 设计：新增触屏操控区 #touch-controls.touchpad（6 键），竖屏底栏/横屏侧轨，html.has-touch 纯 CSS 显隐，键鼠零视觉变化，遮挡数学验证达标，token 复用率 100%（仅新增 2 个）" -->

基线依赖：docs/teamflow/20260827-r15-multi-grid-preview-queue（视觉/交互/动效规范沿用；无取代——触屏是纯新增输入通道，不改任何既有 AC 行为）

---

# DESIGN — 移动端触屏控制（r16）

## 0. 变更定位

- 本需求为**纯增量输入通道**：新增「触屏操控区」模块；不改既有 token / 布局结构 / 动效清单 / 游戏板渲染；键鼠设备视觉零变化（CSS 断点 + `html.has-touch` 类驱动，AC-1/AC-14）。
- 新增/修订一律以**【r16】**标注；既有规范引用 `docs/teamflow/design/DESIGN.md`（历史完整 token 清单见 `docs/teamflow/history/v2.8/DESIGN.md` §5.1）。

## 1. 模块清单与信息架构（【r16】）

单页结构不变，新增一个顶级模块：

- `#touch-controls.touchpad`（触屏操控区）：6 个 `.tkey` 按键，依次映射 左移/右移/旋转(顺时针)/软降/硬降/Hold（与 PRD 图例顺序一致）。DOM 位于 `#main` 之后、设置弹层之前（`body` 末尾）。
- 呈现方式：`position: fixed`，同一 DOM 由 CSS 断点切换两种排布——竖屏底栏 `.touchpad--bar` / 横屏双侧轨 `.touchpad--rails`。
- 显隐：默认 `display:none`；触屏检测（JS 职责，TECH 细化）加 `html.has-touch` → `.has-touch .touchpad { display:block }`。**纯 CSS 显隐，不重置对局状态**（AC-1）。
- 键位提示（AC-13）：`.has-touch` 下隐藏 `.key-hints`（桌面 kbd 图例，避免误导性键盘文案）；触屏键自带文字标签即图例，不另设图例块。

```
body
├─ #main（既有：panel-left / board-col / panel-right，零改动）
├─ #touch-controls.touchpad           【r16】
│  ├─ .tkey ◀ 左  ├─ .tkey ▶ 右  ├─ .tkey ⟳ 旋转
│  ├─ .tkey ▼ 软降 ├─ .tkey ⤓ 硬降 ├─ .tkey 📦 Hold
└─ 设置弹层（既有，z 10/11 > touchpad）
```

## 2. 线框描述

### 2.1 竖屏底栏（375×667 参考）

- 底部固定条：高 ≈ 72~84px（键 48 + 上下 padding `--sp-2`×2 + `env(safe-area-inset-bottom)`）；宽 100%，两侧 padding 16。
- 单行 6 键 = 3+3 分组：`[◀ 左][▶ 右][⟳ 旋转] ┊ [▼ 软降][⤓ 硬降][📦 Hold]`，组间 gap 16、键间 gap `--sp-2`。拇指双区：左手区移动+旋转，右手区下落+Hold（对齐键盘左右脑分区）。
- **不遮挡校验（AC-12）**：视口 667 减底栏 ~92px（含安全区）→ 板框可视高 575px；板框 592 = 上 16 + 画布 560 + 下 16 → 画布最坏遮挡 ≤1px（≥99.8%，远超 ≥95% 要求）。369px 键行 = 6×48 + 5×8 + 16 组距 ≤ 375−32 两侧 padding，单行不溢出。

### 2.2 横屏侧轨（812×375 参考）

- 左轨 `left:0` 纵向 3 键 `[◀左][▶右][⟳旋转]`；右轨 `right:0` 纵向 3 键 `[▼软降][⤓硬降][📦Hold]`；轨宽 72（键 48 + 两侧 padding 12），键 gap `--sp-2`，底部贴安全区（拇指自然位）。
- **零遮挡**：中列 812−144 = 668px 容纳居中板框 312px，触屏控件不叠画布（≥95% 天然满足）。
- 页面纵向照常滚动（板高 592 > 视口 375，属既有滚动行为，非触屏控件引入）。

### 2.3 键组件 `.tkey`（三态）

| 态 | 视觉 | 行为 |
|---|---|---|
| 静态 | 玻璃键帽：`--surface-2` 底、`--line` 描边、`--radius-md`、标签 `--ink` | 可点、可聚焦 |
| 按下 `:active` | 描边→`--primary`、标签→`--accent-hi`、`--glow-primary` 亮起（`::before` opacity）、`scale(0.96)` | 立即产生一次输入；长按持续输入（复用键盘 repeat 时钟，PRD §8；UI 只发 down/up 两信号） |
| 松手 / `touchcancel` | 回静态（120ms ease-out） | 发 up 信号复位；cancel 等同松手 |
| PAUSED / GAME_OVER | **视觉不变**（与键盘一致：键可点但无输入） | 处理层守卫忽略，无报错无副作用（AC-2） |

键面文案（沿用既有「字形/emoji + 文字」按钮模式）：`◀ 左` `▶ 右` `⟳ 旋转` `▼ 软降` `⤓ 硬降` `📦 Hold`。

## 3. 交互与动效

- **触摸语义**：`touchstart` = 按下（keydown 语义）、`touchend` = 抬起（keyup）、`touchcancel` = 复位；每键独立、无互斥按钮，多指天然并行（AC-9）。连点去抖/每周期 Hold 限 1 次等由引擎键盘路径既有逻辑共享，不新增。
- **防默认行为（AC-8）**：`.touchpad` 与游戏板区域 `touch-action:none`；触摸序列 `preventDefault`（不产生滚动/捏合缩放/文本选中/长按菜单）；`-webkit-tap-highlight-color: transparent`（按压态自有视觉，不吃系统灰色高亮）。实现细节 TECH 定。
- **动效**：
  - 按压反馈 `scale 0.96 / 60ms ease-out`，松手回弹 `120ms ease-out`；辉光走 `::before` opacity（不动画 box-shadow，对齐 DESIGN §4.3 既有按钮约定）。
  - 无 hover 反馈（触屏无悬停）：`:hover` 规则仅 `@media (hover:hover)` 生效，避免触屏粘滞态。
  - **无入场动画**：显隐纯 CSS，可见性不依赖 animation 完成（隐藏 tab / 无头渲染器下入场不触发的风险为零）。
  - `prefers-reduced-motion: reduce`：全局规则裁剪 transition；按压态由描边+标签色（非动画载体）表达，不失效。
- **触屏与键盘并存（AC-10）**：触屏控件不拦截键盘事件；键盘路径照常完整可用。

## 4. 视觉规格

**【r16】新增 token 仅 2 个，其余 100% 复用既有 token**（历史完整清单 `history/v2.8/DESIGN.md` §5.1）：

| 元素 | 复用 / 新增 |
|---|---|
| 底栏/侧轨容器 | `--glass-bg` + `backdrop-filter: blur(20px) saturate(140%)`（同 `.panel`）+ `--line` 描边 |
| 【r16】层级 | **新增 `--z-touchpad: 5`**（面板 2 之上、遮罩 10 之下 → 设置弹层/遮罩必然盖住底栏） |
| 键帽 | `--surface-2` 底、`--line` 描边、`--radius-md` 圆角 |
| 【r16】键尺寸 | **新增 `--tpad-key: 3rem`（48px ≥ 44 最小目标，AC-12）**；键距/内距复用 `--sp-2` |
| 标签 | `--font-ui`、`--fs-md`（15px）600、letter-spacing 0.04em；静态 `--ink`、按下 `--accent-hi` |
| 按下态 | 描边 `--primary` + `--glow-primary`（`::before` opacity 切换） |
| 焦点环 | 全局 `:focus-visible` `--accent` 2px 外环（零新增） |
| 安全区 | 底栏/侧轨贴边侧叠加 `env(safe-area-inset-bottom)`（iOS 刘海） |
| 防高亮 | `-webkit-tap-highlight-color: transparent` |

**断点**：竖屏底栏 / 横屏侧轨为两套独立媒体查询分支（方向判断，具体条件 TECH 定），仅 `.has-touch` 下生效；**不改既有 1100px / 480px 断点**，键鼠布局零触碰。

## 5. 可访问性要点

- 目标尺寸 ≥44×44 逻辑像素（实际 48×48，键距 ≥8px，WCAG 2.5.8，AC-12）。
- 按键为真实 `<button>` + `aria-label`（"左移"/"右移"/"旋转"/"软降"/"硬降"/"Hold 暂存"）；瞬时动作**不加** `aria-pressed`。
- 触屏设备隐藏键盘图例、键自带标签即说明（AC-13）；桌面图例原样。
- 状态不只靠颜色：按压 = 描边 + 标签色 + 辉光 + 位移多信号（对齐既有开关多信号约定）。
- 键盘仍可操作触屏控件（AC-10）：`focus-visible` 环内建、Enter/Space 可激活。
- 对比度沿用既有安全域（`--ink` 对 `--surface-2`、`--accent-hi` 对深玻璃底均 ≥4.5:1，量级已由 v2.9 §6 验证）。

## 6. AC → 设计对齐（速览）

| AC | 设计落点 |
|---|---|
| AC-1 | `html.has-touch` + CSS 显隐，纯增量不改状态、不重置对局 |
| AC-2 | 处理层守卫忽略非 PLAYING 输入，键态视觉不变 |
| AC-3~7 | 键 → 引擎既有接口，UI 仅 down/up 两信号；长按连续性由键盘 repeat 机制承担 |
| AC-8 | `touch-action:none` + preventDefault + tap-highlight 透明 |
| AC-9 | 键独立映射、无互斥；去抖/Hold 限次由引擎并行共享 |
| AC-10 | 不拦截键盘事件；按钮焦点可达 |
| AC-11 | 现有 HTML 按钮零改动，触屏均可点（竖屏滚动可达） |
| AC-12 | 底栏/侧轨固定布局 + 遮挡校验（§2.1 ≥99.8%、§2.2 零遮挡）+ 48px 键 |
| AC-13 | `.has-touch` 隐藏 `.key-hints`，键自带标签即图例 |
| AC-14 | 键鼠设备不渲染 `.touchpad`，桌面视觉/交互零变化 |

## 7. 落地改动面（简）

- **index.html**：`body` 末尾新增 `#touch-controls.touchpad`（6 个 `.tkey` button）。
- **style.css**：【r16】2 个新 token + `.touchpad` / `.touchpad--bar` / `.touchpad--rails` / `.tkey` 系列规则（含 `.has-touch` 显隐、竖横断点、安全区、tap-highlight、`hover:hover` 隔离、reduced-motion 兼容）+ `html.has-touch .key-hints{display:none}`。
- **ui.js**：触屏检测加 `html.has-touch` 类；装配挂载每键 touch 事件（down/up/cancel → 引擎输入调用 + preventDefault + PAUSED/OVER 守卫）。实现细节 TECH。

**达标自查**：token 零覆盖（仅 +2）、键鼠桌面视觉零变化、遮挡数学已验证（99.8% / 零遮挡）、48px ≥ 44 达标、图例不误导、按压多信号、reduced-motion 兼容、AC-14 出口可测。

<!-- state -->{"phase":"design","version":"v1.0","summary":"r16 触屏控制 DESIGN 已交付：新增顶级模块 #touch-controls.touchpad（6 键 .tkey：◀左/▶右/⟳旋转/▼软降/⤓硬降/📦Hold）由 html.has-touch 类纯 CSS 显隐；同一 DOM 双排布——竖屏固定底栏 3+3 单行、横屏双侧轨（position:fixed 侧栏），断点切换不改既有 1100/480px 断点；遮挡数学已验：竖屏画布最坏遮挡≤1px(≥99.8%)、横屏中列 668px 容纳板框零遮挡(AC-12 ✓)；键 48px(新增 --tpad-key:3rem)≥44 目标、间距 8px；按压态=描边 primary+标签 accent-hi+glow-primary+scale0.96 多信号，动效对齐既有按钮约定（辉光走 ::before opacity、无入场动画、hover 限 hover:hover、reduced-motion 全局兼容）；新增 token 仅 2 个（--z-touchpad:5、--tpad-key），其余 100% 复用既有；.has-touch 隐藏 .key-hints 键盘图例(AC-13)；键为真实 button+aria-label、键盘可激活(AC-10)；PAUSED/OVER 视觉不变仅守卫忽略(AC-2)。","memory":["r16 触屏操控区设计：#touch-controls.touchpad 固定底栏(竖)/双侧轨(横)6 键，html.has-touch 纯 CSS 显隐，键鼠零视觉变化","新增 token 仅 --z-touchpad:5 与 --tpad-key:3rem(48px≥44)；其余全复用既有 token（surface-2/line/primary/accent-hi/glow-primary/glass-bg）","按压反馈=描边+标签色+辉光+scale 0.96 多信号；无入场动画；reduced-motion 全局规则兼容；hover 仅 hover:hover","AC-12 遮挡校验：竖屏画布最坏遮挡 ≤1px(≥99.8%)、横屏侧轨零遮挡；.has-touch 隐藏键盘图例(AC-13)","触屏键映射引擎既有接口、UI 仅 down/up 两信号，长按连续性由键盘 repeat 机制承担（PRD §8 工程约束）","落地改动面：index.html 新增 .touchpad 模块、style.css 2 token+系列规则、ui.js 检测类+事件挂载；TECH 阶段细化"]}<!-- /state -->