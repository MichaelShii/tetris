<!-- meta: summary="r34 全局统计持久化技术方案：全局四项（placed/lines/timeMs/games）作为 persist.js 单键载荷 stats 字段纯增量扩展 + saveStats(delta) 只增不减累加出口（PAYLOAD_VERSION 保持 1）；game.js 非侵入增量——onStats 生命周期事件出口（OVER 定格入账 / 隐藏·卸载补记，幂等=statsAccounted + timeFlushWatermark），快照键集零追加；ui.js 纯追加 createGlobalStats 只读镜像组件（事件驱动低频刷新 + 破纪录 hi 同源）；index.html/style.css 纯追加第三卡与四档规则（S 竖屏 areas 后置覆写加行）；七套脚本 §r34 纯追加。" -->

# r34 全局统计持久化 — TECHNICAL（技术方案）

> **基线**：docs/teamflow/20260903-r32-stats-panel（本局组三项会话指标语义/布局零回归）+ docs/teamflow/20260904-r33-lock-move-reset（即时前序）。本方案为**增量扩展**；唯一语义调整（突破 r32「统计不入持久化」非目标）已在 PRD §1 声明。设计依据：DESIGN.md（展示面定稿）+ PRD.md（11 条 AC）。
> **代码形态**：扁平纯 JS + UMD（window.TetrisGame / TetrisUI / TetrisPersist），零构建零依赖（AGENTS.md §4）。

## 0. 方案速览

| 决策点 | 结论 | 依据 |
|---|---|---|
| 全局四项载体 | persist.js 单键载荷新增 `stats` 字段（placed/lines/timeMs/games），PAYLOAD_VERSION 保持 1 | AC-2/AC-3；与 keybindings/dockSkin「additive 不升版」先例同构 |
| 持久化出口 | 新增 `saveStats(delta)`：**只增不减累加**（每字段 sanitize 非负整数后叠加），空增量快路径不写盘 | AC-2「只增不减/清洗/降级」；与 saveHighScore「max 镜像」模式同源但语义为增量（引擎不持有累计值，累计单一事实在 persist） |
| 引擎入账/补记 | game.js 纯增量：新 `onStats` 事件出口（'over' 定格入账 / 'flush' 时长补记）+ 公共 `flushTime()` + 幂等标记（`statsAccounted` + `timeFlushWatermark`）；**快照键集零追加** | AC-1（r32 §4.1-9 键集断言不动）/AC-4/5/6/7；M2 归 game.js |
| 事件面 | 不新增任何 sfx 事件；`#hi-score`/`#session-announce` 及既有 onSfx 序列 0 变化 | AC-9 |
| UI 展示 | 纯追加第三卡 `#global-stats`（恰 5 行 `.global-stat`），「本局组」= 既有两卡合计；createGlobalStats 只读镜像 persist 载荷，事件驱动低频刷新（无每秒刷新） | AC-8；DESIGN §1.2/§6 |
| 布局 | 桌面/M 行式；S 竖屏 `#main` areas **后置覆写**追加 `'global'` 行（r32 规则体零动）；S 横屏自包含玻璃卡（不进卡化列表）；order:13 | AC-8；DESIGN §2.2/2.3/2.4；verify-ui r17/r19/r32 断言零改动 |
| 验证 | verify-persist / verify-game / verify-ui / qa-e2e / assembly-check 各追加 §r34 段，**既有断言期望零改动**；verify-audio / verify-constants 0 行 | AC-10 |

**口径锚点（PRD §1）**：OVER 定格一次性入账（次数+1、方块/消行/时长按定格值累加）；隐藏（visibilitychange→hidden）/卸载（pagehide、beforeunload）补记当前局**未入账时长**；暂停不计时长；读入账值=时间戳差值累计（沿用 `sessionTimeMs` 的 tick dt 差值口径，非乘法计数，漂移不随风化累积）。

## 1. 数据模型与存储（persist.js，仅增量）

### 1.1 载荷结构（单键 `tetris.v2`，PAYLOAD_VERSION=1，纯增量）

```js
// 既有（逐字不动）：{ version: 1, highScore: number, settings: {...} }
// r34 增量：
{
  version: 1,
  highScore: 120,
  settings: { /* 存量逐字不动 */ },
  stats: { placed: 0, lines: 0, timeMs: 0, games: 0 }   // ← 新增（旧载荷缺省全 0，AC-3）
}
```

- `stats` 四字段语义（PRD §1 数据分界②）：`placed` 累计已放置方块数、`lines` 累计消行总数、`timeMs` 累计游戏时长（**毫秒整型**）、`games` 对局次数；**只增不减，随入账递增**。
- 常量新增：`const DEFAULT_STATS = { placed: 0, lines: 0, timeMs: 0, games: 0 }`（导出，供测试/UI 默认）。
- 清洗 schema（复用既有 `sanitize`，四字段同款）：`{ type: 'integer', min: 0, max: Infinity, def: 0 }`（负/NaN/越界→0 或收敛，绝不 throw）。

### 1.2 改动点（存量方法逐字不动，仅四处函数内新增）

| 位置 | 改动 |
|---|---|
| `readState()`（persist.js ≈L356） | 返回对象追加 `stats: { placed/lines/timeMs/games }`，各自 `sanitize(obj.stats.<k>, INT_SCHEMA)`；`obj.stats` 缺失/非对象 → 全 0（**AC-3 旧数据兼容**） |
| `encode()`（≈L382） | 序列化对象追加 `stats: state.stats`（四字段透传已清洗值） |
| 导出面（≈L491） | 返回对象追加 `DEFAULT_STATS` 与 `saveStats` |
| 文件头注释 | 追加一句 r34 变更说明（版本号 **VERSION 2.6.0 不动**，AC-9） |

`load()` 读取出口天然升级：返回 `{ highScore, settings, stats }`（旧载荷 stats 全 0，highScore/settings 原值保留——AC-3 断言点）。

### 1.3 saveStats(delta) 契约（新增出口，与 saveHighScore/saveSettings 同级）

```js
/**
 * saveStats(delta) — 全局统计只增不减累加（累计唯一事实在 persist 层）。
 * @param {{placed?:number, lines?:number, timeMs?:number, games?:number}} delta 增量（引擎 onStats 事件载荷的透传）
 * @returns {boolean} 写盘成功（含空增量快路径按成功返回；dispose 后 false；内存降级也称成功——与 saveHighScore 同语义）
 */
function saveStats(delta) {
  if (disposed) return false
  const d = delta && typeof delta === 'object' ? delta : {}
  const add = {
    placed: sanitize(d.placed, INT_SCHEMA),   // 非负整数，负/NaN → 0（只增不减天然成立）
    lines:  sanitize(d.lines,  INT_SCHEMA),
    timeMs: sanitize(d.timeMs, INT_SCHEMA),
    games:  sanitize(d.games,  INT_SCHEMA),
  }
  if (add.placed === 0 && add.lines === 0 && add.timeMs === 0 && add.games === 0) return true // 空增量：不写盘（幂等快路径）
  const current = load()                       // 读当前（含旧数据兼容清洗），保持 highScore/settings 原值
  const merged = {
    highScore: current.highScore,
    settings: current.settings,
    stats: {
      placed: current.stats.placed + add.placed,
      lines: current.stats.lines + add.lines,
      timeMs: current.stats.timeMs + add.timeMs,
      games: current.stats.games + add.games,
    },
  }
  return commit(merged)
}
```

- **非目标**：不做清零/回滚/绝对写（防 UI 双写漂移）；不做跨设备同步（PRD §3）。
- 幂等归因：引擎侧水印保证增量单次到达；persist 侧为纯加法器，重复增量由引擎幂等标记拦截（§4）。

## 2. API 设计

### 2.1 引擎事件出口（game.js）

```js
// createGame opts 新增（对齐 onSfx ≈L584 解析风格）：
onStats: typeof opts.onStats === 'function' ? opts.onStats : null   // 生命周期入账/补记事件出口

// 载荷（增量语义，恒非负整数）：
//   { reason: 'over'  | 'flush',
//     placed: int≥0, lines: int≥0, timeMs: int≥0, games: 0|1 }
//   'over'  → OVER 定格入账：placed=piecesPlaced(整局定格)、lines=state.lines、timeMs=sessionTimeMs−timeFlushWatermark、games=1（恒发一次）
//   'flush' → 补记当前局未入账时长：placed=0、lines=0、timeMs=sessionTimeMs−timeFlushWatermark、games=0（delta>0 才发）
```

### 2.2 引擎公共方法（新增一个）

```js
flushTime()  // 补记当前局时长（未入账增量 → onStats 'flush'）：RUNNING 判定 + 水印差值；幂等；测试/宿主可直调（Node 无 DOM）
```

### 2.3 persist 出口（§1.3）+ UI 组件

```js
// TetrisPersist.createPersistence() → { load, saveHighScore, saveSettings, saveStats, dispose }
// TetrisUI.createGlobalStats(els) → { update(payload), dispose }   // 签名平行 createSessionStats
// createUI options.persist 需含 saveStats（缺失兼容：等效旧版，onStats 接线跳过持久化，UI 静默）
```

## 3. 前端组件与页面拆分

### 3.1 index.html（纯追加，挂载点 = `#session-stats` 闭合 `</div>`（现 L69）之后、`.hold-well`（L70）之前）

```html
<!-- r34：全局统计独立面板（纯追加；「本局组」= .stat-grid + #session-stats 既有两卡合计，勿塞入两冻结卡） -->
<div id="global-stats" class="global-stats" role="group" aria-label="全局统计">
  <h3 class="global-stats__title">全局统计</h3>
  <div id="gs-hi" class="global-stat">
    <span class="global-stat__label">最高分</span>
    <output id="gs-hi-value" class="global-stat__value" aria-live="polite" aria-label="最高分">0</output>
  </div>
  <div id="gs-placed" class="global-stat">
    <span class="global-stat__label">累计方块</span>
    <output id="gs-placed-value" class="global-stat__value" aria-live="polite" aria-label="累计已放置方块数">0</output>
  </div>
  <div id="gs-lines" class="global-stat">
    <span class="global-stat__label">累计消行</span>
    <output id="gs-lines-value" class="global-stat__value" aria-live="polite" aria-label="累计消行总数">0</output>
  </div>
  <div id="gs-time" class="global-stat">
    <span class="global-stat__label">累计时长</span>
    <output id="gs-time-value" class="global-stat__value" aria-live="polite" aria-label="累计游戏时长">00:00</output>
  </div>
  <div id="gs-games" class="global-stat">
    <span class="global-stat__label">对局次数</span>
    <output id="gs-games-value" class="global-stat__value" aria-live="polite" aria-label="对局次数">0</output>
  </div>
</div>
```

- 初值 0/0/0/00:00/0（装配时由 persist 载荷覆写；DESIGN §2.1 原样）。
- **冻结声明①**：`.stat-grid`（L34-51）与 `#session-stats`（L54-69）逐字不动；h3 序列 h1→h2(overlay/settings)→h3(session)→h3(global) 无破坏。

### 3.2 style.css（纯追加，文件末尾 r32 面板块（L2166-2197）之后追加一个 r34 块）

```css
/* ═ r34 全局统计面板（#global-stats 第三卡；纯追加，既有规则体零动） ═ */
/* ① 基座行式（桌面/M/L：#panel-left 内自然排列；镜像 .session-* 同款） */
.global-stats { display: flex; flex-direction: column; gap: var(--sp-1); }
.global-stats__title { font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: var(--sp-2); }
.global-stat { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); }
.global-stat__label { font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.global-stat__value { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); line-height: 1.1; font-size: var(--fs-lg); }
.global-stat.is-flashing .global-stat__value { animation: stat-flash 120ms ease-out; }
@media (prefers-reduced-motion: reduce) { .global-stat.is-flashing .global-stat__value { animation: none; } }
/* ② S 档（<600px）ORDER 槽位：紧随 .session-stats(order:12)、先于 #btn-settings(order:20) */
@media (max-width: 599px) {
  .global-stats { order: 13; }
  /* ③ S 竖屏：#main areas 后置覆写追加 'global' 行（r32 规则体零动；同特异度、声明在后 → 胜出） */
  @media (orientation: portrait) {
    #main { grid-template-rows: auto auto auto auto minmax(0, 1fr); grid-template-areas:
      'stats stats stats'
      'session session session'
      'global global global'
      'controls controls controls'
      'hold board next'; }
    .global-stats { grid-area: global; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
    .global-stats__title { display: none; }
    .global-stat { flex-direction: column; gap: var(--sp-1); }
  }
  /* ④ S 横屏：自包含玻璃卡（复刻 r32 卡化四件套；不进既有卡化选择器列表） */
  @media (orientation: landscape) {
    .global-stats { width: 100%; max-width: 420px; background: var(--glass-bg); -webkit-backdrop-filter: blur(20px) saturate(140%); backdrop-filter: blur(20px) saturate(140%); border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--sp-3); margin: var(--sp-2) 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
    .global-stats__title { display: none; }
    .global-stat { flex-direction: column; gap: var(--sp-1); }
  }
}
```

- 既有 `@keyframes` 零新增（复用 `stat-flash`）；零新增 token；r19/r32 子串断言（'hold board next'、'session session session'、order:12、卡化列表行）全部保持命中。
- **董事会高度复核项**：S 竖屏多一行 ≈+68px，`#board` 可玩高度 526→≈458px（375×667 估算）——TECH 侧判定：仍满足可玩（≥400px 保底），列为 P1 人工核对（DESIGN §7 风险表，备选「合入 session 行区域」**不默认采用**）。

### 3.3 ui.js（纯追加 createGlobalStats + 装配接线）

**组件**（平行 `createSessionStats`，放在其定义之后、`createUI` 之前）：

```js
/** r34：全局统计只读渲染组件（签名平行 createSessionStats）→ { update, dispose }。
 * els: { hi, placed, lines, time, games }——#gs-hi-value / #gs-placed-value / #gs-lines-value /
 *   #gs-time-value / #gs-games-value（createUI 内 must()×5 装配，缺失即抛错）。
 * 只读镜像 persist 载荷（禁独立累计，AC-4 漂移红线）：update(payload) 接受**部分**载荷
 *   { hi?, placed?, lines?, timeMs?, games? }，缺省字段跳过；值文本变更才写 + 行级 .is-flashing
 *   闪动（120ms，复用 stat-flash）；timeMs 经 formatSessionTime（mm:ss / ≥1h hh:mm:ss，与 r32 同函数）。
 * flash 小段与 createHud/createSessionStats 刻意重复（≤8 行，不抽公共 helper——抽离须改既有组件，
 * 违反既有逻辑零改红线；r32 已接受此受控重复，承继同款理由）。 */
function createGlobalStats(els) {
  const timers = new Map()
  function flash(block) { /* 同 createSessionStats.flash（clearTimeout 防连闪叠置） */ }
  function setText(el, value) { if (el.textContent !== value) el.textContent = value }
  function setNum(el, value) {
    const t = String(value)
    if (el.textContent !== t) { setText(el, t); flash(el.parentElement) }
  }
  function update(p) {
    if (!p || typeof p !== 'object') return
    if (typeof p.hi === 'number') setNum(els.hi, p.hi)
    if (typeof p.placed === 'number') setNum(els.placed, p.placed)
    if (typeof p.lines === 'number') setNum(els.lines, p.lines)
    if (typeof p.timeMs === 'number') setNum(els.time, formatSessionTime(p.timeMs))
    if (typeof p.games === 'number') setNum(els.games, p.games)
  }
  function dispose() { timers.forEach(function (t) { clearTimeout(t) }); timers.clear() }
  return { update: update, dispose: dispose }
}
```

**createUI 装配接线**（四处纯追加）：

| 位置 | 追加 |
|---|---|
| ≈L1497 后（sessionStats 组件之后） | `const globalStats = createGlobalStats({ hi: must('#gs-hi-value'), placed: must('#gs-placed-value'), lines: must('#gs-lines-value'), time: must('#gs-time-value'), games: must('#gs-games-value') })` |
| persist 块之后 / load 恢复块（≈L1907-1930） | 定义镜像 `const statsUi = { hi: persistedHighScore, placed: 0, lines: 0, timeMs: 0, games: 0 }`；`loaded.stats` 存在则覆写四值；随后 `globalStats.update(statsUi)`（初值镜像，缺省 0/00:00） |
| createGame opts（onSfx 之后，≈L2059-2061） | `onStats: function (delta) { if (persist && typeof persist.saveStats === 'function') { try { persist.saveStats(delta); const st = persist.load(); statsUi.hi = st.highScore; statsUi.placed = st.stats.placed; statsUi.lines = st.stats.lines; statsUi.timeMs = st.stats.timeMs; statsUi.games = st.stats.games; globalStats.update(statsUi) } catch (e) { /* 契约不 throw，兜底不中断 */ } } }` |
| onSnapshot 破纪录分支（≈L2045-2049） | `updateHiScoreEl()` 之后追加 `statsUi.hi = persistedHighScore; globalStats.update({ hi: persistedHighScore })`（**同源恒等**：与 #hi-score 同一变量，破纪录时点同帧；冻结声明①） |
| dispose 链（≈L2331 sessionStats.dispose 旁） | `globalStats.dispose()` |
| 导出面（≈L2399 createSessionStats 旁） | `createGlobalStats: createGlobalStats` |

### 3.4 状态管理（数据流与幂等）

```
引擎（game.js 闭包：piecesPlaced / sessionTimeMs / statsAccounted / timeFlushWatermark）
  │  OVER 定格 / 隐藏·卸载补记
  ▼  onStats({reason, placed, lines, timeMs, games})   ← 事件出口（快照键集零追加）
ui.js 装配（onStats 回调，唯一接线点）
  ▼  persist.saveStats(delta)   →   persist.load()   ← 累计唯一事实在 persist 层
statsUi 镜像（仅此两点覆写：onStats 全量 / 破纪录 hi 增量）→ globalStats.update()（只读渲染）
```

- **幂等标记**（引擎侧，AC-4/5）：`statsAccounted`（OVER 入账后置 true，start/restart 置 false——重入/二次 OVER 帧拦截）+ `timeFlushWatermark`（本局会话已入账时长 ms；每次 flush/over 后推进，差值=只发未入账部分——同帧双触发/多事件自然归零）。**双标记职责不同不作合并**。
- UI 侧**零累计**：statsUi 仅由 persist 载荷（onStats 读回）与 persistedHighScore（破纪录）覆写——「UI 只读镜像 persist 载荷」红线（DESIGN §1.1）。

## 4. 关键实现点与边界（game.js 增量细目）

### 4.1 引擎增量清单（全部纯增量；tick/lockFlow/softDrop/hardDrop/rotate/hold/重力/T-spin/combo/B2B 规则逐字节不动）

| 位置 | 追加内容 |
|---|---|
| createGame opts（≈L584 旁） | `onStats: typeof opts.onStats === 'function' ? opts.onStats : null` |
| 会话闭包（r32 计数旁，≈L634） | `let statsAccounted = false`；`let timeFlushWatermark = 0` |
| 新函数（r33 helper 区后） | `emitStats(reason, placed, lines, timeMs, games)`（disposed/无回调/全零 → 早退）；`accountOver()`（statsAccounted 幂等：置 true → delta=timeMs=sessionTimeMs−timeFlushWatermark, placed=piecesPlaced, lines=state.lines, games=1 → 推进水印 → emitStats）；`flushTime()`（`if (disposed || statsAccounted || state.phase !== 'RUNNING') return`；delta=sessionTimeMs−timeFlushWatermark；`delta<=0` 早退；推进水印；`emitStats('flush', 0,0,delta,0)`）；`onPageHide()/onBeforeUnload()` → `flushTime()` |
| `start()`（≈L822-823 归零旁） | `statsAccounted = false; timeFlushWatermark = 0`（与 piecesPlaced=0/sessionTimeMs=0 同批） |
| `restart()`（≈L849-850 歸零旁） | 同上（OVER 出口必经 restart，新会话复位） |
| OVER 入口①：`finishLock` 出生碰撞分支（≈L788 后、return 前） | `accountOver()`（此刻 piecesPlaced/lines/sessionTimeMs 已定格） |
| OVER 入口②：`lose()`（≈L1097 sfx('gameOver') 后） | `accountOver()`（phase 状态机保证两入口互斥 + statsAccounted 兜底重入） |
| `onVisibilityChange()`（≈L1124-1126） | 条件内追加 `flushTime()` **先于** `togglePause()`（同 handler、同帧：先补记此时仍 RUNNING 的已玩时长，再自动暂停；顺序不可反） |
| 生命周期注册（≈L1360 旁，`isBrowser` 守卫） | `window.addEventListener('pagehide', onPageHide)` + `window.addEventListener('beforeunload', onBeforeUnload)`（**不受 autoPauseOnBlur 门控**——补记必须恒可用） |
| `dispose()`（≈L1337-1340 旁） | `isBrowser` 时对称移除 pagehide/beforeunload |
| 公开 API（≈L1313 tick 旁） | `flushTime: flushTime`（Node 测试/宿主直调，无需构造 DOM 事件） |

### 4.2 边界与口径（逐条）

1. **OVER 双入口**：`finishLock` 出生碰撞与 `lose()` 均可达 OVER；`accountOver()` 集中于两入口调用，`statsAccounted` + phase 状态机=单次（AC-4「后续重复触发不再叠加」）。
2. **隐藏时序**：visibilitychange→hidden 同帧内**先补记后暂停**——切后台时长入账且不虚增（已暂停部分本就不在 sessionTimeMs）。
3. **同帧双触发/多事件幂等**：blur+visibilitychange、pagehide+beforeunload 同帧先后 → 第一次 delta>0 发事件、其后 delta=0 早退（AC-4/5 脚本「隐藏→可见→再隐藏仅 +1 次」由水印保证——第二次隐藏时 phase 已 PAUSED 更直接拦截）。
4. **暂停**：`flushTime()` 仅 RUNNING 判定；用户暂停后隐藏/关页 → 不补记（**PRD AC-5 书面口径**：暂停中的局不产生补记）；暂停段本就不入 sessionTimeMs → 入账/补记值天然不含暂停段（AC-7）。
5. **用户暂停后关页的时长**：按 AC-5 口径该局不记全局（不 OVER 不补记）——属 PRD 确认语义，列入 P1 人工核对（「暂停中隐藏→补记值不含暂停段」）。
6. **中途刷新/关页（AC-6）**：pagehide/beforeunload 时 phase RUNNING → `flushTime()` 入账；全局四项恢复显示（重开读键）；局内五项随会话丢（预期）。
7. **移动端后台回收**：visibilitychange→hidden 先行补记，pagehide 兜底双保险（PRD §7 风险表）；pagehide 不可靠场景由前者覆盖。
8. **READY 态**：sessionTimeMs=0 → flush delta=0 早退，不发事件。
9. **漂移（AC-10 soak）**：时长口径沿用 `sessionTimeMs`（tick 首行 `sessionTimeMs += dt`，dt 为 rAF 差值、clamp≤250）——差值累计非计数乘法，误差不随风化累积；soak 断言：确定性子序列 dt 之和 == flush/over 事件 timeMs 增量之和。
10. **旧载荷/坏 JSON/降级（AC-3）**：payload 无 stats → readState 全 0；坏 JSON/版本不符 → 既有清键回默认；localStorage 不可用 → 内存 Map 下 saveStats 静默成功、绝不 throw。
11. **onSfx 0 变化**：flush/over 通道零 sfx 调用（验证：事件序列与既有基线恒等）。
12. **快照键集 0 追加**：r32 §4.1-9「16 既有键 + 恰 2 新字段」断言原样通过（入账数据走 onStats 事件，不经快照）。

## 5. 测试策略（§r34 纯追加，旧期望零改动）

| 脚本 | §r34 追加用例（文件末尾纯追加段） | 挂接 |
|---|---|---|
| `scripts/verify-persist.cjs` | DEFAULT_STATS 导出 + load 初始全 0；saveStats 写入→读出 roundtrip（跨实例恢复）；**只增不减**（负/NaN 增量 → 0 不叠加；浮点 floor）；**空增量不写盘**（backing 字符串不变）；旧载荷（仅 highScore+settings）→ stats 全 0 且 highScore 原值保留；内存降级 saveStats 不 throw 返回 true；dispose 后 false；混合保留（saveStats 后 highScore/settings 原值不变） | L441 后追加 |
| `scripts/verify-game.cjs` | §r34 段（onStats 记录器，无需 DOM）：① 键集零追加（既有 §4.1-9 原样穿过）；② OVER 入账恰 1 次（hardDrop×3 + tick 1s → lose → {reason:'over',placed:3,lines:0,timeMs:1000,games:1}，二次 lose 不重发）；③ 两局累加（局1 定格→restart→局2 定格：两事件之和 placed=N1+N2 / games=2 / timeMs=t1+t2）；④ flush 幂等（RUNNING tick 1s→flushTime→{flush,timeMs:1000}；再 +500→{timeMs:500}；无 tick 再 flush → 不发；PAUSED flush → 不发；OVER flush → 不发）；⑤ 暂停不计（tick 1s + 暂停 2s + 恢复 1s → over timeMs=2000）；⑥ 刷新不丢等价（tick 1s → flushTime（=pagehide）→ 再 lose → over 事件 timeMs=0 余量 + games=1 + placed 全额）；⑦ start/restart 重置（OVER→restart→tick 500→flush → {timeMs:500}，无跨局残留）；⑧ 事件面 0 变化（flush/over 全程零 sfx 事件追加）；⑨ soak 无漂移（确定性子序列 dt（含 17/250/31ms 抖动分片）→ flush delta 恒等于 dt 之和） | r33 段后追加（文件尾 ≈L3652） |
| `scripts/verify-ui.cjs` | §r34 段（镜像 r32 §4.2）：① index.html `#global-stats` 节点契约（role=group + aria-label=全局统计 + 恰 5 行 `.global-stat` + 5 对 `aria-label` 完整名 + 初值 0/0/0/00:00/0）；② 位置序 `#session-stats 闭合 < #global-stats 开 < .hold-well 开`；③ 隔离（.stat-grid 内 .stat 仍恰 4、.session-stat 仍恰 3）；④ style.css 源扫描：`.global-stat.is-flashing` 闪动规则复用 `stat-flash`、r34 文末块锚点 `/* ═ r34 全局统计面板` 起片段**零 @keyframes 声明**、含 `'global global global'` 且仍含 `'session session session'`、`/#main\s*\{[^}]*'hold board next'/` 仍命中、存在 `.global-stats { order: 13; }`（行格式 `\n  .global-stats { order: 13; }`）、卡化选择器列表行不含 `.global-stats`、r34 片段不含既有规则正文行（防整段复制改写） | r32 §4.2 后追加（≈L1217 后） |
| `scripts/qa-e2e-jsdom.cjs` | §r34 段（镜像 r32 §4.3）：① file:// 自动装配页含 `#global-stats`、初值 0/0/0/00:00/0；② 真实装配（注入共享 backing persist，autoLoop:false 手动 tick）：初始镜像→落定×3→lose → `#gs-placed-value`=定格值、`#gs-games-value`='1'、`#gs-time-value`=formatSessionTime(sessionTimeMs)；预置 saveHighScore(120) → 初值高分行 '120' 且 OVER 后不变（同源镜像）；③ 刷新不丢：tick N 秒 → `window.dispatchEvent(new Event('pagehide'))` → 同 backing 新 persist+新 UI → `#gs-time-value` 恢复（≥N，formatSessionTime 粒度容差）；④ 幂等：pagehide 二次触发 → backing 载荷无二次叠加；visibilitychange 双隐藏（hidden→可见→再 hidden）→ 全局时长仅 +1 次；⑤ 暂停不计：暂停→tick→pagehide → timeMs 增量 0；⑥ 独立 `createGlobalStats` 组件：部分载荷更新/文本变更才写/闪动类挂卸；⑦ 源码级：`#touch-controls` 区域片段无 `global-`（面板不落行式底栏/双轨）、css 无 `.touchpad .global-*` 交叉规则、`#gs-*` 六锚点装配（must 契约） | r32 §4.3 后追加（≈L3122 后） |
| `scripts/assembly-check.cjs` | 纯追加两项：createPersistence 契约清单补 'saveStats'（L32）；DOM 选择器表补 '#global-stats','#gs-hi-value','#gs-placed-value','#gs-lines-value','#gs-time-value','#gs-games-value'（L44-55）。既有项零改动 | L34/L55 处 |
| `scripts/verify-audio.cjs`、`scripts/verify-constants.cjs` | **0 行 diff**（audio 0 行；VERSION 三模块与 persist 模块版本、PAYLOAD_VERSION 不动） | — |

**红线复核（AC-9/10）**：game 规则面（tick/lockFlow/softDrop/hardDrop/rotate/hold/重力/T-spin/combo/B2B/键位/触控回放）逐字节不动；onSfx 事件面与既有测试期望恒等；persist 存量方法逐字不动；VERSION 三模块一致；七套脚本全绿为出口标准，r32/r33 及更早断言期望零改动。

**人工补测清单（AC-11，P1，留产品验收）**：真机多标签/切后台补记时序（visibilitychange 双触发幂等）；移动端清后台（页面被回收）pagehide 补记；进行中刷新不丢；暂停不计时抽查；仅含旧 highScore 存档升级迁移（四项 0 起步）；长时间挂机时长精度（soak 真机）；读屏朗读新增面板文本不刷屏（polite 低频）；横屏双轨与竖屏行式两组展示不叠压 + S 竖屏棋盘高度（458px 预算）人工核对。

## 6. 任务拆分（对齐 PRD §8 里程碑 M1-M4；文件边界并行）

| 任务 | 文件（互斥，可并行） | 规格/验收点 |
|---|---|---|
| **T1（M1）持久化层** | `persist.js`、`scripts/verify-persist.cjs` | §1.3 saveStats + §1.1/1.2 载荷增量 + §5 verify-persist §r34；存量方法逐字不动；PAYLOAD_VERSION=1；verify-persist 九组既有用例+新组全绿 |
| **T2（M2）引擎入账/补记** | `game.js`、`scripts/verify-game.cjs` | §4.1 清单（onStats/flushTime/accountOver/水印/监听/双入口收集/归零复位）+ §5 verify-game §r34 ⑨ 项；快照键集零追加；r32/r33 全部既有断言原样穿过 |
| **T3（M3a）DOM 第三卡** | `index.html` | §3.1 卡纯追加于 L69-70 之间；两冻结卡逐字不动；脚本顺序不变 |
| **T4（M3b）样式四档** | `style.css` | §3.2 r34 块纯追加（基座/order 13/竖屏 areas 后置覆写+3+2 mini-grid/横屏自包含卡/reduced-motion）；既有规则体零动 |
| **T5（M3c）UI 组件+装配** | `ui.js`、`scripts/verify-ui.cjs` | §3.3 createGlobalStats + 四接线点（初始镜像/onStats/破纪录 hi/dispose/导出）+ §5 verify-ui §r34；既有 createHud/createSessionStats 逻辑零改 |
| **T6（M4a）端到端+装配审计** | `scripts/qa-e2e-jsdom.cjs`、`scripts/assembly-check.cjs` | §5 qa-e2e §r34 ⑦ 项 + assembly-check 纯追加两项 |
| **T7（M4b）收口** | 全量 | 七套全绿 + 红线复核（game 规则面/audio/persist 存量/onSfx/VERSION）+ soak 无漂移 + 人工补测清单 → 产品验收 |

- **并行序**：T1、T2 互相独立且不依赖 DOM；T3→T4→T5 顺序（DOM 契约先于 must() 装配先于 UI 断言）；T6 依赖 T1-T5；T7 收口。建议并发 T1‖T2‖(T3→T4→T5)，完成后 T6，再 T7。
- **git 约束（PRD §9 工程约束，务必备注进 T7）**：分支 `feat/global-stats-persistence`（已检出，不新建）；提交基线 = edaf348（merge feat/lock-move-reset）+ 2fcd468（merge feat/stats-panel）；未提交改动 = `docs/teamflow/memory.md`（M，PRD 阶段已更新持久化约定行）+ 任务夹 `docs/teamflow/20260904-r34-global-stats-persistence/`（PRD/DESIGN/TECHNICAL + 后续 QA-REPORT/ACCEPTANCE）——保留现状不 stash 不丢弃，随本需求实现一并提交；持久化红线=单键增量、PAYLOAD_VERSION=1、禁业务侧直接 setItem/getItem；七套全绿为回归出口标准（不加后门）。

<!-- blueprint -->{"summary":"r34 全局统计持久化：persist.js 单键载荷 stats 字段纯增量 + saveStats(delta) 只增不减累加出口，game.js 经 onStats 生命周期事件出口（OVER 定格入账/隐藏卸载补记，statsAccounted+timeFlushWatermark 双标记幂等，快照键集零追加），ui.js 纯追加 createGlobalStats 只读镜像组件（事件驱动低频刷新），index.html/style.css 纯追加第三卡与四档规则；七套脚本 §r34 纯追加零回归。","modules":{"/persist.js":{"responsibility":"stats 载荷（placed/lines/timeMs/games）字段增量扩展 + DEFAULT_STATS + saveStats(delta) 累加出口（只增不减/清洗/空增量快路径/降级不 throw）；load() 读取含 stats","dependsOn":[],"assemblyOrder":1,"why":"累计唯一事实收敛在 persist 层（镜像既有 persistedHighScore 模式），业务侧仅经 load/save* 消费、禁直接 setItem——存量方法逐字不动，PAYLOAD_VERSION 保持 1 纯增量向后兼容"},"/game.js":{"responsibility":"入账/补记通道：onStats 事件出口（'over' 定格入账/'flush' 时长补记）、公共 flushTime()、accountOver() 双 OVER 入口收集、statsAccounted/timeFlushWatermark 幂等标记、pagehide/beforeunload 监听 + visibilitychange 先补记后暂停；快照键集零追加、零新 sfx","dependsOn":[],"assemblyOrder":3,"why":"入账/补记是对局生命周期语义（OVER 定格/隐藏补记），天然归属引擎且沿用 r32 单一计数源（piecesPlaced/sessionTimeMs）不新造计数；事件出口保持引擎与持久化解耦（onSfx 先例），规则面 tick/lockFlow 等逐字节不动"},"/ui.js":{"responsibility":"createGlobalStats 只读镜像组件（签名平行 createSessionStats，部分载荷 update/文本变更才写/stat-flash 复用）+ createUI 四接线点（初始镜像、onStats→saveStats+load→更新、破纪录 hi 同源、dispose）+ 导出","dependsOn":["/persist.js","/game.js"],"assemblyOrder":4,"why":"UI 只读镜像 persist 载荷、禁独立累计（AC-4 漂移红线）；组件独立类名复用 must/flash/setText/formatSessionTime 惯例，既有 createHud/createSessionStats 逻辑零改"},"/index.html":{"responsibility":"第三卡 #global-stats 纯追加（role=group/aria-label/h3 + 恰 5 行 .global-stat + 五 output 初值），挂载于 #session-stats 闭合后 .hold-well 前","dependsOn":[],"assemblyOrder":2,"why":"DOM 契约与 ui.js must()×5 同批交付（r32 先例）；两冻结卡（.stat-grid 恰 4 块 .stat、#session-stats 恰 3 行 .session-stat）逐字不动"},"/style.css":{"responsibility":".global-* 规则纯追加：基座行式（镜像 session）、order:13 槽位、S 竖屏 #main areas 后置覆写追加 'global' 行 + 3+2 mini-grid、S 横屏自包含玻璃卡、reduced-motion；零新增 token/关键帧","dependsOn":[],"assemblyOrder":2,"why":"冻结断言（r17 stat-grid/r19 areas/r32 session 行与 order 12/卡化列表）零改动红线 → 新卡独立类名 + 后置覆写保既有规则体字节不变；stat-flash 复用零新关键帧"},"/scripts/verify-persist.cjs":{"responsibility":"§r34 纯追加：saveStats roundtrip/只增不减/空增量不写盘/旧载荷兼容/降级/dispose 后 false/混合保留","dependsOn":["/persist.js"],"assemblyOrder":5,"why":"持久化层回归锚点独立于既有六套（原脚本先例），既有九组用例期望零改动"},"/scripts/verify-game.cjs":{"responsibility":"§r34 纯追加：over 入账恰 1 次/两局累加/flush 幂等/暂停不计/刷新不丢等价/归零复位/事件面 0 变化/soak 无漂移/键集零追加穿过","dependsOn":["/game.js"],"assemblyOrder":5,"why":"确定性 dt 分片驱动（无墙体时钟，r32 先例），onStats 记录器为断言锚点而非快照新字段"},"/scripts/verify-ui.cjs":{"responsibility":"§r34 纯追加：index.html 节点契约/位置序/隔离/style.css 源扫描（闪动复用、零关键帧、areas 行、order 13、卡化列表不含、无整段复制）","dependsOn":["/index.html","/style.css","/ui.js"],"assemblyOrder":5,"why":"镜像 r32 §4.2 源扫描模式（锚点字串断言防结构漂移），旧断言期望零改动"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"§r34 纯追加：file:// 装配面板初值/真实装配入账/刷新不丢（同 backing 跨实例）/双触发幂等/暂停不计/独立组件/源码级隔离","dependsOn":["/ui.js","/persist.js","/game.js"],"assemblyOrder":6,"why":"镜像 r32 §4.3 注入共享存储跨实例模式（jsdom file:// 下 localStorage 不可用），验证 UI→persist 真实接线"},"/scripts/assembly-check.cjs":{"responsibility":"纯追加两项：createPersistence 契约清单补 saveStats、DOM 选择器表补 #global-stats+#gs-*×5；既有项零改动","dependsOn":["/persist.js","/index.html"],"assemblyOrder":6,"why":"装配审计随新契约同步加强（纯追加不弱化），保证 must()×5 与 DOM 同批交付"},"duplications":["flash 小段三处受控重复（createHud/createSessionStats/createGlobalStats ≤8 行）——r32 已接受的刻意重复，抽离须改既有组件违反零改红线","最高分双处显示（.stat-grid 冻结块 #hi-score + 全局组首行镜像）——刻意同源恒等（同一 persistedHighScore 变量、破纪录同帧更新），沿 r32 消行总数并列先例","statsAccounted（入账幂等）与 timeFlushWatermark（会话已入账时长水印）双标记职责不同（重入拦截 vs 差值归零），不作合并避免语义混淆"],"tasks":[{"title":"T1（M1）persist.js 载荷增量 + saveStats 出口 + verify-persist §r34","files":["/persist.js","/scripts/verify-persist.cjs"],"spec":"stats 四字段 readState/encode 增量 + DEFAULT_STATS + saveStats(delta) 只增不减累加（空增量快路径、旧载荷全 0、降级不 throw）+ verify-persist §r34 纯追加九项；存量方法逐字不动、PAYLOAD_VERSION=1"},{"title":"T2（M2）game.js 入账/补记通道 + verify-game §r34","files":["/game.js","/scripts/verify-game.cjs"],"spec":"onStats 事件出口 + public flushTime() + accountOver()（finishLock 出生碰撞/lose 双入口）+ statsAccounted/timeFlushWatermark + pagehide/beforeunload 监听与 dispose 对称移除 + visibilitychange 先补记后暂停 + start/restart 复位；快照键集零追加、零新 sfx；verify-game §r34 ⑨ 项"},{"title":"T3（M3a）index.html 第三卡 #global-stats 纯追加","files":["/index.html"],"spec":"§3.1 卡插于 #session-stats 闭合后 .hold-well 前（L69-70 之间），role=group/aria-label/h3 + 恰 5 行 .global-stat + 五 output 初值 0/0/0/00:00/0；两冻结卡逐字不动"},{"title":"T4（M3b）style.css .global-* 四档规则纯追加","files":["/style.css"],"spec":"§3.2 r34 块追加于文件尾（基座行式/order 13/S 竖屏 areas 后置覆写加 'global' 行+3+2 mini-grid/S 横屏自包含卡/reduced-motion），零新增 token/关键帧；既有规则体零动"},{"title":"T5（M3c）ui.js createGlobalStats + 装配接线 + verify-ui §r34","files":["/ui.js","/scripts/verify-ui.cjs"],"spec":"createGlobalStats（部分载荷 update/文本变更才写/flash 复用）+ 初始镜像/onStats 接线/破纪录 hi 同源同步/dispose/导出 + verify-ui §r34 段；既有组件逻辑零改"},{"title":"T6（M4a）qa-e2e §r34 + assembly-check 纯追加","files":["/scripts/qa-e2e-jsdom.cjs","/scripts/assembly-check.cjs"],"spec":"qa-e2e §r34 ⑦ 项（含同 backing 跨实例刷新不丢/双触发幂等/暂停不计）+ assembly-check 契约与选择器清单纯追加两项"},{"title":"T7（M4b）七套全绿 + 红线复核 + soak + 人工清单 → 验收（含 git 提交）","files":[],"spec":"七套全绿零回归；game 规则面/audio/persist 存量/onSfx/VERSION 红线复核；soak 无漂移；AC-11 人工补测清单；分支 feat/global-stats-persistence 提交（含 memory.md + 任务夹）"} ]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r34 技术方案定稿（docs/teamflow/20260904-r34-global-stats-persistence/TECHNICAL.md）：全局四项=persist.js 单键 stats 字段纯增量（PAYLOAD_VERSION=1）+ saveStats(delta) 只增不减累加出口（空增量快路径/旧载荷全 0/降级不 throw）；game.js 纯增量 onStats 生命周期事件出口（'over' 定格入账于 finishLock 出生碰撞与 lose 双入口 / 'flush' 时长补记）+ public flushTime() + statsAccounted+timeFlushWatermark 双幂等标记 + pagehide/beforeunload 监听 + visibilitychange 先补记后暂停，快照键集零追加零新 sfx；ui.js 纯追加 createGlobalStats 只读镜像组件（部分载荷 update/stat-flash 复用）+ 四接线点（初始镜像/onStats→saveStats+load/破纪录 hi 同源/dispose）；index.html/style.css 纯追加第三卡与四档规则（S 竖屏 areas 后置覆写加行、order 13、横屏自包含卡）；任务拆 T1-T7 对齐 M1-M4（T1‖T2‖T3→T4→T5→T6→T7），git=分支 feat/global-stats-persistence 提交含 memory.md+任务夹；七套脚本 §r34 纯追加，verify-audio/verify-constants 0 行。","memory":["saveStats(delta) 契约：只增不减累加、每字段 sanitize integer min0 def0、空增量返回 true 不写盘、dispose 后 false、内存降级静默成功；load() 返回含 stats，旧载荷全 0 highScore/settings 保留（AC-3）","engine onStats 契约 {reason:'over'|'flush', placed, lines, timeMs, games}：over=定格全量+games1 恒发一次；flush=仅未入账时长 delta>0 才发；accountOver 集中于 finishLock 出生碰撞（L788 后）与 lose（L1097 后）双入口，statsAccounted+timeFlushWatermark 双标记幂等；public flushTime() 供测试直调","visibilitychange 隐藏同 handler 先 flushTime() 后 togglePause()（顺序不可反）；pagehide/beforeunload 监听不受 autoPauseOnBlur 门控、dispose 对称移除；start/restart 复位两标记；用户暂停后隐藏不补记=PRD AC-5 书面口径（P1 人工核对）","ui.js 接线：statsUi 镜像仅两覆写点（onStats→persist.saveStats+load 全量 / onSnapshot 破纪录 hi 增量），禁 UI 独立累计；createGlobalStats(els)→{update(payload部分),dispose}，timeMs 走 formatSessionTime；must()×5 #gs-*；dispose 链+导出追加","style.css r34 块追加于文件尾（L2197 后）：基座行式镜像 session/order 13/S 竖屏 #main areas 后置覆写加 'global' 行（r32 规则体零动）+3+2 mini-grid/S 横屏自包含卡不进卡化列表/reduced-motion；零新 token/关键帧；S 竖屏棋盘 526→≈458px 为 P1 人工复核项","验证：verify-persist/verify-game/verify-ui/qa-e2e 各追加 §r34 段、assembly-check 纯追加两项（saveStats 契约+#gs-* 选择器）、verify-audio/verify-constants 0 行；旧断言期望零改动（r32 §4.1-9 快照键集 16+2 穿过、r17 .stat 恰 4、r32 .session-stat 恰 3、r19/r32 areas 子串、order 10/12/20、卡化列表行）；soak=确定性 dt 分片之和==flush/over 增量之和","任务 T1-T7 对齐 PRD 里程碑 M1-M4：T1 persist+verify-persist ‖ T2 game+verify-game ‖ T3 index.html→T4 style.css→T5 ui.js+verify-ui，T6 qa-e2e+assembly，T7 七套全绿+红线复核+提交；git=分支 feat/global-stats-persistence，提交含 memory.md（M）+任务夹，基线 edaf348/2fcd468"]}<!-- /state -->