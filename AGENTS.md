# AGENTS.md — 团队协作守则与产品记忆锚点（tetris 产品线）

> **任何新加入本产品的 Agent（团队成员）必须先通读本文件**，再按 §2 文档索引读取相关文档与任务卡片，
> 不要在未了解产品现状前自行全量探索代码。
> 维护者：团队本身 + TeamFlow 研发流水线（TeamFlow 仅维护文末 teamflow 托管区与 docs/teamflow/；其余内容为团队资产）。

---

## 1. 产品是什么

- **产品**：俄罗斯方块（Tetris）简化版 —— 自包含静态 Web 小游戏，科技玻璃风格（深色 + 毛玻璃 + 霓虹）。
- **产品根**：`products/tetris/`（工作区产品线约定：`products/<product>/`）。
- **交付形态**：双击 `index.html` 即玩（`file://`），零构建、零外部依赖、离线可用。
- **当前版本**：v2.4（迭代历史与详情见 §2 索引的文档，不在此累积流水账）。

## 2. 文档索引（按职责）

| 职责 | 位置 | 说明 |
|---|---|---|
| **摘要索引** | `docs/teamflow/SUMMARY.md` | **先读**：每文档用途/关键章节/读取指引（token 预算） |
| 产品入口 | `README.md` | 玩法、操作、运行方式、验收速览 |
| 需求（PRD） | `docs/teamflow/prd/PRD.md` | **验收唯一依据**：AC 清单 + §5 数值规格（当前版本正文，历史见 history/） |
| 设计 | `docs/teamflow/design/DESIGN.md` | 视觉 token / 交互 / 动效 / 可访问性规范 |
| 架构 | `docs/teamflow/architecture/ARCHITECTURE.md` | 工程方案；注意：TS+Vite 为**可选升级路径**，实际交付为扁平纯 JS |
| 技术方案 | `docs/teamflow/technical/TECHNICAL.md` | 模块接口契约（UMD 对齐）与任务拆分参考 |
| QA | `docs/teamflow/qa/QA-REPORT.md` | 测试报告 + 人工补测清单 |
| **产品记忆／迭代历史** | **`docs/teamflow/memory.md`** | **权威迭代记录**：版本/需求/结果/待办（TeamFlow 维护，按需读取，不注入） |
| **已知待办** | **`docs/teamflow/memory.md` §待办** | 下一批需求与遗留事项（不放在本文件） |
| 历史归档 | `docs/teamflow/history/<版本>/` | 已发布版本的文档快照（日常不读，仅供追溯） |

## 3. 团队角色与标准流程

**角色**：产品经理 / UI/UX 设计师 / 架构师 / 高级全栈工程师 / QA 测试工程师。

**标准流程**（TeamFlow 流水线）：
`需求 → PRD（产品经理）→（UI 改造时）UI/UX 设计 →（新项目时）架构规划 → 技术方案（高级全栈）→ 并行开发 → QA 功能测试 → 产品验收（产品经理）`

**产出物落盘约定**（新迭代必须遵守，全部收口到 `docs/teamflow/`）：
| 环节 | 落盘位置 |
|---|---|
| PRD | `docs/teamflow/prd/PRD.md`（迭代时升级版本号 + 当前版一行修订，旧版归档 history/） |
| 设计 | `docs/teamflow/design/DESIGN.md` |
| 架构 | `docs/teamflow/architecture/ARCHITECTURE.md` |
| 技术方案 | `docs/teamflow/technical/TECHNICAL.md` |
| QA 报告 | `docs/teamflow/qa/QA-REPORT.md` |
| 产品记忆 | `docs/teamflow/memory.md` |

**完成度自查**：每个环节交付前必须对照自身职责清单自查，**未完成不得流转到下一环节**；
架构师对新项目还必须**实际初始化脚手架文件**（目录树、package.json 等）与 AGENTS.md 草稿，而不只是输出方案文档。

## 4. 工程约定（本产品）

- **代码形态**：扁平纯 JS（`game.js` / `audio.js` / `ui.js` / `style.css` / `index.html`），UMD 契约（`window.TetrisGame` / `window.TetrisAudio` / `window.TetrisUI`），零构建、零运行时依赖。
- **数值单一事实来源**：`game.js` 顶部常量（对应 PRD §5）+ `audio.js` 顶部 `SFX_DEFS`（对应 PRD §5.2/TECHNICAL §2.2）；改动必须同步更新 `scripts/verify-game.cjs` / `scripts/verify-audio.cjs` 单测。
- **验证命令**（产品根下执行）：
  - `node scripts/verify-game.cjs`（引擎，含 onSfx 事件序列）
  - `node scripts/verify-audio.cjs`（音效引擎，v2.0 新增）
  - `node scripts/verify-ui.cjs`（UI 契约）
  - `node scripts/verify-constants.cjs`（VERSION 三模块一致）
  - `node scripts/assembly-check.cjs`（装配 + 自包含审计 + 音频文件审计）
  - `node scripts/qa-e2e-jsdom.cjs`（DOM E2E + file:// 管线，需 jsdom）
- **风格**：纯函数优先、工厂函数 + 闭包（不用 class）、不可变棋盘、`dispose()` 统一清理。

<!-- teamflow:begin -->
## TeamFlow 托管区（本块由 TeamFlow 自动维护，团队请勿手改）

- **产品记忆/迭代历史/待办**：`docs/teamflow/memory.md`（唯一权威，TeamFlow 追加，不写进 AGENTS.md）
- **需求/任务/缺陷 backlog**：持久化镜像 `$DSH_HOME/teamflow/<workspace>/`（按工作区/项目隔离）
- **规则**：TeamFlow 只维护本块、`docs/teamflow/` 与 `logs/teamflow/`；本文件其余内容（§1~§4）为团队资产，禁止在迭代中追加流水账（§5/§6/§7 已移除，相关数据在 memory.md / history/）。
<!-- teamflow:end -->
