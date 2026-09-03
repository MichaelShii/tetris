# ACCEPTANCE — r33 触底锁定缓冲移动/旋转重置（lock move reset）

- 产品：tetris v2.4 迭代（VERSION 三模块 2.3.0 未动）
- 任务夹：docs/teamflow/20260904-r33-lock-move-reset/
- 验收人：产品经理（验收负责人）
- 验收依据：任务夹 PRD.md（12 条 AC，基线依赖 r32，取代活文档 PRD AC-03.5 措辞）+ QA-REPORT.md + 本次独立复核

## 1. 独立复核记录（本验收实际执行）

- **分支/改动面**：`feat/lock-move-reset`（HEAD 2fcd468=main）；未提交跟踪改动恰 3 文件——game.js（+43/−3）、scripts/verify-game.cjs（+341）、scripts/qa-e2e-jsdom.cjs（+96），另含 host 预建任务夹（交付物）。
- **红线复核（git status --porcelain 实测）**：audio.js / persist.js / ui.js / style.css / index.html / AGENTS.md / memory.md **0 行 diff**；VERSION 三模块 2.3.0 一致（verify-constants 2/2）。
- **七套全量复跑（本验收独立执行，exit 0，日志 logs/teamflow/tf-mtlqxw2e-8pt6ij/acceptance-*.log）**：verify-game **148/148**、verify-audio 24/24、verify-ui 63/63、verify-constants 2/2、verify-persist 23/23、assembly-check ALL CHECKS PASSED、qa-e2e-jsdom **581/581**（含 §r33 键盘重置/触控回放等价/软硬降即时锁/预算耗尽可感知 12 项）。

## 2. 逐 AC 验收表

| AC | 验收点 | 结果 | 依据 |
|---|---|---|---|
| AC-1 | 触底成功移动/旋转重置满额 | ✅ | verify-game §4.1-2：tick(250) 分片时序判别（动作后 1 tick 不锁、再 1 tick 锁；预算恰 −1，move/rotate 两分支）；qa §4.2 DOM 层同口径 |
| AC-2 | 被拒不重置不发声 | ✅ | §4.1-3：blocked / wall-kick-denied 预算不动、缓冲续计 1 tick 即锁、onSfx 零新增 |
| AC-3 | 每方块上限 15（同一预算） | ✅ | §4.1-4：旋转+移动混合 15 次逐格 15→0；第 16 次成功动作不重置（1 tick 即锁判别防误重置）；预算 0 封底 |
| AC-4 | per-piece 会话内存/防钻空子 | ✅ | §4.1-6：hold 换出/restart/spawnFirst 归满额；悬空清零耗尽 0、重力再落地不补发；game.js 4 出生点 resetLockMoveBudget 单一收口（L792/812/1011/1017） |
| AC-5 | 软降/hardDrop 两条路径不变 | ✅ | §4.1-5：软降成功下移 0 耗预算（随后动作 −1 判别证明）、软降触底/硬降即时锁、hardDrop sfx 恰 1；对应引擎路径逐字节不动 |
| AC-6 | r18 T-spin 窗口判据零回归 | ✅ | §4.1-8 审计登记（引理 G1~G9 逐组 + 代表性子集自证 F1=900 / E11=100 / E14 零触碰）；r18 §14 全组含于 148 全绿，旧期望零改动 |
| AC-7 | 链迁移/落定收口/触控回放零回归 | ✅ | piecesPlaced 恰 +1（r32 断言原样通过）；qa §4.2 触控=键盘回放同路径自然获新语义（回放器 0 逻辑改动）|
| AC-8 | 红线（四前端文件 0 行、VERSION 不动） | ✅ | §1 红线复核实测；引擎其余行为（计分/掉落/7-bag/踢墙/键位/DT_CLAMP_MS）0 变化 |
| AC-9 | 断言锚点 + verify-game/qa-e2e §r33 | ✅ | `_debug.getLockMoveResetsRemaining()` 只读 getter；未追加快照字段（r32 §4.1-9 键集断言原样通过）|
| AC-10 | 文档口径同步 | ✅ | 任务夹 PRD 含取代声明（§1.3/§5）与 §5 LOCK_MOVE_RESET_MAX（L85-86）；活文档 docs/teamflow/prd/PRD.md 不存在（已归档，按 r13 先例落定任务夹，TECH §8.1 存证）；P3 R33-01 见 §4 |
| AC-11 | 七套全绿出口 | ✅ | §1 独立复跑全部 green 且无回归 |
| AC-12 | 人工补测（P1） | 🟡 遗留验收 | 真机手感/回放抽样/FPS/读屏/视觉——环境受限非缺陷，按 QA §4 清单集中补测 |

## 3. M3 架构/蓝图核对

- **蓝图（TECHNICAL `<!-- blueprint -->`）与实现相符**：行为面单文件收口 game.js（+43/−3）、断言纯追加 verify-game/qa-e2e；装配顺序 game.js→断言 与蓝图一致；LOCK_MOVE_RESET_MAX 常量+导出、预算闭包（不入 state 快照）、4 出生点单一收口、move/rotate（原地+kick）成功分支三支化、_debug getter——逐项与蓝图对应。
- **重复实现观察**：三支化重置在 move/rotate 6 分支重复，与基线既有「lockTimer=0 三处同句式」同构、属文件既有扁平风格沿袭（蓝图明示设计），**非缺陷、无需重构**。
- **抽象/结构**：spawn() 保持纯函数（导出契约被 Node 单测直接调用，掺会话状态即破坏）——设计正确；无漏抽象、无适配漂移、无结构破损；assembly-check 通过。

## 4. 遗留与意见

- **R33-01（P3，QA 登记）**：任务夹 TECHNICAL §2.2 闭包初始化片段字面 `= 0` 与实现 `= LOCK_MOVE_RESET_MAX`（READY=15 防御断言）不一致——行为恒等（首次出生即重置满额），TECH §8.1 已注明为有据偏差。任务夹不可变，无需返工，建议未来迭代文档撰写时统一片段文本；该 P3 已完整存证于任务夹，无行为影响，不入 memory 待办。
- **AC-12**：五类真机/读屏/FPS 人工补测项按 QA §4 清单转入人工补测汇总待办（真实浏览器环境集中补测），非本次交付缺陷。
- **分支**：feat/lock-move-reset 未提交（恰 3 跟踪文件 + 任务夹），验收通过后由 host 单 commit。
- **memory.md 未改动**：本需求为行为变更+新常量（非新团队约定/技术栈决策），待办列表无新增项，符合文档边界策略。

## 5. 结论

12 条 AC 全部达成：AC-1~11 自动验证面通过（七套全绿 + 独立对抗 99/99 + 红线 0 diff + 架构蓝图相符 + 本次验收独立复跑全绿），P0/P1/P2 缺陷为零，唯一 P3 为文档片段字面且已有据存证；AC-12 人工补测为环境限制的遗留验收项。**验收通过**，准予 host 单 commit。

验收结论：✅ 通过