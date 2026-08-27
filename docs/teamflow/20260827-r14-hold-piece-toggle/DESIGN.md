# 俄罗斯方块（Tetris）简化版 — Hold 暂存方块功能 设计文档（r14）

- 版本：**r14**（r13 → r14 增量：**Hold 暂存方块**——暂存槽预览 Canvas + 设置弹层 Hold 开关 + 暂存键 C/Shift）
- 关联 PRD：`docs/teamflow/20260827-r14-hold-piece-toggle/PRD.md`（AC-1 ~ AC-17）
- 交付形态：单页静态 Web 应用，零外部依赖，`file://` 双击即玩

---

## 0. 现状与约束（先读）

1. **既有代码结构**：设置控件已迁移至 `#settings-modal` 弹层（BEM `.settings-modal`），分两组：「音频设置」（音量 + BGM）和「辅助设置」（幽灵块 + 踢墙旋转）。Hold 开关应归入「辅助设置」组。
2. **预览 Canvas 规范**：Next 预览为 4×2 迷你 Canvas（`width="48" height="24"`），琥珀金描边、`--board-bg` 底色，尺寸适配 7 种方块最大 bounding box。Hold 预览复用同款规格。
3. **面板布局**：左面板（`#panel-left`）为 flex 纵向流，依次：分数 → 最高分 → 等级 → 行数 → Next 预览 → 设置按钮。Hold 预览插入 Next 预览**之前**，形成对称双预览结构。
4. **PRD 硬约束不变**：科技玻璃风格、零依赖、单文件内联、仅键盘操作。

---

## 1. 页面/模块清单与信息架构

### 1.1 新增模块

| 模块 | 职责 | 位置 |
|---|---|---|
| `#hold-well` | 暂存槽方块预览 Canvas | `#panel-left`，Next 预览上方 |
| `#btn-hold` | Hold 暂存开关（设置弹层） | `#settings-modal` 辅助设置组，幽灵块开关下方 |
| `#hold-control` | Hold 开关容器 `div.ghost-control` | 同上 |

### 1.2 信息架构变更（§2.1 树增补）

```
├─ 左信息面板（panel-left）
│   ├─ 统计块：分数 / 最高分 / 等级 / 消除行数
│   ├─ 【r14】暂存槽预览（hold-well）  ← 新增，4×2 迷你 Canvas
│   ├─ 下一个方块预览（next-well）
│   └─ 设置按钮（⚙ 设置，打开 settings-modal）
├─ 设置弹层（settings-modal）— 辅助设置组
│   ├─ 幽灵块开关（#btn-ghost）
│   ├─ 踢墙旋转开关（#btn-wallkick）
│   └─ 【r14】Hold 暂存开关（#btn-hold，默认开）
```

---

## 2. 关键页面线框

### 2.1 左面板布局（变更标注）

```
┌──────────────────────┐
│ 分数        012340   │
│ 最高分      050000   │
│ 等级/行数            │
├──────────────────────┤
│ 暂存                 │  ← 【r14】Hold 预览
│ ┌────────────┐       │
│ │  (空) / ▣▣ │       │  48×24 Canvas，琥珀金描边
│ └────────────┘       │
├──────────────────────┤
│ 下一个               │
│ ┌────────────┐       │
│ │  ▣▣        │       │  48×24 Canvas，琥珀金描边
│ └────────────┘       │
├──────────────────────┤
│ ⚙ 设置               │
└──────────────────────┘
```

- Hold 预览位于「等级/行数」与「下一个」之间，形成双预览对称布局。
- Hold 空槽时 Canvas 清空（透明/`--board-bg` 底色），与 Next 空态一致。

### 2.2 设置弹层 — 辅助设置组（变更标注）

```
┌──────────────────────────────┐
│ 辅助设置                      │
│ ├─ 👻 幽灵块：开              │
│ ├─ 🔄 踢墙旋转：开            │
│ └─ 【r14】📦 Hold 暂存：开    │  ← 新增开关
└──────────────────────────────┘
```

- Hold 开关复用 `.ghost-control` 容器 + `.btn--audio` 按钮，与幽灵块/踢墙开关同结构。
- 文案形态：`📦 Hold 暂存：开 / 关`（emoji 前缀 + 中文标签 + 开/关尾缀，对齐现有三信号模式）。
- `aria-pressed="true"` + `aria-label="Hold 暂存：开启/关闭"`。

---

## 3. 交互与动效说明

### 3.1 按键映射（新增）

| 按键 | 作用 | 前置条件 |
|---|---|---|
| `C` 或 `Shift` | 暂存当前方块 / 与暂存槽交换 | HOLD_ENABLED=true 且 RUNNING 且本周期未使用过 |

### 3.2 Hold 操作流程

```
按 C / Shift
  ├─ Hold 关闭？ → 忽略（无音效）
  ├─ 非 RUNNING？ → 忽略
  ├─ 本轮已使用 hold？ → 忽略（无音效）
  └─ 有效操作：
       ├─ 暂存槽为空：
       │    当前方块 → 暂存槽
       │    next → 当前方块（rot=0、出生点）
       │    队列补充
       ├─ 暂存槽非空：
       │    当前方块 ↔ 暂存槽交换
       │    next → 当前方块（rot=0、出生点）
       │    队列补充
       └─ 播放 hold 音效
       └─ 标记 holdUsed = true（锁定后重置）
```

### 3.3 Hold 开关实时切换

- RUNNING 状态下关闭 Hold：暂存槽保留但不可交换（锁定后清空）。
- RUNNING 状态下开启 Hold：立即可用。
- 切换不暂停游戏，下一次暂存操作即按新状态执行。

### 3.4 动效清单

| 动效 | 时长 | 说明 |
|---|---|---|
| Hold 预览出现 | 即时 | 方块进入暂存槽后 Canvas 立即重绘，无过渡 |
| Hold 开关切换 | 即时 | `.btn--audio` 描边/文字色切换（复用既有 120ms 级） |
| **无新增动效** | — | Hold 操作反馈完全由引擎驱动（方块替换 + 音效），UI 无独立动画层 |

### 3.5 Hold 音效

- 新增合成音效 `hold`：短促清脆的「锁定/拾取」质感（建议 150~250ms，方波 + 快速衰减包络），音量跟随主音量。
- `audio.js` `SFX_EVENTS` 新增 `hold` 事件，`SFX_DEFS` 新增对应合成参数。

---

## 4. 视觉规范

### 4.1 Hold 预览 Canvas（`#hold-well`）

复用 Next 预览（`#next-well`）同款规格：

| 属性 | 值 | 说明 |
|---|---|---|
| 尺寸 | `width="48" height="24"` | 4×2 格 × 12px/格，与 Next 对齐 |
| 描边 | `1px solid var(--accent)` | 琥珀金描边，对齐 `#next-well` |
| 圆角 | `var(--radius-sm)` | 对齐 `#next-well` |
| 背景 | `var(--board-bg)` | 对齐 `#next-well` |
| 辉光 | `box-shadow: 0 0 8px rgba(255, 217, 92, 0.18)` | 对齐 `#next-well` |
| 方块渲染 | 与 Next 预览相同绘制函数 | rot=0，使用 `SHAPES[piece]` 的 0° 旋转态 |

**空槽状态**：Canvas 清空为纯背景色（无占位文字/图标），保持视觉简洁。

### 4.2 标签文案

- Hold 预览上方标签：`暂存`（与「下一个」标签对齐，`.stat__label` 样式）。
- 标签位置：Canvas 上方，flex column + gap `var(--sp-2)`，与 `.next-well` 容器结构完全一致。

### 4.3 Hold 开关视觉

完全复用现有开关 token：

| 状态 | 描边 | 文字色 | 按钮文案 |
|---|---|---|---|
| 开启 | `var(--accent)` 琥珀金 | `var(--accent-hi)` | `📦 Hold 暂存：开` |
| 关闭 | `var(--muted)` 中性灰 | `var(--muted)` | `📦 Hold 暂存：关` |

- 容器 `.ghost-control`：`display: flex; flex-direction: column; gap: var(--sp-2);`
- 按钮 `.btn--audio`：`height: 32px; padding: 0 var(--sp-3); font-size: var(--fs-sm);`
- 按钮宽度：`width: 100%; white-space: nowrap;`

### 4.4 设计 Token

本次**零新增 token**，全部消费既有 `--accent` / `--accent-hi` / `--muted` / `--board-bg` / `--sp-2` / `--sp-3` / `--radius-sm` / `--fs-sm`。

---

## 5. 可访问性要点

| 类别 | 要求 | 落地 |
|---|---|---|
| 开关语义 | 状态不只靠颜色 | `aria-pressed` + `aria-label` + 文案「开/关」三信号（对齐 AC-13.5 模式） |
| 键盘可操作 | 全部功能可键盘完成 | 开关为原生 `<button>`，Tab 序列中可达，回车/空格切换，`:focus-visible` 2px 琥珀金外环 |
| 预览 Canvas | 可感知 | `<canvas>` 含 `aria-label="暂存槽预览"`；空槽时画布内容为空但标签仍描述「暂存槽预览」 |
| 对比度 | ≥ 4.5:1 | 开启态 `--accent-hi` ≈ 12:1；关闭态 `--muted` ≈ 4.6:1（均安全） |
| 暂存键播报 | 不干扰 | 暂存键操作不触发 `aria-live` 播报（与旋转操作同级别，不需要独立播报层） |

---

## 6. 性能注意

- Hold 预览 Canvas 为 48×24 极小画布，仅在暂存操作时重绘（非逐帧），性能开销可忽略。
- 暂存操作为纯函数逻辑（交换引用 + 重置出生点），≤1 帧完成，满足 ≤100ms 响应。
- 设置弹层为 DOM 层，打开/关闭仅 `hidden` 切换 + `aria-modal` 焦点管理，无动画，无性能影响。

---

## 7. 交付清单（给前端实现者的落地建议）

1. **`index.html`**：
   - `#panel-left` 内，`#next-well` 父容器 `.next-well` 之前，新增：
     ```html
     <div class="next-well">
       <span class="stat__label">暂存</span>
       <canvas id="hold-well" width="48" height="24" aria-label="暂存槽预览"></canvas>
     </div>
     ```
   - `#settings-modal` 辅助设置组（`.settings-group--assist`），`#btn-wallkick` 容器之后，新增：
     ```html
     <div id="hold-control" class="ghost-control" role="group" aria-label="Hold 暂存开关">
       <span class="stat__label">Hold 暂存</span>
       <button type="button" id="btn-hold" class="btn btn--secondary btn--audio"
               aria-pressed="true" aria-label="Hold 暂存：开启">📦 Hold 暂存：开</button>
     </div>
     ```

2. **`style.css`**：
   - `#hold-well` 复制 `#next-well` 规则（零改动语义相同）。
   - Hold 开关复用 `#btn-wallkick` 同款 `aria-pressed` 规则（仅换选择器为 `#btn-hold`）。

3. **`ui.js`**：
   - 闭包 `let holdEnabled = true`（默认开，AC-11）+ `let holdUsed = false`（本周期是否已 hold）。
   - `syncHoldBtn()`：aria-pressed / aria-label / 文案三信号镜像。
   - `onHoldToggle()`：切换闭包态 + 镜像 + persistSettings() + blurElement + 若关闭且 RUNNING 则锁定后清空暂存槽。
   - `renderHoldWell(piece)`：4×2 Canvas 绘制暂存方块（rot=0，复用 Next 预览绘制逻辑）。
   - 按键绑定：`C` / `Shift` → hold 操作（guard: holdEnabled && state==='RUNNING' && !holdUsed）。
   - `onLock` 回调中重置 `holdUsed = false`（每个方块下落周期重置，AC-5）。

4. **`game.js`**：
   - Hold 核心逻辑：`hold()` 方法管理暂存槽状态、交换/存入、方块替换（rot=0、出生点）。
   - 返回 `{ ok: boolean, reason?: string }` 供 UI 判断是否播放音效。
   - hold 期间不干扰 lockFlow / clearing 子阶段（AC-6）。

5. **`audio.js`**：
   - `SFX_EVENTS` 新增 `'hold'`。
   - `SFX_DEFS` 新增 hold 合成音效参数（短促清脆，150~250ms）。

6. **`persist.js`**：
   - sanitize 白名单新增布尔 `holdEnabled` 键。
   - 存储键 `tetris.holdEnabled`；缺省回退默认开（AC-14）。

7. **验证脚本**：
   - `verify-game.cjs`：新增 Hold 逻辑用例（空槽存入 / 非空交换 / 限制次数 / 健壮性）。
   - `verify-ui.cjs`：新增 Hold 按钮契约 + Hold 预览渲染契约。
   - `qa-e2e-jsdom.cjs`：新增 Hold E2E 场景。
   - 回归：AC-1~13 不回归，237 基线用例全绿。

8. **键位图例**（`#panel-right`）：
   - 新增一行：`暂存 / 交换` → `<kbd>C</kbd><kbd>Shift</kbd>`。

---

## 8. 已知取舍

- 不做暂存次数无限制（每周期限 1 次，AC-5）。
- 不做暂存多槽位（仅 1 个暂存位）。
- 不做暂存方块旋转预览（仅显示 rot=0）。
- Hold 关闭时暂存槽清空时机：当前方块锁定后清空（AC-15），而非立即清空（保留已暂存方块的视觉，但不可交换）。

<!-- state -->{"phase":"design","summary":"DESIGN r14 已交付：Hold 暂存方块功能——左面板新增 hold-well 迷你 Canvas（复用 next-well 48×24 琥珀金描边规格）对称放置于 Next 预览上方；设置弹层辅助设置组新增 #btn-hold 开关（复用 .ghost-control+.btn--audio+aria-pressed 三信号模式，默认开，持久化 tetris.holdEnabled）；C/Shift 暂存键绑定（guard: holdEnabled+RUNNING+!holdUsed）；hold 合成音效（SFX_EVENTS 新增 'hold'）；零新增 token/动效/布局结构，全部复用既有设计系统","memory":["左面板预览区双 Canvas：hold-well(48×24)在 next-well 上方，标签「暂存」/「下一个」","设置弹层辅助设置组新增 #btn-hold，复用 .ghost-control + .btn--audio + aria-pressed 三信号","Hold 开关默认开、持久化 tetris.holdEnabled、关闭时锁定后清空暂存槽","暂存键 C/Shift → hold 操作，每周期限 1 次(holdUsed 重置于 onLock)","Hold 音效为新增合成事件，SFX_EVENTS/SFX_DEFS 需扩展"]}<!-- /state -->
