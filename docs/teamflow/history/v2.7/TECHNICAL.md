# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）

- 版本：v2.7（v2.6 → v2.7 增量：**7-bag 随机算法**——替换均匀随机队列为标准 Tetris 7-bag 算法，每袋 7 块 Fisher-Yates 洗牌，确保每 7 块中每种方块恰好出现一次；变更面仅 `game.js` `createQueue` 函数替换 + `verify-game.cjs` 补算法契约用例；不改状态机/计分/数值/音效/UI 渲染）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`docs/teamflow/prd/PRD.md`（v2.7，**验收唯一依据**，AC-01~17）、`AGENTS.md`（§4 工程约定）、`scripts/*`（可执行契约）
- 定位：将 PRD v2.7 增量（AC-17 7-bag 随机算法）落实为**与流水线派发任务对齐**的接口契约、实现要点、测试策略与任务拆分。v2.6 已交付的持久化层/AC-16/AC-10.5 **沿用不变**（AC-01 ~ AC-16 为本版回归底线）。
- 交付物：`game.js`（`createQueue` 函数替换为 7-bag 实现）+ `scripts/verify-game.cjs`（7-bag 算法契约用例）+ 文档同步（TECHNICAL/memory）。**`audio.js` / `ui.js` / `index.html` / `style.css` / `persist.js` 零改动**。

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
| **v2.7** | **2026-08-18** | **7-bag 随机算法（AC-17）**：`createQueue` 均匀随机替换为 7-bag 实现——每袋 7 块 Fisher-Yates 洗牌、依次发完再创建新袋；保留 `rng` 可注入接口；不改状态机/计分/数值/音效/UI 渲染/持久化 |

> **实际交付形态（沿用）**：`index.html + 本地 css/js`，脚本顺序 `persist.js → audio.js → game.js → ui.js → 内联装配`；UMD 契约 `window.TetrisGame / window.TetrisAudio / window.TetrisUI`。v2.3 快照（TECHNICAL）已归档至 `docs/teamflow/history/v2.3/`。

---

## 1. 总体架构与数据流（v2.7 增量视角）

```
engine：createGame 会话（唯一可变状态；状态机/计分/键盘/音效出口全部不变）
  │ createQueue(rng) → { peek(), next() }
  │   ↓ 内部：bag（数组）→ 空时 Fisher-Yates 洗牌创建新袋 → 依次发块
  │   ↓ 替换：均匀随机 pick() → 7-bag 袋式发块
  ▼
ui.js renderAll(s)（零改动）
  ├─ boardRenderer.render(s)（零改动）
  ├─ nextWell.render / hud.update / overlay / 反馈（全部不变）
  └─ persist.js（零改动，最高分/四设置持久化旁观）
```

- **7-bag 算法是 createQueue 的内部实现替换**：调用方（`start`/`restart`）无需改动，`createQueue(rng)` 函数签名与返回值结构（`peek()`/`next()`）完全不变。
- **变更面极小**：仅 `game.js` 的 `createQueue` 函数内部实现替换，不新增导出、不改状态机、不改渲染层。
- **rng 可注入**：保留 `rng` 参数（默认 `Math.random`），便于确定性测试验证 7-bag 算法正确性。

---

## 2. 数据模型与存储

### 2.1 7-bag 随机算法（v2.7 新增数据契约）

> 标准 Tetris 7-bag 算法：将 7 种方块（I/O/T/S/Z/J/L）放入"袋子"，用 Fisher-Yates 洗牌随机排列后依次提供给玩家；袋子发完后再创建新袋。确保每 7 块中每种方块恰好出现一次。

```js
/**
 * 7-bag 随机队列（PRD AC-17：标准 Tetris 7-bag 算法）。rng 可注入（默认 Math.random）便于确定性测试。
 * next() 返回当前并补新值；peek() 不消耗。
 * 内部维护当前袋（数组），袋空时创建新袋（Fisher-Yates 洗牌）。
 */
function createQueue(rng) {
  const rand = typeof rng === 'function' ? rng : Math.random
  let bag = []
  let idx = 0

  // Fisher-Yates 洗牌（原地，确定性 rng 可注入）
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = arr[i]
      arr[i] = arr[j]
      arr[j] = tmp
    }
    return arr
  }

  // 创建新袋：TYPES 的洗牌副本
  function newBag() {
    return shuffle(TYPES.slice())
  }

  // 预填充第一个袋
  bag = newBag()

  return {
    peek: function () {
      // 袋空时预填充（延迟创建，确保 peek 不消耗）
      if (idx >= bag.length) {
        bag = newBag()
        idx = 0
      }
      return bag[idx]
    },
    next: function () {
      // 袋空时创建新袋
      if (idx >= bag.length) {
        bag = newBag()
        idx = 0
      }
      const v = bag[idx]
      idx++
      return v
    },
  }
}
```

- **接口兼容**：`createQueue(rng)` 函数签名不变，返回 `{ peek(), next() }` 结构不变；`rng` 可注入（默认 `Math.random`）便于确定性测试。
- **Fisher-Yates 洗牌**：标准算法，原地洗牌，时间复杂度 O(n)，n=7（TYPES.length）。
- **袋生命周期**：`newBag()` 创建新袋（TYPES 的洗牌副本），`idx` 追踪当前袋内位置；袋空时（`idx >= bag.length`）自动创建新袋。
- **peek 延迟创建**：`peek()` 在袋空时也会预填充新袋，确保 peek 不消耗且始终返回有效值。
- **不新增状态字段**：7-bag 算法为 `createQueue` 内部实现，不新增引擎状态、快照字段、键盘映射、音效事件。

### 2.2 存储与版本

- **无任何新增持久化**（7-bag 算法不涉及持久化）；`persist.js` 沿用不变（AC-16/AC-10.5 持久化旁观）。
- **VERSION 常量**：`game.js`/`ui.js`/`audio.js` 头部保持 `'2.3.0'`（7-bag 算法为内部实现替换，不新增玩家可见功能，verify-constants 基线维持）。

---

## 3. 接口契约（API 设计：路由/入参出参的等价物）

> 无后端、无 HTTP 路由（PRD §3.2）。以下为模块间 UMD 契约（签名即"入参出参"），是并行开发的唯一协商基准。v2.7 **只替换 `createQueue` 内部实现，不删改任何既有签名**。

### 3.1 `game.js` 增量（7-bag 随机算法）

```js
// 替换 createQueue 函数内部实现（7-bag 替换均匀随机）
function createQueue(rng) {
  const rand = typeof rng === 'function' ? rng : Math.random
  let bag = []
  let idx = 0

  function shuffle(arr) { /* Fisher-Yates */ }
  function newBag() { return shuffle(TYPES.slice()) }

  bag = newBag()

  return {
    peek: function () { /* 延迟创建新袋 */ },
    next: function () { /* 袋空时创建新袋 */ },
  }
}
```

- **语义要点**：7-bag 算法确保每 7 块包含全部 7 种方块各恰好 1 次；Fisher-Yates 洗牌保证袋内随机排列；不同局/不同袋顺序可不同（由 `rng` 注入决定）。
- **零改动**：`collides`/`isGrounded`/`pieceCells`/`keyAction`/`hardDrop`/`createGame` 签名与实现**一律不动**；`ghostY` 纯函数**不动**；`TYPES` 常量**不动**。

### 3.2 `ui.js` / `audio.js` / `index.html` / `style.css` / `persist.js` 零改动

| 文件/模块 | 保持原因 |
|---|---|
| `ui.js` | 7-bag 算法为引擎层内部实现替换，渲染层不感知方块来源 |
| `audio.js` | 音效参数/音量/静音/BGM 契约不变（PRD §5.2） |
| `index.html` | 无新增 DOM 元素（7-bag 仅影响方块出现顺序） |
| `style.css` | 无新增/修改 CSS 规则 |
| `persist.js` | 持久化层旁观（最高分/四设置与方块出现顺序无关） |

---

## 4. 前端组件与页面划分

单页应用、无路由。**v2.7 不新增/不修改任何组件、页面与 DOM 结构**（AC-17 仅替换 `createQueue` 内部实现）：

| 组件 | 处理 |
|---|---|
| 游戏板 Canvas（`#board` + `createBoardRenderer`） | 不动（方块渲染与来源无关） |
| 引擎 `game.js` | **替换 `createQueue` 内部实现**（§3.1）；零改动其余 |
| 信息面板 / 下一个预览 / 遮罩 / 反馈 / 音量控件 / key-hints | 全部不动 |
| 音效引擎 `audio.js` | 不动 |
| 持久化层 `persist.js` | 不动 |

**文档同步**：`README.md` 无需改动（7-bag 算法为内部实现，玩家感知仅为"方块出现更公平"，无需显式说明）；`memory.md` 更新 v2.7 迭代记录。

---

## 5. 状态管理

### 5.1 状态所有权（v2.7 不变）

| 状态 | 归属 | 谁可写 |
|---|---|---|
| 游戏态/棋盘/分数/等级/行数/当前块 | `game.js` 会话（既有） | 既有方法（不变） |
| 方块队列（7-bag 袋状态） | `createQueue` 内部闭包（bag/idx） | `next()`/`peek()`（袋空时自动创建新袋） |
| 音量/静音/voice/BGM | `audio.js`（既有） | 既有 setter（不变） |
| 键盘映射 | `keyAction` 纯函数（既有） | 不可写（v2.7 零改动） |

### 5.2 状态机零改动

- `PHASE_TRANSITIONS` / `transition` / `togglePause` / `start` / `restart` / `lose` **零改动**（AC-17.5）。
- 7-bag 算法仅影响 `createQueue` 的 `next()` 返回值（方块类型），不改变任何状态迁移逻辑。

### 5.3 数据流只读性（AC-17.5）

- 7-bag 算法**只影响** `createQueue` 的 `next()` 返回值，**不写**任何引擎状态；不调用 `move/rotate/softDrop/hardDrop/clearLines/score`。其存在与否对状态机、计分、音效触发**零影响**（AC-17.5）；回归底线 AC-01~16 全绿即证明。

---

## 6. 关键实现要点与边界情况

### 6.1 AC-17 逐条落地要点

| AC | 实现位置/机制 |
|---|---|
| AC-17.1 每袋完整性 | `createQueue` 内部 `bag = newBag()`（TYPES.slice + shuffle），每袋包含全部 7 型各 1 次；verify-game 断言每 7 块包含全部 7 型 |
| AC-17.2 袋内随机排列 | Fisher-Yates 洗牌（rng 可注入），不同局/不同袋顺序可不同；verify-game 断言注入确定性 rng 时顺序可预测 |
| AC-17.3 连续两袋无重叠顺序 | 袋空时 `bag = newBag()` 创建新袋，新袋独立洗牌；verify-game 断言相邻两袋不构成完全相同顺序 |
| AC-17.4 接口兼容 | `createQueue(rng)` 签名不变，返回 `{ peek(), next() }` 结构不变；verify-game 既有 createQueue 用例全绿 |
| AC-17.5 零副作用 | 不改状态机/`keyAction`/计分/数值/音效/UI 渲染/幽灵块/BGM/持久化；变更面仅 `createQueue` 函数内部实现 |
| AC-17.6 回归底线 | AC-01 ~ AC-16 可自动化项 100% 全绿；六套验证全绿 |

### 6.2 边界情况清单（v2.7 新增 E-17-01 ~ 05）

| # | 边界情况 | 处理策略 |
|---|---|---|
| E-17-01 | 袋空时创建新袋 | `idx >= bag.length` → `bag = newBag(); idx = 0`；peek/next 均处理 |
| E-17-02 | peek 不消耗 | peek 返回 `bag[idx]` 但不递增 idx；袋空时预填充新袋（延迟创建） |
| E-17-03 | rng 注入确定性 | 注入固定 rng 时，shuffle 结果可预测；verify-game 用注入 rng 测试 |
| E-17-04 | 连续两袋顺序相同（概率极低） | 独立洗牌，概率 ≈ 1/7! ≈ 0.000198；verify-game 断言非固定拼接 |
| E-17-05 | 首次 peek/next | 构造函数内 `bag = newBag()` 预填充第一个袋；首次调用无需特殊处理 |

> **决策记录 D-17（无分歧，记录性）**：7-bag 算法是否需要新增快照字段 `bag`？——**否**。7-bag 为 `createQueue` 内部实现，调用方仅关心 `peek()/next()` 返回值；若写入 `snapshot` 会污染引擎契约、增加快照复制成本且无收益。此决策与 PRD §1.2「接口兼容、零副作用」一致。

---

## 7. 测试策略

### 7.1 `scripts/verify-game.cjs` 增量（node:test，零依赖，新增 3 组用例）

| 用例 | 断言 |
|---|---|
| **7-bag 每袋完整性（AC-17.1）** | 注入确定性 rng，连续调用 next() 14 次，前 7 块包含全部 7 型各 1 次、后 7 块包含全部 7 型各 1 次；每 7 块为完整一袋 |
| **7-bag 袋内随机排列（AC-17.2）** | 注入不同 rng 时，两袋顺序不同；注入固定 rng 时，顺序可预测且与 shuffle 结果一致 |
| **7-bag 连续两袋无重叠顺序（AC-17.3）** | 连续两袋的 14 块序列中，前袋末尾与后袋开头不构成完全相同的 7 块顺序（断言非固定拼接） |

> **既有用例调整**：
> 1. `createQueue: 默认均匀随机分布（大样本各型 ≈1/7）`（L260~268）→ **删除或替换**为 7-bag 分布用例（每袋完整，大样本统计仍 ≈1/7 但分布更均匀）。
> 2. `createQueue: 注入 RNG 确定、peek 不消耗`（L246~258）→ **调整**为 7-bag 下的注入 rng 语义（peek 返回袋内当前块，next 返回并递增）。
> 3. 既有 47 项中与 `createQueue` 语义相关的用例需核对是否受 7-bag 影响（主要为状态机/计分/键盘映射用例，不受影响）。

### 7.2 `scripts/verify-ui.cjs` / `scripts/verify-audio.cjs` / `scripts/verify-persist.cjs` 零改动

- **verify-ui.cjs**：7-bag 不涉及 UI 层，既有用例全绿（回归）。
- **verify-audio.cjs**：7-bag 不涉及音效层，既有用例全绿（回归）。
- **verify-persist.cjs**：7-bag 不涉及持久化层，既有用例全绿（回归）。

### 7.3 `scripts/qa-e2e-jsdom.cjs` 零改动

- 7-bag 算法为引擎层内部实现替换，E2E 层方块出现顺序由 `createQueue.next()` 驱动，E2E 断言不感知方块来源；既有用例全绿（回归）。

### 7.4 `scripts/assembly-check.cjs` 零改动

- 7-bag 不新增导出、不改 DOM 结构、不改脚本序；既有审计全绿（回归）。

### 7.5 `scripts/verify-constants.cjs` 零改动

- 三模块 `VERSION` 保持 `'2.3.0'`（7-bag 为内部实现替换，不新增玩家可见功能）；verify-constants 基线维持。

### 7.6 回归底线与人工补测

- **回归底线**：`verify-game.cjs`（调整后用例）、`verify-audio.cjs`（19）、`verify-ui.cjs`（7）、`verify-constants.cjs`（2）、`assembly-check.cjs`（ALL PASSED）、`verify-persist.cjs`（11）、`qa-e2e-jsdom.cjs`（188+file://）**全部全绿**；AC-01 ~ AC-16 语义不变。
- **人工补测（真实浏览器，file://，环境限制非缺陷）**：
  1. 方块出现顺序公平性：连续 7 块包含全部 7 型（AC-17.1 目测验证）；
  2. 不再连续出现相同方块（7-bag 核心体验改善）；
  3. 不同局/不同袋顺序可不同（AC-17.2 目测验证）。

---

## 8. 任务拆分清单（与流水线派发任务对齐）

> **派发对齐说明**：流水线派发了 7-bag 随机算法任务，本拆分**逐项对齐并细化**（文件边界 / 接口契约 §3 / 验收标准），**不另起任务体系**。

### 任务：P-1 引擎层 7-bag 随机算法（派发任务细化）

**P-1.1 game.js 替换 createQueue 为 7-bag 实现**

- **涉及文件**：`game.js`（替换 `createQueue` 函数内部实现；`VERSION` 保持 `'2.3.0'`）
- **接口契约**：§3.1 / §2.1（`createQueue(rng) → { peek(), next() }`，7-bag 算法，rng 可注入）；§6.2 E-17-01~05 覆盖
- **实现要点**：Fisher-Yates 洗牌 + 袋生命周期管理；**不改** `collides`/`keyAction`/`hardDrop`/`ghostY`/任何既有函数；`node --check game.js` 通过
- **验收标准**：`verify-game.cjs` §7.1 新增 3 组用例绿；既有用例（调整后）全绿（AC-01~16 回归）
- **并行关系**：独立（不依赖 UI/音效/持久化层）

**P-1.2 单测增量（verify-game.cjs）**

- **涉及文件**：`scripts/verify-game.cjs`（§7.1：7-bag 每袋完整性 / 袋内随机排列 / 连续两袋无重叠顺序；调整既有 createQueue 用例）
- **接口契约**：§3.1 `createQueue` 签名；§2.1 语义
- **验收标准**：新增用例全绿；调整后既有用例全绿；总用例数 ≥ 47 + 新增；`node scripts/verify-game.cjs` 退出码 0
- **并行关系**：依赖 P-1.1 的 `createQueue` 替换完成

### 批次 2（回归与验收）

**P-2 装配审计、文档同步与回归验收**

- **涉及文件**：`scripts/assembly-check.cjs`（零改动，既有审计全绿）、`README.md`（零改动）、`docs/teamflow/memory.md`（更新 v2.7 迭代记录）
- **实现要点**：AC-01 ~ AC-16 全量回归（回归底线）+ AC-17 全组；§1.3 指标抽查（每袋完整性/接口兼容）
- **验收标准**：全部自动化验收项 100% 通过，无 P0/P1 遗留
- **并行关系**：依赖 P-1 全部完成

---

## 9. 里程碑映射（对应 PRD §8）

| 里程碑 | 周期 | 对应任务 | 出口标准 |
|---|---|---|---|
| M1 7-bag 实现（v2.7） | D1 | P-1（引擎 createQueue 替换 + 单测） | AC-17 自动化项全部通过（7-bag 每袋完整性/袋内随机排列/连续两袋无重叠/接口兼容）；AC-01~16 回归全绿；状态机/计分/音效/UI 渲染零改动确认 |
| M2 回归与验收（v2.7） | D1 | P-2（回归验收 + 文档同步） | AC-01~16 全量回归绿 + AC-17 端到端绿；QA 报告落盘；人工补测项登记 |

---

## 10. 风险与注意

| 风险 | 影响 | 缓解 |
|---|---|---|
| 7-bag 算法改动引入回归（AC-17.5） | 破坏碰撞/状态机/快捷键/音效 | 变更面仅 `createQueue` 内部实现替换；E2E 补 AC-17 断言 + 回归 AC-01~16 全绿；`audio.js`/`ui.js`/`index.html`/`style.css`/`persist.js` 任务边界禁止触碰 |
| Fisher-Yates 洗牌实现错误 | 袋内排列不随机或不完整 | 标准算法实现 + 注入确定性 rng 测试验证 + verify-game 断言每袋完整性 |
| peek/next 语义变化 | 调用方行为异常 | 严格保持 `{ peek(), next() }` 结构不变；peek 不消耗、next 返回并补新值 |
| 袋生命周期管理错误 | 袋空时未创建新袋 | `idx >= bag.length` 时自动创建新袋；peek/next 均处理 |
| 连续两袋顺序相同（概率极低） | 玩家感知方块重复 | 独立洗牌，概率 ≈ 1/7! ≈ 0.000198；verify-game 断言非固定拼接 |

---

## 11. 开发者自查清单（交付前对照 AC-17）

- [ ] `game.js` `createQueue` 函数替换为 7-bag 实现（Fisher-Yates 洗牌 + 袋生命周期管理）
- [ ] `createQueue(rng)` 函数签名不变，返回 `{ peek(), next() }` 结构不变
- [ ] `collides`/`keyAction`/`hardDrop`/`ghostY`/状态机/计分/数值/`createGame` 实现**零改动**
- [ ] `audio.js` / `ui.js` / `index.html` DOM / `style.css` 既有规则 / `persist.js` 零改动
- [ ] 七套验证全绿：`verify-game`（调整后用例 + 新增 3 组）、`verify-audio`、`verify-ui`、`verify-constants`、`assembly-check`、`verify-persist`、`qa-e2e-jsdom`
- [ ] AC-01 ~ AC-17 回归全绿

---

## 12. 一次性成型纪律 · state 沉淀

```json
{
  "phase": "tech",
  "summary": "v2.7 技术方案：7-bag 随机算法——替换 game.js createQueue 均匀随机为标准 Tetris 7-bag 算法（Fisher-Yates 洗牌 + 袋生命周期管理），保留 rng 可注入接口；变更面仅 createQueue 函数内部实现替换，不新增导出、不改状态机/计分/数值/音效/UI 渲染/持久化；verify-game 补 3 组 7-bag 契约用例（每袋完整性/袋内随机排列/连续两袋无重叠）+ 调整既有 createQueue 用例；回归底线 AC-01~16 全绿，六套验证全绿。",
  "version": "v2.7",
  "memory": [
    "7-bag 算法实现：createQueue 内部 bag/idx 状态 + shuffle(newBag()) + peek/next 延迟创建",
    "Fisher-Yates 洗牌：标准原地算法，O(n) n=7，rng 可注入",
    "接口兼容：createQueue(rng) 签名不变，peek/next 语义不变",
    "零改动面：audio.js/ui.js/index.html/style.css/persist.js/状态机/计分/数值/ghostY",
    "测试增量：verify-game 补 3 组 7-bag 契约 + 调整既有 createQueue 用例",
    "回归底线：AC-01~16 全绿，六套验证全绿（verify-game/verify-audio/verify-ui/verify-constants/assembly-check/verify-persist/qa-e2e-jsdom）"
  ]
}
```
