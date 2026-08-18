# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）

- 版本：v2.3（v2.2 → v2.3 增量：幽灵块辅助开关 + 修正硬降计分；不改状态机/keyAction/音效；UI 仅新增信息面板开关控件 + 渲染条件）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`products/tetris/docs/prd/PRD.md`（v2.3，**验收唯一依据**，AC-01~14）、`products/tetris/docs/design/DESIGN.md`（v2.3，§3.6 幽灵块线框 / §3.7 开关交互 / §4.4 刷新时机 / §5.6 幽灵块视觉规范 / §5.7 开关视觉 / §6 可访问性）、`products/tetris/docs/architecture/ARCHITECTURE.md`（工程方案，实际交付为扁平纯 JS）、`products/tetris/AGENTS.md`（§4 工程约定）、`products/tetris/scripts/*`（可执行契约）
- 定位：将 PRD v2.3 增量（AC-13 幽灵块辅助开关 + AC-14 修正硬降计分）落实为**与流水线派发任务对齐**的接口契约、实现要点、测试策略与任务拆分。v2.1/v2.2 已交付的玩法/计分/音效/音量/快捷键/幽灵块渲染契约**沿用不变**（AC-01 ~ AC-12 为本版回归底线，除 AC-14 明确改变的硬降加分断言）。
- 交付物：`products/tetris/index.html`（新增 `#ghost-control` 幽灵开关 DOM）+ `style.css`（新增 `.ghost-control` / `#btn-ghost` 钩子）+ `ui.js`（渲染 `ghostEnabled` 条件 + 开关绑定 + `render` 透明度防御）+ `game.js`（hardDrop 移除 dropBonus 调用/导出）+ `scripts/verify-game.cjs` / `qa-e2e-jsdom.cjs`（AC-13/AC-14 用例）+ `assembly-check.cjs`（导出面减 dropBonus、DOM 增 #btn-ghost）+ 文档同步（README/DESIGN/TECHNICAL/ARCHITECTURE/memory/AGENTS/changes.md）。**`audio.js` / 状态机 / 数值公式 / `keyAction` 零改动**（AC-13.6/AC-14.3 硬约束）。

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0 | 2026-08-16 | 初版技术方案（TS+Vite 规划 + 任务拆分 T0~T13）；交付后补注实际偏差：按流水线合并任务以扁平纯 JS 交付，`node:test` 脚本替代 Vitest，TS+Vite 保留为可选工程化路径 |
| v2.0 | 2026-08-16 | 音效系统（AC-09）+ 音量/静音控制（AC-10）+ `onSfx` 事件出口 + 测试/装配审计增量；既有玩法/计分/数值/键盘不动 |
| v2.1 | 2026-08-16 | 暂停/继续快捷键（AC-11）：`keyAction` 键盘映射单一来源表 + 空格 PAUSED 继续 / OVER 重开【D-01 甲】；状态机/数值/UI DOM/CSS/audio.js 零改动 |
| v2.2 | 2026-08-16 | **本次变更**：幽灵块（落点预览，AC-12）——引擎新增纯函数 `ghostY`（复用 `collides` 语义、垂直直线、无踢墙）+ UI 半透明轮廓渲染（同色系空心描边 + 极淡填充，DESIGN §5.6）+ 单测/E2E/装配审计增量；**数值/状态机/keyAction/音效/既有 DOM-CSS 零改动**（回归底线 AC-01~11） |
| v2.2-tc | 2026-08-16 | **技术变更单**（tech，无功能变化）：新增工程自检脚本 `scripts/verify-constants.cjs`，断言 `game.js`/`ui.js`/`audio.js` 头部 `VERSION` 均 === `'2.2.0'` 且与 §2.2 记录一致；不改任何既有代码/行为/UI/AC。详见 `docs/technical/changes.md`。 |
| v2.3 | 2026-08-18 | **本次变更**：1) **幽灵块辅助开关**（AC-13）——`index.html` 新增 `#ghost-control`（`.ghost-control` + `#btn-ghost` 复用 `.btn--audio` token）；`ui.js` `createBoardRenderer.render` 增加 `ghostEnabled` 参数（默认开启，关闭不绘幽灵）+ `createUI` 开关绑定（aria-pressed/文案/aria-label 三信号 + 点击即时重绘 + 会话内保持、刷新默认开）+ render 开头 `globalAlpha=1` 防御（AC-13.2/13.3/13.4/13.5）。2) **修正硬降计分**（AC-14）——移除 `hardDrop` 的 `dropBonus`（每格 +1）调用与导出（game.js），仅消行计分。**状态机/keyAction/音效/数值公式零改动**（回归底线 AC-01~12，除 AC-14 硬降加分断言）；`VERSION` 升 `'2.3.0'`（§2.2，无断言依赖）。 |

> **实际交付形态（沿用）**：`index.html + 本地 css/js`，脚本顺序 `audio.js → game.js → ui.js → 内联装配`；UMD 契约 `window.TetrisGame / window.TetrisAudio / window.TetrisUI`。v2.1 快照（PRD/TECHNICAL）已归档至 `docs/history/v2.1/`（本轮开始前 v2.1 PRD 已归档；TECHNICAL v2.1 快照随本轮补归档）。

---

## 0. 现状核验与 v2.2 增量边界（要求 1）

### 0.1 现状核验（v2.1 已交付，实测代码为准）

| 检查项 | 结果 |
|---|---|
| 工程形态 | 扁平纯 JS：`game.js`（引擎/状态机/时钟/键盘/onSfx，零 DOM 副作用）、`audio.js`（合成音效）、`ui.js`（渲染/HUD/遮罩/音量控件/装配）、`index.html`、`style.css`；无 package.json/构建管线，`scripts/*.cjs` 为 node:test 自检 |
| 验证命令（产品根下） | `verify-game.cjs`（47 项）· `verify-audio.cjs`（19 项）· `verify-ui.cjs`（6 项）· `assembly-check.cjs` · `qa-e2e-jsdom.cjs`（164 项）—— v2.1 验收全绿 |
| 代码风格 | 工厂函数 + 闭包（不用 class）、纯函数优先、不可变棋盘、`dispose()` 统一清理、常量单一事实来源 `game.js` 顶部 |
| 阶段命名 | `READY / RUNNING / PAUSED / OVER`（`PHASE_ALIAS`：RUNNING≡PLAYING、OVER≡GAME_OVER） |
| 渲染层 | `game.js` 只发**只读快照**（`getSnapshot()`/`onSnapshot`，含 `board` + `piece`）；`ui.js` `createBoardRenderer.render(s, fx)` 为唯一逐帧重绘层：井底+网格线+已固定块（`drawCell` 逐格 `drawImage` 预烘焙精灵）+ 活动块 `drawPiece` + 消行闪白叠加 |

**v2.2 设计直接依赖的实现事实**（均已核实，行号为当前源文件）：

1. **`game.js` 碰撞纯函数 `collides(board, piece)`（L181~194）**：越界（左右/底部）或与已固定方块重叠 → true；其语义即「方块落点判定」的权威。幽灵块落点必须**复用 `collides`**（PRD §5.3/AC-12.1 硬约束），**不改其实现**。
2. **`createBoardRenderer.render(s, fx)`（ui.js L256~287）** 绘制顺序为：`clear+board-bg → drawGrid → 已固定块（逐格 drawCell）→ 活动块 drawPiece → flash`。幽灵块渲染落点为：**在「已固定块」之后、「活动块」之前插入**，保证实体块永不被遮挡（DESIGN §3.6/§5.6，AC-12.8）。
3. **快照不含渲染专属字段**：`game.js` 的 `snapshot()`（L408~418）返回 `board/piece/next/score/level/lines/phase`——幽灵块为**纯显示**，不新增快照字段；渲染层直接用 `s.board + s.piece` 调用导出的 `ghostY` 纯函数即时计算（DESIGN §4.4，AC-12.6）。每次动作/下落必然 `emit → onSnapshot → renderAll → render`，天然满足「同帧刷新、帧内即时 ≤100ms」（AC-12.2~12.4）。
4. **`hardDrop` 的落点计算（game.js L586~588）**：`while (!collides(board, {type,rot,x, y+d+1})) d++` → 最终 y = `piece.y + d`。`ghostY` 须与此**逐格一致**（复用同一 `collides` 循环），保证「幽灵块位置 = 硬降实际固定位置，偏差 0 格」（AC-12.1）。
5. **渲染常量**：`ui.js` 顶部 `CELL=28`、`GLOW_PAD=14`、`COLORS`（从 `TetrisGame.COLORS` 读取）；`drawCell` 以 `type` 烘焙精灵。幽灵块用同 `COLORS[type].fill`，以「空心描边 + 极淡填充」绘制，不烘焙精灵、不入 sprites 缓存（DESIGN §5.6）。

### 0.2 v2.2 增量边界（只加不改）

1. **不改**：状态机迁移矩阵（`PHASE_TRANSITIONS`/`transition`/`togglePause`）、计分/升级/速度公式、`keyAction` 键盘映射表、`audio.js` 全部、`index.html` DOM 结构与 `style.css` 既有规则（AC-12.7；幽灵块仅 Canvas 内绘制，不新增任何 DOM 层/类钩子；`--ghost-*` token 为 DESIGN 规范记录，不覆盖既有值）。
2. **新增（代码变更面 = `game.js` 引擎纯函数 + `ui.js` 渲染层）**：
   - `game.js`：新增导出纯函数 `ghostY(board, piece)`（**复用 `collides`**，自 `piece.y` 起 y+1 循环至碰撞、返回最后非碰撞 y；垂直直线、无踢墙）。不改 `collides`/`keyAction`/任何既有函数签名语义。
   - `ui.js` `createBoardRenderer`：新增幽灵块绘制——`render` 绘制序列在「已固定块之后、活动块之前」插入；仅 PLAYING 态绘制（快照 `s.piece` 存在且 `s.phase==='RUNNING'` 即隐含 PLAYING 可见，PAUSED 冻结 = 快照不再变化因而不重绘、READY/OVER 无 piece 则不绘制，AC-12.9）。
3. **测试/文档增量**：`verify-game.cjs`（`ghostY` 纯函数用例 + 与 `hardDrop` 落点偏差 0 断言）、`verify-ui.cjs`（`GHOST` 参数表 + `ghostY` 导出断言）、`qa-e2e-jsdom.cjs`（AC-12 断言块含幽灵绘制调用的 `stroke/fill/globalAlpha` 断言 + 既有用例回归保护）、`assembly-check.cjs`（`ghostY`/`GHOST` 导出面）、`README.md`（操作说明补幽灵块一句）。`DESIGN.md` 已由设计角色升级 v2.2，仅核对一致。
4. **`VERSION` 常量**（`game.js`/`ui.js`/`audio.js` 头部）：已同步为 **`'2.3.0'`**（无任何测试断言依赖，零行为影响；沿用 v2.1 OBS-11-3 卫生项处理模式；`verify-constants.cjs` 期望值同步升至 `'2.3.0'`，且其 TECHNICAL 路径修正为 `docs/teamflow/technical/TECHNICAL.md`）。

### 0.3 v2.3 增量（AC-13 幽灵块开关 + AC-14 修正计分，只改已声明面）

1. **AC-13 幽灵块辅助开关**（纯显示控制，`ui.js`/`index.html`/`style.css` 增量）：
   - `index.html` 信息面板「音量控件」下方新增 `#ghost-control`（`.ghost-control`）+ `#btn-ghost`（复用 `.btn--audio`），默认 `aria-pressed="true"`。
   - `ui.js` `createBoardRenderer.render(s, fx, ghostEnabled?)`：第三参 `ghostEnabled === false` 时跳过幽灵绘制（缺省/true 开启，兼容既有调用）；`createUI` 持 `ghostEnabled` 会话状态（默认开、结束→重开保持、刷新恢复默认），点击 `#btn-ghost` → 翻转 + `syncGhostBtn()`（`aria-pressed`/`aria-label`/文案三信号，AC-13.5）+ 立即 `renderAll(game.getSnapshot())`（回合中即时生效 ≤100ms，AC-13.3）；`render` 开头 `ctx.globalAlpha = 1` 防御（开关态叠加渲染互不污染）。
   - `style.css` 新增 `.ghost-control` 布局 + `#btn-ghost[aria-pressed]` 形态（开启微金 / 关闭弱化，非仅颜色）。
   - E2E：AC-13 断言块（默认开启/开关联动/即时生效/会话保持/可访问性三信号）。
2. **AC-14 修正硬降计分**（`game.js` 增量）：`hardDrop` 删除 `state.score += dropBonus(d)` 调用并移除 `dropBonus` 定义与导出（`assembly-check` `needApi` 同步移除）；落点循环 `while(!collides(...y+d+1)) d++` **保持不变**（幽灵块/硬降落点一致性 AC-12.1 不受影响）；仅消行计分（`scoreForLines`，AC-06.5）不变。
3. **不改**：状态机、`keyAction`、音效（`audio.js`）、计分/升级/速度公式、幽灵块渲染规范本身（§3.6/§5.6）；`audio.js` `VERSION` 仅文本同步。
4. **测试/文档增量**：`verify-game.cjs`（hardDrop 不加分断言 + 移除 dropBonus 用例）、`qa-e2e-jsdom.cjs`（AC-13 开关块 + AC-14 硬降计分断言 + AC-11.3 硬降分数差=仅消行修正）、`assembly-check.cjs`（导出面减 `dropBonus`、DOM 增 `#btn-ghost`）、`README.md`/`DESIGN.md`/`ARCHITECTURE.md`/`memory.md`/`AGENTS.md`/`changes.md` 同步。

---

## 1. 总体架构与数据流（v2.2 增量视角）

```
engine：createGame 会话（唯一可变状态；状态机/数值/键盘/音效出口全部不变）
  │ 每次状态变化 emit → onSnapshot(s)：s.board + s.piece（只读，不含幽灵块）
  ▼
ui.js renderAll(s)
  ├─ boardRenderer.render(s)：
  │     1) 井底 + 网格线（不变）
  │     2) 已固定块（drawCell，不变）
  │     3) 【v2.2】若 s.phase===RUNNING && s.piece：ghostY = TetrisGame.ghostY(s.board, s.piece)
  │         以 (x=piece.x, y=ghostY, type, rot) 绘制幽灵块（同色空心描边 + 极淡填充，DESIGN §5.6）
  │     4) 活动块 drawPiece（不变，实体永不被遮挡）
  │     5) 消行闪白（不变）
  ├─ nextWell.render / hud.update / overlay / 反馈（全部不变）
```

- **幽灵块是渲染层纯派生**：计算只依赖引擎导出的 `ghostY` 纯函数 + 快照 `board/piece`，**不新增任何引擎状态、快照字段、键盘映射、音效事件**（AC-12.6/12.7）。全部行为差异收敛在「一次 `ghostY` 调用 + 一段 Canvas 绘制」内，便于单测、审查与回滚。
- **状态覆盖天然满足**（AC-12.9）：`s.phase === 'RUNNING'` 才绘制（PLAYING 实时可见）；PAUSED 态 `renderAll` 仍在每次快照发生时触发，但 `piece` 原地冻结、`ghostY` 不变 → 幽灵块「原地冻结」= 不重算不变化；READY/OVER 态 `s.piece === null` → 不绘制。
- **音效口径**：幽灵块**不产生任何 `onSfx` 事件**（纯显示），与 AC-09 七类事件集、AC-12.7「音效零改动」完全一致。

---

## 2. 数据模型与存储（要求 2）

### 2.1 引擎纯函数 `ghostY`（v2.2 新增数据契约）

> 落点 = 当前方块从当前位置（同 x、同 rot）沿 y 轴**纯垂直下落**、首次碰撞前一刻的最大合法 y（PRD §5.3/AC-12.1）。实现**复用 `collides`**，与 `hardDrop`（game.js L586~588）同一循环语义。

```js
/**
 * 幽灵块（落点预览）垂直落点计算（AC-12.1；v2.2 新增，复用 collides，不改其实现）
 * 从 piece.y 起逐步 y+1 直至 collides 为真，返回最后一个非碰撞 y。
 * 语义与 hardDrop 的落点循环逐格一致 → 幽灵块位置 = 硬降实际固定位置，偏差 0 格。
 * @param {Array<Array<string|null>>} board  不可变棋盘（20×10）
 * @param {{type:string,rot:number,x:number,y:number}} piece
 * @returns {number} 垂直落点 y（≥ piece.y；若 piece 当前即碰撞则返回 piece.y）
 */
function ghostY(board, piece) {
  let y = piece.y
  while (!collides(board, { type: piece.type, rot: piece.rot, x: piece.x, y: y + 1 })) y++
  return y
}
```

- **复杂度**：`O(ROWS)` 至多 20 步（每步一次 `collides`），与既有 `hardDrop` 同量级；总计算+重绘与既有渲染同栈（DESIGN §7，AC-12.10）。
- **返回符号约定**：返回**落点 y**（非下落步数 d，非是否碰撞布尔）。若 `piece` 当前即碰撞（理论不出现于正常 RUNNING 态，防御仍是 `piece.y`），语义安全。
- **不新增状态字段**：幽灵块不进 `state`/`snapshot`，无内存/持久化影响；PRD §3.2 无可配置开关/透明度设置（恒定显示）。

### 2.2 存储与版本

- **无任何新增持久化**（PRD §3.2，沿用；音量/静音/最高分/幽灵开关 localStorage 均为 P2 未做，幽灵开关刷新恢复默认开启）。
- **无新增运行时状态字段**：幽灵块为渲染期派生，`state.board`/`state.piece` 即唯一数据源；幽灵开关状态为 `ui.js` 渲染层局部变量（会话内保持，不进引擎快照）。
- **VERSION 常量**：`game.js`/`ui.js`/`audio.js` 头部已统一为 **`'2.3.0'`**（§0.3 卫生同步，无断言依赖、零行为影响；`verify-constants.cjs` 固化为三模块一致 + §2.2 一致断言）。

---

## 3. 接口契约（API 设计：路由/入参出参的等价物，要求 2）

> 无后端、无 HTTP 路由（PRD §3.2）。以下为模块间 UMD 契约（签名即"入参出参"），是并行开发的唯一协商基准。v2.2 **只新增 `ghostY` 导出与渲染层幽灵块绘制，不删改任何既有签名**。

### 3.1 `game.js` 增量（引擎纯函数）

```js
// 新增导出（window.TetrisGame.ghostY / module.exports.ghostY）
function ghostY(board, piece) { ... } // 见 §2.1
```

- **语义要点**：复用 `collides`（不改其实现）；垂直直线、无踢墙（AC-12.5）；返回值与 `hardDrop` 落点一致（偏差 0，AC-12.1）；不发射 `onSfx`、不触碰状态机（AC-12.6/12.7）。
- **零改动**：`collides`/`isGrounded`/`pieceCells`/`keyAction`/`hardDrop`/`createGame` 签名与实现**一律不动**；新增函数为纯追加。

### 3.2 `ui.js` 增量（渲染层幽灵块叠加）

`createBoardRenderer` 的 `render(s, fx)` 在既有绘制序列中插入幽灵块段（§1 数据流），并新增一个内部辅助 `drawGhost(piece, type)`（`type` 用于取 `COLORS[type].fill` 同色系填色；`piece` 已是 `y = ghostY` 的结果）：

```js
// render 内【已固定块之后、活动块之前】：
if (s.phase === 'RUNNING' && s.piece) {
  const gy = TetrisGame.ghostY(s.board, s.piece)
  drawGhost({ type: s.piece.type, rot: s.piece.rot, x: s.piece.x, y: gy }, s.piece.type)
}
```

- **`drawGhost(piece, type)` 视觉实现**（DESIGN §5.6，常量收敛为 `ui.js` 顶部导出的不可变参数表 `GHOST` 以便 Node 单测）：
  - 轮廓描边：`COLORS[type].fill`，`globalAlpha = GHOST.OUTLINE_ALPHA`（`0.75`），`lineWidth = GHOST.LINE_WIDTH`（`2`，css px，随 DPR 由 `ctx.setTransform` 缩放）；
  - 内部填充：同 `fill`，`globalAlpha = GHOST.FILL_ALPHA`（`0.16`，极淡，凸显空心未落定语义）；
  - **无辉光**、**无顶部高光**（区别于实体块）；
  - 每个占格用 `roundRectPath` 画空心圆角矩形（内缩 0.5px 防描边溢出格界），不烘焙 sprite、不入 `sprites` 缓存；全程 `ctx.save()/restore()` 包裹（绘制后复位 `globalAlpha=1`/`lineWidth`，避免污染后续 `drawCell`）。
- **可测性**：`ui.js` 导出 `GHOST = { OUTLINE_ALPHA: 0.75, FILL_ALPHA: 0.16, LINE_WIDTH: 2 }` 作为幽灵视觉参数的**单一事实来源**（对应 DESIGN §5.6），`verify-ui.cjs` 可在 Node 直接断言其值（AC-12.8「透明度可编程测量」）；实际绘制调用的 `stroke/fill/globalAlpha` 断言放入 jsdom E2E（§7.3）。
- **合约要点**：
  - 幽灵块 `x`/`rot`/`type` 与当前 `piece` 完全一致，仅 `y = ghostY(...)`（AC-12.1）；
  - 绘制层级「已固定块 → 幽灵块 → 实体块」，实体永不被遮挡（AC-12.8）；
  - 状态覆盖：READY/OVER（`piece===null`）不绘；PAUSED 冻结（快照不变即不重算）；仅 `phase==='RUNNING'` 绘（AC-12.9）；
  - 不改变既有多边形绘制、不新增 DOM 层/类钩子、不新增键盘监听（AC-12.7）。
- **常量零覆盖**：新增幽灵视觉常量与既有 `CELL`/`GLOW_PAD`/`FLASH_FILL` 无冲突；`--ghost-*` CSS token 是 DESIGN 规范记录，Canvas 不消费（沿用 §1 说明）。

### 3.3 零改动面（明确清单，防误改）

| 文件/模块 | 保持原因 |
|---|---|
| `game.js` 既有全部（`collides`/`keyAction`/状态机/数值/`hardDrop`/`createGame`） | AC-12.7：仅**追加** `ghostY`，不改任何既有函数签名与实现语义 |
| `audio.js` | 音效参数/音量/静音契约不变（PRD §5.2）；幽灵块无新音效事件 |
| `index.html` | 幽灵块仅 Canvas 内绘制，**零 DOM 改动**（含 key-hints 图例为可选文字说明，本体不新增元素） |
| `style.css` | AC-12.7：不新增/修改既有 CSS 规则；`--ghost-*` 仅为规范记录（不覆盖既有 token） |
| 状态机 / HUD / 遮罩 / 反馈 / 音量控件 | 全部不动 |

---

## 4. 前端组件与页面划分（要求 2）

单页应用、无路由。**v2.2 不新增/不修改任何组件、页面与 DOM 结构**（AC-12.7；幽灵块是既有 `#board` Canvas 的**叠加绘制**，DESIGN §2.1/§3.6）：

| 组件 | 处理 |
|---|---|
| 游戏板 Canvas（`#board` + `createBoardRenderer`） | **唯一变更面（渲染层）**：`render` 序列插入幽灵块段 + 新增 `drawGhost` 辅助（§3.2） |
| 引擎 `game.js` | **追加导出纯函数 `ghostY`**（§3.1）；零改动其余 |
| 信息面板 / 下一个预览 / 遮罩 / 反馈 / 音量控件 / key-hints | 全部不动 |
| 音效引擎 `audio.js` | 不动 |

**文档同步（非视觉，开发阶段核对）**：`README.md` 操作说明「如何运行/玩法」补一句「当前方块正下方实时显示半透明落点预览（幽灵块）」（AC-12，可选一行）；`DESIGN.md` 已由设计角色升级 v2.2，逐条核对 §3.6/§4.4/§5.6 与 §3.2 一并实现即可，不另改。

---

## 5. 状态管理（要求 2）

### 5.1 状态所有权（v2.2 不变，新增一项）

| 状态 | 归属 | 谁可写 |
|---|---|---|
| 游戏态/棋盘/分数/等级/行数/当前块 | `game.js` 会话（既有） | 既有方法（不变） |
| **幽灵块落点（v2.2 新增）** | `ghostY` 纯函数（无状态，`board+piece` → y） | 不可写（每次按当前 `board+piece` 重算，派生非存储） |
| 音量/静音/voice | `audio.js`（既有） | 既有 setter（不变） |
| 键盘映射 | `keyAction` 纯函数（既有） | 不可写（v2.2 零改动） |

### 5.2 状态机零改动 + 状态覆盖

- `PHASE_TRANSITIONS` / `transition` / `togglePause` / `start` / `restart` / `lose` **零改动**（AC-12.7）。
- 幽灵块显示与否**不是状态机行为**，而是**渲染层按快照 `phase` + `piece` 的条件派生**：`phase==='RUNNING' && piece` → 绘；否则不绘（AC-12.9）。PAUSED「冻结」= 快照不变化 → `ghostY` 重算结果不变 → 幽灵块原地静止，随恢复继续（DESIGN §4.4）。

### 5.3 刷新时机（AC-12.2~12.4）

- 依赖既有 `emit → onSnapshot → renderAll → boardRenderer.render` 链路：移动/旋转/软降/自动下落/触底锁定成功后 `emit()` 必触发一次 `render`，`render` 内部**每帧重算 `ghostY`** → 天然同帧刷新、帧内即时（≤100ms，AC-12.2~12.4/§1.3）。
- 出生新块、锁定时（当前块消失）也走同链路：新块出现即按其算新的幽灵块，锁定瞬间幽灵块随旧块消失（AC-12.6/12.9）。
- **不新增独立定时器/监听**：不引入额外渲染驱动，避免与下落时钟、状态机竞态。

### 5.4 数据流只读性（AC-12.6）

- 幽灵块**只读** `board`/`piece`，**不写**任何引擎状态；不调用 `move/rotate/softDrop/hardDrop/clearLines/score`。其存在与否对自动下落、硬降、旋转、移动、状态机、音效触发**零影响**（AC-12.6）；回归底线 AC-01~11 全绿即证明。

---

## 6. 关键实现要点与边界情况（要求 2）

### 6.1 AC-12 逐条落地要点

| AC | 实现位置/机制 |
|---|---|
| AC-12.1 落点位置正确 / 偏差 0 格 | `ghostY(board, piece)` 复用 `collides` 的 y+1 循环（§2.1），与 `hardDrop` 落点逐格一致；verify-game 断言 `ghostY === hardDrop 后 piece.y`（偏差 0）+ E2E 渲染对照 |
| AC-12.2 随左右移动刷新 | 移动成功后 `emit → render`，`s.piece.x` 变化 → `ghostY` 按新 x 重算；侧边界由 `collides` 越界语义天然限制（不越出 10 列，AC-12.5） |
| AC-12.3 随旋转刷新 | 旋转成功后 `s.piece.rot` 变化 → `ghostY` 按新 `rot` 轮廓重算；x 不变时投影随新形状变化（`shapeOf`/`collides` 语义保证，AC-12.5） |
| AC-12.4 随软降/自动下落刷新 | 软降/重力步成功 → `s.piece.y` 增 → `ghostY` 落点同步上移相应格数；verify-game 断言 `ghostY` 随 `y` 同步（落点差不变） |
| AC-12.5 遮挡/边界语义一致 + 无踢墙 | 复用 `collides`：掩体上恰落掩体上一格、贴边不越界；`ghostY` 仅垂直迭代 y，**不产生任何侧向偏移**（无踢墙） |
| AC-12.6 不参与逻辑 | 幽灵块只读快照、不写任何状态/不走任何动作方法（§5.4） |
| AC-12.7 零改动接口行为 | 变更面 = 新增 `ghostY` + 渲染层追加绘制；`collides`/`keyAction`/数值/状态机/音效零改动（§3.3） |
| AC-12.8 渲染可辨识不干预操作 | 同色系空心描边（alpha 0.75、线宽 2px）+ 极淡填充（alpha 0.16）、无辉光/无顶部高光（DESIGN §5.6）；jsdom 可断言 `stroke/fill` 调用与 `globalAlpha` 值 |
| AC-12.9 状态覆盖 | 仅 `phase==='RUNNING' && piece` 绘；PAUSED 冻结（快照不变）；READY/OVER 无 piece 不绘（§5.2） |
| AC-12.10 性能 | `ghostY` O(ROWS) + 单次 Canvas stroke/fill，非动画层；与既有渲染同栈，FPS≥55（DESIGN §7） |
| AC-12.11 人工补测 | 真机目测可辨识度/复杂形状落点/双分辨率/相邻边界（§7.4 登记，环境限制非缺陷） |

### 6.2 边界情况清单（v2.2 新增 E-12-01 ~ 10；既有 E1~E15、E-SFX-01~13、E-11-01~10 不变）

| # | 边界情况 | 处理策略 |
|---|---|---|
| E-12-01 | 幽灵块落点与硬降位置一致性 | `ghostY` 与 `hardDrop` 同一 `collides` 循环 → 偏差 0；verify-game 对 7 型 × 多 x/rot 断言 `ghostY({x,y}) - y === hardDrop 后 piece.y - y` |
| E-12-02 | 上方存在掩体（悬空落点） | `collides` 检测到掩体行 → 落在掩体上一格（AC-12.5）；单测构造掩体场景断言 |
| E-12-03 | 贴边移动后幽灵块越界 | `collides` 越界语义 → 落点不越出 10 列；单测 x=0/x=9 边界断言（AC-12.5） |
| E-12-04 | 旋转后轮廓变化（I/S/Z 复杂形状） | `ghostY` 按 `piece.rot` 的 `shapeOf` 计算；单测覆盖 I/S/Z 旋转样例（AC-12.3）；视觉目测归人工补测（AC-12.11） |
| E-12-05 | READY / GAME_OVER 态幽灵块 | `s.piece === null` → 不绘制（AC-12.9）；E2E 断言 READY/OVER 下 `ctx` 无幽灵 stroke/fill 段 |
| E-12-06 | PAUSED 态幽灵块冻结 | `togglePause` 后快照不再变 → `ghostY` 结果不变 → 幽灵块原地静止；恢复后随移动/下落继续刷新（AC-12.9） |
| E-12-07 | 触底/锁定瞬间幽灵块消失 | 锁定时 `piece=null` → 幽灵块不绘；下一块出生即按其重算新幽灵块（AC-12.6） |
| E-12-08 | `ghostY` 入参异常（未知 type / rot 越界 / piece null） | **已实现（v2.4，AC-12.12，OBS-12-1 关闭）**：防御 `rot` 用 `%4` 归一并负数归一到 0–3（等价 `((v%4)+4)%4`）、未知 `type` 回退原样（返回 `piece.y`，不抛错）、`piece === null` 返回安全默认 `-1`（类型安全 number，不抛错）；调用方仅在 `piece` 非空时调用 |
| E-12-09 | 幽灵块绘制污染后续 drawCell | `drawGhost` 用 `ctx.save()/restore()` 包裹（或绘制后复位 `globalAlpha=1`/`lineWidth`），避免影响实体块渲染 |
| E-12-10 | 幽灵块与实体块重叠（极低 y） | 绘制顺序「固定块→幽灵块→实体块」保证实体块在最上层、永不被遮挡（AC-12.8）；视觉边界可辨识归人工补测（AC-12.11） |

> **决策记录 D-12（无分歧，记录性）**：幽灵块是否需要新增快照字段 `ghostY`？——**否**。幽灵块为纯显示派生（DESIGN §4.4），若写入 `snapshot` 会污染引擎契约、增加快照复制成本且无收益；渲染层内联一次 `ghostY` 调用即可，且更利于 Node 单测（纯函数直接测，不依赖渲染）。此决策与 PRD §1.2「引擎纯函数、可 Node 单测」一致。

---

## 7. 测试策略（要求 2）

### 7.1 `scripts/verify-game.cjs` 增量（node:test，零依赖，新增 4 组用例）

| 用例 | 断言 |
|---|---|
| **ghostY 纯函数基础（AC-12.1）** | 空板：`ghostY(board, spawn('T'))` = 19 − (T rot0 底部行偏移)（落板底）；地板越界由 `collides` 处理；`ghostY` 输出 `number` 且 ≥ piece.y |
| **ghostY 与 hardDrop 落点偏差 0（AC-12.1 核心）** | 对 7 型 × 多 x/rot 组合：`_debug.setPiece({x,y})` → `const g0 = ghostY(board, piece)` → `hardDrop()` → 断言 `hardDrop 后 piece.y === g0`（偏差 0） |
| **ghostY 遮挡/边界/旋转（AC-12.3/12.5）** | 构造掩体 → `ghostY` 落掩体上一格；x=0/x=9 贴边不越界；I/S/Z 旋转（rot 0/1/2/3）后落点按新轮廓正确；软降/移动后 `ghostY` 同步（落点差不变） |
| **ghostY 不触发副作用（AC-12.6/12.7）** | 调用 `ghostY` 前后：`game.getSnapshot()` 快照不变、`events.sfx` 不变（纯函数无副作用）；`keyAction`/`collides` 签名与语义不变（既有用例全绿即等价证明） |

> 既有 47 项全部保持（含 `keyAction` 矩阵、状态机矩阵、onSfx 序列、恢复节拍）。`ghostY` 为纯函数，`keyboard:false` 下可直接 `T.ghostY(board, piece)` 测。

### 7.2 `scripts/verify-ui.cjs` 增量（node:test，零依赖）

| 用例 | 断言 |
|---|---|
| **ghost 视觉参数单一事实来源（AC-12.8 透明度可编程测量）** | `T.GHOST.OUTLINE_ALPHA === 0.75`、`T.GHOST.FILL_ALPHA === 0.16`、`T.GHOST.LINE_WIDTH === 2`，与 DESIGN §5.6 一致；`game.js` 新增 `ghostY` 导出存在（`typeof G.ghostY === 'function'`） |
| **常量对齐不回归** | 既有 6 项导出（含 `createBoardRenderer`/`createUI` 等）保持 + 新增 `GHOST` 导出；`COLS/ROWS` 仍与 `game.js` 对齐 |

> 说明：`createBoardRenderer.render` 的**绘制调用级**断言（`stroke/fill/globalAlpha` 实际调用）依赖 jsdom DOM（`bakeSprite` 需 `document.createElement`），故放在 `qa-e2e-jsdom.cjs`（§7.3）而非纯 Node 的 `verify-ui.cjs`；本脚本仅断言 Node 可达的 `GHOST` 参数表与导出存在，零 DOM 副作用保持。

### 7.3 `scripts/qa-e2e-jsdom.cjs` 增量与既有用例保护

**既有用例**：164 项全部保持（含 AC-02/04/05/11 键盘与状态机、AC-09/10 音效、装配契约）——幽灵块为纯追加，不触碰任何既有断言；另加一条「幽灵渲染不干扰既有绘制计数」的回归佐证（可选）。

**新增 AC-12 断言块**（建议置于 AC-05 与 AC-09 段之间）：

| 断言 | 覆盖 |
|---|---|
| PLAYING 态存在当前块时，`ctx` 桩记录包含幽灵 `stroke`（空心描边）且 `fill` 淡填充 alpha 0.16；`drawImage` 次数不变预渲染精灵（幽灵不烘焙 sprite） | AC-12.8 |
| PLAYING 态幽灵落点 y = `game` 快照 `piece` 经 `ghostY(s.board, s.piece)` 的值；与 `hardDrop` 后 `piece.y` 一致（E2E 层偏差 0，AC-12.1） | AC-12.1 |
| 左移/旋转/软降后幽灵落点同步变化（`ghostY` 重算值 & 绘制段刷新） | AC-12.2/3/4 |
| READY 态 `render` 无幽灵 stroke；GAME_OVER 态（`lose()` 或堆满）无幽灵 stroke；PAUSED 态 `togglePause` 后幽灵所在 y 快照不变（冻结） | AC-12.9 |
| 幽灵渲染不触发 `sfx`（`spy.plays` 无新增），不改变 `score/level/board/piece`（纯显示） | AC-12.6 |
| 结构级佐证：无新增 DOM `id`/`class` 钩子（`#board` 仍为唯一渲染层） | AC-12.7 |

### 7.4 `scripts/assembly-check.cjs` 增量

- §1 `needApi` 数组追加 `'ghostY'`（`TetrisGame.ghostY` 导出存在断言）。
- §2 `needUI` 数组追加 `'GHOST'`（`TetrisUI.GHOST` 幽灵视觉参数表导出断言）。
- 其余审计（脚本顺序/选择器/CSS 钩子/自包含/音频文件）不变；可选新增断言 `--ghost-*` token 出现于 `style.css`（DESIGN §5.1 规范记录核对，非覆盖性）。

### 7.5 回归底线与人工补测

- **回归底线**：`verify-game.cjs`（47+新增）、`verify-audio.cjs`（19）、`verify-ui.cjs`（6+新增）、`assembly-check.cjs`、`qa-e2e-jsdom.cjs`（164+新增）**全部全绿**；AC-01 ~ AC-11 语义不变（PRD §9）。
- **人工补测（真实浏览器，file://，AC-12.11，环境限制非缺陷）**：
  1. 幽灵块在暗色玻璃基调下的可辨识度（透明度/轮廓线宽/色相，AC-12.8）；
  2. 旋转后复杂形状（I/S/Z）落点目测（AC-12.3）；
  3. 1920×1080 与 1366×768 双分辨率无错位（AC-12.8）；
  4. 幽灵块与其他块体相邻时边界可辨识（AC-12.11）；
  5. 刷新及时性：移动/旋转/软降后幽灵块即时刷新（DevTools 采样 ≤100ms，AC-12.2~12.4/§1.3）。
- **自动化无法证明视觉一致**：以「渲染层可编程断言（alpha/调用）+ QA 截图/目测」双通道为准。

---

## 8. 任务拆分清单（要求 3，与流水线派发任务对齐）

> **派发对齐说明**：流水线派发了两条任务，本拆分**逐项对齐并细化**（文件边界 / 接口契约 §3 / 验收标准），**不另起任务体系**：任务①引擎层 `ghostY`（game.js 纯函数 + 单测 + verify-game/E2E 断言）→ **P-1**；任务②UI 层幽灵块半透明渲染（ui.js + DESIGN 视觉规范）→ **P-2**。二者可并行（P-1 提供 `ghostY` 导出，P-2 依赖该契约）；回归与装配审计 → **P-3**。合并即 PRD §8 里程碑 M1/M2。

### 批次 1（对应 M1，两任务并行）

## 任务：P-1 引擎层 ghostY 落点计算（派发任务①细化）

**P-1.1 game.js 新增纯函数 ghostY**

- **涉及文件**：`products/tetris/game.js`（新增 §3.1 `ghostY(board, piece)` 导出；`VERSION` 已升 `'2.2.0'`）
- **接口契约**：§3.1 / §2.1（`ghostY(board, piece) → number`，复用 `collides`、垂直直线、无踢墙）；§6.2 E-12-01~08 覆盖（落点一致性/掩体/边界/旋转/防御）
- **实现要点**：y+1 循环复用 `collides`；**不改** `collides`/`keyAction`/`hardDrop`/任何既有函数；`node --check game.js` 通过
- **验收标准**：`verify-game.cjs` §7.1 新增 4 组用例绿；既有 47 项全绿（AC-01~11 回归）；`ghostY` 与 `hardDrop` 落点偏差 0 断言通过
- **并行关系**：独立（不依赖 UI 任务）；P-2 依赖其 `ghostY` 导出存在（契约先行）

**P-1.2 单测增量（verify-game.cjs）**

- **涉及文件**：`products/tetris/scripts/verify-game.cjs`（§7.1：ghostY 基础 / 与 hardDrop 偏差 0 / 遮挡边界旋转 / 无副作用）
- **接口契约**：§3.1 `ghostY` 签名；§2.1 语义
- **验收标准**：新增用例全绿；总用例数 = 47 + 新增；`node scripts/verify-game.cjs` 退出码 0
- **并行关系**：依赖 P-1.1 的 `ghostY` 导出存在（可与 P-1.1 并行写用例骨架）

## 任务：P-2 UI 层幽灵块半透明渲染（派发任务②细化）

**P-2.1 ui.js 渲染层幽灵块叠加绘制**

- **涉及文件**：`products/tetris/ui.js`（`createBoardRenderer.render` 插入幽灵块段 + 新增 `drawGhost` 辅助 + 导出 `GHOST` 参数表；`VERSION` 已升 `'2.2.0'`）
- **接口契约**：§3.2（幽灵块 y = `TetrisGame.ghostY(s.board, s.piece)`；同色空心描边 alpha `GHOST.OUTLINE_ALPHA`=0.75 / 线宽 `GHOST.LINE_WIDTH`=2 / 填充 `GHOST.FILL_ALPHA`=0.16 / 无辉光 / 无顶部高光，DESIGN §5.6；绘制层级「固定块→幽灵块→实体块」；仅 `phase==='RUNNING' && piece` 绘制）；§6.2 E-12-05/06/07/09/10 覆盖
- **实现要点**：`ctx.save()/restore()` 包裹防污染；不烘焙 sprite；**零改动**既有渲染路径/布局/`drawCell`/`drawPiece`/DOM/快捷键；jsdom 可断言 `stroke/fill` 调用与 `globalAlpha` 值
- **验收标准**：`verify-ui.cjs` §7.2 新增渲染契约用例绿 + `qa-e2e-jsdom.cjs` §7.3 AC-12 断言块绿；既有 6 项 UI 契约 + 164 项 E2E 全绿（回归）
- **并行关系**：依赖 P-1 的 `ghostY` 导出存在（契约先行，可与 P-1 并行开发渲染骨架）

**P-2.2 UI 测试增量（verify-ui.cjs + qa-e2e-jsdom.cjs）**

- **涉及文件**：`products/tetris/scripts/verify-ui.cjs`（§7.2：`GHOST` 参数表 + `ghostY` 导出断言）、`products/tetris/scripts/qa-e2e-jsdom.cjs`（§7.3：AC-12 断言块含幽灵绘制 `stroke/fill/globalAlpha` 断言）
- **接口契约**：§3.2 渲染契约；PRD AC-12.1~12.10
- **验收标准**：新增用例全绿；既有用例全绿；两脚本退出码 0
- **并行关系**：依赖 P-2.1 渲染落地 + P-1.1 的 `ghostY` 导出

### 批次 2（对应 M2 回归与验收）

## 任务：P-3 装配审计、文档同步与回归验收

**P-3.1 装配审计 + README 同步**

- **涉及文件**：`products/tetris/scripts/assembly-check.cjs`（§7.4：`needApi` 追加 `ghostY`、`needUI` 追加 `GHOST`；可选 CSS token 核对）、`products/tetris/README.md`（操作说明补幽灵块一句）、`docs/SUMMARY.md`/`docs/teamflow/memory.md`（README 同步由开发/PM 各自落盘，开发仅核对一致性）
- **实现要点**：文档同步为纯文本（非代码）；DESIGN 已升级 v2.2，仅核对 §3.6/§4.4/§5.6 与实现一致
- **验收标准**：`assembly-check.cjs` ALL PASSED；README 幽灵块说明与 AC-12 口径一致
- **并行关系**：与 P-1/P-2 并行（只依赖契约，不依赖代码）

**P-3.2 回归与验收（对应 M2）**

- **涉及文件**：全量验证五套脚本 + E2E；`docs/qa/QA-REPORT.md`（由 QA 阶段落盘 v2.2 结论）；`AGENTS.md` §1/§5/§6（产品经理验收后同步）
- **实现要点**：AC-01 ~ AC-11 全量回归（回归底线）+ AC-12 全组；§1.3 指标抽查（含落点偏差 0、刷新 ≤100ms）；UI 零既有改动确认（截图/结构 diff，幽灵块为新增叠加）
- **验收标准**：全部自动化验收项 100% 通过，无 P0/P1 遗留；AC-12.11 人工补测项按既有模式登记（环境限制非缺陷，不阻断流转）
- **并行关系**：依赖 P-1 与 P-2 全部完成

---

## 9. 里程碑映射（对应 PRD §8）

| 里程碑 | 周期 | 对应任务 | 出口标准 |
|---|---|---|---|
| M1 幽灵块实现（v2.2） | D1 | P-1（引擎 `ghostY` + 单测）+ P-2（UI 渲染 + UI/E2E 测试） | AC-12 自动化项全部通过（`ghostY` 纯函数 + 与 `hardDrop` 偏差 0 + 渲染契约 + E2E 断言）；AC-01~11 回归全绿；数值/状态机/keyAction/音效零改动确认 |
| M2 回归与验收（v2.2） | D1 | P-3（P-3.1 + P-3.2） | AC-01~11 全量回归绿 + AC-12 端到端绿 + §1.3 抽查（落点/刷新）；零既有改动截图/结构确认；QA 报告落盘；AC-12.11 人工补测项登记 |

---

## 10. 风险与注意（v2.2 增量，承接 v2.1 §10 与 PRD §7.2）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 幽灵块计算/渲染改动引入回归（AC-12.7） | 破坏碰撞/状态机/快捷键/音效 | 落点为**新增纯函数**（不复用/不改 `collides` 内部，仅叠加 y 循环）；渲染为**新增 Canvas 叠加段**；E2E 补 AC-12 断言 + 回归 AC-01~11 全绿；`audio.js`/`index.html`/`style.css` 任务边界禁止触碰 |
| 幽灵块落点与硬降不一致（AC-12.1） | 玩家误判 | `ghostY` 与 `hardDrop` 复用同一 `collides` 循环；自动化断言偏差 0（verify-game 7 型×多 rot）+ E2E 对照 + 硬降实测（人工） |
| 旋转后形状轮廓致落点歧义（AC-12.3） | 视觉错位 | 严格按 `piece.rot` 的 `shapeOf` 边界格集合计算投影，单测覆盖 I/S/Z 旋转样例；视觉目测归人工补测（AC-12.11） |
| 幽灵块可辨识度不足（AC-12.8） | 暗色玻璃下看不清 | 同色系半透明轮廓 + 边框反衬（alpha 0.75/线宽 2px 可编程测量）；真机目测归人工补测（AC-12.11） |
| 幽灵块渲染污染实体块（性能/视觉） | 帧率下降 / 视觉干扰 | `ctx.save()/restore()` 或绘制后复位 alpha/lineWidth；幽灵块非动画层、O(ROWS) 计算、无双烘焙 sprite；FPS≥55（AC-12.10 回归 AC-09.8 量级） |
| 误改既有渲染路径/DOM/CSS | AC-12.7 零改动违约 / 回归 | 任务边界显式禁止触碰 `drawCell`/`drawPiece`/布局/DOM/快捷键；QA 截图对比 + diff 自查 + `assembly-check` 结构审计 |
| README / 文档口径不一致 | 验收基准漂移 | 与 PRD AC-12 / DESIGN §3.6 对齐；README 仅补幽灵块说明一句，交由开发同步并核对 |

---

## 11. 开发者自查清单（交付前对照 AC-12）

- [ ] `game.js` 导出 `ghostY`；`collides`/`keyAction`/`hardDrop`/状态机/数值/ `createGame` 实现**零改动**（可用 `git diff` 核验为纯追加）
- [ ] `ui.js` 导出 `GHOST` 参数表（OUTLINE_ALPHA 0.75 / FILL_ALPHA 0.16 / LINE_WIDTH 2）；`createBoardRenderer.render`：幽灵块位于「固定块之后、活动块之前」；仅 `phase==='RUNNING' && piece` 绘制；`ctx.save/restore` 包裹
- [ ] 幽灵视觉数值落地（alpha 0.75 / 线宽 2px / 填充 0.16 / 无辉光 / 无顶部高光）与 DESIGN §5.6 一致
- [ ] 五套验证与 E2E 全绿：`verify-game`（+ghostY 4 组）、`verify-audio`、`verify-ui`（+GHOST 参数表）、`assembly-check`（+ghostY/GHOST 导出）、`qa-e2e-jsdom`（+AC-12 断言含幽灵绘制调用）
- [ ] `audio.js` / `index.html` DOM / `style.css` 既有规则零改动；`README` 补幽灵块一句
- [ ] AC-12.11 人工补测项已登记 QA 清单（可辨识度/复杂形状/双分辨率/相邻边界），非自动化阻断
