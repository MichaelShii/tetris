<!-- meta: summary="r35 统计面板方案3去重收口技术方案：纯展示面删两行（index.html 删 #gs-hi 与 #ss-lines，删除非隐藏）+ ui.js 去 hi 镜像接线（createGlobalStats els/update、must()×5→×4、statsUi 去 hi、load/onSnapshot/onStats 三接线点去 hi，dispose/导出保留）+ style.css 预期 0 行（grid repeat(3) 4 子项自适应 3+1 两行同高）+ 断言原地改写（verify-ui 3→2/5→4 与 ss-lines aria 断言删除、qa-e2e §r32/§r34 面板条目同步、assembly-check 选择器清单去 #gs-hi-value）+ 文件尾 §r35 删除证明段；persist/game/audio/VERSION 0 行 diff，七套全绿。最高分唯一通道=#hi-score（r17 冻结 aria-live=polite），消行唯一源=stat-grid #lines。" -->

# r35 统计面板去重收口（方案3）— TECHNICAL（技术方案）

> **基线**：docs/teamflow/20260904-r34-global-stats-persistence（r34 已实现中间提交 5ec9a4a 的行为——单键 stats 载荷、saveStats/delta 契约、onStats 入账补记口径、四档布局——**逐字保持，本方案只删展示面两行**，不触碰数据模型/引擎/红线）。
> **取代**：r34 任务夹 DESIGN 刻意设计声明①（最高分双处同源镜像，本方案作废）；r32#AC-3（本局消行双处同值并列，改为单处显示）。
> **代码形态**：扁平纯 JS + UMD，零构建零依赖（AGENTS.md §4）；风格承继 r32/r34（纯函数、工厂+闭包、`dispose()` 统一清理）。

## 0. 方案速览

| 决策点 | 结论 | 依据 |
|---|---|---|
| 去重对象 | index.html **删除**两行 DOM：`#gs-hi`（全局卡最高分镜像行）与 `#ss-lines`（本局卡消行总数行）——**删除而非隐藏**（`display:none` 属绕过，源码级断言拦截，AC-1/AC-2） | AC-1/AC-2；r34#AC-8、r32#AC-3 表述取代 |
| 最高分显示 | 唯一通道 = stat-grid `#hi-score`（r17 冻结块，`aria-live="polite"` 既有）；`updateHiScoreEl()`（ui.js L1946）与破纪录闪动路径零改动 | AC-1「读屏不丢」；index.html L41 实测核实 |
| 本局消行显示 | 唯一源 = stat-grid「消除行数」`#lines`；`#session-stats` 仅剩 2 行（`#ss-placed`/`#ss-time`）；时长格式（mm:ss / hh:mm:ss）与已放置计数语义不动 | AC-2；r32 AC-3「同值」因单处显示而平凡保持 |
| 数据模型/API | persist.js `stats` 载荷四字段、PAYLOAD_VERSION=1、`saveStats(delta)` 只增不减、`load()` 返回结构、`onStats` 事件契约、`flushTime()` —— **全部 0 行 diff 逐字沿用** | AC-3/AC-4/AC-5；PRD §3 非目标（不改数据模型） |
| UI 消费侧 | `createGlobalStats` 去 hi（els 4 键、update 去 hi 分支）+ 装配五接线点去 hi（must 清单、statsUi 定义、load 初始镜像、onSnapshot 破纪录、onStats 读回）；dispose/导出保留 | AC-1「装配锚点移除」；剩余四接线点保留且语义不变 |
| style.css | **预期 0 行 diff**：S 竖屏/横屏 mini-grid 为 `grid-template-columns: repeat(3, minmax(0,1fr))`（L2219/L2225），4 子项自动排 3+1 两行，与 r34（3+2) 同两行 ≈68px 无高度回归；行式基座 flex 列自动 4 行 | AC-8/R4；PRD §3「4/2 行布局微调」= 自适应无需改，微调窗口仅限零新 token/关键帧 |
| 断言同步 | verify-ui 行数断言**原地改写**（`.session-stat` 3→2 两处、`.global-stat` 5→4）+ ss-lines/gs-hi 相关断言删除 + 文件尾新增 §r35 删除证明段；qa-e2e §r32/§r34 面板条目同步；assembly-check 选择器清单去 `#gs-hi-value` | AC-6；R1（改写限定行数数值，语义断言不触碰） |
| 红线 | game.js / persist.js / audio.js / VERSION / onSfx / 快照键集 **0 行**；verify-game / verify-persist / verify-audio / verify-constants **0 行 diff**；七套全绿为出口 | AC-3/4/5；PRD §8 |
| git | 分支 `feat/global-stats-persistence` 不新建；基线=中间提交 5ec9a4a；r35 变更与 r34 一并提交、一并合回（验收后用户确认步骤） | PRD §8；R3 |

**口径不变**（AC-4 逐字继承）：OVER 定格一次性入账（次数+1、方块/消行/时长按定格值累加，双入口幂等）；隐藏/卸载补记当前局未入账时长（pagehide/beforeunload + visibilitychange 先补记后暂停）；暂停不计时长；中途刷新不丢。去重只删展示行，入账/补记数据通道零触碰。

## 1. 数据模型与存储（persist.js — 0 行 diff，逐字保持）

- **载荷结构**（单键 `tetris.v2`，PAYLOAD_VERSION=1）：`{ version: 1, highScore, settings, stats: { placed, lines, timeMs, games } }` —— 四字段语义/清洗/旧载荷全 0 兼容，**与 r34 完全一致**，本需求不新增不删除任何字段。
- **`saveStats(delta)` 契约逐字沿用**：只增不减累加、每字段 sanitize（integer/min 0/def 0）、空增量快路径返回 true 不写盘、dispose 后 false、内存降级静默成功。
- **`load()` 返回结构逐字沿用**：`{ highScore, settings, stats }`。
- 结论：persist.js 计入「0 行 diff 红线」清单，verify-persist §r34 全部用例（roundtrip/清洗/只增不减/降级/旧载荷/混合保留）不加不减。

## 2. API 设计（消费侧裁剪；接口本身 0 行）

| 出口 | 契约（逐字不变） | r35 消费侧变化 |
|---|---|---|
| `game.createGame(opts.onStats)` | `onStats({ reason:'over'\|'flush', placed, lines, timeMs, games })`；'over' 定格恒发一次；'flush' 仅未入账时长 delta>0 才发 | 无（引擎 0 行） |
| `game.flushTime()` | 公共补记出口（RUNNING 判定 + 水印差值，幂等） | 无（引擎 0 行） |
| `persist.saveStats(delta)` / `load()` | 见 §1 | 无（persist 0 行） |
| `ui.createGlobalStats(els) → { update, dispose }` | els 键 **`{hi, placed, lines, time, games}` → `{placed, lines, time, games}`**；update 接受部分载荷 **（去掉 `hi?` 分支）** | **唯一签名变化**：els 4 键、must()×4；装配根缺任一即抛错（同 must 惯例） |
| `ui.createUI(opts.persist)` | `persist` 需含 `saveStats`（缺失兼容旧版，UI 静默） | `statsUi` 镜像去 `hi` 字段；破纪录分支不再写全局卡 |

- **最高分显示机制（零改动）**：`updateHiScoreEl()`（L1946）→ `#hi-score`（index.html L41，`aria-live="polite"` 属 r17 冻结块）；破纪录时点 L2122 `updateHiScoreEl()` 保留。删除的是「镜像到全局卡」的两行接线（L2124-2125），`#hi-score` 本体及其读屏播报、闪动机制不动（AC-1/AC-8 人工验证点）。
- **外围注意**：`statsUi` 去掉 `hi` 后，`onStats` 读回（L2147-2152）与 load 初始镜像（L2001-2009）中对应 hi 行一并删除，不留死代码（T2 验收用 grep 佐证无 `statsUi.hi`/`els.hi` 残留）。

## 3. 前端组件与页面拆分

### 3.1 index.html（删两行，删除非隐藏）

```html
<!-- 删除前（现状） -->
<div id="session-stats" ... role="group" aria-label="本局统计">
  <h3 class="session-stats__title">本局统计</h3>
  <div id="ss-placed" class="session-stat">…<output id="ss-placed-value" …aria-label="已放置方块数">0</output></div>
  <div id="ss-lines" class="session-stat">…<output id="ss-lines-value" …aria-label="消行总数">0</output></div>  <!-- ← 删除本行块（现 L60-63） -->
  <div id="ss-time" class="session-stat">…<output id="ss-time-value" …aria-label="对局时长">00:00</output></div>
  <p id="session-announce" …></p>
</div>
```

```html
<!-- 删除后：#session-stats 恰 2 行 .session-stat（#ss-placed / #ss-time）；#session-announce 保留 -->
<div id="global-stats" class="global-stats" role="group" aria-label="全局统计">
  <h3 class="global-stats__title">全局统计</h3>
  <div id="gs-hi" class="global-stat">…<output id="gs-hi-value" …aria-label="最高分">0</output></div>  <!-- ← 删除本行块（现 L73-76），非隐藏 -->
  <div id="gs-placed" class="global-stat">…</div>
  <div id="gs-lines" class="global-stat">…</div>
  <div id="gs-time" class="global-stat">…</div>
  <div id="gs-games" class="global-stat">…</div>
</div>
```

- **删除后契约**：`#global-stats` 恰 4 行 `.global-stat`（gs-placed / gs-lines / gs-time / gs-games），剩余 4 个 `output` 的 `aria-live="polite"` + 完整 `aria-label` 原样保留；`#session-stats` 恰 2 行 `.session-stat`。
- **冻结原子不动**：`.stat-grid`（L30-51，含 `#hi-score`/`#lines`）、`#session-announce`、两卡以外的所有 DOM、脚本顺序。
- 行内注释：r34 卡片注释（L70）不涉行数可原样；如需可补一句「r35：已删最高分镜像行（最高分单处=#hi-score）」——**可选**，不新增其他注释。

### 3.2 style.css（预期 0 行 diff，自适应说明）

- **为什么不用改**：r34 块（L2199-2228）中 S 竖屏（L2219）与 S 横屏（L2225）mini-grid 均为 `grid-template-columns: repeat(3, minmax(0,1fr))` —— 5 子项 → 3+2 两行；删除 1 子项后 4 子项 → 3+1 两行，**行数与 r34 同为两行 ≈68px，高度预算无回归**（PRD R4 复核点）；桌面/M 行式基座（L2201 flex 列）自动 4 行。
- **微调窗口（仅当实机目检间距不佳）**：只允许在 r34 块内改间距/行高等视觉微调；**红线** = 零新增 token、零新增 `@keyframes`、areas 结构（`'global global global'`）、`order: 13`、卡化选择器列表行（不进 `.global-stats`）、reduced-motion 规则逐字不动——即 style.css 的任何改动都不得触碰既有规则体。
- 验证：`verify-ui §r34 css 源扫描`（stat-flash 复用/文末块零关键帧/areas 子串/order:13/卡化列表）在 0 行与微调两种情况下均须原样通过。

### 3.3 ui.js（createGlobalStats 去 hi + 五接线点去 hi）

**组件本体**（L1421-1471）：

| 位置 | 改动 |
|---|---|
| doc 注释（L1421-1429） | els 契约 `{ hi, placed, lines, time, games }` → `{ placed, lines, time, games }`；`must()×5` → `×4`；update 载荷说明去掉 `hi?`；新增一句「r35：最高分立镜像删除，最高分单处=#hi-score」 |
| `update(p)`（L1456-1463） | **删除** `if (typeof p.hi === 'number') setNum(els.hi, p.hi)`（现 L1458） |
| `flash/setText/setNum/dispose/return`（L1433-1470） | 逐字不动（受控重复段不抽公共 helper，理由承继 r32/r34） |

**createUI 装配接线**（五处去 hi；dispose L2426 与导出 L2496 保留）：

| 位置 | 改动 |
|---|---|
| 装配（L1551-1559） | 注释 `must()×5` → `×4`；**删除** `hi: must('#gs-hi-value')`（现 L1554） |
| statsUi 定义（L1942） | `{ hi: 0, placed: 0, lines: 0, timeMs: 0, games: 0 }` → `{ placed: 0, lines: 0, timeMs: 0, games: 0 }`；注释去掉 hi 提及 |
| load 初始镜像（L2000-2009） | **删除** `statsUi.hi = persistedHighScore`（现 L2001）；其余四值覆写 + `globalStats.update(statsUi)` 保留 |
| onSnapshot 破纪录（L2118-2126） | 保留 `persistedHighScore = s.score` / `saveHighScore` / `updateHiScoreEl()`（#hi-score 单通道）；**删除** L2123-2125 两行（`statsUi.hi = …` + `globalStats.update({ hi: … })`） |
| onStats 读回（L2142-2155） | **删除** `statsUi.hi = st.highScore`（现 L2147）；`saveStats(delta) → load() → 四值覆写 → globalStats.update(statsUi)` 保留 |

**零死代码验收**：grep `gs-hi|statsUi\.hi|els\.hi|p\.hi` 于 ui.js 应只见注释性提及（doc/注释），无实际赋值/引用（T2 自检 + T6 复核）。

### 3.4 状态管理（数据流不变，最高分单通道化）

```
引擎（game.js 闭包）— 0 行：OVER 定格 / 隐藏·卸载补记 → onStats({placed,lines,timeMs,games})
  ▼  ui.js onStats 回调（唯一接线点，去 hi 后四值透传）
persist.saveStats(delta) → load()      ← 累计唯一事实在 persist 层（不变）
  ▼
statsUi 镜像 { placed, lines, timeMs, games } → globalStats.update()   （只读渲染，不变）
最高分：persistedHighScore ← load / saveHighScore 破纪录 → updateHiScoreEl() → #hi-score（r17 单通道，不变）
```

- **UI 零累计红线不变**：statsUi 仅由 persist 载荷（onStats 读回）覆写；破纪录再也不写 statsUi——最高分与累计四项彻底解耦（累计四项 = persist 唯一事实；最高分 = persistedHighScore 唯一事实，两变量本就同源并存，本次只是删掉 hi 的**第三处镜像**）。
- 低频刷新不变：全局四项仍随入账/补记时点更新，无每秒刷新。

## 4. 关键实现点与边界

1. **删除而非隐藏（AC-1/AC-2 硬约束）**：`#gs-hi` / `#ss-lines` 必须整节点删除；§r35 源码级断言 `indexOf('id="gs-hi"') === -1`、`indexOf('id="ss-lines"') === -1` 拦截 `display:none` 绕过方案。
2. **读屏不丢（R2）**：`#gs-hi-value` 删除后，「最高分」播报 = `#hi-score` 既有 `aria-live="polite"`（index.html L41，r17 冻结）在初值恢复（L2018）与破纪录（L2122）两个时点照常发声；「本局消行」播报 = `#lines` 既有 `aria-live`（L49）不动。去重不删除任何 aria-live 能力，AC-8 人工朗读复核。
3. **断言行数改写边界（R1）**：r32/r34 段中**仅**行数数值断言被改写——verify-ui `.session-stat` 恰 3 → 恰 2（L1147、L1254）、`.global-stat` 恰 5 → 恰 4（L1228），以及随之必须删除的 ss-lines-value/gs-hi-value 专属断言（L1150-1151、five 数组、初值循环、破纪录 hi 对比）；同段其余断言（位置序、隔离 `.stat` 恰 4、css 源扫描、order 10/12/20、卡化列表）逐字不动。
4. **qa-e2e 面板条目同步（AC-2/AC-6 明细）**：§r32 初始/开始/复位断言去 `#ss-lines-value` 子句（三值→两值）、「消行同源」两侧写（同源镜像断言 → 改写为「面板无 #ss-lines，消行唯一显示=#lines」）；§r34 初始五值→四值、`.session-stat` 3→2、「OVER 后 hi 行不变」删除、「破纪录同源」改写为仅 `#hi-score` 断言、六锚点清单→五锚点。r17/r19 及更早断言零改动。
5. **装配锚点一致性**：`#gs-hi-value` 移除须三处同步——ui.js must 装配（L1554）、assembly-check 选择器清单（L56）、qa-e2e 锚点数组（L3442），缺一即装配契约与实际 DOM 漂移（T6 七套全绿拦截）。
6. **style.css 与高度（R4）**：0 行预期下 S 竖屏 mini-grid 4 项 3+1 两行（≈68px）；若实机出现 1 项宽行观感不佳，微调窗口见 §3.2，且不得触碰 areas/order 断言。
7. **git 交织（R3）**：r35 是 r34 中间提交（5ec9a4a）上的增量；任何阶段不得拆散 r34 与 r35 的提交合回；工作区当前干净，仅任务夹 20260904-r35/ 为新未提交内容。
8. **七套出口语义**：verify-game / verify-persist / verify-audio / verify-constants 必须 **git diff 0 行** 且仍全绿（证明去重未横向污染非展示面）；verify-ui / qa-e2e / assembly-check 经改写后全绿（不加后门、不注释断言）。

## 5. 测试策略（改写 + §r35 追加；非展示面脚本 0 行）

| 脚本 | r35 变化 | 挂接 |
|---|---|---|
| `scripts/verify-game.cjs` | **0 行 diff**（onStats/flushTime/键集/soak §r34 全部逐字沿用） | 运行全绿即证明 |
| `scripts/verify-persist.cjs` | **0 行 diff**（saveStats/载荷/兼容 §r34 全部逐字沿用） | 同上 |
| `scripts/verify-audio.cjs` / `scripts/verify-constants.cjs` | **0 行 diff**（audio 0 行；VERSION 三模块一致与 persist 模块版本、PAYLOAD_VERSION 不动） | 同上 |
| `scripts/verify-ui.cjs` | §r32：标题 `3× session-stat`→`2×`（L1143）、L1147 `3`→`2`、**删除** L1150-1151 `ss-lines-value` aria 断言；§r34：标题/断言 `恰 5 行`→`恰 4 行`（L1225/1228）、`five` 数组→`four`（L1229-1232 去 gs-hi-value）、初值循环去 `gs-hi-value`（L1238）、L1252-1254 注释与 `3`→`2`；**文件尾新增 §r35 段**：① 删除证明 `indexOf('id="gs-hi"')===-1`、`indexOf('id="ss-lines"')===-1`；② 单处锚点复核：`#hi-score` 存在且含 `aria-live="polite"`、`#lines` 存在、`#global-stats` 恰 4 行 `.global-stat`、`#session-stats` 恰 2 行；③ css 复核：repeat(3) mini-grid 存在（自适应依据） | 原文改写 + 文件尾追加 |
| `scripts/qa-e2e-jsdom.cjs` | §r32：file:// 初始（L2985-2986）与初始/开始/复位断言（L3003-3008、L3044）去 `ss-lines` 子句、「消行同源」两检查（L3015-3028）改写为「无 #ss-lines + #lines 单处」；§r34：初始五值→四值（L3254-3258）、`.session-stat` 3→2（L3260-3262）、装配初值去 gs-hi（L3299-3300）、删除「OVER 后 hi 行不变」（L3311）、「破纪录同源」改仅 `#hi-score`（L3320-3326）、六锚点→五锚点（L3442-3443）；§r35 追加：DOM 级 `querySelector('#gs-hi-value')===null` 且 `#global-stats` 容器在、`#ss-lines-value` null 且 `#ss-placed-value/#ss-time-value` 在 | 原文改写 + 文件尾追加 |
| `scripts/assembly-check.cjs` | L56 选择器清单去 `'#gs-hi-value'`，注释「六锚点（ui.js must()×5 + 容器）」→「五锚点（ui.js must()×4 + 容器）」；L32 saveStats 契约清单不动 | 单行改写 |
| `docs/teamflow/20260904-r35/` | TECH（本文）定稿 4/2 行契约 + 取代标注；QA-REPORT/ACCEPTANCE 由 QA/产品后续落盘（AC-7） | 本夹产物 |

**红线复核（AC-5/AC-6）**：`git diff` 证明 game.js / persist.js / audio.js / style.css（预期）/ verify-game / verify-persist / verify-audio / verify-constants 0 行；onSfx 事件序列与既有期望恒等；VERSION 与 PAYLOAD_VERSION 不动；r30/r31 及更早断言期望零改动；七套全绿为出口标准。

**人工补测清单（AC-8，P1，留产品验收）**：三态卡片行数目检（横屏双轨 / 竖屏 S 行式 / 桌面 M·L·键鼠：全局恰 4 行、本局恰 2 行，竖屏 S mini-grid 3+1 仍两行无高度回归）；读屏朗读「最高分/消行总数」重复播报消失、`#hi-score`/「消除行数」及四项累计播报正常；双轨/行式下无叠压；r34 补测项复用（真机切后台/清后台/刷新不丢/暂停不计/旧存档迁移）。

## 6. 任务拆分（对齐 PRD §7 里程碑 M1-M4；文件边界互斥可并行）

| 任务 | 里程碑 | 文件 | 规格/验收点 |
|---|---|---|---|
| **T1（M1a）DOM 去重** | M1 | `index.html` | 删 `#ss-lines` 行块（现 L60-63）与 `#gs-hi` 行块（现 L73-76），**删除非隐藏**；两冻结卡（`.stat-grid`、`#session-announce`）与脚本顺序零动；行内注释仅可补 r35 一句 |
| **T2（M1b）UI 去 hi 接线** | M1 | `ui.js` | §3.3 清单：doc 注释、`update()` 去 hi 分支（L1458）、must 装配 ×4（L1554）、statsUi 定义（L1942）、load 初始镜像（L2001）、onSnapshot 破纪录（L2123-2125）、onStats 读回（L2147）；dispose/导出保留；验收= grep 无 `gs-hi|statsUi.hi|els.hi|p.hi` 活引用 |
| **T3（M2a）verify-ui 断言改写** | M2 | `scripts/verify-ui.cjs` | §5 表：§r32 3→2 + 删 ss-lines aria 断言（L1143-1151）；§r34 5→4 + four 数组 + 初值循环 + L1254（L1225-1254）；文件尾 §r35 删除证明/单处锚点/css 自适应段；其余断言逐字不动 |
| **T4（M2b）qa-e2e 面板条目同步** | M2 | `scripts/qa-e2e-jsdom.cjs` | §5 表：§r32/§r34 去 ss-lines/gs-hi 子句、消行同源改写、五值→四值、破纪录改 #hi-score、五锚点；文件尾 §r35 DOM 删除证明；r17/r19 及更早零改动 |
| **T5（M2c）装配锚点收敛** | M2 | `scripts/assembly-check.cjs` | L56 清单去 `'#gs-hi-value'` + 注释六→五锚点/must()×4；L32 契约不动 |
| **T6（M3）回归与文档收口** | M3 | 全量 + 本夹 | 七套全绿；`git diff` 红线证明（game/persist/audio/style.css 及 verify-game/persist/audio/constants 0 行）；本夹 TECH（本文件）/QA-REPORT/ACCEPTANCE 契约落定 4/2 行与取代标注（AC-7） |
| **T7（M4）验收与合回（人工）** | M4 | git | AC-8 人工补测清单 → 产品验收 → **r34+r35 一并**提交到 `feat/global-stats-persistence` 并合回主分支（验收后用户确认步骤，teanflow_merge 决策邀请） |

- **并行序**：T1‖T2（不同文件；语义上 T1 先落地供 T2 装配契约，但无文件冲突可并发）；T3‖T4‖T5（独立文件，且与 M1 可并行——PRD「M2 可与 M1 并行」）；T6 依赖 T1-T5；T7 收口。
- **git 约束（PRD §8，务必备注进 T6/T7）**：分支 `feat/global-stats-persistence`（已检出，**不新建**）；基线=中间提交 5ec9a4a（r34 已实现代码，工作区当前干净）+ 任务夹 `docs/teamflow/20260904-r35/`（PRD 已落，TECH 本文，后续 QA-REPORT/ACCEPTANCE）；r35 变更提交到该分支，**与 r34 一并合回**（验收后用户确认）；红线=引擎/onSfx/audio 0 diff、VERSION 不动、单键增量 PAYLOAD_VERSION=1、禁业务侧直接 setItem/getItem、七套全绿不加后门；memory.md 不更新。

<!-- blueprint -->{"summary":"r35 统计面板去重收口：纯展示面删两行（index.html 删 #gs-hi 与 #ss-lines，删除非隐藏）+ ui.js 去 hi 镜像接线（createGlobalStats els 4 键/update 去 hi 分支，must()×5→×4、statsUi/load/onSnapshot/onStats 五处去 hi，dispose/导出保留，破纪录最高分唯一走 #hi-score）+ style.css 预期 0 行（repeat(3) mini-grid 4 子项自适应 3+1 两行同高）+ 断言原地改写（verify-ui 3→2/5→4+删专属断言、qa-e2e §r32/§r34 面板条目同步、assembly-check 清单去 #gs-hi-value）+ 文件尾 §r35 删除证明段；persist/game/audio/VERSION 与 verify-game/persist/audio/constants 0 行 diff，七套全绿；git=feat/global-stats-persistence 与 r34 一并提交合回。","modules":{"/index.html":{"responsibility":"删除 #gs-hi（L73-76）与 #ss-lines（L60-63）两行 DOM（删除非隐藏），#global-stats 恰 4 行 .global-stat、#session-stats 恰 2 行 .session-stat；#hi-score/#lines 冻结块零动","dependsOn":[],"assemblyOrder":1,"why":"DOM 是装配契约唯一事实源（must()×4 与两条断言脚本镜像它），先删行再改消费侧，避免断言行数先行导致中间态红"},"/ui.js":{"responsibility":"createGlobalStats 去 hi（doc/els/update 分支）+ statsUi 去 hi 字段 + 四接线点去 hi（must 装配、load 初始镜像、onSnapshot 破纪录、onStats 读回）；updateHiScoreEl/#hi-score 单通道与 dispose/导出保留","dependsOn":["/index.html"],"assemblyOrder":2,"why":"最高分第三处镜像（全局卡）属冗余展示，删除接线即回归 r17 单一通道；statsUi 只读镜像 persist 载荷红线不变，累计四项与最高分彻底解耦（分别唯一事实）"},"/style.css":{"responsibility":"预期 0 行 diff：grid-template-columns: repeat(3,minmax(0,1fr)) 下 4 子项自动 3+1 两行（与 r34 3+2 同高 ≈68px）；若有微调仅限 r34 块内间距/行高，零新 token/关键帧，areas/order:13/卡化列表行不动","dependsOn":[],"assemblyOrder":1,"why":"布局网格是声明式的，删子项自动重排无需改 CSS——改动反而触发 arch 断言面（zero-keyframes/order/areas 子串），故以 0 行为默认"},"/scripts/verify-ui.cjs":{"responsibility":"行数断言原地改写（.session-stat 3→2 于 L1147/L1254、.global-stat 5→4 于 L1228）+ 删除 ss-lines/gs-hi 专属断言（L1150-1151/five 数组/初值循环）+ 文件尾 §r35 删除证明与单处锚点段","dependsOn":["/index.html"],"assemblyOrder":3,"why":"断言脚本是 AC-6「断言同步」的主要载体；改写限定行数数值本身（R1），语义断言不触碰；§r35 段用 indexOf===-1 拦截隐藏绕过"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"§r32/§r34 面板条目同步（初始/开始/复位去 ss-lines 与 gs-hi 子句、消行同源改写为 #lines 单处、五值→四值、破纪录断言改 #hi-score、六锚点→五锚点）+ §r35 DOM 删除证明（querySelector null）","dependsOn":["/index.html","/ui.js"],"assemblyOrder":3,"why":"真实装配面验证「删除后行为不变」：入账/补记/刷新恢复/幂等仍走同数据通道，仅面板显示内容收敛"},"/scripts/assembly-check.cjs":{"responsibility":"选择器清单去 '#gs-hi-value'（L56）+ 注释六→五锚点/must()×4；saveStats 契约清单（L32）不动","dependsOn":["/index.html"],"assemblyOrder":3,"why":"装配审计清单与 must()×5 契约同源——镜像一处去一致三处（ui.js/assembly/qa-e2e 锚点数组），防单侧漂移"},"/game.js":{"responsibility":"0 行 diff 红线（onStats/flushTime/幂等/监听全不动）","dependsOn":[],"assemblyOrder":0,"why":"入账口径与数据通道与展示无关，任何触碰都违反 PRD 红线"},"/persist.js":{"responsibility":"0 行 diff 红线（stats 载荷/saveStats/load 逐字）","dependsOn":[],"assemblyOrder":0,"why":"数据模型非目标（PRD §3），去重不改变持久化语义"}},"duplications":["r34 DESIGN 刻意设计声明①「最高分双处同源镜像」= 本次删除的重复本身（作废，不保留镜像）","createGlobalStats 内 flash/setText/setNum 与 createHud/createSessionStats 的受控重复（≤8 行）——保留（抽离须改既有组件违反零改红线，r32/r34 已接受）","镜像漂移风险：ui.js must() 装配、assembly-check 选择器清单、qa-e2e 锚点数组三处共同引用 #gs-hi-value——已随本需求三处同步删除，T6 七套全绿拦截后续漂移","删除后死代码风险：statsUi.hi/els.hi 引用需随删（grep 佐证），避免遗留幽灵字段"],"tasks":[{"title":"T1 M1a index.html 删两行（#gs-hi/#ss-lines，非隐藏）","files":["/index.html"],"spec":"删除 #ss-lines（L60-63）与 #gs-hi（L73-76）整行块，冻结原子零动"},{"title":"T2 M1b ui.js 去 hi 接线（组件+五接线点）","files":["/ui.js"],"spec":"createGlobalStats els 4 键/update 去 hi，must×4、statsUi/load/onSnapshot/onStats 去 hi，grep 无活引用"},{"title":"T3 M2a verify-ui 断言改写+§r35 段","files":["/scripts/verify-ui.cjs"],"spec":"3→2/5→4 原地改写、删专属断言、文件尾删除证明段"},{"title":"T4 M2b qa-e2e 面板条目同步+§r35 段","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"§r32/§r34 去 ss-lines/gs-hi 子句、消行单处改写、五锚点、DOM 删除证明"},{"title":"T5 M2c assembly-check 锚点收敛","files":["/scripts/assembly-check.cjs"],"spec":"选择器清单去 #gs-hi-value、注释五锚点"},{"title":"T6 M3 回归与文档收口","files":[],"spec":"七套全绿+git diff 0 行红线证明+本夹 TECH/QA-REPORT/ACCEPTANCE 契约落定"},{"title":"T7 M4 AC-8 人工补测与 r34+r35 一并提交合回","files":[],"spec":"人工补测→验收→提交 feat/global-stats-persistence 并合回（用户确认）"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r35 技术方案定稿（docs/teamflow/20260904-r35/TECHNICAL.md）：纯展示面删两行——index.html 删 #gs-hi（L73-76）与 #ss-lines（L60-63）删除非隐藏；ui.js createGlobalStats 去 hi（els 4 键、update 去 hi 分支）+ 装配五处去 hi（must×4,L1554 / statsUi,L1942 / load 初始镜像,L2001 / onSnapshot 破纪录,L2123-2125 / onStats 读回,L2147），dispose/导出保留，破纪录最高分唯一走 #hi-score（r17 冻结 aria-live=polite）；style.css 预期 0 行（repeat(3) mini-grid 4 子项自适应 3+1 两行 ≈68px 同高）；断言原地改写（verify-ui .session-stat 3→2 于 L1147/L1254、.global-stat 5→4 于 L1228+删 ss-lines/gs-hi 专属断言；qa-e2e §r32/§r34 面板条目同步；assembly-check L56 清单去 #gs-hi-value 注释五锚点）+ 文件尾 §r35 删除证明段（indexOf('id=\"gs-hi\"')===-1 等）；persist/game/audio/VERSION 与 verify-game/persist/audio/constants 0 行 diff，七套全绿；任务 T1-T7 对齐 M1-M4，git=分支 feat/global-stats-persistence（基线 5ec9a4a）与 r34 一并提交合回，memory.md 不更新。","memory":["行数新契约：.global-stat 恰 4（gs-placed/gs-lines/gs-time/gs-games）、.session-stat 恰 2（ss-placed/ss-time）；#gs-hi/#ss-lines 整节点删除，§r35 断言用 indexOf===-1 证明删除非隐藏","最高分唯一通道=#hi-score（updateHiScoreEl L1946/L2122，r17 冻结 aria-live）；本局消行唯一源=#lines；ui.js 删除 statsUi.hi/els.hi/p.hi 全部活引用（grep 验收）","style.css 预期 0 行：repeat(3) mini-grid 4 子项 3+1 两行与 r34 3+2 同高；微调仅限 r34 块内、零新 token/关键帧、areas/order:13/卡化列表行不动","verify-ui 改写点：L1143/1147/1252-1254 的 3→2、L1225/1228 的 5→4、删 L1150-1151 与 L1229-1241 中 gs-hi/ss-lines 专属断言；qa-e2e 同步 L2985-3080/3254-3443 各条目；assembly L56 去 '#gs-hi-value'","0 行 diff 清单：game.js/persist.js/audio.js/style.css（预期）/verify-game/verify-persist/verify-audio/verify-constants；红线=引擎/onSfx/audio 0 行、VERSION 不动、PAYLOAD_VERSION=1","git：分支 feat/global-stats-persistence（HEAD 5ec9a4a、工作区干净），r35 与 r34 一并提交合回（验收后用户确认）；memory.md 不更新","取代标注：r34 DESIGN 声明①（最高分双处镜像）作废、r32#AC-3 双处并列取消，历史任务夹不改"]}<!-- /state -->