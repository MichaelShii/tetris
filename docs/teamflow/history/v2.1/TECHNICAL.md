# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）

- 版本：v2.1（v2.0 → v2.1 增量：暂停/继续快捷键；**不改 UI 视觉**）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`products/tetris/docs/prd/PRD.md`（v2.1，**验收唯一依据**，AC-01~11）、`products/tetris/docs/design/DESIGN.md`（§4.1 输入映射，本次需文档同步）、`products/tetris/docs/architecture/ARCHITECTURE.md`（工程方案，实际交付为扁平纯 JS）、`products/tetris/AGENTS.md`（§4 工程约定）、`products/tetris/scripts/*`（可执行契约）
- 定位：将 PRD v2.1 增量（AC-11 暂停/继续快捷键：`P` 双向切换保持 + `空格` 暂停态继续）落实为**与流水线派发任务对齐**的接口契约、实现要点、测试策略与任务拆分。v2.0 已交付的玩法/计分/音效/音量契约**全部沿用不变**（AC-01 ~ AC-10 为本版回归底线）。
- 交付物：`products/tetris/game.js`（键盘映射扩展）+ `scripts/verify-game.cjs`（单测增量）+ `scripts/qa-e2e-jsdom.cjs`（E2E 增量与既有用例调整）+ `scripts/assembly-check.cjs`（导出面增量）+ `docs/design/DESIGN.md`（输入映射文档同步）。**`audio.js` / `ui.js` / `index.html` / `style.css` 零改动**（AC-11.7 硬约束）。

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0 | 2026-08-16 | 初版技术方案（TS+Vite 规划 + 任务拆分 T0~T13）；交付后补注实际偏差：按流水线合并任务以扁平纯 JS 交付（`game.js`/`ui.js`/`style.css`/`index.html`，UMD 契约），`node:test` 脚本替代 Vitest，TS+Vite 保留为可选工程化路径 |
| v2.0 | 2026-08-16 | 音效系统：`audio.js` 合成引擎（7 类事件音效参数表，AC-09）+ 音量/静音控制（AC-10）+ `game.js` `onSfx` 事件出口 + 测试/装配审计增量；既有玩法、计分、数值、键盘映射不动 |
| v2.1 | 2026-08-16 | **本次变更**：暂停/继续快捷键——`game.js` 键盘映射扩展（`P` 双向切换保持 + `空格` PAUSED 态继续，AC-11）+ 键盘映射单一来源表 `keyAction` 导出 + 单测/E2E/装配审计增量 + DESIGN 文档同步；**状态机、数值、UI DOM/CSS、audio.js、ui.js 零改动** |

> **实际交付形态（沿用）**：`index.html + 本地 css/js`，脚本顺序 `audio.js → game.js → ui.js → 内联装配`；UMD 契约 `window.TetrisGame / window.TetrisAudio / window.TetrisUI`。v2.0 快照（PRD/TECHNICAL）已归档至 `docs/history/v2.0/`。

---

## 0. 现状核验与 v2.1 增量边界（要求 1）

### 0.1 现状核验（v2.0 已交付，实测代码为准）

| 检查项 | 结果 |
|---|---|
| 工程形态 | 扁平纯 JS：`game.js`（引擎/状态机/时钟/键盘/onSfx，零 DOM 副作用）、`audio.js`（合成音效）、`ui.js`（渲染/HUD/遮罩/音量控件/装配）、`index.html`、`style.css`；无 package.json/构建管线，`scripts/*.cjs` 为 node:test 自检 |
| 验证命令（产品根下） | `verify-game.cjs`（44 项）· `verify-audio.cjs`（19 项）· `verify-ui.cjs`（6 项）· `assembly-check.cjs` · `qa-e2e-jsdom.cjs`（139 项）—— v2.0 验收全绿 |
| 代码风格 | 工厂函数 + 闭包（不用 class）、纯函数优先、不可变棋盘、`dispose()` 统一清理、常量单一事实来源 `game.js` 顶部 |
| 阶段命名 | `READY / RUNNING / PAUSED / OVER`（`PHASE_ALIAS`：RUNNING≡PLAYING、OVER≡GAME_OVER） |

**v2.1 设计直接依赖的 5 个实现事实**（均已核实，行号为当前 `game.js`）：

1. **键盘单一入口**：`onKeyDown(e)`（`game.js` L683~735）为 window 级 `keydown`；顶部统一对方向键与空格 `preventDefault()`（L687，防页面滚动/防按钮激活），`e.repeat` 提前返回（L690）。阶段分支：READY（L693~697：`Enter`/`空格`=start、`r`=restart）→ OVER（L698~701：`r`/`Enter`=restart）→ PAUSED（L702~706：`p`/`Escape`=togglePause、`r`=restart）→ RUNNING（L707~734：方向键 DAS/软降 + `空格`=hardDrop + `p`/`Escape`=togglePause + `r`=restart）。
2. **PAUSED 态 `空格` 当前无动作**（L702~706 无空格分支）→ v2.1 在此分支新增「继续」；PLAYING 态 `空格`=hardDrop 分支（L728~729）**不动**。
3. **`togglePause()`（L487~502）不触碰计时累加器**：pause 仅 `stopLoop()`、resume 仅 `startLoop()`，`state.gravityAcc`/`state.lockTimer` **保留** → 恢复后按「暂停前剩余间隔」差值续算（AC-11.4 天然满足，只需单测钉死）。
4. **音效链路**：`game.js` 只发事件名（`sfx()` L398~401，7 类 `SFX_EVENTS`）→ `ui.js` 接线 `onSfx → sfx.play` → `audio.js` 合成。`start()/restart()/togglePause()` 均**不发射音效**（PRD §5.2 事件集 7 类不含暂停/继续）→ v2.1 新增按键路径不产生任何新 `onSfx` 发射。
5. **GAME_OVER 态 `空格` 语义分歧**：实际代码 OVER 分支无空格处理（无动作），而 PRD §4 流程图、README 均表述「GAME_OVER 空格=重新开始」→ 见 **§6.2 决策记录 D-01**。

### 0.2 v2.1 增量边界（只加不改）

1. **不改**：状态机迁移矩阵（`PHASE_TRANSITIONS`/`transition`/`togglePause` 签名与语义）、计分/升级/速度公式、`audio.js`、`ui.js`、`index.html`、`style.css`（AC-11.7 零视觉硬约束：**不新增/修改任何 DOM 元素、CSS 规则与图标**；暂停遮罩文案「按 P / Esc 继续」等 DOM 文本一律不动）。
2. **新增/调整（唯一代码变更面 = `game.js` 键盘层）**：
   - 导出纯函数 `keyAction(phase, key) → action | null`（**键盘映射单一来源表**，PRD §7.2 风险缓解要求；Node 可单测）；
   - `onKeyDown` 改为基于 `keyAction` 分发（行为与现状等价，见 §6.1）；
   - PAUSED 分支新增 `空格 = 继续`（AC-11.2）；
   - OVER 分支按 **D-01 方案甲** 新增 `空格 = 重新开始`（使 PRD §4/README 口径成立，AC-11.6）。
3. **测试/文档增量**：`scripts/verify-game.cjs`（keyAction 矩阵 + 恢复节拍 + 无音效断言）、`scripts/qa-e2e-jsdom.cjs`（AC-11 新块 + AC-04/AC-05 既有用例调整，精确位置见 §7.2）、`scripts/assembly-check.cjs`（`keyAction` 导出面）、`docs/design/DESIGN.md`（§4.1/§2.3 输入映射同步，非视觉文档）。
4. **README 已由产品经理同步**（AC-11 行 + 空格说明已在 v2.1 版本），开发阶段只需核对一致，无需再改。

---

## 1. 总体架构与数据流（v2.1 增量视角）

```
input（window keydown）
  → onKeyDown：统一 preventDefault（方向键/空格）→ e.repeat 守卫 → keyAction(phase, key) 映射表
      │ 返回 action ∈ {start, restart, togglePause, moveLeft, moveRight, softDrop, rotate, hardDrop} | null
      ▼
  动作分发（moveLeft/moveRight/softDrop 保留既有 DAS/软降按住语义；其余单发）
      ▼
  createGame 会话（唯一可变状态，状态机/时钟/音效出口全部不变）
      │ 成功动作/事件 → onSfx(name)（仅既有 7 类；暂停/继续不发射，AC-11.3）
      ▼
  ui.js 接线 → audio.js 合成（零改动）
```

- **键盘映射是唯一变更层**：状态机、UI、音频全部零改动——v2.1 的全部行为差异收敛在 `keyAction` 一张表内（阶段 × 按键 → 动作），便于单测钉死、审查与回滚。
- **同一按键按 phase 分流**（AC-11.2/3 核心机制）：`空格` 在 READY=start、RUNNING=hardDrop、PAUSED=togglePause（v2.1 新增）、OVER=restart（D-01 甲）；`P` 在 RUNNING/PAUSED=togglePause、READY/OVER=null（无副作用，AC-11.6）。一次 keydown 只会命中一个分支 → 「恢复瞬间不触发硬降」（AC-11.3）由分支互斥天然保证。
- **音效口径**：暂停/继续**不新增音效事件**（PRD §5.2 事件集 7 类不变；`togglePause` 不发射，沿袭 TECHNICAL v2.0 §3.2 结论）。派发任务中「接入已有 audio 反馈」= **保持既有 onSfx→audio 接线零改动、新增按键路径不误触发硬降音效**（AC-11.3：恢复瞬间 `spy.plays` 无新增）。

---

## 2. 数据模型与存储（要求 2）

### 2.1 键盘映射单一来源表 `KeyActionMap`（v2.1 新增数据契约）

> PRD §7.2 风险「空格键语义冲突」缓解要求"键盘映射单一来源表维护"。落点为 `game.js` 新增导出的**纯函数** `keyAction(phase, key)`（无 DOM/状态依赖，Node 可 require 单测），下表即其权威语义，`verify-game.cjs` 按表逐格断言。

| phase \ key | `空格` | `p`/`P` | `Escape` | `r`/`R` | `Enter` | `←` | `→` | `↓` | `↑`/`x`/`X` |
|---|---|---|---|---|---|---|---|---|---|
| **READY** | `start` | — | — | `restart` | `start` | — | — | — | — |
| **RUNNING** | `hardDrop`（不变） | `togglePause` | `togglePause` | `restart` | — | `moveLeft` | `moveRight` | `softDrop` | `rotate` |
| **PAUSED** | `togglePause`（**v2.1 新增**） | `togglePause` | `togglePause` | `restart` | — | — | — | — | — |
| **OVER** | `restart`（**D-01 甲新增**） | — | — | `restart` | `restart` | — | — | — | — |

- 未列出的按键组合 → `null`（无动作；READY/OVER 按 `P` 即此列，AC-11.6 无副作用）。
- 表内 `moveLeft/moveRight/softDrop` 仅表达"首击动作"，其按住重复（DAS 170/100ms、软降 50ms）由 `onKeyDown` 既有 held 逻辑负责，不进入纯函数。

### 2.2 存储与版本

- **无任何新增持久化**（PRD §3.2；音量/静音 localStorage 为 P2，本期不做）。
- **无新增运行时状态字段**：暂停/继续复用既有 `state.phase` + 既有 `gravityAcc/lockTimer`（恢复节拍机制见 §5.3）。
- **VERSION 常量**（`game.js`/`ui.js`/`audio.js` 头部 `'2.1.0'`）：已于 2026-08-16 随卫生项（OBS-11-3）统一升级；无任何测试断言依赖，零行为影响。

---

## 3. 接口契约（API 设计：路由/入参出参的等价物，要求 2）

> 无后端、无 HTTP 路由（PRD §3.2）。以下为模块间 UMD 契约（签名即"入参出参"），是并行开发的唯一协商基准。v2.1 **只新增导出与键盘层内部分发改造，不删改任何既有签名**。

### 3.1 `game.js` 增量（唯一代码变更面）

```js
// 新增导出（window.TetrisGame.keyAction / module.exports.keyAction）
/**
 * 键盘映射单一来源表（PRD §5.1 输入映射；v2.1 新增空格 PAUSED/OVER 语义，见 §2.1）
 * @param {string} phase  'READY'|'RUNNING'|'PAUSED'|'OVER'
 * @param {string} key    KeyboardEvent.key（onKeyDown 传入；非字符串/未知键 → null）
 * @returns {string|null} action ∈ start|restart|togglePause|moveLeft|moveRight|softDrop|rotate|hardDrop，或 null（无动作）
 */
function keyAction(phase, key) { ... }
```

- **语义要点**：
  - PAUSED + `' '` → `'togglePause'`（AC-11.2）；RUNNING + `' '` → `'hardDrop'`（不变）；OVER + `' '` → `'restart'`（D-01 甲）；READY + `' '` → `'start'`（不变）。
  - READY/OVER + `'p'/'P'` → `null`（AC-11.6 无副作用）；未知 phase / 非字符串 key → `null`（防御）。
- **`onKeyDown` 改造**（`game.js` L683~735，行为等价重构 + 两处新增）：
  1. 保留 L687 `preventDefault`（方向键 + 空格）与 L690 `e.repeat` 守卫（**不变**；preventDefault 同时保证 PAUSED 遮罩按钮聚焦时按空格不会二次激活按钮，AC-11.3 双保险）；
  2. `const action = keyAction(state.phase, k)`，按 action 分发：`start/restart/togglePause/rotate/hardDrop` 单发直调；`moveLeft/moveRight/softDrop` 走既有 held/DAS 分支（逻辑原样搬移，不改变任何按住语义）；
  3. 效果等价性：现分支的 `k === 'x' || k === 'X'` ≡ `lower === 'x'`、`k === 'p' || k === 'P'` ≡ `lower === 'p'`、`k === 'r' || k === 'R'` ≡ `lower === 'r'`——映射表已统一为 lower 匹配，行为不变。
- **不新增**：`onSfx` 事件、`togglePause` 签名、状态机方法——全部保持 v2.0。

### 3.2 零改动面（明确清单，防误改）

| 文件 | 保持原因 |
|---|---|
| `audio.js` | 音效参数/音量/静音契约不变（PRD §5.2）；暂停/继续无新事件 |
| `ui.js` | M 键/解锁/onSfx 接线/控件不变；新增按键不依赖 UI 层（键盘在 game.js window 级） |
| `index.html` | AC-11.7 零 DOM 改动（含 key-hints 图例、遮罩文案） |
| `style.css` | AC-11.7 零 CSS 改动 |

---

## 4. 前端组件与页面划分（要求 2）

单页应用、无路由。**v2.1 不新增/不修改任何组件、页面与 DOM**（AC-11.7）：

| 组件 | 处理 |
|---|---|
| 键盘输入层（非视觉） | `game.js` `onKeyDown` + 新增 `keyAction` —— **唯一变更面** |
| 暂停遮罩 / 信息面板 / 按钮 / 游戏板 | 全部不动（文案、样式、DOM 结构零变化） |
| 音效引擎 / 音量控件 | 不动 |

**文档同步（非视觉）**：`docs/design/DESIGN.md` §4.1 输入映射表（L216~217：空格行补「PAUSED=继续」、P/Esc 行补「PAUSED 空格」、L217 注记「暂停中仅 P/Esc/R 生效」改为「P/Esc/R/空格（空格=继续，v2.1）」）与 §2.3 交互矩阵（L96：PAUSED 键盘响应「仅 P/Esc/R」→「P/Esc/R/空格」）由任务 T-4 一并同步；README 已由 PM 同步，仅核对。

---

## 5. 状态管理（要求 2）

### 5.1 状态所有权（v2.1 不变，新增一项）

| 状态 | 归属 | 谁可写 |
|---|---|---|
| 游戏态/棋盘/分数/等级/行数/计时累加 | `game.js` 会话（既有） | 既有方法（不变） |
| **按键→动作映射**（v2.1 新增） | `keyAction` 纯函数（无状态） | 不可写（表驱动，改表即改行为） |
| 音量/静音/voice | `audio.js`（既有） | 既有 setter（不变） |

### 5.2 状态机零改动 + 空格语义分流

- `PHASE_TRANSITIONS` / `transition` / `togglePause` **零改动**：`RUNNING --pause--> PAUSED --resume--> RUNNING` 语义不变（AC-04.1/3 保持，AC-11.1 复用）。
- 「空格双语义」的实现落点**不在状态机而在键盘映射表**：同一 `' '` 按键由 `keyAction` 按 `state.phase` 分流（§2.1），PLAYING 空格=硬降（AC-11.2 后半句）、PAUSED 空格=继续（AC-11.2 前半句）——与 PRD §7.2「状态机分流」缓解一致，且互斥分支保证一次按键单一动作。

### 5.3 恢复节拍机制（AC-11.4）

- `togglePause()` 不清零 `state.gravityAcc` 与 `state.lockTimer`；`startLoop()` 在 resume 时以 `performance.now()` 重新取基准帧 → 暂停期间流逝时间**不累积**，恢复后首个自动下落间隔 = 暂停前剩余 + 恢复后流逝 = 等级表间隔（机制上偏差仅剩 rAF 帧量化 ≤ 16ms，远小于验收阈值 50ms）。
- 与 v2.0 既有「差值计时防漂移」同一机制（PRD §7.2），v2.1 只需单测钉死（§7.1）。

### 5.4 焦点与事件（AC-11.5）

- 键盘监听本就挂在 `window`（`attachKeyboard`，game.js L751~757）→ 焦点在游戏容器、信息面板按钮、遮罩按钮或页面空白处，`P`/`空格` 均生效（AC-11.5）。
- 遮罩按钮聚焦时按空格：`preventDefault`（L687）拦截按钮激活 → 仅 `togglePause` 一次，无二次触发（E2E 断言恢复后 phase=RUNNING 且不跳回 PAUSED）。

---

## 6. 关键实现要点与边界情况（要求 2）

### 6.1 AC-11 逐条落地要点

| AC | 实现位置/机制 |
|---|---|
| AC-11.1 P 双向 ≤300ms | 既有 `onKeyDown` RUNNING/PAUSED 分支 `p`/`P` → `togglePause`（不变，E2E 复验） |
| AC-11.2 PAUSED 空格继续 / PLAYING 空格硬降 | `keyAction('PAUSED',' ') = 'togglePause'`（新增）；`keyAction('RUNNING',' ') = 'hardDrop'`（不变）；恢复后状态与暂停前一致由 `togglePause` 既有语义保证 |
| AC-11.3 恢复瞬间不硬降 / 连续空格无错乱 | 分支互斥（一次 keydown 单一动作）+ `e.repeat` 守卫（按住不连发）+ `preventDefault` 防按钮激活；单测/E2E 断言恢复瞬间 `sfx` 序列与 `score` 无变化 |
| AC-11.4 恢复节拍不跳变 | `gravityAcc` 差值续算（§5.3）；`verify-game` 差值单测（§7.1）钉死 |
| AC-11.5 window 级任意焦点可用 | 既有 `window.addEventListener('keydown', onKeyDown)`（不改）；E2E 用 `el.focus()` 切换焦点断言 |
| AC-11.6 READY/OVER 按 P 无副作用；OVER 空格重开语义 | `keyAction`：READY/OVER + `p` → `null`；OVER + `' '` → `restart`（D-01 甲）；`start/restart` 非法态幂等拒绝兜底 |
| AC-11.7 零视觉改动 | 任务边界 = 不触碰 `index.html`/`style.css`；QA 截图对比（人工）+ 开发 diff 自查 |

### 6.2 决策记录 D-01：GAME_OVER 态 `空格` 语义（需产品经理在 QA 前确认）

- **分歧事实**：PRD v2.1 §4 交互流程与 README「回车/空格：GAME OVER 态重新开始」将空格列为既有重开键；但 v2.0 实际代码 OVER 分支仅响应 `r`/`Enter`，`空格` 被 `preventDefault` 后无动作（v2.0 QA-REPORT AC-05.2 亦记录「←/↑/↓/空格均无效果」）。AC-11.6 的「保持既有重新开始语义不变」建立在前者（文档口径）之上。
- **方案甲（推荐，本文档默认实现）**：OVER 分支新增 `空格 = restart`（`keyAction('OVER',' ') = 'restart'`）。理由：① 与 PRD §4 流程图、AC-11.6、README 三处文档口径一致，QA 按字面验收不落空；② 不违反任何 AC-01~10（AC-05.2 仅约束方向键，空格非方向键；重开为 AC-05.3 允许动作）；③ 属「修正既有文档承诺」而非破坏回归（v2.0 中空格在 OVER 无动作，无用户依赖的既有行为被移除）。
- **方案乙（保守备选）**：OVER 态空格保持无动作（`keyAction('OVER',' ') = null`）。需 PM 同步修订 PRD §4 流程图、AC-11.6 措辞与 README（移除空格重开表述），否则 QA 按字面验收会失败。
- **切换成本**：方案甲↔乙仅改 `keyAction` 一行 + E2E 一条断言（§7.2 已给出两种写法）；开发按方案甲落地，QA 前由 PM 确认。

### 6.3 边界情况清单（v2.1 新增 E-11-01 ~ 10；既有 E1~E15、E-SFX-01~13 不变）

| # | 边界情况 | 处理策略 |
|---|---|---|
| E-11-01 | PAUSED 态按空格恢复瞬间 | 分支互斥：该 keydown 只命中 PAUSED 分支 → 不触发 hardDrop、不加分、不发射音效（AC-11.3） |
| E-11-02 | PAUSED 态按住空格不放（repeat） | `e.repeat` 守卫（L690）→ 仅首击恢复一次；放开后再按（此时 RUNNING）= 硬降（AC-11.3） |
| E-11-03 | PAUSED 遮罩按钮持有焦点时按空格 | `preventDefault`（L687）拦截按钮激活 → 恰好恢复一次，无二次切换（E2E 断言 phase 不再跳回 PAUSED） |
| E-11-04 | READY 态按 `P` / OVER 态按 `P` | `keyAction` → `null`，状态/棋盘/分数不变、0 报错（AC-11.6） |
| E-11-05 | READY 态按空格开始后立即再按空格 | 第一次 keydown=start 进入 RUNNING；下一次 keydown 命中 RUNNING 分支=硬降（语义正确，非 bug） |
| E-11-06 | OVER 态按空格（方案甲） | 立即 restart：0 分/1 级/0 行/空棋盘/立即可玩（AC-05.3 语义复用）；连按多次幂等 |
| E-11-07 | 失焦自动暂停后按空格恢复 | blur→PAUSED（既有）；空格→恢复（v2.1），与手动暂停路径同一分支 |
| E-11-08 | 恢复节拍（AC-11.4） | `gravityAcc` 保留续算；单测：700ms 后暂停 → 暂停期 tick 无副作用 → 恢复后 250ms 不下落、再 50ms 恰好下落 |
| E-11-09 | `keyAction` 入参异常（未知 phase / 非字符串 key） | 返回 `null`（防御，0 报错）；onKeyDown 不受影响 |
| E-11-10 | 焦点在音量按钮 / 信息面板 / 页面空白按 P/空格 | window 级监听（不改）；E2E `focus()` 切换断言（AC-11.5） |

---

## 7. 测试策略（要求 2）

### 7.1 `scripts/verify-game.cjs` 增量（node:test，零依赖，新增 4 组用例）

| 用例 | 断言 |
|---|---|
| **keyAction 映射矩阵（§2.1 逐格）** | PAUSED+`' '`=`togglePause`（AC-11.2）；PAUSED+`'p'/'P'/'Escape'`=`togglePause`、+`'r'`=`restart`、+`'ArrowLeft'`=null（AC-04.2）；RUNNING+`' '`=`hardDrop`、+`'p'/'Escape'`=`togglePause`、+`'ArrowLeft'`=`moveLeft`；READY+`' '`/`'Enter'`=`start`、+`'p'`=null（AC-11.6）；OVER+`'r'`/`'Enter'`=`restart`、+`'p'`=null（AC-11.6）、+`' '`=`restart`（D-01 甲）；未知 phase/非字符串 → null |
| **恢复节拍差值续算（AC-11.4）** | `start()` → `tick(250)+tick(250)+tick(200)`（gravityAcc=700）→ `togglePause()` → `tick(5000)`（暂停期无副作用，y 不变）→ `togglePause()` → `tick(250)`（950<1000 不下落）→ `tick(50)`（满 1000 恰好下落 1 格，偏差 0） |
| **togglePause 不发射音效（AC-11.3 引擎层）** | `start()` → `togglePause()`×2 → `events.sfx` 仍为 `[]`（暂停/继续无音效，恢复瞬间无 hardDrop 音效） |
| **keyAction 与 onKeyDown 语义一致（行为等价回归）** | 既有 RUNNING 键位用例（方向键/旋转/硬降）继续全绿即等价证明（onSfx 序列用例不变） |

> 既有 44 项全部保持（含 onSfx 序列、暂停往返快照一致、状态机矩阵）。注意：`keyboard:false` 环境下 `keyAction` 直接可测，这是把映射提升为纯函数的核心收益。

### 7.2 `scripts/qa-e2e-jsdom.cjs` 增量与既有用例调整（精确位置）

**既有用例调整（2 处）**：

1. **L389「AC-04.2 暂停期硬降无效」**：删除空格断言（空格在 PAUSED 已变为继续）。AC-04 块流程改造：
   - L386~388（←/↑/↓ 无效）保留；L389 删除；
   - L390~392（tick(5000) 无副作用）保留；
   - L394 `key('Escape')` 恢复段改为：`key(' ')` 恢复（新断言：≤300ms 进 RUNNING + score/level/lines/board/piece 与 `before` 一致 + `spy.plays` 无新增【AC-11.2/3】）；随后 `key('p')` → PAUSED → `key('Escape')` → RUNNING（**AC-04.3 Esc 语义回归**保留）；
   - L401~421（遮罩隐藏、失焦自动暂停、往返快照一致）原样保留。
2. **L437~441「AC-05.2 结束态方向键/硬降无效」**：空格从冻结断言中拆出。改为：`key('ArrowLeft'); key('ArrowUp'); key('ArrowDown')` → 断言仍 OVER 且块冻结（保留）；随后 `key(' ')` → 断言 RUNNING 且 score=0/lines=0/level=1（**AC-11.6 + D-01 甲**；若 PM 选方案乙，此断言改为「仍 OVER 且块冻结」）。
   - 后续 L444~457（连续 5 轮重开循环，循环内自 `game.restart()` 起）与 L459~467（R 键重开）不受影响。

**新增 AC-11 断言块**（建议置于 AC-05 与 AC-09 段之间）：

| 断言 | 覆盖 |
|---|---|
| PAUSED 按 `空格` ≤300ms 恢复 PLAYING，恢复后快照与暂停前一致，且 `spy.plays` 无 `hardDrop` | AC-11.2/3 |
| 暂停态连续按 `空格` ≥3 次：第 1 次恢复（RUNNING），第 2/3 次为硬降（`spy.plays` 各增 `hardDrop`、`score` 增加、piece 落底）→ 无报错/无状态错乱 | AC-11.3 |
| 焦点无关：`$('#btn-mute').focus()` 后 `key('p')`→PAUSED、`key(' ')`→RUNNING；焦点归 `#board-frame` 与 `body` 后同样生效；PAUSED 遮罩按钮聚焦时 `key(' ')` 恰好恢复一次（phase 不跳回 PAUSED） | AC-11.5 |
| READY 态 `key('p')` → 仍 READY；OVER 态 `key('p')` → 仍 OVER（无副作用） | AC-11.6 |
| 恢复节拍 E2E（可选，主断言在 verify-game）：手动 tick 驱动差值续算断言 | AC-11.4 |
| 视觉零改动结构级佐证：overlay PAUSED 文案仍为「按 P / Esc 继续」、`#key-hints` 图例未新增条目、无新增 `id`/`class` 钩子 | AC-11.7（截图对比仍人工） |

### 7.3 `scripts/assembly-check.cjs` 增量

- §1 `needApi` 数组追加 `'keyAction'`（`TetrisGame.keyAction` 导出存在断言）。
- 其余审计（脚本顺序/选择器/CSS 钩子/自包含/音频文件）不变。

### 7.4 回归底线与人工补测

- **回归底线**：`verify-game.cjs`（44+新增）、`verify-audio.cjs`（19）、`verify-ui.cjs`（6）、`assembly-check.cjs`、`qa-e2e-jsdom.cjs`（139+新增）**全部全绿**；AC-01 ~ AC-10 语义不变（PRD §9）。
- **人工补测（真实浏览器，file://）**：
  1. AC-11.1/2：P/空格切换 ≤300ms（事件时间戳 + 遮罩出现采样）；
  2. AC-11.4：恢复后首个下落间隔 = 等级表（DevTools Performance 两帧间隔偏差 ≤50ms）；
  3. AC-11.7：与 v2.0 截图对比无差异（暂停遮罩、面板、按钮外观）；
  4. 回归抽查：硬降音效（PLAYING 空格）、暂停遮罩文案、失焦自动暂停。
- **自动化无法证明视觉一致**：AC-11.7 以「开发任务边界 = 不触碰 index.html/style.css」+ QA 截图对比为准。

---

## 8. 任务拆分清单（要求 3，与流水线派发任务对齐）

> **派发对齐说明**：本迭代收到唯一派发任务「**加入暂停/继续快捷键**」——"在现有 game.js 中增加空格/P 暂停与继续切换，接入已有 audio 反馈；跑通 scripts/verify-game.cjs 验证脚本"。以下拆分**只细化该任务**（文件边界 / 接口契约 §3 / 验收标准），**不另起任务体系**；P-1（实现）+ P-2（回归验收）合并即 PRD §8 里程碑 M1/M2。

### 批次 1（对应 M1 实现 + 单测，可并行）

## 任务：P-1 加入暂停/继续快捷键（派发任务细化，含 3 个子任务）

**P-1.1 game.js 键盘映射扩展**（核心代码变更）

- **涉及文件**：`products/tetris/game.js`（新增导出 `keyAction`；`onKeyDown` 改为基于 `keyAction` 分发；PAUSED 分支空格 = 继续；OVER 分支空格 = 重开【D-01 甲】；`VERSION` 可选升 `'2.1.0'`）
- **接口契约**：§3.1（`keyAction(phase, key) → action|null`，§2.1 映射表逐格实现）；§6.3 E-11-01~10 全部覆盖
- **实现要点**：`preventDefault`/`e.repeat`/DAS-held 语义原样保留；不触碰状态机/音效出口/UI；`node --check game.js` 通过
- **验收标准**：`verify-game.cjs` §7.1 新增 4 组用例绿；既有 44 项全绿；`node --check` 通过
- **并行关系**：独立（不依赖其他子任务）

**P-1.2 单测增量（verify-game.cjs）**

- **涉及文件**：`products/tetris/scripts/verify-game.cjs`（§7.1：keyAction 矩阵 / 恢复节拍差值续算 / togglePause 无音效）
- **接口契约**：§3.1 keyAction 签名；§2.1 映射表
- **验收标准**：新增用例全绿；总用例数 = 44 + 新增；`node scripts/verify-game.cjs` 退出码 0
- **并行关系**：依赖 P-1.1 的 `keyAction` 导出存在（契约先行，可与 P-1.1 并行写用例骨架）

**P-1.3 E2E 增量与既有用例调整**

- **涉及文件**：`products/tetris/scripts/qa-e2e-jsdom.cjs`（§7.2：L389 调整、L437~441 拆分、新增 AC-11 断言块）
- **接口契约**：行为契约 = PRD AC-11.1~7；§6.2 D-01（方案甲断言；若 PM 改选乙，仅切 1 条断言）
- **验收标准**：139 项既有（含调整后的 AC-04/AC-05 断言）+ AC-11 新增全部绿；`node scripts/qa-e2e-jsdom.cjs` 退出码 0
- **并行关系**：依赖 P-1.1 行为落地（键盘分发改造）；断言骨架可与 P-1.2 并行编写

### 批次 2（对应 M2 回归与验收）

## 任务：P-2 装配审计、文档同步与回归验收

**P-2.1 装配审计 + DESIGN 文档同步**

- **涉及文件**：`products/tetris/scripts/assembly-check.cjs`（§7.3：`needApi` 追加 `keyAction`）、`products/tetris/docs/design/DESIGN.md`（§4.1 输入映射表 + §2.3 PAUSED 键盘响应行，见 §4）
- **实现要点**：文档同步为纯文本修改（非视觉）；README 已由 PM 同步，仅核对「空格暂停态=继续 / GAME OVER 空格重开」口径一致
- **验收标准**：`assembly-check.cjs` ALL PASSED；DESIGN.md 两处表格与 §2.1 映射表一致
- **并行关系**：与 P-1 子任务并行（只依赖契约，不依赖代码）

**P-2.2 回归与验收（对应 M2）**

- **涉及文件**：全量验证四套脚本 + E2E；`docs/qa/QA-REPORT.md`（由 QA 阶段落盘 v2.1 结论）；`AGENTS.md` §1/§5/§6（产品经理验收后同步）
- **实现要点**：AC-01 ~ AC-10 全量回归（回归底线）+ AC-11 全组；§1.3 指标抽查（含恢复节拍 ≤50ms）；UI 视觉零改动确认（截图对比）
- **验收标准**：全部验收项 100% 通过，无 P0/P1 遗留；D-01 已由 PM 在 QA 前确认
- **并行关系**：依赖 P-1 全部完成

---

## 9. 里程碑映射（对应 PRD §8）

| 里程碑 | 周期 | 对应任务 | 出口标准 |
|---|---|---|---|
| M1 快捷键实现（v2.1） | D1 | P-1（P-1.1 + P-1.2 + P-1.3） | AC-11 全部通过（keyAction 矩阵 + 恢复节拍单测 + E2E 全绿）；AC-04 暂停/恢复回归全绿 |
| M2 回归与验收（v2.1） | D1 | P-2（P-2.1 + P-2.2） | AC-01~10 全量回归绿 + AC-11 端到端绿 + §1.3 抽查（含恢复节拍）；零视觉改动截图确认；QA 报告落盘 |

---

## 10. 风险与注意（v2.1 增量，承接 v2.0 §10 与 PRD §7.2）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 空格键语义冲突（PLAYING 硬降 vs PAUSED 继续） | 硬降玩法回归（AC-02/03/09） | `keyAction` 单一来源表按 phase 分流 + 分支互斥；verify-game 矩阵断言 + E2E AC-11.2/3 钉死；RUNNING 空格分支零改动 |
| 快捷键与既有 P/Esc 分支冲突 | 暂停/恢复回归（AC-04） | 复用既有 `onKeyDown` 单一入口，仅扩展 PAUSED 分支；E2E AC-04 块调整后全绿（Esc 语义单独回归） |
| 暂停恢复节拍漂移 | AC-11.4 不满足 | `gravityAcc` 差值续算（机制不变，togglePause 不清计时）+ 单测钉死（700→暂停→250 不下落→50 下落）+ 人工 Performance 采样 |
| **D-01 GAME_OVER 空格语义分歧** | QA 按 AC-11.6 字面验收落空 / 或误判为回归 | §6.2 决策记录显式标注，开发按方案甲落地，**QA 前请 PM 确认**（改乙仅 1 行 + 1 断言） |
| 文档口径不一致（PRD §4/README 空格重开 vs v2.0 代码无动作） | 验收基准漂移 | 本文档 §6.2 收敛为单一决策 D-01；方案甲落地后 PRD §4/README/代码三方一致 |
| `keyAction` 重构引入键盘回归 | 方向键/DAS/软降失效 | 行为等价重构（preventDefault/repeat/held 语义原样保留）+ 既有 139 项 E2E（AC-02/04/05 全覆盖）作为回归网 |
| 误改 UI 文件破坏零视觉约束 | AC-11.7 不满足 | 任务边界显式禁止触碰 `index.html`/`style.css`/`ui.js`；QA 截图对比 + diff 自查 |
