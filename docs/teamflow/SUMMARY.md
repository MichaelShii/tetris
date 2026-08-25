# docs/SUMMARY.md — 文档摘要索引（token 预算制的核心：先读摘要，按需精读）

> 用法：任何 Agent 进入本产品时，除 AGENTS.md 外**先读本文件**，按需打开对应文档的对应章节，
> **不要无目的地全量通读**。每份文档标注了：用途 / 关键章节定位 / 体积提示。

## 文档清单

| 文档 | 用途 | 关键章节 | 体积提示 |
|---|---|---|---|
| `prd/PRD.md` | **验收唯一依据**：AC-01~19 全集 + 数值规格（v2.9 踢墙旋转开关系统·默认开；v2.8 无踢墙（现为开关关闭态）；v2.7 7-bag；v2.5 BGM；v2.4 ghostY 防御） | §2 用户故事与验收标准（AC 全集）、§5 数值规格（计分/等级/速度/音效/BGM/幽灵块/开关/7-bag/旋转） | 大（~260 行）：按需读 AC 相关条目 |
| `teamflow/memory.md` | **产品记忆**：迭代历史 + 当前迭代记忆（v2.9 踢墙旋转开关系统）与待办 | 全文 | 中：PM/架构/QA 迭代时读 |
| `teamflow/acceptance/ACCEPTANCE-v2.7.md` | **产品验收报告**：v2.7 7-bag 随机算法逐条核对 + 架构核验 + 遗留事项 | 全文 | 小：验收结论 |
| `design/DESIGN.md` | 视觉 token / 交互 / 动效 / a11y（v2.9 踢墙旋转开关：信息面板设置区新增 `#btn-wallkick` 开关，默认开；旧版归档 history/） | §5 token 与配色、§3.7 设置区开关、§8 交付清单 | 中：UI 相关阶段才需要 |
| `architecture/ARCHITECTURE.md` | 工程方案（注意：TS+Vite 为可选升级路径，未执行） | 头部"实际交付偏差"注记 | 小：工程决策才需要 |
| `technical/TECHNICAL.md` | 模块接口契约（UMD 对齐）+ 任务拆分参考 | §2 数据模型、§3 API 契约、§6 边界情况 | 大：开发/技术阶段必读契约章节 |
| `qa/QA-REPORT.md` | 测试报告 + 人工补测清单 | 结论章节 + §6 人工补测清单（v2.1 章置顶；v2.0 历史章 §6.2 沿用） | 大：验收/回归时读结论即可 |
| `README.md` | 产品入口：玩法/操作/运行/验收速览 | 全文 | 小 |
| `AGENTS.md`（产品根） | 团队守则 + 产品记忆 | §1 现状、§5 迭代历史、§6 待办 | 小：必读 |

## 版本归档规则（防文档臃肿）

- `docs/` 下的活文档**只保留当前版本**（AC 全集保留，但旧 AC 表述应在迭代时压缩）。
- 每轮迭代**更新活文档之前**，先把当前版本快照复制到 `docs/history/<版本号>/`（如 `docs/history/v1.0/`），
  历史版本不再被任何 Agent 日常读取（仅供追溯）。
- 变更线索以 `AGENTS.md §5 产品记忆` 与各文档头部修订记录为准，不需要回读历史快照。
- 注：v1.0 快照未在迁移时留存（当时无归档机制），`docs/history/` 从 v2.0 起开始积累；v2.0 快照已于 v2.1 迭代开始前归档至 `docs/history/v2.0/`；v2.1 快照已于 v2.2 迭代开始前归档至 `docs/history/v2.1/`；v2.2/v2.3 快照已分别归档至 `docs/history/v2.2/`、`docs/history/v2.3/`；v2.4 快照已于 v2.5 迭代开始前归档至 `docs/history/v2.4/`；v2.5 快照已归档至 `docs/history/v2.5/`；v2.7 PRD/QA 报告已归档至 `docs/history/v2.7/`；v2.8 PRD/DESIGN/TECHNICAL/QA-REPORT 已完整归档至 `docs/teamflow/history/v2.8/`。活文档为当前版（v2.9，踢墙旋转开关系统，已验收通过 2026-08-18）。

## 读取指引（token 预算）

| 阶段 | 应读内容 | 不必读 |
|---|---|---|
| 产品经理（迭代 PRD） | AGENTS.md §1/§5/§6 + memory.md 产品记忆 + PRD 头部修订记录 + 本次变更相关 AC | 旧 AC 全文展开 |
| 技术方案 | AGENTS.md §4 + TECHNICAL 契约章节 + PRD 本次变更 | PRD 旧 AC 细节 |
| 开发 | AGENTS.md §4 + TECHNICAL 契约 + 任务卡 + 任务关联 AC | DESIGN/ARCHITECTURE 全文 |
| QA | AGENTS.md §4 + PRD 相关 AC + 既有 QA 结论 | 旧报告细节 |
| 验收 | AGENTS.md §5/§6 + PRD 修订记录 + QA 结论 | 全文精读 |

---
*维护者：TeamFlow 流水线（每次迭代在 PRD 更新时同步修订本文件）。*
