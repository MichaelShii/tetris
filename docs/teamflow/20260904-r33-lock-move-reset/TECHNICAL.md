# r33 方块锁定前的最后一次移动保护（lock move reset）TECHNICAL

<!-- 基线依赖：docs/teamflow/20260903-r32-stats-panel（承继 r18 T-spin 窗口判据与 lockTimer 锁定路径、r20/r23 combo/B2B 链迁移、r30/r31 触控=键盘回放器与自定义按键）；需求正文见同夹 PRD.md（AC 编号以 PRD 为准） -->
<!-- 取代：活文档 PRD AC-03.5「触底后 ≤500ms 固定」措辞修订为「触底后 500ms 固定，缓冲期间每次成功移动/旋转重置至满额、每方块至多 15 次」；本需求为 game.js 单文件行为变更 + 断言/文档追加，前端（ui/audio/persist/style）0 行、VERSION 不动 -->

## §0 技术方案结论速览

- **数据面（game.js 单文件行为变更 + 追加）**：顶部新增常量 `LOCK_MOVE_RESET_MAX = 15`（紧随 `LOCK_DELAY_MS`，PRD §5 单一事实来源）并导出；会话闭包新增 `lockMoveResetsRemaining`（预算=剩余重置次数，per-piece 会话内存，风格对齐 comboChain/piecesPlaced）；`move()`/`rotate()`（原地与 kick 两分支）成功路径：触底成功且预算>0 → `lockTimer = 0`（重置至满额=重新计满 500ms）+ 预算 −1；悬空成功沿用既有 `lockTimer = 0` 清零路径 + 预算 −1（"含悬空清零动作"）；预算耗尽（0）后触底成功动作**不再重置**、计数封底不再减；被拒不重置不发声不耗预算。**预算在每次方块出生时重置为 15**（spawnFirst / finishLock 自然出生 / hold 两分支——PRD「出生（spawnFirst）」括号的精确化：所有 spawn 出生点同口径，防「自然锁→新块继承耗尽预算」）。
- **断言锚点（不选快照字段）**：新增 `api._debug.getLockMoveResetsRemaining()` 只读 getter——**绝不追加快照字段**，因 r32 §4.1-9 断言快照键集恰为「16 既有键 + piecesPlaced/sessionTimeMs」（无缺失、无多余），追加速度三字段即破既有断言、违反「旧断言零改动」红线；AC-9 明示「快照只读追加字段**或 debug 导出**」，取 debug 导出。
- **r18 §14 审计结论（AC-6/9）**：**审计引理**——所有既有锁定/时序用例的成功 move/rotate 均发生在 `lockTimer === 0` 时刻（`_debug.setBoard/setPiece` 构造后立即动作，或动作发生在悬空态）；`lockTimer=0 → 重置至满额` 为时间线恒等（仍是 0 起计满 500ms 锁定），预算消耗（15 起）不改变锁定时机/分数/事件序列 → **既有断言期望零改动**，逐组登记见 §4.1-8。唯一留验证复核：§14.6/§15.10/§16.10 soak（大量旋转/移动可能耗尽单块预算，其断言为数值一致性非锁定时机，预期仍绿）。
- **断言面（两脚本 §r33 纯追加）**：verify-game 新增 7 用例（常量/重置满额/被拒不重置不发声/上限 15/软硬降不变/per-piece 归零防钻空子/T-spin 交叉验证）+ §14 审计登记；qa-e2e 新增 §r33 小段（触底缓冲期按键重置、回放器等价、软硬降即时锁）。既有一切断言零改动。
- **前端零改动**：ui.js / audio.js / persist.js / style.css / index.html **0 行**；VERSION 三模块不动（verify-constants 原值 2.3.0 一致即绿）；无新音效事件、无新 token、无新 DOM。
- **红线复核**：game.js diff 收口于常量+/闭包+/move/rotate 成功分支+/4 处出生点+/导出+/_debug getter+；tick/lockFlow/softDrop/hardDrop/hold 判定逻辑零改动；memory.md 0 diff（行为变更+新常量非团队约定，迭代记录由任务夹承载）。

## §1 数据模型与存储

| 项 | 载体 | 说明 |
|---|---|---|
| 锁定缓冲时长 | 既有 `state.lockTimer` + 常量 `LOCK_DELAY_MS=500`（game.js L84） | 语义升级：触底后 500ms 固定（不变）；缓冲期成功移动/旋转重置至满额 = `state.lockTimer = 0` 重新计满（本次唯一行为变化点） |
| 重置预算 | 新会话闭包 `let lockMoveResetsRemaining = 0`（game.js L626~631 piecesPlaced 旁） | **per-piece 会话内存**：初始/每次出生重置为 `LOCK_MOVE_RESET_MAX`；触底成功动作或悬空清零动作各 −1（封底 0）；被拒/软降/硬降/重力 0；不随暂停/over 变化 |
| 数值单一事实来源 | 常量 `LOCK_MOVE_RESET_MAX = 15`（game.js 顶部，+导出） | 与 PRD §5 / verify-game §r33 断言三处一致（沿 LOCK_DELAY_MS 先例）；本期固定 15，**不引入配置/设置项**（PRD §3 非目标） |

**存储**：预算为会话内存，**不进 persist.js**（persist.js 0 行，PRD §3 非目标：无会话外记忆/设置项）。刷新即清零（既有先例：comboChain/b2bChain/piecesPlaced 同会话内存口径）。

**预算消耗口径表（单一语义契约，verify-game §r33 逐格断言）**：

| 动作 | 触底成功 | 悬空成功 | 被拒 | 预算消耗 |
|---|---|---|---|---|
| `move` 成功 | 预算>0 → `lockTimer=0` 重置满额；预算=0 → 不重置（缓冲按原速率续计至锁定） | `lockTimer=0`（既有清零路径） | 不重置不发声 | −1（含悬空清零动作） |
| `rotate` 成功（原地 / kick） | 同上 | 同上 | `wall-kick-denied` 不重置不发声 | −1（旋转+移动同一预算） |
| `softDrop` 成功下移（未触底） | — | `lockTimer=0`（既有路径，**不改**） | — | **0**（AC-5 明示不计入） |
| `softDrop` 触底 | `lockFlow()` 立即锁定（**不改**） | — | — | **0** |
| `hardDrop` | `lockFlow()` 立即锁定（**不改**） | — | — | **0** |
| 重力下移 / 自然触底缓冲 | `lockTimer += dt` 既有（**不改**） | — | — | **0**（内部非用户动作） |

## §2 引擎契约（game.js —— 单文件收口）

### 2.1 常量与导出（纯追加，2 处）

```js
// 顶部常量区（现 L84 `const LOCK_DELAY_MS = 500` 之后）
// 触底缓冲重置预算（r33，PRD §5/AC-3）：每方块至多 15 次成功移动/旋转重置（旋转+移动同一上限）；
// 随出生/hold 交换/restart 归零；被拒不计数；软降/硬降/重力不计数
const LOCK_MOVE_RESET_MAX = 15
```
模块导出（现 L1351 `LOCK_DELAY_MS` 旁）：`LOCK_MOVE_RESET_MAX: LOCK_MOVE_RESET_MAX,`——verify-game §r33 断言 `T.LOCK_MOVE_RESET_MAX === 15`。

### 2.2 会话闭包（1 处追加，对齐 r32 piecesPlaced 风格）

```js
// r33（AC-3/AC-4）：锁定重置预算剩余次数——per-piece 会话内存（每次出生重置为 LOCK_MOVE_RESET_MAX；
// 触底成功动作/悬空清零动作各 −1，封底 0；被拒不耗；软降/硬降/重力不耗；与 r32 计数同风格不入 state 对象）
let lockMoveResetsRemaining = 0
```

### 2.3 预算生命周期（出生点重置 —— 单一收口防漏）

预算**在每次方块出生时重置为 `LOCK_MOVE_RESET_MAX`**。出生点共 4 处（`restart`→`spawnFirst` 覆盖 restart 归零、「下一方块出生预算恢复 15」（PRD §4）即 finishLock 出生点）：

| 出生点 | 位置 | 说明 |
|---|---|---|
| `spawnFirst()` | L794 `const p = spawn(type)` | start（READY→RUNNING 防御性归零）与 restart 共用 |
| `finishLock()` 自然出生 | L767~768 `const p = spawn(type)` | 每次锁定后新块（PRD §4「下一方块出生预算恢复 15」） |
| `hold()` 暂存分支 | L977 `state.piece = spawn(nextType)` | 槽空：next→当前 |
| `hold()` 交换分支 | L982 `state.piece = spawn(heldType)` | 槽非空：换出块重新出生（AC-4「hold 换出方块 B → B 预算恢复 15」） |

实现：会话内小助手 `function resetLockMoveBudget() { lockMoveResetsRemaining = LOCK_MOVE_RESET_MAX }`，4 处 `spawn` 成功后各调用一次。**`spawn()` 纯函数本身零改动**（导出契约：Node 单测直接调用 `T.spawn`，掺入会话状态即破坏纯函数语义）。

> 对 PRD 措辞的精确化说明：「预算随出生（spawnFirst）、hold 交换、restart 归零」中 spawnFirst 为出生代表点；若只在 spawnFirst/hold/restart 归零而**漏掉 finishLock 自然出生**，则一局第二块起继承上一块耗尽预算——违反「每方块至多 15 次」与 §4「下一方块出生预算恢复 15」。故以「每次 spawn 出生重置」为统一口径（与 PRD 目标语义一致，防钻空子针对的是**同一方块**不补发，非跨方块）。

### 2.4 move() / rotate() 成功分支重置逻辑（本次唯一行为变更面）

`move()` 现 L872~877 成功段，替换 L874：

```js
state.piece = moved
tspinPending = false // r18（D-01/AC-1）...（原行不变）
// r33（AC-1/AC-3）：触底缓冲重置——触底态成功且预算>0 → 重置至满额（重新计满 LOCK_DELAY_MS）；
// 预算耗尽后不再重置（缓冲按原速率续计至 500ms 锁定，AC-3）；悬空成功沿用既有清零路径（AC-1）
if (isGrounded(state.board, state.piece)) {
  if (lockMoveResetsRemaining > 0) state.lockTimer = 0
} else {
  state.lockTimer = 0 // 悬空清零（既有路径逐字节保留）
}
if (lockMoveResetsRemaining > 0) lockMoveResetsRemaining-- // 含悬空清零动作（PRD §4「预算 −1（≤15，含悬空清零动作）」）
emit()
sfx('move')
return { ok: true }
```

`rotate()` 两成功分支（原地 L887~894、kick L904~910）做**同构替换**（各自 L890/L906 的 `if (!isGrounded(...)) state.lockTimer = 0` 三支化 + 预算 −1；`tspinPending = true` 置窗行位置/语义不变）。被拒路径（`blocked` / `wall-kick-denied` / 踢墙关闭）**零触碰**——自然满足 AC-2 不重置不发声不耗预算。

**零改动面（逐字节不动）**：`tick()` 重力步与缓冲累计（L1010~1050）、`lockFlow()`/`finishLock()`、`softDrop()`（L917~936）、`hardDrop()`（L938~953）、`hold()` 判定（L962~1002）、`tspinPending` 置/清时机、返回值语义、`DT_CLAMP_MS` 分片、`SFX_EVENTS`、combo/b2b 链迁移。

### 2.5 断言锚点（debug 只读 getter，不碰快照）

```js
// _debug 内追加（现 L1310~1318 setLines 之后）
getLockMoveResetsRemaining: function () { return lockMoveResetsRemaining },
```
**明确不选快照字段的理由**：r32 §4.1-9（verify-game L3286）断言 `Object.keys(snapshot).sort()` **恰等于** 16 既有键 + `['piecesPlaced','sessionTimeMs']`（"无缺失、无多余"）；追加第三字段即破坏该既有断言（违反红线）。AC-9 原文「快照只读追加字段或 debug 导出」二选一 → 取 debug 导出，锁定时序本身由快照 `piece`/`board` 观察（锁定=出生新块），无需新快照字段。

### 2.6 公共 API 面（返回值语义）

所有 play 动作（move/rotate/softDrop/hardDrop/hold）的 `{ok, reason, ...}` 返回值、锁定/碰撞语义、onSfx 事件序**零变化**（r33 只改 lockTimer 内部状态与预算计数，不新增/改变任何返回字段）。对外契约净增：导出常量 `LOCK_MOVE_RESET_MAX` + `_debug.getLockMoveResetsRemaining()`（测试钩子，非生产契约，沿 `_debug` 既有声明）。

## §3 状态管理与前端契约

- **状态管理**：引擎侧新增的预算为 `createGame` 闭包内 `let`（单一可变点，不进 `state` 对象）；生命周期与 combo/b2b/piecesPlaced 同口径（会话内存）。展示面**完全无需感知**预算（无 UI 指示器——PRD §3 非目标：无新 UI/设置项），由此 **index.html / style.css / ui.js / audio.js / persist.js 0 行**。
- **触控=键盘回放器（r30/r31）零逻辑改动**：`input()` → `actionInput` → 同一 `move()`/`rotate()` 路径，自动获得新语义（AC-7）；qa-e2e §r33 以 tp（touch replay）与 key（键盘）双驱动各跑一遍等价断言证明。
- **DAS/软降重复**：DAS 每次成功 repeat = 一次成功 move → 触底缓冲期连打逐一消耗预算（≤15 封顶，正是防「靠 DAS 无限拖延」的诉求）；`GAME_BIND_ACTIONS`/`DEFAULT_KEYBINDINGS` 零改动。

## §4 断言方案与测试策略（两脚本 §r33 纯追加；r24~r32 期望零改动）

### 4.1 verify-game §r33（引擎数据面；沿用 mk()/lockTick/tspinSession 既有工具，追加于 r32 段之后）

| 用例 | 断言要点 |
|---|---|
| **r33 §4.1-1 常量/导出/初始** | `T.LOCK_MOVE_RESET_MAX === 15`；新实例 start 后 `_debug.getLockMoveResetsRemaining() === 15`（READY=15，防御性）；出生即满额 |
| **r33 §4.1-2 AC-1 重置满额** | 触底（setPiece T@(3,18) 地板）→ `tick(250)`（lockTimer=250）→ `move(1)` 成功（触底、预算15）→ `tick(250)` **不锁**（被重置，累计仅 250）→ `tick(250)` 累计 500 锁定；旋转同构（原地旋转重置） |
| **r33 §4.1-3 AC-2 被拒不重置不发声** | 触底 → `tick(250)` → `move(-1)` `{ok:false,reason:'blocked'}` → `tick(250)` 累计 500 即锁（缓冲未重置、getter 不减）；旋转全拒 `wall-kick-denied` 同构；onSfx 序列无新增 move/rotate |
| **r33 §4.1-4 AC-3 上限 15（旋转+移动同一预算）** | 触底地板 → 旋转/移动混合 16 次：前 15 次 getter 15→0 且每次重置（**时序判别**：动作间各插 `tick(250)` 累积——若某次误不重置则提前锁定）；第 16 次后 getter=0 不重置（仅 `tick(250)×2` 即锁——若误重置需再 500ms） |
| **r33 §4.1-5 AC-5 软降/硬降不变** | 触底 → `softDrop()` 立即锁（getter 不变、软降触底不发 softDrop sfx 既有语义）；`hardDrop()` 立即锁（hardDrop 恰 1 次）——软/硬降均不耗预算、不走缓冲 |
| **r33 §4.1-6 AC-4 per-piece 归零/防钻空子** | 耗尽（16 动作）→ `hold()` 换出 → 新块 getter===15（AC-4 断言）；耗尽 → `move` 滑出边缘（悬空清零动作，getter 已 0 不减）→ 重力再落地 → getter 仍 0（**不补发**）；`restart()` → 15 |
| **r33 §4.1-7 AC-6/7 交叉验证** | 复用 `tspinSession`：旋转后满窗口仍判（score===100、tspin 载荷不变）+ `piecesPlaced` 恰 +1 + onSfx 序列不变（rotate 恰 1 次）；软降触底清窗不判（§14.2b E3 布景复用） |
| **r33 §4.1-8 r18 §14 审计登记（AC-6，注释+自证）** | 逐组登记：tspinSession 全家 / §14.2 正负 24 组 / §14.2b E3~E7+AC-4 / §14.8 E5~E6 严格判据 / §14.8c / E11（旋转落地经 lockTimer 锁定仍判）/ §15.x、§16.x tspin 段 / r32 §4.1-4 —— 均以「成功动作时刻 lockTimer=0 → 重置恒等 + 预算消耗不影响锁定时机/分数/事件」为登记理由，**期望零改动**；§14.6/§15.10/§16.10 soak 留验证期复核（断言数值一致性，非锁定时机） |

### 4.2 qa-e2e-jsdom §r33（DOM/回放层小段，jsdom 驱动）

1. **缓冲期按键重置（键鼠）**：`_debug.setBoard/setPiece` 触底 → `tick(250)` → `key('ArrowLeft')`（moveLeft 成功）→ `tick(250)` 未锁 → `tick(250)` 锁（对比无重置口径提前锁断言）；
2. **触控回放等价（AC-7）**：`tp.tap('moveLeft')`/`tp.tap('rotate')` 与键鼠同口径重置（回放器 0 逻辑改动证明）；
3. **软降/硬降即时锁**：触底缓冲中 `softDrop`/`hardDrop` 按键仍立即锁定（不走缓冲）；
4. **预算耗尽可感知**：16 次动作后缓冲不再延长（`tick(250)×2` 即锁）——DOM 态度：棋盘落定时机断言。

### 4.3 七套全绿出口（AC-11）与红线复核

产品根 `node scripts/verify-game.cjs` / `verify-audio.cjs` / `verify-ui.cjs` / `verify-constants.cjs` / `verify-persist.cjs` / `assembly-check.cjs` / `qa-e2e-jsdom.cjs` 全绿；复核清单：game.js diff 仅常量+/闭包+/move/rotate 分支+/4 出生点+/导出+/_debug+；audio/persist/ui/style/index.html **0 行**；VERSION 三模块仍 2.3.0（verify-constants 原断言不动即绿）；memory.md 0 diff；既有断言零改动（r32 §4.1-9 键集断言原样通过——本方案不追加快照字段的必然结果）。

## §5 任务拆分（对齐 PIPELINE-DISPATCHED 3 任务 + 工程约束携入）

| 任务 | 文件边界 | 内容 | 依赖 | 验收点 |
|---|---|---|---|---|
| **T1 引擎实现 lock move reset** | `/game.js` | §2 全部：常量+导出、闭包、预算生命周期（resetLockMoveBudget×4 出生点）、move/rotate 三支重置逻辑、`_debug.getLockMoveResetsRemaining()`；软降/硬降立即锁路径零改动；VERSION 不动 | 无（基线 main） | game.js diff 仅上述面；verify-game §r33 4.1-1/2/3 绿 |
| **T2 引擎测试新增 + r18 时序审计** | `/scripts/verify-game.cjs`、`/scripts/qa-e2e-jsdom.cjs` | §4.1 全部 7 用例（重置/上限 15/被拒不重置不发声/per-piece 归零/T-spin 满窗口仍判）+ §4.1-8 审计登记；qa-e2e §4.2 小段；**逐条审计** r18 §14.2/E11/F1~F8 旋转后 tick 锁定时序用例（登记理由=构造点 lockTimer=0 恒等引理） | T1 实现（断言需实现后转绿，可与 T1 同期编写） | §r33 全绿；r24~r32 断言零改动 |
| **T3 文档口径 + 七套全绿出口** | `docs/teamflow/prd/PRD.md`（活文档 AC-03.5 措辞 + §5 常量）、`docs/teamflow/20260904-r33-lock-move-reset/`（本次稿） | PRD AC-03.5 措辞修订为「触底后 500ms 固定，缓冲期间每次成功移动/旋转重置至满额、每方块至多 15 次」+ §5 新增 `LOCK_MOVE_RESET_MAX`；TECH 同步（本文档）；七套全绿门 + 红线复核（audio/persist/ui/style 0 行、VERSION 一致、memory 0 diff） | T1/T2 | 七套全绿；diff 面复核记录；QA-REPORT 承接 |

**工程约束携入（PRD §9，任务执行期必须遵守）**：
- 分支：自最新 main（HEAD 2fcd468，r32 合并后）建 **`feat/lock-move-reset`**；开发期间工作区保持纯净（未提交改动仅 host 预建任务夹，属交付物）。
- 改动面收口：仅 `/game.js`、`/scripts/verify-game.cjs`、`/scripts/qa-e2e-jsdom.cjs`、`docs/teamflow/prd/PRD.md`（AC-03.5+§5）与任务夹交付物；`/audio.js` `/persist.js` `/ui.js` `/style.css` `/index.html` `/AGENTS.md`（托管区外）`/docs/teamflow/memory.md` 一律 0 行。
- 交付物落 `docs/teamflow/20260904-r33-lock-move-reset/`（不可变夹）；命令输出日志落 `logs/teamflow/<runId>/`，禁止项目根散落日志、禁止写 `docs/<role>/`。
- 提交：验收通过后与交付物同批提交（合并策略由 acceptance 按 r28/r31 先例决定）；禁改历史任务夹、禁升 VERSION。

## §6 关键实现点与边界情况

1. **重置恒等引理（AC-6 审计根基）**：重置逻辑只在「成功 move/rotate」触发；既有全部时序用例的成功动作均发生在 `lockTimer=0` 时刻 → 重置为恒等（0 起计满 500ms 不变）→ 锁定时机/分数/事件序列全部不变。此引理是本方案「旧断言零改动」的证明核心，写进 §4.1-8 登记注释。
2. **预算封底与「不再重置」的可观察语义**：预算=0 后触底成功动作 `{ok:true}` **位置仍改变**（移动/旋转可继续），仅不重置缓冲 → 锁定可能发生在动作后的累积中，属 AC-3 预期（人工补测可感知「预算耗尽后不再延长」）。
3. **悬空清零动作计 1 次（PRD §4「≤15，含悬空清零动作」）**：滑出边缘的脱离触底动作消耗预算 → 「悬空滑出再落地」**不补发**（AC-4 断言：getter 仍 0）；与「软降成功下移不计（AC-5）」「重力不计（内部动作）」严格区分，口径表 §1 为单一语义契约。
4. **出生点全覆盖防漏**：4 处 spawn 出生点统一 `resetLockMoveBudget()`；漏一处 = 新块继承耗尽预算 = 防钻空子失效（QA 对抗用例 §4.1-6 兜底）。`spawn()` 纯函数不动（导出契约、Node 直调）。
5. **DAS 连打与预算**：触底缓冲期 DAS 每次成功 repeat 消耗 1 次预算（≤15 封顶）——预算上限天然防「靠 DAS 无限拖延」；软降 repeat 不计（AC-5）。
6. **断言确定性**：锁定时序断言沿用 `lockTick = tick(250)×2`（DT_CLAMP_MS=250 上限）分片约定；判定点取「累计满 500ms 锁定」而非某次 tick 尾（PRD §7 风险行）——新增用例全部遵守。
7. **路径优先级**：move/rotate 的 `clearing` / `illegal-phase` / `no-piece` 守卫在成功分支之前 → 重置逻辑只可能被「RUNNING 且有块」触达；被拒（碰撞/全拒）在移动/旋转写入前早退 → 天然不触达（AC-2）。
8. **与 r32 计数正交**：`piecesPlaced`/`sessionTimeMs` 只读、`lockMoveResetsRemaining` 只写——互不读取、零耦合；快照键集不变（§2.5）。
9. **T-spin 窗口零触碰**：重置逻辑不读写 `tspinPending`（置/清时机逐字节不变）——AC-6 红线由 §14 全量复跑 + §4.1-7 交叉验证兜底。

## §7 风险与人工补测清单（承接 AC-12，写入 QA-REPORT）

| 风险 | 处置 |
|---|---|
| 重置语义致 r18 §14 既有时序用例锁定时机漂移（tspinSession 构造旋转在缓冲期） | 审计引理（构造点 lockTimer=0 → 恒等）+ §4.1-8 逐组登记 + 七套全量复跑（r28 先例：若验证期确现漂移再显式登记改写，预期不发生） |
| 预算口径歧义（悬空清零是否计 1） | §1 口径表单一契约 + §4.1-6 独立对抗用例（滑出再落地不补发） |
| 重置逻辑误触 `tspinPending` | §6.9 零触碰声明 + §14.2b/§14.8 负例全量复跑 |
| 软降/硬降路径被并入缓冲 | AC-5 用例：软/硬降立即锁、事件序列逐字节比对（§4.1-5）+ qa-e2e §4.2-3 |
| soak 局内单块预算耗尽致锁定时机漂移 | soak 断言为数值一致性（非锁定时机），预期仍绿；T2 验证期复核登记 |
| 断言非确定性（tick 分片与 500ms 边界） | 沿用 lockTick 已达上限分片约定 + 判定点取累计满 500ms（§6.6） |

**AC-12 人工补测（真机，留验收）**：触底缓冲期连打方向/旋转的锁延迟观感（每击重置 → 500ms 重新起算的可感知节奏）；预算耗尽后「不再延长」的体感边界（第 15→16 击后立即锁定）；预算耗尽前行云流水不卡顿（≤15 次内 DAS 连打无异常）；触控回放与键鼠一致性（触屏连打方向与键盘手感等价）；T-spin 手感零回归（旋转入槽后缓冲期微调仍可判）；FPS 稳定（逻辑仅常数级加法，无逐帧开销）。

## §8 T3 执行与复核记录（dev 阶段，2026-09-04）

### 8.1 文档口径同步（AC-10）落点与活文档现实

- **活文档路径现实**：`docs/teamflow/prd/PRD.md` 自 2026-08-25 提交 c9f018e 起已随「基线文档目录归档」移入 `docs/teamflow/history/v2.9/PRD.md`，此后未再重建；r13~r32 各轮均以**任务夹 PRD 为权威**（r13 同款先例：「该行为源于活文档 PRD AC-03/E3，无任务夹 AC 锚点」），memory.md §说明「新需求产物写入新任务夹、历史夹永不改动」。故 AC-10「活文档修订」按 ADR-0008 任务夹模型落在本任务夹，**不新建 docs/teamflow/prd/PRD.md**（防御虚拟文档漂移；git show c9f018e 为证据）。
- **AC-03.5 修订措辞落定**：本任务夹 PRD §1.3（第 29 行「触底后 ≤500ms 固定（固定计时，成功动作不重置）→ 触底后 500ms 固定；缓冲期间每次成功移动/旋转重置至满额」）+ §5 数值规格（第 85~86 行 `LOCK_DELAY_MS` 措辞修订 + `LOCK_MOVE_RESET_MAX=15` 新增行）已含 AC-10 要求的全部口径；本 TECH §0/§1/§2 同步该语义与预算口径（口径表 §1 为单一契约）。
- **VERSION**：三模块仍 `2.3.0`（verify-constants 绿），符合 AC-11 不升级条款。

### 8.2 七套全绿门（AC-11）与红线复核

产品根执行（日志见 `logs/teamflow/tf-mtlqxw2e-8pt6ij/`）。两轮门跑：

1. **T2 落树前（基线回归证明，pwsh-1）**：既有一切断言（r24~r32 含 r18 §14 全组时序、含 r32 §4.1-9 快照键集）对新引擎全部通过（verify-game 140/140、qa-e2e 569/569）——直接实证 §0 审计引理「成功动作时刻 lockTimer=0 → 重置恒等」，r18 §14 期望零改动成立、前端五文件 0 行等价证明。
2. **T2 落树后（最终门，§r33 纯追加在树）**：

> 注：T2 断言脚本（verify-game/qa-e2e 于 01:06~01:07 落树）与 T3 门跑并行，首轮并行门出现两次**瞬时**失败（verify-game 147/148 `r33 §4.1-8`、qa-e2e 580/581）——经隔离探针（`logs/teamflow/tf-mtlqxw2e-8pt6ij/probe-r33-f1.cjs`，构造即 §4.1-2/tspinSession 全部等价）证明两构造均出 900，系 T2 并行写入的 mid-write 竞态（文件 mtime 早于/同期于门跑）；T2 文件落定后多次复跑**全绿且确定**（verify-game 148/148 ×4、qa-e2e 581/581 ×4），异常不残留。

| 脚本 | 结果（稳定复跑） |
|---|---|
| verify-game.cjs | ✅ 148/148（含 §r33 8 例，exit 0） |
| verify-audio.cjs | ✅ 24/24（exit 0） |
| verify-ui.cjs | ✅ 63/63（exit 0） |
| verify-constants.cjs | ✅ 2/2（exit 0，VERSION 三模块 2.3.0 一致） |
| verify-persist.cjs | ✅ 23/23（exit 0） |
| assembly-check.cjs | ✅ ALL CHECKS PASSED |
| qa-e2e-jsdom.cjs | ✅ 581/581（含 §r33 小段，exit 0） |

- **审计引理实证**：本门跑于 T2 §r33 断言落树前——既有一切断言（r24~r32 含 r18 §14 全组时序）对新引擎**零回归**，直接验证 §0 审计引理「成功动作时刻 lockTimer=0 → 重置恒等」，r18 §14 期望零改动成立；T2 落树后（§r33 纯追加）由 QA 复跑收口。
- **红线复核（diff 面）**：已提交跟踪面仅 `/game.js`（43+/3−，收口于常量+/闭包+/move/rotate 三支+/4 出生点+/导出+/_debug getter）；`/audio.js` `/persist.js` `/ui.js` `/style.css` `/index.html` `/AGENTS.md` `/docs/teamflow/memory.md` 实测 0 行 diff；快照键集 r32 §4.1-9 断言原样通过（未追加快照字段）。
- **交付状态**：分支 `feat/lock-move-reset`；未提交改动 = `/game.js` + 本任务夹三文件（PRD/TECHNICAL/meta.json）；验收通过后单 commit（host 执行，按 PRD §9）。

<!-- blueprint -->{"summary":"触底锁定缓冲从固定计时升级为带预算的移动/旋转重置：game.js 单文件新增 LOCK_MOVE_RESET_MAX=15 常量与 per-piece 剩余预算闭包，move/rotate 成功分支三支化重置逻辑 + 4 处出生点预算重置 + _debug 只读 getter 断言锚点（不追加快照字段以保 r32 §4.1-9 键集断言零改动），verify-game/qa-e2e §r33 纯追加断言并携审计引理登记 r18 §14 时序用例零回归，前端五文件 0 行、VERSION 不动。","modules":{"/game.js":{"responsibility":"唯一改动文件：新增 LOCK_MOVE_RESET_MAX=15 常量并导出；闭包 lockMoveResetsRemaining；move/rotate（原地+kick）成功分支触底重置（预算>0）与悬空清零+预算−1；resetLockMoveBudget 于 4 出生点（spawnFirst/finishLock/hold×2）重置；_debug.getLockMoveResetsRemaining()","dependsOn":[],"assemblyOrder":1,"why":"行为变更面必须单文件收口：tick/lockFlow/softDrop/hardDrop 等锁定路径逐字节不动（红线）；预算与 r32 计数同风格闭包会话内存；出生点单一收口防漏重置（spawn() 纯函数不动保导出契约）"},"/scripts/verify-game.cjs":{"responsibility":"§r33 7 用例（常量/重置满额/被拒不重置不发声/上限15/软硬降不变/per-piece 归零防钻空子/T-spin 交叉验证）+ §4.1-8 r18 §14 审计登记；r24~r32 断言零改动","dependsOn":["/game.js"],"assemblyOrder":2,"why":"引擎新语义须 Node 确定性断言（tick ≤250ms 分片沿 lockTick 先例）；审计以「构造点 lockTimer=0 → 重置恒等」引理为登记键，证明旧期望零改动"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"§r33 小段：缓冲期键盘重置 / 触控回放等价（AC-7 回放器 0 逻辑改动证明）/ 软硬降即时锁 / 预算耗尽可感知","dependsOn":["/game.js"],"assemblyOrder":3,"why":"DOM/回放层证明触控=键盘同路径自然获新语义，无独立实现；复用既有 key()/tp/check 工具"},"docs/teamflow/prd/PRD.md":{"responsibility":"活文档修订：AC-03.5 措辞（触底后 500ms 固定+缓冲期成功动作重置至满额+每方块至多 15 次）+ §5 新增 LOCK_MOVE_RESET_MAX","dependsOn":[],"assemblyOrder":4,"why":"AC-10 文档口径同步：取代声明已在任务夹 PRD §1.3/§5 落定，活文档正文需同步防漂移"},"/docs/teamflow/20260904-r33-lock-move-reset/TECHNICAL.md":{"responsibility":"本需求技术方案：契约、口径表、审计引理、任务拆分、工程约束","dependsOn":[],"assemblyOrder":5,"why":"任务夹交付物（不可变夹，products/docs/teamflow 边界内）"},"/scripts/verify-ui.cjs":{"responsibility":"0 行（红线复核对象，非改动面）","dependsOn":[],"assemblyOrder":0,"why":"无 UI 改动：预算不进展示面，verify-ui 原样全绿即红线上限证明"},"/audio.js,/persist.js,/ui.js,/style.css,/index.html":{"responsibility":"0 行（红线复核对象）","dependsOn":[],"assemblyOrder":0,"why":"AC-8 红线：引擎级行为变更不触碰音效/持久化/UI/样式/DOM；VERSION 三模块一致不动"},"/AGENTS.md,/docs/teamflow/memory.md":{"responsibility":"0 行（托管区外与迭代记录红线）","dependsOn":[],"assemblyOrder":0,"why":"memory.md 仅团队约定/技术栈决策才写；行为变更+新常量由任务夹与状态块承载"}},"duplications":["潜在漂移：LOCK_MOVE_RESET_MAX 需 game.js / PRD §5 / verify-game §r33 三处一致（沿 LOCK_DELAY_MS 先例，T1 常量 + T2 断言互验）；预算−1 逻辑在 move/rotate 三个成功分支重复 3 次——刻意接受（对齐 tspinPending 置窗三处先例，不抽公共 helper 以免触碰既有成功路径主体）；断言锚点取 _debug getter 而非快照字段——规避 r32 §4.1-9 键集「恰 2 新字段」断言破坏"],"tasks":[{"title":"T1 引擎实现 lock move reset","files":["/game.js"],"spec":"常量 LOCK_MOVE_RESET_MAX=15+导出；预算闭包与 4 出生点重置；move/rotate 成功分支三支重置+预算−1；_debug.getLockMoveResetsRemaining；软硬降路径与 VERSION 零改动"},{"title":"T2 引擎测试新增与 r18 时序审计","files":["/scripts/verify-game.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"verify-game §r33 7 用例+审计登记；qa-e2e §r33 回放等价小段；r24~r32 断言零改动；§14.2/E11/F1~F8 逐条审计登记"},{"title":"T3 文档口径与七套全绿出口","files":["docs/teamflow/prd/PRD.md","docs/teamflow/20260904-r33-lock-move-reset/TECHNICAL.md"],"spec":"活文档 AC-03.5+§5 修订；TECH 同步；七套全绿+红线复核（五文件 0 行、VERSION 一致、memory 0 diff）；验收后单 commit"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r33 TECHNICAL 定稿：game.js 单文件收口——新增 LOCK_MOVE_RESET_MAX=15 常量（导出）+ 预算闭包 lockMoveResetsRemaining（per-piece，4 出生点 spawnFirst/finishLock/hold×2 重置为 15），move/rotate（原地+kick）成功分支三支化：触底且预算>0→lockTimer=0 重置满额+预算−1、触底预算=0→不重置、悬空→既有清零路径+预算−1；被拒不重置不发声、软降/硬降/重力不耗预算（口径表为单一契约）；断言锚点取 _debug.getLockMoveResetsRemaining()（不追加快照字段——保 r32 §4.1-9 键集断言零改动）；tick/lockFlow/softDrop/hardDrop/tspinPending 逐字节不动、前端五文件 0 行、VERSION 不动、memory 0 diff。审计引理=所有既有时序用例成功动作时刻 lockTimer=0→重置恒等→r18 §14 期望零改动（逐组登记）；verify-game §r33 7 用例+qa-e2e §r33 小段纯追加；T1(game)/T2(断言+审计)/T3(文档+七套全绿) 对齐 dispatched，分支 feat/lock-move-reset。","memory":["r33 引擎契约：LOCK_MOVE_RESET_MAX=15 常量+导出；预算=剩余重置次数闭包（触底成功或悬空清零动作各 −1 封底 0，被拒/软降/硬降/重力 0）；预算每次方块出生重置（4 出生点单一收口 resetLockMoveBudget，spawn() 纯函数不动）","r33 重置语义：move/rotate 成功分支三支化——触底+预算>0→lockTimer=0 重置至满额；触底+预算=0→不重置（缓冲续计至 500ms 锁定，位置仍可变）；悬空→既有清零路径；tspinPending 置/清时机零触碰","r33 审计引理（AC-6）：所有既有锁定/时序用例成功 move/rotate 时刻 lockTimer=0→重置为时间线恒等→r18 §14.2/E11/F1~F8/§15/§16/tspinSession 期望零改动，仅 §14.6/§15.10/§16.10 soak 留验证期复核（断言数值一致性非锁定时机）","r33 断言锚点：_debug.getLockMoveResetsRemaining() getter，不追加快照字段——r32 §4.1-9 断言键集恰=16 既有+2 r32 字段，追加速字段即破旧断言（AC-9 允许 debug 导出路线）","r33 任务并行：T1 game.js 引擎（常量/闭包/重置/出生点/getter）→ T2 verify-game §r33 7 用例+审计登记 + qa-e2e §r33 回放等价小段 → T3 活文档 PRD AC-03.5+§5 修订 + 七套全绿 + 红线复核（audio/persist/ui/style/index.html 0 行、VERSION 2.3.0 一致、memory 0 diff）；分支 feat/lock-move-reset"]}<!-- /state -->