# r21 特殊奖励 Toast — UI/UX 设计文档（DESIGN）

> 基线依赖：`docs/teamflow/20260828-r20-combo-line-clear-reward`（消费其已预留的 `combo/comboBonus` additive 结算载荷）。
> 取代：`r19#AC-12` Combo 指示器 UI（r20 已归 P2）——本需求以「特殊奖励 Toast」形态落地，并扩展覆盖 r18 T-spin 奖励反馈。
> 产品语义（来自 PRD）：特殊奖励要看得见——触发瞬间一根不打扰的 Toast 表达奖励；纯展示、不改计分。

---

## 0. 现状与约束（先读；代码核查事实，非推测）

- **既有 toast 子系统事实**（style.css / ui.js / index.html 核查）：
  - `#feedback-toast` 是 `#board-frame` 子节点：`position:absolute; top:-12px; left:50%; transform:translateX(-50%); z-index:var(--z-toast)=20`；
  - 视觉 = **琥珀胶囊**：`background:var(--accent)`、深色文字 `rgba(16,15,22,.92)`（对比 ≈12:1）、`border-radius:999px`、`box-shadow:var(--glow-accent)`、`font-weight:700; letter-spacing:.12em; white-space:nowrap`；
  - 状态机 = `[hidden]`（display:none）+ `.is-showing`（`animation: toast-in-out 800ms ease-out`，keyframes：12% 淡入 / 82% 停留 / 100% 淡出，只动 opacity/transform）；
  - js 驱动 = `createFeedback({toast, boardFrame})`，单定时器 `TOAST_MS=800`，先 `clearTimeout` → 去 `.is-showing` → `offsetWidth` 强制 reflow → 加 `.is-showing` → 到时隐藏（**替换即重启动画**模式）；
  - `prefers-reduced-motion` 下：全局 0.01ms 裁剪 + `#feedback-toast.is-showing {opacity:1}` 静态显示、仍由 JS 定时控制隐藏；
  - 板框辉光脉冲 `.is-pulsing`（伪元素 opacity）是 **LEVEL UP 专属签名**。
- **动效语族惯例**（r13 DESIGN / v2.8 DESIGN 动效表）：大反馈统一 **ease-out-quart** 语言；遮罩 160ms、数值变化 120ms、LEVEL UP 800ms±200；均只动 opacity/transform，**禁动画 box-shadow/backdrop-filter/filter**（FPS 红线）。
- **Token 惯例**：r13 / r17 均坚持 **零新增 CSS token**；本需求沿用（AC-9 合规）。
- **r20 载荷**：lockFlow 结算载荷已透出 `combo` 索引与 `comboBonus` 增量（AC-8 已实现并验收）；**`tspin` 字段是否透出 = R1，由技术方案核实**（决定 0-diff 边界与档位名文案的可得性）。
- **红线**：engine（game.js/audio.js）0 行 diff；P0 改动仅 `ui.js` / `style.css` / `index.html` / `scripts/verify-ui.cjs` / `scripts/qa-e2e-jsdom.cjs`；qa-e2e 既有 367 断言零改动、旧事件序列 diff=0；奖励 Toast 不新建孤立组件（AC-1）、不得新增触发源（AC-12）。

## 1. 设计原则（【r21】本需求）

1. **同一家族、两个槽位**：奖励 Toast 复用 LEVEL UP 的**整个子系统**（z-index 层、胶囊形制、keyframes、单定时器替换模式），在 `#board-frame` 内新增**第二槽位** `#reward-toast`——不是新组件，是同一子系统的一根新 DOM 拉线（AC-1「不新建孤立组件」）。
2. **双槽并存 → 同帧可感知**：LEVEL UP 与奖励各占一槽，同帧各自动画互不删除（AC-6「不互删」；这同时天然满足 R2 缓解——验收可按双节点 DOM 断言）。
3. **辨识靠文案，不靠颜色**：奖励胶囊与 LEVEL UP 视觉同族（琥珀），差异由文案承载（`T-Spin …` / `Combo ×…`）；零新 token、零新颜色，阅读不打断。
4. **不打扰**：无奖励静默（AC-5）、不遮挡棋盘中央/Hold/Next/分数区（AC-9）、无新音效/新事件（AC-12）、不动 LEVEL UP 任何既有行为（零回归）。
5. **纯展示**：数值只读结算载荷（AC-7），无跨局状态、无持久化。

## 2. 页面/模块清单与信息架构

单页游戏，**无新页面、无新模块**。本次改动仅影响「游戏板列」反馈层：

```
游戏板列 #board-col（r17 四档布局不变）
└─ #board-frame（position:relative；遮罩/toast 包含块，随板缩放）
   ├─ #overlay            三态遮罩（READY/PAUSED/OVER）【r21 零改动】
   ├─ #feedback-toast     LEVEL UP 槽（top:-12px）【r21 零改动，行为零回归】
   └─ #reward-toast       奖励槽（top:28px）【r21 新增】
```

- IA 变化：无；信息层次 = 板面顶层反馈（z-toast=20）内新增一种「结算奖励」提示，与「升级」提示平级并列。
- 触发源：仅 `onSnapshot`/结算回调中派生（UI 只响应既有事件面，AC-12）。

## 3. 关键布局线框与规格

### 3.1 板面反馈层线框（【r21】新增 #reward-toast）

```
  ┌────────────── #board-frame（板框，随 S/M/L 缩放）──────────────┐
  │   ┌─────────────────────────────────────────────────────┐     │
  │   │   #feedback-toast   top:-12px（既有，琥珀胶囊 800ms）    │ ← 居中，骑上边框
  │   │   #reward-toast     top:28px （【r21】琥珀胶囊 1600ms）   │ ← 其下 8px，不重叠
  │   └─────────────────────────────────────────────────────┘     │
  │                     （板面中央区域保持洁净，无遮挡）                │
  └──────────────────────────────────────────────────────────────┘
```

### 3.2 组件规格（#reward-toast，全部沿用既有 token —— 零新增）

| 项 | 规格 | 依据/说明 |
|---|---|---|
| DOM | `#board-frame` 内、`#feedback-toast` 之后：`<div id="reward-toast" role="status" aria-live="polite" hidden>` | AC-8；独立挂载点避免污染既有选择器（R3 缓解） |
| 定位 | `position:absolute; top:28px; left:50%; transform:translateX(-50%)`；`z-index:var(--z-toast)` | LEVEL UP（-12px）之下 8px，纵向 stack 不重叠 |
| 形制 | `padding:var(--sp-2) var(--sp-5); border-radius:999px; background:var(--accent); color:rgba(16,15,22,.92); font-weight:700; letter-spacing:.12em; white-space:nowrap` | 与 LEVEL UP 逐项一致（同族胶囊） |
| 尺寸 | `font-size:var(--fs-md)`；L/M 不变；S 档降级：横屏 `var(--fs-sm)`、竖屏 `var(--fs-xs)`；`max-width:min(92%, 320px)` | AC-9：四档可见、resize 不越界；百分比相对板框自动缩放 |
| 辉光 | `box-shadow:var(--glow-accent)` | 静态辉光合法；**动画仅 opacity/transform** |
| 状态 | `[hidden]` / `.is-showing`（`animation: toast-in-out 1600ms ease-out`） | 复用既有 keyframes 时间轴（12%/82%/100% 比例自动拉长）；时长常量 `TOAST_DURATION=1600` 单一事实源在 ui.js 顶部，verify-ui 断言 1200~2000ms |
| reduced-motion | 复用全局 0.01ms 裁剪 + `#reward-toast.is-showing {opacity:1}` 静态镜像（新增同款规则，不改既有那一条） | AC-8；JS 定时仍 1600ms 后隐藏 |
| 专属签名 | **无**板框脉冲、**无**音效 | 板框辉光是 LEVEL UP 专属（AC-5 既有反馈零影响）；AC-12 零新增触发源 |
| 移动端 | S 竖屏一屏零滚动、板框缩放时胶囊随包含块收缩（max-width 92%），不遮挡中央 | AC-9/R6 |

### 3.3 状态规格（奖励槽）

| 状态 | 触发 | 表现 |
|---|---|---|
| hidden | 默认 / 无奖励结算 / OVER / restart | `display:none`，DOM 0 残留（OVER/restart 走既有 dispose 路径，扩为清双槽） |
| showing | 结算有分轴且奖励总 >0 | 淡入→停留→淡出（1600ms），只动 opacity/transform |
| replaced | 显示期内新奖励触发 | `clearTimeout` → 去类 → reflow → 重加类 → 重定时（**替换不堆积**，AC-6） |
| merged | 同帧多轴有分 | 合并为 1 根，全轴信息各呈现一次（见 §4 文案表） |
| static | reduced-motion | 静态文本显示，1600ms 后由 JS 定时隐藏（沿用既有） |

## 4. 交互与动效说明

- **触发时机**：消行结算点（消行动画结束、计分同点）——与 LEVEL UP 触发同位（AC-6）。UI 在既有回调中判定「本次结算有无有分奖励轴」，纯派生、无自有计分路径。
- **文案表**（数值一律只读结算载荷；模板照 PRD §决策）：
  | 轴 | 条件 | 文案 |
  |---|---|---|
  | Combo | `comboBonus>0`（combo≥1） | `Combo ×{combo} +{bonus}`（例：L1 链 0→1→2 第 3 次消行 → `Combo ×2 +100`，AC-2 种子） |
  | T-Spin | 六档任一有分（r18） | `T-Spin +bonus`；载荷含档位名可扩展为 `T-Spin Single +1200`（不强制） |
  | 多轴合并 | 同帧 ≥2 轴有分 | ` · ` 分隔，**T-Spin 在前、Combo 在后**：`T-Spin Double +1200 · Combo ×2 +100`（AC-4：恰各一次、无轴丢弃） |
  | 无奖励 | comboBonus=0 且 T-spin 0 分（含 No-line T-spin） | **不弹**（AC-3/AC-5） |
- **动效**：进场 = 复用 `toast-in-out` 关键帧（12% 淡入 / 82% 停留 / 100% 上移淡出），时长 1600ms，缓动沿用现有（ease-out-quart 语族，实现以现状 ease-out 为下限不另行扩写）；只动 opacity/transform；**不新建 keyframes**。
- **排队/替换**：单定时器替换模式（有替无积），同 frame 内多轴已合并不再排队。
- **清理**：OVER/restart → 清空奖励槽（0 残留、无跨局状态）；页面刷新天然无残留（无持久化）。
- **与 LEVEL UP 同帧**：两槽位互不干扰，各自动画、各自定时器；纵向上 -12px / 28px 无重叠（AC-6 验收以双节点 DOM 断言为准）。

## 5. 视觉规范

- **全部沿用既有 token，零新增**（延续 r13/r17 惯例；AC-9）：
  - 胶囊底 `--accent`（`#ffd95c`，oklch(0.78 0.130 85)）+ 辉光 `--glow-accent`；
  - 文字深色 `rgba(16,15,22,.92)`（对比 ≈12:1，非纯颜色传达——文案本身含关键词与数字）；
  - 字体 `--font-ui`、字号 `--fs-md`（S 档降级 `--fs-sm`/`--fs-xs`）、间距 `--sp-2/--sp-5`、圆角 `999px`、`--z-toast=20`；
  - 动效 token：ease-out-quart 语族；时长 `TOAST_DURATION=1600ms`（与 LEVEL UP 800ms 同族不同档，信息量更大）。
- **与 LEVEL UP 的辨识**：同一琥珀家族 → 视觉不打断；差异 100% 来自文案（`T-Spin`/`Combo ×` 关键词 + 数值）。
- **已知取舍（设计边界声明）**：极端长文案（如双轴高分）在 S 竖屏由 `max-width:min(92%,320px)` 兜底、字号降 `--fs-xs`，可能撑近全宽但**永不越界出框**；不做省略号截断（AC-4 要求全轴信息可见）。

## 6. 可访问性要点

- `#reward-toast`：`role="status"` + `aria-live="polite"`（奖励高频，不打断读屏——与 LEVEL UP 的 assertive 形成层级差异；**既有 LEVEL UP 的 assertive 零改动**，AC-8）。
- 信息以文本为主（关键词+数值），不依赖纯颜色（AC-8）。
- 琥珀底深字对比 ≈12:1（既有规格沿用）。
- `prefers-reduced-motion`：静态显示 + JS 定时隐藏（继承 §0 既有机制，仅镜像一条 CSS 规则）。

## 7. 性能注意

- 动效仅 opacity/transform（AC-09 FPS 红线）；静态辉光走 box-shadow 属性值，**动画阶段不触碰**。
- 单元素 + 单定时器；无新事件源、无新音效（AC-12）。
- 断点切换零 JS（r17 派生样式惯例）；无逐帧重绘新增（toast 为 DOM 层，独立于 Canvas）。

## 8. 交付清单（给前端实现者，【r21】专项）

- **index.html**：`#board-frame` 内新增 `#reward-toast`（`role="status" aria-live="polite" hidden`，位于 `#feedback-toast` 之后）。
- **style.css**：
  1. `#reward-toast` 基础规则（3.2 表；top:28px、胶囊同族、`max-width:min(92%,320px)`）；
  2. `.is-showing` 动画 `toast-in-out 1600ms ease-out`（复用既有 keyframes，不新建）；
  3. reduced-motion 静态镜像 `#reward-toast.is-showing{opacity:1}`（不改既有那一条）；
  4. r17 四档断点内字号降级（L/M `--fs-md`；S 横 `--fs-sm`；S 竖 `--fs-xs`）；零新 token。
- **ui.js**：
  1. 顶部新常量 `TOAST_DURATION=1600`（verify-ui 断言 1200~2000ms 值域 + 接口存在，AC-1/AC-6）；
  2. `createFeedback` 同子系统内扩展奖励驱动（同一单定时器替换模式；可增 `reward(text)` 同级方法，或同级兄弟驱动）——AC-1「不新建孤立组件」；
  3. 结算回调中按 §4 文案表判定/合并/触发；OVER/restart 清空走既有 dispose 路径扩为清双槽。
- **R1 提示**：M1 先核实 tspin 是否随载荷透出——透出则档位名文案可用；不透出则最小形态 `T-Spin +bonus` 兜底（PRD 允许）；若确需最小扩展引擎载荷，**必须先明示新红线文件清单（AC-10）再动**，DESIGN 不受影响（文案模板已双态兼容）。

<!-- state -->{"phase":"design","summary":"r21 设计收口：同一子系统、双槽位——新增 #reward-toast（#board-frame 内 top:28px，LEVEL UP -12px 之下 8px 纵向 stack），琥珀胶囊同族、零新 token、复用 toast-in-out keyframes（1600ms/ease-out-quart 语族、只动 opacity/transform）、单定时器替换模式；双槽并存天然满足 AC-6 同帧可感知（验收按双节点 DOM 断言）；文案照 PRD 模板（Combo ×n +bonus；T-Spin [+档位名] +bonus；多轴 T-Spin 先 Combo 后 · 分隔；全 0 不弹；No-line 不弹）；无板框脉冲/无新音效/无新事件源（AC-12）；OVER/restart 走既有 dispose 扩清双槽 0 残留；reduced-motion 静态镜像一条规则；aria-live=polite（LEVEL UP assertive 零改动）；布局 max-width:min(92%,320px)+S 档字号降级 fs-sm/fs-xs 保四档可见不越界；R1 tspin 透出待技术方案核实（档位名文案双态兼容，若需扩展引擎载荷须先明示新红线文件清单）。","memory":["设计决策：复用 LEVEL UP toast 子系统开第二槽位 #reward-toast（非新组件，AC-1）；双槽并存实现 AC-6 同帧可感知/不互删","视觉=既有琥珀胶囊全 token 复用、零新增 CSS token（延续 r13/r17 惯例，AC-9）；辨识靠文案不靠颜色","布局：#board-frame 内 top:28px（LEVEL UP -12px 下 8px）；max-width:min(92%,320px)；S 横 fs-sm / S 竖 fs-xs 降级；不遮挡中央与侧面板","动效：复用 toast-in-out keyframes（不新建），时长 TOAST_DURATION=1600ms 常量在 ui.js 顶部（verify-ui 断言 1200~2000）；只动 opacity/transform；替换=单定时器 clearTimeout+reflow 重启","文案模板（PRD 同源）：Combo ×{n} +{bonus}；T-Spin [+档位名可选] +bonus；多轴 ' · ' 分隔 T-Spin 先 Combo 后；全 0 / No-line 不弹","清理/合规：OVER/restart 既有 dispose 扩清双槽 0 残留；无持久化无跨局；无新 sfx/事件（AC-12）；LEVEL UP 行为与断言零改动","a11y：#reward-toast role=status aria-live=polite；LEVEL UP assertive 不动；reduced-motion 静态镜像一条 CSS 规则","R1 待技术方案核实：tspin 是否随载荷透出——决定档位名文案可得性；如需最小扩展引擎载荷必须重声明红线文件清单（AC-10）","交付面：index.html +1 节点；style.css 基础+动画时长+reduced-motion 镜像+四档字号；ui.js 常量+子系统内奖励驱动+结算回调判定合并；engine 0 行"]}<!-- /state -->