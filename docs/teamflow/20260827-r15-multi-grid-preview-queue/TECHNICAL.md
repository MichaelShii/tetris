# 技术方案 — 多格预览队列（r15）

> **任务夹**：`docs/teamflow/20260827-r15-multi-grid-preview-queue/`
> **基线依赖**：`docs/teamflow/20260827-r14-hold-piece-toggle`（r14 Hold 全量行为、next-well 渲染模式、持久化通道不可回归）
> **取代**：`docs/teamflow/prd/PRD.md#AC-06.1`（单格"下一方块预览"）→ Next 区由 3 格队列接管，队列首格即下一块
> **验收依据**：本夹 `PRD.md` AC-1 ~ AC-12（P0 ×9 / P1 ×3），七套验证脚本全绿，r14 Hold 专项 35 项复跑无回归

---

## §1. 架构总览

### 1.1 现状与目标

| 维度 | r14 现状 | r15 目标 |
|---|---|---|
| Next 预览区 | 单格 48×24 Canvas（`#next-well`），READY 不显示 | 3 格纵向队列（48×80 单 Canvas），READY 即显示初始 3 格 |
| 数据源 | `snapshot.next` 单值（7-bag 游标） | `snapshot.queue` 数组恒长 3，严格跟随 7-bag 出块顺序 |
| 随机源能力 | `createQueue.peek()/next()` 仅暴露"下一块" | 新增 `peekN(n)`：后续 n 块非消耗读取（7-bag 契约组扩展，不改随机语义） |
| 显示控制 | 常显 | 设置弹层新增「预览队列」开关：默认开、关闭整区隐藏（含标签）、即时恢复、localStorage 持久化 |
| 引擎开关 | — | 无引擎开关：队列由引擎无条件维护，开关为纯 UI 显示层（AC-9） |

### 1.2 关键技术裁决（DESIGN 遗留问题在此定案）

1. **渲染方案裁决：A 单 Canvas 48×80**。理由：单 DOM 节点、单次 clearRect + 3 段顺序绘制；`.next-well` 容器承载"一个队列窗口"（描边/板底/辉光/圆角/内边距），canvas 内部透明、只画方块格——与 3 Canvas 堆叠案视觉等价（DESIGN 论证），但零额外 DOM 与样式面，且与"队列为单一对象"语义一致。
2. **队列状态建模裁决：快照派生而非双游标**。`snapshot.queue = [state.next, ...queue.peekN(NEXT_QUEUE_SIZE-1)]`，引擎不新增第二可变状态源。lockFlow / finishLock / spawnFirst / restart / hold / tick **零改动**，AC-3/5/9/11 全部由"单一游标 state.next + 快照派生"自然成立，从根上杜绝队列与出块序列错位（PRD 7.2 风险 2）。
3. **createQueue 重构裁决：FIFO 物化流**（见 §4.1）。`peek/next` 公开语义逐点等价（含 rand 消耗时机，对状态型 rng 亦等价），新增 `peekN(n)` 非消耗、可跨袋。
4. **verify-constants 存量漂移：不放大**。本需求不新增任何 VERSION 字段、不触碰 `verify-constants.cjs`（PRD 7.2 风险 4 既定策略）。

### 1.3 改动文件与职责

| 文件 | 职责 | 依赖 |
|---|---|---|
| `game.js` | NEXT_QUEUE_SIZE 常量 + createQueue FIFO/peekN + snapshot.queue | 无 |
| `persist.js` | `previewQueueEnabled` 布尔字段（默认开） | 无 |
| `index.html` | `#next-well` 48×80 + 设置弹层尾行 `#preview-queue-control > #btn-preview-queue` | style.css |
| `style.css` | 队列窗边框上移容器 + canvas 透明 + 开关按钮样式 | index.html |
| `ui.js` | `createNextQueueRenderer`（共享 `drawMiniPieceAt`）+ 开关三信号 + renderAll + 持久化接线 | game.js / persist.js / index.html |
| 5 个验证脚本 | verify-game / verify-persist / verify-ui / qa-e2e-jsdom / assembly-check | 各自被测模块 |
| `README.md` | 玩法/设置/信息面板描述同步 | — |

> 本产品为扁平纯 JS + UMD（`window.TetrisGame/ТetrisUI/TetrisPersist`），零构建、零运行时依赖、`file://` 可玩；无 package.json / 无后端，故无路由与 API 服务面——本节即全部接口面。

---

## §2. 数据模型与存储

### 2.1 引擎侧（game.js 内部 + 快照）

```text
state.next        string      单一游标（现行不变）：下一个出生方块；lockFlow/hold 出生即消费它
state.queue       createQueue 7-bag 流对象（现行不变）：provide peek()/next()/新增 peekN(n)
snapshot.queue    string[3]   派生只读数组：[state.next, ...state.queue.peekN(NEXT_QUEUE_SIZE-1)]
                              任意检查点长度恒 NEXT_QUEUE_SIZE（AC-1/AC-3 量化断言对象）
snapshot.next     string      保留（向后兼容：ui.js 旧消费方、verify-game snapshotDeep 均引用）
```

- 常量：`NEXT_QUEUE_SIZE = 3` 置于 `game.js` 顶部常量区（`SFX_EVENTS` 之后，数值单一事实来源，`verify-game.cjs` 同步断言）。
- createQueue 内部结构由「bag + idx + peeked/peekVal 游标」改为「`items[]` FIFO + `ensure(n)` 整袋补入」（§4.1）。

### 2.2 持久化层（persist.js）

```text
DEFAULT_SETTINGS.previewQueueEnabled = true   // 对齐 r14 holdEnabled 默认开
readState : settings.previewQueueEnabled = sanitize(v, {type:'boolean', def:true})
encode    : settings.previewQueueEnabled 随负载写盘
PAYLOAD_VERSION 不升级：additive 字段，旧载荷（无该字段）经 sanitize 回默认 true（与 r14 holdEnabled 同一兼容模式）
```

存储键不变：`tetris.v2` 单键带版本 JSON。无新公开 API。

---

## §3. 接口契约（API 指定）

### 3.1 game.js 导出面变更

| 符号 | 变更 | 契约 |
|---|---|---|
| `TetrisGame.NEXT_QUEUE_SIZE` | **新增导出** | 恒 `3` |
| `TetrisGame.createQueue(rng).peekN(n)` | **新增方法** | 非消耗；返回后续 `n` 项（可跨袋，顺序 = 逐次 `next()` 顺序）；`n≤0` → `[]`；对任意调用序列与后续 `next()` 结果严格一致 |
| `TetrisGame.createQueue(rng).peek()/next()` | 内部重构 | 公开语义逐点等价（§4.1 等价性论证） |
| `snapshot.queue` | **新增快照字段** | `string[3]` 派生数组（§4.2） |
| `snapshot.next` / 其余 API | 不变 | — |

### 3.2 ui.js 导出面变更

| 符号 | 变更 | 契约 |
|---|---|---|
| `TetrisUI.createNextQueueRenderer(canvas)` | **新增导出** | 签名对齐 `createNextWellRenderer`：入参 `<canvas>`，缺失抛 `/需要 <canvas> 元素/`；返回 `{ render(queue|null), dispose() }`，装配时设置 `canvas.style.width = '48px'`、`style.height = '80px'`（供 e2e 尺寸断言） |
| `TetrisUI.createNextWellRenderer` / `createHoldWellRenderer` | 保留导出 | 行为逐字节不变；内部共用抽取出的 `drawMiniPieceAt`（§5.2） |
| `#btn-preview-queue` | **新增必需元素** | `createUI` 装配期 `must('#btn-preview-queue')` 校验，缺失即抛错（装配契约显式化，与 `#btn-hold` 同模式） |

### 3.3 持久化层 / DOM

- persist.js 无新公开 API（字段扩展见 §2.2）。
- `index.html`：`#next-well` 尺寸 `width="48" height="80"`，`aria-label="下一个方块预览队列"`；设置弹层辅助设置组尾行 `#preview-queue-control > #btn-preview-queue`（完整 DOM 见 §5.1）。
- 无路由、无后端、无构建产物。

---

## §4. 引擎实现（game.js）

### 4.1 createQueue：FIFO 物化流重构 + peekN

```js
function createQueue(rng) {
  const rand = typeof rng === 'function' ? rng : Math.random
  function shuffle(arr) { /* 原样保留（不变） */ }
  function newBag() { return shuffle(TYPES.slice()) }
  // 已物化的后续方块 FIFO；耗尽时整袋补入，保证袋内排列与袋间顺序 = 标准 7-bag
  const items = []
  function ensure(n) {
    while (items.length < n) {
      const b = newBag()
      for (let i = 0; i < b.length; i++) items.push(b[i])
    }
  }
  ensure(1) // 构造期预填首袋：rand 消耗时点与旧模型（构造时 newBag）逐点一致
  return {
    peek: function () { ensure(1); return items[0] },
    next: function () { ensure(1); return items.shift() },
    peekN: function (n) {
      const k = typeof n === 'number' && n > 0 ? Math.floor(n) : 0
      ensure(k)
      return items.slice(0, k)
    },
  }
}
```

**等价性论证（对既有 peek/next 行为）**：
- 构造期 `ensure(1)` 预生成首袋——与旧模型"构造期 `bag = newBag()`"同一时点消耗同一批 `rand()`（7 元素 Fisher-Yates = 6 次 rand），序列逐点全等（含状态型 rng）。
- `next()` 表现为取 FIFO 首项后移除：前 7 次为 bag0 排列序，第 8 次起 `ensure` 触发新袋——袋边界生成时点 = 旧模型 `idx ≥ bag.length` 时点，rand 消耗次数与顺序完全一致。
- `peek()` = 只读 `items[0]`，与旧 `peeked` 语义（不消耗）等价。
- `peekN(k)` 非消耗（`slice` 不改 items），且因 FIFO 是袋流的纯前缀，其返回项 = 随后逐次 `next()` 的消费序——**AC-2 固定序列可断言的前提**。rng 注入不变（默认 `Math.random`），7-bag 完整性/袋内随机构造不变。

### 4.2 snapshot.queue 派生

```js
function snapshot() {
  return {
    // …既有字段不变…
    next: state.next, // 保留（兼容）
    // r15：多格预览队列（AC-1/AC-3/AC-10）：恒长 NEXT_QUEUE_SIZE；首格 = 下一出生块
    queue: [state.next].concat(state.queue.peekN(NEXT_QUEUE_SIZE - 1)),
  }
}
```

`peekN` 非消耗，每次 `emit()` 派生代价 ≤ 2 次数组访问，可忽略。

### 4.3 零改动点：全部既有流程自动满足新 AC

| AC | 成立路径（无新增代码） |
|---|---|
| AC-1/AC-4 | READY 构造期即 `state.next = queue.next()`，queue 派生首帧已含 3 格；每格为合法 `TYPES` 项或 null（空位留白，渲染层兜底） |
| AC-3 | `finishLock` 出生时 `type = state.next; state.next = queue.next()`：队首被消费、尾部由脉冲 stream 补位，队列数组自动前移且恒长 3 |
| AC-5 | PAUSED 冻结（快照数据不动）；`restart()` 现有 `state.queue = createQueue(rng); state.next = q.next()` 重建 → 队列重置为新袋初始 3 格；GAME_OVER 后队列保持最终值（不再 spawn，derive 稳定） |
| AC-9 | 引擎无预览开关：开关仅 UI 闭包，关闭期队列照常维护 |
| AC-11 | `hold()` 空槽分支：`nextType = state.next`（= 队首）出生、`state.next = queue.next()` 补位 → hold 消费队首；交换分支不消耗 → 队列内容与顺序不变；`snapshot.queue` 派生自动反映 |
| AC-10 | `NEXT_QUEUE_SIZE` + `peekN` + `snapshot.queue` + `restart` 重置，全部引擎接口就位 |

### 4.4 导出面

```js
return { /* … */ NEXT_QUEUE_SIZE: NEXT_QUEUE_SIZE, createQueue: createQueue, /* … */ }
```

---

## §5. UI 实现（index.html + ui.js + style.css）

### 5.1 DOM（index.html）

```html
<!-- 队列窗口：描边/板底/辉光/圆角上移至 .next-well 容器（§5.3） -->
<div class="next-well">
  <span class="stat__label">下一个</span>   <!-- 标签不变：首格即下一块 -->
  <canvas id="next-well" width="48" height="80" aria-label="下一个方块预览队列"></canvas>
</div>
```

设置弹层辅助设置组尾行（`#hold-control` 之后）追加：

```html
<div id="preview-queue-control" class="ghost-control" role="group" aria-label="预览队列开关">
  <span class="stat__label">预览队列</span>
  <button type="button" id="btn-preview-queue" class="btn btn--secondary btn--audio"
          aria-pressed="true" aria-label="预览队列：开启">👁 预览队列：开</button>
</div>
```

> 关键约束：`#btn-preview-queue` 必须位于脚本之前（与 `#btn-mute` 等同理）——`createUI` 装配期 `must()` 立即校验，缺失即装配失败（既有弹层注释约束）。

### 5.2 渲染（ui.js）

```js
const WELL_COLS = 4, WELL_ROWS = 2, WELL_CELL = 12   // 既有：48×24 槽位规格
const QUEUE_SLOT_GAP = 4                              // = var(--sp-1)
const NEXT_SLOTS = (typeof TetrisGame !== 'undefined' && TetrisGame.NEXT_QUEUE_SIZE) || 3
const QUEUE_CSS_H = NEXT_SLOTS * WELL_ROWS * WELL_CELL + (NEXT_SLOTS - 1) * QUEUE_SLOT_GAP // 80

// 抽取：单槽 rot0 迷你绘制（从 createNextWellRenderer/createHoldWellRenderer 逐格绘制体中抽取，
// ox/oy 为槽内原点；两既有渲染器以 (0,0) 调用，行为逐字节等价）
function drawMiniPieceAt(ctx, type, ox, oy) { /* 原居中/实际宽高/逐格 drawMiniCell 逻辑，坐标整体平移 ox/oy */ }

function createNextQueueRenderer(canvas) {
  // 校验同 createNextWellRenderer（null/无 2d 上下文抛 /需要 <canvas> 元素/）
  // 装配：canvas.style.width = (WELL_COLS * WELL_CELL) + 'px'
  //       canvas.style.height = QUEUE_CSS_H + 'px'
  return {
    render: function (queue) {
      ctx.clearRect(0, 0, WELL_COLS * WELL_CELL, QUEUE_CSS_H)   // canvas 透明，背景由容器提供
      if (!Array.isArray(queue)) return                          // null → 空队列窗（关闭态兜底）
      for (let i = 0; i < NEXT_SLOTS; i++) {
        const type = queue[i] || null
        if (type) drawMiniPieceAt(ctx, type, 0, i * (WELL_ROWS * WELL_CELL + QUEUE_SLOT_GAP))
        // 空槽：不绘制 → 容器板底色自然留白（AC-4）
      }
    },
    dispose: function () { /* 无资源，与 createNextWellRenderer 相同（空实现） */ },
  }
}
```

装配替换：`const nextWell = createNextQueueRenderer(nextCanvas)`（取代 `createNextWellRenderer(nextCanvas)`）。`createNextWellRenderer`/`createHoldWellRenderer` 保留导出并改为内部调用 `drawMiniPieceAt(ctx, type, 0, 0)`（`verify-ui` 签名断言与 `qa-e2e` 既有绘制断言兜底回归）。

### 5.3 队列窗口样式（style.css）

```css
.next-well {
  display: flex; flex-direction: column; gap: var(--sp-2);
  border: 1px solid var(--accent);            /* 描边：从 canvas 上移 */
  border-radius: var(--radius-sm);            /* 圆角 */
  background: var(--board-bg);                /* 板底 */
  box-shadow: 0 0 8px rgba(255, 217, 92, 0.18); /* 辉光 */
  padding: var(--sp-1);                       /* 队列窗内边距（三段同框） */
}
#next-well {
  align-self: flex-start;
  border: none; background: transparent; box-shadow: none;  /* canvas 透明化 */
}
```

- 删除 `#next-well:focus-visible` 规则（canvas 不可聚焦，仅保留 `#board:focus-visible`）。
- `#btn-preview-queue`：`width:100%; white-space:nowrap;` + `[aria-pressed='true']` 微金描边 / `[aria-pressed='false']` 还原 `btn--secondary`——完整镜像既有 `#btn-hold` 规则组（§零新增 token，DESIGN 纪律）。

### 5.4 开关与 renderAll（ui.js）

```js
// 位于 holdBtn 接线之后（§5.5 UI 闭包）
const previewQueueBtn = must('#btn-preview-queue')
let previewQueueEnabled = true                       // 默认开（AC-6）；纯显示层，引擎无开关（AC-9）

function syncPreviewQueueBtn() {
  previewQueueBtn.setAttribute('aria-pressed', previewQueueEnabled ? 'true' : 'false')
  previewQueueBtn.setAttribute('aria-label', '预览队列：' + (previewQueueEnabled ? '开启' : '关闭'))
  previewQueueBtn.textContent = previewQueueEnabled ? '👁 预览队列：开' : '👁 预览队列：关'
}
function onPreviewQueueToggle() {
  previewQueueEnabled = !previewQueueEnabled
  syncPreviewQueueBtn()
  persistSettings()
  blurElement(this)
  renderAll(game.getSnapshot())    // 即时生效（AC-7：同步重绘 ≤200ms，无动效）
}
previewQueueBtn.addEventListener('click', onPreviewQueueToggle)
```

renderAll 替换（原 1392 行）：

```js
// r15（AC-1/AC-7）：队列渲染取代单格 next；关闭整区隐藏（含标签）；READY 亦显示初始 3 格
const nextWellContainer = nextCanvas ? nextCanvas.parentElement : null
if (nextWellContainer) nextWellContainer.style.display = previewQueueEnabled ? '' : 'none'
nextWell.render(previewQueueEnabled ? s.queue : null)
```

- 四游戏态（READY/RUNNING/PAUSED/OVER）开关恒可用（`game` 存在守卫同 `onGhostToggle`）。
- 重开立即按当前 `snapshot.queue` 重绘——与序列严格一致、不重置（AC-7）。

### 5.5 持久化接线 / dispose / 导出

```js
persistSettings() → 增加 previewQueueEnabled: previewQueueEnabled
启动恢复块       → if (typeof st.previewQueueEnabled === 'boolean') previewQueueEnabled = st.previewQueueEnabled
syncPreviewQueueBtn() 加入恢复后的镜像调用（与 syncHoldBtn() 并列）
dispose()        → previewQueueBtn.removeEventListener('click', onPreviewQueueToggle)
导出面           → createNextQueueRenderer: createNextQueueRenderer
头部注释         → 渲染器签名清单补 createNextQueueRenderer（48×80 队列窗）
```

---

## §6. 持久化层（persist.js）

- `DEFAULT_SETTINGS` 追加 `previewQueueEnabled: true`（默认开，对齐 r14）。
- `readState` / `encode` 同步追加（sanitize 布尔白名单，非布尔回默认 true）。
- `PAYLOAD_VERSION` 不升（additive，旧载荷/旧代码双向兼容，与 r14 `holdEnabled` 同模式）。
- `verify-persist.cjs`：默认值断言 + 往返 + 旧载荷缺字段回默认 + sanitize 非布尔回默认（§7）。

---

## §7. 测试策略（七套矩阵）

| 脚本 | 变更 | 新增用例（AC 映射） |
|---|---|---|
| `verify-game.cjs` | 保留既有全部用例（FIFO 重构行为等价的回归护栏） | ①`NEXT_QUEUE_SIZE===3` 导出（AC-10）；②`peekN`：`n=0→[]`、长度、**非消耗**（peekN 后 `peek()/next()` 返回首项）、**跨袋序列一致性**（固定 rng，next()×6 后 peekN(3)=本袋 1+下袋 2，且随后 next() 依次命中）；③READY `snapshot.queue` 长度 3 且 `queue[0]===s.next`（AC-1）；④start 后 `piece.type===前置 queue[0]` 且新 `queue[0]===前置 queue[1]`（AC-3 前移）；⑤**AC-2 固定序列 20 次出生**：`rng=()=>0.5` 打桩，每次锁定后断言"出生块 === 上一快照 queue[0]"，连续 20 次无错位缺漏；⑥PAUSED 冻结：pause→多次 getSnapshot + tick 后 queue 不变（AC-5）；⑦restart 重建：queue 长度 3、内容随新袋（AC-5）；⑧GAME_OVER 最终队列长度 3；⑨**AC-11 Hold 共存**：空槽暂存后 `piece.type===旧 queue[0]`、`queue[0]===旧 queue[1]`；交换后 queue 不变；holdEnabled 关闭不触队列（AC-9 引擎侧） |
| `verify-persist.cjs` | 追加 | `DEFAULT_SETTINGS.previewQueueEnabled===true`；save/load 往返（false）；旧载荷（v2.9 格式）无字段→true；sanitize 非布尔→true（AC-8） |
| `verify-ui.cjs` | 追加 | `createNextQueueRenderer` 导出存在、null/undefined 抛 `/需要 <canvas> 元素/`（签名对齐 createNextWellRenderer）；`createNextWellRenderer`/`createHoldWellRenderer` 契约保持（AC-4 复用回归） |
| `qa-e2e-jsdom.cjs` | 更新 1 处 + 新场景 | **更新**：既有"预览画布 48×24"断言 → `style.height==='80px'`（§5.2 渲染器设置）；**新增**：READY 渲染 3 格（draw 调用基线增量）；start 后 queue 渲染；`#btn-preview-queue` 默认 `aria-pressed=true`+文案「开」+Tab 可聚焦（AC-6）；点击→`display:none`（含标签）、棋盘/分数不受影响（AC-7/AC-9）、再点击→`display:''` 即时恢复且与 snapshot.queue 一致、score/level 不重置（AC-7）；关闭期多次 hardDrop 后重开队列与下一出生一致（AC-9）；持久化：关闭→saveSettings 写盘→二次 JSDOM 装载（沿用既有 w2 reload 模式）恢复关闭态（AC-8）；Hold 并存：开关关闭下 hold 正常且队首消费正确（AC-11） |
| `assembly-check.cjs` | 追加 | selector 清单补 `'#preview-queue-control','#btn-preview-queue'`（§装配审计）；验证 `#next-well` 存在 |
| `verify-constants.cjs` | **无变更** | 不新增 VERSION 字段、不放大存量漂移（PRD 7.2 风险 4 裁定） |
| `verify-audio.cjs` | 无变更 | 音效不涉及 |

**出口标准**：七套全绿 + r14 Hold 专项 35 项（AC-1~17 语义）复跑无回归 + AC-2 20/20 一致 + 开关显示/隐藏切换 ≤ 200ms（同步调用，实测即时）。

---

## §8. 任务拆分与并行化（含 PRD §10 工程约束）

> **工程约束（PRD §10 verbatim 要点，全部落入任务）**：「新增一个分支去实现多格预览队列功能」→ 从最新 `main`（`dc0e01f`）建 **`feat/multi-grid-preview-queue`**；本需求代码改动全部在该分支提交；七套全绿且产品验收通过后合回 `main`；工作区唯一未跟踪项（本任务夹文档）不清理、不计入代码提交；数值单一事实来源常量改动须同步 verify-* 脚本。

### 任务 0 — 分支准备（git 动作，先行）

```bash
git checkout main && git pull             # 基线 = dc0e01f 或其后
git checkout -b feat/multi-grid-preview-queue
# 未跟踪任务夹 docs/teamflow/20260827-r15-*/ 保持原样（需求产物，不提交）
```

### 任务表（文件互斥 → 并行；依赖边约束执行顺序）

| # | 任务（文件边界） | 文件 | 验收点 | 依赖 |
|---|---|---|---|---|
| T1 | 引擎队列 | `/game.js` | NEXT_QUEUE_SIZE 导出 + createQueue FIFO/peekN + snapshot.queue；既有 API 行为等价 | 任务 0 |
| T2 | 引擎单测 | `/scripts/verify-game.cjs` | §7 引擎用例全绿；（与 T1 并行时须按 §3.1 契约实现） | 任务 0 |
| T3 | 持久化字段 | `/persist.js`, `/scripts/verify-persist.cjs` | previewQueueEnabled 默认开/往返/旧数据兼容 全绿 | 任务 0 |
| T4 | DOM | `/index.html` | `#next-well` 48×80 + `#btn-preview-queue` 尾行（脚本之前） | 任务 0 |
| T5 | UI 逻辑 | `/ui.js` | createNextQueueRenderer + drawMiniPieceAt 抽取（旧两渲染器行为逐字节等价）+ 开关三信号 + renderAll + persist/dispose/导出 | T4（must 元素） |
| T6 | 样式 | `/style.css` | 容器级队列窗 + canvas 透明 + `#btn-preview-queue` 规则组 + 删 `#next-well:focus-visible` | T4 |
| T7 | UI 契约单测 | `/scripts/verify-ui.cjs` | §7 verify-ui 用例 | T5 |
| T8 | E2E | `/scripts/qa-e2e-jsdom.cjs` | 48×80 断言更新 + §7 e2e 场景全绿 | T4+T5+T6 |
| T9 | 装配审计 | `/scripts/assembly-check.cjs` | selector 清单补两 ID，审计绿 | T4 |
| T10 | README 同步 | `/README.md` | 玩法列表加"多格预览队列（v3.2）"、设置弹层描述补预览队列开关、信息面板"下一个方块预览"→"预览队列（3 格）"；不新增全局 AC 编号（本夹 AC 为唯一验收依据）；不动模块 VERSION | — |
| T11 | 回归与合回 | — | 七套全绿复跑 + r14 Hold 35 项回归 → `git checkout main && git merge --no-ff feat/multi-grid-preview-queue`（验收通过后执行） | 全部 |

### 执行波浪与提交批次

```text
Wave 0 : 任务 0（建分支）
Wave 1 : T1 ∥ T3 ∥ T4 ∥ T6 ∥ T10          （文件互斥，并行）
Wave 2 : T2（对齐 T1 契约）∥ T5（依赖 T4 ID）∥ T9（依赖 T4）
Wave 3 : T7（依赖 T5）∥ T8（依赖 T4/T5/T6）
Wave 4 : T11 回归/合回
提交批次（每波一个 commit 起步，信息规范，如 feat: 多格预览队列-引擎/NEXT_QUEUE_SIZE+peekN）
  批次1 引擎：T1+T2 → verify-game 绿
  批次2 持久化：T3 → verify-persist 绿
  批次3 前端：T4+T5+T6+T7+T9 → verify-ui + assembly-check 绿
  批次4 E2E+README：T8+T10 → qa-e2e 绿
  批次5 回归：T11 七套全绿复跑 → 验收 → 合回 main
```

---

## §9. 边界情况与防御性设计

| 场景 | 处理 |
|---|---|
| `peekN(n≤0)` / 非数值 | 回 `[]`（不抛错、不消耗） |
| 队列槽位为 null / 非 TYPES 值 | 空槽不绘制（容器底板留白）；渲染层不抛错（AC-4） |
| peekN 跨袋 | FIFO `ensure` 整袋补入，返回项与后续 `next()` 顺序严格一致（AC-2 基础） |
| READY 态 | 显示初始 3 格（取代基线 READY 空，AC-1）；start 后实时前移 |
| PAUSED / GAME_OVER | 冻结 / 保持最终队列 |
| restart | 队列随 `createQueue(rng)` 重建为新初始 3 格（AC-5） |
| hold 空槽 / 交换 | 空槽消耗队首并补尾；交换不消耗——队列内容与顺序不变（AC-11） |
| 开关关闭期 | 引擎照常维护队列（引擎无开关，AC-9）；重开立即按 snapshot 渲染、不重置（AC-7） |
| 持久化缺字段 / 坏值 | `previewQueueEnabled` sanitize 回默认 true（AC-8） |
| `#btn-preview-queue` 缺失 | `createUI` 装配期 `must()` 抛错（装配契约显式化），assembly-check 兜底 |
| persist.js 缺失 | ui.js 不启用持久化（既有向后兼容模式） |
| `file://` / 无构建 | 纯静态、零新增依赖、零新增 token/动效 |
| verify-constants 存量漂移 | 不新增 VERSION 字段、不触碰脚本（PRD 7.2 风险 4） |
| e2e 尺寸断言联动 | `#next-well` 48×24→48×80 必须与渲染器 style 设置**同步修改**（§8 T8 明示） |

---

## §10. 数据流图

```text
createGame(rng) ──► state.queue(FIFO 7-bag) ──► state.next（单一游标）
                                                      │
                    emit()/getSnapshot() ──► snapshot { next, queue: [next, ...peekN(2)] }
                                                      │
  createUI onSnapshot ──► renderAll(s) ──► nextWell.render(s.queue)     [previewQueueEnabled 关闭 → .next-well display:none]
                                                      │
                    onPreviewQueueToggle ──► persistSettings({…, previewQueueEnabled}) ──► localStorage(tetris.v2)
                    createUI 启动恢复 ◄── persist.load() → previewQueueEnabled 回填 + syncPreviewQueueBtn
```

---

<!-- blueprint -->{"summary":"3 格预览队列以「单一游标 state.next + 快照派生 snapshot.queue + createQueue.peekN」实现，引擎零新增可变状态、零流程改动，开关为纯 UI 显示层，A 案单 Canvas 48×80 队列窗","modules":{"/game.js":{"responsibility":"NEXT_QUEUE_SIZE 常量 + createQueue FIFO 重构(peek/next 等价)与 peekN(n) 非消耗跨袋读取 + snapshot.queue 派生字段 + 导出","dependsOn":[],"assemblyOrder":1,"why":"7-bag 唯一数据源；FIFO 物化流保证 peekN 与 next 共用同一 rng 消耗序，从根上消除队列-出块错位；snapshot 派生避免第二可变状态源"},"/persist.js":{"responsibility":"DEFAULT_SETTINGS/readState/encode 同步新增 previewQueueEnabled 布尔字段(默认 true,additive 不升版本)","dependsOn":[],"assemblyOrder":2,"why":"沿用 r14 holdEnabled 同模式：旧载荷缺字段 sanitize 回默认，向后兼容零破坏"},"/index.html":{"responsibility":"#next-well 升级 48×80 队列 canvas + 设置弹层辅助组尾行 #preview-queue-control > #btn-preview-queue(脚本之前)","dependsOn":["/style.css"],"assemblyOrder":2,"why":"装配期 must() 校验要求 DOM 与 ui.js 同版本落地；按钮置于弹层尾行符合设置分组惯例"},"/ui.js":{"responsibility":"createNextQueueRenderer(单 Canvas 48×80,3 槽 y 偏移 0/28/56) + drawMiniPieceAt 抽取共享 + 预览队列开关三信号/即时显隐/renderAll/持久化/dispose/导出","dependsOn":["/game.js","/persist.js","/index.html"],"assemblyOrder":3,"why":"渲染复用既有 rot=0 迷你绘制；开关纯显示层不落引擎(AC-9)；renderAll 单一入口保证显隐/重绘 ≤200ms 即时"},"/style.css":{"responsibility":"队列窗边框/圆角/板底/辉光上移 .next-well 容器(内边距 --sp-1) + canvas 透明化 + #btn-preview-queue 规则组镜像 #btn-hold + 删 #next-well:focus-visible","dependsOn":["/index.html"],"assemblyOrder":2,"why":"\"一个队列窗口\"三段同框由容器承载；零新增 token 严守 DESIGN 纪律"},"/README.md":{"responsibility":"玩法/设置弹层/信息面板描述同步(多格预览队列 v3.2),不新增全局 AC 编号,不动模块 VERSION","dependsOn":[],"assemblyOrder":4,"why":"产品入口文档与验收速览保持一致；VERSION 漂移系内存待办,不放大"}},"duplications":["createNextWellRenderer/createHoldWellRenderer 与新增 createNextQueueRenderer 三段近同的逐格绘制逻辑 → T5 抽取 drawMiniPieceAt 单点共享,旧渲染器行为必须逐字节等价(verify-ui+qa-e2e 双兜底)","qa-e2e line221 #next-well 尺寸断言(48×24)与 ui.js 渲染器 style.width/height 设置两处耦合 → T8 必须同步改 48×80,否则装配后 e2e 红","verify-constants 与三模块 VERSION 的存量漂移(memory 待办)→ 本需求不新增 VERSION 字段、不触碰脚本,避免放大"],"tasks":[{"title":"T0 建分支 feat/multi-grid-preview-queue(从 dc0e01f)","files":["git 动作"],"spec":"checkout main→pull→checkout -b feat/multi-grid-preview-queue;未跟踪任务夹不清理不提交"},{"title":"T1 引擎队列 game.js","files":["/game.js"],"spec":"NEXT_QUEUE_SIZE=3 顶部常量+导出;createQueue 改 FIFO 物化流(构造期空袋预填保证 rng 时序等价)并新增 peekN(n) 非消耗可跨袋;snapshot 增 queue 派生字段保留 next;lockFlow/hold/restart 零改动"},{"title":"T2 引擎单测 verify-game.cjs","files":["/scripts/verify-game.cjs"],"spec":"NEXT_QUEUE_SIZE/peekN(空/非消耗/跨袋一致)/snapshot.queue 恒长 3 且 queue[0]===next/AC-2 固定序列 20 次出生 100% 一致/AC-3 前移/AC-5 冻结+restart/AC-11 hold 队首消费+交换不消耗;既有用例全绿(重构等价护栏)"},{"title":"T3 持久化 verify-persist.cjs","files":["/persist.js","/scripts/verify-persist.cjs"],"spec":"previewQueueEnabled 默认 true;readState/encode 同步;PAYLOAD_VERSION 不升;用例=默认/往返/旧数据回默认/sanitize 非布尔回默认"},{"title":"T4 DOM index.html","files":["/index.html"],"spec":"#next-well width=48 height=80 aria-label 更新;辅助设置组尾行追加 #preview-queue-control>#btn-preview-queue(aria-pressed=true 文案👁 预览队列:开);位于脚本之前"},{"title":"T5 UI ui.js","files":["/ui.js"],"spec":"抽取 drawMiniPieceAt(旧两渲染器等价);新增 createNextQueueRenderer(48×80,3 槽偏移,style 尺寸设置,render/dispose);开关闭包+三信号+onToggle→persistSettings+renderAll 即时;renderAll 队列渲染+容器显隐(READY 亦渲染);启动恢复/dispose/导出/头注"},{"title":"T6 样式 style.css","files":["/style.css"],"spec":".next-well 容器承接边框/圆角/板底/辉光/内边距 var(--sp-1);#next-well 透明化;新增 #btn-preview-queue 规则组(镜像 #btn-hold,含 aria-pressed 两态);删 #next-well:focus-visible;零新增 token"},{"title":"T7 UI 契约 verify-ui.cjs","files":["/scripts/verify-ui.cjs"],"spec":"createNextQueueRenderer 导出+签名校验(缺 canvas 抛错);createNextWellRenderer/createHoldWellRenderer 契约不回归"},{"title":"T8 E2E qa-e2e-jsdom.cjs","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"预览画布尺寸断言 24→80 同步改;新增 READY 3 格渲染/开关默认开三信号/关闭整区隐藏+游戏不受影响/重开即时恢复且与 snapshot 一致/关闭期 hardDrop 后重开一致/二次装载持久化恢复/Hold 共存"},{"title":"T9 装配审计 assembly-check.cjs","files":["/scripts/assembly-check.cjs"],"spec":"selector 清单补 '#preview-queue-control','#btn-preview-queue';全量审计绿"},{"title":"T10 README 同步","files":["/README.md"],"spec":"玩法加多格预览队列(v3.2);设置弹层描述补预览队列;信息面板'下一个方块预览'→'预览队列(3 格)';不新增全局 AC;不动 VERSION"},{"title":"T11 回归与合回","files":["六套脚本"],"spec":"七套全绿复跑+r14 Hold 35 项回归→验收通过后 merge --no-ff feat/multi-grid-preview-queue 回 main"}]}<!-- /blueprint -->