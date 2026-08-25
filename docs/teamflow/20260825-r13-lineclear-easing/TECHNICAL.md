# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）：消行动画缓动（r13）

- 版本：v3.1 增量（**不 bump 模块头部 VERSION**，PRD §3/§8：发布版本仅对外发版统一升位；verify-constants 三模块一致保持全绿）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：本夹 `PRD.md`（AC-1~10 唯一验收依据）、本夹 `DESIGN.md`（霓虹脉冲视觉/包络/取代点）、`AGENTS.md`（§4 工程约定）、活文档 `docs/teamflow/technical/TECHNICAL.md`（UMD 契约基线）、`docs/teamflow/design/DESIGN.md`（P4 动效规范）
- 基线依赖：20260825-r12（弹层自动暂停与动画冻结协同，AC-4/r12 零回归）
- 定位：把 PRD r13（消行动画缓动）落实为**与文件边界对齐**的接口契约、状态模型、实现要点、边界处理、测试策略与任务拆分。
- 交付物：`game.js`（clearing 子阶段）+ `ui.js`（霓虹脉冲渲染 + 轨装配）+ `scripts/verify-game.cjs` + `scripts/verify-ui.cjs` + `scripts/qa-e2e-jsdom.cjs`。**零改动**：`audio.js` / `persist.js` / `style.css` / `index.html` / `verify-audio.cjs` / `verify-persist.cjs` / `verify-constants.cjs` / `assembly-check.cjs`（七套中后四套原样全绿）。

---

## 1. 总体架构与数据流

**一句话**：`game.js` 在 lockFlow 内新增「clearing 子阶段」——把既有「塌缩→计分→升级→spawn→碰撞」原子步整体后移 T=240ms，期间引擎持有**唯一时钟与唯一可变状态**（`state.clearing`），每帧 `tick(dt)` 推进动画进度并 `emit()` 快照；`ui.js` 从快照**纯派生**绘制霓虹脉冲（无自有计时器），暂停冻结/恢复续播天然成立。

```
玩家动作（硬降/软降/tick 锁定缓冲到期）
  ▼
lockFlow()：merge(board,piece) → clearLines() 预计算 res
  ├─ cleared=0 或 animMs=0 → 既有原子步 原样执行（零变化，AC-2/AC-7 即时等价）
  └─ cleared≥1 且 animMs>0 → 进入 clearing 子阶段：
       state.board = merged（含满行棋盘，视觉静止）
       state.clearing = { indices, elapsed:0, res }   ← 引擎唯一动画状态
       sfx('clear')                                    ← 动画开始帧恰 1 次（AC-3）
       emit()                                          ← 首帧快照 clearedIndices + animProgress=0
       return { ok:true, locked:true, cleared:N, levelUp:false, gameOver:false }  ← 入口返回值（见 §2.3）
  ▼
tick(dt)（rAF 差值时钟逐帧调用）：
  ├─ 非 RUNNING → return（pause/resume 既有机制不变）
  ├─ state.clearing → advanceClearing(dt)：elapsed += dt(clamp≤250，E7/E8 同语义)
  │     elapsed < animMs → emit()（进度帧，animProgress=elapsed/animMs）
  │     elapsed ≥ animMs → completeClearing()（原子步整体执行：塌缩→计分/行数/升级→
  │                                          spawn→碰撞判定→emit→onLevelUp/sfx('levelUp')→onGameOver/sfx('gameOver')，顺序与现状一致）
  │     ↑ 下落时钟冻结：dt 不进 gravityAcc/lockTimer（AC-5）
  └─ 无 clearing → 既有重力/锁定缓冲路径原样
  ▼
ui.js renderAll(s)：快照含 clearedIndices → 霓虹脉冲帧；否则白闪反推路径（即时路径保留）
```

**状态机**：对外 `phase` 枚举（READY/RUNNING/PAUSED/OVER）与 UMD 契约**零改动**（AC-10）——动画期 `getPhase()===RUNNING`，`piece===null`（锁定后未 spawn，幽灵块/活动块按既有条件自然不绘，AC-8）；`clearing` 是引擎内部子阶段，仅存在于 `state` 与快照附加字段。

**数据流方向不变**：引擎是唯一可变状态与权威时钟；ui.js 只读快照渲染 + 装配期把 `animMs` 注入引擎；persist 零参与（PRD §3 不做设置项）。

---

## 2. 数据模型与契约

### 2.1 引擎新增构造入参（AC-9，正规配置项，非测试后门）

```js
// game.js createGame 顶部解析：
const animMs = typeof opts.animMs === 'number' && opts.animMs >= 0 ? opts.animMs : 240
// 默认 240（容差 160~320）；0 = 即时消除（与 reduced-motion 等价，AC-7）；
// 强制布尔/负值兜底为默认值（对齐 wallKickEnabled 的 opts 解析风格）。
```

### 2.2 会话私有状态（clearing 子阶段，唯一新增可变点）

```js
// state 对象新增（初始 null；仅 RUNNING 下 clearing 子阶段存在）：
clearing: null | {
  indices: number[],  // 被消行索引（clearLines 返回的 res.indices 精确值，1~4 项）
  elapsed: 0,         // 已播时长 ms（tick 驱动）
  res: { board, cleared, indices },  // clearLines(merged) 的预计算结果；board = 塌缩后棋盘
}
```

- 生命周期：仅在 `lockFlow` 中创建；推进于 `advanceClearing`；完结于 `completeClearing`（置 null）；**被 `restart()` / `lose()` 强制清空**（AC-6「OVER 后动画状态清空」+ restart 防御）；`togglePause()→PAUSED→resume()→RUNNING` **保留不清空**（进度冻结续播，AC-4）——暂停若清空则续播无从谈起。
- 动画期 `state.board = merged`（含满行棋盘）：这是「被消行不立即消失」的几何事实来源，与 UI 无关（AC-1「动画期棋盘=锁定后含满行」）。

### 2.3 快照附加字段（AC-10，additive，无接口重签名）

```js
// snapshot() 返回对象新增两个字段（既有无字段的消费方 JSON.stringify 对比不受影响）：
clearedIndices: state.clearing ? state.clearing.indices.slice() : null,
animProgress:   state.clearing ? Math.min(1, state.clearing.elapsed / animMs) : null,
```

- 动画期：`clearedIndices` 非空、`animProgress ∈ [0,1]` 逐帧变化；棋盘为含满行棋盘；`piece===null`。
- 完结帧：clearedIndices===null（塌缩已发生）、board 为塌缩后棋盘、spawn 后 piece 非空（或 OVER）。
- 暂停帧：快照携带冻结进度（clearedIndices 仍在、animProgress 定格）→ ui.js 冻帧零额外逻辑（AC-10 细化）。

### 2.4 接口返回契约（输入忽略，AC-4）

动画期间 move/rotate/softDrop/hardDrop 在 phase 守卫后**追加 clearing 守卫**：

```js
if (state.clearing) return { ok: false, reason: 'clearing' }
// 不排队、不缓冲、不产生动作事件、不发 sfx（对齐 AC-09.3「被拒不发射」）
// reason 为新枚举值，仅内部消费（keyboard handler 忽略返回值、ui.js 不读），UMD 签名不变。
```

**lockFlow 入口返回值语义（行为说明）**：当动画接管时，入口即返回 `{ ok:true, locked:true, cleared:N, levelUp:false, gameOver:false }`——`levelUp/gameOver` 为**完成时**才确定的结果，入口无法预知（出生碰撞在塌缩后判定，AC-6）。消费方影响：ui.js 键盘路径不读返回值（已核），既有 E2E/verify 的消行断言均在 animMs=0（§6）下运行 → 返回值断言不变。真正的结果经既有 `onSnapshot / onLevelUp / onGameOver / onSfx` 出口播报，通道不变。

### 2.5 存储

**persist.js 零改动**：不新增设置键（PRD §3「不做」消行动画开关）；`tetris.wallKickEnabled` 等既有键原样。

---

## 3. API 设计

### 3.1 game.js — createGame 选项（新增 1 项，其余不变）

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `animMs` | number ≥ 0 | 240 | 动画时长 ms；0 = 即时消除（与现状逐点等价，AC-7）；160~320 为验收容差（AC-1） |

会话 API **不新增方法**（无 setter/开关——PRD 不做动画开关；`animMs` 仅构造期注入，供确定性单测与装配）。

### 3.2 ui.js — 常量与纯函数（新区块，单一事实来源，供 QA 数值断言）

模块顶层（与既有 `GHOST` 常量同区、同注释规范；createBoardRenderer 闭包引用同一常量）：

```js
const ANIM_MS = 240      // 动画时长（AC-1，容差 160~320；引擎 createGame 默认值同源）
const ANIM_PEAK = 1.25   // 峰值乘性亮度（AC-1，下限 1.2）
const ANIM_PEAK_T = 0.40 // 峰值到达点（占 T）；渐亮段 ease-out-quart
// 亮度函数（AC-1/AC-9 数值断言锚点，纯函数导出）：
function pulseBrightness(p) {            // p = animProgress ∈ [0,1] → B ∈ [0,1.25]
  if (p <= 0) return 1                    // 首帧原亮度（无叠加，等于静态绘制）
  if (p <= ANIM_PEAK_T) {                 // 渐亮：ease-out-quart，帧增量单调递减（可断言）
    const u = p / ANIM_PEAK_T
    const e = 1 - Math.pow(1 - u, 4)
    return 1 + (ANIM_PEAK - 1) * e        // 1 → 1.25
  }
  const w = (p - ANIM_PEAK_T) / (1 - ANIM_PEAK_T)
  return ANIM_PEAK * (1 - Math.pow(w, 4)) // 淡出：ease-in-quart 先慢后快 → 0（结束帧 B=0，AC-6）
}
```

导出：`TetrisUI` 命名空间新增 `ANIM_MS / ANIM_PEAK / ANIM_PEAK_T / pulseBrightness`（同 `GHOST` 导出方式，Node 可断言）。包络归属 ui.js（DESIGN 定位）；引擎侧不导出常量，verify-game 以行为断言（默认 >0 → 消行进入 clearing）。

### 3.3 ui.js — createUI 选项（透传 animMs + reduced-motion 降级，AC-7）

```js
// createUI(options) 新增解析（装配期，模块顶层 helper）：
function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
// 注入 createGame 时：
animMs: opts.animMs !== undefined ? opts.animMs : (prefersReducedMotion() ? 0 : ANIM_MS)
```

- 优先级：显式 `opts.animMs` > reduced-motion 检测 > 默认 240。E2E 传 `animMs: 0` 即绕过 matchMedia（jsdom 无 matchMedia 亦安全——`typeof matchMedia` 守卫）。
- `boardRenderer.render(s, fx, ghostEnabled)` 签名**不变**；`fx` 对象扩展 `anim` 分支（见 §4.2），旧 `flashLines` 分支原样。

### 3.4 零改动文件

`audio.js`（sfx 事件出口不变，clear 发声职责不变）、`persist.js`、`style.css`、`index.html`、`verify-audio/verify-persist/verify-constants/assembly-check.cjs`。

---

## 4. 关键实现要点

### 4.1 引擎（game.js）——lockFlow 拆分 + tick 守卫重排

1. **lockFlow 前置分支**（唯一行为变更点，逻辑零重复）：

```js
function lockFlow() {
  const merged = merge(state.board, state.piece)
  const res = clearLines(merged)          // 预计算，入库供完结复用（AC-2 等价性来源）
  state.piece = null
  state.lockTimer = 0
  state.gravityAcc = 0
  if (res.cleared > 0 && animMs > 0) {    // → clearing 子阶段
    state.board = merged                  // 保持含满行棋盘
    state.clearing = { indices: res.indices, elapsed: 0, res: res }
    sfx('clear')                          // 动画开始帧恰 1 次（AC-3；2/3/4 行均 1 次，回归 AC-09.2）
    emit()                                // 首帧快照 animProgress=0
    return { ok: true, locked: true, cleared: res.cleared, levelUp: false, gameOver: false }
  }
  // —— 既有原子步原样（cleared=0 或 animMs=0 与现状逐点等价）——
  state.board = res.board
  ...（原 lockFlow 身体：计分/行数/升级 → sfx('clear') → spawn → collide → emit → onLevelUp/sfx('levelUp') → onGameOver/sfx('gameOver') 原顺序原逻辑）
}
```

2. **completeClearing 原子步**：与上述原原子步**同一份逻辑**（提取 `finishLock(res.board, res.cleared)` 共享闭包函数供两路径复用，杜绝双份维护引入漂移）；差异仅一处——动画路径下 `sfx('clear')` **不在完结帧再次发射**（已在动画首帧发过，恰好 1 次）。顺序保持 E-SFX-04/05：`hardDrop → clear(首帧) → levelUp → gameOver`（事件次序不变，仅 clear 提前 T 拍）。
3. **tick 守卫重排**（关键：动画期 `piece===null`，原 `!state.piece` 早退必须让位）：

```js
function tick(dtMs) {
  if (disposed || state.phase !== 'RUNNING') return
  const dt = dtMs < 0 ? 0 : dtMs > DT_CLAMP_MS ? DT_CLAMP_MS : dtMs   // E7/E8 钳制同语义
  if (state.clearing) { state.clearing.elapsed += dt; if (state.clearing.elapsed >= animMs) completeClearing(); else emit(); return }
  if (!state.piece) return
  ... 既有重力/锁定缓冲（dt 只进 gravityAcc/lockTimer，动画期未达此处 → 时钟冻结，AC-5）...
}
```

4. **clearing 残留清理**：`restart()`（任意态→RUNNING）与 `lose()`（RUNNING→OVER）执行 `state.clearing = null`（AC-6 无残留亮度帧；防宿主异常调用留脏）。`togglePause` 不动 clearing。

### 4.2 渲染（ui.js）——霓虹脉冲 + 白闪取代点（实现红线）

1. **renderAll(s) 三分支分发**（基于既有 `prevSnapshot` 状态，无计时器、无新状态机）：

```js
const isClearing    = s.clearedIndices !== null
const justFinished  = !isClearing && prevSnapshot !== null && prevSnapshot.clearedIndices !== null
let fx = undefined
if (isClearing) fx = { anim: { indices: s.clearedIndices, progress: s.animProgress } }
else if (!justFinished) { const fl = flashIndicesFor(s); if (fl) fx = { flashLines: fl } }
boardRenderer.render(s, fx, ghostEnabled)
```

- isClearing → 动画帧（含 PAUSED 冻结帧：progress 定格，自动冻帧 AC-4）。
- justFinished（完结帧：塌缩+计分已发生）→ **抑制白闪**（`fx=undefined`）——取代点，防「脉冲+事后闪」双重反馈（DESIGN §4.3；PRD AC-1/AC-8 观感）。
- 两者皆非 → 既有 `flashIndicesFor` 反推白闪原样（**即时路径保留白闪 = 现状等价**，AC-7；animMs=0 时快照永无 clearedIndices，此分支恒走老路）。

2. **boardRenderer.render 的 anim 分支**（每被消格 ≤2 基元，AC-8）：

```js
if (fx && fx.anim) {
  const B = pulseBrightness(fx.anim.progress)
  for (const row of fx.anim.indices) {
    if (row < 0 || row >= ROWS) continue
    for (let col = 0; col < COLS; col++) {
      if (!s.board[row][col]) continue
      if (B >= 1) {
        drawCell(s.board[row][col], col * CELL, row * CELL)                       // 基元1：烘焙 sprite 原样
        if (B > 1) { ctx.globalAlpha = (B - 1) / (ANIM_PEAK - 1); fillCellWhite(col, row); ctx.globalAlpha = 1 } // 基元2：白热叠加 ∝ 亮度增量
      } else {
        ctx.globalAlpha = B; drawCell(s.board[row][col], col * CELL, row * CELL); ctx.globalAlpha = 1  // 淡出：整体渐隐至 0
      }
    }
  }
}
```

- 静态遍历（`row===animation rows` 跳过）由 anim 分支接管被消行绘制；其余行照旧 `drawCell`（**未消除行逐像素不变**，AC-1——整板重绘策略天然满足，DESIGN §7 双策略选一，建议整板重绘与 `renderAll` 一致）。
- 幽灵块/活动块绘制已在 `s.piece` 条件内（动画期 piece=null 不绘，AC-8）；`flash` 旧机制保留仅服务即时路径。
- 色相保持：只提亮/渐隐，不换色（DESIGN §5.2）；结束帧 B=0 后紧接塌缩帧，无视觉跳变。

### 4.3 assembly（createUI）——matchMedia + animMs 注入

按 §3.3：`animMs: opts.animMs !== undefined ? opts.animMs : (prefersReducedMotion() ? 0 : ANIM_MS)` 注入 createGame 选项；E2E 传 `animMs: 0` 保持既有 237 断言逐字节等价。**装配时序**：在 createGame 调用处直接注入（无需像 wallKick 那样的事后同步——animMs 是构造期只读参数，无运行期漂移面）。

---

## 5. 边界与异常（关键用例推演）

| # | 场景 | 行为 | 锚定 |
|---|---|---|---|
| E1 | `cleared=0` 锁定 | 零动画，原子步原样（含白闪反推不触发——lines 未增） | AC-1/AC-2 |
| E2 | 动画期输入（左/右/软降/硬降/旋转） | 全部 `{ok:false,reason:'clearing'}`，不排队不发声 | AC-4 |
| E3 | 动画期 P/空格暂停 | togglePause 正常（RUNNING→PAUSED），快照冻结 animProgress；恢复续播（elapsed 在引擎内保留） | AC-4 |
| E4 | 动画期打开设置弹层（r12 自动暂停） | ui 层调 togglePause → 同上冻结；关弹层保持暂停；P/空格恢复续播；弹层内 ESC 仍仅关弹层（r12 既有 stopPropagation 逻辑零改动） | AC-4/r12 |
| E5 | 动画期多步 tick | dt 全进动画进度，gravityAcc/lockTimer 恒 0；完结后 gravityAcc=0 重新计时，新块不会首帧连降/积压下落（AC-5） | AC-5 |
| E6 | 动画完结 spawn 出生碰撞 | 动画完整播放（elapsed≥animMs）后才走 crash 分支：emit(OVER) + onLevelUp(若有) + onGameOver + sfx('gameOver')；`state.clearing=null` 无残留 | AC-6 |
| E7 | animMs=0 或 reduced-motion | lockFlow 直接走既有原子步；快照永无 clearedIndices；白闪原样；与即时基线逐点等价（棋盘/计分/行数/等级/音效次数/状态序列） | AC-7 |
| E8 | 完结帧白闪抑制 | justFinished 一帧 fx=undefined（不叠白闪）；下一快照恢复正常反推（二次消行前 prevSnapshot 已无 clearedIndices） | DESIGN §4.3 |
| E9 | 动画期 restart/lose（防御） | 强制 `state.clearing=null`；restart 后快照无残留字段（ui 端 justFinished 误判一帧、无 flash——无害，可接受） | AC-6/§2.2 |
| E10 | 暂停拍快照→恢复 | 暂停快照 animProgress 定格存留；恢复后 elapsed 连续递增续播（快照派生，无跳帧） | AC-10 |
| E11 | 一次 big dt（失焦切回） | 动画 dt 沿用 clamp≤250（E7/E8 语义），不跳段；visibility/b･lur 自动暂停先于 tick 生效（既有 autoPauseOnBlur） | E7/E8 |
| E12 | 相邻两次消行 | 循环内不可能重叠（二次消行需先完成 spawn+锁定，prevSnapshot 已刷新） | — |

---

## 6. 测试策略

### 6.1 既有单测迁移（零断言的机械适配，PRD AC-9 回归底线）

- **verify-game.cjs**：新增本地工厂 `mk(opts) = T.createGame(Object.assign({ autoLoop:false, keyboard:false, autoPauseOnBlur:false, animMs:0 }, opts))`，全部既有 `T.createGame(...)` 调用点迁移为 `mk(...)`（~15 处，纯机械）。效果：所有既有消行/计分/音效序列断言（含 E-SFX-04 `hardDrop→clear→levelUp` 同栈断言、锁定缓冲/重力/暂停用例）**保持原样逐字全绿**——0ms 是正规配置项，非测试后门。
- **qa-e2e-jsdom.cjs**：`buildEnv` 的 createUI 调用增加 `animMs: 0` → 既有 237 断言（含 v3.0/v3.0.1 弹层段）逐字节等价零回归。

### 6.2 verify-game 新增消行动画用例组（AC-9，animMs:240 + tick 步进）

| 用例 | 构造 | 断言 |
|---|---|---|
| ① 动画期棋盘 | setBoard 装 1 行满 → hardDrop 触发 clearing | 快照 `clearedIndices` 长度=1、`animProgress∈(0,1)`、board=锁定后含满行棋盘、未消行逐格不变、phase=RUNNING、piece=null、score/lines 未变 |
| ② 输入忽略 | 动画期调 move/rotate/softDrop/hardDrop | 均 `{ok:false,reason:'clearing'}`，棋盘与快照零变化 |
| ③ 动画结束原子步 | 续 tick（累计≥240，分 120+120 步进） | 塌缩=clearLines(merged) 逐格一致；score/lines/level 按公式；`sfx('clear')` 恰 1 次且发生在**动画首帧**（事件序列 hardDrop→clear→levelUp）；spawn 完成（piece 非空、next 更新恰 1 次） |
| ④ 0ms 等价 | 同一输入脚本 animMs:0 vs animMs:240（步进完） | 快照（board/score/lines/level/next/piece）深比较逐点相等；音效次数相等 |
| ⑤ 时钟冻结 | 动画期 tick 多步（如 3×200） | gravityAcc 不累计（完结后新块首 tick 不立即下坠、无连降；续 tick 按等级间隔正常步进） |
| ⑥ 暂停冻结/续播 | 动画中途 togglePause → 断言快照 animProgress 定格 → resume → tick | 恢复后进度从冻结点续播、无跳帧（AC-4） |
| ⑦ OVER 顺序 | 装盘使塌缩后出生碰撞 | 动画先完整播放（≥1 帧 progress 变化）→ 完结帧 phase=OVER、clearedIndices=null、no 残留；onGameOver/sfx('gameOver') 于完结帧 |
| ⑧ 默认值 | `createGame()` 无 animMs | 消行默认进入 clearing（行为证明默认 240>0） |

### 6.3 verify-ui 新增包络断言（AC-1/AC-9 数值锚点）

- `ANIM_MS===240`、`ANIM_PEAK===1.25`、`ANIM_PEAK_T===0.40`；`pulseBrightness(0)===1`、`pulseBrightness(1)===0`、峰值 `pulseBrightness(0.4)>=1.2`、`B∈[0,1.25]`；
- 渐亮段离散采样帧增量**单调递减**（0→0.4 取 N=16 点，相邻差递减，ease-out-quart 可判据）；淡出段单调不升。

### 6.4 qa-e2e 新增消行动画段（AC-9，绕过 jsdom 时序）

- 位置：既有全部段之后（先 `handle.dispose()` 清理第一实例），新建独立 `createUI({ autoLoop:false, rng:0, sfxEngine:spy2, animMs:240 })`（同文档、jsdom canvas 桩，无真实视觉）：
  1. `_debug.setBoard` 装 4 行满 + `_debug.setPiece` 竖 I → `key(' ')` 或 `game.hardDrop()` 触发锁定；
  2. 断言 `snap().clearedIndices` 长度=4、`animProgress===0`、board 行仍满（动画进度可见）、phase RUNNING、spy `clear` 1 次；
  3. `game.tick(120)` → `animProgress∈(0.4,0.6)`、piece=null、score 冻结；
  4. `game.tick(130)` → 完结：board 塌缩（行下移）、score/lines 更新、piece 非空；spy `clear` 仍恰 1 次；
  5. （可选，r12 协同）动画中途 `key('p')` → PAUSED 且 animProgress 定格 → `key(' ')` → 续播至完结。
- 出口：七套全绿（verify-game/verify-audio/verify-ui/verify-persist/verify-constants/assembly-check/qa-e2e-jsdom），既有 237 断言零回归，新段断言追加计入总数。

---

## 7. 任务拆分（文件边界对齐，可并行）

**git 约束（PRD §8 工程约束）**：从**最新 main（含 769a50c）**切 `feat/lineclear-easing`；本任务夹产物随阶段提交（首批即含已落盘的 PRD.md/DESIGN.md/本文件）；提交粒度 = 按下面任务分批 commit，每批边界干净，**不夹带既有代码漂移**；全程不改 UMD 契约与 VERSION。

| # | 任务 | 文件 | 依赖 | 并行性 | 验收要点 |
|---|---|---|---|---|---|
| T1 | 引擎 clearing 子阶段 + animMs + 快照字段 + 输入守卫 + tick 重排 + restart/lose 清场 | `/game.js` | — | 与 T2 并行（契约即本文 §2/§3.1） | 单跑 verify-game 现有用例走 mk() 前仍绿（以行为回归为准）；T3 迁移完成后全绿 |
| T2 | ui.js 霓虹脉冲渲染 + 白闪取代点 + matchMedia/animMs 装配 + 常量/纯函数导出 | `/ui.js` | 契约 §2.3/§3.2/§3.3 | 与 T1 并行 | verify-ui 新增包络断言绿；E2E 适配后既有 237 绿 |
| T3 | verify-game：mk() 迁移 + 动画用例组 ①~⑧ | `/scripts/verify-game.cjs` | T1 | 与 T2/T4/T5 并行 | `node scripts/verify-game.cjs` 全绿 |
| T4 | verify-ui：ANIM_*/pulseBrightness 包络断言 | `/scripts/verify-ui.cjs` | T2 | 并行 | `node scripts/verify-ui.cjs` 全绿 |
| T5 | qa-e2e：buildEnv animMs:0 适配 + 消行动画新段（含可选 r12 协同） | `/scripts/qa-e2e-jsdom.cjs` | T1+T2 | 与 T3/T4 并行 | `node scripts/qa-e2e-jsdom.cjs` 全绿（237 零回归 + 新段） |
| T6 | 集成门禁：七套全绿 + 人工补测清单过一遍 | 全部 | T1~T5 | 串行收口 | 七套全绿、AC-1~10 对照验收 |

**人工补测清单（QA 阶段，DESIGN §8-5）**：缓动视觉观感（渐亮→过曝→熄灭）、暂停冻结/续播、设置弹层自动暂停协同（r12）、reduced-motion 降级（浏览器 DevTools 模拟）、动画期 FPS≥55。

---

## 8. 风险与对策（增量，其余见 PRD §6）

| 风险 | 对策 |
|---|---|
| 既有消行断言被默认 240ms 撕碎 | §6.1：mk()/E2E 统一 animMs:0 基线，既有断言逐字节不动；动画语义只在新用例组断言 |
| 完结帧双重反馈（脉冲+白闪）漏判 | §4.2 三分支分发 + justFinished 抑制；QA 人工补测视觉项 |
| tg 两路径逻辑双份维护漂移 | §4.1-2：finishLock 单份共享闭包，两路径只差 `sfx('clear')` 时机 |
| lockFlow 入口返回值契约变化被消费方误读 | §2.4 明示 levelUp/gameOver 为完成时结果；既有消费方已核不读返回值；新段只经快照断言 |
| 动画期意外 phase 转移残留 clearing | E9：restart/lose 强制清空 + 完结置 null，双保险 |

<!-- blueprint -->{"summary":"消行动画=引擎持有 clearing 子阶段（唯一时钟/状态）+ ui 纯派生渲染：既有原子步整体后移 T=240ms，快照附加 clearedIndices/animProgress（AC-10 additive），暂停冻结/续播/白闪取代/即时等价全部经由「引擎驱动进度 + UI 无自有计时器」单一机制实现","modules":{"/game.js":{"responsibility":"clearing 子阶段：lockFlow 拆分（动画接管 vs 即时原子步）、animMs 构造选项、tick 守卫重排（动画期推进进度+时钟冻结）、快照附加字段、输入 clearing 守卫、restart/lose 清场","dependsOn":["既有 clearLines/scoreForLines/spawn/spawnCollides/transition（全部复用，零重写）"],"assemblyOrder":1,"why":"引擎是唯一可变状态与权威时钟：进度放引擎才能让暂停冻结/恢复续播天然成立（AC-4/AC-10），UI 渲染彻底纯派生、无自有计时器（区别于旧白闪的 performance.now 机制）"},"/ui.js":{"responsibility":"霓虹脉冲渲染（ANIM_*/pulseBrightness 纯函数导出）、renderAll 三分支分发（动画帧/完结抑制帧/既有白闪反推）、createUI 透传 animMs + matchMedia reduced-motion 降级","dependsOn":["engine 快照新字段（clearedIndices/animProgress）、TetrisGame.merge/clearLines（即时路径反推保留）"],"assemblyOrder":2,"why":"渲染与反馈是 UI 职责；取代点（动画路径抑制白闪、即时路径保留白闪）收敛在 ui.js 分发逻辑，引擎零渲染知识；常量导出（同 GHOST 先例）使包络可 Node 数值断言"},"/scripts/verify-game.cjs":{"responsibility":"mk() 工厂迁移既有实例为 animMs:0 基线 + 新增动画用例组①~⑧（棋盘静止/输入忽略/结束等价/0ms等价/时钟冻结/暂停续播/OVER顺序/默认值）","dependsOn":["/game.js 契约"],"assemblyOrder":3,"why":"引擎行为断言在无 DOM 的 node:test 中确定性步进（tick 驱动），0ms 作为正规配置项保住既有回归底线"},"/scripts/verify-ui.cjs":{"responsibility":"ANIM_MS/ANIM_PEAK/ANIM_PEAK_T 常量断言 + pulseBrightness 包络数值断言（峰值/端点/渐亮帧增量单调递减）","dependsOn":["/ui.js 导出"],"assemblyOrder":4,"why":"包络规格（AC-1 可断言范围）单一事实来源在 ui.js，verify-ui 钉死数值防漂移"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"buildEnv createUI 注入 animMs:0 保既有 237 断言等价 + 新增消行动画段（独立 createUI animMs:240：消行→进度可见→塌缩→新块，可选 r12 暂停协同）","dependsOn":["/game.js + /ui.js 契约"],"assemblyOrder":5,"why":"E2E 全链路（真实 index.html + UMD 注入）绕 jsdom 时序坑：动画语义用 tick 步进断言快照字段与音效计数，不做逐帧像素判定"},"duplications":["白闪反推 flashIndicesFor 与引擎 clearedIndices 并存——刻意双路径（即时路径保留反推=现状等价；动画路径用引擎精确值），ui.js 分发逻辑保证互斥，无漂移","动画包络 pulseBrightness 与既有 FLASH_* 属同一反馈层——取代点红线：动画路径抑制、即时路径保留，防双重反馈","lockFlow 两路径共享 finishLock 闭包（唯一实现，只差 sfx('clear') 时机），防止双份维护漂移"]},"tasks":[{"title":"T1 引擎 clearing 子阶段（game.js）","files":["/game.js"],"spec":"lockFlow 拆分+animMs 选项+clearing 状态+快照附加字段+输入守卫+tick 重排+restart/lose 清场，零重写既有函数"},{"title":"T2 ui.js 脉冲渲染与装配","files":["/ui.js"],"spec":"ANIM_*/pulseBrightness 导出、anim 分支绘制（≤2 基元/格）、renderAll 三分支分发（动画/抑制/白闪）、matchMedia→animMs 透传"},{"title":"T3 verify-game 动画用例组","files":["/scripts/verify-game.cjs"],"spec":"mk() 迁移 animMs:0 基线 + 新增用例①~⑧（tick 步进确定性断言）"},{"title":"T4 verify-ui 包络断言","files":["/scripts/verify-ui.cjs"],"spec":"ANIM_* 常量值与 pulseBrightness 端点/峰值/渐亮帧增量单调递减断言"},{"title":"T5 qa-e2e 适配与新段","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"buildEnv animMs:0 保 237 断言 + 新增消行动画段（独立实例步进断言 + 可选 r12 暂停协同）"},{"title":"T6 集成门禁","files":["/game.js","/ui.js","/scripts/verify-game.cjs","/scripts/verify-ui.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"七套全绿 + AC-1~10 逐条 + 人工补测清单收口"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r13 TECHNICAL 收口：clearing 子阶段=引擎唯一时钟/状态（lockFlow 拆分：cleared=0 或 animMs=0 走既有原子步零变化；动画路径保持含满行棋盘+sfx('clear')首帧恰1次+入口返回值 levelUp/gameOver=完成时语义）；快照additive字段 clearedIndices/animProgress；tick 重排（动画期 dt 进进度、gravity 冻结）；输入返回新 reason 'clearing'；restart/lose 清场；ui.js 导出 ANIM_MS=240/ANIM_PEAK=1.25/ANIM_PEAK_T=0.40/pulseBrightness（ease-out-quart 渐亮 1→1.25→ease-in 0），renderAll 三分支（动画帧/完结抑制白闪 justFinished/既有白闪保留），createUI 透传 animMs+matchMedia 降级；测试：verify-game mk() 迁移 animMs:0 保既有断言+新增用例①~⑧（tick 步进）；verify-ui 包络断言；qa-e2e buildEnv animMs:0 保 237+新消行动画段；七套出口；git：main(含769a50c)→feat/lineclear-easing，按 T1~T6 分批提交不夹带漂移","memory":["closing 子阶段：state.clearing={indices,elapsed,res}，progress=elapsed/animMs，引擎唯一动画时钟；暂停(PAUSED)保留 clearing、restart/lose 清空","动画期 board=merged(含满行)，完结用 clearLines 预计算结果 res.board 塌缩→AC-2 逐格等价唯一来源；score/lines/level 完结帧更新，sfx('clear') 动画首帧恰1次","输入守卫 reason='clearing'（内部枚举，UMD 签名不变）；lockFlow 入口返回值 levelUp/gameOver 改为完成时语义（入口恒 false），消费方已核不读返回值","ui 三分支分发：isClearing→anim 帧；justFinished(prevSnapshot.clearedIndices 非空且当前空)→fx=undefined 抑制白闪（取代点）；否则 flashIndicesFor 白闪保留（即时路径=现状等价）","pulseBrightness：B(0)=1，渐亮 1+0.25·easeOutQuart(p/0.4)→1.25，淡出 1.25·(1-w^4)→0（w=(p-0.4)/0.6）；导出 ANIM_MS/ANIM_PEAK/ANIM_PEAK_T 供 verify-ui 断言","verify-game 新增 mk() 工厂统一的 animMs:0 迁移（~15 调用点机械适配，既有消行/音效序列断言逐字保留）；新用例组①~⑧ tick 步进；qa-e2e buildEnv 加 animMs:0，新消行动画段独立 createUI(animMs:240) 在 handle.dispose() 后","契约不变：UMD/VERSION/phase 枚举/persist 零改动/audio/style/index 零改动；七套全绿=出口；分支 feat/lineclear-easing 基于含 769a50c 的 main"]}<!-- /state -->