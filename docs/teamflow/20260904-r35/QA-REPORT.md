# QA-REPORT — r35 统计面板去重收口（方案3）

> 基线依赖：docs/teamflow/20260904-r34-global-stats-persistence（r34 中间提交 5ec9a4a 行为不得回归）
> 取代：r34#AC-8 全局组「最高分」镜像行（DESIGN 刻意设计声明① 作废）、r32#AC-3 本局组「消行总数」双处并列
> 执行：T6 M3 回归与文档收口 + T7 M4 AC-8 人工补测（复跑七套 + 代码级镜像）；全部输出日志见 `logs/teamflow/tf-mtmolsed-g3wrou/`

## 1. 测试总览（七套全绿，出口达标；T7 复跑结果一致，证据 t7-*.out.log）

| # | 脚本 | T6 结果 | T7 复跑 | 证据 |
|---|---|---|---|---|
| 1 | `node scripts/verify-game.cjs` | ✅ 157 pass / 0 fail | ✅ 157 pass / 0 fail | verify-game.out.log / t7-verify-game.out.log |
| 2 | `node scripts/verify-audio.cjs` | ✅ 24 pass / 0 fail | ✅ 24 pass / 0 fail | verify-audio.out.log / t7-verify-audio.out.log |
| 3 | `node scripts/verify-ui.cjs` | ✅ 69 pass / 0 fail | ✅ 69 pass / 0 fail | verify-ui.out.log / t7-verify-ui.out.log |
| 4 | `node scripts/verify-constants.cjs` | ✅ 2 pass / 0 fail | ✅ 2 pass / 0 fail | verify-constants.out.log / t7-verify-constants.out.log |
| 5 | `node scripts/verify-persist.cjs` | ✅ 30 pass / 0 fail | ✅ 30 pass / 0 fail | verify-persist.out.log / t7-verify-persist.out.log |
| 6 | `node scripts/assembly-check.cjs` | ✅ ALL CHECKS PASSED | ✅ ALL CHECKS PASSED | assembly-check.out.log / t7-assembly-check.out.log |
| 7 | `node scripts/qa-e2e-jsdom.cjs` | ✅ 613 / 613 | ✅ 613 / 613 | qa-e2e-jsdom.out.log / t7-qa-e2e-jsdom.out.log |

**红线复核（AC-5/AC-6）**：`git diff` 证明 game.js / persist.js / audio.js / style.css（预期 0 行）及
verify-game / verify-persist / verify-audio / verify-constants **8 文件 0 行 diff**（RED_LINE_CLEAN），
VERSION 三模块一致、PAYLOAD_VERSION=1 不动；r30/r31 及更早断言期望零改动（仅 r32/r34 被本需求取代的行数断言原地改写）。

## 2. AC 覆盖

| AC | 级别 | 结论 | 验证点 |
|---|---|---|---|
| AC-1 全局卡去重 5→4（删 #gs-hi 非隐藏，最高分唯一 #hi-score） | P0 | ✅ | verify-ui §r34「恰 4 行」+ §r35 删除证明（id="gs-hi" indexOf===-1）；qa-e2e §r34 初始四值 + §r35 DOM 删除证明（querySelector null）+ #hi-score 单通道；assembly-check 五锚点（去 #gs-hi-value） |
| AC-2 本局卡去重 3→2（删消行行，消行唯一 #lines） | P0 | ✅ | verify-ui §r32「恰 2 行」+ ss-lines aria 断言删除 + §r35 删除证明；qa-e2e §r32 初始二值 / 消行唯一 #lines / §r35 querySelector null |
| AC-3 全局四项持久化语义不变 | P0 | ✅ | verify-persist 30 条逐字沿用零改动；qa-e2e §r34 入账/补记/刷新/幂等全绿 |
| AC-4 入账口径不变（OVER 定格/补记幂等/暂停不计/刷新不丢） | P0 | ✅ | verify-game §r34 逐字沿用；qa-e2e §r34 全套行为断言全绿 = 数据通道行为不变证据 |
| AC-5 红线 0 diff | P0 | ✅ | 8 文件 0 行 diff 证明（见 §1）；ui.js 仅展示侧消费裁剪 |
| AC-6 断言同步 3→2 / 5→4 + 七套全绿 | P0 | ✅ | verify-ui 原地改写（限定行数数值本身，语义断言不触碰）；七套全绿（§1） |
| AC-7 文档契约同步（4/2 行 + 取代标注） | P0 | ✅ | 本夹 TECHNICAL.m5 / 本 QA-REPORT / ACCEPTANCE 落定新行数契约与取代声明 |
| AC-8 人工补测清单 | P1 | ✅ 通过（代码级） | 见 §4：T7 复跑七套 + ac8-manual-mirror 24/24；真机目检/读屏实听列入发布前人工复核 |

## 3. §r35 新增证明（qa-e2e 尾部段落，全绿）

- **DOM 删除证明**：`#gs-hi` / `#gs-hi-value` / `#ss-lines` / `#ss-lines-value` 在真实装配页 querySelector 均 null（删除非隐藏，拦截隐藏绕过）。
- **单通道唯一**：`#hi-score`（r17 冻结 + aria-live）与本局 `#lines` 均在。
- **面板收敛**：`#global-stats` 恰 4 行 `.global-stat`、`#session-stats` 恰 2 行 `.session-stat`。
- **源码级**：index.html 全文无 `id="gs-hi"` / `id="ss-lines"` 残留；ui.js 无 `gs-hi` 活引用、must 装配恰 4 个 `#gs-` 锚点。
- **数据通道行为不变**：persist 背书真实装配 OVER 入账 → 面板四项 3/0/00:01/1（同一 onStats→saveStats→load 通道）；未破纪录 `#hi-score` 单通道不动。
- **T2 验收（grep 佐证）**：ui.js 无 `gs-hi|statsUi.hi|els.hi|p.hi` 活引用（仅 doc/注释性提及）。

## 4. AC-8 人工补测执行结果（T7 M4）

工具：`node logs/teamflow/tf-mtmolsed-g3wrou/ac8-manual-mirror.cjs` → **24/24 全过**（t7-ac8-manual-mirror.out.log），
配套 T7 七套复跑全绿（§1）。

| 补测项 | 结论 | 证据（代码级镜像） |
|---|---|---|
| ① 三态卡片行数 | ✅ 4/2 | E01：.global-stat 恰 4、.session-stat 恰 2（静态 HTML 行数，三态媒体查询只改容器不改行）；E07：竖屏/横屏 .global-stats 均 repeat(3)，ceil(4/3)=ceil(5/3)=2 行高不变式（R4，≈68px 无回归）；❐ 真机目检留发布前人工复核 |
| ② 读屏去重 | ✅ | E03：#hi-score（aria-live=polite）单通道在、#lines 在；E04：「最高分」全文恰 1 次、全局卡 4 label 互异、本局卡 2 label 互异、本局卡块内无「消行/消除」（重复播报源已整节点删除）；❐ 实听留发布前人工复核 |
| ③ 三态无叠压 | ✅（代码级） | E08：style.css 0 行 diff（git 证明），max-width:599px / orientation:landscape 门控原文在；qa-e2e 613/613（含 r28 双轨/竖屏门控断言不动）；❐ 真机目检留发布前人工复核 |
| ④ r34 补测项复用 | ✅ | qa-e2e §r34 全绿：入账/补记幂等/刷新恢复/暂停不计/OVER 定格/未破纪录 #hi-score 单通道不动；verify-persist 30/30、verify-game 157/157（数据通道行为不变证据） |

E05（T2 验收）：ui.js 无 `gs-hi`/`statsUi.hi`/`els.hi` 活引用；E06：must() 恰 4 个 `#gs-` 锚点。
E02：`id="gs-hi"`/`id="ss-lines"` 等 4 节点源码 indexOf===-1（删除非隐藏，拦截隐藏绕过）。

## 5. 结论

r35 为纯展示面去重：T1-T5 已落地（index.html 删两行、ui.js 去 hi 接线、verify-ui 断言改写、
qa-e2e 面板条目同步 + §r35 证明段、assembly-check 锚点收敛），T6 完成七套全绿与 0 行红线证明，
T7 复跑七套全绿 + AC-8 代码级镜像 24/24（真机目检/读屏实听 2 类列入发布前人工复核）。
现有未提交改动：**5 个代码/脚本文件** + 本夹 PRD/TECHNICAL + 本 QA-REPORT + ACCEPTANCE（共 4 文档）。
**无遗留缺陷**；AC-1~8 全部通过，交付就绪，合回等用户确认（ACCEPTANCE §4）。