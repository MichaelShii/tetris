<!-- meta: summary="r36 删除整个「本局统计」卡（#session-stats 含已放置/对局时长 + session-announce），信息面板仅保留「对局统计」与「全局统计」两组，同步清除 ui.js 组件接线与 verify-ui/qa-e2e/assembly-check 契约，持久化与红线逐字保持" -->
# PRD — r36 移除整个「本局统计」块（#session-stats 卡）

基线依赖：docs/teamflow/20260904-r35（r35 已合回 main 的既定行为——全局统计卡 4 行、本局统计卡 2 行、全局四项单键持久化——不得回归；本需求在其上做删除收口）
取代：docs/teamflow/20260903-r32-stats-panel#AC-1/#AC-2/#AC-4：整个「本局统计」面板组（已放置方块数 / 对局时长两行 + session-announce 播报）删除，本局实时信息改由 stat-grid（消除行数/分数/等级）与全局统计累计版承担；r35 对 r32#AC-3 的「消行总数行删除（3→2）」进一步升级为整卡移除（2→0）

## 1. 背景与目标

- **背景**：对局进行中，信息面板下方曾有两组卡片——`#global-stats`（全局统计：累计方块/累计消行/累计时长/对局次数，r34 持久化单键、r35 去重 4 行）与 `#session-stats`（本局统计：已放置/对局时长两行，r32 引入、r35 去消行后 2 行）。产品侧确认**本局统计块已冗余**：「已放置」/「对局时长」在全局统计已有累计版兜底；本局实时信息（消行数/分数/等级）已由 stat-grid（`#hi-score`/`#lines` 等）完整承担。用户确认**删除整个 `#session-stats` 卡**（含两行 + `session-announce` 播报），信息面板最终只保留两组：「对局统计」与「全局统计」。
- **目标**：信息面板从三组收敛为**两组**（「对局统计」stat-grid 四块 +「全局统计」global-stats 四行），干净移除 `#session-stats` 整卡及其消费与契约（ui.js 组件接线、verify-ui r32 断言、qa-e2e session 用例、assembly-check 锚点、index.html 节点）；全局统计持久化语义、stat-grid HUD、红线 0-diff 与 VERSION 逐字不变；七套回归零意外。

## 2. 用户故事与验收标准（AC，本夹内从 AC-1 编号）

### U1 信息面板只保留两组
> 作为玩家，我打开游戏时信息面板要清爽：对局实时信息看「对局统计」，累计数据看「全局统计」，不再有一张每局都会重复的「本局统计」卡。

- **AC-1（P0）#session-stats 整卡删除**：`index.html` 删除整个 `#session-stats` DOM 节点（含 `.session-stat` 两行「已放置 `#ss-placed`」/「对局时长 `#ss-time`」与 `session-announce` 播报节点，**删除而非隐藏**）；删除后信息面板**恰两个**面板组：`#stat-grid`（「对局统计」，恰 4 块 `#stat-score`/`#hi-score`/`#stat-level`/`#stat-lines`）与 `#global-stats`（「全局统计」，恰 4 行 `.global-stat`：`#gs-placed`/`#gs-lines`/`#gs-time`/`#gs-games`）。DOM 源序：`#stat-grid` 闭合 < `#global-stats` 开不变（`.session-stats` 不再参与该顺序比较）。

### U2 移除消费与契约
> 作为开发者/QA，删卡后所有读取该卡的代码与断言必须一并清除，不留孤儿。

- **AC-2（P0）ui.js 组件与接线全清**：删除 `createSessionStats` 组件及其全部接线点——组件定义、创建/实例化处、每次渲染调用（update 分支）、必需依赖（must ×N）、statsUi 装配、`dispose()` 清理、模块导出（`api.sessionStats` 若存在）；全局统计接线（createGlobalStats 及其 4 行渲染、load 镜像、破纪录、onStats 读回、`#gs-*` 更新）**保留不动**。脚本断言：ui.js 无残留 `sessionStats` 引用/创建调用，`#session-stats`/`.session-stat` 字符不在 ui.js 中出现。
- **AC-3（P0）verify-ui r32 段断言删除**：verify-ui §r32 段中所有 `#session-stats`/`.session-stat` 断言（含行数、aria-live、值规格）**删除**，其余断言（`#stat-grid` 内 `.stat` 恰 4、`#global-stats` 恰 4 行、`#stat-score`/`#hi-score`/`#stat-level`/`#stat-lines` 命中、隔离顺序）逐字保留零改动。
- **AC-4（P0）qa-e2e-jsdom session 用例删除**：`#session-stats` 相关用例（面板快照断言、已放置/对局时长值断言、session-announce 播报断言、面板布局断言）**删除**，其余用例（stat-grid、global-stats 4 行、持久化刷新不丢）保留零改动。
- **AC-5（P0）assembly-check 锚点删除**：assembler 选择器清单中 `#session-stats`/`.session-stat`/`session-announce` 相关锚点**移除**，既有 `#stat-grid`/`#global-stats` 锚点与自包含审计（无外部依赖、音频文件审计）逐字保持。

### U3 红线与语义保持
> 作为玩家，删卡不丢任何数据：累计数据照旧跨局保存，对局实时信息照旧显示，计分/音效/引擎行为死认不动。

- **AC-6（P0）全局统计持久化语义逐字不变**：累计方块/累计消行/累计时长（毫秒整型）/对局次数与 highScore 同级持久化到 persist.js **单键** stats 载荷（PAYLOAD_VERSION=1 纯增量、saveStats 只增不减、清洗/降级/旧载荷兼容不变）；入账口径（OVER 定格出生碰撞/lose 双入口恰一次、幂等 + 隐藏/卸载补记幂等 + 暂停不计时长 + 刷新不丢）与 onStats 事件出口全部与 r35 一致。verify-persist / verify-game 用例**逐字沿用零改动**（本需求不触 game.js 入账/补记通道与 persist.js 载荷）。
- **AC-7（P0）stat-grid HUD 零改动**：`#stat-score`（分数）/`#hi-score`（最高分，破纪录播报机制保留）/`#stat-level`（等级）/`#stat-lines`（消除行数，本局唯一计数源）四块的 ID、DOM 结构、`stat__value` 命中关系与装配正例**零变化**；本局实时信息由此四块完整承担（读屏能力不丢失）。
- **AC-8（P0）红线 0 diff**：`game.js` 引擎逻辑 0 行、`audio.js` 0 行、`persist.js` 展示面外（stats 载荷结构、saveStats、load）0 行；onSfx 事件面（序列与次数）0 变化；VERSION 三模块（game/ui/audio=2.3.0）与 persist 模块版本、PAYLOAD_VERSION 全不动。脚本断言：verify-audio / verify-constants 0 行 diff 保持。

### U4 回归与文档
> 作为 QA/产品，删卡后所有断言与文档一致、全量绿色、历史工件不回溯改动。

- **AC-9（P0）七套全绿零回归**：verify-game / verify-audio / verify-ui / verify-persist / verify-constants / assembly-check / qa-e2e-jsdom 七套**全绿**；其中 verify-ui / qa-e2e / assembly-check 仅执行上述**删除**（AC-3/4/5），无任何新增或改写其他断言；verify-game / verify-audio / verify-persist / verify-constants 0 行 diff；旧期望零改动、无后门。
- **AC-10（P0）文档契约同步**：r36 任务夹产物（TECHNICAL/QA-REPORT/ACCEPTANCE）落定「信息面板恰两组（stat-grid 四块 + global-stats 四行）、#session-stats 整卡删除、session-announce 移除、全局持久化单键不变」契约；历史任务夹文档不修改（取代语义见本 PRD 头部）。

- **AC-11（P1）人工补测清单（留产品验收）**：真机横屏双轨 / 竖屏 S 行式 / 桌面（M/L/键鼠）三态信息面板两组布局目检（「对局统计」四块 +「全局统计」四行，无第三组、无叠压、S 竖屏 mini-grid 高度无回归）；读屏朗读确认「本局统计」相关播报（session-announce）消失、两组数据播报（分数/最高分/等级/消除行数 + 全局四项）正常；r34/r35 补测项（真机切后台/清后台/刷新不丢/暂停不计/旧存档迁移/读屏/双轨竖屏叠压）复用不回归。

## 3. 范围与非目标

- **范围**：`index.html`（删 `#session-stats` 整卡节点 + session-announce）+ `ui.js`（删 createSessionStats 组件与全部接线，保留 global-stats）+ `style.css`（如含 `.session-stats`/`.session-stat` 相关规则则移除、两面板布局微调，不新增 token/关键帧）+ verify-ui / qa-e2e-jsdom / assembly-check（删除 session 相关断言/用例/锚点）+ 任务夹文档契约。
- **非目标**：不改全局统计持久化模型与 saveStats 契约（四项照旧）；不动引擎/audio/persist（0 diff）；不升 VERSION；不新建面板或额外统计项；不做删卡外的视觉/布局重构（四档布局规则、S 竖屏 areas 结构、横屏自包含卡、`#stat-grid`/`#global-stats` 均保持）；不改 r24~r31 / r32 / r34 / r35 其余冻结语义（触控回放器、TOUCH_KEYS、行式底栏、断点、自定义按键等）；除 `#session-stats` 及关联消费外不新增也不删除任何其他 DOM；不动 memory.md（无新团队约定，本次删除属需求演进）。

## 4. 交互流程摘要

- 对局流程零变化：消除/计分/等级/时长计数的数据通道与 r35 完全一致；全局四项仍随入账/补记时点低频刷新（无每秒刷新）。
- 仅展示变化：信息面板从三组收敛为两组（stat-grid 四块 + global-stats 四行），`#session-stats` 整卡（含 session-announce）从 DOM 与代码中移除；破纪录 hi 闪动仍走 `#hi-score` 既有路径；本局实时消行仍由「消除行数」`#stat-lines` 唯一承担。

## 5. 优先级

- P0：AC-1 ~ AC-10（删除实现 + 消费/契约清除 + 红线/持久化保持 + 七套回归 + 文档同步）
- P1：AC-11（人工补测清单，产品验收）

## 6. 依赖与风险

- **依赖**：当前 main（r34+r35 已合回，全局统计 4 行 / 本局统计 2 行）为唯一基线；无其他迭代外依赖。
- **风险 R1**：`#session-stats` 为 r32 冻结契约断言，删除时可能误伤同段其他断言 → 仅执行删除，`#stat-grid`/`#global-stats` 相关断言逐字保留，AC-3/4/5/9 复核。
- **风险 R2**：ui.js 删除 createSessionStats 时遗留孤儿引用（must/渲染/dispose/导出）→ AC-2 源码级断言（ui.js 无 sessionStats 字符残留）。
- **风险 R3**：跨档位布局回归（删卡后两组是否安全、S 竖屏 mini-grid 高度）→ AC-1/AC-11 布局目检与实机复核。
- **风险 R4**：读屏丢「本局」信息 → 本局实时由 stat-grid 四块完整承担（消行/分数/等级/最高分），AC-7 + AC-11 读屏复核；全局累计仍在「全局统计」可见，无信息缺口。

## 7. 里程碑建议

- **M1** 展示与 UI 拆除：index.html 删 `#session-stats` 节点 + style.css 清理 + ui.js 删 createSessionStats 组件与全部接线（T1）。
- **M2** 契约/断言清除：verify-ui §r32、qa-e2e、assembly-check 删 session 相关条目（T2，可与 M1 并行）。
- **M3** 回归与文档：七套全绿复核 + 红线 0-diff（game/audio/persist/VERSION）+ 任务夹 TECHNICAL/QA-REPORT/ACCEPTANCE 契约落定（T3）。
- **M4** 验收与合回：AC-11 人工补测 → 产品验收 → 提交/合回（按验收后用户确认步骤执行）。

## 8. 工程约束（照原文保留）

- **基线**：当前分支 main（HEAD 7f7e827，已合回 r34+r35 的既定行为——全局统计 4 行、本局统计 2 行），在其上做增量删除。（raw 需求未给予分支名；按产品约定若需另立分支由开发/host 确认，禁止在 main 上混入超出本需求的无关改动。）
- **工作区现状**：main 分支，未提交改动仅 host 预建的任务夹 `docs/teamflow/20260904-r36/`（本 PRD 落盘于此，随实现一并提交）；任务夹建后不可变、不归档不升版；历史任务夹（r32/r34/r35 等）保持不可变不回溯。
- **提交时机**：本需求（删除收口）开发完成即提交；合回/发布动作按验收后用户确认步骤执行（不做未确认的合回/发版）。
- **红线保持**：`game.js` / `audio.js` / `persist.js` 0 行 diff、onSfx 事件面 0 变化、VERSION 三模块不动（2.3.0）、持久化单键增量（PAYLOAD_VERSION=1）、禁业务侧直接 setItem/getItem；验证出口 = 七套脚本全绿（不加后门）。

<!-- state -->{"phase":"prd","summary":"r36 移除整个「本局统计」块定稿（AC-1~11，P0=AC-1~10、P1=AC-11）：删除 #session-stats 整卡（已放置 #ss-placed/对局时长 #ss-time + session-announce 播报），信息面板仅保留「对局统计」（stat-grid 四块：分数/最高分/等级/消除行数）与「全局统计」（global-stats 四行）；同步清除 ui.js createSessionStats 组件与全部接线（保留 global-stats 接线）、verify-ui §r32 #session-stats/.session-stat 断言、qa-e2e session 用例、assembly-check 锚点、index.html #session-stats 节点；全局统计单键持久化（PAYLOAD_VERSION=1/saveStats 只增不减/入账补记幂等/暂停不计/刷新不丢）逐字不变，stat-grid 与 #hi-score 零改动，红线 game/audio/persist 0 行 + VERSION 不动（2.3.0），七套全绿；取代 r32#AC-1/AC-2/AC-4 面板组 + r35 对 r32#AC-3 的删行演升为整卡移除（2→0）；基线=当前 main（r34+r35 已合回、HEAD 7f7e827、工作区仅 untracked r36 夹），raw 未给分支名，按约定若需另立分支由开发/host 确认。","memory":["r36 面板契约：信息面板恰两组——#stat-grid（对局统计，stat-score/hi-score/stat-level/stat-lines 四块）与 #global-stats（全局统计，gs-placed/gs-lines/gs-time/gs-games 四行）；#session-stats 整卡删除（含 ss-placed/ss-time/session-announce），DOM 源序仅 stat-grid < global-stats","取代锚点：r32#AC-1/#AC-2/#AC-4 本局统计面板组（已放置/对局时长+播报）删除；r35 的 session 卡 3→2 演升为 r36 整卡 2→0（r35#AC-2 行数契约随整卡移除作废）；r35 全局卡 4 行契约保留","删除面：index.html #session-stats 节点 + ui.js createSessionStats 组件及全部接线（must/渲染/dispose/导出）+ style.css 相关规则；保留 global-stats 全部接线。global-stats 持久化（单键 stats/PAYLOAD_VERSION=1/saveStats 只增不减/入账补记幂等）与 stat-grid/#hi-score 零改动","红线：game.js/audio.js/persist.js 0 行、onSfx 0 变化、VERSION 三模块 2.3.0 不动；verify-ui/qa-e2e/assembly-check 仅删 session 断言/用例/锚点，其余逐字保留；七套全绿；verify-game/verify-audio/verify-persist/verify-constants 0 行","git：基线=main（HEAD 7f7e827、r34+r35 已合回），工作区仅 untracked docs/teamflow/20260904-r36/；raw 未给分支名，按约定若需另立分支由开发/host 确认；提交后合回/发版待验收后用户确认；memory.md 不更新（无新团队约定）"],"acIndex":{"AC-1":"P0 删 #session-stats 整卡（含已放置/对局时长两行+session-announce，删除非隐藏），信息面板恰两组（stat-grid 四块+global-stats 四行），源序 stat-grid < global-stats","AC-2":"P0 ui.js 删 createSessionStats 组件与全部接线（创建/渲染/must/statsUi/dispose/导出），global-stats 接线保留，ui.js 无 sessionStats 字符残留","AC-3":"P0 verify-ui §r32 段 #session-stats/.session-stat 断言删除，其余（stat-grid 四块/global-stats 四行/隔离序）逐字保留","AC-4":"P0 qa-e2e session 用例删除（面板快照/值/播报/布局），stat-grid/global-stats/持久化用例零改动","AC-5":"P0 assembly-check 删 #session-stats/.session-stat/session-announce 锚点，其余自包含审计与全局锚点保留","AC-6":"P0 全局统计持久化语义逐字不变（单键 stats/PAYLOAD_VERSION=1/saveStats 只增不减/入账补记幂等/暂停不计/刷新不丢），verify-persist/verify-game 逐字沿用","AC-7":"P0 stat-grid 四块（分数/最高分/等级/消除行数）与 #hi-score 破纪录播报零改动，本局实时信息由其完整承担","AC-8":"P0 红线 game/audio/persist 0 行、onSfx 0 变化、VERSION 三模块 2.3.0 与 PAYLOAD_VERSION 不动","AC-9":"P0 七套全绿零回归；verify-ui/qa-e2e/assembly 仅删 session 条目，verify-game/audio/persist/constants 0 行，旧期望零改动无后门","AC-10":"P0 文档契约同步：r36 任务夹落定两组面板与 #session-stats 整卡删除语义，历史夹不改","AC-11":"P1 人工补测清单（三态两组布局目检/读屏本局播报消失+两组数据正常/叠压/r34~r35 补测项复用不回归）留产品验收"},"summary":"信息面板从三组收敛为两组：删除整个「本局统计」卡（已放置/对局时长+播报），保留「对局统计」四块与「全局统计」四行，全局持久化与红线逐字保持","techStack":"扁平纯 JS（game.js/audio.js/ui.js/persist.js/index.html/style.css，UMD），零构建，七套 node 脚本验证"}
