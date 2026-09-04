# ACCEPTANCE — r35 统计面板去重收口（方案3）

> 基线依赖：docs/teamflow/20260904-r34-global-stats-persistence（r34 中间提交 5ec9a4a 行为不得回归）
> 取代：r34#AC-8 全局组「最高分」镜像行（r34 DESIGN 刻意设计声明① 作废）；r32#AC-3 本局组「消行总数」双处并列
> 验收依据：本夹 PRD.md AC-1~8（P0=AC-1~7、P1=AC-8）+ TECHNICAL.md（M1-M4 蓝图）+ QA-REPORT.md（执行证据）；验收侧独立复跑七套脚本与红线核对（本轮执行）

## 1. 交付范围与本轮新契约

- **展示面收敛（纯删除非隐藏）**：`#global-stats` 删首行 `#gs-hi`（.global-stat 5→4）、`#session-stats` 删「消行总数」行（.session-stat 3→2）。
- **单处显示契约**：最高分唯一于 `#hi-score`（r17 冻结块，aria-live=polite 读屏承接）；本局消行唯一于 `#lines`（r32 单一计数源）。
- **数据面零变化**：persist.js 单键 stats / PAYLOAD_VERSION=1 / saveStats 只增不减逐字不变；game.js 入账/补记/onStats/幂等逐字不变；audio.js 与 VERSION 不动。
- **改动面收敛**：仅 index.html、ui.js、scripts/{verify-ui,qa-e2e-jsdom,assembly-check}.cjs 5 个目标文件（git diff --stat 实证，无越界）。

## 2. AC 逐条核对表

| AC | 级别 | 结论 | 证据 |
|---|---|---|---|
| AC-1 全局卡去重 5→4（删 #gs-hi 非隐藏，最高分唯一 #hi-score，读屏不丢） | P0 | ✅ 通过 | 验收侧：index.html 全文 gs-hi 零匹配、.global-stat 恰 4、#hi-score 恰 1；verify-ui §r34「恰 4」+ §r35 删除证明（id="gs-hi-value" indexOf===-1）；qa-e2e #gs-hi querySelector null + #hi-score 单通道 |
| AC-2 本局卡去重 3→2（删消行行，消行唯一 #lines） | P0 | ✅ 通过 | 验收侧：index.html 全文 ss-lines 零匹配、.session-stat 恰 2、#lines 恰 1；verify-ui §r32「恰 2」+ §r35 删除证明；qa-e2e 消行唯一 #lines |
| AC-3 全局四项持久化语义不变 | P0 | ✅ 通过 | verify-persist 30/30（验收复跑）；persist.js 0 行 diff；qa-e2e §r34 入账/复原始全绿 |
| AC-4 入账口径不变（OVER 定格/补记幂等/暂停不计/刷新不丢） | P0 | ✅ 通过 | verify-game 157/157（验收复跑）；game.js 0 行 diff；qa-e2e 行为段全绿（数据通道不变证据） |
| AC-5 红线 0 diff | P0 | ✅ 通过 | 验收侧 git diff --stat：game/persist/audio/style.css + verify-game/persist/audio/constants 8 文件 0 行（空输出）；VERSION 三模块 2.3.0、PAYLOAD_VERSION=1 不动 |
| AC-6 断言同步 3→2/5→4 + 七套全绿零回归 | P0 | ✅ 通过 | verify-ui L1143/1147（r32 2×）、L1224/1227（r34 恰 4）、L1293~1305（§r35 证明段）；七套全绿（§3） |
| AC-7 文档契约同步（4/2 行 + 取代标注） | P0 | ✅ 通过 | 本夹 TECHNICAL/QA-REPORT/本 ACCEPTANCE 落定 .global-stat 恰 4、.session-stat 恰 2、最高分单处，取代声明见头部；历史夹未动 |
| AC-8 人工补测清单 | P1 | ✅ 通过（代码级） | QA T7 七套复跑全绿 + ac8-manual-mirror 24/24；三态行数/读屏去重/无叠压/r34 补测复用均有镜像证据；真机目检与读屏实听 2 项列入发布前人工复核（§5） |

## 3. 验收侧独立复核（本轮执行）

- **七套全绿复跑**（输出 logs/teamflow/tf-mtmolsed-g3wrou/acceptance-*.log）：verify-game 157/157、verify-audio 24/24、verify-ui 69/69、verify-constants 2/2、verify-persist 30/30、assembly-check ALL CHECKS PASSED、qa-e2e-jsdom 613/613（378/378 为前段分节合计，终值为 613/613）。
- **红线实证**：8 个冻结文件 git diff 为空；总体 diff 仅 5 个目标文件（+143/-88），无越界改动。
- **文件级抽查**：index.html gs-hi/ss-lines 零残留；ui.js 无 gs-hi/ss-lines/statsUi.hi/els.hi/p.hi 活引用（唯一命中为 L1346 注释史注）；verify-ui §r35 删除证明段在档。

## 4. M3 架构一致性检查

- **蓝图（M1-M4）遵循**：M1a 删行 → M1b ui.js 消费侧收敛（组件 els 4 键/五接线点去 hi + session 卡 lines 消费删除）→ M2 断言原地改写 → M3 回归 + M4 补测，装配顺序与任务拆分一致。
- **无重复实现/无隐藏式绕过**：两行均为整节点删除（非改为隐藏/注释），消费侧同步拆除，无 #gs-hi/#ss-lines 任何活引用 = 无 adapter drift。
- **抽象完整性**：saveStats 唯一事实源仍收敛 persist.js，无重复存储封装；持久化/入账通道 0 行改动，红线完整。
- **结论**：结构层面无返工项，与蓝图一致。

## 5. 意见与遗留（非阻塞）

- **[P3 文档级观察] TECHNICAL §1.2 散文计数「仅四处函数内新增」未含 saveHighScore/saveSettings 各 +1 行 stats 保全**：dev 已披露；verify-persist 混合保留用例（saveStats 后两函数保留 stats）双向锁定行为，实测全绿且 persist.js 0 行 diff 不受影响；任务夹不可变，不作返工件，仅记观察供后续文档引用。
- **[P1 人工复核] AC-8 真机目检（三态卡行数含竖屏 S mini-grid 2 行高度无回归）与读屏实听**：代码级证据齐备（24/24 + 七套全绿），合回前由用户真机确认。
- **[合回] 验收通过后，r34（5ec9a4a）+ r35 变更一并提交并合回主分支**：由 host 征得用户确认后执行（本阶段不 commit/merge）；memory.md 按约定不更新（r35 无新团队约定）。

## 6. 交付状态（git）

- 分支 `feat/global-stats-persistence`（未新建分支；HEAD=5ec9a4a）；未提交改动：代码/脚本 5 文件（index.html、ui.js、scripts/verify-ui.cjs、scripts/qa-e2e-jsdom.cjs、scripts/assembly-check.cjs）+ 本夹 4 文档（PRD/TECHNICAL/QA-REPORT/本 ACCEPTANCE）。
- 无遗留缺陷；AC-1~8 全部通过（P0 七项 + P1 一项），交付就绪。

验收结论：✅ 通过