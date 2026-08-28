# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）

- 版本：v2.9（v2.8 → v2.9 增量：**踢墙旋转开关系统**——将 v2.8 固定的"无踢墙旋转"改为**可配置开关**：开关打开=旋转碰撞按固定踢墙偏移表逐格尝试（命中→成功旋转、x/y 随偏移更新），关闭=保持 v2.8 AC-18 语义（x/y/rot 均不变、返回 `{ ok:false, reason:'wall-kick-denied' }`）；**默认开**；信息面板新增科技玻璃风开关（对齐 AC-13/AC-15）+ `persist.js` 设置键 `tetris.wallKickEnabled` 持久化。变更面：`game.js` rotate（开关状态 + 踢墙偏移表）+ `ui.js` 信息面板开关 + `persist.js` 设置键 + `index.html` 一行开关 + `style.css` 两条 aria-pressed 规则 + `verify-game`/`verify-persist`/`verify-ui`/`assembly-check`/`qa-e2e-jsdom` 用例）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`docs/teamflow/prd/PRD.md`（v2.9，**验收唯一依据**，AC-01~19）、`docs/teamflow/design/DESIGN.md`（v2.9，信息面板 `#btn-wallkick` 开关视觉/交互规范）、`AGENTS.md`（§4 工程约定）、`scripts/*`（可执行契约）
- 定位：将 PRD v2.9 增量（AC-19 踢墙旋转开关系统）落实为**与流水线派发任务对齐**的接口契约、实现要点、测试策略与任务拆分。AC-01 ~ AC-18（其中 AC-18 语义随开关可配置化）为本版回归底线。
- 交付物：`game.js`（rotate 开关分支 + 踢墙偏移表 + API）+ `ui.js`（信息面板踢墙开关）+ `persist.js`（设置键）+ `index.html`（一行开关）+ `style.css`（两条 aria-pressed 规则，零新增 token）+ 五个验证脚本用例 + 文档同步（TECHNICAL/memory/SUMMARY）。**不改**状态机/消行计分/等级/下落速度/音效引擎/BGM/7-bag/幽灵块开关/布局三列 `240|340|240`。

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0 | 2026-08-16 | 初版技术方案（TS+Vite 规划 + 任务拆分 T0~T13）；交付后补注实际偏差：按流水线合并任务以扁平纯 JS 交付，`node:test` 脚本替代 Vitest，TS+Vite 保留为可选工程化路径 |
| v2.0 | 2026-08-16 | 音效系统（AC-09）+ 音量/静音控制（AC-10）+ `onSfx` 事件出口 + 测试/装配审计增量 |
| v2.1 | 2026-08-16 | 暂停/继续快捷键（AC-11）：`keyAction` 键盘映射单一来源表 |
| v2.2 | 2026-08-16 | 幽灵块（落点预览，AC-12）：引擎纯函数 `ghostY` + UI 半透明轮廓渲染 |
| v2.2-tc | 2026-08-16 | 工程自检脚本 `verify-constants.cjs` |
| v2.3 | 2026-08-18 | 幽灵块辅助开关（AC-13）+ 修正硬降计分（AC-14） |
| v2.6-tc-1 | 2026-08 | 应用层持久化 `persist.js` 统一落 localStorage |
| v2.7 | 2026-08-18 | 7-bag 随机算法（AC-17） |
| v2.8 | 2026-08-18 | 无踢墙旋转系统（AC-18）：旋转碰撞保持原位，返回 `wall-kick-denied` |
| **v2.9** | **2026-08-18** | **踢墙旋转开关系统（AC-19）**：`game.js` rotate 接入开关状态 + 固定踢墙偏移表；`ui.js` 信息面板 `#btn-wallkick`（默认开）；`persist.js` 设置键 `wallKickEnabled`；`index.html`/`style.css` 各一行/两条；五个验证脚本用例；AC-18"保持原位"用例改为在**开关关闭**态断言 |

> **实际交付形态（沿用）**：`index.html + 本地 css/js`，脚本顺序 `persist.js → audio.js → game.js → ui.js → 内联装配`；UMD 契约 `window.TetrisGame / window.TetrisAudio / window.TetrisUI / window.TetrisPersist`。v2.8 快照（TECHNICAL）已归档至 `docs/teamflow/history/v2.8/TECHNICAL.md`。

---

## 1. 总体架构与数据流（v2.9 增量视角）

```
engine：createGame 会话（唯一可变状态；状态机/计分/音效出口/重力/7-bag 全部不变）
  │ 新增会话私有状态 wallKickEnabled（默认 true，AC-19.1）
  │   ├─ rotate() → { ok, reason }（数据流见下，引擎自判开关态）
  │   └─ setWallKickEnabled(bool) / getWallKickEnabled()（ui.js 装配期同步用）
  ▼
ui.js（信息面板）——#btn-wallkick 踢墙开关（默认开，AC-19.7）
  ├─ 唯一 DOM 镜像：aria-pressed + aria-label + 文案形态三信号（对齐 AC-13/AC-15）
  ├─ 切换 → game.setWallKickEnabled(next)（驱动引擎开关，等效 sfx.setVolume 模式）
  ├─ 旁观：persistSettings() 写回 persist.saveSettings({ ..., wallKickEnabled })
  ▼
persist.js（可选依赖，旁观层）
  └─ DEFAULT_SETTINGS 增 wallKickEnabled: true；sanitize 布尔白名单；读 restore
```

- **引擎权威**：旋转行为**只在 `game.js` rotate 内自判**——按开关值决定「原地成功 / 踢墙尝试 / 保持原位」三态，UI 层不做任何旋转逻辑判断。
- **UI 只读旁观 + 装配期同步**：`ui.js` 是装配根，负责把「持久化偏好 ↔ 引擎开关」在**装载期与切换时刻**对齐（调用 `game.setWallKickEnabled`），与既有 `sfx.setVolume/setMuted` 模式完全一致；persist 仍是纯旁观写回，绝不成为第三个变更入口。
- **开关实时生效**：切换后下一次 rotate 即按新值执行（≤100ms，AC-19.5）——因开关在 `game` 闭包态内、每次 rotate 读取，无需重开。
- **幽灵块联动自动闭合**：踢墙命中改变方块落点后，`emit()` 触发 `onSnapshot` → `renderAll(s)` 按快照调 `ghostY`，同一帧自动刷新幽灵轮廓（沿用 AC-12 实时刷新机制，零新增规则）。

---

## 2. 数据模型与存储

### 2.1 旋转返回值契约（v2.9 扩展）

```js
/**
 * 旋转函数返回值契约（PRD AC-18/AC-19）。函数签名与 v2.8 完全一致：{ ok, reason }。
 *   - ok:true            → 旋转成功（原地合法 或 踢墙偏移命中），state.piece 已更新（x/y/rot 随偏移）
 *   - ok:false,'illegal-phase'      → 非 RUNNING 或已 dispose（沿用）
 *   - ok:false,'wall-kick-denied'   → 开关关闭时旋转碰撞（AC-18 语义）或 开关打开但全部偏移失败（AC-19.3）
 */
```

### 2.2 踢墙偏移表（v2.9 新增固定规格，单一事实来源在 `game.js` 顶部）

```js
// 开关=开 时，旋转碰撞依次尝试（固定次序、固定值，不可由玩家配置，AC-19.2/§3.2 非目标）
const WALL_KICK_OFFSETS = [ // tech 决策：左移 → 右移 → 上移，各 1 格（Guideline 简化单点表）
  [ -1, 0 ],
  [ +1, 0 ],
  [ 0, -1 ],
]
```

尝试语义：对 `rotated(piece, 1)` 的 `next`，依次令 `candidate = { ...next, x: next.x + dx, y: next.y + dy }`，若 `!collides(board, candidate)` 则命中 → `state.piece = candidate`（x/y 随偏移更新、rot 生效）、`sfx('rotate')`、`return { ok:true }`；全部尝试失败 → 保持原位、`return { ok:false, reason:'wall-kick-denied' }`。**确定性**：同 board+piece+开关态结果完全确定（AC-19.8）。

### 2.3 会话私有状态与持久化键

| 项 | 位置 | 规格 |
|---|---|---|
| 引擎开关状态 | `createGame` 闭包 `let wallKickEnabled = true` | 默认开（AC-19.1）；`setWallKickEnabled(bool)` 钳制为布尔 |
| 引擎装配入参 | `createGame({ wallKickEnabled?: boolean })` | 可选，缺省 true；供确定性单测直接注入 |
| persist 设置键 | `persist.js` `DEFAULT_SETTINGS.wallKickEnabled: true` | 布尔白名单（AC-19.6）；键名语义对齐 `tetris.ghostEnabled/bgmEnabled` |
| 存储键 | 沿用 `TETRIS_PERSIST_KEY='tetris.v2'`（单键带版本 JSON） | 不新增键，仅在 settings 对象内加字段，坏 JSON 仍清键回默认 |

### 2.4 既有数据模型（v2.8 沿用，零改动）

棋盘 `ROWS×COLS`、piece `{ type, rot, x, y }`、`collides`、7-bag 队列 `createQueue`、`ghostY` 全部沿用。

---

## 3. API 设计

### 3.1 game.js — createGame 会话新增成员（AC-19 引擎侧）

```js
// 会话对象新增两个方法（不改变既有 API 签名，向后兼容零破坏）
api.setWallKickEnabled = function (enabled) {
  if (disposed) return false
  wallKickEnabled = enabled === true   // 钳制为布尔
  return true
}
api.getWallKickEnabled = function () { return wallKickEnabled }
```

### 3.2 game.js — rotate() 内部实现要点（唯一行为变更点）

```js
function rotate() {
  if (disposed) return { ok: false, reason: 'illegal-phase' }
  if (state.phase !== 'RUNNING' || !state.piece) return { ok: false, reason: 'illegal-phase' }
  const next = rotated(state.piece, 1)
  if (!collides(state.board, next)) {
    state.piece = next                       // 原地合法：直接成功（v2.8 不变路径）
    if (!isGrounded(state.board, state.piece)) state.lockTimer = 0
    emit(); sfx('rotate'); return { ok: true }
  }
  if (wallKickEnabled === false) {
    return { ok: false, reason: 'wall-kick-denied' }   // 开关关：v2.8 AC-18 语义，零偏移
  }
  for (const [dx, dy] of WALL_KICK_OFFSETS) {         // 开关开：逐格尝试
    const candidate = { type: next.type, rot: next.rot, x: next.x + dx, y: next.y + dy }
    if (!collides(state.board, candidate)) {
      state.piece = candidate
      if (!isGrounded(state.board, state.piece)) state.lockTimer = 0
      emit(); sfx('rotate'); return { ok: true }       // 命中：x/y 随偏移更新、rot 生效、播放旋转音效
    }
  }
  return { ok: false, reason: 'wall-kick-denied' }     // 全部失败：保持原位（AC-19.3）
}
```

### 3.3 persist.js — settings 负载扩展（AC-19.6）

`readState`/`encode`/`DEFAULT_SETTINGS` 三处各增一行 `wallKickEnabled`（布尔白名单、默认 `true`）。`saveSettings` 保持「合并写回全部设置」语义不变，缺省回默认开。

### 3.4 ui.js — 信息面板踢墙开关（AC-19.7，对齐 AC-13/AC-15 模式）

```js
const wallKickBtn = must('#btn-wallkick')
let wallKickEnabled = true // 默认开（AC-19.1）
function syncWallKickBtn() {
  wallKickBtn.setAttribute('aria-pressed', wallKickEnabled ? 'true' : 'false')
  wallKickBtn.setAttribute('aria-label', '踢墙旋转：' + (wallKickEnabled ? '开启' : '关闭'))
  wallKickBtn.textContent = wallKickEnabled ? '🔄 踢墙旋转：开' : '🔄 踢墙旋转：关'
}
syncWallKickBtn()
function onWallKickToggle() {
  wallKickEnabled = !wallKickEnabled
  if (typeof game !== 'undefined' && game && typeof game.setWallKickEnabled === 'function') {
    game.setWallKickEnabled(wallKickEnabled)   // 驱动引擎开关（装配期同步，等效 sfx.setVolume）
  }
  syncWallKickBtn(); persistSettings(); blurElement(this)
}
wallKickBtn.addEventListener('click', onWallKickToggle)
```

- `persistSettings()` 的 `saveSettings({...})` 增加 `wallKickEnabled: wallKickEnabled` 字段。
- 启动恢复 `persist.load()` 分支内：`if (typeof st.wallKickEnabled === 'boolean') { wallKickEnabled = st.wallKickEnabled; game.setWallKickEnabled(wallKickEnabled) }`，随后 `syncWallKickBtn()`。
- **时序注意**：`game` 在 `createGame(...)` 之后才存在；`onWallKickToggle` 首次装载期不触发（仅 `load()` 恢复时同步），故 `game.setWallKickEnabled` 在 `onWallKickToggle` 内以存在性判断，`load()` 恢复段放在 `createGame` 之后（当前 `load()` 块在 `createGame` 前的既有位置——**需将 wallKick 恢复同步挪到 createGame 之后，或改为在 createGame 之后补一次 `game.setWallKickEnabled(wallKickEnabled)`**，见 §6 边界）。**推荐**：在 `createGame` 之后、`dispose` handle 之前加一行 `game.setWallKickEnabled(wallKickEnabled)`，保证引擎与 UI 闭包一致。

### 3.5 UMD 导出（对外契约，齐平）

- `window.TetrisGame.createGame(opt)`：opt 新增 `wallKickEnabled`（可选）。
- `window.TetrisUI`（不变）；`window.TetrisPersist`（不变，仅 DEFAULT_SETTINGS 增字段）。

---

## 4. 前端组件与页面划分

- **页面**：`index.html` 信息面板设置区（尾行）新增一组开关容器 `#wallkick-control`（`role="group"`，与 `#ghost-control`/`#bgm-control` 同构）+ 按钮 `#btn-wallkick`（`class="btn btn--secondary btn--audio"`，`aria-pressed="true"`，文案「🔄 踢墙旋转：开」）。布局三列 `240|340|240` 零改动。
- **样式**：`style.css` 仅复制 `#btn-bgm[aria-pressed="true"/"false"]` 两条规则为 `#btn-wallkick[...]`（开启态描边微金 `--accent/--accent-hi`、关闭态中性 `--muted`），**零新增 token、零新增布局规则**。
- **组件**：`ui.js` 复用既有「闭包开关 + sync 三信号 + persist 旁观」组件模式，不新增独立组件工厂。

---

## 5. 状态管理

- **单一可变点仍为 `createGame` 会话**；踢墙开关是新增的会话内布尔闭包（`wallKickEnabled`），非全局单例、非 DOM 驱动——UI 只通过 `setWallKickEnabled` 同步。
- 持久化键 `wallKickEnabled` 经 v2.6 通道，刷新恢复、缺省回默认开（AC-19.6）。

---

## 6. 关键实现要点与边界情况

### 6.1 实现要点

| 步骤 | 实现 | 说明 |
|---|---|---|
| 1. 常量 | `game.js` 顶部新增 `WALL_KICK_OFFSETS` | 固定表，单一事实来源，§2.2 |
| 2. 会话状态 | `createGame` 闭包 `wallKickEnabled`，从 `opts.wallKickEnabled !== false` 取初值 | 默认开 |
| 3. rotate 分支 | 见 §3.2 | 原地→踢墙→保持原位 三态 |
| 4. API | `setWallKickEnabled/getWallKickEnabled` | ui.js 装配期同步 |
| 5. persist | DEFAULT_SETTINGS/sanitize/readState/encode 增 `wallKickEnabled` | §3.3 |
| 6. ui 开关 | `syncWallKickBtn` + `onWallKickToggle` + persist/load 接线 | §3.4 |
| 7. index/style | 一行开关 + 两条 aria-pressed 规则 | §4 |

### 6.2 边界情况与防御

| 边界 | 预期行为 | 测试覆盖 |
|---|---|---|
| 新会话/无存档 | 默认开（AC-19.1）：旋转碰撞尝试踢墙 | verify-game |
| 开=原地合法 | 直接成功，x/y/rot 更新，`sfx('rotate')` | AC-19.2/回归 |
| 开=偏移命中（左/右/上） | x/y 随偏移更新、rot 生效、`sfx('rotate')` | AC-19.2 |
| 开=全部偏移失败 | 保持原位（x/y/rot 不变）、返回 `wall-kick-denied` | AC-19.3 |
| 关=旋转碰撞 | 零偏移、x/y/rot 不变、返回 `wall-kick-denied`（AC-18 语义） | AC-19.4 |
| 切换实时生效 | 下一次 rotate 立即按新值执行（≤100ms） | AC-19.5 |
| 刷新恢复 | `load()` 恢复 `wallKickEnabled`；缺省/坏 JSON 回默认开 | verify-persist |
| 装配时序 | `game.setWallKickEnabled(wallKickEnabled)` 必须在 `createGame` 之后调用，否则引擎保持默认开而 UI 显示已恢复值（两者漂移）→ 见「装配时序」备注 | qa-e2e-jsdom |
| 踢墙改变落点 | 幽灵块 `ghostY` 经 `renderAll` 同一帧自动刷新（复用 collides，无踢墙垂直语义不变） | 回归 + e2e |

> **装配时序备注（关键）**：ui.js 既有 `persist.load()` 恢复块位于 `createGame(...)` 之前。v2.9 需保证引擎 `wallKickEnabled` 与持久化恢复值一致：在 `createGame` 之后补一次 `game.setWallKickEnabled(wallKickEnabled)`，避免「UI 显示已恢复值、引擎仍用默认开」的漂移（幽灵/BGM 开关因只在渲染层无此问题，踢墙开关因读入引擎必须同步——这正是 DESIGN「引擎自判」带来的唯一跨面接线点）。

### 6.3 零副作用保证

- **不改**状态机（phase 转换）、消行计分/等级/速度、音效引擎（`sfx('rotate')` 调用条件不变）、BGM、7-bag、幽灵块开关、`keyAction`（rotate 键位不变）、布局/视觉 token。
- 旋转默认行为由「无踢墙」变更为「踢墙开」（用户可见变更，PRD AC-19.8 已显式声明）。

---

## 7. 测试策略

### 7.1 自动化用例（脚本级）

| 脚本 | 变更 | 覆盖 AC |
|---|---|---|
| `scripts/verify-game.cjs` | AC-18 三例（左墙/右墙/已固定方块）**改为先 `setWallKickEnabled(false)`** 再断言 `wall-kick-denied`（您渡前提：默认开）；新增「默认开」「开=左/右/上偏移命中成功」「开=全部失败保持原位」「关=保持原位 zero-offset」「setWallKickEnabled 钳制布尔」用例 | AC-19.1/2/3/4/5 |
| `scripts/verify-persist.cjs` | DEFAULT_SETTINGS 断言增 `wallKickEnabled:true`；读写往返/真实形状/坏 JSON/缺省回默认/布尔白名单各增该键 | AC-19.6 |
| `scripts/verify-ui.cjs` | 新增「engine 导出 `setWallKickEnabled/getWallKickEnabled` 存在」契约断言 | AC-19.7（装配可测部分） |
| `scripts/assembly-check.cjs` | 必需元素清单增 `#wallkick-control`、`#btn-wallkick` | AC-08 |
| `scripts/qa-e2e-jsdom.cjs` | 新增「点击 #btn-wallkick 切换 aria-pressed / 文案 / `game.getWallKickEnabled` 联动 / 刷新恢复」用例 | AC-19.5/6/7 |
| `scripts/verify-audio.cjs` / `verify-constants.cjs` | 不变 | 回归 |

### 7.2 回归底线

- AC-01 ~ AC-18 可自动化项 100% 全绿（AC-18 三例在开关关闭态断言）。
- 七套验证全绿：`verify-game / verify-audio / verify-ui / verify-constants / assembly-check / verify-persist / qa-e2e-jsdom`。

### 7.3 验证命令（产品根下执行）

```bash
node scripts/verify-game.cjs      # 引擎，含开关/踢墙/AC-18 关闭态用例
node scripts/verify-persist.cjs   # 持久化，含 wallKickEnabled 键
node scripts/verify-ui.cjs        # UI 契约，含 engine 开关 API
node scripts/verify-audio.cjs     # 音效引擎（回归）
node scripts/verify-constants.cjs # VERSION 三模块一致（回归）
node scripts/assembly-check.cjs   # 装配 + 自包含 + 必需元素（含 #btn-wallkick）
node scripts/qa-e2e-jsdom.cjs     # DOM E2E + file:// 管线（含开关切换/恢复）
```

---

## 8. 任务拆分（与流水线派发对齐）

> git 约束（PRD §10 随任务传递）：当前分支 `feat/v2.8-no-wallkick`；可新开 `feat/v2.9-wallkick-toggle`。提交前确认工作区干净。基线 `075fe71`。

### T1: game.js 引擎踢墙开关（AC-19.1/19.2/19.3/19.5）【M1】

- **文件边界**：`game.js`
- **变更内容**：
  1. 顶部新增 `WALL_KICK_OFFSETS` 常量（§2.2）。
  2. `createGame` 闭包增 `wallKickEnabled`（默认开）+ `opts.wallKickEnabled` 装配入参。
  3. `rotate()` 改为三态分支（§3.2）。
  4. 会话 API 增 `setWallKickEnabled/getWallKickEnabled`。
- **验收标准**：默认开/开命中/开全部失败/关零偏移 四类用例全绿；AC-01~17 回归；接口签名向后兼容。
- **依赖**：无。

### T2: verify-game.cjs 开关/踢墙用例（AC-19.1~5）【M1】

- **文件边界**：`scripts/verify-game.cjs`
- **变更内容**：AC-18 三例前置 `setWallKickEnabled(false)`；新增默认开 + 开偏移命中 + 开全部失败 + 关零偏移 + setter 钳制用例。
- **验收标准**：verify-game 全绿；AC-18 关闭态断言正确。
- **依赖**：T1。

### T3: persist.js 设置键 + verify-persist（AC-19.6）【M2】

- **文件边界**：`persist.js`、`scripts/verify-persist.cjs`
- **变更内容**：DEFAULT_SETTINGS/sanitize/readState/encode 增 `wallKickEnabled`；verify-persist 增键断言与往返/回退用例。
- **验收标准**：verify-persist 全绿；刷新恢复、缺省回默认开、坏 JSON 回默认。
- **依赖**：无（可并行 T1）。

### T4: ui.js 信息面板踢墙开关 + index.html + style.css（AC-19.7）【M2】

- **文件边界**：`ui.js`、`index.html`、`style.css`
- **变更内容**：`#wallkick-control`/`#btn-wallkick` 一行；`#btn-wallkick[aria-pressed]` 两条规则（复制 `#btn-bgm`）；ui.js 开关闭包 + sync + toggle（驱动 `game.setWallKickEnabled`）+ persist/load 接线；**`createGame` 后补 `game.setWallKickEnabled(wallKickEnabled)`（装配时序）**。
- **验收标准**：开关默认开、三信号正确、实时生效、刷新恢复、可访问（Tab/aria 非仅颜色）；QA 层面手测视觉。
- **依赖**：T1（`setWallKickEnabled` 存在）、T3（持久化键）。

### T5: 装配/UI/E2E 用例（AC-19.5/6/7/回归 + AC-08）【M2/M3】

- **文件边界**：`scripts/assembly-check.cjs`、`scripts/verify-ui.cjs`、`scripts/qa-e2e-jsdom.cjs`
- **变更内容**：assembly 必需元素 +2；verify-ui 增 engine 开关 API 契约；e2e 增「切换 aria/文案/`game.getWallKickEnabled` 联动/刷新恢复」用例。
- **验收标准**：assembly/verify-ui/qa-e2e 全绿。
- **依赖**：T4（按钮与接线存在）。

### T6: 文档同步（TECHNICAL/memory/SUMMARY）【M3】

- **文件边界**：`docs/teamflow/technical/TECHNICAL.md`（本文档）、`docs/teamflow/memory.md`、`docs/teamflow/SUMMARY.md`
- **变更内容**：TECHNICAL 记为 v2.9；memory 增 v2.9 行 + 当前迭代记忆；SUMMARY 更新 tech 摘要行（含 v2.8 TECH 归档注记）。
- **验收标准**：TECHNICAL v2.9、旧版已归档 `history/v2.8/TECHNICAL.md`、memory/SUMMARY 登记。
- **依赖**：T1~T5（代码先绿）。

### 并行关系与推荐顺序

| 任务 | 可并行 | 说明 |
|---|---|---|
| T1 | T3 | 引擎与持久化键互不依赖，可并行 |
| T4 | T5 | 均依赖 T1+T3 |

**推荐执行**：T1∥T3 → T2（依赖 T1）→ T4（依赖 T1/T3）→ T5（依赖 T4）→ T6。**git**：T1~T5 落一处提交（或按文件边界拆分提交），T6 文档提交；每个提交前 `git status` 确认干净。

---

## 9. 验收标准与回归底线

### 9.1 AC-19 专项验收

| AC | 验收点 | 自动化覆盖 |
|---|---|---|
| AC-19.1 | 默认开 | verify-game 默认值 + verify-persist |
| AC-19.2 | 开=踢墙（偏移命中） | verify-game |
| AC-19.3 | 开=全部失败保持原位 | verify-game |
| AC-19.4 | 关=无踢墙（AC-18 语义） | verify-game（关闭态） |
| AC-19.5 | 实时生效 ≤100ms | verify-game + e2e |
| AC-19.6 | 持久化/刷新恢复/缺省开 | verify-persist |
| AC-19.7 | UI 开关 + 可访问性 | verify-ui(e2e) + 手测 |
| AC-19.8 | 零副作用 + 默认行为变更声明 | 代码审计 + 回归 |
| AC-19.9 | 回归底线 AC-01~18 + 七套验证 | 七套全绿 |

### 9.2 回归底线

- AC-01 ~ AC-18 可自动化项 100% 全绿（AC-18 三例在开关关闭态断言）。
- 七套验证全绿；无 P0/P1/P2 缺陷。

---

<!-- blueprint -->{"summary":"v2.9 踢墙旋转开关系统：引擎 rotate 三态分支（原地/踢墙/保持原位）自判开关态，ui.js 信息面板 #btn-wallkick 装配期同步引擎 + persist 旁观持久化，默认开；变更面 game.js+ui.js+persist.js+index.html+style.css+五个验证脚本，零改状态机/计分/音效/BGM/7-bag","modules":{"/game.js":{"responsibility":"rotate 三态分支：新增 wallKickEnabled 会话状态(默认开)+WALL_KICK_OFFSETS 固定表+setWallKickEnabled/getWallKickEnabled API；引擎权威自判开关","dependsOn":[],"assemblyOrder":1,"why":"唯一引擎行为变更点；开关状态放在会话闭包、rotate 内自判，UI 层零旋转逻辑，保持 createGame 工厂+闭包不变式"},"/persist.js":{"responsibility":"设置负载增 wallKickEnabled:true（DEFAULT_SETTINGS/sanitize/readState/encode 四处同步）","dependsOn":[],"assemblyOrder":1,"why":"独立 UMD 纯逻辑、可 Node 单测；新键走既有 sanitize 布尔白名单，坏 JSON 回默认，不新增存储键"},"/ui.js":{"responsibility":"信息面板 #btn-wallkick 开关（默认开）：sync 三信号+toggle 驱动 game.setWallKickEnabled+persist/load 旁观接线；createGame 后补同步防装配时序漂移","dependsOn":["/game.js","/persist.js"],"assemblyOrder":2,"why":"UI 只读旁观+装配期同步，复用 ghost/BGM 开关组件模式与 persistSettings 单点写回，零新增组件"},"/index.html":{"responsibility":"信息面板设置区尾行新增 #wallkick-control/#btn-wallkick（一行）","dependsOn":[],"assemblyOrder":2,"why":"与 #ghost-control/#bgm-control 同构，布局三列零改动"},"/style.css":{"responsibility":"复制 #btn-bgm[aria-pressed] 两条规则为 #btn-wallkick（开启微金/关闭中性）","dependsOn":[],"assemblyOrder":2,"why":"零新增 token、零新增布局规则，复用既有开关视觉"},"/scripts/verify-game.cjs":{"responsibility":"AC-18 三例改开关关闭态断言 + 新增默认开/开命中/开全败/关零偏移/setter钳制用例","dependsOn":["/game.js"],"assemblyOrder":3,"why":"引擎契约回归锚点；默认开改造后 AC-18 前提必须显式关掉开关"},"/scripts/verify-persist.cjs":{"responsibility":"DEFAULT_SETTINGS 增 wallKickEnabled 断言 + 往返/回退/白名单用例","dependsOn":["/persist.js"],"assemblyOrder":3,"why":"持久化层独立回归锚点"},"/scripts/verify-ui.cjs":{"responsibility":"新增 engine setWallKickEnabled/getWallKickEnabled 导出契约断言","dependsOn":["/game.js","/ui.js"],"assemblyOrder":3,"why":"UI 契约自检，验证跨面接线所需引擎 API 存在"},"/scripts/assembly-check.cjs":{"responsibility":"必需元素清单增 #wallkick-control/#btn-wallkick","dependsOn":["/index.html"],"assemblyOrder":3,"why":"装配+自包含审计，新增按钮必须入白名单否则审计红"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"点击开关切换 aria/文案/game.getWallKickEnabled 联动/刷新恢复用例","dependsOn":["/ui.js","/index.html","/style.css"],"assemblyOrder":3,"why":"DOM E2E 验证装配时序与开关实时生效/恢复全链路"}},"duplications":["持久化设置键集中：wallKickEnabled 只经 persist.sanitize 白名单清洗，ui.js 不散落 setItem（沿用 v2.6 单存储封装，无适配器漂移）","开关组件模式重复：ghost/BGM/wallKick 三个开关共享同一 sync+persist 旁观骨架——刻意保留（扁平纯 JS 复用小而清晰，不抽第三个组件以免过度设计）","装配时序漂移风险：ui.js 新增一处 createGame 后 setWallKickEnabled 同步，与 ghost/BGM 仅渲染层开关不同，需 README/注释显式标注"]},"tasks":[{"title":"T1: game.js 引擎踢墙开关","files":["/game.js"],"spec":"WALL_KICK_OFFSETS 常量 + wallKickEnabled 会话状态 + rotate 三态分支 + setWallKickEnabled/getWallKickEnabled API"},{"title":"T2: verify-game 开关/踢墙用例","files":["/scripts/verify-game.cjs"],"spec":"AC-18 三例改 setWallKickEnabled(false) 前置；新增默认开/开命中/开全败/关零偏移/setter钳制用例"},{"title":"T3: persist 设置键 + verify-persist","files":["/persist.js","/scripts/verify-persist.cjs"],"spec":"DEFAULT_SETTINGS/sanitize/readState/encode 增 wallKickEnabled:true；verify-persist 增键断言与往返/回退用例"},{"title":"T4: ui 信息面板开关 + index/style","files":["/ui.js","/index.html","/style.css"],"spec":"#btn-wallkick 开关(sync/toggle/persist/load)+一行 HTML+两条 aria-pressed 规则；createGame 后补 setWallKickEnabled 同步防时序漂移"},{"title":"T5: 装配/UI/E2E 用例","files":["/scripts/assembly-check.cjs","/scripts/verify-ui.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"assembly 必需元素 +2；verify-ui 增引擎开关 API 契约；e2e 增切换联动/刷新恢复用例"},{"title":"T6: 文档同步","files":["/docs/teamflow/technical/TECHNICAL.md","/docs/teamflow/memory.md","/docs/teamflow/SUMMARY.md"],"spec":"TECHNICAL v2.9+旧版归档 history/v2.8/；memory 增 v2.9 行；SUMMARY 更新 tech 摘要"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"v2.9 技术方案已交付：踢墙旋转开关系统。引擎权威——game.js rotate 三态分支（原地成功/按 WALL_KICK_OFFSETS=[[-1,0],[1,0],[0,-1]] 逐格踢墙/全部失败保持原位），新增会话状态 wallKickEnabled(默认 true)+setWallKickEnabled/getWallKickEnabled API，接口向后兼容。UI 只读旁观+装配期同步——ui.js 信息面板 #btn-wallkick(默认开)复用 ghost/BGM 开关三信号模式，persistSettings 旁观写回；关键装配时序：load 恢复后需在 createGame 之后补 game.setWallKickEnabled(wallKickEnabled) 防引擎/UI 漂移。persist.js DEFAULT_SETTINGS/sanitize/readState/encode 增 wallKickEnabled:true(布尔白名单)。index.html 一行开关+style.css 两条 aria-pressed 规则(零新增 token)。AC-18 三例改为开关关闭态断言。七套验证含 verify-persist。任务 T1(T3∥)→T2→T4→T5→T6；git 分支 feat/v2.8-no-wallkick 或新建 feat/v2.9-wallkick-toggle，基线 075fe71。","version":"v2.9","memory":["v2.9 技术方案：引擎权威 rotate 三态(原地/踢墙/保持原位)，WALL_KICK_OFFSETS=[[-1,0],[1,0],[0,-1]] 固定表","createGame 增 wallKickEnabled(默认 true)+setWallKickEnabled/getWallKickEnabled API，签名向后兼容","UI 只读旁观+装配期同步：ui.js #btn-wallkick 复用 ghost/BGM 开关模式；createGame 后须补 setWallKickEnabled 防时序漂移","persist.js 增 wallKickEnabled:true(布尔白名单)，沿用 tetris.v2 单键，坏 JSON 回默认","index.html 一行开关+style.css 两条 aria-pressed 规则，零新增 token/布局","AC-18 三例(左墙/右墙/已固定方块)改在开关关闭态断言","回归底线 AC-01~18(AC-18 关态)+七套验证(含 verify-persist)；任务 T1∥T3→T2→T4→T5→T6"]}<!-- /state -->
