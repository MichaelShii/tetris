# r32 统计面板 · 验收报告（ACCEPTANCE）

## 验收结论

**✅ 通过（accepted）**。P0（AC-1~13）、P1（AC-14）、P2（AC-15）全部满足；七套验证独立重跑全绿（exit 0 ×7，日志 `logs/teamflow/tf-mtlo4wye-pj9bfv/acceptance-r32-suites.log`）；红线全守住；架构零偏差。仅 1 处 P3 文档笔误（TECHNICAL §4.2 矩阵，无行为影响）与 M1~M6 人工补测项留产品验收侧。

## M3 质量门（架构一致性）

- **蓝图核对通过**：TECHNICAL `<!-- blueprint -->` 7 模块（game=1 / index=2 / style=3 / ui=4 / verify-game=5 / verify-ui=6 / qa-e2e=7）与交付逐一吻合：
  - game.js：闭包双值（L630-631）、lockFlow 唯一落定收口 +1（L700，clearing/finishLock 前不二次计数）、tick 唯一用时累计（L1010，首行 RUNNING 守卫 + dt clamp 后、clearing 前）、start/restart 归零（L809-810/836-837）、快照追加两字段（L651-652）——单一计数源达成，0 行为变化。
  - index.html：`#session-stats` 位 .stat-grid 闭合后、.hold-well 前纯追加（L54-68），role=group + 3×session-stat + #session-announce，契约与 §3.1 逐属性一致。
  - style.css：文末 4 组规则（基座行式 / S 档 order:12 / S 竖屏 #main 同特异后源序加 session 行 / S 横屏自包含玻璃卡），既有规则体零改。
  - ui.js：formatSessionTime（TECH §3.3 A 逐行同构）+ createSessionStats（只读渲染、flash 复用 stat-flash、phase 跳变驱动播报防刷屏、getAnnounceWrites 计数）+ createUI must()×4 接线 + renderAll/dispose 对称追加 + 导出。
  - 三断言脚本 §r32 段（verify-game 9 组 / verify-ui 4 组 / qa-e2e 34 项）全部落地。
- **重复实现**：flash（≈8 行）在 createHud/createSessionStats 各一份——TECHNICAL 蓝图明示的受控取舍（不抽公共 helper 避免触碰既有 createHud），双端复用 HUD_FLASH_MS/stat-flash 且有测试钳制，**非缺陷**（P3 观察项）。
- **既有结构破损**：未发现。r17 `.stat===4`、r16/r27 `.tkey===6`、r19 areas 原串、卡化八选择器列表、脚本块顺序契约全部原样保留。

## 逐条 AC 核查

| AC | 结论 | 证据 |
|---|---|---|
| AC-1 三项可见且实时（全档位） | ✅ | 面板随 renderAll 实时更新；verify-ui 节点契约 + qa-e2e DOM 实时等价 |
| AC-2 已放置=成功落定计数 | ✅ | lockFlow 唯一 +1；verify-game §r32-2/3/4：混合落定=4、move/rotate/hold=0、T-spin/No-line 计 1 |
| AC-3 消行同源恒等 | ✅ | verify-game §r32-5（10 单消+2 四消→lines=18）；qa-e2e `#ss-lines≡#lines` 镜像同快照字段 |
| AC-4 时长语义（暂停不计/≤1s 容差） | ✅ | tick 仅 RUNNING 累计（构造停表）；verify-game §r32-6 确定性分片 + qa-e2e 暂停停表/恢复续计/OVER 定格 |
| AC-5 归零与定格 | ✅ | start/restart 双值归零；verify-game §r32-7 + qa-e2e restart 三值回 0/0/00:00、OVER 冻结 |
| AC-6 既有统计元素零改动 | ✅ | .stat 恰 4 原样；stat-grid 源序未动；git diff index.html 纯插入 +18/−0 |
| AC-7 全档位零叠压 | ✅ | S 竖屏追加 session 网格行、横屏自包含卡在轨道内；verify-ui 源扫描（order:12、areas 行、卡化列表不动）；真机几何目测入 M3 人工 |
| AC-8 r30/r31 冻结语义零触碰 | ✅ | qa-e2e 源码级：行式栏后无 session-、无 `.touchpad .session-*` / `.session-* .tkey` 交叉、.tkey 仍 6 |
| AC-9 引擎行为 0 变化 | ✅ | game.js diff 22/0 纯追加；快照既有键逐一核对不变；audio.js / persist.js 不在改动列表（0 行） |
| AC-10 onSfx 事件面不变 | ✅ | verify-game §r32-8：硬降落定仍恰 1 次 hardDrop，计时零音效；抽查计时 1s 零新增 |
| AC-11 VERSION 一致 | ✅ | verify-constants exit 0，三模块一致 2.3.0（未升，合规） |
| AC-12 七套全绿零回归 | ✅ | 独立重跑 7×exit 0（game 140/audio 24/ui 63/constants 2/persist 23/assembly ALL/qa-e2e 569）；三断言脚本 diff 全部 0 删除（旧期望零改动） |
| AC-13 数值可脚本断言 | ✅ | getSnapshot/onSnapshot 两字段 + TetrisUI.formatSessionTime 导出；三脚本 §r32 断言全过 |
| AC-14 读屏防刷屏（P1） | ✅ | `#ss-time-value` 无 aria-live（源码级）；announce 仅 phase 跳变写一次；qa-e2e 10s 同态零播报、写入计数恰 +1；NVDA/VoiceOver 留 M4 人工 |
| AC-15 预留扩展位（P2） | ✅ | 本期可不实现；快照字段追加性 + 独立面板 3 列槽位已具备扩展条件，未破红线 |

## 缺陷与遗留

| 编号 | 级别 | 说明 | 处置 |
|---|---|---|---|
| D-1 | P3 | TECHNICAL §4.2 矩阵 `1000→'01:00'` 笔误（L192），实现与全部断言及同文档 L206 均为 `'00:01'`，无行为影响 | 已记录于 QA-REPORT；任务夹不可回归改写，随文档留档 |
| M1~M6 | 人工 | 真机竖屏实时性 / 停表·定格·归零真机 / 横屏双轨·宽屏形态 / 读屏播报 / FPS·时长容差 / 闪动动效 | 环境限制，留产品验收侧人工补测清单 |

## 评审意见

1. 交付纪律良好：分支 `feat/stats-panel`，7 文件 insertions-only（game 22 / index 18 / style 33 / ui 118 / verify-game 150 / verify-ui 81 / qa-e2e 173，全部 0 删除），未提交，符合「验收后宿主单 commit」先例。
2. 红线复核独立通过：audio.js / persist.js / memory.md / AGENTS.md 0 行 diff，VERSION 未动，旧断言零改动。
3. 架构零偏差：无「应抽取而未抽取」之抽象缺失；唯一重复（flash）为蓝图明示取舍且测试钳制，不构成返工项。

**处置建议**：验收通过；宿主按 r31 先例将 7 文件 + 任务夹文档同批单 commit 收口。M1~M6 人工补测由产品侧执行，结果与 D-1 留档即可，不影响本交付验收。

<!-- state -->{"phase":"acceptance","summary":"r32 验收通过（accepted）：15 条 AC 全满足（P0 十三项 + AC-14 读屏防刷屏 + AC-15 预留位）；七套验证独立重跑全绿（verify-game/audio/ui/constants/persist/assembly/qa-e2e 均 EXIT=0，qa-e2e 569 含 §r32 34 项）；M3 质量门零偏差——blueprint 7 模块与交付逐一吻合（game 唯一落定收口+唯一 RUNNING 计时、index/style/ui 纯追加、三脚本 §r32 断言就位），flash≈8 行重复为 TECHNICAL 明示受控取舍（测试钳制）非缺陷；红线独立复核通过（game 22/0 纯追加、audio/persist/memory 0 行、VERSION 2.3.0 未动、旧断言零改动、r17 .stat===4 / r16 .tkey===6 / r19 areas 原串保留）；仅 P3=D-1 TECHNICAL §4.2 矩阵笔误 1000→'01:00'（实现与断言均 '00:01'，文档级无行为影响）留档；M1~M6 人工补测（真机竖屏/停表定格/横屏双轨/读屏/FPS/闪动）留产品验收侧；建议宿主按 r31 先例 7 文件+任务夹同批单 commit。","memory":["r32 ACCEPTANCE 已落盘 docs/teamflow/20260903-r32-stats-panel/ACCEPTANCE.md：验收通过（accepted），15/15 AC 全绿，七套独立重跑 EXIT=0 全过，M3 架构零偏差，红线 0 diff 复核通过","r32 遗留（验收侧）：P3 D-1=TECHNICAL §4.2 矩阵 1000→'01:00' 笔误（实现/断言取 00:01，文档级留档）；M1~M6 真机/读屏人工补测待产品验收；宿主待办=按 r31 先例单 commit（7 文件 insertions-only + 任务夹文档同批），分支 feat/stats-panel"]}<!-- /state -->