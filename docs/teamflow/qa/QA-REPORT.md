# 俄罗斯方块（Tetris）简化版 — QA 测试报告（v2.6 · 应用层持久化 · 技术驱动改造）

- **被测交付**：`products/tetris/` v2.6（本地持久化层，分支 `feat/persistence-localStorage2`，对照实验）
- **测试执行**：QA 独立复核（run `tf-mt317a5e-0iwvuy`）
- **规格依据**：技术变更单 `docs/teamflow/technical/changes-persist.md`（v2.6-tc-1）§3/§5 + PRD v2.6 增量（AC-16 最高分 / AC-10.5 设置持久化）
- **上一版**：v2.5（已归档 `docs/teamflow/history/v2.5/QA-REPORT.md`）

---

## 0. 结论（先行）

> **复验更新（2026-08-18，修复 commit `f508f2e` 后独立复跑）**：P1 缺陷 BUG-P1-1 **已修复并复验通过**。

**初次结论（评审时，供追溯）：** ❌ 未达到可验收标准 —— 发现 1 项 P1 功能缺陷（核心交付功能在真实浏览器环境静默失效）。

初次结论时六套既有验证 + verify-persist 本身全部通过（52/23/7/2/装配ALL/188 + 10/10），但这些脚本**均未走真实 localStorage 适配路径**：verify-persist 注入的是带 `get/set/remove` 方法的自定义 backing，与生产适配器实际调用 API 不一致，导致单元测试全绿而真实浏览器表现完全失效。QA 独立对抗复现确认（见 §3 缺陷表）。

**复验结论（修复后）**：`persist.js` 新增 `toStorageAdapter` 归一化——`getItem/setItem/removeItem` 与 `get/set/remove` 两种存储形状统一映射到内部调用面，`createStorage` 命中本地存储后经归一化接入、`createPersistence` 注入的存储同样归一化；`verify-persist.cjs` 补**真实 Web Storage 形状对抗用例**（仅 `setItem/getItem/removeItem`、无 `get/set/remove`，10→11 全绿），复现用例转绿。修复后复跑全表：verify-persist **11/11** + 六套既有全绿（**52/23/7/2/装配ALL/188**），AC-16/AC-10.5 在真实浏览器路径有效。

---

## 1. 测试范围与环境

- **环境限制**：沙箱禁止启动带 CDP 的真实 Chrome/Edge（Playwright/Puppeteer/chromedriver），真实浏览器听感/像素/真机 file:// 刷新不可行 —— 此限制不阻断本缺陷判定（本缺陷可用 Node 模拟真实 localStorage API 完整复现）。
- **已执行**：六套既有验证（`verify-game/audio/ui/constants/assembly-check/qa-e2e-jsdom`）+ 新增 `verify-persist` + QA 独立对抗探针（生产路径模拟）。
- **代码审查**：`persist.js`（359 行核心新增）、`ui.js` 持久化接入块、`index.html` 装配/脚本序、`assembly-check.cjs` 审计增量。
- 所有命令输出落盘 `logs/teamflow/tf-mt317a5e-0iwvuy/qa/`。

## 2. 用例与结果

| 套件 | 预期 | 实际 | 状态 |
|---|---|---|---|
| verify-game | 52 | 52 | ✅ PASS |
| verify-audio | 23 | 23 | ✅ PASS |
| verify-ui | 7 | 7 | ✅ PASS |
| verify-constants | 2 | 2 | ✅ PASS |
| assembly-check | ALL PASSED | ALL PASSED | ✅ PASS |
| qa-e2e-jsdom（含 file:// 管线） | 188 | 188 | ✅ PASS |
| verify-persist（新增） | 全绿 | 复验 11/11（含真实 Web Storage 形状对抗用例） | ✅ PASS（复验；初次 10/10 未覆盖真实适配，见 §3） |
| QA 对抗·生产路径（真实 localStorage API） | — | **复现 P1 → 修复后转绿**（对抗用例入 verify-persist） | ❌ FAIL（初次）→ ✅ PASS（复验） |

> ⚠️ 说明：v2.5 基线为空口径 188（本 tech 分支 E2E 未扩展持久化断言，符合变更单「不新增 PRD AC + 以 verify-persist 为持久化锚点」既定取舍）。注入上下文中的「211/211（含 AC-16 用例）」为对照分支 `feat/persistence-localStorage1` 口径，非本分支。

## 3. 缺陷清单

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| BUG-P1-1 | **P1**（✅ 已修复并复验，commit `f508f2e`） | 持久化层 `persist.js` `createStorage` 适配器 | 构造真实浏览器 `localStorage`（`setItem/getItem/removeItem` 三方法，无 `set/get/remove`）作为 `window.localStorage`；`createStorage().available` 为 true，但 `set/get` 静默失效：`saveHighScore(150)` 后底层无任何写入，重新实例 `load().highScore` 仍为 0 | 可用 localStorage 时应真实读写、跨刷新恢复最高分与四设置（AC-16/AC-10.5） | `createStorage()` 探测用 `setItem/getItem/removeItem`，返回适配器内部却调用 `store.set/store.get/store.remove`（内存 Map 风格 API，**原生 localStorage 不存在**）→ 每次调用抛 `TypeError` 被 try/catch 静默吞掉；`available` 因探针成功为 true 故**不降级内存**，最终「探针显示可用 + 实际全空」——真实浏览器中持久化完全静默失效，`reload` 最高分/设置全部丢失。**修复**：`toStorageAdapter` 统一归一化两种形状 + 真实 Web Storage 对抗用例转绿（11/11） | AC-16 / AC-10.5 / 变更单 §3「读写包 try/catch、可用则真实持久化」 |
| 无 | — | — | — | — | — | — |

> **根因**：`createStorage` 的能力探测键与适配器方法名不一致——探测用浏览器原生 API（`setItem/getItem/removeItem`），读写却调用 Map 风格的 `set/get/remove`。verify-persist.cjs 注入的 backing 恰好实现了 `get/set/remove`，故单测全绿而真实适配断裂。唯一受影响方为**应用层持久化**；引擎 game/audio、UI 布局、玩法零影响。

## 4. M3 轻量架构核验

- **蓝图对齐**：分层（storage 适配 → 持久化门面 → sanitize 纯函数）与变更单 §3 一致；`ui.js` 仅消费 `load/save*` 不散落 setItem ✓；装配序 persist→audio→game→ui ✓；可选依赖缺失即旧版 ✓；dispose 链 `persist.dispose()` ✓。
- **重复实现**：无（sanitize/storage/persist 均单处）。
- **该抽象未抽象**：无。
- **架构缺陷（P1）→ ✅ 已修复（commit `f508f2e`）**：`createStorage` 适配器内部 API 与其声明契约不一致（探测/读写方法名漂移），属「实现与契约偏离」——直接导致 §3 BUG-P1-1。已通过 `toStorageAdapter` 归一化修复（探测与调用面统一为 Web Storage API 形状），修复后复验通过。

## 5. 人工补测清单（环境限制，非交付缺陷）

| 项 | 验收标准 | 验证方法 | 工具 |
|---|---|---|---|
| 真机 file:// 刷新恢复最高分/设置 | 刷新后 HUD 最高分与四设置恢复 | 双击 index.html 玩局→刷新→断言恢复 | 真实浏览器（人工） |
| 最高分视觉呈现 AC-16.9 | HUD 最高分显示正确、样式清晰 | 目测 | 真实浏览器 |
| 隐私模式降级 | 无存储时行为等同旧版、无报错 | 隐私/无痕窗口观察 | 真实浏览器 |
| 读屏可访问 | 最高分/恢复不破坏 a11y | 读屏 | 屏幕阅读器 |
| 双分辨率 | 新增 `#stat-hi` 在不同分辨率不破版 | 目测 1920×1080 / 1366×768 | 真实浏览器 |

## 6. 建议（开发修复方向，供参考）→ ✅ 已实施（commit `f508f2e`）

`createStorage` 返回值应统一为真实 Storage 的调用面（`setItem/getItem/removeItem`），或把内存 Map 适配为其同构子集后**由同一薄层把 `set/get/remove` 映射到 `setItem/getItem/removeItem`**；并补一条走真实 localStorage API 形状（无 `set/get/remove`）的对抗用例到 verify-persist，防止此类契约漂移再逃逸。修复后需复跑 §2 全表 + 本报告 §3 复现用例转绿。

---

*复验（2026-08-18，commit `f508f2e`）：本报告初始结论为「缺陷待修复」，现已修复并复验通过——详情见 §0 复验更新与 §2/§3 状态列。*
