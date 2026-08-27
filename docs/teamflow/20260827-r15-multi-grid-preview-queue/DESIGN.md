# 俄罗斯方块（Tetris）简化版 — 多格预览队列与设置开关 设计文档（r15）

- 版本：**r15**（r14 → r15 增量：**多格预览队列**——Next 预览区由单格升级为 3 格队列 + 设置弹层新增「预览队列」开关）
- 关联 PRD：`docs/teamflow/20260827-r15-multi-grid-preview-queue/PRD.md`（AC-1 ~ AC-12）
- 基线依赖：`docs/teamflow/20260827-r14-hold-piece-toggle/`（Hold 行为不可回归）
- 取代锚点：`docs/teamflow/design/DESIGN.md` 中 AC-06.1「单个下一方块预览」的展示规格（`#next-well` 4×2 单格 → 3 格队列；队列首格即下一块）；基线 §2.3 状态表中「下一个预览 | READY：空」语义随之变更
- 交付形态：单页静态 Web 应用，零外部依赖，`file://` 双击即玩

---

## 0. 现状与约束（先读）

1. **既有结构**（已核实 `index.html` / `style.css` / `ui.js`）：
   - 左面板（`#panel-left`）flex 纵向流：分数 → 最高分 → 等级 → 消除行数 → `.hold-well`（r14，Hold 暂存）→ `.next-well`（单格 `#next-well` 48×24 Canvas）→ ⚙ 设置按钮。
   - 设置控件已在 `#settings-modal` 弹层，分「音频设置」「辅助设置」两组；辅助组现有 幽灵块 / 踢墙旋转 / Hold 暂存 三开关，统一 `.ghost-control` 容器 + `.btn--audio` 按钮 + `aria-pressed`/`aria-label`/文案「开/关」三信号。
   - `#next-well` 规格：48×24（4×2 格 × 12px/格），`1px solid var(--accent)` 琥珀金描边、`var(--radius-sm)` 圆角、`var(--board-bg)` 底色、`0 0 8px rgba(255,217,92,.18)` 辉光；渲染 rot=0、方块色。
2. **PRD 硬约束不变**：科技玻璃、零依赖、单文件内联、仅键盘、桌面优先（基线 §0.2）。
3. **【r15】变更边界**：
   - 只动两处：① `.next-well` 区的展示形态（单格 → 3 格队列，容器与标签不动位置）；② 设置弹层辅助设置组新增 1 个开关行。
   - **不改**：三列 Grid 布局（240px | 340px | 240px）、`.hold-well`、统计块、遮罩/反馈层、状态机维度、快捷键、随机语义。
   - **零新增**：设计 token、组件形态、动效类型、布局结构层级（组件行 +1 不入新层）。

---

## 1. 页面/模块清单与信息架构

### 1.1 变更模块

| 模块 | 现状 | 【r15】变更 |
|---|---|---|
| `.next-well`（左面板预览区） | 单格 48×24 Canvas | 内部升级为 **3 格纵向队列**，每格 48×24（规格逐格同旧）；标签「下一个」**不变**（首格即下一块）；整体展示受新开关控制 |
| `#settings-modal` 辅助设置组 | 幽灵块 / 踢墙 / Hold 三开关 | 尾行新增 `#preview-queue-control` + `#btn-preview-queue` |

### 1.2 信息架构变更（基线 §2.1 树增补）

```
├─ 左信息面板（panel-left）
│   ├─ 统计块：分数 / 最高分 / 等级 / 消除行数
│   ├─ 暂存槽预览（hold-well）        ← 保持（r14）
│   ├─ 下一个（next-well）            ← 【r15】单格 → 3 格队列（队首即下一块）
│   └─ ⚙ 设置按钮
├─ 设置弹层（settings-modal）— 辅助设置组
│   ├─ 幽灵块开关（#btn-ghost）
│   ├─ 踢墙旋转开关（#btn-wallkick）
│   ├─ Hold 暂存开关（#btn-hold）
│   └─ 【r15】预览队列开关（#btn-preview-queue，默认开）  ← 新增尾行
```

### 1.3 状态机 × 可见性（AC-1 / AC-5 / AC-7）

| 模块 \ 状态 | READY | PLAYING | PAUSED | GAME_OVER |
|---|---|---|---|---|
| 预览队列（开关=开） | **初始 3 格**（7-bag 首袋，取代基线「READY 空」） | 实时前移（≤200ms 刷新） | **冻结不变**（不更新） | 显示最终队列；restart 重置为初始 3 格 |
| 预览队列（开关=关） | 整区隐藏（含标签），棋盘/下落/消行/计分不受影响、不重置（AC-7）；**引擎照常维护队列数据，出块序列不变**（AC-9） |
| 开关控件 | **四游戏态恒可用、状态恒定**（全局设置，与 Hold/幽灵开关同级，AC-6） |

---

## 2. 关键页面线框

### 2.1 左面板 Next 预览区（变更标注）

```
下一个
┌────────────────┐
│    ▣▣▣▣       │  ← 格位1（= 下一块，48×24、rot=0）
├────────────────┤  ← 格距 4px（--sp-1，纯 --board-bg）
│      ▣▣       │  ← 格位2
├────────────────┤
│    ▣▣▣        │  ← 格位3
└────────────────┘   ← 琥珀金细描边（容器级，规格同旧 #next-well）
```

- 整区宽度 48px 不变，总高 = 24×3 + 4×2 = **80px**（较旧 24px 增高 ~56px）。左面板为纵向流自适应布局，1080p 无溢出；矮窗口沿用基线 §5.4 既有的降级/滚动机制，本迭代不做专门挤压。
- 队列无方块时空格位纯 `--board-bg` 留白、不报错（AC-4）。
- 格距分隔：默认纯背景留白；可选叠加 1px 极淡分隔线（`rgba(94, 90, 110, 0.35)`，接近 `--line` 系）增强三格辨识——两者视觉效果等价，实现任选其一（默认留白）。

### 2.2 设置弹层 — 辅助设置组（变更标注）

```
辅助设置
├─ 👻 幽灵块：开
├─ 🔄 踢墙旋转：开
├─ 📦 Hold 暂存：开
└─ 【r15】👁 预览队列：开      ← 新增尾行（默认开）
```

- 完全复用 `.ghost-control`（flex column + `gap: var(--sp-2)`）+ `.btn--audio`（`height:32px`、`width:100%`、`white-space:nowrap`、`--fs-sm`）结构。
- 文案形态：`👁 预览队列：开 / 关`（emoji 前缀 + 中文标签 + 开/关尾缀，三信号对齐 👻/🔄/📦；emoji 备选 `📋`，实现可微调，不改模式）。

---

## 3. 交互与动效说明

### 3.1 队列前移流程（与引擎时序对齐，AC-3）

```
当前方块锁定（lockFlow）
  → 耗队首：首格方块出生为当前方块
  → 补尾：尾部新增 1 格（7-bag 后续 peek，不改随机语义）
  → renderAll 单次重绘 3 格位（≤200ms 可见）
```

- 顺序铁律：**展示顺序 = 出块顺序**（固定序列打桩下连续 20 次出生 100% 一致，AC-2）——UI 侧只按 `snapshot.queue` 单向渲染，不做任何自主排序/补全。
- Hold 共存（AC-11）：hold 暂存/交换取出的是「下一个出生方块」即**队首**；hold 操作后队列照常前移补尾，UI 无额外逻辑。

### 3.2 开关交互（AC-6 / AC-7 / AC-9）

```
齿轮 → 设置弹层 → 点击「预览队列」开关
  ├─ 关：.next-well 容器 hidden（含标签、含 3 格队列）——立即隐藏，游戏不暂停、不重置
  ├─ 开：容器恢复，renderAll 按当前 snapshot.queue 立即渲染 3 格——内容与实际序列一致（无错位、无凭空生成）
  └─ 两态均：三信号镜像（aria-pressed / aria-label / 文案）+ persistSettings() 写 localStorage
```

- 开关切换 ≤100ms 响应、显示/隐藏 DOM 变化 ≤200ms（PRD §1.3）。
- 关闭期间引擎**照常**消耗队列生成方块（AC-9）——UI 仅跳过渲染；重开后首帧即与真实序列对齐。

### 3.3 动效清单

| 动效 | 时长 | 说明 |
|---|---|---|
| 队列滚动/前移 | **即时（无过渡）** | 推荐不做位移动画：顺序一致性有可量化断言（AC-2），动画只增实现/测试成本、收益低；对齐 r14「预览出现即时」先例。可选后续增强：150ms ease-out 上移一格，`prefers-reduced-motion` 时降级为瞬时 |
| 开关切换 | 即时（≤200ms） | `.btn--audio` 描边/文字色切换（复用既有 120ms 级） |
| **无新增动效** | — | 同 r14：队列/开关反馈全部由引擎驱动（方块替换 + 音效 + 重绘），UI 无独立动画层 |

---

## 4. 视觉规范

### 4.1 队列容器（`.next-well` 升级版）

| 属性 | 值 | 说明 |
|---|---|---|
| 整区宽度 | 48px | 与旧 `#next-well` 一致，左面板列宽零变化 |
| 格位 | 每格 48×24（4×2 格 × 12px/格） | 与旧 next 预览**逐格一致**：rot=0、方块色（基线 §5.2 七色） |
| 格距 | `var(--sp-1)` = 4px | 队列节奏紧凑（< 容器 gap `--sp-2`） |
| 边框 | `1px solid var(--accent)` | 琥珀金细描边，从旧 canvas 规则**上移至容器级**（同框三段式，读作「一个队列窗口」而非三个独立槽） |
| 圆角 | `var(--radius-sm)` | 同旧 |
| 背景 | `var(--board-bg)` | 同旧 |
| 辉光 | `0 0 8px rgba(255, 217, 92, 0.18)` | 同旧 |
| 空位 | 纯 `--board-bg` 留白 | 同 hold 空槽，无占位文字/图标（AC-4） |

### 4.2 实现装配口径（视觉等价，具体结构交 TECHNICAL 裁决）

- **方案 A（推荐）**：单 Canvas `48×80`，渲染器按 3 个格位 y 偏移（每 28px 一格）绘制；一次 `render(queue)` 完成三格，一次重绘、一个 DOM 节点。
- **方案 B**：3 个 `48×24` Canvas 格位纵向堆叠，逐格复用 `createNextWellRenderer` 既有渲染。
- 两案视觉结果一致；canvas `aria-label` 统一为「预览队列（接下来 3 个方块）」。

### 4.3 开关视觉（`#btn-preview-queue`，完全复用现有规则组）

| 状态 | 描边 | 文字色 | 按钮文案 |
|---|---|---|---|
| 开启 | `var(--accent)` | `var(--accent-hi)` | `👁 预览队列：开` |
| 关闭 | `var(--muted)` | `var(--muted)` | `👁 预览队列：关` |

- 容器 `#preview-queue-control.ghost-control`：`role="group"` + `aria-label="预览队列开关"`。
- 默认值：新会话/无存档 = **开**（AC-8）；有存档按 localStorage `tetris.previewQueueEnabled` 恢复。

### 4.4 设计 Token

**零新增 token**：全部消费既有 `--accent` / `--accent-hi` / `--muted` / `--board-bg` / `--line`（可选分隔线）/ `--sp-1` / `--sp-2` / `--radius-sm` / `--fs-sm`。标签「下一个」沿用 `.stat__label`，文案不变。

---

## 5. 可访问性要点

| 类别 | 要求 | 落地 |
|---|---|---|
| 开关语义 | 状态不只靠颜色 | `aria-pressed` + `aria-label="预览队列：开启/关闭"` + 文案「开/关」三信号（AC-6） |
| 键盘可操作 | 全部功能键盘完成 | 原生 `<button>`，Tab 可达、回车/空格切换、`:focus-visible` 2px 琥珀金外环（复用基线规则） |
| 队列 Canvas | 可感知 | `aria-label="预览队列（接下来 3 个方块）"`；开关关闭时容器 `hidden`，整区（含标签）自动退出可访问树 |
| 队列内容播报 | 不干扰 | 队列属决策信息、非操作反馈，**不触发** `aria-live`（与 hold/旋转同级别） |
| 对比度 | ≥ 4.5:1 | 沿用既有：开态 `--accent-hi` ≈12:1、关态 `--muted` ≈4.6:1，安全 |
| 开关可达性 | 隐藏态可恢复 | 开关行在设置弹层内始终可见可操作（即使队列当前隐藏），用户不会「失去」功能（PRD §7.2 风险缓解） |

---

## 6. 性能注意

- 队列仅在 lockFlow/spawn/开关重开时重绘（非逐帧）：方案 A 单次绘制 3 格位开销 ≈ 旧单格 ×3，量级可忽略，满足数值刷新 ≤200ms 约束。
- 关闭态跳过渲染（引擎仍维护队列数据），零额外开销；开关切换仅 `hidden` 属性 + 三信号镜像，无动画、≤100ms 响应。
- 左面板增高 ~56px 属静态布局差异，不影响逐帧渲染路径。

---

## 7. 交付清单（给前端实现者的落地建议）

1. **`index.html`**：`.next-well` 容器按 §4.2 方案 A/B 升级为 3 格位结构；`#settings-modal` 辅助设置组 `#btn-hold` 容器之后新增：
   ```html
   <div id="preview-queue-control" class="ghost-control" role="group" aria-label="预览队列开关">
     <span class="stat__label">预览队列</span>
     <button type="button" id="btn-preview-queue" class="btn btn--secondary btn--audio"
             aria-pressed="true" aria-label="预览队列：开启">👁 预览队列：开</button>
   </div>
   ```
2. **`style.css`**：`.next-well` 容器级琥珀金框规则（`#next-well` 的 border/radius/background/glow 上移至容器）；`#btn-preview-queue` 复制 `#btn-hold` 的 `aria-pressed` 双态规则。
3. **`ui.js`**：队列渲染器（方案 A：单 Canvas 3 格位；或方案 B：逐格复用 `createNextWellRenderer`）；`syncPreviewQueueBtn()` 三信号镜像；`onPreviewQueueToggle()`（切闭包态 + 容器 `hidden` + persistSettings + blurElement）；`renderAll` 按 `snapshot.queue` + 开关态渲染/隐藏（READY 渲染初始队列，替代现行 `s.phase === 'READY' ? null : s.next`）。
4. **`game.js`**：`snapshot.queue`（长度恒 3）字段、初始队列、lockFlow 前移补尾、restart 重置（技术主导，见 PRD AC-3/AC-5/AC-10）。
5. **`persist.js`**：布尔 `previewQueueEnabled`，存储键 `tetris.previewQueueEnabled`，缺省回退默认开（AC-8）。
6. **验证脚本**：verify-ui 队列 DOM/开关契约、qa-e2e 队列渲染/开关隐藏恢复/持久化场景（技术主导）。
7. **README 同步**：设置说明补「预览队列」开关一行（PRD §7.2 已列风险缓解）；**无新按键，键位图例行不变**。

---

## 8. 已知取舍

- **不做**队列格位滑动动画（默认即时，可量化断言 AC-2 与动画解耦；后续增强项）。
- **不做**格数可配置（固定 3，PRD §3.2 非目标）。
- **不做**队列点击/拖拽交互（非目标）；队列纯展示。
- 标签保持「下一个」不改写「预览队列」——首格即下一块，语义自洽且减少无谓 DOM/文案变更。
- READY 态由「空预览」改为「显示初始 3 格」：取代基线 §2.3 语义（更符合 AC-1「游戏就绪时展示接下来 3 个方块」；启动叙事一致）。

<!-- state -->{"phase":"design","summary":"DESIGN r15 已交付：Next 预览区单格升级为 3 格队列——.next-well 容器保留琥珀金细描边/--board-bg/--radius-sm/辉光（边框自 canvas 上移至容器级），内部 3 个 48×24 格位、格距 var(--sp-1)=4px、总高 80px、每格复用既有 rot=0 迷你渲染，标签「下一个」不变；单 Canvas 48×80 与 3 Canvas 堆叠两案视觉等价交 TECHNICAL 裁决；设置弹层辅助设置组尾行新增 #btn-preview-queue（复用 .ghost-control+.btn--audio+aria-pressed 三信号，文案👁 预览队列：开/关，默认开、持久化 tetris.previewQueueEnabled）；开关关闭整区 hidden（含标签）、引擎照常维护队列不渲染、重开立即按 snapshot 渲染与序列一致；队列滚动即时无动画（可选 150ms 增强、reduced-motion 禁用）；状态机：READY 显示初始 3 格（取代基线 READY 空语义）、PAUSED 冻结、GAME_OVER 显示最终队列、restart 重置；零新增 token/动效/布局结构","memory":[".next-well 容器升级：宽48px、3 格位纵向堆叠、格距 var(--sp-1)=4px、总高80px；边框从 #next-well canvas 上移至容器级(同框三段式队列窗)","每格 48×24 rot=0 渲染与旧 next 预览逐格一致(12px/格)；空位纯 --board-bg；可选 1px 极淡分隔线 rgba(94,90,110,.35)","实现两案视觉等价：A 单 Canvas 48×80 一次 render(queue)；B 3 个 48×24 Canvas 逐格复用 createNextWellRenderer——交 TECHNICAL 裁决","设置弹层辅助设置组尾行新增 #preview-queue-control > #btn-preview-queue，文案👁 预览队列：开/关(emoji 备选📋)，默认开、持久化键 tetris.previewQueueEnabled","开关关闭整区 hidden(含标签)、引擎照常维护队列(AC-9)；重开 renderAll 按 snapshot.queue 立即渲染不重置(AC-7)；开关四游戏态恒可用","状态机变化：READY 由'空'改显示初始 3 格(AC-1)；PAUSED 冻结、GAME_OVER 最终队列、restart 重置(AC-5)；渲染替换现行 s.phase==='READY'?null:s.next 分支","队列前移时序：lockFlow 耗队首→补尾(7-bag peek)→renderAll 单次重绘≤200ms；hold 消费队首不影响队列内容与顺序(AC-11)"]}<!-- /state -->