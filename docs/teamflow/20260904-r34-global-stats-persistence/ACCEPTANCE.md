# ACCEPTANCE — r34 全局统计持久化（产品验收）

- 验收人：产品经理（acceptance lead）
- 依据：`docs/teamflow/20260904-r34-global-stats-persistence/PRD.md`（11 条 AC）、QA-REPORT、独立对抗抽查（57/57）、工作树红线复核
- 交付基线：分支 `feat/global-stats-persistence`（HEAD `edaf348`，未提交改动 = 10 处实现 + 任务夹 + memory.md 约定行）
- 基线依赖：r32-stats-panel + r33-lock-move-reset（增量扩展，无取代条目）

## 一、验收结论

**✅ 通过**。P0（AC-1~AC-10）全部由七套脚本 + 独立对抗抽查覆盖且全绿；P1（AC-11 人工补测）按 PRD「留产品验收」收口为遗留清单（r33 同款先例），不构成阻塞。无 P0/P1/P2 缺陷；仅 1 项 P3 文档级范围表述偏差（r34-Q1），行为正确且有测试锁定。

## 二、逐 AC 核对表

| AC | 级别 | 验收方式与证据 | 结论 |
|---|---|---|---|
| AC-1 局内五项会话内存边界 | P0 | verify-game 157/157（r32 归零/定格用例逐字沿用）；快照键集零追加（独立对抗 B7：快照无 stats/statsAccounted 字段） | ✅ |
| AC-2 全局四项持久化 + saveStats 出口 | P0 | verify-persist 30/30（roundtrip/清洗/只增不减/降级）；独立对抗 A1~A8；assembly-check saveStats 契约；PAYLOAD_VERSION 保持 1 | ✅ |
| AC-3 旧数据兼容与降级 | P0 | 独立对抗 A1~A3：旧载荷四项归 0 且 highScore/settings 保留、坏 JSON 清键回默认不 throw、stats 非对象清洗、降级内存 Map 静默 | ✅ |
| AC-4 OVER 定格入账（幂等、单计数源） | P0 | 独立对抗 B3：自然 OVER 恰 1 次入账、OVER 后 tick/lose 零重复；B4 双 lose 幂等；单计数源收敛 persist 层、UI 只读镜像零独立累计 | ✅ |
| AC-5 隐藏/卸载补记（幂等） | P0 | 独立对抗 B2（flush 500 + over 余量 500 = 1000 恒等非重复累计）；pagehide/beforeunload 恒注册 + dispose 对称移除；B5 暂停中不发 | ✅ |
| AC-6 中途刷新不丢（≤1s 容差） | P0 | 独立对抗 D1~D4 DOM 全链路：over 定格 → 刷新等价读回 placed=3/games=1/timeMs=1000 且 UI 镜像恢复；时间戳差值累计防漂移 | ✅ |
| AC-7 暂停不计时长 | P0 | verify-game §r34 + 独立对抗 B5（暂停中 flush 不发、恢复后只计恢复段） | ✅ |
| AC-8 面板两组展示与布局零回归 | P0 | verify-ui 66/66（#global-stats 位置隔离断言、role=group、恰 5 行 .global-stat、既有布局断言零回归）；独立对抗 C1/C2（formatSessionTime/createGlobalStats 契约）；S 竖屏棋盘高度变化入 AC-11 实机项 | ✅ |
| AC-9 引擎行为 0 变化红线 | P0 | 工作树核验：audio.js/verify-audio.cjs/verify-constants.cjs 0 行；VERSION 三模块 2.3.0 未动（verify-constants 2/2）；persist 仅增量（+54/−1，−1 为 saveHighScore/saveSettings merged 补 `stats` 保全的注释行替换）；onSfx 事件面零变化（verify-game 含 onSfx 序列全绿） | ✅（r34-Q1 见 §四） |
| AC-10 七套全绿零回归 + soak 无漂移 | P0 | 七套全绿：persist 30 / game 157 / ui 66 / audio 24 / constants 2 / assembly ALL / qa-e2e 605；verify 四脚本删除内容行 0（旧期望零改动）；assembly −3 为 saveStats 契约 + 六锚点扩展（§r34 必要追加，dev 已披露）；soak=水面差值确定性地分片累计无漂移 | ✅ |
| AC-11 人工补测清单 | P1 | 8 项真机/浏览器人工项（切后台双触发幂等、清后台回收补记、刷新不丢、暂停不计、旧存档迁移、长挂机精度、读屏播报、横竖屏布局不叠压）→ 遗留清单，随 memory.md 待办同主题行追加 | ✅ 遗留 |

## 三、M3 架构质量门复核

- **蓝图**：无 injected blueprint JSON，按「蓝图缺席」模式核对；实现与既有架构（persist 单键事实源、UI 只读镜像、onStats 事件出口同 onSfx 风格）自洽。
- **重复实现**：无。存储封装唯一（persist.js createPersistence，ui/game 无 localStorage 直操作）；累计逻辑唯一收敛 persist 层，UI 零独立累计（AC-4 单计数源）；无第二套入账通道。
- **抽象缺位**：createGlobalStats 与 createHud/createSessionStats 共享 ≤8 行 flash 小段未抽公共 helper——受控重复且注释明示，与 r32 已接受的同款理由一致，非本次新增漂移。
- **结构健康**：快照键集零追加、onSfx 事件面零变化、音效零新增、dispose 对称清理（pagehide/beforeunload 注册/移除条件一致）、无 console/debugger/TODO 残留。
- **结论**：无架构返工项，符合增量扩展约束。

## 四、缺陷与遗留

| 编号 | 级别 | 说明 | 处置 |
|---|---|---|---|
| r34-Q1 | P3（文档级） | TECHNICAL.md §1.2「仅四处函数内新增」范围表述遗漏 saveHighScore/saveSettings merged 各补 1 行 `stats` 保全（行为正确，verify-persist §r34「混合保留」双向锁定；dev 已披露规范偏差） | 记录归档；任务夹 TECH 按 ADR-0008 不可变，不追改，无后续动作 |
| AC-11 | P1（人工） | 8 项真机/浏览器补测 + S 竖屏棋盘高度 526→≈458px 实机可玩性确认 | 已并入 memory.md 人工补测汇总待办，待真实浏览器环境集中补测 |

## 五、裁决依据

- P0 全部 AC 有脚本级证据（七套全绿 + 独立对抗 57/57 零失败 + 红线工作树核验），非仅「全绿」单一证据。
- P1 人工补测按 PRD 自身定义为「留产品验收」，r33 同款处理先例为通过并结转待办，故不阻塞。
- 唯一发现为 P3 文档级表述偏差，行为正确、有测试锁定、无工程影响，不构成返工。

验收结论：✅ 通过