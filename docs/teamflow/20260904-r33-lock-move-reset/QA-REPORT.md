# QA-REPORT — r33 触底锁定缓冲移动/旋转重置（lock move reset）

- 产品：tetris v2.4 迭代（VERSION 三模块 2.3.0 未动）
- 任务夹：docs/teamflow/20260904-r33-lock-move-reset/（PRD 12 AC，基线依赖 r32，取代活文档 AC-03.5 措辞）
- 分支：feat/lock-move-reset（HEAD 2fcd468，未提交：game.js + scripts/verify-game.cjs + scripts/qa-e2e-jsdom.cjs + 任务夹）
- 环境：Node v22.22.3（Windows）；全部验证沙盒合法，命令输出落 logs/teamflow/tf-mtlqxw2e-8pt6ij/
- QA 方式：七套全量套件复跑 + 独立对抗抽查（自有锚点 qa-r33-independent.cjs，99 项）+ 红线 git 复核 + 架构蓝图核验

## 1. 测试范围与结论一览

| 面 | 结果 | 证据 |
|---|---|---|
| 七套全量套件 | 全绿 | verify-game 148/148、verify-audio 24/24、verify-ui 63/63、verify-constants 2/2、verify-persist 23/23、assembly-check ALL PASSED、qa-e2e-jsdom 581/581 |
| 独立对抗抽查（AC-1~7 数据面 + 快照契约） | 99/99 通过 | 自有时序判别/几何自证锚点，非流水线断言复用（脚本留 logs/teamflow/tf-mtlqxw2e-8pt6ij/qa-r33-independent.cjs） |
| 红线复核 | 通过 | 跟踪面仅 3 文件；audio/persist/ui/style/index.html/AGENTS.md/memory.md 0 行 diff；VERSION 2.3.0 三模块一致 |
| 架构核对（M3，蓝图存在） | 通过 | TECHNICAL 蓝图（<!-- blueprint -->）与实现逐项相符，无重复实现漂移/漏抽象/结构破损 |

## 2. 逐 AC 验证结果（数据面）

| AC | 验收点 | 结果 | 说明 |
|---|---|---|---|
| AC-1 | 触底成功移动/旋转重置满额 | 通过 | 独立 tick(250) 分片判别：重置后 1 tick 不锁、再 1 tick 锁；预算恰 −1（两动作分支均验证） |
| AC-2 | 被拒不重置不发声 | 通过 | blocked move / 旋转全拒（上踢路径封死构造）：预算不动、缓冲续计 1 tick 即锁、零新 sfx |
| AC-3 | 每方块上限 15（旋转+移动同一预算） | 通过 | 15 次逐格 15→0；第 16 次成功动作不重置（预 tick 后 1 tick 即锁，判别防误重置）；预算 0 封底 |
| AC-4 | per-piece 归零/防钻空子 | 通过 | 悬空清零耗尽 0；重力落地/手术落地缓冲期待满额均不补发；锁后培育子满额 15；hold 换出/restart 归满额 |
| AC-5 | 软降/硬降立即锁定、不耗预算两条路径 | 通过 | 软降成功下移 0 耗（随后动作 −1 证明）；软降触底/硬降即时锁（预算 0 时仍即时锁）；hardDrop sfx 恰 1；softDrop 沿用既有事件面 |
| AC-6 | r18 窗口判据零回归 | 通过 | T-spin 几何自证（实机姿态 tspinKind==='full'）+ No-line Full score=100 恒等；E3 软降清窗、E6 move 清窗均不判（score 0）；既有 148 引擎断言全绿含 §14 全组 |
| AC-7 | 链迁移/落定收口/触控回放零回归 | 通过 | piecesPlaced 恰 +1（多次落定逐一核对）；qa-e2e §r33 触控回放与键鼠同口径 12 项通过；581 全绿 |
| AC-8/10 | 红线/ui/audio/persist/style 0 行、VERSION 不动、口径 | 通过 | 见红线复核；任务夹 PRD/TECHNICAL 已含 AC-03.5 修订措辞与 §5 LOCK_MOVE_RESET_MAX |
| AC-9 | 断言锚点 + verify-game/qa-e2e §r33 | 通过 | `_debug.getLockMoveResetsRemaining()` 只读 getter；快照键集恰 16+2（独立复核无第 19 键泄漏） |
| AC-11 | 七套全绿 | 通过 | 套件数字见上表 |
| AC-12 | 人工补测（P1） | 遗留验收 | 见 §4 清单（真机手感/回放抽样/FPS/读屏），环境受限非缺陷 |

## 3. 独立对抗抽查要点（qa-r33-independent，99/99）

- 常量/导出/出生点：`T.LOCK_MOVE_RESET_MAX===15`、`LOCK_DELAY_MS===500` 未动；start/hardDrop 锁后/restart 后均满额 15。
- 时序判别法（杜绝墙体时钟）：预 tick(250) 置缓冲 250ms —— 重置生效需 2 tick、未重置 1 tick 即锁，逐分支判定。
- T-spin 事件面：No-line Full 锁定 score=100、placed 恰 +1、onSfx 恰 1 次 rotate（无新增 clear）；E3/E6 清窗 score=0。
- 快照契约：18 键集与 r32 基线精确相等，预算不泄漏进快照（getter 路线正确）。

## 4. 人工补测清单（AC-12，P1，环境限制非交付缺陷）

| 项 | 验收标准 | 方法与工具 |
|---|---|---|
| 真机锁定时机手感（横/竖屏） | 贴底方块缓冲期连续移动/旋转时，每次成功动作重置 500ms 满额可感知；15 次上限后锁定节奏回归「固定 500ms」 | 真机（iOS Safari/Android Chrome）快速左右移/旋转贴底方块；手动计时 + 观察对比 r32 手感 |
| 触控=键盘回放等价抽样（AC-7） | 触控连续 15+ 次操作预算消耗与键鼠同口径、无异常提前/延后锁定 | 真机触控连击贴底方块观察锁定；DevTools 控制台日志抽样 |
| FPS 容差 | 缓冲期高频操作无掉帧（预算为闭包整型，无渲染负担） | 浏览器 performance monitor / FPS overlay |
| 读屏/无障碍抽样 | ui/index.html 0 行 diff → 无新增可访问性面；既有 aria-live 播报不回归 | NVDA/VoiceOver 抽样（横竖屏切换、锁定、消行播报） |
| 视觉检查 | 本迭代无 UI/Style 改动 → 桌面/竖屏/横屏布局与 r32 完全一致 | 真机目视对比 r32（0 行 diff 已源码级保证） |

## 5. 缺陷表

| 编号 | 严重级(P0/P1/P2/P3) | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| R33-01 | P3 | 文档（TECHNICAL） | 阅读任务夹 TECHNICAL §2.2 闭包初始化代码片段 | 初始值字面与契约/实现一致（=LOCK_MOVE_RESET_MAX） | §2.2 片段字面 `let lockMoveResetsRemaining = 0` 与实现（`= LOCK_MOVE_RESET_MAX`，READY=15 防御断言）不一致；行为恒等（首次出生即重置为 15），TECH §8.1 已注明为有据偏差，建议后续统一片段文本 | AC-10 |

- 引擎/断言/事件面/红线：**未发现功能缺陷**（P0/P1/P2 为零）。
- 注记：并行门跑曾现瞬时 147/148、580/581，T3 探针证明为 T2 断言文件 mid-write 竞态；本轮 QA 独立复跑七套全绿（含 verify-game ×3、qa-e2e 全量），异常不残留。

## 6. 架构核对（M3 质量门）

- 蓝图（TECHNICAL 内 <!-- blueprint -->）逐项相符：改动单文件收口 game.js（+43/−3）；LOCK_MOVE_RESET_MAX 常量+导出；预算闭包（r32 同风格，不入 state）；move/rotate（原地+kick）成功分支三支化；resetLockMoveBudget 单一收口于 4 出生点（spawnFirst/finishLock/hold×2）；`_debug.getLockMoveResetsRemaining()` getter 断言锚点（未追加快照字段）；verify-game §r33 7 用例+§4.1-8 审计登记（G1~G9 引理「构造点 lockTimer=0 → 重置恒等」）；qa-e2e §r33 12 项。依赖/装配顺序与蓝图一致，assembly-check 通过。
- 重复实现/漂移：三支化重置逻辑在 move/rotate 两处 3 个分支重复 —— 与基线既有「lockTimer=0 三处同句式」同构，属文件既有扁平风格沿袭（预算递减为共享单行）；无多套安全包装/存储适配漂移。非缺陷，架构观察。
- 抽象漏提取/结构破损：spawn() 保持纯函数（导出契约被 Node 单测直接调用，掺会话状态即破坏——设计正确）；预算归零单一助手防漏。无破损。

## 7. 结论

**验收就绪（条件性）**：自动验证面（七套全绿 + 独立对抗 99/99 + 红线 0 diff + 架构蓝图相符）全部通过，P0/P1/P2 缺陷为零，唯一 P3 为文档片段字面（无行为影响）。AC-12 真机手感等人工补测项按 §4 清单留产品验收（环境限制，非交付缺陷）。分支 feat/lock-move-reset 未提交，验收通过后由 host 单 commit。