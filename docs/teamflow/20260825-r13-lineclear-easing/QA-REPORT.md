# QA-REPORT（r13 · 消行动画缓动）

> 任务夹：`docs/teamflow/20260825-r13-lineclear-easing/` · 分支 `feat/lineclear-easing`（基于含 769a50c 的 main）
> 范围：r13 消行动画（引擎 clearing 子阶段 + ui 霓虹脉冲 + 测试钩子），含 r12 弹层自动暂停协同回归与 AC-01~19 全量回归

## 结论（verdict）

**通过，达到可验收标准。** 七套验证全绿（74/23/12/11/2/ALL/248，含 237 既有断言零回归 + 11 条新动画段）；对抗性抽查 4 组全过；架构轻检无 P0/P1/P2 问题，仅 1 项 P3 维护性观察。视觉/听觉/真实计时类验收项受沙箱环境限制，列入人工补测清单，非交付缺陷。

## 1. 范围与环境

- **验证环境**：Windows + Node v22.22.3，jsdom（DSH harness 自带）；沙箱禁止 CDP 真实浏览器/像素/真实计时/Web Audio。
- **验证路径**：七套脚本（§4 约定）+ 独立对抗性抽查脚本 + 代码/架构静态审计。日志：`logs/teamflow/tf-mt8sdf2z-g6g49x/qa-r13-*.log`。
- **被测代码**：`game.js`（animMs 构造选项、clearing 子阶段、tick 重排、输入守卫、快照 additive 字段）、`ui.js`（ANIM_* 常量、pulseBrightness、三分支渲染分发、reduced-motion 降级）、三者测试脚本。

## 2. 用例与结果（七套全绿）

| 套件 | 结果 | 关键覆盖 |
|---|---|---|
| verify-game | **74/74** | 新增 ①动画接管(AC-1/8/10) ②输入全拒 reason=clearing(AC-4) ③完结=clearLines(merged)逐格一致+clear恰1次(AC-2/3) ③b完结帧升级次序 hardDrop→clear→levelUp(AC-3/9) ④animMs:0 与 240 步进完逐点等价(AC-7) ⑤时钟冻结 4×250 无连降(AC-5) ⑥暂停定格/续播(AC-4) ⑦完结帧出生碰撞才 OVER、无残留、restart 清场(AC-6) ⑧默认 240/非法值兜底(AC-1/9) |
| verify-ui | **12/12** | ANIM_MS=240、ANIM_PEAK=1.25、ANIM_PEAK_T=0.40；pulseBrightness 端点(B0=1/B1=0)/峰值/值域/渐亮帧增量单调递减/淡出单调不升 |
| verify-audio | **23/23** | 音效引擎回归 |
| verify-persist | **11/11** | 持久化回归 |
| verify-constants | **2/2** | VERSION 三模块一致（未 bump，符合约束） |
| assembly-check | **ALL PASSED** | 装配/自包含/音频文件审计 |
| qa-e2e-jsdom | **248/248** | 237 既有断言零回归（buildEnv 注入 animMs:0）+ r13 新段 11 项（4 行消→接管→进度→塌缩计分 800→新块；r12 协同：动画期 P 暂停定格 0.25→空格续播→完结） |

## 3. 对抗性抽查（独立脚本 spot-ac13-rows.cjs，4 组断言全过）

1. **2/3 行动画路径 clear 恰 1 次**（补 E2E 只覆盖 1/4 行的盲区）：音效序列=hardDrop→clear，动画期无 piece/计分冻结/满行保留，完结记分 300/500 正确。
2. **2/3 行完结棋盘/spawn 与即时路径逐格一致**（AC-2/AC-7 多行等价）。
3. **快照字段卫生**：非动画期 clearedIndices/animProgress 恒 `null`（非 undefined）；动画期为数组 + 数值∈[0,1]。
4. **dt clamp 边界**：单帧 tick(250)（clamp 后 250≥240）合法完结，无跨帧余量问题。

## 4. 架构轻检（M3 质量门禁）

- **蓝图符合性**：本轮无独立 blueprint JSON 注入，对照 dev 摘要与技术方案核验——clearing 子阶段按蓝图抽为引擎唯一时钟/可变点（`state.clearing` + `completeClearing`），即时与动画双路径共享唯一 `finishLock` 实现（无双份维护漂移）；ui 三分支分发（动画帧/完结帧抑制白闪/既有白闪）逐一在代码中确认；mk() animMs:0 基线迁移后既有断言逐字保留；E2E 新段独立 createUI(animMs:240)。行为断言全绿即证无蓝图偏离。
- **重复实现**：未发现（sfx('clear') 双路径恰 1 次由共享实现保证；pulseBrightness 单一纯函数；快照 additive 字段单点定义）。
- **抽象缺口**：1 项 P3 观察，见缺陷表。
- **既有结构损坏**：未发现；assembly-check / file:// 管线 E2E 全绿。

## 5. 缺陷清单

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| QA-13-01 | P3 | 架构 | 单独修改 game.js `animMs` 默认值 240→180 且不更新 verify-game ⑧（verify-ui 仍钉死 ANIM_MS=240，且无跨模块一致性断言，对比 VERSION 有 verify-constants） | 引擎默认与 UI 常量的"同源"注释有自动化钳制 | 无跨模块断言；漂移时直接 createGame 调用方与 UI 时序不一致（现状 UI 恒显式传值，风险已基本钳制，故仅 P3） | AC-1/AC-9 |

**未发现 P0/P1/P2 缺陷。**

## 6. 人工补测清单（环境限制，非交付缺陷）

| # | 验收项 | 方法 | 工具 |
|---|---|---|---|
| M1 | AC-1 亮度脉冲观感（ease-out-quart 渐亮 1→1.25→熄灭、1~4 行同步） | file:// 打开 index.html，连续消 1/2/4 行目视节奏与亮度峰值 | Chrome/Edge，截图+慢放 |
| M2 | AC-2/取代点 完结帧无"脉冲+事后闪"双重反馈 | 消 4 行观察动画完结帧是否无白闪跳变 | DevTools 渲染 + 帧定格 |
| M3 | AC-4 动画中途暂停冻结/续播视觉（P/空格/Esc/设置弹层自动暂停） | 动画中途暂停，确认进度定格；恢复后续播至完结 | 真实浏览器手动操作 |
| M4 | AC-7 reduced-motion 降级 | DevTools Rendering → prefers-reduced-motion: reduce 模拟，消行应为瞬时无动画 | DevTools |
| M5 | AC-8 FPS≥55 整帧渲染 | 连续消 4 行观察性能面板 FPS，确认无长任务/布局抖动（Canvas alpha/亮度仅重绘 ≤4 行） | DevTools Performance |
| M6 | AC-3 音效真实发声（clear 首帧恰 1 次/levelUp/gameOver 次序） | 实际游玩听感；引擎事件序列已自动化断言 | 真实浏览器音频 |

## 7. 总结

- r13 交付功能与契约全部满足：动画=纯视觉时延（T=240ms），数值/音效/状态序列零副作用，暂停（P/空格/r12 弹层）冻结续播，reduced-motion/animMs:0 与即时消除逐点等价，OVER 顺序正确，UMD 契约/VERSION 未变。
- 回归：237 既有断言 + AC-01~19 全绿；七套出口达标；git 工作树干净（本轮新增 QA-REPORT.md 随阶段提交）。
- 遗留仅人工补测项（M1~M6）与 1 项 P3 维护性观察，均不阻塞验收。
- **结论：达到可验收标准（M5 验收门禁放行）。**