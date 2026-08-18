# 俄罗斯方块（Tetris）简化版 — 技术方案（TECHNICAL）

- 版本：v2.0（v1.0 → v2.0 增量：音效系统）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`products/tetris/docs/prd/PRD.md`（v2.0，**验收唯一依据**，AC-01~10）、`products/tetris/docs/design/DESIGN.md`（v1.0，视觉/交互/a11y 规范，本次复用其 §5.1/§5.3 token，不引入新视觉风格）、`products/tetris/docs/architecture/ARCHITECTURE.md`（工程脚手架参考，实际交付为扁平纯 JS）、`products/tetris/AGENTS.md`（§4 工程约定）
- 定位：将 PRD v2.0 增量（AC-09 合成音效 / AC-10 音量与静音控制）落实为**可并行开发**的数据模型、接口契约、实现要点与任务拆分。所有数值以 PRD §5 为准，视觉以 DESIGN §5 为准；本文档**不修改任何既有规格**（AC-01 ~ AC-08 语义不变，为本版回归底线）。
- 交付物：`products/tetris/index.html`（`file://` 双击即玩，零构建、零外部依赖、零外部音频文件）。

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0 | 2026-08-16 | 初版技术方案（TS+Vite 规划 + 任务拆分 T0~T13）；交付后补注实际偏差：按流水线 3 个合并任务以扁平纯 JS 交付（`game.js`/`ui.js`/`style.css`/`index.html`，UMD 契约），`node:test` 脚本替代 Vitest，TS+Vite 保留为可选工程化路径 |
| v2.0 | 2026-08-16 | **本次变更**：新增音效系统技术方案——`audio.js` 合成引擎（7 类事件音效参数表落盘，AC-09）+ 音量/静音控制（M 键 + 信息面板控件，AC-10）+ `game.js` `onSfx` 事件出口 + 测试/装配审计增量；既有玩法、计分、数值、键盘映射不动 |

> **实际交付形态（v1.0 已确立，v2.0 沿用）**：`index.html + 本地 css/js` 形态（PRD AC-08.1 允许），脚本顺序 `game.js → ui.js → 内联装配`；v2.0 新增 `audio.js`，顺序变为 `audio.js → game.js → ui.js → 内联装配`。`window.TetrisGame` / `window.TetrisUI` / `window.TetrisAudio` 三 UMD 契约。

---

## 0. 现状核验与既有架构确认（要求 1）

### 0.1 现状核验（v1.0 已交付，实测代码为准）

| 检查项 | 结果 |
|---|---|
| package.json / 构建管线 | **不存在**（零 Node 工具链交付；`scripts/*.cjs` 为 node:test 自检脚本，无依赖） |
| 数据层 / API 层 | 无后端（PRD §3.2）。等价物：① `game.js` 引擎纯函数 + `createGame` 会话（唯一可变状态持有者）；② 模块间 UMD 契约（导出面即"API"，见 §3） |
| 核心文件 | `game.js`（引擎/状态机/时钟/键盘，零 DOM 副作用，Node 可加载）、`ui.js`（渲染/HUD/遮罩/toast/装配）、`style.css`（token/布局/组件）、`index.html`（DOM 骨架 + 装配根） |
| 验证命令（产品根下） | `node scripts/verify-game.cjs`（33 项）· `verify-ui.cjs`（5 项）· `assembly-check.cjs` · `qa-e2e-jsdom.cjs`（108 项，需 jsdom） |
| 既有代码风格 | 工厂函数 + 闭包（不用 class）、纯函数优先、不可变棋盘、`dispose()` 统一清理、UMD 双导出（`window.*` + `module.exports`）、常量单一事实来源于 `game.js` 顶部 |
| 阶段命名 | game.js 内部四态 `READY / RUNNING / PAUSED / OVER`（`PHASE_ALIAS`：RUNNING≡PLAYING、OVER≡GAME_OVER） |

### 0.2 v2.0 增量边界（只加不改）

1. **不改**：玩法规则、计分/升级/速度公式、键盘映射、状态机迁移矩阵、`game.js` 既有公开 API（只**新增**选项与导出，不删改签名）。
2. **新增**：
   - `audio.js`（新文件）：Web Audio 合成引擎（7 类音效参数表 + AudioContext 生命周期 + 音量/静音 + 并发上限）。
   - `game.js`：新增 `onSfx(name)` 回调选项（引擎只发事件名，不碰音频 API，保持 Node 可测、零 DOM 副作用）+ 导出 `SFX_EVENTS` 常量。
   - `ui.js`：新增 `createAudioPanel(els, engine)` 工厂 + `createUI` 接线（unlock 监听、`onSfx → engine.play`、音量按钮/M 键、焦点归还）。
   - `index.html`：左信息面板底部新增音量控件区（`#audio-controls`）+ `<script src="./audio.js">`。
   - `style.css`：新增 `.audio-controls` 样式（**复用** DESIGN §5.1/§5.3 token，不引入新视觉风格）。
   - `scripts/`：`verify-game.cjs` 增补 sfx 序列用例；**新增 `verify-audio.cjs`**；`verify-ui.cjs` / `assembly-check.cjs` / `qa-e2e-jsdom.cjs` 增补 AC-09/10 断言。

---

## 1. 总体架构与数据流（v2.0 增量视角）

### 1.1 分层（沿用 v1.0 单向依赖，新增一条只读事件流）

```
input（game.js 键盘/DAS）──成功动作──▶ game.js 会话（唯一可变状态）
                                          │  emit('move'|'rotate'|'softDrop'|'hardDrop')
                                          │  lockFlow 内 emit('clear'|'levelUp'|'gameOver')
                                          ▼
                       onSfx(name) 回调（同步，事件回调内调用）
                                          ▼
                    audio.js SfxEngine.play(name)  ←── ui.js 装配时注入
                                          │ 懒创建/解锁 AudioContext
                                          ▼
                 音效定义表 SFX_DEFS（纯数据）→ 振荡器/包络 → voice Gain(≤0.22)
                                          ▼
                              masterGain（音量 0..1 / 静音=0）
                                          ▼
                                       ctx.destination
```

- **发声职责唯一**：`audio.js` 是唯一触碰 Web Audio API 的模块；`game.js` 只发**事件名**，`ui.js` 只做接线与控件。
- **时序要求**（AC-09.4/§1.3）：`onSfx` 在动作成功路径内**同步**发射 → `play()` 同步调度合成器 → 事件发生→发声 ≤ 50ms；消行音效与行消除同栈（≤ 50ms）；升级音效与 `onLevelUp`（LEVEL UP toast）同点发射；结束音效与 `onGameOver`（GAME_OVER 遮罩）同点发射。

### 1.2 与既有回调的关系

| 既有回调 | 保持 | v2.0 新增 |
|---|---|---|
| `onSnapshot` / `onPhaseChange` | 不变 | — |
| `onLevelUp` / `onGameOver` | 不变（仍驱动 toast/遮罩） | `onSfx(name)`：`levelUp`/`gameOver` 事件在**同一调用栈内**紧邻这两个回调发射，保证视觉与听觉同步 |

---

## 2. 数据模型与存储（要求 2）

### 2.1 音效事件枚举 `SfxEvent`（常量单一事实来源：`game.js` 顶部导出）

```js
// game.js 新增导出（7 值，audio.js/测试/装配统一引用，杜绝字符串漂移）
SFX_EVENTS = ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver']
```

| 事件 | 触发条件（仅"成功"，AC-09.3） | 对应 PRD |
|---|---|---|
| `move` | ←/→ 移动成功（含 DAS 自动重复的每次成功） | US-09 |
| `rotate` | ↑/X 旋转成功 | US-09 |
| `softDrop` | ↓ 软降成功下移 1 格（**触底即锁路径不触发**，见 E-SFX-02） | US-09 |
| `hardDrop` | 空格硬降落底固定 | US-09 |
| `clear` | 一次消行动作（1/2/3/4 行均为**恰好 1 次**，AC-09.2） | US-09 |
| `levelUp` | 升级瞬间（与 LEVEL UP toast 同点） | US-09/AC-09.4 |
| `gameOver` | 进入 OVER 态（自然结束 或 `lose()`） | US-09/AC-09.4 |

### 2.2 音效定义 `SfxDef`（落盘参数表，满足 AC-09.1 可测量）

> PRD §5.2 要求"具体合成参数由技术方案定义并落盘"。以下为**权威参数表**，`audio.js` 的 `SFX_DEFS` 与之逐字段一致，`verify-audio.cjs` 按表断言。

| 事件 | 波形 | 基频（Hz） | 时长 | 包络（attack / 指数衰减） | 峰值增益 | 听感特征 |
|---|---|---|---|---|---|---|
| `move` | square | 220 | 40ms | 2ms / 38ms | 0.22 | 短促"咔哒" |
| `rotate` | sine | 440 | 80ms | 5ms / 75ms | 0.22 | 明亮短音 |
| `softDrop` | triangle | 165 | 30ms | 1ms / 29ms | 0.22 | 轻点 |
| `hardDrop` | sawtooth | 98（下滑至 55） | 70ms | 5ms / 65ms | 0.22 | 低沉落底 |
| `clear` | square | 660（双响 660→660） | 140ms | 5ms / 135ms | 0.22 | 清脆双响 |
| `levelUp` | sine | 523（琶音 523→659→784） | 320ms | 逐音 8ms | 0.22 | 上行琶音 |
| `gameOver` | sawtooth | 380（下滑至 190） | 520ms | 20ms / 500ms | 0.22 | 长下滑 |

**可区分性证明（AC-09.1 基频实测差值 ≥ 50Hz）**：基频排序 `98, 165, 220, 380, 440, 523, 660`，相邻差值 `67 / 55 / 160 / 60 / 83 / 137`，**全部 ≥ 50Hz**；且波形（square/sine/triangle/sawtooth）与包络（时长/滑音/琶音）亦互不相同——双通道满足，自动化可测（§7.2）。

**防削波（AC-10.4 输出峰值 ≤ 1.0）**：单 voice 峰值增益 0.22，并发上限 4 → 最坏叠加 0.88 ≤ 1.0；主增益（0..1）在 voice 之后乘性衰减，不参与叠加风险。

### 2.3 音频设置 `AudioSettings`（会话内存态）

| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `volume` | `number`（0..1） | `0.8`（80%，AC-10.4） | 主输出增益；调节步进 `0.1`（≤10%） |
| `muted` | `boolean` | `false` | 静音标志；开启 = 主增益置 0 + `play()` 短路（AC-10.3） |

- **生命周期 = `createUI` 生命周期**：SfxEngine 在 `createUI` 时创建一次，**不随 `restart()` 重建** → 音量/静音跨"结束 → 重新开始"保持（AC-10.5）；页面刷新重建 `createUI` → 恢复默认（AC-10.5）。
- 归属：`SfxEngine` 私有字段，唯一写入口 `setVolume / setMuted`；`ui.js` 控件只经 setter 写入。

### 2.4 存储

- **无任何新增持久化**（PRD §3.2：音量/静音 localStorage 持久化为 P2，本期明确不做）。
- **0 个音频文件**（AC-09.5）：项目内禁止 `.mp3/.wav/.ogg/.m4a` 与 `<audio>`/`<source>` 元素，由 `assembly-check.cjs` 强制审计（§7.3）。

---

## 3. 接口契约（API 设计：路由/入参出参的等价物，要求 2）

> 无后端、无 HTTP 路由（PRD §3.2）。以下为模块间 UMD 契约（签名即"入参出参"），是并行开发的**唯一协商基准**——各任务按契约实现，互不等待。

### 3.1 `audio.js`（新文件，UMD `window.TetrisAudio`，Node 可 require，顶层零 DOM/Audio 副作用）

```js
// 导出常量
SFX_DEFS: Record<SfxEvent, SfxDef>          // §2.2 权威参数表（纯数据，可单测）
DEFAULT_VOLUME = 0.8                        // AC-10.4 默认 80%
VOLUME_STEP = 0.1                           // 步进 ≤ 10%
MAX_VOICES = 4                              // 并发上限（AC-09.8）

// 工厂（工厂 + 闭包，不用 class）
createSfxEngine(options?: {
  createContext?: () => AudioContextLike     // 测试注入假 AudioContext；缺省按环境自建
}): SfxEngine

// SfxEngine 方法（全部幂等/可安全重复调用）
unlock(): void                              // 首次用户交互时调用：创建并 resume AudioContext（懒创建，幂等）
play(name: SfxEvent): void                  // 同步调度合成；未解锁/不可用/静音/超并发 → 静默 no-op（0 报错）
setVolume(v: number): void                  // clamp [0,1]；即时生效（下一次 play 即用新值）
getVolume(): number
setMuted(m: boolean): void                  // 静音：主增益置 0 + muted 标志；关闭立即恢复，无需重新 unlock
isMuted(): boolean
isAvailable(): boolean                      // Web Audio 可用性（降级判定，AC-09.7）
dispose(): void                             // 停掉全部活动 voice（stop+disconnect）、断开主增益、ctx.close()（catch 吞错）
```

- 浏览器能力探测：`window.AudioContext || window.webkitAudioContext`（Safari 兜底，guard 判空）；均不存在 → `isAvailable()===false`，全部方法 no-op。
- 主链路：`ctx.destination ← masterGain（gain=volume，muted 时=0）← 各 voice 包络 GainNode`。
- 并发控制：内部 `activeVoices` 计数，`play` 时 `active >= MAX_VOICES` → 丢弃新请求（不排队）；voice `onended` → 递减计数 + `disconnect`（防泄漏，AC-09.8）。

### 3.2 `game.js` 增量（只加不改）

| 变更 | 说明 |
|---|---|
| 新增导出 `SFX_EVENTS` | 7 值数组（§2.1），verify/audio.js 引用同一事实来源 |
| 新增选项 `onSfx(name)` | `createGame({ ..., onSfx })`；与既有 `onLevelUp/onGameOver` 并列，缺省 null，不影响既有行为 |
| 新增 7 个发射点 | 见下表——**全部收口在动作成功路径**，被拒绝（`blocked`）/非法态（`illegal-phase`）一律不发射（AC-09.3） |

**发射点定位表**（精确到现有函数/分支）：

| 事件 | 代码位置 | 触发条件 |
|---|---|---|
| `move` | `move(dir)` 中 `collides` 为 false 的分支（`state.piece = moved` 之后、`emit()` 之后） | 移动成功 |
| `rotate` | `rotate()` 中 `collides` 为 false 的分支（同 move） | 旋转成功 |
| `softDrop` | `softDrop()` 中 `collides` 为 false 的分支（下移成功） | **仅成功下移**；触底走 `lockFlow()` 分支不发射（E-SFX-02） |
| `hardDrop` | `hardDrop()` 中计算落点 d 之后、`lockFlow()` 之前 | 每次硬降恰好 1 次 |
| `clear` | `lockFlow()` 中 `clearedRes.cleared > 0` 分支（`scoreForLines` 计分后） | 一次消行动作恰好 1 次（含 2/3/4 行，AC-09.2） |
| `levelUp` | `lockFlow()` 中 `levelUp === true` 分支，**紧邻** `cb.onLevelUp` 调用 | 升级瞬间 |
| `gameOver` | `lockFlow()` 出生碰撞分支 与 `lose()` 中，**紧邻** `cb.onGameOver` 调用 | 进入 OVER 态恰好 1 次 |

- 发射顺序（一次动作可多事件，按此序）：`hardDrop` → `clear` → `levelUp` → `gameOver`；均在**同一同步调用栈**内完成（AC-09.4/§1.3 延迟指标满足）。
- `start()/restart()/togglePause()`：**不发射任何音效**（PRD 未定义开始/暂停/重开音效；AC-10.5 仅要求设置保持）。
- 自动下落（`tick` 重力步）：不发射（非玩家事件，7 类事件集之外）。

### 3.3 `ui.js` 增量

```js
// 新增导出
createAudioPanel(els, engine): { sync(): void; dispose(): void }
// els: { mute, volDown, volUp, volValue }
// 职责：M 键与按钮双入口 → engine.setMuted/setVolume → sync() 同步按钮 aria-pressed/文案/数值（≤200ms）

// createUI 增量（签名向后兼容）
createUI(options?: {
  ...既有选项不变
  sfxEngine?: SfxEngine        // 测试注入；缺省 createSfxEngine() 内部自建
})
```

- `createUI` 内部接线：
  1. `const sfx = opts.sfxEngine || TetrisAudio.createSfxEngine()`；
  2. `createGame({ ..., onSfx: (n) => sfx.play(n) })`；
  3. 一次性解锁：`window.addEventListener('pointerdown', unlockOnce)` + `window.addEventListener('keydown', unlockOnce)`（首次交互即解锁，AC-09.6；`unlockOnce` 内部 `sfx.unlock()` 后自解绑）；
  4. 音量控件绑定（`createAudioPanel`）：静音按钮 `click → sfx.setMuted(!sfx.isMuted())`、−/+ 按钮 `click → sfx.setVolume(sfx.getVolume() ± 0.1)`；点击后 `blur()` 回游戏容器（沿用 E9 防空格误触）；
  5. M 键：`window.addEventListener('keydown', (e) => { if (e.key==='m'||e.key==='M') { sfx.setMuted(!sfx.isMuted()); } })`——**独立于 game.js 键盘**，任意游戏态（READY/PLAYING/PAUSED/OVER）均生效（AC-10.2）；game.js 的 keydown 不拦截 'm'，无冲突；
  6. `dispose()` 追加：解绑 unlock/M 监听、`audioPanel.dispose()`、`sfx.dispose()`。
- **M 键归属说明**：静音是"设置"而非"游戏态"，故不放 `game.js` 状态机；`ui.js` 独立监听，phase 无关（AC-10.2）。

### 3.4 `index.html` 增量（DOM 契约）

脚本顺序（装配审计依赖此序）：

```html
<script src="./audio.js"></script>   <!-- 新增：音效引擎（无依赖） -->
<script src="./game.js"></script>    <!-- 既有 -->
<script src="./ui.js"></script>      <!-- 既有 -->
<script> window.TetrisUI.createUI() </script>  <!-- 既有装配根 -->
```

左信息面板 `#panel-left` 末尾（`.next-well` 之后）新增音量控件区：

```html
<div id="audio-controls" class="audio-controls" role="group" aria-label="音量控制">
  <span class="stat__label">音量</span>
  <div class="audio-controls__row">
    <button type="button" id="btn-mute" class="btn btn--secondary btn--audio"
            aria-pressed="false" aria-label="静音">🔊 静音</button>
    <button type="button" id="btn-vol-down" class="btn btn--secondary btn--audio"
            aria-label="降低音量 10%">−</button>
    <output id="vol-value" class="audio-controls__value" aria-live="polite">80%</output>
    <button type="button" id="btn-vol-up" class="btn btn--secondary btn--audio"
            aria-label="提高音量 10%">+</button>
  </div>
</div>
```

- 按钮文案/字形（静音 ⇄ 已静音：`🔊 静音` ⇄ `🔇 已静音`）为**形态变化**（非仅颜色，AC-10.6），配合 `aria-pressed` + `aria-label` 双信号；如系统字形渲染差异，可退化为纯文本"静音/已静音"（仍满足 AC-10.6）。
- 遮罩打开时左面板不受 `inert` 圈禁（圈禁仅作用于 `#board-frame` 兄弟节点）→ READY/PAUSED/OVER 态音量控件均可用（PRD §4）。

### 3.5 `style.css` 增量（复用 DESIGN token，AC-10.1 不引入新视觉风格）

- `.audio-controls`：沿用 `.panel` 内纵向块（`display:flex; flex-direction:column; gap:var(--sp-3)`；label 复用 `.stat__label`）。
- `.audio-controls__row`：`display:flex; align-items:center; gap:var(--sp-2)`；`#btn-mute { flex:1 }`、`#btn-vol-down/#btn-vol-up { flex:0 0 40px }`、`#vol-value { flex:1; text-align:center; font-family:var(--font-mono); font-variant-numeric:tabular-nums; color:var(--ink) }`——**240px 面板内不溢出**（控件区总宽约束 ≤ 面板内容宽 200px，AC-07.4/AC-10.1 回归）。
- 按钮复用 `.btn--secondary` 全套（含 `:focus-visible` 琥珀金外环，AC-10.6 可聚焦）；静音态加 `.is-muted` 类（弱化辉光 + 文案变化，非颜色单信号）。
- 不动效、不进 `prefers-reduced-motion` 降级清单（无动画）。

---

## 4. 前端组件与页面划分（要求 2）

单页应用、无路由。v2.0 只新增一个组件 + 一个纯逻辑模块：

| 组件 | 实现 | 更新时机 | 对应 AC |
|---|---|---|---|
| 音效引擎（非视觉） | `audio.js` `createSfxEngine` | 每次 `play()`；音量/静音 setter | AC-09 全组、AC-10.3/4 |
| 音量控件区 | `index.html` `#audio-controls` + `ui.js` `createAudioPanel` + `style.css` `.audio-controls` | M 键/按钮点击后 `sync()`（同步，≤200ms） | AC-10.1/2/4/6 |
| 左信息面板（既有） | `#panel-left` | 不变 | — |
| 游戏板/遮罩/toast（既有） | 不变 | 不变 | AC-01~08 回归 |

布局：控件区置于左面板**底部**（`#panel-left` 为 flex 纵向流，追加块不破坏既有顺序）；1366×768 / 1920×1080 下左面板总高仍 < 592px 板高，无错位（AC-07.4 回归）。

---

## 5. 状态管理（要求 2）

### 5.1 状态所有权

| 状态 | 归属 | 谁可写 |
|---|---|---|
| 游戏态/棋盘/分数/等级/行数 | `game.js` 会话（既有） | 既有方法（不变） |
| 音量/静音 | `audio.js` SfxEngine 闭包 | 仅 `setVolume / setMuted`（控件与 M 键都经 setter） |
| 活动 voice 计数 | SfxEngine 闭包 | 仅 `play / onended / dispose` 内部 |
| 按钮 DOM 呈现 | `createAudioPanel` 闭包 | 仅 `sync()`（setter 后由装配调用） |

- **单一写入口**：任何路径改音量/静音都必须走 SfxEngine setter，`createAudioPanel.sync()` 是唯一 DOM 镜像点 → 双入口（M 键/按钮）状态天然一致（AC-10.2）。
- 游戏状态与音频设置**互不读写**：`restart()` 不清音频设置（AC-10.5），静音不冻结游戏（音效 no-op，玩法照常，AC-09.7）。

### 5.2 会话保持与刷新重置的机制

- SfxEngine 创建于 `createUI`（每页面加载一次）→ `restart()` 只重建 game 会话，**不触碰 SfxEngine** → 设置跨"结束→重开"保持；刷新页面 = 重建 createUI = 恢复默认（80%、未静音）（AC-10.5）。
- 不引入 localStorage（P2）。

### 5.3 静音语义（AC-10.3）

- `setMuted(true)`：`muted=true` + `masterGain.gain.value = 0`（双保险）→ 此后 `play()` 短路返回，0 可闻输出；
- `setMuted(false)`：恢复 `masterGain.gain.value = volume`，**无需重新 unlock/resume**（AudioContext 保持激活）→ 立即恢复发声；
- 音量 0% 与静音态听觉等效（均为增益 0），但标志不同（可编程区分）。

---

## 6. 关键实现要点与边界情况（要求 2）

### 6.1 AudioContext 懒创建与自动播放解锁（AC-09.6）

- 页面加载**不创建** AudioContext（0 报错、0 发声）；首次用户交互（任意 `keydown`/`pointerdown`，`once` 语义）→ `unlock()`：创建 `AudioContext`（含 `webkitAudioContext` 兜底）并 `resume()`（若 `state==='suspended'`，`resume().catch(()=>{})` 吞错）。
- unlock 前 `play()` 静默 no-op；解锁失败（权限/能力缺失）→ `isAvailable()===false`，此后永久无声、0 报错（AC-09.7）。

### 6.2 音量/静音/削波（AC-10.3/4）

- 音量范围 clamp `[0,1]`，步进 `0.1`（`−/+` 按钮），默认 `0.8`；`setVolume` 即时生效（下一次 play 读新值）。
- 防削波：voice 峰值 0.22 × 并发 4 = 0.88 ≤ 1.0（§2.2）；包络用 `setValueAtTime + exponentialRampToValueAtTime`（避免咔哒爆音）。

### 6.3 并发上限与节点清理（AC-09.8）

- `activeVoices` 计数：`play()` 时 ≥ 4 → **丢弃**新请求（不排队、不叠加）；voice 完成（`osc.onended`）→ 计数递减 + `gain.disconnect()` + `osc.disconnect()`。
- `dispose()`：遍历活动 voice 统一 `stop()`/`disconnect()`，`masterGain.disconnect()`，`ctx.close()`（Promise，`.catch(()=>{})`）——支撑 AC-05.4 无残留与 60s 高频操作无泄漏。

### 6.4 边界情况清单（v2.0 新增 E-SFX-01 ~ 12；既有 E1~E15 不变）

| # | 边界情况 | 处理策略 |
|---|---|---|
| E-SFX-01 | 被边界/障碍拒绝的移动/旋转 | 不发射音效（`blocked` 分支无 `onSfx`，AC-09.3） |
| E-SFX-02 | 软降触底立即锁定（下移被拒） | 不发射 `softDrop`（操作未成功）；lockFlow 内的 `clear/levelUp/gameOver` 正常发射 |
| E-SFX-03 | 一次消 2/3/4 行 | `clear` 恰好 1 次（`cleared>0` 分支单点发射，AC-09.2） |
| E-SFX-04 | 硬降同时消行/升级/结束 | 顺序发射 `hardDrop → clear → levelUp → gameOver`（同栈，≤4 并发内） |
| E-SFX-05 | 升级与 GAME_OVER 同帧（lockFlow 末尾出生碰撞） | `levelUp` 与 `gameOver` 都发射（先升级后结束），与 toast/遮罩回调同点（AC-09.4） |
| E-SFX-06 | `lose()` 强制结束 | 发射 `gameOver` 恰好 1 次 |
| E-SFX-07 | 60s 高频连续移动/软降（DAS 100ms/软降 50ms） | 并发上限 4 + 每次 40ms 级短音 + onended 清理 → 无堆叠/无泄漏（AC-09.8） |
| E-SFX-08 | 静音开启时高频操作 | `play()` 短路，零调度成本，FPS 不受影响 |
| E-SFX-09 | 浏览器不支持/未激活 Web Audio（含 jsdom 测试环境） | `isAvailable()===false`，全部 no-op、0 报错，玩法/计分/键盘 100% 正常（AC-09.7） |
| E-SFX-10 | 音量 0% 与静音 | 听觉等效（增益 0）；标志区分（muted 短路 vs 正常调度） |
| E-SFX-11 | 页面刷新 / 多次 createUI-dispose 循环 | 每次 createUI 新建 SfxEngine（默认值）；dispose 幂等，无全局残留（AC-05.4 语义扩展） |
| E-SFX-12 | 按钮聚焦吞空格/回车（音量按钮） | 点击后 `blur()` 回游戏容器（沿用 E9）；M 键不走按钮激活路径，无二次触发 |
| E-SFX-13 | 遮罩打开时（READY/PAUSED/OVER）操作音量控件 | 左面板不受 inert 圈禁，控件可用；按钮点击后焦点归还游戏容器，不破坏遮罩焦点管理 |

---

## 7. 测试策略（要求 2）

### 7.1 `scripts/verify-game.cjs` 增量（事件序列断言，onSfx 捕获）

在既有 `freshGame` 辅助中加 `onSfx: (n) => events.sfx.push(n)`，新增用例：

| 用例 | 断言 |
|---|---|
| move 成功 → `['move']`；左墙阻挡 → `[]`（AC-09.3） | 序列精确匹配 |
| rotate 成功 → `['rotate']`；旋转越界 → `[]` | 同上 |
| softDrop 成功 → `['softDrop']`；触底立即锁 → 无 `softDrop`（有 `clear` 时仅 clear） | E-SFX-02 |
| hardDrop 落底 → `['hardDrop']` | 每次恰好 1 次 |
| 一次消 4 行 → `['clear']` 恰好 1 次（AC-09.2） | 长度 == 1 |
| 升级 → `['levelUp']` 恰好 1 次，且与 `events.levelUp`（回调）同栈 | 同步 |
| 出生碰撞自然结束 / `lose()` → `['gameOver']` 恰好 1 次 | 同步于 onGameOver |
| hardDrop 同时消行+升级 → 顺序 `['hardDrop','clear','levelUp']` | E-SFX-04 |
| 被拒动作不改变 sfx 序列 | AC-09.3 |

### 7.2 新增 `scripts/verify-audio.cjs`（node:test，零依赖，无需真实 AudioContext）

1. **SFX_DEFS 结构**：7 键齐全（与 `game.js` 导出的 `SFX_EVENTS` 集合一致）；每项含 `waveform/freq/duration/attack/decay/peak`。
2. **可区分性（AC-09.1 自动化）**：基频排序后相邻差值全部 ≥ 50Hz；且波形集合 ≥ 3 种、包络（时长）两两有差异。
3. **假 AudioContext 行为**（`opts.createContext` 注入带计数的假 ctx）：默认 volume=0.8、muted=false；`setVolume` clamp；`setMuted(true)` → `masterGain.gain.value===0`（AC-10.3 可编程验证）；关闭恢复。
4. **并发上限**：连续 `play` 5 次 → 活动 voice ≤ 4，第 5 次被丢弃（AC-09.8）。
5. **unlock 语义**：unlock 前不创建 ctx、play 无副作用；unlock 后创建并 resume。
6. **降级**：`createContext` 抛错/未定义 → `isAvailable()===false`，play/setVolume/setMuted 全部 0 报错（AC-09.7）。
7. **dispose**：活动 voice 全部 stop、ctx.close 被调用、幂等。

### 7.3 `scripts/verify-ui.cjs` / `assembly-check.cjs` 增量

- `verify-ui.cjs`：断言 `ui.js` 新增导出 `createAudioPanel`；`audio.js` require 零 DOM/Audio 副作用。
- `assembly-check.cjs`：
  - 新增选择器清单：`#audio-controls`、`#btn-mute`、`#btn-vol-down`、`#btn-vol-up`、`#vol-value`（html 中存在）；
  - `audio.js` 脚本标签存在且顺序 `audio → game → ui → createUI`；
  - `TetrisAudio.createSfxEngine` / `TetrisAudio.SFX_DEFS` 导出存在；
  - **音频文件审计（AC-09.5）**：扫描产品根目录，0 个 `.mp3/.wav/.ogg/.m4a`；`index.html` 无 `<audio`/`<source` 标签；全文 0 个 `http(s)://`（AC-08.1 复验）。

### 7.4 `scripts/qa-e2e-jsdom.cjs` 增量（jsdom 无 AudioContext → 走 AC-09.7 降级路径，天然验证无声不报错）

| 用例 | 断言 |
|---|---|
| 初始控件状态 | `#btn-mute[aria-pressed="false"]`、`#vol-value` 文本 `80%` |
| M 键全态切换 | READY/PLAYING/PAUSED/OVER 四态各按 `m` → `aria-pressed` 翻转、文案/图标切换（≤200ms 同步） |
| 按钮调节 | 点 `+` → 90%；点 `−` → 80%；边界 clamp 0% / 100% |
| 会话保持 | PLAYING 设 60%/静音 → GAME_OVER → `R` 重开 → 仍 60%/静音（AC-10.5） |
| onSfx 接线 | `createUI({ sfxEngine: fakeEngine })`（记录 play 调用）：移动键触发 `play('move')`、左墙阻挡不触发；硬降触发 `play('hardDrop')`（AC-09.3 端到端） |
| 降级零报错 | 无注入引擎（真实 audio.js）时完整游玩一轮，0 jsdomError/全局 error（AC-09.6/7） |
| 自包含 | DOM 中无 `<audio>/<source>`；Network 无音频请求（结构级） |

### 7.5 人工补测清单（真实浏览器，`file://` 双击 `index.html`，DevTools）

1. **AC-09.1 听辨**：七类音效两两可区分；**AC-09.4**：Performance 采样事件→发声 ≤ 50ms；消行/升级/结束音效与视觉同步（≤200/300ms）。
2. **AC-10.3/4**：静音后 0 可闻输出、关闭立即恢复；任意音量（含 0%/100%）无爆音/削波（音频轨峰值 ≤ 1.0）。
3. **AC-09.8**：60s 高频操作后 Console 0 报错、无内存增长（Memory 面板快照对比）、FPS ≥ 55。
4. **AC-09.6**：刷新后先按任意键/点击，音效开始正常；之前无报错。
5. **AC-10.1/07.4**：音量控件在 1920×1080 / 1366×768 无错位、无遮挡。
6. **§1.3 全量复测**：首屏 ≤500ms、Network 0 请求（含 0 音频）、断网游玩一轮。

---

## 8. 任务拆分清单（要求 3）

> **派发对齐说明**：本任务未收到流水线派发的 `options.tasks` 清单，以下给出与 **PRD §8 里程碑 M1/M2/M3** 一一对应的可并行任务清单（命名沿用产品线习惯）。流水线后续派发任务时，请按本清单逐项对齐**文件边界 / 接口契约（§3）/ 验收标准**，不要另起一套任务体系。v1.0 先例：多个细任务可合并为"引擎 / UI / 装配"三个交付任务；本版同理，T-A+T-B 合并即 M1，T-C+T-D 合并即 M2，T-E 即 M3。

### 批次 1（对应 M1 音效引擎，可并行）

## 任务：T-A game.js 音效事件出口

- **涉及文件**：`game.js`（新增 `SFX_EVENTS` 常量导出 + `onSfx` 选项 + §3.2 发射点表 7 处）、`scripts/verify-game.cjs`（§7.1 用例）
- **实现要点**：只发事件名、不碰音频 API；发射点严格按 §3.2 定位表；被拒/非法态不发射；与 `onLevelUp/onGameOver` 同栈。
- **验收标准**：§7.1 全部用例绿；既有 33 项全绿（onSfx 缺省不影响）；`node --check game.js` 通过。
- **并行关系**：不依赖 T-B 实现（只依赖 §2.1 事件名契约），可与 T-B 并行。

## 任务：T-B audio.js 合成引擎

- **涉及文件**：`audio.js`（新文件：`SFX_DEFS`/常量/`createSfxEngine`，§3.1）、`scripts/verify-audio.cjs`（新文件，§7.2）
- **实现要点**：§2.2 参数表逐字段落盘；懒创建+unlock；主增益链路；静音双保险；并发上限 4；dispose 全清理；`createContext` 注入供测试；UMD 双导出。
- **验收标准**：`verify-audio.cjs` 全部通过（含基频差值 ≥50Hz、假 ctx 行为、并发丢弃、降级 0 报错）；`require('../audio.js')` 零 DOM/Audio 副作用。
- **并行关系**：依赖 T-A 的事件名契约（同名数组），实现互不阻塞。

### 批次 2（对应 M2 音量与静音 UI，可并行）

## 任务：T-C 音量/静音控件 UI 与接线

- **涉及文件**：`index.html`（`#audio-controls` 区块 + `<script src="./audio.js">`）、`ui.js`（`createAudioPanel` + `createUI` 接线：unlock/M 键/onSfx→play/焦点归还/dispose）、`style.css`（`.audio-controls` 系列）
- **实现要点**：§3.3/§3.4/§3.5；复用 `.btn--secondary`/`.stat__label` token；`aria-pressed` + 文案形态变化（AC-10.6）；240px 面板不溢出（AC-10.1）；M 键独立于 game.js 键盘、全态生效。
- **验收标准**：双击 `index.html`（真实浏览器或 jsdom）：M 键四态切换、按钮 −/+/静音生效且 ≤200ms 同步、点击后焦点归还；AC-10.2/4/6 自动化断言绿。
- **并行关系**：依赖 T-A/T-B 契约（`SFX_EVENTS`、SfxEngine API）；与 T-D 可并行（T-D 只依赖 DOM/脚本序契约）。

## 任务：T-D 装配与自包含审计更新

- **涉及文件**：`index.html`（脚本顺序，若 T-C 未动则由本任务落定）、`scripts/assembly-check.cjs`（§7.3：选择器/顺序/导出/音频文件审计）、`scripts/verify-ui.cjs`（`createAudioPanel` 导出断言）
- **实现要点**：把 AC-09.5（0 音频文件、无 audio/source 元素）做成**强制门禁**；AC-08.1 复验不变。
- **验收标准**：`assembly-check.cjs` ALL PASSED（含新审计项）；`verify-ui.cjs` 全绿。
- **并行关系**：与 T-C 并行；与 T-A/T-B 契约对齐。

### 批次 3（对应 M3 回归与验收）

## 任务：T-E 回归与验收（AC-09/10 端到端 + 全量回归）

- **涉及文件**：`scripts/qa-e2e-jsdom.cjs`（§7.4 增量用例）、`README.md`（验收速览补 AC-09/10、操作说明补 `M` 键、已知取舍移除"音效"改为"BGM/本地持久化"）、`AGENTS.md`（§5/§6 由产品经理在验收后同步）
- **实现要点**：jsdom 端到端（注入 fake engine 验证 onSfx 接线 + 真实 audio.js 验证降级零报错）；AC-01~08 全量回归（回归底线）。
- **验收标准**：四套脚本全绿（33+sfx 增量 / 5 / ALL / 108+增量）；AC-01~10 全部通过、无 P0/P1 遗留；§7.5 人工补测清单交付 QA。
- **并行关系**：依赖 T-A~T-D 全部完成。

---

## 9. 里程碑映射（对应 PRD §8）

| 里程碑 | 周期 | 对应任务 | 出口标准 |
|---|---|---|---|
| M1 音效引擎 | D1 | T-A + T-B | AC-09 全部通过（事件序列 + 参数表可测 + 并发上限 + 降级） |
| M2 音量与静音 UI | D2 | T-C + T-D | AC-10 全部通过（M 键/按钮双入口、会话保持、a11y、布局回归） |
| M3 回归与验收 | D3 | T-E | AC-01~08 全量回归绿 + AC-09/10 端到端绿 + §1.3 复测 + QA 报告落盘 |

---

## 10. 风险与注意（v2.0 增量，承接 ARCHITECTURE §9）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 浏览器自动播放策略阻止 AudioContext | 无声/报错 | 首次交互懒创建 + resume（catch 吞错）；失败无声降级、0 报错（AC-09.6/7） |
| 高频操作音效堆叠/节点泄漏 | 爆音、卡顿、内存增长 | 并发上限 4 + onended 清理 + dispose 统一清理（AC-09.8）；verify-audio 用例钉死 |
| 音效阻塞主线程 | 帧率下降、操作延迟 | 合成器每次 ≤3 个短时 osc、同步但轻量调度（≤50ms）；逻辑/渲染分离不变（§1.3 复测） |
| 事件发射位置漂移（漏发/多发/误发） | AC-09.2/3 不满足 | 发射点收口 game.js 单文件 7 处 + verify-game 序列断言钉死；新动作路径必须同步补用例 |
| 音量控件破坏既有布局 | AC-07.4 回归 | 控件并入左面板底部、复用既有 token 与栅格、宽度约束审计；assembly-check 选择器交叉核对 |
| M 键与游戏键冲突 | 静音失效/误操作 | M 键由 ui.js 独立监听，game.js 不拦截 'm'；E2E 四态断言覆盖（AC-10.2） |
| 静音/音量状态丢失（跨重开） | AC-10.5 不满足 | SfxEngine 生命周期 = createUI（非 game），restart 不触碰；E2E 断言会话保持 |
