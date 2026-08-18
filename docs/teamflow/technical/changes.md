# 技术变更单（tech 技术驱动改造）— 工程自检脚本 verify-constants.cjs

- 变更单版本：v2.2-tc-1
- 状态：**✅ 已关闭（产品验收 2026-08-16）**：QA 独立复跑全绿（51/19/7/装配/177 + 新脚本 2/2），无 P0/P1/P2 缺陷；本次验收按 §4/§5 契约通过，`memory.md` 状态已同步。P3 OBS-TC-1（回归计数口径）已一并更正为 51/19/7/177。
- 变更单位置：`docs/technical/changes.md`（本文件）；契约配套 `scripts/verify-constants.cjs` 的实现要点见本单
- 关联文档：`AGENTS.md`（§4 工程约定）、`docs/technical/TECHNICAL.md`（§2.2 版本记录）
- 性质：**技术驱动改造（tech）**，无用户可见功能/UI/AC 变化

---

## 1. 改造背景与目标（一句话）

三模块头部 `VERSION` 常量是全产品版本**单一事实来源**，但历史出现版本未同步的问题（OBS-11-3：VERSION 未升 2.1.0），现新增工程自检脚本，把「三模块 VERSION 一致 + 与 TECHNICAL §2.2 文档记录一致」固化为可回归断言的兜底防线。

## 2. 影响范围

| 项 | 影响 |
|---|---|
| **新增文件** | `scripts/verify-constants.cjs`（node:test 自检脚本，零依赖） |
| **只读引用** | `game.js` / `ui.js` / `audio.js` 头部 VERSION 导出；`docs/technical/TECHNICAL.md` §2.2 |
| **改动既有代码** | **无**（不触碰任何运行时代码/行为/UI/AC） |
| **文档** | 本变更单 + `TECHNICAL.md` 修订记录补一行 + `docs/teamflow/memory.md` 同步 |

## 3. 技术方案要点（改动思路）

- **单一事实来源**：`scripts/verify-constants.cjs` 顶部 `EXPECTED_VERSION = '2.2.0'`。
- **断言 1（模块一致性）**：`require('../game.js'/'../ui.js'/'../audio.js')` 读取各自导出的 `VERSION`，断言三者均 === `EXPECTED_VERSION` **且彼此相等**（防单模块漏升）。沿用既有 `verify-ui.cjs` §2 已证明的「Node require 三模块零 DOM/Audio 副作用」前提，`require` 不触发任何运行时副作用。
- **断言 2（文档-代码不漂移）**：`fs` 读取 `TECHNICAL.md`，定位 `### 2.2` 小节（至下一同/更高级标题止），断言该节包含 `EXPECTED_VERSION`——防止升级时「代码已升但文档未同步」或反之的漂移。
- **纯工程自检**：不加入任何构建/运行时路径；与既有五套 `verify-*.cjs` 并列，作为一个独立可跑的回归入口。

## 4. 行为兼容性影响

- **用户可见变化**：**无**。不改任何游戏逻辑、渲染、UI、快捷键、音效、装配；不新增 DOM/Canvas 输出；`index.html`/`style.css`/`game.js`/`ui.js`/`audio.js` 现有代码零改动。
- **PRD AC**：**不新增/不修改功能验收项**（技术驱动改造，无用户可见功能点）。
- **版本号**：本改造不升产品版本（仍为 v2.2），仅新增工程内自检工具；`VERSION` 常量保持 `'2.2.0'` 不因本单改变。

## 5. 回归与验证方案

| 项 | 命令（产品根下） | 预期 |
|---|---|---|
| 新脚本 | `node scripts/verify-constants.cjs` | 2/2 全绿（模块一致 + 文档一致） |
| 回归底线 | `node scripts/verify-game.cjs` | 51 项全绿 |
| 回归底线 | `node scripts/verify-audio.cjs` | 19 项全绿 |
| 回归底线 | `node scripts/verify-ui.cjs` | 7 项全绿 |
| 回归底线 | `node scripts/assembly-check.cjs` | ALL PASSED |
| 回归底线 | `node scripts/qa-e2e-jsdom.cjs`（需 jsdom） | 177 项全绿 |

- **回归基线实测（本单编制时已跑）**：新增 2/2 绿；既有 **51/19/7/装配/177** 全绿 → 底线成立。
- 开发交付后：QA 独立复跑上表全部命令，作为本单验收口径。

## 6. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| 脚本断言与文档口径写死（`EXPECTED_VERSION`） | 版本升级时若忘记同步本脚本将断言失败 | 属预期防线：版本升级必须同时升三模块 + TECHNICAL §2.2 + 本脚本，任一处漏改即红，倒逼同步 |
| `require` 触发浏览器全局副作用 | 污染 Node 测试环境 | 已验证三模块 Node 加载零 DOM/Audio 副作用（既有 verify-ui §2）；新增脚本与之一致 |
| 破坏既有验证 | 回归 | 脚本**纯新增**，不改任何既有代码；既有五套验证逐套复跑作回归底线 |

- **回滚**：删除 `scripts/verify-constants.cjs` 即可完全还原（不触碰任何既有文件）；文档同步项（TECHNICAL 修订记录、memory.md）为纯文本记录，可一键撤销。

## 7. 动手清单（开发口径）

- [ ] 仅新增 `scripts/verify-constants.cjs`；`game.js`/`ui.js`/`audio.js`/`index.html`/`style.css` **零改动**（可用 `git diff` 核验为单文件纯新增）。
- [ ] 五套既有验证 + 新脚本全部全绿（§5 表）。

---

## 8. 后续维护记录（v2.3，脚本随版本升级同步更新）

> 本节记录 `verify-constants.cjs` 在 v2.3 迭代中的同步维护，非新变更单；脚本本身仍为工程自检工具，无用户可见行为变化。

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-08-18（v2.3） | `EXPECTED_VERSION` **'2.2.0' → '2.3.0'** | 三模块 VERSION 随 v2.3 升版（AC-13/AC-14），脚本目标值同步，防漂移防线继续生效 |
| 2026-08-18（v0.9 迁移） | `TECH_FILE` 路径 **`docs/technical/TECHNICAL.md` → `docs/teamflow/technical/TECHNICAL.md`** | 文档收口到 `docs/teamflow/` 后，§2.2 断言需指向新路径；本次一并修正（否则脚本对迁移后文档断言失败） |
| 2026-08-18（v2.3） | 回归计数口径同步 | AGENTS.md §4 更新为 51/19/7/装配/188（E2E 主 178 + file:// 10），关闭 OBS-TC-1 遗留的旧计数表述 |

- **运行验证（v2.3 复跑）**：`node scripts/verify-constants.cjs` 2/2 绿 + 全套回归（51/19/7/装配/188）全绿。
- [ ] QA 登记回归结论，产品负责人确认后关闭本单，并同步 `memory.md`。
