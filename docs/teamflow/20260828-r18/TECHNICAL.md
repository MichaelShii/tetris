<!-- meta: summary="r18 T-spin 技术方案：判定几何（3×3 四角≥3 实 + 旋转最后动作窗口）与 Full/Mini 划分离散化为纯函数 tspinKind，计分六档常量 T_SPIN_BONUS 与 LMINE_SCORES 同构叠加；改动面仅 game.js（常量+纯函数+会话窗口+lockFlow 三处插桩+snapshot 附加字段）+ verify-game.cjs §14 用例矩阵；0-diff 红线与 VERSION 裁定→代码保持 2.3.0，产品 v3.5 于验收登记" -->
基线依赖：docs/teamflow/20260828-r17-responsive-layout（AC-1~13 不得回归）+ r13 lockFlow（docs/teamflow/20260825-r13-lineclear-easing）+ docs/teamflow/prd/PRD.md §5 计分基线（100/300/500/800×level，v2.3 起仅消行计分）
取代：无（纯新增路径，不改任何既有已验证行为）

# r18 T-spin 检测 技术方案（TECHNICAL）

## 1. 概述：需求 → 技术映射

| 需求目标 | 技术落点 |
|---|---|
| G1 判定正确（三实角 + 旋转最后动作，零误报零漏报） | 纯函数 `tspinKind(board, piece)`（几何，θ(1)）+ 会话布尔 `tspinPending`（旋转窗口，单一时钟流内消费） |
| G2 计分对齐（六档 ×level 与普通消行分同构叠加） | `T_SPIN_BONUS` 常量表 + `tspinBonus(kind, cleared, level)`，在 `finishLock` 与普通消行分各加一次 |
| G3 零回归（r13 消行动画/事件序列/持久化/七套全绿） | 判定插桩仅在 `lockFlow` 的消行步骤之前读取、不改任何既有时序；快照仅增 additive 字段 |
| G4 最小侵入（P0 仅 game.js + verify-game.cjs） | 其余产品文件 0 行 diff；所有新行为收敛在引擎与会话工厂内 |

工程形态：扁平纯 JS（UMD `window.TetrisGame` / `module.exports`），零构建零依赖，与全仓风格（工厂 + 闭包、不可变棋盘、纯函数优先）一致。

## 2. 现状基线（改动落点定位，行号以本方案撰写时的 game.js / verify-game.cjs 为准，开发时以 grep 复核）

| 位置 | 现状 | r18 动作 |
|---|---|---|
| `game.js` 常量区（L46~L69） | `VERSION='2.3.0'`、`LINE_SCORES=[100,300,500,800]`（L69） | 其后新增 `T_SPIN_BONUS`（§4） |
| `game.js` 纯函数区（L403~L406） | `rotated(piece,dir)` | 其后新增 `tspinKind` + `cornerSolid`（§3.1） |
| `game.js` 会话私有状态（L446~L461 + L472） | `state.*`、`holdUsed` | 新增会话布尔 `tspinPending` |
| `rotate()`（L669~L702） | 原地成功（L676~L682）/ kick 成功（L692~L697）两处成功分支 | 成功分支置 `tspinPending = true`；失败（L686/L701）不置位不清除 |
| `move()`（L653~L667）、`softDrop()`（L704~L721）、`hardDrop()`（L723~L737）、`tick()` 重力步（L805~L816）、`hold()`（L746~L784）、`spawnFirst()`（L589~L600）、`restart()`（L614~L634） | — | 各自成功路径清除窗口（§3.3 窗口状态机） |
| `lockFlow()`（L522~L543） | merge → clearLines → clearing 子阶段 / 即时 finishLock | 消行步骤**之前**插桩：取快照判定 kind，随 clearing 载荷与即时路径传递（§5.2） |
| `completeClearing()`（L546~L550）、`finishLock()`（L554~L587） | 原子步：计分 → 行数/升级 → spawn → 碰撞 | `finishLock` 加 `tspin` 参数；计分块叠加 bonus（§5.3） |
| `snapshot()`（L478~L496） | 含 `clearedIndices`/`animProgress`/`holdPiece` | 新增 additive 字段 `tspin`（§5.4） |
| 导出区（L1071~L1111） | 常量 + 纯函数 + createGame | 新增 `T_SPIN_BONUS` / `tspinKind` / `tspinBonus` |
| `verify-game.cjs`（现止于 L1769，r15 节之后） | — | 追加 §14 r18 节（纯新增，不改既有断言） |
| `verify-constants.cjs`（L21 `EXPECTED_VERSION='2.3.0'`） | 三模块 VERSION 均须 === '2.3.0' | **不改**（见 §6.1 VERSION 裁定） |
| `audio.js`/`ui.js`/`style.css`/`index.html`/`persist.js` | — | **0 行 diff**（P1 徽标另行裁定） |

## 3. 判定规则（产品级定义；含 PRD §3 歧义裁定）

### 3.1 几何判定：纯函数 `tspinKind(board, piece) → 'full' | 'mini' | 'none'`

**3×3 邻域**：以旋转后（含 kick 位移后）T 的 `piece.x/y` 为左上角，取 `(x..x+2) × (y..y+2)` 的棋盘区域，四角为：
`TL=(x,y)`、`TR=(x+2,y)`、`BL=(x,y+2)`、`BR=(x+2,y+2)`。实 = 该格非空（对**合并后**棋盘 `merged = merge(board, piece)` 判定——即 PRD AC-9 要求的"锁定瞬间棋盘快照，含踢墙位移后的快照"；越界格按实处理，防御性——T 在局内（10×20、旋转后 3×3 必完全在界内：x∈[0,7]、锁定 y≤17 时框底行=19）不可触发，仅供任意人工构造输入时不抛错）。

```js
/** 角点实判定；越界按实（墙），对 T 局内不可达，纯防御 */
function cornerSolid(board, x, y) {
  return x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x] !== null
}

/** T-spin 几何分类（纯函数，零依赖对局状态；仅对 T 有意义，非 T 恒 'none'） */
function tspinKind(board, piece) {
  if (piece.type !== 'T') return 'none'
  const x = piece.x, y = piece.y
  const tl = cornerSolid(board, x, y)
  const tr = cornerSolid(board, x + 2, y)
  const bl = cornerSolid(board, x, y + 2)
  const br = cornerSolid(board, x + 2, y + 2)
  const n = (tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0)
  if (n < 3) return 'none'      // AC-4：0/1/2 实角不判
  if (n === 4) return 'full'    // 四实角 = Full
  /* n === 3：缺失角位于 T 头部一侧 → Mini；否则 Full（AC-5，头部=唯一突出方向）
   * rot0 突上(顶行 TL/TR) / rot1 突右(右列 TR/BR) / rot2 突下(底行 BL/BR) / rot3 突左(左列 TL/BL) */
  const missingHeadSide =
    (piece.rot === 0 && (!tl || !tr)) ||
    (piece.rot === 1 && (!tr || !br)) ||
    (piece.rot === 2 && (!bl || !br)) ||
    (piece.rot === 3 && (!tl || !bl))
  return missingHeadSide ? 'mini' : 'full'
}
```

**形状事实（本作 BASE_SHAPES.T 即为标准 SRS T）**：四个旋转态（rot0 突上 / rot1 突右 / rot2 突下 / rot3 突左）的 4 格**从不占据** 3×3 框角，故四角全部来自环境块——四角计数与"是否含自身格"无关，主流客户端形状约定一致，**不得**引入"自身占角"类判据。

### 3.2 PRD §3「对角对/无对角对」歧义裁定（R2 落地产物，供验收复核）

PRD §3 两行在数学上不可同时字面成立：正方形四角任取 3 个，**必含恰好一对完整对角**（TL-BR 或 TR-BL），故"三实角含对角对→Full"若字面执行将使 Mini 永不可达，与 PRD 自身锚点样例（下凹槽头朝上=Mini、TKI=Full）矛盾。裁定（以 PRD 自身 Mini 行括号注「脚侧两角 + 相邻一侧角」与 AC-5 权威样例为锚）：

**Mini ⟺ 实角=3 且缺失角位于 T 头部一侧（即实角恰为脚侧两角 + 头部侧一角）；其余 3 实角（缺失角在脚侧/头侧另一对全实）→ Full。** 该形式与 §3.1 代码一一对应；与 AC-5 四类锚点全兼容（见 §7 T6 样例表）。本裁定记录于此，验收以样例表（AC-5 ≥8 组）为准，不逐字纠缠「含对角对」表述。

### 3.3 旋转窗口状态机：会话布尔 `tspinPending`

| 动作 | 对 `tspinPending` 的影响 | 依据 |
|---|---|---|
| `rotate()` 成功（原地 / kick 位移，两分支） | **置 true** | AC-1：旋转为锁定前最后动作（含原地旋转与 kick；位移非必需） |
| `rotate()` 失败（wall-kick-denied / 非法态 / clearing 期被拒） | 不变 | 未发生旋转动作 |
| `move()` 水平位移成功 | **置 false** | AC-1 字面"锁定前最后动作是旋转"——移动是另一动作；主流客户端同样拒绝"旋转后滑入"（裁定 D-01，收敛不扩大授予面） |
| `softDrop()`（含成功下移与触底立即锁定两路径） | **置 false** | AC-3 软降负例必达（裁定 D-02：即使软降未发生位移，触发锁定的最后动作仍是下落尝试） |
| `hardDrop()` | **置 false** | AC-3 硬降负例必达 |
| `tick()` 重力步实际下移 1 格 | **置 false** | AC-3 自然重力负例必达；触底 `break`（未移动）不清除 → 旋转落地后经 lockTimer 锁定仍成立 |
| `hold()` / `spawnFirst()`（start/restart 出生）/ `restart()` | **置 false** | 新方块周期开启；每方块一次有效窗口 |
| `lockFlow()` 消费（判定后） | **置 false** | 一块一判 |

窗口语义结论：**T-spin 只在"旋转落地即锁定"（旋转后不得再有任何动作/下移）时成立**——旋转必须把 T 直接嵌入最终落位（着地），随后经 `tick` 的 lockTimer（500ms 缓冲）或即时路径锁定。旋转成功后仍悬空 → 首个重力步下移即失效（AC-3 自然重力负例），语义与 Guideline「旋转达到最终落位」一致。

## 4. 计分模型（单一事实来源 = game.js 顶部常量 + verify-game §14 断言）

`game.js` 常量区（`LINE_SCORES` 之后）新增：

```js
// r18 T-spin 加分（PRD §3 表；索引 = 本次清除行数）：
// full: 0 行=No-line 100 / 1/2/3 行=800/1200/1600；mini: 0 行无档=0 / 1/2 行=100/200 /
// 3 行按 Full Triple=1600（无 Mini Triple 档，防漏分）；kind='none'（未判定）一律不调用
const T_SPIN_BONUS = {
  full: [100, 800, 1200, 1600],
  mini: [0, 100, 200, 1600],
}
```

```js
/** T-spin 加分：基准分 × level（与 scoreForLines 同构）；kind='none' → 0 */
function tspinBonus(kind, cleared, level) {
  if (kind !== 'full' && kind !== 'mini') return 0
  const base = T_SPIN_BONUS[kind][cleared]
  return typeof base === 'number' ? base * level : 0
}
```

**叠加规则（AC-7 / AC-6 / AC-11）**：
- 总分（本次锁定） = `scoreForLines(cleared, level)`（普通消行基分，逐分不变）+ `tspinBonus(kind, cleared, level)`，恰各一次；`kind='none'` 时 bonus 恒 0 → 普通路径逐分与基线相等（既有断言不动即回归防线）。
- 行数照常累计、升级照常（`levelForLines(lines)`）；bonus 不触碰 lines → 加分不推进等级（AC-11）。
- 乘数用 `finishLock` 进入时的 `state.level`（升级前），与 `scoreForLines` 现行取数点位一致。
- Mini 清 3 行 → `T_SPIN_BONUS.mini[3]=1600` 直接命中（AC-6 防漏分）。
- No-line（`cleared=0` + full）：仅加 100×level；**不发 `clear` 音效、不进 clearing 子阶段**（`clear` 事件与"有行可消"的既有不变量保持，AC-8 的"恰 1 次"语义不破；0 行 T-spin 属新增授予面，可视化反馈留给 P1）。

## 5. 实现设计（改动清单，全部落在 game.js / verify-game.cjs）

### 5.1 会话窗口接线（game.js）

- 新增 `let tspinPending = false`（`holdUsed` 附近）。
- `rotate()` 成功分支：原地成功（`return { ok: true }` 前）与 kick 命中分支各加 `tspinPending = true`。
- `move()` 成功、`softDrop()` 成功与触底锁定两分支、`hardDrop()`（落点计算后、`sfx('hardDrop')` 前）、`tick()` 重力步成功下移处、`hold()` 交换/存入完成后、`spawnFirst()` 出生处、`restart()`：各加 `tspinPending = false`。
- `lockFlow()` 消费后重置：判定为 `kind` 后即 `tspinPending = false`（与 `state.piece = null` 同栈，见下）。

### 5.2 lockFlow 插桩（唯一判定点，位于消行步骤之前，不改 r13 时序）

```js
function lockFlow() {
  const merged = merge(state.board, state.piece)
  const res = clearLines(merged)
  // r18：锁定瞬间快照判定（合并后棋盘 = 含踢墙位移后的最终落位）；窗口消费后立即复位
  const kind = tspinPending && state.piece.type === 'T' ? tspinKind(merged, state.piece) : 'none'
  tspinPending = false
  state.piece = null
  state.lockTimer = 0
  state.gravityAcc = 0
  ...
  if (res.cleared > 0 && animMs > 0) {
    state.board = merged
    state.clearing = { indices: res.indices, elapsed: 0, res: res, tspin: kind } // +tspin 随载荷传递
    sfx('clear')                       // 动画首帧恰 1 次（不变）
    emit()
    return { ok: true, locked: true, cleared: res.cleared, levelUp: false, gameOver: false } // 返回形状不变
  }
  return finishLock(res.board, res.cleared, true, kind)
}
```

`completeClearing()`：`finishLock(cl.res.board, cl.res.cleared, false, cl.tspin)`。

### 5.3 finishLock 原子步（计分叠加，返回值形状不变）

```js
function finishLock(board, cleared, playClearSfx, tspin) {
  state.board = board
  let levelUp = false
  const bonus = tspinBonus(tspin, cleared, state.level)   // 'none' → 0
  if (cleared > 0) {
    state.score += scoreForLines(cleared, state.level) + bonus   // 普通分 + T-spin 分恰各一次
    state.lines += cleared
    const newLevel = levelForLines(state.lines)
    levelUp = newLevel > state.level
    state.level = newLevel
    if (playClearSfx) sfx('clear')
  } else if (bonus > 0) {
    state.score += bonus   // No-line T-spin：加分但不发声、不计行（升级不动，AC-11）
  }
  ... // spawn / 出生碰撞 / onLevelUp / onGameOver 全部保持原样（最终分数自动含 bonus）
}
```

### 5.4 快照与导出（additive，不破坏既有消费方）

- `snapshot()` 新增字段：`tspin: state.clearing ? state.clearing.tspin : null`——与 `clearedIndices`/`animProgress` 同生命周期（仅 clearing 期非 null），缺省恒 null，既有字段语义零变化（AC-8：标志经现有 onSnapshot 回调暴露，供 P1 徽标；`snapshotDeep` 只比较 score/level/lines/next/piece/board，附加字段天然被忽略，既有"快照不变"断言不受影响）。
- 导出区新增：`T_SPIN_BONUS: { full: T_SPIN_BONUS.full.slice(), mini: T_SPIN_BONUS.mini.slice() }`、`tspinKind: tspinKind`、`tspinBonus: tspinBonus`（沿 `LINE_SCORES` 的 `.slice()` 惯例）。
- **不改**：`lockFlow`/动作返回对象形状、`SFX_EVENTS`（复用既有 `clear`）、`_debug` 钩子、任何持久化格式。

### 5.5 关键边界（Edge Cases）清单

| # | 边界 | 行为 | 验收锚 |
|---|---|---|---|
| E1 | 原地旋转（rot 变化、x/y 不变）后锁定 | T-spin（位移非必需，AC-1） | §7 T2 |
| E2 | kick 位移（左/右/上偏移）后锁定 | T-spin（含踢墙位移后的快照，AC-1/9） | §7 T2 |
| E3 | 旋转后软降触底立即锁定 | 不判（D-02；AC-3 软降负例） | §7 T2 |
| E4 | 旋转后硬降锁定 | 不判（AC-3 硬降负例） | §7 T2 |
| E5 | 旋转后重力下移再锁定（含旋转时悬空落地） | 不判（AC-3 自然重力负例） | §7 T2 |
| E6 | 旋转后水平 move 再锁定 | 不判（D-01；"最后动作是旋转"字面） | §7 T2 |
| E7 | T 无旋转直接落定且巧合 3 实角 | 不判（AC-4） | §7 T2 |
| E8 | 非 T 六型旋转嵌入 3 实角几何 | 恒 'none'（AC-2，双层防线：`type!=='T'` 短路 + 会话 `type==='T'` 门） | §7 T1/T2 |
| E9 | 0/1/2 实角 / 4 实角 | 不判 / Full（AC-4/5） | §7 T1 |
| E10 | clearing 动画期（piece=null） | 输入拒绝在先（r13 守卫），窗口不受动画影响；`cl.tspin` 跨动画期保留至完结帧 | §7 T4 + r13 既有 |
| E11 | 旋转落地后 lockTimer 缓冲锁定（旋转时已触底、lockTimer 未清零） | 仍判（旋转为最后动作） | §7 T2 正值主路径 |
| E12 | No-line（full、cleared=0） | +100×level、不发 clear、不计行 | §7 T3 |
| E13 | Mini 清 3 行 | 按 Full Triple 1600×level（防漏分） | §7 T3 |
| E14 | kick 全部失败（wall-kick-denied） | 旋转未发生 → 窗口不变 → 保持原状落定不判（未旋转） | §7 T2 负例可选 |

## 6. 测试策略（verify-game.cjs 追加 §14「r18 T-spin」，纯新增不触碰既有断言）

沿用既有风格：`require('../game.js')`、`node:test`、`mk({autoLoop:false,keyboard:false,autoPauseOnBlur:false,animMs:0})` 会话 + `_debug.setBoard/setPiece/setNext` 构造 + `events.sfx`/`onSnapshot` 收集。正值主路径统一走"旋转 → `tick(LOCK_DELAY_MS)` 经 lockTimer 锁定"（animMs:0 → 即时原子步；另以 animMs>0 抽验动画路径）。

| 节 | 用例 | AC 锚 |
|---|---|---|
| §14.1 `tspinKind` 纯函数矩阵 | 实角计数 0/1/2/3(F/M)/4 × 4 朝向共 ~20 组直接断言；非 T 六型各 ≥1 组 3 实角几何 → 'none' | AC-1/2/4/5（几何层） |
| §14.2 会话窗口 | AC-1 24 组矩阵 = 4 朝向 × {原地 / 左 kick / 右 kick} × {正值：旋转→tick 锁定判 T-spin / 负值：同布局旋转→三种下落之一→不判}；另含软降触底、硬降、重力、move 后锁定、无旋转落定各负例 | AC-1/3/4 |
| §14.3 六档计分 | 常量逐档断言 `T_SPIN_BONUS.full[0..3]/mini[0..3]` 精确值；会话逐档「常量 × level」（level 1 与 level 2 各验）；Mini 清 3 行=Full Triple；No-line=+100×level 且无 clear 事件 | AC-6/7 |
| §14.4 叠加与等级 | 单消正值：总分 = 普通分 + T-spin 分恰各一次（如 level 1 Full Single：100+800=900）；普通单消/双消负例逐分与基线一致（100/300×level）；T-spin 清 2 行 + 升级同栈；bonus 不推进 lines/level；T-spin 后 `lose()` 的 onGameOver 总分含 bonus | AC-6/7/11 |
| §14.5 事件序列 | 含 T-spin 场景：`['rotate','clear']`（即时路径）/ `['rotate','clear','levelUp']`（跨升级），animMs>0 下 clear 仍恰 1 次且首帧；普通 T 落定序列不变；No-line 无 clear | AC-8 |
| §14.6 稳定性 soak | 连续 50 局（种子 rng 确定性），每局注入大量 T 旋转/软硬降直至 OVER：无异常抛出、score 单调不减、每次锁定后 `snapshot.piece` 正常非空（下一块 spawn） | AC-10 |

**AC-5 权威样例表（≥8 组，逐例断言 `tspinKind` 与分值）**：

| # | 样例 | 朝向 | 实角组合 | 缺角 | 判定 | 分值（L1） |
|---|---|---|---|---|---|---|
| F1 | TKI 经典 | rot1（→） | TL,TR,BR | BL（脚侧=左列） | Full Single | 800+100=900 |
| F2 | TKI 镜像 | rot3（←） | TL,TR,BL | BR（脚侧=右列） | Full Single | 900 |
| F3 | 下凹槽头朝上 | rot0（↑） | TL,BL,BR | TR（头部侧=顶行） | Mini Single | 100+100=200 |
| F4 | 下凹槽镜像 | rot0（↑） | TR,BL,BR | TL（头侧） | Mini Single | 200 |
| F5 | 头朝下凹槽 | rot2（↓） | TL,TR,BR | BL（头侧=底行） | Mini Single | 200 |
| F6 | 头朝下凹槽镜像 | rot2（↓） | TL,TR,BL | BR（头侧） | Mini Single | 200 |
| F7 | 四实角 | rot0（↑） | 全实 | — | Full（1 行→Single） | 900 |
| F8 | 墙侧 kick 双实角槽 | rot3（←，kick 入槽） | TL,TR,BL | BR（脚侧） | Full Single | 900 |

（F8 体现"kick 入双实角槽"：槽贡献 ≥2 实角 + 体位贡献第 3 角、缺脚侧角 → 按 §3 判 Full；每个样例同时断言 `tspinKind` 与锁定时分值，≥8 组满足 AC-5。）

**七套全绿出口（AC-13）**：verify-game（含 §14 全部新用例）→ verify-audio / verify-ui / verify-constants / assembly-check / qa-e2e-jsdom 全部通过——后五套对 r18 而言是**回归托盘**（0 行 diff 佐证）。0-diff 审计：`git diff --stat` 应仅见 `game.js`、`scripts/verify-game.cjs` 与任务夹（`docs/teamflow/20260828-r18/`）。

### 6.1 VERSION 裁定（PRD §9 委办）

**代码头 VERSION 保持 `'2.3.0'` 不升**：`verify-constants.cjs` 硬编码 `EXPECTED_VERSION='2.3.0'` 并断言三模块 === 该值，而该脚本不在 P0 改动面（AC-13 要求其 0-diff）→ 满足即必须保持 '2.3.0'。产品版本（v3.5）登记于 `docs/teamflow/memory.md`，沿 r16/r17 先例于**验收入库时**执行；不顺手修正存量漂移。已由 `EXPORTS` 常量契约（`T.VERSION`）既有断言兜底。

## 7. 任务拆分（并行化，git 约束随 T3 落实）

| 任务 | 文件边界 | 内容 | 依赖 |
|---|---|---|---|
| T1 **game.js 内核** | `game.js` | §3/§4/§5 全部落地：`T_SPIN_BONUS` 常量、`tspinKind`/`tspinBonus` 纯函数、`tspinPending` 窗口状态机（rotate/move/softDrop/hardDrop/tick/hold/spawnFirst/restart 接线）、lockFlow 插桩 + clearing 载荷 + finishLock 叠加 + snapshot.tspin + 导出；他人文件 0 行 diff | 合同以本方案 §3~§5 冻结为准（可先于 T2 或并行） |
| T2 **verify-game.cjs 矩阵** | `scripts/verify-game.cjs` | 追加 §14 全部用例（§6 表）：几何矩阵、24 组窗口矩阵、六档计分、叠加/等级、事件、soak、F1~F8 权威样例表 | 同 T1（接口合同冻结后可并行） |
| T3 **收口验证（不提交）** | 无代码改动 | 七套脚本全绿（含新增用例）；0-diff 审计（git diff 仅 game.js + verify-game.cjs + 任务夹）；VERSION 复核（verify-constants 绿且三模块仍 2.3.0）；**保持分支 `feat/feature`、未提交的 r18 任务夹不动、不提交** | T1+T2 |
| T4-（P1 可选）**T-SPIN 徽标** | （若触发）`ui.js`/`style.css` + verify-ui | 消费 `snapshot.tspin` 显示 "T-SPIN!"/"Mini" ≤2s，与 r13 闪白共存；**未实现不阻塞 P0、AC-12 不适用** | 分离裁定 |

**git 约束落实（PRD §9，随任务卡片携带）**：分支恒为 `feat/feature`（不切换/不新建）；开发期间零提交；验收通过后由 host 与 QA-REPORT/ACCEPTANCE/memory（v3.5 登记）**同批提交**（沿 r16/r17 先例），本方案不产生单独提交。

## 8. 风险与裁定汇总

| 风险 | 裁定/处置 |
|---|---|
| R1 旋转窗口语义分歧 | 已拍板并固化为状态机：旋转成功（原地/kick）置窗；**任何动作**（move、软/硬降、重力下移）或新方块周期清窗；"旋转落地即锁定"方可判 |
| R2 Mini 判据差异（PRD §3 对角对表述矛盾） | 以"缺角在头部一侧 = Mini；否则 3 实角 = Full"为产品级定义（§3.2），F1~F8 样例表固化，验收以样例为准 |
| R3 回归面 | 判定只读快照 + 计分叠加两点；返回值形状/事件序列/持久化不变；七套全绿 + 0-diff 审计兜底 |
| R4 音效误变 | 复用 `clear` 恰 1 次；No-line 不发 clear（保持"有行可消 ⇔ clear 事件"不变量）；verify-game §14.5 逐序列断言 |
| V1 verify-constants 漂移 | 代码 VERSION 不升（'2.3.0'），P0 面内无可漂移；产品 v3.5 走 memory 登记 |
| V2 qa-e2e 快照全等风险 | r13 已证明 clearing 期附加字段（clearedIndices/animProgress）与 e2e 兼容；`tspin` 同模式 additive，风险同前 |

## 9. 数据模型 / 存储 / API / 前端声明（评审要求逐项回应）

- **数据模型**：零新增持久化；运行期仅增 1 个会话布尔（`tspinPending`）+ clearing 载荷 1 个字段（`tspin`）+ 快照 1 个 additive 字段；piece/board 结构不变。
- **存储**：`persist.js` 0 行 diff（无新设置项/载荷字段）。
- **API**：无路由/后端。UMD 契约面新增仅 `module.exports` 侧 `T_SPIN_BONUS`/`tspinKind`/`tspinBonus` 三个只读导出与快照 `tspin` 字段；`lockFlow`/动作返回对象、`SFX_EVENTS`、`onSfx` 语义全部不变。
- **前端组件/页面**：0 行 diff（无组件/页面/样式改动；P1 徽标为独立分离项）。
- **状态管理**：延续"工厂 + 闭包单一可变状态"；窗口标志生命周期严格下沉在引擎动作路径内，杜绝 UI/外部注入。

<!-- blueprint -->{"summary":"T-spin 以「纯函数几何判定 tspinKind + 会话旋转窗口 tspinPending」双因分离实现：改动面收敛到 game.js 单文件（常量/纯函数/窗口/锁定流程 3 处插桩/快照 additive 字段）与 verify-game.cjs 追加 §14 用例矩阵，其余产品文件 0 行 diff，代码 VERSION 不升、产品 v3.5 走 memory 登记","modules":{"/game.js":{"responsibility":"T_SPIN_BONUS 六档常量表 + tspinKind(board,piece) 几何纯函数（三实角/Full/Mini/头部侧缺角） + tspinBonus(kind,cleared,level) 加分 + 会话 tspinPending 窗口状态机（rotate/move/softDrop/hardDrop/tick/hold/spawnFirst/restart 接线） + lockFlow 判定插桩与 clearing 载荷 + finishLock 叠加计分 + snapshot.tspin additive 字段 + 导出","dependsOn":[],"assemblyOrder":1,"why":"引擎是唯一可变状态持有者与单一时钟原子锁流程（r13）所在，判定必须在该流程内消行步骤之前取锁定瞬间快照完成；纯几何函数与窗口分离使 AC-1~5 可分层单测且零对局外状态依赖；常量沿用 LINE_SCORES 单一事实来源惯例"},"/scripts/verify-game.cjs":{"responsibility":"追加 §14 r18 T-spin 用例矩阵：tspinKind 几何矩阵（AC-1/2/4/5）、4×3×2 会话窗口矩阵（AC-1/3/4）、六档 ×level 计分（AC-6/7）、叠加/等级/事件序列（AC-7/8/11）、50 局 soak（AC-10）、F1~F8 权威样例表（AC-5），纯新增不改既有断言","dependsOn":["/game.js"],"assemblyOrder":2,"why":"零依赖 node:test 自检是既有七套体系的唯一引擎断言入口；新增段纯追加（snapshotDeep 忽略 additive 字段）保证既有断言即回归基线；接口合同冻结（§3~§5）后可与 T1 并行开发"},"/verify-constants.cjs":{"responsibility":"（零改动·回归托盘）三模块 VERSION === '2.3.0' 硬断言 → 裁定代码 VERSION 不升","dependsOn":["/game.js","/audio.js","/ui.js"],"assemblyOrder":3,"why":"其 EXPECTED_VERSION 为 0-diff 红线内的硬约束，直接决定 VERSION 裁定（§6.1）"}},"duplications":["无重复实现需抽取：T 角点判定为单点纯函数，计分叠加与 scoreForLines 同构但语义不同（bonus 表）不合并；检测在 type==='T' 处与纯函数内双短路，为有意双层防线而非重复逻辑；勿引入主流客户端'自身占角'类判据（本作形状约定四角恒环境格）"],"tasks":[{"title":"T1 game.js 内核（T-spin 常量/纯函数/窗口/锁定流程插桩/快照）","files":["/game.js"],"spec":"按 §5 逐条落地：T_SPIN_BONUS+tspinKind+tspinBonus+tspinPending 状态机+lockFlow 插桩+finishLock 叠加+snapshot.tspin+导出；返回值形状/事件/持久化不变"},{"title":"T2 verify-game.cjs r18 用例矩阵","files":["/scripts/verify-game.cjs"],"spec":"追加 §14 全量用例（几何矩阵/24 组窗口矩阵/六档计分/叠加等级/事件/soak/F1~F8），与 T1 合同冻结后并行"},{"title":"T3 收口验证（七套全绿+0-diff+分支约束，不提交）","files":["/game.js","/scripts/verify-game.cjs"],"spec":"七套脚本全绿、git diff 仅两文件+任务夹、VERSION 复查 2.3.0、保持分支 feat/feature、验收后同批提交"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r18 T-spin TECH 已单次写入任务夹：T-spin=纯函数 tspinKind（3×3 四角≥3 实；缺角在头部一侧=Mini，否则=Full，4 实角=Full；非 T 恒 none）+ 会话窗口 tspinPending（rotate 成功置窗，move/软硬降/重力下移/新周期清窗，旋转落地即锁定方可判）；计分 T_SPIN_BONUS{full:[100,800,1200,1600],mini:[0,100,200,1600]} ×level 与 LINE_SCORES 叠加恰一次，Mini 清3行=1600 防漏分；lockFlow 消行前插桩经 clearing 载荷传 finishLock；snapshot 增 additive tspin 字段；P0 改动面仅 game.js+verify-game.cjs（§14 追加：几何矩阵/24 组窗口矩阵/六档/叠加/事件/50 局 soak/F1~F8 权威样例），代码 VERSION 保持 2.3.0（verify-constants 硬编码），产品 v3.5 验收时登记 memory；PRD §3 对角对表述矛盾以头部侧裁定量化并记录；git 约束随 T3 携带（feat/feature，验收后同批提交）","memory":["r18 TECH 已写入 docs/teamflow/20260828-r18/TECHNICAL.md：判定=几何纯函数 tspinKind + 会话窗口 tspinPending 双因分离","Full/Mini 产品定义：缺角在头部一侧=Mini（脚侧两角+头部侧一角），其余 3 实角与 4 实角=Full；PRD §3『对角对』表述矛盾以该裁定取代（F1~F8 样例固化）","计分：T_SPIN_BONUS full [100,800,1200,1600] / mini [0,100,200,1600]，索引=清除行数，全×level，与普通消行分叠加恰一次；Mini 清3行按 Full Triple=1600","窗口状态机：rotate 成功（原地/kick）置窗；move/软降/硬降/重力下移/新周期清窗；T 必须旋转落地即锁定（lockTimer）方可判","lockFlow 判定插桩在消行步骤前，kind 随 clearing 载荷传递 finishLock；snapshot 增 additive tspin 字段（仅 clearing 期非 null）；动作返回形状/事件序列/持久化零变化","改动面：game.js + scripts/verify-game.cjs 仅两文件；verify-game §14 纯新增（几何矩阵/4×3×2 窗口矩阵/六档/叠加/事件/50 局 soak/F1~F8）","VERSION 裁定：代码头保持 2.3.0（verify-constants 硬编码 EXPECTED_VERSION 且 0-diff），产品 v3.5 验收入库时登记 memory.md","任务拆分：T1 game.js / T2 verify-game.cjs（合同冻结可并行）/ T3 收口验证（七套全绿+0-diff+分支 feat/feature 不提交，验收后同批提交）/ T4-P1 徽标可选分离"],"verifyScripts":["node scripts/verify-game.cjs","node scripts/verify-audio.cjs","node scripts/verify-ui.cjs","node scripts/verify-constants.cjs","node scripts/assembly-check.cjs","node scripts/qa-e2e-jsdom.cjs"],"modules":{"/game.js":"T_SPIN_BONUS 常量 + tspinKind/tspinBonus 纯函数 + tspinPending 窗口 + lockFlow 插桩 + finishLock 叠加 + snapshot.tspin（additive）","/scripts/verify-game.cjs":"§14 r18 用例矩阵（AC-1~11 全覆盖 + F1~F8 样例表），纯新增","/verify-constants.cjs":"零改动回归托盘：VERSION===2.3.0 硬约束 → 代码不升版本"}}<!-- /state -->