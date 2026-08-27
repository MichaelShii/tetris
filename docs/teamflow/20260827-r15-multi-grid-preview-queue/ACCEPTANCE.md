# 产品验收报告 — r15 多格预览队列（Tetris v3.2）

## 结论

**✅ 通过（accepted）**

验收基线 `main` @ `e182521`（feat/multi-grid-preview-queue 已合回）。本验收独立复跑七套脚本，与合并声明逐项一致：**97/24/17/2/15/ALL/294，全绿、exit 0**；AC-1~12 全部满足；M3 架构质量门合规（蓝图全量落地、无重复实现、无抽象缺口）；r14 Hold（基线依赖）零回归。无 P0~P3 缺陷，无架构返工项，无需重验。像素/真实计时/真浏览器刷新/听感等观感类验证不自证，入人工补测（非缺陷）。

## 验收方法

- AC 逐条核对（依据本夹 PRD AC-1~12，P0×9 / P1×3）+ 代码证据（game.js / persist.js / ui.js / index.html / style.css）+ 七套脚本实测复跑 + 架构核查。
- 复跑日志：`logs/teamflow/tf-mtbhyymk-oj2jpj/acceptance-*.log`。

## AC 对照表

| AC | 优先级 | 验收结果 | 证据 |
|---|---|---|---|
| AC-1 队列 3 格、顺序=7-bag 出块 | P0 | ✅ | `snapshot.queue=[state.next,...peekN(2)]` 恒长 3、首格=next（game.js:486）；READY 显示 3 格在 e2e 294 项断言；verify-game §13③ |
| AC-2 固定序列 20 次出生 100% 一致 | P0 | ✅ | verify-game §13⑤ rng=0.5 打桩连续 20 次出生逐次命中；QA 另 25 次×2 局对抗复核一致 |
| AC-3 锁定前移、恒长 3 | P0 | ✅ | 单一游标派生（lockFlow 零改动）；verify-game §13④ start 前移断言 + e2e hardDrop 前移 |
| AC-4 渲染复用 next-well（48×24/rot=0） | P0 | ✅ | `drawMiniPieceAt` 抽取共享（ui.js:486），48×80 队列窗逐格复用；e2e 48×80 断言（像素观感入人工） |
| AC-5 PAUSED 冻结 / OVER·restart 重置 | P1 | ✅ | verify-game §13⑥⑦⑧；QA 对抗 PAUSED 5 快照+tick(1e6) 不变、OVER 终态稳定 |
| AC-6 开关默认开、交互复用 | P0 | ✅ | `#btn-preview-queue`（index.html:154）+ aria-pressed/aria-label/文本三信号（ui.js:1172）；`DEFAULT_SETTINGS.previewQueueEnabled=true` |
| AC-7 关闭隐藏/开启恢复不重置 | P0 | ✅ | display:none 整区隐藏 + render(null)（ui.js:1450）；QA 暂停期切开关恢复出生=冻结队首 |
| AC-8 localStorage 持久化、刷新保持 | P0 | ✅ | persist.js 默认开/sanitize/encode；verify-persist 15/15（往返/旧载荷回默认/坏值）；QA 双装载（真刷新入人工） |
| AC-9 关闭期不干扰出块序列 | P1 | ✅ | 开关纯显示层，引擎无条件维护队列（ui.js:1170 注释）；e2e 关闭期多次 hardDrop 不错位 |
| AC-10 引擎接口 + 单测 | P0 | ✅ | `NEXT_QUEUE_SIZE` 导出 + `peekN` 非消耗跨袋 + `snapshot.queue` + restart 重建（game.js）；verify-game §13 |
| AC-11 Hold 共存、队首消费 | P1 | ✅ | 空槽 hold 消费队首/交换不消耗/no-op 门控（verify-game §13⑨）；r14 Hold 专项 35 项零回归 |
| AC-12 七套全绿无回归 | P0 | ✅ | 本验收实测 97/24/17/2/15/ALL/294 全绿，与新开关/既有设置互不干扰 |

## 架构核查（M3 质量门）

- **蓝图落地**：TECHNICAL.md 内嵌 blueprint 全量落地——game.js（装配序 1）→ persist.js/index.html/style.css（2）→ ui.js（3），模块职责/依赖/装配顺序与规划一致。
- **无重复实现**：localStorage 全仓仅 persist.js 单点（含降级内存 Map）；`snapshot.queue` 由单一游标 `state.next` 派生，无第二可变状态源；`drawMiniPieceAt` 单点共享，旧渲染器为有意保留的兼容壳并有 verify-ui/e2e 双兜底。
- **抽象到位**：peekN 入引擎层（7-bag 唯一数据源）、队列渲染器独立、开关纯 UI 显示层。
- **既有结构无破坏**：goog 语义零改动（lockFlow/finishLock/spawnFirst/restart/hold/tick 未触碰）。

## 意见与遗留

1. **人工补测 6 项（非缺陷，交付后人工确认）**：①队列窗像素观感（48×80 三格同框、毛玻璃/辉光）；②开关显隐 ≤200ms 真实计时；③真浏览器刷新持久化恢复；④Tab 焦点/aria 读屏；⑤关闭态布局无塌陷；⑥多浏览器（Edge/Chrome）渲染一致性。
2. **存量待办（不放大、本需求未引入）**：verify-constants 硬编码 `EXPECTED_VERSION` 与三模块 VERSION 的既有漂移已在 memory.md 待办，本期按裁决不加急。
3. **环境限制说明**：无 GitHub 网络（T0 fetch 失败）不影响本地归并验证；本次验收在本地 main 完成，远端推送未发生（如需发布需网络环境补推）。

## 验收总则对照

- §9 验收总则：以 AC-1~12 为唯一依据 → 全部通过 ✅；回归底线七套全绿 ✅、r14 AC-1~17 语义不回归 ✅。
- 工程约束：feat/multi-grid-preview-queue 从 dc0e01f 建分支、七套全绿后合回 main ✅（e182521 合回）。未跟踪任务夹按约定保留，不清理不提交。