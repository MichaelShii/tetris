# ACCEPTANCE — req-12 打开设置弹层自动暂停（patch 收口）

- **任务夹**：`docs/teamflow/20260825-r12/`（PRD=确认单，夹内收口）
- **分支**：`feat/settings-modal-glass`（v3.0 未发布分支收口热修）
- **版本**：不 bump（patch 约定，见确认单⑤）
- **验收人**：产品经理（验收负责人）
- **日期**：2026-08-25
- **验收方式**：独立重跑六套验证 + 代码点位核验 + 架构一致性（M3 门禁）

## 验收结论：✅ 通过

功能 AC 全达成、七套全绿（独立重跑六套 exit 0、qa-e2e 237/237）、架构与确认单蓝图零偏差、无重复实现/适配器漂移/结构破坏。可直接合入。

## 0. 架构一致性核验（M3 质量门禁）

| 核对项 | 判定 |
|---|---|
| 遵循确认单蓝图③改动面 | ✅ 仅 `ui.js`（+15/-4）与 `scripts/qa-e2e-jsdom.cjs`（+8/-2）；`git diff --stat` 无 game.js/index.html/style.css 改动 |
| 暂停机制抽象是否正确复用 | ✅ 状态机持于 `game.js togglePause`（引擎）与 keyAction 键表，UI 仅单点触发 `if (game.getPhase() === 'RUNNING') game.togglePause()`（ui.js L968-971），READY/PAUSED/OVER 幂等跳过；零状态机复制 |
| 有无重复实现 | ✅ 无：未发现第二处暂停逻辑、轮询或事件克隆；ui.js 沿闭包 `game` 与既有守卫模式（L943 onWallKickToggle、L1228 遮罩继续键同契约） |
| 适配器漂移 | ✅ 无：无新增接口/重签名；E2E 断言复用既有 `snap().phase` / `key()` 设施 |
| 该抽象未抽象 / 破坏既有结构 | ✅ 无：单点热修 ≤5 行逻辑，togglePause 已抽象，无新抽象必要；index.html 装配时序、弹层 DOM 位置均未动，file:// 管线回归绿 |
| 注释同步 | ✅ L954/L1023 两处过时注释（"不暂停"）已同步真实 |

**结论**：实现与蓝图完全一致，无架构打回项。

## 1. AC 逐条核对（确认单三需求点 + 回归底线）

| # | 验收标准 | 实现证据 | 结果 |
|---|---|---|---|
| 1 | 打开设置弹层自动暂停：RUNNING→PAUSED；READY/OVER 不误暂停 | ui.js L968-971 守卫；E2E L841 断言 `phase === 'PAUSED'` | ✅ |
| 2 | 关闭弹层保持暂停（不随关闭自动恢复） | E2E L841「关闭后保持暂停」断言；L844-845 `key(' ')` 恢复 → `RUNNING` 新断言双绿 | ✅ |
| 3 | 弹层内 ESC 仅关弹层，不误触游戏恢复/暂停 | v3.0 既有 `onSettingsModalKeyDown` stopPropagation（零改动，L1023 注释确认）；弹层段 ESC 断言全绿 | ✅ |
| 回归底线 | 引擎/音频/UI 契约/常量/装配/路径全绿，AC-01~19 与 v3.0 各段不回归 | 独立重跑六套 exit 0（verify-game/audio/ui/constants/assembly/qa-e2e），qa-e2e **237/237**（原 236+1） | ✅ |

**独立验证证据**（验收兜底重跑，日志 `logs/teamflow/tf-mt8ndeu6-xd1g51/accept.r12.log`）：
- verify-game / verify-audio / verify-ui / verify-constants / assembly-check 全部 `exit=0`
- qa-e2e **237/237 ALL PASSED**；file:// 管线 0 资源错误、装配期无 `[tetris]` console.error（v3.0 弹层先于脚本回归防护生效）
- 段末基线恢复生效：AC-09/10 M 键四态段在弹层段后仍按 READY 基线执行全绿

## 2. 意见与遗留

1. **【遗留·需求未覆盖窗口】** 弹层打开期间，window 键表中 P/空格（PAUSED=恢复）仍生效：弹层保持打开而游戏被恢复 RUNNING。dev 按最小改动保持现状，E2E 仅覆盖「关闭后按空格 → RUNNING」路径。**已登记 docs/teamflow/memory.md §已知待办**，待下一需求裁定是否在弹层打开期吞掉恢复键。
2. **【焦点竞态·已覆盖】** `closeSettingsModal` 焦点还原至齿轮按钮后按空格可能重开弹层——E2E 新断言「关闭后按空格 → RUNNING」已覆盖该恢复路径，非阻塞。
3. **【版本号】** 按确认单⑤不 bump VERSION、不改 PRD AC 编号（v3.0 未发布分支收口热修）。✅
4. **【独立 QA 跳过的兜底】** 本档独立 QA 由开发自测兜底；验收阶段已独立重跑六套全部通过，弥补该缺口。

## 3. 结论

**✅ 通过（accepted）**。功能三需求点全达成、独立重跑全绿、架构零偏离。交付可直接合入；遗留仅「弹层打开期恢复键窗口」一条待办，不阻塞本次验收。

<!-- state -->
{"phase":"acceptance","summary":"req-12 打开设置弹层自动暂停验收通过：功能 AC 三需求点全达成（打开自动暂停 RUNNING→PAUSED/READY OVER 跳过、关闭保持暂停、弹层内 ESC 仅关弹层零改动）；独立重跑六套 exit 0，qa-e2e 237/237 全绿（file:// 管线无装配回退）。架构 M3 门禁零偏差：仅 ui.js(+15/-4)+qa-e2e(+8/-2) 两文件，引擎 togglePause 持态、UI 单点触发（L968-971 与 L943 同守卫模式），无重复实现/适配器漂移/结构破坏；L954/L1023 过时注释已同步。版本不 bump、不改 PRD AC 编号；遗留『弹层打开期间 P/空格恢复键仍生效』登记 memory.md 待办，不阻塞。验收报告落盘 docs/teamflow/20260825-r12/ACCEPTANCE.md。","memory":["req-12 patch 验收通过：openSettingsModal 加 RUNNING 守卫触发 togglePause（ui.js L970-971），关闭保持暂停、ESC 仅关弹层（v3.0 既有）；E2E L841 断言 PAUSED + 段末 key(' ') 恢复基线，237/237 全绿","独立重跑六套 exit 0（verify-game/audio/ui/constants/assembly/qa-e2e 237），日志 logs/teamflow/tf-mt8ndeu6-xd1g51/accept.r12.log；确认单即 PRD，任务夹仅 ACCEPTANCE+meta","遗留待办（已登记 memory.md）：弹层打开期间 P/空格恢复键仍经 window 键表生效（弹层开着但游戏恢复 RUNNING），需求未定义窗口，待下一需求裁定是否吞键","版本不 bump（v3.0 未发布收口）、不改 AC 编号、不动 game.js/index.html/style.css"]}
<!-- /state -->