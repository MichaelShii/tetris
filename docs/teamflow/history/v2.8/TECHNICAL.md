# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）

- 版本：v2.8（v2.7 → v2.8 增量：**无踢墙旋转系统**——固定旋转逻辑为"单点旋转，无踢墙"，旋转碰撞时 x/y/rot 均不变，不尝试任何踢墙偏移，返回 `reason: 'wall-kick-denied'` 区分语义；变更面仅 `game.js` rotate 函数 reason 优化 + `verify-game.cjs` 旋转边界用例；不改状态机/计分/数值/音效/UI 渲染/幽灵块/BGM/7-bag）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`docs/teamflow/prd/PRD.md`（v2.8，**验收唯一依据**，AC-01~18）、`AGENTS.md`（§4 工程约定）、`scripts/*`（可执行契约）
- 定位：将 PRD v2.8 增量（AC-18 无踢墙旋转系统）落实为**与流水线派发任务对齐**的接口契约、实现要点、测试策略与任务拆分。v2.7 已交付的 7-bag 随机算法 **沿用不变**（AC-01 ~ AC-17 为本版回归底线）。
- 交付物：`game.js`（rotate 函数 reason 优化）+ `scripts/verify-game.cjs`（旋转边界用例）+ 文档同步（TECHNICAL/memory）。**`audio.js` / `ui.js` / `index.html` / `style.css` / `persist.js` 零改动**。

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0 | 2026-08-16 | 初版技术方案（TS+Vite 规划 + 任务拆分 T0~T13）；交付后补注实际偏差：按流水线合并任务以扁平纯 JS 交付，`node:test` 脚本替代 Vitest，TS+Vite 保留为可选工程化路径 |
| v2.0 | 2026-08-16 | 音效系统（AC-09）+ 音量/静音控制（AC-10）+ `onSfx` 事件出口 + 测试/装配审计增量；既有玩法/计分/数值/键盘不动 |
| v2.1 | 2026-08-16 | 暂停/继续快捷键（AC-11）：`keyAction` 键盘映射单一来源表 + 空格 PAUSED 继续 / OVER 重开【D-01 甲】；状态机/数值/UI DOM/CSS/audio.js 零改动 |
| v2.2 | 2026-08-16 | 幽灵块（落点预览，AC-12）：引擎新增纯函数 `ghostY` + UI 半透明轮廓渲染 + 单测/E2E/装配审计增量；数值/状态机/keyAction/音效零改动 |
| v2.2-tc | 2026-08-16 | 工程自检脚本 `verify-constants.cjs`，断言三模块 VERSION 均 === `'2.2.0'` |
| v2.3 | 2026-08-18 | 幽灵块辅助开关（AC-13）+ 修正硬降计分（AC-14） |
| v2.6-tc-1 | 2026-08 | 新增应用层持久化 `persist.js` 统一落 localStorage |
| v2.7 | 2026-08-18 | 7-bag 随机算法（AC-17）：`createQueue` 均匀随机替换为 7-bag 实现——每袋 7 块 Fisher-Yates 洗牌、依次发完再创建新袋；保留 `rng` 可注入接口；不改状态机/计分/数值/音效/UI 渲染/持久化 |
| **v2.8** | **2026-08-18** | **无踢墙旋转系统（AC-18）**：旋转碰撞时 x/y/rot 均不变，不尝试任何踢墙偏移；返回 `reason: 'wall-kick-denied'` 区分语义；变更面仅 `game.js` rotate 函数 reason 优化 + `verify-game.cjs` 旋转边界用例 |

> **实际交付形态（沿用）**：`index.html + 本地 css/js`，脚本顺序 `persist.js → audio.js → game.js → ui.js → 内联装配`；UMD 契约 `window.TetrisGame / window.TetrisAudio / window.TetrisUI`。v2.7 快照（TECHNICAL）已归档至 `docs/teamflow/history/v2.7/`。

---

## 1. 总体架构与数据流（v2.8 增量视角）

```
engine：createGame 会话（唯一可变状态；状态机/计分/键盘/音效出口全部不变）
  │ rotate() → { ok, reason }
  │   ↓ 碰撞检测：collides(board, rotated(piece, 1))
  │   ↓ 碰撞时：返回 { ok: false, reason: 'wall-kick-denied' }，x/y/rot 均不变
  │   ↓ 不碰撞时：更新 piece = next，sfx('rotate')
  ▼
ui.js renderAll(s)（零改动）
  ├─ boardRenderer.render(s)（零改动）
  ├─ nextWell.render / hud.update / overlay / 反馈（全部不变）
  └─ persist.js（零改动，最高分/四设置持久化旁观）
```

- **无踢墙旋转是 rotate 函数的 reason 语义优化**：调用方（UI/键盘处理）无需改动，`rotate()` 函数签名与返回值结构（`{ ok, reason }`）完全不变。
- **变更面极小**：仅 `game.js` 的 rotate 函数 reason 字段从 `'blocked'` 改为 `'wall-kick-denied'`，不新增导出、不改状态机、不改渲染层。
- **语义区分**：`'wall-kick-denied'` 明确表示旋转碰撞时拒绝踢墙，区别于移动碰撞的 `'blocked'`，便于未来扩展或调试。

---

## 2. 数据模型与存储

### 2.1 旋转碰撞返回值契约（v2.8 新增数据契约）

> 固定旋转逻辑为"单点旋转，无踢墙"：旋转碰撞时方块保持原位（x/y/rot 均不变），不尝试任何踢墙偏移。

```js
/**
 * 旋转函数返回值契约（PRD AC-18：无踢墙旋转系统）。
 * 碰撞时返回 { ok: false, reason: 'wall-kick-denied' }，x/y/rot 均不变。
 * 成功时返回 { ok: true }，更新 state.piece = next。
 */
function rotate() {
  if (disposed) return { ok: false, reason: 'illegal-phase' }
  if (state.phase !== 'RUNNING' || !state.piece) return { ok: false, reason: 'illegal-phase' }
  const next = rotated(state.piece, 1)
  if (collides(state.board, next)) return { ok: false, reason: 'wall-kick-denied' } // AC-18: 无踢墙，保持原位
  state.piece = next
  if (!isGrounded(state.board, state.piece)) state.lockTimer = 0
  emit()
  sfx('rotate') // 仅旋转成功
  return { ok: true }
}
```

**关键设计决策**：
1. **reason 语义区分**：`'wall-kick-denied'` 明确表示旋转碰撞时拒绝踢墙，区别于移动碰撞的 `'blocked'`。
2. **零踢墙逻辑**：碰撞时直接返回，不尝试任何偏移（左移/右移/上移等）。
3. **状态不变性**：碰撞时 `state.piece` 不更新，x/y/rot 均保持原值。

### 2.2 既有数据模型（v2.7 沿用）

| 模型 | 状态 | 说明 |
|---|---|---|
| 7-bag 随机队列 | ✅ 沿用 | `createQueue(rng)` → `{ peek(), next() }`，内部 bag/idx 闭包 |
| 棋盘（board） | ✅ 沿用 | `ROWS × COLS` 二维数组，`null` 或颜色字符串 |
| 当前方块（piece） | ✅ 沿用 | `{ type, rot, x, y }`，碰撞检测与旋转计算基础 |
| 碰撞检测（collides） | ✅ 沿用 | 纯函数，越界或重叠 → `true`，复用于旋转/移动/幽灵块 |

---

## 3. API 设计（rotate 函数接口）

### 3.1 核心接口（UMD 导出）

```js
// game.js UMD 导出（沿用）
window.TetrisGame = {
  createGame: function(options) {
    // options: { rng, autoLoop, keyboard, autoPauseOnBlur, onSnapshot, onPhaseChange, onLevelUp, onGameOver, onSfx }
    // 返回会话对象
    return {
      start, restart, tick, dispose,
      move, rotate, softDrop, hardDrop, // 操作方法
      getSnapshot, getGhostY, // 查询方法
      // ... 其他导出
    }
  }
}
```

### 3.2 rotate 方法契约

```js
/**
 * 旋转当前方块（顺时针 90°）。
 * @returns {{ ok: boolean, reason?: string }}
 *   - ok: true → 旋转成功，state.piece 已更新
 *   - ok: false, reason: 'illegal-phase' → 非 RUNNING 阶段或已 dispose
 *   - ok: false, reason: 'wall-kick-denied' → 旋转碰撞，x/y/rot 均不变（AC-18）
 *   - ok: false, reason: 'blocked' → 移动碰撞（其他操作使用，rotate 不返回此值）
 */
rotate()
```

**调用方兼容性**：
- 现有调用方（ui.js 键盘处理、qa-e2e-jsdom.cjs）无需改动。
- 返回值结构 `{ ok, reason }` 保持不变，仅 reason 值语义优化。
- UI 层可根据 reason 区分碰撞类型（未来扩展）。

---

## 4. 关键实现要点与边界情况

### 4.1 实现要点（仅 game.js rotate 函数）

| 步骤 | 实现 | 说明 |
|---|---|---|
| 1. 阶段校验 | `if (disposed) return { ok: false, reason: 'illegal-phase' }` | 沿用，无改动 |
| 2. 状态校验 | `if (state.phase !== 'RUNNING' \|\| !state.piece) return { ok: false, reason: 'illegal-phase' }` | 沿用，无改动 |
| 3. 计算旋转后方块 | `const next = rotated(state.piece, 1)` | 沿用，无改动 |
| 4. 碰撞检测 | `if (collides(state.board, next)) return { ok: false, reason: 'wall-kick-denied' }` | **变更点**：reason 从 `'blocked'` 改为 `'wall-kick-denied'` |
| 5. 更新状态 | `state.piece = next` | 沿用，无改动 |
| 6. 触底重置 | `if (!isGrounded(state.board, state.piece)) state.lockTimer = 0` | 沿用，无改动 |
| 7. 触发事件 | `emit()` | 沿用，无改动 |
| 8. 音效反馈 | `sfx('rotate')` | 沿用，无改动 |

### 4.2 边界情况与防御

| 边界情况 | 预期行为 | 测试覆盖 |
|---|---|---|
| 左墙旋转碰撞 | x 不变（不右移让位） | AC-18.3 |
| 右墙旋转碰撞 | x 不变（不左移让位） | AC-18.4 |
| 已固定方块旋转碰撞 | x/y 均不变（不尝试任何偏移） | AC-18.5 |
| 旋转后与已固定方块重叠 | 返回 `{ ok: false, reason: 'wall-kick-denied' }` | AC-18.1 |
| 正常位置旋转 | 返回 `{ ok: true }`，x/y/rot 更新 | AC-02 |
| 非 RUNNING 阶段旋转 | 返回 `{ ok: false, reason: 'illegal-phase' }` | AC-02 |

### 4.3 零副作用保证

- **不改状态机**：phase 转换逻辑不变。
- **不改计分/数值**：旋转不涉及计分，数值常量不变。
- **不改音效**：`sfx('rotate')` 调用条件不变（仅成功时触发）。
- **不改 UI 渲染**：`renderAll(s)` 依赖 `getSnapshot()`，旋转成功后自动更新。
- **不改幽灵块**：`getGhostY()` 复用 `collides`，旋转后自动重新计算。
- **不改 BGM/7-bag**：无关模块。

---

## 5. 测试策略

### 5.1 自动化测试（verify-game.cjs 新增用例）

| 测试用例 | 验证点 | 对应 AC |
|---|---|---|
| `rotate: 左墙碰撞保持原位` | 方块紧贴左墙（x=0）旋转，x 不变，返回 `{ ok: false, reason: 'wall-kick-denied' }` | AC-18.3 |
| `rotate: 右墙碰撞保持原位` | 方块紧贴右墙（x=9）旋转，x 不变，返回 `{ ok: false, reason: 'wall-kick-denied' }` | AC-18.4 |
| `rotate: 已固定方块碰撞保持原位` | 方块下方/侧方有已固定方块，旋转后与之碰撞，x/y 均不变 | AC-18.5 |
| `rotate: 碰撞时 x/y/rot 均不变` | 碰撞前后 piece 快照完全一致 | AC-18.1 |
| `rotate: 碰撞返回 wall-kick-denied` | 碰撞时 reason 为 `'wall-kick-denied'`（非 `'blocked'`） | AC-18.2 |

### 5.2 回归测试（既有用例）

| 测试模块 | 用例数 | 说明 |
|---|---|---|
| verify-game.cjs | 55→57（+2） | 新增 2 个旋转边界用例（左墙/右墙碰撞）+ 1 个已固定方块碰撞用例 |
| verify-audio.cjs | 23 | 不变 |
| verify-ui.cjs | 7 | 不变 |
| verify-constants.cjs | 2 | 不变 |
| assembly-check | ALL | 不变 |
| qa-e2e-jsdom.cjs | 188 | 不变 |

### 5.3 验证命令（产品根下执行）

```bash
node scripts/verify-game.cjs      # 引擎，含旋转边界用例
node scripts/verify-audio.cjs     # 音效引擎
node scripts/verify-ui.cjs        # UI 契约
node scripts/verify-constants.cjs # VERSION 三模块一致
node scripts/assembly-check.cjs   # 装配 + 自包含审计
node scripts/qa-e2e-jsdom.cjs     # DOM E2E + file:// 管线
```

---

## 6. 任务拆分（与流水线派发对齐）

### T1: game.js rotate 函数 reason 优化（AC-18.2）

**文件边界**：`game.js`（第 605 行）
**变更内容**：`return { ok: false, reason: 'blocked' }` → `return { ok: false, reason: 'wall-kick-denied' }`
**验收标准**：
- 旋转碰撞返回 `{ ok: false, reason: 'wall-kick-denied' }`
- 碰撞时 x/y/rot 均不变
- 既有测试用例全绿（verify-game 55/55）
**依赖**：无

### T2: verify-game.cjs 旋转边界用例（AC-18.1/18.3/18.4/18.5）

**文件边界**：`scripts/verify-game.cjs`
**变更内容**：
1. 新增 `rotate: 左墙碰撞保持原位` 用例
2. 新增 `rotate: 右墙碰撞保持原位` 用例
3. 新增 `rotate: 已固定方块碰撞保持原位` 用例
4. 更新既有 `rotate: 旋转越界拒绝且原位` 用例的 reason 断言（从 `'blocked'` 改为 `'wall-kick-denied'`）
**验收标准**：
- 新增 3 个旋转边界用例全绿
- 既有用例全绿（verify-game 57/57）
- 六套验证全绿
**依赖**：T1（需先完成 reason 优化）

### T3: 文档同步（TECHNICAL/memory）

**文件边界**：`docs/teamflow/technical/TECHNICAL.md`、`docs/teamflow/memory.md`
**变更内容**：
1. TECHNICAL.md 更新为 v2.8 版本（本文档）
2. memory.md 新增 v2.8 迭代历史行 + 当前迭代记忆节
**验收标准**：
- TECHNICAL.md 版本号为 v2.8
- memory.md 包含 v2.8 迭代记录
**依赖**：T1、T2（需先完成代码变更）

### 并行任务清单

| 任务 | 可并行任务 | 说明 |
|---|---|---|
| T1 | T2 | 代码变更可并行（但 T2 依赖 T1 的 reason 值） |
| T2 | T3 | 文档同步可并行 |
| T1 | T3 | 文档同步可并行 |

**推荐执行顺序**：T1 → T2 → T3（顺序执行，确保测试通过后再同步文档）

---

## 7. 验收标准与回归底线

### 7.1 AC-18 专项验收

| AC | 验收点 | 自动化覆盖 |
|---|---|---|
| AC-18.1 | 旋转碰撞保持原位 | verify-game 用例 |
| AC-18.2 | 返回值语义区分 | verify-game 用例 |
| AC-18.3 | 左墙旋转碰撞 | verify-game 用例 |
| AC-18.4 | 右墙旋转碰撞 | verify-game 用例 |
| AC-18.5 | 已固定方块旋转碰撞 | verify-game 用例 |
| AC-18.6 | 零副作用 | 代码审计 + 回归全绿 |
| AC-18.7 | 回归底线 | 七套验证全绿 |

### 7.2 回归底线

- AC-01 ~ AC-17 可自动化项 100% 全绿
- 七套验证全绿（verify-game / verify-audio / verify-ui / verify-constants / assembly-check / verify-persist / qa-e2e-jsdom）
- 无 P0/P1/P2 缺陷

---

<!-- blueprint -->{"summary":"v2.8 无踢墙旋转系统：仅修改 game.js rotate 函数 reason 字段 + verify-game.cjs 补旋转边界用例，变更面极小，零副作用","modules":{"/game.js":{"responsibility":"rotate 函数 reason 优化：碰撞返回 'wall-kick-denied'","dependsOn":[],"assemblyOrder":1,"why":"核心引擎变更，唯一需要修改的代码文件，保持 rotate() 接口签名不变"},"/scripts/verify-game.cjs":{"responsibility":"旋转边界测试用例：左墙/右墙/已固定方块碰撞场景","dependsOn":["/game.js"],"assemblyOrder":2,"why":"验证旋转碰撞行为，确保无踢墙逻辑正确实现"},"/docs/teamflow/technical/TECHNICAL.md":{"responsibility":"技术方案文档：v2.8 版本，记录接口契约与任务拆分","dependsOn":[],"assemblyOrder":3,"why":"文档同步，供团队参考与验收核验"},"/docs/teamflow/memory.md":{"responsibility":"产品记忆：v2.8 迭代历史与当前迭代记忆","dependsOn":[],"assemblyOrder":3,"why":"文档同步，记录迭代成果与待办"}},"duplications":["无重复模块：变更面仅 game.js rotate 函数 + verify-game.cjs 测试用例，无适配器漂移风险"],"tasks":[{"title":"T1: game.js rotate 函数 reason 优化","files":["/game.js"],"spec":"将 rotate 函数碰撞时的 reason 从 'blocked' 改为 'wall-kick-denied'，确保 x/y/rot 均不变"},{"title":"T2: verify-game.cjs 旋转边界用例","files":["/scripts/verify-game.cjs"],"spec":"新增左墙/右墙/已固定方块碰撞测试用例，更新既有用例 reason 断言"},{"title":"T3: 文档同步","files":["/docs/teamflow/technical/TECHNICAL.md","/docs/teamflow/memory.md"],"spec":"更新 TECHNICAL.md 为 v2.8 版本，memory.md 新增迭代记录"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"v2.8 技术方案已交付：变更面极小——仅 game.js rotate 函数 reason 从 'blocked' 改为 'wall-kick-denied'（AC-18.2），verify-game.cjs 补 3 个旋转边界用例（左墙/右墙/已固定方块碰撞，AC-18.1/18.3/18.4/18.5）。rotate() 接口签名与返回值结构不变，调用方无需改动。零副作用：不改状态机/计分/数值/音效/UI 渲染/幽灵块/BGM/7-bag。回归底线 AC-01~17 全绿，七套验证全绿。","version":"v2.8","memory":["v2.8 技术方案已交付：AC-18 无踢墙旋转系统","变更面：game.js rotate reason 'wall-kick-denied' + verify-game 旋转边界用例","接口保持：rotate() → { ok, reason }，调用方无需改动","回归底线：AC-01~17 全绿，七套验证全绿","零副作用：不改状态机/计分/数值/音效/UI 渲染/幽灵块/BGM/7-bag","任务拆分：T1(game.js) → T2(verify-game) → T3(文档同步)"]}<!-- /state -->