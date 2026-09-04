<!-- meta: summary="r35 统计面板方案3去重收口：移除全局卡最高分镜像行与本局卡消行总数行，卡片缩为 4/2 行，同步 verify-ui 断言与文档契约，r34 持久化与入账语义零变化。" -->
# PRD — r35 统计面板去重收口（方案3）

基线依赖：docs/teamflow/20260904-r34-global-stats-persistence（r34 已实现中间提交 5ec9a4a 的行为——单键持久化、入账口径、红线——不得回归，本需求在其上做增量展示面收口）
取代：docs/teamflow/20260904-r34-global-stats-persistence#AC-8：全局组首行「最高分」镜像行删除（.global-stat 恰 5 → 恰 4），最高分回归 .stat-grid #hi-score 单处显示，r34 DESIGN 刻意设计声明①（双处同源镜像）随之作废
取代：docs/teamflow/20260903-r32-stats-panel#AC-3：本局组「消行总数」行删除（.session-stat 恰 3 → 恰 2），取消双处同值并列展示，消行计数源语义保留（stat-grid「消除行数」唯一承担）

## 1. 背景与目标

- **背景**：r34（全局统计持久化，分支 feat/global-stats-persistence 中间提交 5ec9a4a）已实现统计面板全局化——第三卡 `#global-stats` 恰 5 行（最高分镜像 + 累计方块/消行/时长/次数）、本局面板 `#session-stats` 恰 3 行（已放置/消行总数/对局时长）。QA 已就绪（七套全绿 + 对抗抽查 57/57），但产品侧确认存在重复展示：①全局卡首行「最高分」与 stat-grid `#hi-score` 双处同源；②本局卡「消行总数」与 stat-grid「消除行数」双处同值。用户已确认按**方案3**一并去重收口：删两行重复，各指标回归单一显示源，r34 其余语义与持久化不变。
- **目标**：展示面去重（5→4 / 3→2），断言与文档契约同步，七套回归零意外，r34 持久化/入账/红线语义逐字保持，收口后 r34+r35 一并合回主分支。

## 2. 用户故事与验收标准（AC，本夹内从 AC-1 编号）

### U1 全局统计卡去掉「最高分」镜像行
> 作为玩家，我在全局统计卡里只关心四项累计；最高分已在原信息面板显示过，重复一栏没有意义。

- **AC-1（P0）全局卡去重 5→4**：`#global-stats` 删除首行 `#gs-hi`（最高分镜像）DOM 节点（**删除而非隐藏**），卡片仅保留 4 行 `.global-stat`：累计方块（`#gs-placed`）/ 累计消行（`#gs-lines`）/ 累计时长（`#gs-time`）/ 对局次数（`#gs-games`）；最高分唯一显示于 stat-grid 原块 `#hi-score`（r17 冻结块，零改动）。脚本断言：verify-ui §r34 节点契约「恰 5 行 .global-stat」改写为**恰 4 行**，`#gs-hi-value` 锚点从 assembly-check 选择器清单移除、从 qa-e2e 面板断言移除；剩余 4 个 `output` 的 `aria-live=polite`/完整 `aria-label` 保留；破纪录 hi 的读屏播报由 `#hi-score` 既有机制完整承担（读屏能力不丢失）。

### U2 本局统计面板去掉「消行总数」行
> 作为玩家，本局消行已由信息面板的「消除行数」实时显示，统计面板再列一行是重复。

- **AC-2（P0）本局卡去重 3→2**：`#session-stats` 删除「消行总数」行（`.session-stat`），卡片仅保留 2 行：已放置（`#ss-placed`）/ 对局时长（`#ss-time`）；本局消行由 stat-grid「消除行数」（`#lines`，r32 单一计数源）唯一承担，r32 AC-3 的「同值」语义因单处显示而平凡保持。脚本断言：verify-ui §r32 冻结断言「.session-stat 恰 3」**显式改写为恰 2**（属 r35 取代项，非零改动红线冲突）；qa-e2e §r32/§r34 涉及 session-stats 的条目同步更新；时间格式（`mm:ss` / `hh:mm:ss`）与已放置计数语义不动。

### U3 去重只动展示面，持久化与入账语义零变化
> 作为玩家，我的累计数据（方块/消行/时长/盘数）与最高分一样跨局保存，去重不丢任何数据。

- **AC-3（P0）全局四项持久化语义不变**：累计已放置方块数、累计消行总数、累计游戏时长（毫秒整型）、对局次数与 highScore 同级持久化到 persist.js **单键** stats 载荷（PAYLOAD_VERSION=1 纯增量，saveStats 出口只增不减、清洗/降级行为不变）；verify-persist 全部用例（roundtrip、清洗、只增不减、降级、旧载荷兼容、saveStats 后 saveHighScore/saveSettings 保留 stats）**逐字沿用零改动**。
- **AC-4（P0）入账口径不变**：OVER 定格入账（出生碰撞/lose 双入口恰一次、幂等）+ 隐藏/卸载补记（pagehide/beforeunload + visibilitychange 先补记后暂停、幂等）+ 暂停不计时长 + 中途刷新不丢，全部与 r34 一致；去重不触碰 game.js 入账/补记通道与 onStats 事件出口，verify-game §r34 用例逐字沿用零改动。
- **AC-5（P0）红线 0 diff**：game.js 引擎逻辑 0 行、onSfx 事件面（事件序列与次数）0 变化、audio.js 0 行、VERSION 三模块（game/ui/audio=2.3.0）与 persist 模块版本、PAYLOAD_VERSION 均不动；persist.js 展示面外（stats 载荷结构、saveStats、load）0 行改动。脚本断言：verify-audio / verify-constants 0 行 diff 保持。

### U4 断言与文档契约同步、全量回归
> 作为开发者/QA，删行后所有断言与文档描述必须与真实 UI 一致。

- **AC-6（P0）断言同步 3→2 / 5→4 + 七套全绿零回归**：verify-ui 的 `.session-stat` 3→2、`.global-stat` 5→4 断言原地改写，位置序与隔离断言保留（`#session-stats` 闭合 < `#global-stats` 开 < `.hold-well` 开不变、`.stat-grid` 内 `.stat` 仍恰 4）；qa-e2e 面板快照减项同步。verify-game / verify-audio / verify-persist / verify-constants / assembly-check / qa-e2e-jsdom 七套**全绿**；r30/r31 及更早断言期望零改动；r32/r34 段中仅被本需求取代的行数断言按新契约改写，其余逐字不动。
- **AC-7（P0）文档契约同步**：r35 任务夹产物（TECHNICAL/QA-REPORT/ACCEPTANCE）落定新行数契约（`.global-stat` 恰 4、`.session-stat` 恰 2、最高分单处显示），并显式标注取代 r34 DESIGN 刻意设计声明① 与 r32 AC-3 双处并列表述；历史任务夹文档不修改（取代语义见本 PRD 头部）。

- **AC-8（P1）人工补测清单（留产品验收）**：真机横屏双轨 / 竖屏 S 行式 / 桌面（M/L/键鼠）三态卡片行数目检（全局 4 行、本局 2 行，竖屏 S mini-grid 仍 2 行无高度回归）；读屏朗读确认「最高分/消行总数」重复播报消失、四项累计与 `#hi-score`/「消除行数」播报正常；双轨/行式下无叠压；r34 补测项（真机切后台/清后台/刷新不丢/暂停不计/旧存档迁移）复用不回归。

## 3. 范围与非目标

- **范围**：`index.html`（删 `#gs-hi` 行、`#session-stats` 消行总数行）+ `style.css`（4/2 行布局微调，不新增 token/关键帧）+ `ui.js`（createGlobalStats 去 hi 镜像接线，其余三接线点保留；session-stats 渲染去消行）+ verify-ui/qa-e2e/assembly-check 断言同步 + 任务夹文档契约。
- **非目标**：不改持久化数据模型与 saveStats 契约（四项照旧）；不动引擎与 onSfx；不升 VERSION；不做除删行外的任何视觉/布局重构（四档布局规则、S 竖屏 areas 结构、横屏自包含卡均保持）；不改 r30/r31 冻结语义（触控回放器、TOUCH_KEYS、行式底栏）；不新增也未删除除两行外的任何 DOM；不动 memory.md（无新团队约定）。

## 4. 交互流程摘要

- 对局流程零变化：落定/消行/时长计数的数据通道与 r34 完全一致；全局四项仍随入账/补记时点低频刷新（无每秒刷新）。
- 仅展示变化：全局卡 5 行→4 行（最高分仅见信息面板），本局卡 3 行→2 行（消行仅见「消除行数」）；破纪录 hi 闪动仍走 `#hi-score` 既有路径。

## 5. 优先级

- P0：AC-1 ~ AC-7（去重实现 + 断言/文档同步 + 七套回归）
- P1：AC-8（人工补测清单，产品验收）

## 6. 依赖与风险

- **依赖**：r34 已实现代码（中间提交 5ec9a4a）为唯一基线；无其他迭代外依赖。
- **风险 R1**：`.session-stat` 恰 3 为 r17/r32 冻结契约断言，改写可能误伤同段其他断言 → 改写限定行数数值本身，语义断言（同值/单一计数源）不触碰，AC-6 复核。
- **风险 R2**：删除 `#gs-hi` 后读屏丢「最高分」播报 → `#hi-score` 既有 aria-live 机制完整承担，AC-1/AC-8 验证。
- **风险 R3**：与未合回的 r34 中间提交交织 → r35 变更与 r34 一并提交、一并合回，ACCEPTANCE 通过后按合回流程执行，避免中途拆散提交。
- **风险 R4**：S 竖屏 mini-grid 4 项仍 2 行（3+1），高度预算与 r34（3+2）同为两行 ≈68px 无回归，实机复核（AC-8）。

## 7. 里程碑建议

- **M1** 展示面去重：index.html/style.css/ui.js 删两行、去 hi 镜像接线（T1）。
- **M2** 断言同步：verify-ui（3→2/5→4）、qa-e2e、assembly-check 选择器清单（T2，可与 M1 并行）。
- **M3** 回归与文档：七套全绿复核 + 任务夹 TECHNICAL/QA-REPORT/ACCEPTANCE 契约落定（T3）。
- **M4** 验收与合回：AC-8 人工补测 → 产品验收 → r34+r35 一并合回主分支（用户确认步骤）。

## 8. 工程约束（照原文保留）

- **基线**：基线 = 当前 feat/global-stats-persistence 分支上 r34 已实现代码（中间提交），在其上做增量调整。（不新建分支。）
- **工作区现状**：当前工作区干净（无未提交改动）；任务夹 `docs/teamflow/20260904-r35/` 由 host 创建（本 PRD 落盘于此），随实现一并提交；r34 任务夹保持不可变，不归档不升版。
- **提交时机**：r34 中间提交与方案 3 去重收口（本需求变更）一并合回；r35 开发完成即提交到 feat/global-stats-persistence，合回为主分支的验收后用户确认步骤。
- **红线保持**：引擎/onSfx/audio 0 diff、VERSION 三模块不动、持久化单键增量（PAYLOAD_VERSION=1）、禁业务侧直接 setItem/getItem；验证出口 = 七套脚本全绿（不加后门）。

<!-- state -->{"phase":"prd","summary":"r35 统计面板方案3去重收口定稿（AC-1~8，P0=AC-1~7、P1=AC-8）：全局卡删最高分镜像行 5→4、本局卡删消行总数行 3→2，最高分/本局消行各回归 stat-grid 单处显示；r34 持久化（单键 stats/PAYLOAD_VERSION=1/saveStats 只增不减）、入账口径（OVER 定格+隐藏补记幂等+暂停不计+刷新不丢）、红线（引擎/onSfx/audio 0 行、VERSION 不动）逐字不变；verify-ui 断言 3→2/5→4 原地改写，七套全绿；取代 r34#AC-8（DESIGN 刻意声明① 作废）+ r32#AC-3 双处并列；基线=feat/global-stats-persistence 中间提交 5ec9a4a，不新建分支，与 r34 一并合回；非目标含不改数据模型/不做删行外重构/不动 memory.md。","memory":["r35 行数新契约：.global-stat 恰 4（gs-placed/gs-lines/gs-time/gs-games，删除 #gs-hi）、.session-stat 恰 2（ss-placed/ss-time，删除消行总数行）；最高分回归 #hi-score、本局消行回归 stat-grid 消除行数，各单一显示源","取代锚点：r34#AC-8 面板两组展示（全球卡 5 行结构）、r34 DESIGN 刻意设计声明① 最高分双处镜像、r32#AC-3 消行双处同值并列；r17/r32 冻结断言 .session-stat 恰 3 属本次显式改写","去重纯展示面：persist.js 载荷/PAYLOAD_VERSION=1 不变、saveStats 契约不变、game.js 入账补记与 onStats 不变、VERSION 不动；verify-persist/verify-game §r34 用例逐字沿用","git：分支 feat/global-stats-persistence（HEAD 5ec9a4a 中间提交、工作区干净），基线=该分支 r34 已实现代码增量调整，不新建分支，r35 变更与 r34 一并提交合回","memory.md 不更新（r35 无新团队约定/技术栈决策，持久化约定行 r34 已写）"],"acIndex":{"AC-1":"P0 全局卡去重 5→4（删 #gs-hi DOM 节点非隐藏，最高分唯一于 #hi-score；断言恰 4 行、#gs-hi-value 锚点移除、读屏不丢）","AC-2":"P0 本局卡去重 3→2（删消行总数行，已放置/对局时长保留；消行由 stat-grid 消除行数唯一承担；.session-stat 断言显式改恰 2）","AC-3":"P0 全局四项持久化语义不变（单键 stats、PAYLOAD_VERSION=1、saveStats 只增不减，verify-persist 逐字沿用）","AC-4":"P0 入账口径不变（OVER 定格/隐藏卸载补记幂等/暂停不计/刷新不丢，verify-game §r34 逐字沿用）","AC-5":"P0 红线：引擎/onSfx/audio 0 行、VERSION 不动、persist 展示面外 0 行","AC-6":"P0 断言同步（.session-stat 3→2、.global-stat 5→4 原地改写）+ 七套全绿零回归，被取代行数断言外旧期望零改动","AC-7":"P0 文档契约同步：r35 任务夹落定 4/2 行与最高分单处语义，取代标注 r34 声明①/r32 AC-3，历史夹不改","AC-8":"P1 人工补测清单（三态行数目检、读屏重复播报消失、叠压、r34 补测项复用）留产品验收"},"summary":"统计面板去重收口：全局卡与局内卡各去一条重复行（5→4/3→2），数据语义、持久化与红线逐字保持 r34","techStack":"扁平纯 JS（game.js/audio.js/ui.js/persist.js/index.html/style.css，UMD），零构建，七套 node 脚本验证"}