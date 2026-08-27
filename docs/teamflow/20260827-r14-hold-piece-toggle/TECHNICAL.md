# 技术方案 — Hold 暂存方块功能（r14）

- 版本：**r14**（r13 → r14 增量：Hold 暂存方块功能）
- 关联 PRD：`docs/teamflow/20260827-r14-hold-piece-toggle/PRD.md`（AC-1 ~ AC-17）
- 关联 DESIGN：`docs/teamflow/20260827-r14-hold-piece-toggle/DESIGN.md`（§1 ~ §8）
- 基线依赖：r13 消行动画缓动（`docs/teamflow/20260825-r13-lineclear-easing`）

---

## §1. 架构总览

Hold 功能横跨全部六个模块，改动面最小化——全部复用既有模式（toggle/闭包/UMD），无新增架构概念。

```
game.js ─── hold() 方法（暂存槽状态管理 + 交换/存入 + 方块替换）
   │
   ├─→ SFX_EVENTS 新增 'hold'（§2.1）
   ├─→ state 新增 holdPiece 字段（§3.1）
   ├─→ lockFlow / finishLock 中清空暂存槽（§3.2）
   ├─→ restart 中清空暂存槽（§3.3）
   ├─→ snapshot() 新增 holdPiece 字段（§3.4）
   └─→ 公开 API 新增 hold() / getHoldPiece()（§3.5）

audio.js ─── SFX_EVENTS 新增 'hold' + SFX_DEFS 新增 hold 合成参数（§4）

ui.js ────── hold 闭包态 + 暂存预览渲染 + 设置开关 + 按键绑定 + 持久化接线（§5）

persist.js ── DEFAULT_SETTINGS 新增 holdEnabled + sanitize/readState/encode 扩展（§6）

index.html ── #hold-well DOM + #btn-hold DOM + 键位图例（§7）

style.css ─── #hold-well 样式 + #btn-hold 样式（§8）
```

---

## §2. 音效层（audio.js）

### §2.1 SFX_EVENTS 扩展

```diff
- const SFX_EVENTS = ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver']
+ const SFX_EVENTS = ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold']
```

位置：`game.js` 顶部常量区（§1），`audio.js` 通过 `SFX_DEFS` 键集与之对齐。

> **约束**：`assembly-check.cjs` 断言 `SFX_DEFS` 键 === `SFX_EVENTS` 排序后一致——新增 `'hold'` 后需同步更新 assembly-check 的硬编码排序字符串（§9.6）。

### §2.2 hold 合成音效参数

```javascript
hold: {
  waveform: 'sine',       // 清脆拾取质感
  freq: 523,              // C5 高音（与 clear 660Hz 可区分）
  duration: 0.18,         // 180ms（短促，符合 150~250ms 范围）
  attack: 0.005,
  decay: 0.175,
  peak: VOICE_PEAK,       // 复用 0.22 防削波
}
```

**可区分性证明**：`hold` 523Hz/sine/180ms 与现有 7 音效——基频差值最小为 `levelUp` 523Hz（同频）但 `levelUp` 为 arpeggio 3 音/320ms，波形/时长/结构完全不同，听感可区分。

### §2.3 导出面影响

`audio.js` 导出面不变（`SFX_DEFS` 为 object，新增键自动包含）；`verify-audio.cjs` 的事件集断言需更新为 8 键。

---

## §3. 引擎层（game.js）

### §3.1 状态扩展

`state` 对象新增字段：

```javascript
// 在 state = { ..., clearing: null } 之后新增：
holdPiece: null,   // 暂存槽：null 或 { type: string }（仅存 type，rot/x/y 由 spawn 重置）
```

设计决策：暂存槽仅存 `type`（字符串），不存完整 piece 状态（rot/x/y）。原因：
1. PRD AC-4 明确要求"重置旋转状态为 rot=0，从棋盘顶部中央位置开始下落"——交换/取出时调用 `spawn(type)` 即可，无需存储冗余坐标。
2. 与 queue.next() 的返回值格式一致（均只返回 type 字符串），保持数据流对称。
3. 最小化快照体积。

### §3.2 lockFlow 清空暂存槽（AC-15）

在 `lockFlow()` 函数中，**piece 置 null 之后**新增清空逻辑：

```javascript
function lockFlow() {
  const merged = merge(state.board, state.piece)
  const res = clearLines(merged)
  state.piece = null
  state.lockTimer = 0
  state.gravityAcc = 0
  // [r14] AC-15：holdEnabled 关闭时，当前方块锁定后清空暂存槽
  // 注意：holdEnabled 由 UI 层通过 setHoldEnabled 控制，引擎只读闭包变量
  if (!holdEnabled && state.holdPiece !== null) {
    state.holdPiece = null
  }
  // ... 其余 clearing 子阶段/finishLock 逻辑不变
}
```

**关键设计**：`holdEnabled` 是引擎内部闭包变量（由 `setHoldEnabled` setter 控制），不依赖 UI 层。引擎在每次锁定时检查——若 hold 已关闭且暂存槽非空则清空（AC-15）。

### §3.3 restart 清空暂存槽

```javascript
function restart() {
  // ... 现有重置逻辑 ...
  state.holdPiece = null  // [r14] restart 清空暂存槽
  // ... 其余不变
}
```

### §3.4 snapshot() 扩展

```javascript
function snapshot() {
  return {
    // ... 现有字段 ...
    holdPiece: state.holdPiece ? state.holdPiece.type : null,  // [r14] 暂存槽类型（null 或 type 字符串）
  }
}
```

快照中 `holdPiece` 为 `string | null`（仅 type），供 `ui.js` 渲染暂存预览。

### §3.5 hold() 方法

```javascript
/**
 * Hold 暂存操作（r14，AC-1 ~ AC-6）。
 * @returns {{ ok: boolean, reason?: string }}
 *   ok=true  → 暂存/交换成功（UI 应播放 hold 音效）
 *   ok=false → 被拒（UI 不播放音效）
 *   reason: 'disabled' | 'illegal-phase' | 'clearing' | 'already-used' | 'no-piece'
 */
function hold() {
  if (disposed) return { ok: false, reason: 'illegal-phase' }
  if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
  if (state.clearing) return { ok: false, reason: 'clearing' }
  if (!holdEnabled) return { ok: false, reason: 'disabled' }
  if (!state.piece) return { ok: false, reason: 'no-piece' }
  if (holdUsed) return { ok: false, reason: 'already-used' }

  const currentType = state.piece.type

  if (state.holdPiece === null) {
    // 暂存槽为空：当前方块 → 暂存槽，next → 当前方块
    state.holdPiece = { type: currentType }
    const nextType = state.next
    state.next = state.queue.next()
    state.piece = spawn(nextType)
  } else {
    // 暂存槽非空：交换当前方块与暂存槽
    const heldType = state.holdPiece.type
    state.holdPiece = { type: currentType }
    state.piece = spawn(heldType)
    // next 不变——交换暂存槽不消耗队列
  }

  // 出生碰撞检测（AC-4 重置出生点后可能碰撞 → GAME OVER）
  if (spawnCollides(state.board, state.piece)) {
    state.phase = transition(state.phase, 'lose')
    stopLoop()
    emit()
    if (cb.onGameOver) cb.onGameOver(state.score)
    sfx('gameOver')
    return { ok: true } // 返回 ok=true 因为 hold 操作本身成功（音效由 hold 驱动，gameOver 由 sfx 驱动）
  }

  holdUsed = true
  emit()
  sfx('hold')
  return { ok: true }
}
```

### §3.6 holdUsed 闭包变量与重置

```javascript
let holdUsed = false  // 每个方块下落周期内是否已使用过 hold（AC-5）
```

重置时机：在 `finishLock()` 函数中（原子步完成后，spawn 新方块后）：

```javascript
function finishLock(board, cleared, playClearSfx) {
  // ... 现有塌缩/计分/升级/spawn 逻辑 ...
  holdUsed = false  // [r14] AC-5：新方块出生后重置 hold 使用限制
  // ... emit / levelUp / gameOver ...
}
```

**为什么在 finishLock 而非 lockFlow**：`lockFlow` 有两条路径——动画子阶段（`clearing` 存在，piece=null 但未 finish）和即时路径（直接调用 finishLock）。`holdUsed` 重置应在新方块真正出生后，而非锁定瞬间——动画期间 piece=null，若提前重置则动画期间按键可绕过限制。`finishLock` 是两条路径的唯一出口，在此重置确保语义正确。

### §3.7 holdEnabled 闭包与 setter

```javascript
let holdEnabled = opts.holdEnabled !== false  // 默认开（AC-11）
```

公开 API 新增：

```javascript
setHoldEnabled: function (enabled) {
  if (disposed) return false
  holdEnabled = enabled === true
  return true
},
getHoldEnabled: function () { return holdEnabled },
getHoldPiece: function () { return state.holdPiece ? state.holdPiece.type : null },
hold: hold,
```

**构造参数**：`opts.holdEnabled`（可选，默认 `true`），供 UI 装配期同步初始值。

### §3.8 keyAction 扩展

Hold 按键（C/Shift）**不由** game.js `keyAction` 表处理——原因：

1. game.js 键盘仅处理游戏内操作键（方向/旋转/硬降/暂停/重开），Hold 是"设置级"操作（与 ghost/wallKick 同层），由 ui.js 独立监听。
2. Hold 需要额外 guard（holdEnabled + holdUsed），这些是 UI 闭包态，不适合注入 game.js 纯函数表。
3. 与 M 键（静音）的先例一致——设置级操作由 ui.js 独立绑定 window 级 keydown。

### §3.9 导出面变更

```diff
 return {
   VERSION, COLS, ROWS, TYPES, PHASES, PHASE_ALIAS,
-  SFX_EVENTS: SFX_EVENTS.slice(),  // 7 项
+  SFX_EVENTS: SFX_EVENTS.slice(),  // 8 项（新增 'hold'）
   LINE_SCORES, LOCK_DELAY_MS, DAS_DELAY_MS, DAS_REPEAT_MS, SOFT_DROP_REPEAT_MS,
   GRAVITY_BASE_MS, GRAVITY_DECAY, GRAVITY_MIN_MS,
   SHAPES, COLORS, PHASE_TRANSITIONS,
   createBoard, shapeOf, pieceCells, collides, spawnCollides, isGrounded, ghostY,
   merge, clearLines, scoreForLines, levelForLines, gravityMs, createQueue,
-  spawn, rotated, transition, keyAction, createGame,
+  spawn, rotated, transition, keyAction,
+  createGame,  // createGame 返回的 api 新增 hold/getHoldPiece/setHoldEnabled/getHoldEnabled
 }
```

---

## §4. 音效层详细（audio.js）

### §4.1 SFX_DEFS 新增

在 `SFX_DEFS` 对象末尾新增 `hold` 键（§2.2 已定义参数）。

### §4.2 verify-audio.cjs 影响

- 事件集断言：`7 键` → `8 键`
- 可区分性断言：`hold` 基频 523Hz 与 `levelUp` 523Hz 同频——但 levelUp 为 arpeggio 3 音结构，hold 为单音，时长/结构不同，满足可区分性
- 新增 hold 音效结构断言（字段齐全）

### §4.3 assembly-check.cjs 影响

§1b 的硬编码排序字符串需更新：

```diff
- if (defKeys === eventKeys && defKeys === 'clear,gameOver,hardDrop,levelUp,move,rotate,softDrop')
+ if (defKeys === eventKeys && defKeys === 'clear,gameOver,hardDrop,hold,levelUp,move,rotate,softDrop')
```

---

## §5. UI 层（ui.js）

### §5.1 闭包态新增

在 `createUI` 函数内，现有 ghost/bgm/wallKick 闭包之后新增：

```javascript
/* ---- Hold 暂存开关（r14，AC-10/11/12/13/14/15） ----
   复用 ghost/wallKick 开关三信号模式（aria-pressed + aria-label + 文案）；
   驱动引擎 setHoldEnabled；状态会话内保持、刷新恢复默认（开启）。 ---- */
const holdBtn = must('#btn-hold')
let holdEnabled = true  // 默认开（AC-11）
let holdUsed = false    // 本周期是否已 hold（AC-5，与引擎同步）

function syncHoldBtn() {
  holdBtn.setAttribute('aria-pressed', holdEnabled ? 'true' : 'false')
  holdBtn.setAttribute('aria-label', 'Hold 暂存：' + (holdEnabled ? '开启' : '关闭'))
  holdBtn.textContent = holdEnabled ? '📦 Hold 暂存：开' : '📦 Hold 暂存：关'
}
syncHoldBtn()

function onHoldToggle() {
  holdEnabled = !holdEnabled
  if (typeof game !== 'undefined' && game && typeof game.setHoldEnabled === 'function') {
    game.setHoldEnabled(holdEnabled)
  }
  syncHoldBtn()
  persistSettings()
  blurElement(this)
}
holdBtn.addEventListener('click', onHoldToggle)
```

### §5.2 暂存预览渲染

新增 `createHoldWellRenderer(canvas)`——签名与 `createNextWellRenderer` 完全一致（复用绘制逻辑）：

```javascript
function createHoldWellRenderer(canvas) {
  // 与 createNextWellRenderer 完全相同的签名与实现
  // render(type | null)：null = 空预览，type = 绘制 rot=0 方块
  // 复用 WELL_COLS/WELL_ROWS/WELL_CELL/WELL_BG/WELL_GRID/drawMiniCell
  // 返回 { render, dispose }
}
```

**实现策略**：不抽取公共函数——直接复制 `createNextWellRenderer` 的实现（DRY vs 变更成本权衡：两个 Canvas 48×24 规格完全相同，抽取公共函数需改签名/测试/装配，收益不足）。若未来预览规格分化再重构。

装配期初始化：

```javascript
const holdCanvas = must('#hold-well')
const holdWell = createHoldWellRenderer(holdCanvas)
```

### §5.3 按键绑定（C/Shift → hold）

在 `createUI` 的 window 级键盘监听区域（与 M 键同层）新增：

```javascript
function onHoldKey(e) {
  if (e.repeat) return
  if (e.key === 'c' || e.key === 'C' || e.key === 'Shift') {
    if (typeof game !== 'undefined' && game && typeof game.hold === 'function') {
      const result = game.hold()
      // ok=true 时引擎已发射 sfx('hold')，UI 无需额外操作
      // ok=false 时无音效（AC-17）
    }
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onHoldKey)
}
```

**为什么不走 game.js keyAction 表**：见 §3.8 说明。C/Shift 为设置级操作（holdEnabled guard），与 M 键（静音）同层，由 ui.js 独立监听。

### §5.4 onSnapshot 回调扩展

在 `renderAll(s)` 中新增暂存预览渲染：

```javascript
function renderAll(s) {
  // ... 现有 boardRenderer / nextWell / hud / overlay 逻辑 ...
  nextWell.render(s.phase === 'READY' ? null : s.next)
  holdWell.render(s.holdPiece)  // [r14] 暂存预览：null = 空，type = 绘制
  // ... 其余不变
}
```

### §5.5 暂存预览可见性控制（AC-13）

```javascript
function renderAll(s) {
  // ... 现有逻辑 ...
  // [r14] AC-13：Hold 关闭时暂存预览隐藏
  const holdWellContainer = holdCanvas ? holdCanvas.parentElement : null
  if (holdWellContainer) {
    holdWellContainer.style.display = holdEnabled ? '' : 'none'
  }
  holdWell.render(holdEnabled ? s.holdPiece : null)
}
```

### §5.6 persistSettings 扩展

```javascript
function persistSettings() {
  if (!persist || typeof persist.saveSettings !== 'function') return
  try {
    persist.saveSettings({
      volume: typeof sfx.getVolume === 'function' ? sfx.getVolume() : undefined,
      muted: typeof sfx.isMuted === 'function' ? sfx.isMuted() : undefined,
      ghostEnabled: ghostEnabled,
      bgmEnabled: bgmEnabled,
      wallKickEnabled: wallKickEnabled,
      holdEnabled: holdEnabled,  // [r14] AC-14
    })
  } catch (e) { /* 兜底不中断 */ }
}
```

### §5.7 启动恢复扩展

在 persist.load() 恢复块中新增：

```javascript
if (typeof st.holdEnabled === 'boolean') holdEnabled = st.holdEnabled
```

恢复后同步：

```javascript
syncHoldBtn()  // [r14] 恢复后同步 Hold 开关 DOM 镜像
```

### §5.8 dispose 扩展

```javascript
function dispose() {
  // ... 现有清理 ...
  holdBtn.removeEventListener('click', onHoldToggle)  // [r14]
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onHoldKey)
  holdWell.dispose()
  // ... 其余不变
}
```

### §5.9 导出面变更

`ui.js` 导出面新增：

```diff
+ createHoldWellRenderer: createHoldWellRenderer,  // [r14] 暂存预览渲染器（签名对齐 createNextWellRenderer）
```

---

## §6. 持久化层（persist.js）

### §6.1 DEFAULT_SETTINGS 扩展

```diff
 const DEFAULT_SETTINGS = {
   volume: DEFAULT_VOLUME,
   muted: false,
   ghostEnabled: true,
   bgmEnabled: false,
   wallKickEnabled: true,
+  holdEnabled: true,  // [r14] AC-11：Hold 暂存默认开启
 }
```

### §6.2 readState 扩展

```diff
 return {
   highScore: highScore,
   settings: {
     volume: sanitize(settings.volume, { type: 'float', min: 0, max: 1, def: DEFAULT_SETTINGS.volume }),
     muted: sanitize(settings.muted, { type: 'boolean', def: DEFAULT_SETTINGS.muted }),
     ghostEnabled: sanitize(settings.ghostEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.ghostEnabled }),
     bgmEnabled: sanitize(settings.bgmEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.bgmEnabled }),
     wallKickEnabled: sanitize(settings.wallKickEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.wallKickEnabled }),
+    holdEnabled: sanitize(settings.holdEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.holdEnabled }),
   },
 }
```

### §6.3 encode 扩展

```diff
 return JSON.stringify({
   version: PAYLOAD_VERSION,
   highScore: state.highScore,
   settings: {
     volume: state.settings.volume,
     muted: state.settings.muted,
     ghostEnabled: state.settings.ghostEnabled,
     bgmEnabled: state.settings.bgmEnabled,
     wallKickEnabled: state.settings.wallKickEnabled,
+    holdEnabled: state.settings.holdEnabled,
   },
 })
```

---

## §7. DOM 结构（index.html）

### §7.1 Hold 预览区域

在 `#panel-left` 内，`.next-well` 容器**之前**新增：

```html
<div class="next-well">
  <span class="stat__label">暂存</span>
  <canvas id="hold-well" width="48" height="24" aria-label="暂存槽预览"></canvas>
</div>
```

### §7.2 Hold 开关按钮

在 `#settings-modal` 辅助设置组 `.settings-group--assist` 内，`#btn-wallkick` 容器**之后**新增：

```html
<div id="hold-control" class="ghost-control" role="group" aria-label="Hold 暂存开关">
  <span class="stat__label">Hold 暂存</span>
  <button type="button" id="btn-hold" class="btn btn--secondary btn--audio"
          aria-pressed="true" aria-label="Hold 暂存：开启">📦 Hold 暂存：开</button>
</div>
```

### §7.3 键位图例

在 `#panel-right` 的 `.key-hints` 内新增一行（在"静音"行之前）：

```html
<div class="key-hints__row"><span>暂存 / 交换</span><span><kbd>C</kbd><kbd>Shift</kbd></span></div>
```

---

## §8. 样式（style.css）

### §8.1 Hold 预览 Canvas

```css
/* Hold 暂存预览（r14，复制 #next-well 同款规格） */
#hold-well {
  align-self: flex-start;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--board-bg);
  box-shadow: 0 0 8px rgba(255, 217, 92, 0.18);
}
```

`.next-well` 容器类已复用（`display: flex; flex-direction: column; gap: var(--sp-2)`），Hold 预览容器使用相同 class。

### §8.2 Hold 开关按钮

```css
/* Hold 暂存开关（r14，复制 #btn-wallkick 同款） */
#btn-hold {
  width: 100%;
  white-space: nowrap;
}

#btn-hold[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent-hi);
}

#btn-hold[aria-pressed='false'] {
  border-color: var(--muted);
  color: var(--muted);
}
```

### §8.3 零新增 token

全部复用既有 `--accent` / `--accent-hi` / `--muted` / `--board-bg` / `--sp-2` / `--sp-3` / `--radius-sm` / `--fs-sm`。

---

## §9. 测试策略

### §9.1 verify-game.cjs 新增用例

| # | 用例 | 覆盖 AC |
|---|---|---|
| ① | `hold()` 基本：空槽存入 + next 成为当前方块 | AC-1, AC-2 |
| ② | `hold()` 交换：非空槽交换 + next 不变 | AC-3 |
| ③ | `hold()` 重置：交换后 rot=0、出生点位置 | AC-4 |
| ④ | `hold()` 限制：每周期仅 1 次，第二次返回 already-used | AC-5 |
| ⑤ | `hold()` 状态守卫：非 RUNNING 返回 illegal-phase | AC-6 |
| ⑥ | `hold()` 状态守卫：clearing 期间返回 clearing | AC-6 |
| ⑦ | `hold()` 开关守卫：holdEnabled=false 返回 disabled | AC-12 |
| ⑧ | `hold()` piece 守卫：piece=null 返回 no-piece | — |
| ⑨ | `holdUsed` 重置：finishLock 后可再次 hold | AC-5 |
| ⑩ | `hold()` 出生碰撞：暂存后出生碰撞 → GAME OVER | AC-4 |
| ⑪ | `restart()` 清空暂存槽 | — |
| ⑫ | `holdEnabled` setter/getter | AC-11 |
| ⑬ | 快照含 `holdPiece` 字段 | — |
| ⑭ | SFX_EVENTS 包含 'hold'（8 项） | AC-16 |

### §9.2 verify-audio.cjs 影响

- 事件集断言更新为 8 键
- 新增 `hold` 音效结构断言（waveform/freq/duration/attack/decay/peak 字段齐全）
- 可区分性断言：`hold` 523Hz 单音 180ms 与 `levelUp` 523Hz arpeggio 320ms 结构不同

### §9.3 verify-ui.cjs 新增用例

| # | 用例 |
|---|---|
| ① | `createHoldWellRenderer` 导出存在且签名正确 |
| ② | `createHoldWellRenderer(null)` 抛错（对齐 `createNextWellRenderer`） |
| ③ | game.js `hold()` / `getHoldPiece()` / `setHoldEnabled()` / `getHoldEnabled()` API 存在 |
| ④ | `setHoldEnabled(false)` 实时生效（getHoldEnabled 返回 false） |

### §9.4 verify-persist.cjs 新增用例

| # | 用例 |
|---|---|
| ① | `DEFAULT_SETTINGS.holdEnabled === true` |
| ② | `saveSettings({ ..., holdEnabled: false })` → `load()` 恢复 `holdEnabled: false` |
| ③ | `saveSettings({ ..., holdEnabled: 'invalid' })` → sanitize 回默认 `true` |
| ④ | 旧数据（无 holdEnabled 键）→ load() 回退默认 `true` |

### §9.5 qa-e2e-jsdom.cjs 新增场景

| # | 场景 | 覆盖 AC |
|---|---|---|
| ① | Hold E2E：按 C → 当前方块暂存 + next 成为当前 + hold 音效触发 | AC-1, AC-16 |
| ② | Hold 交换 E2E：暂存后再按 C → 交换 + next 不变 | AC-3 |
| ③ | Hold 限制 E2E：同周期按两次 C → 第二次无效果无音效 | AC-5, AC-17 |
| ④ | Hold 开关 E2E：设置弹层关闭 Hold → 按 C 无效果 → 再开启 → 恢复可用 | AC-12 |
| ⑤ | Hold 持久化 E2E：关闭 Hold → 刷新 → Hold 仍关闭 | AC-14 |
| ⑥ | Hold 暂存预览 E2E：暂存后 hold-well Canvas 有绘制 | AC-8 |

### §9.6 assembly-check.cjs 变更

1. §1b SFX_EVENTS 排序字符串更新为 8 项
2. §3 DOM 选择器新增 `#hold-well`、`#hold-control`、`#btn-hold`
3. §4 CSS 钩子无新增（复用既有 `.ghost-control` / `.btn--audio` / `[aria-pressed`）

### §9.7 verify-constants.cjs

无直接变更——VERSION 三模块一致性不受 Hold 影响（Hold 不新增 VERSION）。

### §9.8 出口标准

七套脚本全绿：verify-game / verify-audio / verify-ui / verify-persist / verify-constants / assembly-check / qa-e2e-jsdom。237 基线用例不回归 + 新增约 25~30 用例。

---

## §10. 工程约束与分支策略

1. **分支**：从最新 main 创建 `feat/hold-piece`
2. **提交顺序**（按 PRD §7 工程约束）：
   - **批次 1 — 引擎**：game.js（hold 方法 + state 扩展 + SFX_EVENTS）→ verify-game 用例
   - **批次 2 — 音效**：audio.js（SFX_DEFS hold）→ verify-audio 用例 → assembly-check 更新
   - **批次 3 — 持久化**：persist.js（holdEnabled）→ verify-persist 用例
   - **批次 4 — UI**：ui.js + index.html + style.css → verify-ui 用例 → qa-e2e 用例
   - **批次 5 — 回归**：全量七套验证 → verify-constants 确认
3. **每批可独立运行验证**：批次 1~3 完成后 verify-game/audio/persist 已全绿；批次 4 完成后 verify-ui + assembly-check 全绿；批次 5 全量回归

---

## §11. 边界情况与防御性设计

| 场景 | 处理 |
|---|---|
| HOLD_ENABLED=false 时按 C/Shift | engine hold() 返回 `{ ok: false, reason: 'disabled' }`，UI 不播放音效（AC-17） |
| READY/PAUSED/OVER 态按 C/Shift | engine hold() 返回 `{ ok: false, reason: 'illegal-phase' }` |
| clearing 动画期间按 C/Shift | engine hold() 返回 `{ ok: false, reason: 'clearing' }` |
| piece=null 时按 C/Shift | engine hold() 返回 `{ ok: false, reason: 'no-piece' }` |
| 同周期第二次按 C/Shift | engine hold() 返回 `{ ok: false, reason: 'already-used' }`（AC-5） |
| holdEnabled 运行中关闭 | 暂存槽保留但不可交换；当前方块锁定后清空（AC-15） |
| holdEnabled 运行中开启 | 立即可用（下次按键即生效） |
| 暂存后出生碰撞 | hold() 成功（ok=true）但触发 GAME OVER（与普通 spawn 碰撞同路径） |
| 7-bag 队列耗尽 | hold() 不影响队列——空槽存入消耗 next 并补队列；交换不消耗队列 |
| persist.js 缺失 | ui.js 不传 persist → 不启用持久化（向后兼容，现有模式） |
| audio.js 缺失 | onSfx 回调为空 → hold 音效静默（AC-09.7 无声不报错） |
| Shift 键长按 | e.repeat=true 时忽略（与 C 键同守卫），不触发连续 hold |
| restart 后 | holdPiece=null, holdUsed=false（全新周期） |

---

## §12. 数据流图

```
按键 C/Shift
  │
  ▼
ui.js onHoldKey ──→ game.hold()
  │                    │
  │                    ├─ guard checks (phase/clearing/enabled/piece/holdUsed)
  │                    │
  │                    ├─ 空槽路径: piece→holdPiece, next→spawn, queue补充
  │                    ├─ 交换路径: piece↔holdPiece, spawn(heldType)
  │                    │
  │                    ├─ sfx('hold') ──→ audio.js play('hold')
  │                    ├─ holdUsed = true
  │                    └─ emit() ──→ snapshot(holdPiece: type|null)
  │                                     │
  │                                     ▼
  │                               ui.js renderAll(s)
  │                                     ├─ holdWell.render(s.holdPiece)
  │                                     └─ boardRenderer / nextWell / hud ...
  │
  ▼
lockFlow() [方块锁定时]
  │
  ├─ holdEnabled=false ? → state.holdPiece = null (AC-15)
  │
  ▼
finishLock() [原子步完成后]
  │
  └─ holdUsed = false (AC-5: 新方块出生后重置)
```

---

## §13. 蓝图（Blueprint）

<!-- blueprint -->
{
  "summary": "Hold 功能横跨全部 6 个模块，改动面最小化——全部复用既有 toggle/闭包/UMD 模式，无新增架构概念。引擎新增 hold() 方法管理暂存槽状态（仅存 type 字符串），UI 新增暂存预览 Canvas（复用 next-well 48×24 规格）与设置开关（复用 ghost-control 三信号模式），持久化新增 holdEnabled 布尔字段，音效新增 hold 合成事件。",
  "modules": {
    "/game.js": {
      "responsibility": "Hold 核心逻辑：state.holdPiece 字段、hold() 方法（暂存/交换/出生点重置）、holdUsed 限制、holdEnabled setter、lockFlow/finishLock 清空逻辑、snapshot 扩展、SFX_EVENTS 新增 'hold'",
      "dependsOn": [],
      "assemblyOrder": 3,
      "why": "引擎层持有全部可变状态与业务规则；hold() 作为纯引擎方法（与 move/rotate/softDrop/hardDrop 同层）保持零 DOM 副作用，Node 可测"
    },
    "/audio.js": {
      "responsibility": "SFX_DEFS 新增 hold 合成音效参数（sine 523Hz 180ms 短促清脆）",
      "dependsOn": [],
      "assemblyOrder": 2,
      "why": "音效参数集中在 SFX_DEFS 单一事实来源；hold 音效与现有 7 音效结构一致（waveform/freq/duration/attack/decay/peak），直接新增键值对"
    },
    "/ui.js": {
      "responsibility": "Hold 闭包态管理（holdEnabled/holdUsed）、暂存预览渲染（createHoldWellRenderer）、设置开关控件（#btn-hold 三信号）、C/Shift 按键绑定、持久化接线、dispose 清理",
      "dependsOn": ["/game.js", "/audio.js", "/persist.js"],
      "assemblyOrder": 4,
      "why": "UI 层持有全部 DOM 副作用与用户交互；hold 按键由 ui.js 独立监听（与 M 键静音同层），不走 game.js keyAction 表——hold 需要 holdEnabled+holdUsed guard，这些是 UI 闭包态"
    },
    "/persist.js": {
      "responsibility": "DEFAULT_SETTINGS 新增 holdEnabled: true、readState/encode/sanitize 扩展 holdEnabled 字段",
      "dependsOn": [],
      "assemblyOrder": 1,
      "why": "持久化层为纯逻辑无 DOM 的独立 UMD 模块；holdEnabled 遵循现有 ghostEnabled/bgmEnabled/wallKickEnabled 模式，仅在 DEFAULT_SETTINGS/readState/encode 三处新增一行"
    },
    "/index.html": {
      "responsibility": "Hold 预览 DOM（#hold-well canvas）+ Hold 开关 DOM（#btn-hold button）+ 键位图例行",
      "dependsOn": [],
      "assemblyOrder": 0,
      "why": "HTML 为 DOM 结构定义；Hold 预览插入 Next 预览上方（双预览对称），开关插入辅助设置组（复用 ghost-control 结构）"
    },
    "/style.css": {
      "responsibility": "#hold-well 样式（复制 #next-well）+ #btn-hold 样式（复制 #btn-wallkick aria-pressed 规则）",
      "dependsOn": [],
      "assemblyOrder": 0,
      "why": "CSS 为视觉 token 消费方；零新增 token，全部复用既有设计系统"
    }
  },
  "duplications": [
    "createHoldWellRenderer 与 createNextWellRenderer 实现完全相同（48×24 Canvas 绘制 rot=0 方块）——设计决策为复制而非抽取公共函数，因两者规格目前一致且改动成本高于收益；若未来预览规格分化再重构",
    "#btn-hold 样式与 #btn-wallkick/#btn-bgm/#btn-ghost 样式完全相同（aria-pressed 双态描边/文字色）——设计决策为保持选择器独立（每开关独立 ID），因 CSS 量极小且独立选择器便于未来差异化"
  ],
  "tasks": [
    {
      "title": "T1: game.js Hold 核心逻辑 + SFX_EVENTS 扩展",
      "files": ["/game.js"],
      "spec": "新增 state.holdPiece/holdUsed/holdEnabled 闭包变量；实现 hold() 方法（暂存/交换/出生点重置/碰撞检测/holdUsed 限制）；lockFlow 清空暂存槽（holdEnabled=false 时）；finishLock 重置 holdUsed；snapshot 新增 holdPiece 字段；restart 清空 holdPiece；公开 API 新增 hold/getHoldPiece/setHoldEnabled/getHoldEnabled；SFX_EVENTS 新增 'hold'；构造参数 opts.holdEnabled。对应 PRD AC-1~6/11~12/15。"
    },
    {
      "title": "T2: audio.js hold 合成音效",
      "files": ["/audio.js"],
      "spec": "SFX_DEFS 新增 hold 键：sine 523Hz 180ms attack 0.005 decay 0.175 peak VOICE_PEAK。对应 PRD AC-16/17。"
    },
    {
      "title": "T3: persist.js holdEnabled 持久化",
      "files": ["/persist.js"],
      "spec": "DEFAULT_SETTINGS 新增 holdEnabled: true；readState 新增 holdEnabled sanitize（boolean, def true）；encode 新增 holdEnabled 序列化。对应 PRD AC-14。"
    },
    {
      "title": "T4: ui.js Hold 闭包/渲染/按键/持久化接线",
      "files": ["/ui.js"],
      "spec": "新增 holdBtn/holdEnabled/holdUsed 闭包态 + syncHoldBtn/onHoldToggle（三信号）+ createHoldWellRenderer（复用 next-well 规格）+ onHoldKey（C/Shift → game.hold()）+ renderAll 新增 holdWell.render + hold 可见性控制 + persistSettings/启动恢复扩展 + dispose 清理 + 导出 createHoldWellRenderer。对应 PRD AC-7~13。"
    },
    {
      "title": "T5: index.html Hold DOM + 键位图例",
      "files": ["/index.html"],
      "spec": "#panel-left 新增 .next-well > #hold-well（暂存预览）；#settings-modal 辅助设置组新增 #hold-control > #btn-hold（Hold 开关）；#panel-right 键位图例新增「暂存/交换 C Shift」行。"
    },
    {
      "title": "T6: style.css Hold 预览/开关样式",
      "files": ["/style.css"],
      "spec": "#hold-well 样式（复制 #next-well：琥珀金描边/board-bg/radius-sm/glow）；#btn-hold 样式（复制 #btn-wallkick：width 100%/aria-pressed 双态描边/文字色）。零新增 token。"
    },
    {
      "title": "T7: verify-game.cjs Hold 用例",
      "files": ["/scripts/verify-game.cjs"],
      "spec": "新增 14 个 Hold 相关用例（§9.1 ①~⑭）：空槽存入/非空交换/rot=0重置/每周期限1次/状态守卫/开关守卫/piece守卫/holdUsed重置/出生碰撞/restart清空/setter/getter/快照字段/SFX_EVENTS 8项。"
    },
    {
      "title": "T8: verify-audio.cjs + assembly-check.cjs Hold 更新",
      "files": ["/scripts/verify-audio.cjs", "/scripts/assembly-check.cjs"],
      "spec": "verify-audio：事件集断言 7→8 键 + hold 音效结构断言 + 可区分性断言更新。assembly-check：SFX_DEFS 排序字符串更新为 8 项 + DOM 选择器新增 #hold-well/#hold-control/#btn-hold。"
    },
    {
      "title": "T9: verify-persist.cjs + verify-ui.cjs Hold 用例",
      "files": ["/scripts/verify-persist.cjs", "/scripts/verify-ui.cjs"],
      "spec": "verify-persist：DEFAULT_SETTINGS.holdEnabled 断言 + holdEnabled 读写往返 + sanitize 边界 + 旧数据兼容（4 用例）。verify-ui：createHoldWellRenderer 导出/签名断言 + game.hold API 存在 + setHoldEnabled 实时生效（4 用例）。"
    },
    {
      "title": "T10: qa-e2e-jsdom.cjs Hold E2E 场景",
      "files": ["/scripts/qa-e2e-jsdom.cjs"],
      "spec": "新增 6 个 Hold E2E 场景（§9.5 ①~⑥）：基本暂存/交换/限制/开关/持久化/预览渲染。buildEnv 中 animMs:0（对齐 r13 先例）+ 新增 hold 相关断言。"
    }
  ]
}
<!-- /blueprint -->

---

## §14. 并行化分析

```
批次 1（无依赖，可并行）:
  T1 (game.js) ─┐
  T2 (audio.js) ─┤
  T3 (persist.js) ─┤
  T5 (index.html) ─┤
  T6 (style.css) ─┘

批次 2（依赖批次 1 的接口定义）:
  T4 (ui.js) ─── 依赖 T1 的 hold()/getHoldPiece()/setHoldEnabled() 接口 + T3 的 holdEnabled 键

批次 3（依赖批次 1+2）:
  T7 (verify-game) ─── 依赖 T1 接口
  T8 (verify-audio + assembly-check) ─── 依赖 T1(TSFX_EVENTS) + T2(SFX_DEFS) + T5(DOM) + T6(CSS)
  T9 (verify-persist + verify-ui) ─── 依赖 T3 + T1 + T4
  T10 (qa-e2e) ─── 依赖 T1+T2+T3+T4+T5+T6（全模块装配）
```

实际执行建议：按 PRD §7 提交策略顺序执行（T1→T2→T3→T4→T5→T6→T7→T8→T9→T10），每批提交后运行对应验证脚本确认。

<!-- state -->{"phase":"tech","summary":"TECHNICAL r14 已交付：Hold 暂存方块功能——引擎新增 hold() 方法（state.holdPiece/holdUsed/holdEnabled 闭包 + 暂存/交换/出生点重置/碰撞检测/每周期限用1次）+ lockFlow 清空暂存槽(holdEnabled=false 时) + finishLock 重置 holdUsed + snapshot 新增 holdPiece 字段 + restart 清空 + SFX_EVENTS 新增 'hold'；音效新增 hold 合成事件(sine 523Hz 180ms)；UI 新增 createHoldWellRenderer(复用 next-well 48×24) + #btn-hold 三信号开关 + C/Shift 按键绑定 + hold 可见性控制 + 持久化接线；persist 新增 holdEnabled 布尔字段(sanitize/encode/readState)；index.html 新增 hold-well DOM + btn-hold DOM + 键位图例；style.css 新增 #hold-well/#btn-hold 样式(复制现有)；10 个并行化任务(T1~T10)覆盖引擎/音效/持久化/UI/DOM/CSS/7套测试脚本更新；七套全绿出口","memory":["引擎 hold() 方法返回 {ok,reason}，reason 枚举: disabled/illegal-phase/clearing/already-used/no-piece","hold 按键 C/Shift 由 ui.js 独立监听（与 M 键静音同层），不走 game.js keyAction 表——因 hold 需要 holdEnabled+holdUsed guard","holdUsed 在 finishLock() 重置（非 lockFlow）——确保动画期间 piece=null 时不被绕过","createHoldWellRenderer 复制 createNextWellRenderer 实现（DRY vs 变更成本权衡）","assembly-check.cjs SFX_DEFS 排序字符串需从 7 项更新为 8 项（hardcoded string）","Hold 交换暂存槽不消耗队列——仅空槽存入消耗 next 并补队列"]}<!-- /state -->
