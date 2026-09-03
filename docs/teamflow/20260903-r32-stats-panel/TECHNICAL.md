# r32 统计面板（已放置方块数 / 消行总数 / 游戏时长）TECHNICAL

<!-- 基线依赖：docs/teamflow/20260901-r31（自定义按键；承继 r28 横屏双轨让位、r30 触控=键盘回放器与竖屏 S 行式底栏冻结语义、r31 自定义按键）；需求正文见同夹 PRD.md（AC 编号以 PRD 为准），视觉裁定见同夹 DESIGN.md（§2 DOM/§2.4 横屏声明/§4 token） -->
<!-- 本需求纯新增、不取代任何既有行为/AC；所有改动为「追加 / 只读」，红线=既有规则体/断言期望/状态迁移/事件面零改动 -->

## §0 技术方案结论速览

- **数据面（game.js，只读追加）**：新增两个会话闭包计数 `piecesPlaced`（成功落定数，单一计数源）与 `sessionTimeMs`（有效时长 ms，暂停不计）；在**唯一落定收口点 `lockFlow()`** 递增 placed、在**唯一 RUNNING 时钟 `tick(dt)`** 累计时长；`start()`/`restart()` 归零；快照追加两字段 `piecesPlaced` / `sessionTimeMs`。不改任何既有函数返回值、状态迁移、onSfx 事件面。
- **展示面（index.html + style.css + ui.js，纯追加）**：独立面板 `#session-stats`（role=group aria-label=本局统计）作为 `#panel-left` 第 2 子节点（`.stat-grid` 之后、`.hold-well` 之前）——**不塞入 `.stat-grid`**（qa-e2e r17 断言 `.stat-grid` 内 `.stat` 恰 4 个 + verify-ui 四块原序，追加剧块即破 AC-12 红线）；style.css **文末追加** 4 组新规则（基座行式 / S 档 order / S 竖屏 `#main` 追加 `'session'` 网格行 / S 横屏自包含玻璃卡），既有规则体零改动；ui.js 新增 `formatSessionTime(ms)` 纯函数（格式锚点，verify-ui 断言矩阵）+ `createSessionStats(els)` 组件（只读渲染 + 状态跳变播报）。
- **断言面（三脚本 §r32 纯追加）**：verify-game §r32（引擎计数/时长/归零/定格/事件面不变）、verify-ui §r32（DOM 源扫描 + 格式矩阵 + aria 防刷屏 + CSS 源扫描）、qa-e2e §r32（jsdom 驱动数值等价 + 防刷屏计数 + 源码级不落行式栏/不触 TOUCH_KEYS）。r24~r31 既有断言期望**零改动**。
- **VERSION 决策**：**不升级**（AC-11 合规条款「不升级亦合规」）——纯展示型纯新增，保持 VERSION 三模块 0 diff，verify-constants 不动即绿。
- **红线**：audio.js / persist.js **0 行**；memory.md **0 diff**；无新音效事件；无新 token / 无新 @keyframes（flash 复用既有 `stat-flash`）。

## §1 数据模型与存储

| 项 | 载体 | 说明 |
|---|---|---|
| 已放置方块数 | `game.js` 闭包 `let piecesPlaced = 0`（会话内存） | **单一计数源**（AC-2）：与对局事件一一对应，UI 侧禁止独立累计（漂移红线）。软降 / 硬降 / 自然下落落定**各计 1**（含 T-spin、No-line T-spin 落定）；Hold 交换 / 移动 / 旋转 / 悬浮 0 |
| 消行总数 | 既有 `state.lines`（**不新建计数源**） | AC-3：与 `#stat-lines` 同源恒等——展示面只读 `s.lines` 派生，断言直接比对数 |
| 游戏时长 | `game.js` 闭包 `let sessionTimeMs = 0`（会话内存） | AC-4：新局（start/restart）归 0；仅 RUNNING 的 `tick(dt)` 累计（暂停后时钟停转 → 天然不计，visibilitychange 自动暂停同路径）；OVER 停表定格；数值为累计 ms，展示按秒取整 |

**存储**：三项指标均为**会话内存**，**不进入 persist.js**（PRD §3 非目标：跨对局统计/历史/排行榜不做）——persist.js 0 行。页面刷新即清零（既有会话语义先例：combo/b2bChain 同为会话内存）。

## §2 引擎契约（game.js —— 只读追加，改动面最小化）

### 2.1 快照字段（AC-13 数据锚点）

`snapshot()`（game.js 现 L631~659）在 `lines` 字段之后**追加**两个字段：

```js
lines: state.lines,
// r32：会话统计（纯新增展示数据；零影响既有消费方）
piecesPlaced: piecesPlaced,       // 成功落定计数（0 起非负整数）
sessionTimeMs: sessionTimeMs,     // 会话有效时长 ms（暂停不计；OVER 定格）
```

字段类型恒为 number；既有全部字段与生命周期（clearing 期附加字段等）**零变化**。`getSnapshot()` 与 `onSnapshot` 回调同源（同一 `snapshot()`），两路均可断言。

### 2.2 计数/计时植入点（三处 + 归零两处，全部纯追加语句）

| 位置 | 职能 | 追加语句 |
|---|---|---|
| `createGame` 闭包声明区（L621~625 comboChain/b2bChain 旁） | 会话计数声明 | `let piecesPlaced = 0`、`let sessionTimeMs = 0`（与 comboChain 同风格：闭包变量不入 `state` 对象） |
| `lockFlow()`（L685 起，`const merged=...` 之后） | **唯一落定收口**：软降触底、硬降、自然 lockTimer 全部经此（`softDrop` 触底 L909 / `hardDrop` L933 / `tick` 自然锁定 L1022 三路径汇聚）；含 No-line T-spin 与 GAME OVER 锁 | `piecesPlaced += 1`（每次恰 1 次——lockFlow 每方块恰调用一次；随后可能进 clearing 子阶段或 finishLock，均不影响本计数） |
| `tick(dt)`（L988 dt clamp 之后、clearing 分支**之前**） | 唯一 RUNNING 时钟：dt clamp 后累加；clearing 动画期也计（对局进行中非暂停）；PAUSED/OVER 不进入本函数 → 天然停表 | `sessionTimeMs += dt` |
| `start()`（L794 附近）/ `restart()`（L804 附近，与其它会话重置同批） | 新局归零（AC-4/5：READY→start 防御性归零；restart 任意态归零） | `piecesPlaced = 0; sessionTimeMs = 0` |

**证明「0 行为变化」**：三处植入均为纯计数/累加赋值，不读取既有状态、不改任何返回值 / 状态迁移 / emit 时机 / sfx 序列；`tick` 内累加不改变 `changed` 标志与 emit 语义。onSfx 事件面（L55 `SFX_EVENTS` 8 值）零触碰（AC-10）。

### 2.3 导出

不新增模块导出（引擎纯函数面保持现状）。Node 断言锚点 = `createGame` 实例快照字段 + `tick` 确定性驱动（AC-13）。

## §3 展示面契约（index.html / style.css / ui.js）

### 3.1 DOM（index.html —— 纯追加 1 节点）

`#panel-left` 内 `.stat-grid` 闭合 `</div>`（现 L51）与 `.hold-well`（L52）之间插入（Design §2.1 原文，逐属性执行）：

```html
<div id="session-stats" class="session-stats" role="group" aria-label="本局统计">
  <h3 class="session-stats__title">本局统计</h3>
  <div id="ss-placed" class="session-stat">
    <span class="session-stat__label">已放置</span>
    <output id="ss-placed-value" class="session-stat__value" aria-live="polite" aria-label="已放置方块数">0</output>
  </div>
  <div id="ss-lines" class="session-stat">
    <span class="session-stat__label">消行总数</span>
    <output id="ss-lines-value" class="session-stat__value" aria-live="polite" aria-label="消行总数">0</output>
  </div>
  <div id="ss-time" class="session-stat">
    <span class="session-stat__label">对局时长</span>
    <output id="ss-time-value" class="session-stat__value" aria-label="对局时长">00:00</output>
  </div>
  <p id="session-announce" class="session-stat__announce" role="status" aria-live="polite"></p>
</div>
```

要点（对照红线）：
- **AC-14 防刷屏**：时长 `#ss-time-value` **不设 aria-live**；`#ss-placed-value`/`#ss-lines-value` 沿用既有多处 `aria-live="polite"` 先例；`#session-announce`（role=status, polite）仅状态跳变时写文本。
- **h3 结论**（DESIGN §4.2 待查项）：index.html 既有 h3 为 `settings-group__title` ×4（设置弹层内、h2 之下）——h1（#title）→ h2（遮罩/弹层）→ h3（组标题）层级既有先例；`#session-stats` 内 h3 为该面板组标题，语义一致、无序列冲突（各域内 h 层级完整；面板本体以 role=group + aria-label 承担区域语义，读屏播报正常）。
- 类名 `session-*` 与 `.stat` / `.tkey` / `[data-action]` 计数面向**零交集**（.stat-grid 内 .stat 仍 4；TC 六键断言零扰动）。

### 3.2 style.css（文末追加 4 组规则；既有规则体零改动）

**做法**：不 edit 任何既有规则行；在文件末尾（现 L2164 之后）追加一个「r32 区块」。S 竖屏对 `#main` 的追加行以**同特异性后源序覆盖**方式完成（style.css 全程惯例：新规则源序追加压过既有），不改写既有 `#main` 规则原文（保住 r19 静态断言 `#main { … 'hold board next' }` 原串）。

```css
/* ═ r32 统计面板（#session-stats 独立面板；纯追加，既有规则体零动） ═ */
/* ① 基座行式（桌面/M/L：#panel-left 内自然排列） */
.session-stats { display: flex; flex-direction: column; gap: var(--sp-1); }
.session-stats__title { font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: var(--sp-2); }
.session-stat { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); }
.session-stat__label { font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.session-stat__value { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); line-height: 1.1; font-size: var(--fs-lg); }
.session-stat__announce { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
/* 已放置/消行闪动：复用既有 @keyframes stat-flash（零新增关键帧）；时长每秒不闪 */
.session-stat.is-flashing .session-stat__value { animation: stat-flash 120ms ease-out; }
@media (prefers-reduced-motion: reduce) { .session-stat.is-flashing .session-stat__value { animation: none; } }
/* ② S 档（<600px）ORDER 槽位：紧随 .stat-grid(order:10)、先于 #btn-settings(order:20)（§7.2 面板 flex 排序列用；竖屏显式 grid-area 下惰性） */
@media (max-width: 599px) {
  .session-stats { order: 12; }
  /* ③ S 竖屏：(orientation:portrait) —— #main 网格追加 'session' 行（既有四区名原样）；3 列 mini-grid */
  @media (orientation: portrait) {
    #main { grid-template-rows: auto auto auto minmax(0, 1fr); grid-template-areas:
      'stats stats stats'
      'session session session'
      'controls controls controls'
      'hold board next'; }
    .session-stats { grid-area: session; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
    .session-stats__title { display: none; }
    .session-stat { flex-direction: column; gap: var(--sp-1); }
  }
  /* ④ S 横屏：(orientation:landscape) —— 自包含玻璃卡（复刻 §7.1 卡化四件套；不进既有卡化选择器列表） */
  @media (orientation: landscape) {
    .session-stats { width: 100%; max-width: 420px; background: var(--glass-bg); -webkit-backdrop-filter: blur(20px) saturate(140%); backdrop-filter: blur(20px) saturate(140%); border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--sp-3); margin: var(--sp-2) 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
    .session-stats__title { display: none; }
    .session-stat { flex-direction: column; gap: var(--sp-1); }
  }
}
```

关键裁定：
- **③ 的 `#main` 重声明**：仅补 `grid-template-rows` 第三行 `auto` 与 areas 新行，保留 `'hold board next'` 子串与列模板（`grid-template-columns` 不重声明，沿既有竖屏规则）；r19 静态断言 `/#main\s*\{[^}]*'hold board next'/` 在既有竖屏切片内仍命中原规则 → 绿（且新规则同样含该子串，双保险）。
- **④ 不加入** L1687 卡化选择器列表（保该列表规则体字节不变，r31「规则体零动」惯例）——独立一条规则，效果等价。
- **S 竖屏行高预算**：mini-grid 行 ≈34px（--fs-lg 18px 值 + --fs-xs 12px 标签 + 间距）；棋盘 1fr 行 −≈34px（375×667 估 560→526 高，等比可玩；真机目测入 M4 人工清单）。
- **S 横屏高度**：自包含卡 ≈58px；非触屏 S 横屏左列增高可能引垂直余量收紧 → 真机目测入 M4；`#board` max-height `calc(100vh - 150px)`（L2035）不修改（板高独立计算，与左列高不耦合；若真机确现装不下再独立裁定，不进本方案代码）。
- **横屏双轨形态**（DESIGN §2.4 声明承继）：has-touch + 横屏 <1024 由 r30 `#rotate-overlay` 锁屏遮罩全屏接管，面板**不新增任何轨道内布局规则**；≥1024 横屏触控无 rails 走 §2.2 面板布局 → AC-7「轨道内让位」以「双轨形态不出游戏视图」满足。

### 3.3 ui.js（新组件 + 纯函数 + 装配接线；既有逻辑零改）

**A. 纯函数 `formatSessionTime(ms)`（格式锚点，verify-ui 断言矩阵）**——与 `buildRewardText` 同风格（展示格式化纯函数居 ui.js、Node 可单测）：

```js
function formatSessionTime(ms) {
  const total = typeof ms === 'number' && isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const pad = function (n) { return String(n).padStart(2, '0') }
  return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : pad(m) + ':' + pad(sec)
}
```
规格：`mm:ss`，≥1h 自动 `hh:mm:ss`；`<1s` 取整为 0；非数/负/NaN → `'00:00'` 防御（对齐 E6 风格）。导出进 `TetrisUI`（模块返回值追加 `formatSessionTime`）。

**B. 组件 `createSessionStats(els)`**（签名平行 `createHud`）：

```js
function createSessionStats(els) { // els: { placed, lines, time, announce }
  // 本地 timer Map + flash(block)（与 createHud.flash 同构小段；不抽公共 helper——避免触碰既有 createHud，接受 8 行内重复，见 blueprint duplications）
  // let lastPhase = null；announce 写入计数自持（供 e2e 断言可测性）
  function update(s) {
    // 已放置：值与 textContent 不同才写 + flash(block)（.is-flashing，120ms，复用 stat-flash）
    // 消行总数：s.lines 直接镜像（与 #lines 同源恒等，AC-3）
    // 时长：formatSessionTime(s.sessionTimeMs)；文本变更才写；**不 flash、不写 announce**（每秒静默）
    // 播报：仅 phase 跳变时写 #session-announce 一次：
    //   →RUNNING（start/resume/restart）：「计时开始」
    //   →PAUSED：「已暂停，对局时长 「+format」」
    //   →OVER：「游戏结束，最终时长 「+format」」
    //   READY 不播报；同态数值刷新零播报（AC-14 核心：状态机驱动，非值变化驱动）
  }
  return { update, dispose /* 清 timers */ }
}
```

**C. 装配接线**（createUI，全部纯追加）：
- els 取 DOM：`placed: must('#ss-placed-value')`、`lines: must('#ss-lines-value')`、`time: must('#ss-time-value')`、`announce: must('#session-announce')`（must 缺失即抛错——index.html 与 ui.js 同批交付，装配期暴露接线问题）。
- `const sessionStats = createSessionStats({ ... })`；`renderAll(s)` 内 `hud.update(s)`（L1882）之后追加一行 `sessionStats.update(s)`。
- `dispose()` 内追加 `sessionStats.dispose()`。
- 无任何新事件监听 / 新焦点元素 / persist 写回（背景音乐等开关的 persist 旁观模式不适用——本面板零可交互控件）。

## §4 断言方案（三脚本 §r32 纯追加；r24~r31 期望零改动）

新增断言全部**追加在既有断言之后**（verify-ui 现以 r31 段收尾 L1102~；qa-e2e 现 r31 段 + file:// 段 L1917~；verify-game 顺序新增）。

### 4.1 verify-game §r32（引擎数据面；自动装配沿用既有 mkGame 模式：autoLoop:false + animMs:0 + onSfx 收集）

1. **初始化**：READY `getSnapshot()` 与首帧 onSnapshot：`piecesPlaced === 0 && sessionTimeMs === 0`（number 类型）。
2. **落定计数混合**（AC-2）：start 后 2×`hardDrop()`（各 +1）+ 1 轮软降触底（`softDrop()` 至触底返回 locked，+1）+ 1 轮自然锁定（`tick` 驱动落底 + lockTimer 500ms，+1）→ `piecesPlaced === 4`。
3. **非落定零计数**（AC-2）：`move`/`rotate`/`hold` 各成功后 `piecesPlaced` 不变；期间 `sessionTimeMs` 仅在 `tick` 后变。
4. **T-spin / No-line 计 1**（AC-2）：`_debug.setBoard/setPiece` 构造 T-spin full cleared=0 锁定 → `piecesPlaced` 恰 +1（且 combo/b2b 既有断言值不变）。
5. **消行同源**（AC-3）：构造 10 次单消 + 2 次四消 → `snapshot.lines === 18`；面板消行总数即该字段镜像（无第二计数源）。
6. **时长语义确定性**（AC-4，无墙体时钟——tick 确定性驱动）：start；`tick(250)×4` → `sessionTimeMs === 1000`（**注意**：`tick` 单次 clamp ≤250（DT_CLAMP_MS），断言必须用 ≤250ms 分片，勿整测大 dt）；`togglePause()` 后 `tick(1000)` → 仍 1000（暂停不计）；`togglePause()` 恢复 + `tick(250)×2` → 1500；`lose()` 至 OVER 后 `tick(250)×4` → 仍 1500（定格）。
7. **归零**（AC-5）：`restart()` → 两字段 0；新实例 READY→start 同样 0。
8. **事件面不变**（AC-9/10）：既有 onSfx 序列断言零改照常绿；r32 显式：落定计数与时长累加**不新增任何 sfx 事件**（hardDrop 后序列仍为预期 8 事件集内、次数与既有基线一致）。
9. **快照既有键不变**：除两新字段外，既有快照键值逐一深比较不变（防误改）。

### 4.2 verify-ui §r32（DOM/CSS 源扫描 + 纯函数矩阵）

1. **index.html 节点契约**：`#session-stats` 片段含 `role="group"` + `aria-label="本局统计"`；恰 3 个 `.session-stat`；`#ss-placed-value`/`#ss-lines-value` 含 `aria-live="polite"` 与完整 aria-label；`#ss-time-value` **不含 aria-live**（AC-14 源码级）；`#session-announce` 为 `role="status" aria-live="polite"`（r31 提示 / #status 先例）。
2. **位置与隔离**：`stat-grid` 闭合串 < `session-stats` 开串 < `hold-well` 开串（indexOf 序）；session 面板片段内**零** `.stat` / `.tkey` / `data-action` 出现（计数面零交集）；既有四块原序断言（L361~）零改照常绿。
3. **formatSessionTime 矩阵**：0→'00:00'；999→'00:00'；1000→'01:00'；59999→'00:59'；60000→'01:00'；3600000→'1:00:00'；3725000→'1:02:05'；`-1`/`NaN`/`'x'`/`undefined`→'00:00'。
4. **style.css 源扫描**：
   - `@keyframes` 名集与基线一致（只含既有 ~4 个，无新增——断言 `.session-stat.is-flashing` 规则引用 `stat-flash` 而非新关键帧）；
   - 既有卡化选择器列表行（L1687 八选择器原串）**不含** `.session-stats`（独立卡化规则存在）；
   - S 竖屏 `#main` 追加规则含 `'session session session'` 行且 `'hold board next'` 子串仍以 `#main { … }` 形式存在（r19 断言兼容证明）；
   - `order: 12` 存在（S 档 `@media (max-width: 599px)` 内）；
   - 红线零改动：`.stat-grid` 基座规则（`gap: var(--sp-5)`）与 `padding-right: 112px` 等既有正文不存在于 r32 新增片段（断言新片段不含 `padding-right: 112px` 等既有行，防整段复制改写）。

### 4.3 qa-e2e §r32（jsdom 驱动：数值等价 + 防刷屏 + 源码级）

独立 createUI（animMs:0，r13/r14 先例）+ 既有 `key()`/`check()`/`snap()` 辅助器：

1. **file:// 自动装配页**：`#session-stats` 存在；三值初始 `0/0/00:00`；`.stat-grid` 内 `.stat` 仍恰 4（既有 r17 断言原样保留，不删不改）。
2. **落定数值等价**（AC-2/3/13）：不动输入硬降 `hardDrop` ×N → `#ss-placed-value` 文本 === String(N)；期间每次消行快照 `#ss-lines-value` 与 `#lines` 同文（多轮滚动比对）。
3. **时长 UI**：`tick(250)×4` → `#ss-time-value` === '00:01'；暂停后 `tick` 多秒不变；恢复续计；`lose()` OVER 定格（文本冻结）。
4. **AC-14 防刷屏计数**：连续 10 秒刻 `tick` 循环（无状态跳变）→ `#session-announce` 文本零变更、**announce 写入计数 0 增量**（组件自持计数可断言）；pause 一次 → 写入恰 +1（「已暂停，对局时长 00:01」）；resume → +1；restart → 归零 + 「计时开始」+1。
5. **归零/定格 DOM**：restart 后三值回 `0/0/00:00`；OVER 帧三值 = 终局快照值。
6. **源码级**（cssText/htmlText 静态证据，r17 段先例）：`#touch-controls` 片段不含 `session-`（面板不落行式底栏/双轨）；css 无 `.touchpad .session-*`、无 `.session-* .tkey` 等交叉规则（不触碰 TOUCH_KEYS/r30 底栏）；`data-action` 六值断言（既有 r16 L1794~）零改照常绿。

### 4.4 七套全绿门槛（AC-11/12）

产品根执行 `node scripts/verify-game.cjs` / `verify-audio.cjs` / `verify-ui.cjs` / `verify-constants.cjs` / `assembly-check.cjs` / `qa-e2e-jsdom.cjs`（+persist 自检脚本）全绿；`verify-constants` 证明 VERSION 三模块一致且未动；`assembly-check` 既有正例（`#stat-score .stat__value` 等）零改全命中（session 面板不新增/不删改任何正例选择器）。

## §5 任务拆分（并行化 + 工程约束）

> 无 PIPELINE-DISPATCHED 任务，按文件边界拆分（互斥文件 → 并行）；契约先锁定（§2.1 快照字段名 / §3.1 DOM id / §3.2 类名），各任务按契约开发。

| 任务 | 文件边界 | 内容 | 依赖 | 验收点 |
|---|---|---|---|---|
| **T1 引擎会话计数** | `/game.js` | §2 全部：两闭包计数、lockFlow 递增、tick 累计、start/restart 归零、快照两字段 | 无（基线 r31） | verify-game §r32(4.1) 全绿；game.js diff 仅追加 |
| **T2 面板 DOM + 四档样式** | `/index.html`、`/style.css` | §3.1 节点 + §3.2 文末 4 组规则 | 无 | verify-ui §r32(4.2) 源扫描全绿；style.css 既有规则体 0 改动 |
| **T3 会话统计渲染** | `/ui.js` | §3.3 A/B/C：formatSessionTime、createSessionStats、createUI 接线、导出 | T1 快照字段契约（已锁） | verify-ui §r32 矩阵 + e2e 数值等价 |
| **T4 断言追加** | `/scripts/verify-game.cjs`、`/scripts/verify-ui.cjs`、`/scripts/qa-e2e-jsdom.cjs` | §4 三脚本 §r32 段（纯追加） | T1~T3 实现（断言需实现后转绿） | 七套全绿，r24~r31 断言零改动 |
| **T5 红线复核 + 收口** | 全仓（不改产物文件） | AC-9~12：game/audio/persist diff 复核（audio/persist 0 行、game 仅追加）、VERSION 三模块一致（verify-constants）、memory.md 0 diff、七套复跑全绿；验收批后单 commit | T1~T4 | 全绿 + diff 面复核记录 |

**并行策略**：T1/T2/T3 三任务文件互斥可并行（第一拍）；T4 断言按已锁契约可并行编写（与 T1~T3 同期），但绿标在 T1~T3 合流后；T5 为收口门（第二拍）。

**工程约束携入**（PRD §8，任务执行期必须遵守）：
- 分支 `feat/stats-panel`（已 checkout），不在本需求提交中夹带场外改动（CNAME 等）；开发期间工作区保持纯净。
- 改动面收口：仅 `/index.html` `/style.css` `/ui.js` `/game.js` `/scripts/*.cjs`（断言追加）；`/audio.js` `/persist.js` `/AGENTS.md`（托管区外）/ `docs/teamflow/memory.md` 一律 0 行。
- 交付物全部落 `docs/teamflow/20260903-r32-stats-panel/`；命令输出日志落 `logs/teamflow/<runId>/`，禁止项目根散落日志、禁止写 `docs/<role>/`。
- 提交：验收通过后与交付物同批提交（合并策略由 acceptance 阶段按 r28/r31 先例决定）；开发期禁止改写历史任务夹。

## §6 关键实现点与边界情况

1. **单一计数源（AC-2 漂移红线）**：placed 只增于 `lockFlow()`；UI 绝不在快照外累计。锁定后若进 clearing 子阶段，计数已 +1，动画期不重复；finishLock 出口共用不二次计数。
2. **时长「暂停不计」的构造保证**：时长只在 `tick()` 内累加，而 `tick()` 首行守卫 `state.phase !== 'RUNNING'` 即返回——PAUSED/OVER 完全无法进入累加点（非「暂停时跳过」，而是时钟停转）；visibilitychange 自动暂停（L1067）与设置弹层自动暂停（ui.js openSettingsModal → togglePause）同路径自然不计。
3. **dt clamp 对时长的影响**：`tick` 单次 dt clamp ≤250ms（E8 防跳帧穿透）；正常 rAF ~16ms 帧不受影响，累计 ≈ 墙体时钟（≤1s 容差满足，AC-4）。切后台回来的一次大 dt 被 clamp → 时长略小于墙钟，属既有防穿透语义、可接受（M4 人工项观察）。**测试必须用 ≤250ms 分片**（§4.1-6）。
4. **GAME OVER 定格**：lose/出生碰撞后 `stopLoop()`——无 tick → `sessionTimeMs` 冻结；placed 计数含致欧锁（最后一次成功落定 +1，出生碰撞块不计——未落定）。
5. **动画期时长**：clearing 属 RUNNING 子阶段，时长继续累计（对局进行中）；暂停冻结动画进度同时冻结时长（同一停表）。
6. **读屏防刷屏（AC-14）**：announce 由 **phase 跳变**驱动（`lastPhase` 比对），与数值变化解耦；同一状态内每秒时长刷新零播报；announce 文本含当前格式化时长（暂停/结束播报信息完整）。既有 `aria-live=polite` 频繁值输出（placed/lines 低频事件）沿用先例。
7. **h3 层级**：§3.1 已核对（settings-group 先例）；不新增全局 h 序列断言（无既有断言约束）。
8. **S 竖屏棋盘 −34px**：真机人工目测项（M4）；若验收裁定不可接受，回退讨论点为「session 行与 stats 行合并为 2 行 2 列区」——**不默认实施**，避免动既有 areas 语义。
9. **S 横屏左列增高**：非触屏小窗 ≤58px 追加高度，`#board` max-height 独立计算不联动；真机目测入 M4（验收清单 §7）。
10. **不落行式底栏 / 双轨**：`#session-stats` 位于 `#panel-left`（非 `#touch-controls` / `.rail` / `.touchpad` 后代）；CSS 无 `.touchpad .session-*` 交叉选择器；TOUCH_KEYS 六值与 `data-action` 契约零触碰（AC-7/8）。

## §7 风险与人工补测清单（承接 AC-14/AC-9 与 DESIGN §7）

| 风险 | 处置 |
|---|---|
| 计数双源漂移 | 单一计数源 + 快照断言（§4.1-2/3/4） |
| 时长暂停/切后台漂移 | tick 停表构造保证 + 确定性断言 + 真机 M4 人工项（暂停计时、切后台） |
| S 竖屏棋盘变小 / S 横屏加卡超高 | 行高预算 + 真机目测不叠压（M4）；`#board` max-height 不联动 |
| 横屏双轨「面板可见」预期 | DESIGN §2.4 声明承继：<1024 触控横屏由 r30 锁屏遮罩接管（零触碰）；若验收方要求双轨下可见须独立裁定 |
| 读屏刷屏 | announce=状态跳变驱动 + §4.3-4 写入计数断言 + 读屏人工项（M4） |
| 既有断言漂移 | §r32 纯追加、旧期望零改；T5 逐脚本 diff 复核 |

**M4 人工补测（写入 QA-REPORT 清单）**：真机竖屏面板数值实时性与棋盘可玩性（375×667 / 320×568）；暂停计时停表、切后台恢复时长、OVER 定格、重新开始归零；横屏双轨（触屏手机横屏出锁屏遮罩、≥1024 平板横屏走面板布局）目测无叠压；读屏播报（新局/暂停/继续/OVER 各一次、每秒时长不刷屏）；FPS 无感（新增渲染仅为低频文本写入，无逐帧开销）。

<!-- blueprint -->{"summary":"三项会话指标以独立面板纯新增呈现：game.js 只读追加 piecesPlaced/sessionTimeMs 快照（单一计数源），ui.js 新增 formatSessionTime/createSessionStats 只读渲染，style.css 文末追加四档规则，三脚本 §r32 断言纯追加——audio/persist 0 行、既有规则体与旧断言零改动。","modules":{"/game.js":{"responsibility":"会话统计唯一数据源：成功落定计数 piecesPlaced（lockFlow 唯一收口 +1）、有效时长 sessionTimeMs（tick RUNNING 唯一累计）、start/restart 归零、快照附两字段；0 行为变化","dependsOn":[],"assemblyOrder":1,"why":"计数必须与对局事件一一对应（AC-2 单一计数源漂移红线），故置于引擎唯一落定收口点 lockFlow 与唯一时钟 tick，UI 绝不独立累计"},"/index.html":{"responsibility":"纯追加 #session-stats 独立面板节点（role=group + 3×session-stat output + #session-announce），位 .stat-grid 后 hold-well 前","dependsOn":[],"assemblyOrder":2,"why":"展示挂载点必须与 ui.js must() 装配契约同批交付；不塞 .stat-grid 系因 qa-e2e r17 断言 .stat 恰 4 个 + verify-ui 四块原序，追加块即破 AC-12 红线"},"/style.css":{"responsibility":"文末追加 4 组规则：基座行式 / S 档 order:12 / S 竖屏 #main 追加 session 网格行 + 3 列 mini-grid / S 横屏自包含玻璃卡 + reduced-motion 闪动裁剪","dependsOn":[],"assemblyOrder":3,"why":"沿 style.css 全程惯例「新规则源序追加压过既有」实现 S 竖屏加行（同特异性后源序覆盖，不改既有 #main 规则正文保住 r19 断言）；横屏双轨形态零新增规则（r30 锁屏遮罩接管，DESIGN §2.4 声明）"},"/ui.js":{"responsibility":"formatSessionTime 纯函数（格式锚点）+ createSessionStats（只读渲染、闪动复用 stat-flash、phase 跳变驱动 #session-announce 播报）+ createUI 必须 els 接线","dependsOn":["/game.js","/index.html"],"assemblyOrder":4,"why":"与 buildRewardText/createHud 同构（展示格式化纯函数 + 翻新组件居 ui.js、Node 可单测）；时长防刷屏=announce 状态机驱动而非值变化驱动，组件自持写入计数供 e2e 断言"},"/scripts/verify-game.cjs":{"responsibility":"§r32：初始化/混合落定计数/非落定零计数/T-spin No-line 计 1/消行同源/时长确定性 tick 断言/归零/事件面不变/快照既有键不变","dependsOn":["/game.js"],"assemblyOrder":5,"why":"引擎数据面锚点断言须确定性（tick ≤250ms 分片，无墙体时钟依赖，AC-4 ≤1s 容差由构造保证+真机人工项兜底）"},"/scripts/verify-ui.cjs":{"responsibility":"§r32：index.html 节点/位置/隔离源扫描 + formatSessionTime 矩阵 + CSS 源扫描（零新关键帧、卡化列表不动、areas 追加行、order:12、红线零改动）","dependsOn":["/ui.js","/style.css","/index.html"],"assemblyOrder":6,"why":"ac-14 防刷屏与 AC-12 旧断言零改动的源码级证明（aria 无 live 时长、.stat 计数面零交集）需静态断言承载（jsdom 不可达几何先例 r17）"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"§r32：jsdom 驱动数值等价（落定 N→N、消行同源、时长 UI 停表/定格）、announce 写入计数防刷屏、归零/定格 DOM、源码级不落行式栏/不触 TOUCH_KEYS","dependsOn":["/game.js","/ui.js","/index.html","/style.css"],"assemblyOrder":7,"why":"文件:// 管线真实装配页 + 独立实例驱动是数值与播报契约的最终 E2E 证明；既有 r17 .stat===4 断言原样保留即 AC-6/12 回归护栏"}},"duplications":["flash 小段在 createHud 与 createSessionStats 各 8 行内重复（刻意不抽公共 helper——抽离须改既有 createHud，违反本需求红线；接受为受控重复，独立重构单另议）","formatSessionTime 与既有格式化为零重复（本产品无既有计时格式）；无存储层重复（不入 persist）"],"tasks":[{"title":"T1 引擎会话计数（game.js）","files":["/game.js"],"spec":"两闭包计数 + lockFlow 递增 + tick 累计 + start/restart 归零 + 快照两字段（piecesPlaced/sessionTimeMs），0 行为变化"},{"title":"T2 面板 DOM + 四档样式（index.html + style.css）","files":["/index.html","/style.css"],"spec":"#session-stats 节点纯追加 + 文末 4 组规则（基座/order/竖屏 areas 行/横屏卡化），既有规则体零改"},{"title":"T3 会话统计渲染（ui.js）","files":["/ui.js"],"spec":"formatSessionTime + createSessionStats（只读渲染/闪动/播报）+ createUI 接线 + 导出，既有逻辑零改"},{"title":"T4 断言追加（三验证脚本）","files":["/scripts/verify-game.cjs","/scripts/verify-ui.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"§r32 段纯追加（§4 全项），r24~r31 断言期望零改动"},{"title":"T5 红线复核 + 收口","files":[],"spec":"audio/persist 0 行、game 仅追加、VERSION 三模块一致、memory 0 diff、七套全绿、验收批后单 commit"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r32 TECHNICAL 定稿：数据面=game.js 只读追加闭包 piecesPlaced/sessionTimeMs（lockFlow 唯一落定收口 +1 单一计数源、tick RUNNING 唯一累计暂停天然停表、start/restart 归零、快照附两字段，engine 0 行为变化）；展示面=#session-stats 独立面板（.stat-grid 后 hold-well 前，勿塞 stat-grid——r17 .stat===4 红线）+ style.css 文末 4 组规则（S 竖屏 #main areas 追加 session 行用同特异性后源序覆盖不改原文保 r19 断言；S 横屏自包含卡不进既有卡化列表）+ ui.js formatSessionTime/createSessionStats（announce=phase 跳变驱动防刷屏，flash 复用 stat-flash 零新关键帧）；VERSION 不升级（AC-11 合规）；audio/persist/memory 0 行；断言=三脚本 §r32 纯追加（时长确定性须 tick≤250ms 分片）；任务 T1(game)/T2(html+css)/T3(ui) 并行、T4 断言、T5 红线复核单 commit。","memory":["r32 引擎契约：piecesPlaced 在 lockFlow() 唯一收口 +1（软/硬/自然/T-spin/No-line 落定各 1，Hold/移动/旋转 0）；sessionTimeMs 仅 tick() RUNNING 累加（dt clamp ≤250，暂停停表构造保证）；start/restart 归零；快照追加 piecesPlaced/sessionTimeMs；VERSION 不升级","r32 S 竖屏 #main 加行实现：文末追加同特异性 #main 重声明（rows 补 auto + areas 加 'session session session' 行、保留 'hold board next'），不改既有规则正文→r19 静态断言与 .stat-grid 规则体双保；.session-stats 需 S 档 order:12 槽位（stat-grid 10 与 btn-settings 20 之间）","r32 防刷屏机制：时长 output 无 aria-live；#session-announce（role=status 视觉隐藏）仅 phase 跳变写文本（→RUNNING 计时开始/→PAUSED 已暂停+时长/→OVER 游戏结束+时长），组件自持写入计数供 e2e 断言","r32 断言锚点：verify-game=快照字段+tick≤250ms 确定性（无墙体时钟）；verify-ui=formatSessionTime 矩阵+DOM/CSS 源扫描（零新 @keyframes、卡化列表不动、aria 无 live）；qa-e2e=jsdom 数值等价+announce 写入计数+源码级不落行式栏/不触 TOUCH_KEYS；旧断言零改动","r32 任务并行：T1 game / T2 index.html+style.css / T3 ui.js 互斥文件并行（契约已锁：快照字段名+DOM id+类名）；T4 三脚本 §r32；T5 红线复核（audio/persist 0 行、VERSION 一致、memory 0 diff、七套全绿）单 commit"]}<!-- /state -->