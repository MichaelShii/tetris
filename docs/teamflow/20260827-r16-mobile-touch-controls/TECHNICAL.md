<!-- meta: summary="r16 移动端触屏控制技术方案：触屏为 ui.js 新增输入通道——createTouchControls 将触摸 down/up 合成为键盘事件复走 game.js 既有 DAS/软降 repeat 时钟与 keyAction 语义（引擎零改动），html.has-touch 纯 CSS 显隐；落地 index.html/style.css/ui.js + verify-ui/qa-e2e 两脚本，七套全绿出口" -->

基线依赖：docs/teamflow/20260827-r15-multi-grid-preview-queue（Hold/预览队列/持久化/7-bag 行为零回归）；无取代——纯新增输入通道。

---

# TECHNICAL — 移动端触屏控制（r16）

## 0. 架构判断（一句话）

**触屏不是第二套输入逻辑，而是"键盘事件的回放器"**：ui.js 新增 `createTouchControls` 把触摸 down/up 合成为与实体键完全相同的键盘事件（`key` 码一致、`bubbles:true`），复走 `game.js` 既有键盘层（`held` Map + `startKeyRepeat/updateHeld` + `keyAction` 分发表）——同一套 DAS/软降 repeat 时钟、同一套 phase 守卫、同一套音效，触屏路径**零新常量、零引擎改动**（PRD §8 红线）；显隐/布局/图例由 `html.has-touch` 类 + 纯 CSS 承担，键鼠桌面零视觉变化。

## 1. 数据模型与存储

| 项 | 结论 |
|---|---|
| 持久化 | **零改动**（`persist.js` 不动）。触屏显隐是设备能力推导，非用户设置（AC-1：「显隐切换不改变游戏状态」）；AC 清单无触屏开关项，不新增 `previewQueueEnabled` 式布尔键 |
| 引擎状态 | **零改动**（`game.js` 不动）。状态机/快照/计分/随机/队列/Hold 全部原样 |
| 控制器私有态 | ui.js 闭包内：`activeKeys: Set<action>`（当前按压键集合，多指互不串扰，AC-9）+ `entries: Map<button, TOUCH_KEYS 条目>`（每键绑定表）。不落 DOM 状态、不落存储 |
| 展示态 | `documentElement.classList` 的 `has-touch` 类（createUI 独占管理 add/remove）。纯展示，与对局、设置、持久化完全解耦 |

**单一事实来源**：触屏键映射表 `TOUCH_KEYS`（ui.js 顶部常量，Node 可单测），index.html `data-action` 与之一一对应；长按速率常量**禁止**在 ui.js 新增——合成事件天然复用 `game.js` 导出的 `DAS_DELAY_MS/DAS_REPEAT_MS/SOFT_DROP_REPEAT_MS`。

## 2. API 契约（模块接口）

### 2.1 ui.js 新增导出（node 可 require 单测；签名对齐既有工厂惯例）

```js
// 键映射单一来源表（6 键 = PRD §2 US-2 六键；key = 合成键盘事件的 key 码）
const TOUCH_KEYS = [
  { action: 'moveLeft',  key: 'ArrowLeft',  holdable: true,  label: '左移'  },
  { action: 'moveRight', key: 'ArrowRight', holdable: true,  label: '右移'  },
  { action: 'rotate',    key: 'ArrowUp',    holdable: false, label: '旋转'  },
  { action: 'softDrop',  key: 'ArrowDown',  holdable: true,  label: '软降'  },
  { action: 'hardDrop',  key: ' ',          holdable: false, label: '硬降'  },
  { action: 'hold',      key: 'c',          holdable: false, label: 'Hold 暂存' },
]
// 导出：TetrisUI.TOUCH_KEYS（只读副本）

// 触屏能力检测（Node 下恒 false）
function isTouchDevice() // → boolean

// 触屏输入控制器工厂（签名风格同 createHud/createAudioPanel）
// els: { pad: #touch-controls 元素 }；内部按 .tkey[data-action] 匹配 TOUCH_KEYS
// opts: { root? 合成事件派发目标（默认 document）}
// → { dispose() }  —— 每键 touch/keydown/click 监听具名对称解绑 + activeKeys 清空
function createTouchControls(els, game, opts)
```

### 2.2 createUI 扩展（选项 + 装配接线，向后兼容）

```js
createUI({ ..., touch?: boolean })   // undefined=自动检测（isTouchDevice）；true/false=强制（测试注入）
```

- 装配期：`touchPadEl = root.querySelector('#touch-controls')`（**可选**——缺失不抛错、不建控制器，既有宿主零影响）；
- `touchDevice = opts.touch !== undefined ? !!opts.touch : isTouchDevice()`；为真且 `document.documentElement` 存在 → `classList.add('has-touch')`，并记录归属（`touchClassOwned = true`）；
- `game` 创建后：`touchPadEl` 存在 → `touchControls = createTouchControls({ pad: touchPadEl }, game, { root: root })`；
- `dispose()` 对称：`touchControls.dispose()` + `touchClassOwned` 时移除 `has-touch`（**类归属管理**：谁加谁删，多实例/测试隔离不互踩）。

### 2.3 game.js / audio.js / persist.js / 其余脚本——**零改动**（约束清单）

`game.js`、`audio.js`、`persist.js`、`scripts/verify-game.cjs`、`verify-audio.cjs`、`verify-persist.cjs`、`verify-constants.cjs`、`assembly-check.cjs` 一律不动；`VERSION` 不升（沿用 2.3.0）。

## 3. 前端组件与页面拆分

### 3.1 index.html（r16 新增块，`</main>` 之后、设置弹层之前）

```html
<div id="touch-controls" class="touchpad" aria-label="触屏操控区">
  <button type="button" class="tkey" data-action="moveLeft"  aria-label="左移"><span class="tkey__icon">◀</span><span class="tkey__label">左</span></button>
  <button type="button" class="tkey" data-action="moveRight" aria-label="右移"><span class="tkey__icon">▶</span><span class="tkey__label">右</span></button>
  <button type="button" class="tkey" data-action="rotate"    aria-label="旋转"><span class="tkey__icon">⟳</span><span class="tkey__label">旋转</span></button>
  <button type="button" class="tkey" data-action="softDrop"  aria-label="软降"><span class="tkey__icon">▼</span><span class="tkey__label">软降</span></button>
  <button type="button" class="tkey" data-action="hardDrop"  aria-label="硬降"><span class="tkey__icon">⤓</span><span class="tkey__label">硬降</span></button>
  <button type="button" class="tkey" data-action="hold"      aria-label="Hold 暂存"><span class="tkey__icon">📦</span><span class="tkey__label">Hold</span></button>
</div>
```

- 真实 `<button>`（可聚焦、`focus-visible` 环内建、Enter/Space 可激活，AC-10）；瞬时键**不加** `aria-pressed`（DESIGN §5）。
- `data-action` 与 `TOUCH_KEYS.action` 六值一一对应（verify-ui/E2E 交叉断言防漂移）。

### 3.2 style.css（r16：仅 2 个新 token + 系列规则）

| 规则 | 要点 |
|---|---|
| `:root` | 新增 `--z-touchpad: 5`（面板 2 之上、遮罩 10 之下）、`--tpad-key: 3rem`（48px ≥ 44 目标，AC-12） |
| `.touchpad` 基类 | `position: fixed; z-index: var(--z-touchpad); display: none;` + `touch-action: none;` + `-webkit-tap-highlight-color: transparent; user-select: none;`（AC-8 支撑）+ 玻璃容器（`--glass-bg` + `backdrop-filter` 同 `.panel`）+ `padding-bottom: calc(… + env(safe-area-inset-bottom))` |
| `.has-touch .touchpad` | `display: flex` 显隐；**竖屏（默认/`orientation: portrait`）底栏排布**：单行 3+3（组间 gap 16、键间 gap `--sp-2`）；**`orientation: landscape` 切换侧轨排布**：左右固定 72px（键 48 + padding 12）双竖列（左 `[左/右/旋转]`、右 `[软降/硬降/Hold]`），中列容纳板框零遮挡。两者为同一 DOM 的两套媒体查询分支（DESIGN §2.1/2.2 的 `--bar/--rails` 语义），不改既有 1100px/480px 断点 |
| `.tkey` | 48×48（`width/height: var(--tpad-key); min-width/height` 同值兜底 ≥44px）；`--surface-2` 底、`--line` 描边、`--radius-md`、标签 `--ink`；`.tkey::before` 走 `--glow-primary` 辉光（opacity 切换，**不动画 box-shadow**，DESIGN §4.3 对齐） |
| `.tkey:active` | 描边→`--primary`、标签→`--accent-hi`、`::before` opacity→1、`scale(0.96)`（多信号，reduced-motion 下色/描边仍表达） |
| hover 隔离 | `:hover` 仅 `@media (hover:hover)` 内生效（防触屏粘滞） |
| 图例 | `html.has-touch .key-hints { display: none; }`（AC-13） |
| narrow 兜底 | `@media (max-width: 379px)`：底栏 padding/gap 收窄保证 320px 视口单行不溢出且键 ≥44px（见 §5 算术） |

### 3.3 ui.js `createTouchControls` 内部构造（核心实现）

```js
// 每键四类输入源 → 同一"发声点"：
//   touchstart → preventDefault + RUNNING 守卫 + activeKeys.set + 派发合成 keydown
//   touchend/touchcancel → preventDefault + activeKeys.delete + 派发合成 keyup
//   keydown(Enter/Space 于聚焦键) → preventDefault+stopPropagation + tap()
//   click（鼠标/笔，混合设备）   → tap()
// tap() = RUNNING 守卫 + keydown + keyup（短按单步；holdable 键不注册 held → 恰好 1 格）
// 合成事件：root.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }))
//   —— 与 qa-e2e 既有 key()/keyUp() 辅助器同构，行为逐字节等于真实按键
```

**为何合成事件而不直调 `game.move()/rotate()/…`**：直调会绕过 `held` 重复时钟与 `keyAction` phase 语义——长按必须另造一套 repeat 计时（PRD §8 红线）；合成事件则 100% 复用键盘层（含 PAUSED/OVER 下按键无动作的表驱动行为），"逐键等效"由构造保证而非口头承诺。

## 4. 状态管理

- 引擎状态机/权限守卫**原样**：`move/rotate/softDrop/hardDrop/hold` 均含 `phase!=='RUNNING → {ok:false}` 与 `clearing` 动画期拒绝；触屏控制器在派发前再加一层 ui.js 处理层守卫 `game.getPhase() !== 'RUNNING' → return`（AC-2：PAUSED/OVER 下点击仅 preventDefault 防误触，**不派发任何输入**——避免 `' '` 在 PAUSED 映射 `togglePause` 的语义偏差，保持"触屏键=游戏输入、暂停恢复仍由现有按钮/P 键负责"）。
- 长按：合成 keydown 注册进 `game.js held` Map → `updateHeld` rAF 按 `DAS_DELAY_MS`（170ms）/`DAS_REPEAT_MS`（100ms）/`SOFT_DROP_REPEAT_MS`（50ms）驱动；键值已存在（实体键同键按住中）→ `held.has` 去重，天然不双发（AC-10 并存护栏）。

## 5. 关键实现点与边界用例

1. **防默认行为（AC-8）**：`.touchpad` 容器级 `touchstart/touchmove` 与 `#board` 画布级 `touchstart/touchmove` 均 `preventDefault`（显式 `{ passive: false }`），+ CSS `touch-action: none`；画布 preventDefault 只挂在 canvas 上（无交互子节点），**不**挂 `#board-frame` 容器（避免误伤遮罩/按钮点击）。断言 `e.defaultPrevented === true`。
2. **多指互不串扰（AC-9）**：`activeKeys` 按 action 独立记录；每指 touchstart 只设自己的键，touchend 只释放自己的键（touch 事件规范：touchend/touchcancel 以 touchstart 目标为 target，滑出键帽仍回到原键）。快连点：同键 touchstart 重复（activeKeys 已含）→ 忽略，touchend 释放后再次 touchstart 才生效——无抖动式重复。
3. **合成 click 抑制（AC-9 连点不双发）**：touchstart/touchend 均 `preventDefault` → 浏览器不合成后续 mouse/click → 单击只产生一次输入（click 处理器仅服务鼠标/笔与键盘激活，不服务触屏）。
4. **键盘激活防双发（AC-10 细化）**：聚焦 `.tkey` 按 Enter/Space → 键级 `keydown` 监听 `preventDefault()`（取消默认按钮激活，不产生 click）+ `stopPropagation()`（阻断冒泡到 window，防 game.js 键盘层二次吸收同一按键）→ 就地 `tap()` 一次。**不得**仅靠 click 实现键盘激活（Space 会同时触发 game.js 硬降 → 双发）。
5. **PAUSED / GAME_OVER（AC-2）**：处理层守卫在派发前拦截；preventDefault 仍执行（防误触滚动），无输入、无报错、无副作用、无音效——与表驱动键盘语义一致。
6. **长按跨态**：按住中游戏被暂停（如 P 键/失焦自动暂停）→ 引擎 `move()` 自身 phase 守卫吞掉后续重复；touchend 派发 keyup 清 `held`。window blur 清 `held`（onKeyBlur）后 keyup 为无害 no-op。
7. **同键双通道**：实体键与触屏键同时按同一方向 → `held.has` 去重不双发；任一方松开 keyup 即停（另一通道是否保留由 held 条目存在性决定，接受此边界）。
8. **检测边界**：`isTouchDevice()` = `'ontouchstart' in window || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches`；Node（window 未定义）恒 false；jsdom（三项皆无）恒 false → 既有 E2E 默认路径零变化，`opts.touch:true` 强制注入测试。
9. **元素可选与类归属**：`#touch-controls` 缺失 → 控制器不建、类不强制；`has-touch` 由 createUI 独占 add/remove（记录归属），多实例 dispose 隔离。
10. **dispose 对称**：六键每键四类监听（touchstart/touchend/touchcancel/keydown/click）具名绑定 → 具名解绑；activeKeys 清空。
11. **合成事件细节**：`KeyboardEvent` 构造 `key` 字段携带即可（`code` 不依赖，keyAction 以 `e.key.toLowerCase()` 匹配）；`e.repeat` 恒 false（重复由 held 时钟管理）；`'c'`（Hold）在 game.js keyAction 无映射 → 由 ui.js 既有 `onHoldKey` window 监听消费（`e.repeat` 守卫已内建），触屏键与 C/Shift 走同一路径。
12. **布局算术（AC-12 关键钉）**：竖屏键行 = 6×48 + 5×8（键间）+ 16（组间）= **344px**（DESIGN §2.1 印刷值 369 为笔误，结论不变）→ 375 视口两侧 padding 12~16 均可容纳；`@media (max-width: 379px)` 窄屏分支收窄 padding/gap（320px 视口：padding 4、组间 8 → 键行 344 不适用 → 键降为 44px：6×44+5×8+8+2×4=320 恰好，仍 ≥44）。遮挡：竖屏 bar ≤92px → 板框画布可视 ≥ 95%（DESIGN 计算 ≥99.8%）；横屏中列 812−144=668 ≥ 板框 592，零遮挡。

## 6. 测试策略

### 6.1 `scripts/verify-ui.cjs`（r16 追加，零 DOM 断言）

- 导出齐全：`TOUCH_KEYS`（数组长 6）、`isTouchDevice`、`createTouchControls` 为 function；
- **TOUCH_KEYS ↔ game.js keyAction 交叉校验**（防映射漂移的工程护栏）：对每条 `TOUCH_KEYS`，`G.keyAction('RUNNING', key)` 应等于语义动作（moveLeft/moveRight/softDrop/rotate/hardDrop；`'c'` → null 为 Hold 特例，由 ui.js `onHoldKey` 消费）；`holdable:false` 键（rotate/hard/hold）断言 `keyAction` 非 held 类动作；
- Node 加载零 DOM 副作用：`isTouchDevice() === false`、require 后 `globalThis.window/document` 未定义；
- 工厂契约：`createTouchControls({ pad: null }, …)` 抛错（`缺少 #touch-controls` 语义检查）。

### 6.2 `scripts/qa-e2e-jsdom.cjs`（新增 r16 段，置于 r15 段之后、file:// 自动装配段之前）

沿用真实 index.html + UMD 注入 + 固定 rng + `autoLoop:false` + animMs:0 确定性管线；独立 createUI 实例（主 env handle 已在前段 dispose，同 r14/r15 模式）。新增辅助器：

```js
const touch = function (el, type) {
  const ev = new window.Event(type, { bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}
```

| AC | E2E 断言要点 |
|---|---|
| AC-1 | 默认（`touch` 缺省）实例：`documentElement` 无 `has-touch`；`createUI({touch:true})` → 类加入、dispose → 类移除（类归属）；两种切换前后 snap 不变（不重置对局） |
| AC-2 | `game.togglePause()` 后 touch rotate/hard → snap 逐字段一致、spy 无新 plays、无异常；OVER 同理 |
| AC-3/4 | 短按：touch `.tkey[moveLeft]` → x−1 恰 1 格；撞墙边界与键盘一致。**长按 1s 差值 ≤1**：两个同参 fresh 实例（K=键盘、T=触屏，同一 window rAF 时钟）各自软降按住 ~1050ms，经 `onSnapshot` 记录 piece.y 增量 Δy；断言 |ΔyK − ΔyT| ≤ 1 且 Δy ≥ 6（证明重复确实走 DAS 时钟而非仅首击）；松手后无残留（再按一次仍单步） |
| AC-5 | 重置 `spy.plays` → K 键空格硬降 vs T 触屏硬降 → `spy.plays` 序列逐一相等、最终 snap 相等 |
| AC-6 | 同参双实例循环 20 次：K 派发 `ArrowUp`、T 触屏旋转交替 → 每步 snap 深等（board/piece/rot/score）+ rot 递增 |
| AC-7 | T 触屏 hold → `snap.holdPiece` 置位；再次触屏 hold → holdPiece 不变且无新 `hold` play（ok=false 无音效） |
| AC-8 | trace 每键 `touchstart` → `ev.defaultPrevented === true`；`#board` canvas touchstart/touchmove 同断言 |
| AC-9 | 左+软降两键同时 touchstart → x−1 且 y+1 同时生效；仅 touchend 左键 → 右键软降仍持续（下个软降事件存在）/至少无串扰（左键释放不产生多余输入）；**双击旋转**：两次 touchstart/touchend 对 → rot 恰 +2（无合成 click 双发） |
| AC-10 | 触屏实例存活期间键盘事件照常驱动（`key('ArrowLeft')` 生效）；`.tkey` 可聚焦（BUTTON/tabIndex≥0） |
| AC-12 | 静态证据：style.css 含 `--tpad-key: 3rem` 与 `--z-touchpad: 5`，`.tkey` 存在 width/height 声明且 48 ≥ 44（算术断言）；竖屏键行宽算术（6×48+40+16 ≤ 375）与遮挡结论（DESIGN §2.1）数值断言 |
| AC-13/14 | `.tkey` 共 6 个、aria-label 六值齐全、`data-action` ⊆ TOUCH_KEYS；style.css 含 `html.has-touch .key-hints` 规则（静态文本证据）；index.html 含 `#touch-controls`；`game.js/audio.js/persist.js` 未被本段触碰（回归基线） |

file:// 自动装配段（dom2）追加：`#touch-controls` 存在于静态 DOM；非触屏环境（jsdom）自动装配后 `has-touch` 未加、无装配错误。

**七套全绿出口**：基线 97/24/17/2/15/ALL/294；r16 段新增约 20 项 qa-e2e 断言（294 → 以实际执行为准），其余五套零改动零回归。

### 6.3 真机补测清单（QA 阶段，交 QA-REPORT）

iOS Safari / Android Chrome：竖横屏滚动位移、双击缩放、长按菜单、安全区（刘海）渲染、多指实按；触屏笔记本：`has-touch` 显示触屏键且鼠标可用、桌面浏览器（无触屏）视觉零变化；320px 窄屏键 ≥44 不溢出。

## 7. 任务拆分（并行矩阵，git 动作随 T6 强制携带）

**关键路径**：T1/T2/T3 并行（文件互斥）→ T4（依赖 T3 导出）与 T5（依赖 T1+T3）并行 → T6 串行收口。**红线**：T3 不得新增速率常量（复用 game.js 导出）、不得改 game.js/audio.js/persist.js/VERSION。

| # | 任务（按文件边界） | 文件 | 验收要点 |
|---|---|---|---|
| T1 | 触屏操控区 DOM | `index.html` | `#touch-controls.touchpad` + 6 `.tkey` button，`data-action` 六值与 TOUCH_KEYS 一致、aria-label 齐全；位于 `</main>` 与设置弹层之间；不触碰既有按钮 |
| T2 | 触屏样式 | `style.css` | 2 token（`--z-touchpad:5`/`--tpad-key:3rem`）+ `.touchpad` 基类/竖栏/（orientation:landscape）横轨/`.tkey` 三态 + `html.has-touch` 显隐 + `key-hints` 隐藏 + `hover:hover` 隔离 + narrow 兜底（键 ≥44px）；键盘桌面零视觉变化（类默认不加即 `display:none`） |
| T3 | 触屏输入通道 | `ui.js` | `TOUCH_KEYS` + `isTouchDevice` + `createTouchControls`（合成键盘事件、RUNNING 守卫、activeKeys 多指、preventDefault 全套、dispose 对称）+ createUI 接线（`opts.touch` 强制注入、`has-touch` 类归属 add/remove）；导出并存档文档注释 |
| T4 | UI 契约自检 | `scripts/verify-ui.cjs` | TOUCH_KEYS 六值与 `G.keyAction` 交叉校验、工厂缺元素抛错、`isTouchDevice()` Node 下 false、零 DOM 副作用（§6.1 全项） |
| T5 | 触屏 E2E 段 | `scripts/qa-e2e-jsdom.cjs` | §6.2 表格全项（AC-1~14 接线/静态/算术断言）+ 自动装配段补充；无新增游离脚本 |
| T6 | 集成与交付（顺序） | `README.md` + 全仓 | 七套全绿（含新增断言数）；README 操作章节补触屏六键说明（键鼠原样，AC-13 文档侧）；**git 动作（PRD §8 强制）**：于 `feat/mobile-touch-controls` 分支提交本任务夹（PRD/DESIGN/TECHNICAL + 后续 QA-REPORT/ACCEPTANCE）与功能改动（r15 惯例 f2c2b63），无游离日志（跑批日志仅入 `logs/teamflow/<runId>/`）；QA 真机补测清单交付 |

## 8. 与 DESIGN 的差异说明（设计不可变，TECH 细化订正）

1. 竖屏键行宽 344px（DESIGN §2.1 印刷 369px 为笔误）：结论（375 单行不溢出、AC-12 达标）不变。
2. 键盘激活（DESIGN §5「Enter/Space 可激活」）细化为键级 `keydown` 的 `preventDefault + stopPropagation + tap()` 三件套——防止 Space 同时被 game.js 硬降路径二次吸收（双发）。这是实现细节修订，不改变可访问性承诺。
3. 游戏区防默认行为挂 `#board` canvas（非 `#board-frame` 容器），避免误伤遮罩/按钮触摸。

<!-- blueprint -->{"summary":"触屏为 ui.js 新增输入通道：createTouchControls 将触摸合成键盘事件复走 game.js 既有 DAS/软降 repeat 时钟与 keyAction 语义（引擎零改动、零新速率常量），html.has-touch 纯 CSS 显隐与布局，键鼠桌面零视觉变化，七套全绿出口","modules":{"/index.html":{"responsibility":"触屏操控区 DOM：#touch-controls.touchpad + 6 个 .tkey button（data-action 对齐 TOUCH_KEYS 六值、aria-label、字形+文字双标签），位于 </main> 后设置弹层前","dependsOn":[],"assemblyOrder":1,"why":"静态应用 DOM 全由本文件承载，独立文件便于与 CSS/JS 并行开发；data-action 是跨层契约锚点"},"/style.css":{"responsibility":"新增 --z-touchpad:5 / --tpad-key:3rem 两 token + .touchpad 基类/竖栏/横轨(orientation:landscape)/.tkey 三态 + html.has-touch 显隐 + key-hints 隐藏 + hover:hover 隔离 + narrow 兜底","dependsOn":["/index.html"],"assemblyOrder":2,"why":"纯 CSS 显隐保证键鼠桌面零视觉变化、不重置对局（AC-1），且断点/布局归 CSS 单一职责；token 复用率 100%（仅 +2，DESIGN §4）"},"/ui.js":{"responsibility":"TOUCH_KEYS 表 + isTouchDevice + createTouchControls 工厂（合成 KeyboardEvent、RUNNING 守卫、activeKeys 多指集合、preventDefault 全套、dispose 对称）+ createUI 装配（opts.touch 注入、has-touch 类归属生命周期）","dependsOn":["/index.html","/game.js"],"assemblyOrder":3,"why":"输入通道属 UI 装配层职责；合成事件使触屏与键盘共享同一 held/repeat 时钟与 keyAction/phase 语义，杜绝双套速率常量（PRD §8 红线），引擎零改动"},"/scripts/verify-ui.cjs":{"responsibility":"TOUCH_KEYS 契约自检（6 键、key↔G.keyAction 交叉校验、'c'→hold 特例）、工厂缺元素抛错、Node 加载 isTouchDevice()=false 零 DOM 副作用","dependsOn":["/ui.js","/game.js"],"assemblyOrder":4,"why":"延续既有 contract 自检惯例（keyAction 先例）；表↔引擎语义交叉断言是防触屏映射漂移的工程护栏"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"r16 触屏 E2E 段（AC-1~14 接线/静态/算术断言，含 1s 长按差值≤1、事件序列相等、20 次旋转相等）+ file:// 自动装配段扩充","dependsOn":["/ui.js","/index.html","/style.css"],"assemblyOrder":5,"why":"沿用真实 index.html + UMD 注入 + 固定 rng/autoLoop:false 确定性管线；jsdom 无法覆盖的真机差异由 QA 补测清单兜底（PRD R1）"},"/README.md":{"responsibility":"操作章节补充触屏六键说明（键鼠说明原样保留）","dependsOn":["/index.html"],"assemblyOrder":6,"why":"产品入口文档须与新增输入通道同步，避免文档误导（AC-13 文档侧）"}},"duplications":["TOUCH_KEYS（ui.js）与 game.js keyAction 同域按键映射：TOUCH_KEYS 是'回放表'而非第二套动作表，方向为 TOUCH_KEYS.key → keyAction；verify-ui 交叉断言防漂移","长按速率常量：禁止在 ui.js 新增（PRD §8 红线）——合成事件天然复用 DAS_DELAY_MS/DAS_REPEAT_MS/SOFT_DROP_REPEAT_MS；若有人新增即时漂移，verify 脚本无新断言也不捕获","has-touch 类由 createUI 独占 add/remove（归属计数），多实例/测试隔离避免互踩；若控制器各自加类会致 E2E 类断言竞态"],"tasks":[{"title":"T1 触屏操控区 DOM（index.html）","files":["/index.html"],"spec":"body 末尾新增 #touch-controls.touchpad + 6 .tkey(button)，data-action 对齐 TOUCH_KEYS 六值、aria-label 齐全，不动既有按钮"},{"title":"T2 触屏样式（style.css）","files":["/style.css"],"spec":"2 token + .touchpad 竖栏/横轨双排布 + .tkey 三态 + html.has-touch 显隐与 key-hints 隐藏 + hover:hover 隔离 + narrow 兜底（键≥44px），键鼠桌面零视觉变化"},{"title":"T3 触屏输入通道（ui.js）","files":["/ui.js"],"spec":"TOUCH_KEYS + isTouchDevice + createTouchControls（合成 KeyboardEvent、RUNNING 守卫、activeKeys、preventDefault 全套、dispose 对称）+ createUI 接线（opts.touch、has-touch 类归属），不新增速率常量"},{"title":"T4 契约自检（verify-ui.cjs）","files":["/scripts/verify-ui.cjs"],"spec":"导出/TOUCH_KEYS 六值 + key↔G.keyAction 交叉校验 + 工厂缺元素抛错 + Node 零 DOM 副作用"},{"title":"T5 触屏 E2E 段（qa-e2e-jsdom.cjs）","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"AC-1~14 全项断言（类生命周期/守卫/逐键与 1s 长按≤1/事件序列/20 次旋转/hold 限次/defaultPrevented/多指/连点/键盘并存/静态尺寸与算术/图例/零回归）+ 自动装配段扩充"},{"title":"T6 集成与交付（顺序）","files":["/README.md"],"spec":"七套全绿 + README 触屏说明 + 按 PRD §8 于 feat/mobile-touch-controls 提交任务夹与改动 + QA 真机补测清单交付"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r16 触屏 TECHNICAL 已交付：触屏=键盘事件回放器——createTouchControls 将触摸 down/up 合成 KeyboardEvent 复走 game.js 既有 held/DAS/软降 repeat 时钟与 keyAction 语义（引擎零改动、零新速率常量），RUNNING 守卫保 AC-2，activeKeys 多指集合保 AC-9，preventDefault 全套+touch-action:none 保 AC-8；html.has-touch 纯 CSS 显隐不重置对局；落地 3 代码文件（index.html DOM 契约/style.css 2 token+系列规则/ui.js 工厂与接线）+ 2 测试脚本（verify-ui 交叉校验、qa-e2e r16 段 AC-1~14）+ README；T1~T3 并行→T4/T5 并行→T6 串行收口，git 动作随 T6（feat/mobile-touch-controls 分支、任务夹随实现提交）","memory":["r16 TECH 核心技术决策：触屏键合成键盘事件（key 码=TOUCH_KEYS 表）派发 document，复走键盘 held/repeat 时钟与 keyAction——长按速率零新常量，引擎 game.js/audio.js/persist.js 与 VERSION 全部零改动","ui.js 新增导出：TOUCH_KEYS（6 键回放表）/isTouchDevice/createTouchControls（多点：touchstart=keydown、touchend/cancel=keyup、每键 activeKeys 独立）；createUI 增 opts.touch 强制注入 + has-touch 类归属 add/remove，元素 #touch-controls 可选（向后兼容）","AC-2 守卫：处理层 game.getPhase()!=='RUNNING' 拦截派发（仅 preventDefault），避免空格 PAUSED 态 togglePause 语义偏差；PAUSED/OVER 视觉不变仅守卫忽略","键盘激活防双发：.tkey 键级 keydown(Enter/Space) preventDefault+stopPropagation+tap()，不得仅用 click（Space 会被 game.js 二次吸收）","布局算术订正：竖屏键行 344px（DESIGN 印刷 369 笔误，结论不变）；max-width:379px 兜底键 44px 保 320px 不溢出；遮挡竖 99.8%/横零遮挡（AC-12）","测试：verify-ui 新增 TOUCH_KEYS↔G.keyAction 交叉校验；qa-e2e r16 段 AC-1~14（1s 长按差值≤1、事件序列相等、20 次旋转相等、defaultPrevented、静态尺寸/算术证据）；jsdom 无触屏事件→window.Event 构造+bubbles/cancelable，opts.touch:true 强制","任务拆 T1 DOM/T2 CSS/T3 ui.js 并行 → T4 verify-ui/T5 qa-e2e 并行 → T6 集成（七套全绿+README+git 提交 feat/mobile-touch-controls）"],"extra":{"verifyScripts":["scripts/verify-game.cjs","scripts/verify-audio.cjs","scripts/verify-ui.cjs","scripts/verify-constants.cjs","scripts/verify-persist.cjs","scripts/assembly-check.cjs","scripts/qa-e2e-jsdom.cjs"],"modules":{"/index.html":"#touch-controls.touchpad + 6 .tkey button（data-action↔TOUCH_KEYS 六值）","/style.css":"--z-touchpad:5、--tpad-key:3rem 两 token + .touchpad 竖栏/横轨 + .tkey 三态 + html.has-touch 显隐 + key-hints 隐藏","/ui.js":"TOUCH_KEYS/isTouchDevice/createTouchControls（合成键盘事件+守卫+activeKeys+dispose）+ createUI opts.touch/has-touch 类归属","/scripts/verify-ui.cjs":"TOUCH_KEYS↔keyAction 交叉校验 + 导出/抛错/Node 零 DOM","/scripts/qa-e2e-jsdom.cjs":"r16 触屏段 AC-1~14 + 自动装配段扩充","/README.md":"操作章节补触屏六键说明"}}}<!-- /state -->