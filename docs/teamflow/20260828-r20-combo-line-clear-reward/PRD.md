# PRD — Combo 连消奖励（连续消行递增奖励分）

<!-- meta: summary="Combo 连消奖励：以锁定为触点，连续每次锁定清≥1 行则链索引逐次+1，该次得分恰各一次叠加 50×combo×level 的递增奖励（与普通消行分、T-spin 分各计一次），任何锁定清 0 行断链归零、重开归零。" -->

基线依赖：docs/teamflow/20260828-r19（Combo 连消奖励语义与验证基线：链/断链/混链/计分公式/事件契约/会话隔离约定——本需求为其验收续跑收口；注意 r19 引擎实现未合并主线，需在本分支重做实现，语义行为不得回归）与 docs/teamflow/20260828-r18（T-spin 六档计分叠加基线）、docs/teamflow/20260828-r22-ready-preview-blank（当前主线 READY 预览留白与 e2e 断言基线）。

取代：docs/teamflow/20260828-r19#AC-12（P1 Combo 指示器 UI）：本需求将该指示器移出验收范围，仅收敛引擎计分与验证收口；指示器归 P2 后续需求另行立项，不再作为本需求验收项。

## 1. 背景与目标

- **背景**：当前计分仅由单次消行行数（[100,300,500,800]×level）与 T-spin 六档驱动，连续消行无额外激励，高分策略单一、对局深度不足。r19 已完成 combo 语义设计、引擎实现与 QA 验证（AC-1~11 通过、0-diff 红线成立），但验收未通过（qa-e2e 三处消行计分断言仍为旧两轴期望未随 combo 轴更新）且代码未合并主线；另 r19#AC-12 的 P1 指示器与需求本源「连消递增奖励分」无关，属范围膨胀。本需求（r20）在同一需求语义上重做实现并完成验收收口。
- **目标**：
  1. combo 链语义正确：连续锁定清行递增、断链归零、指定操作不断链、普通/T-spin 可混链；
  2. 计分 = 普通消行分 + T-spin 分 + comboBonus 三者恰各一次，且 ×level、不进等级进度；
  3. 会话隔离：combo 为会话内存值不入持久化，restart/OVER 归零，onGameOver 透出正确总分；
  4. 零回归：断链后首消与孤立单消得分与 r18 基线逐值一致，T-spin 六档逐值不变；
  5. 七套验证全绿（含 qa-e2e 三处期望修正），0-diff 红线成立，产品版本 v3.6 验收时登记。

## 2. 用户故事与验收标准

### US1 连消玩家：连续消行越连越值
> 作为技术型玩家，我连续多次消行时应获得逐次递增的奖励分，而操作（换块/旋转/踢墙/软降）不打断我的连击节奏。

- **AC-1 连消递增链**：以「锁定」为触点；连续每次锁定清≥1 行时，链内组合索引逐次 +1（链内第 1 次消行锁定 = combo 0）。verify-game 用固定种子构造连续消行场景断言索引序列 0→1→2→3。
- **AC-2 断链归零**：任意一次锁定清 0 行 → combo 归 0（含 No-line T-spin：T 形锁定但清 0 行亦判定断链）。断链后下一次清行锁定重新从 combo 0 起算。
- **AC-3 与操作无关**：hold、旋转（含踢墙）、软降、硬降均不改变当前链态（不递增、不归零）；链态仅由「锁定是否清行」驱动。逐操作构造用例断言 combo 索引不变。
- **AC-4 跨 T-spin 混链**：普通消行锁定与 T-spin 消行锁定可混合续链，combo 索引跨类型连续递增（如 普通1 行 → T-spin Full 2 行 → 普通1 行 为连消链 0→1→2）。

### US2 计分玩家：一次锁定三轴各计一次
> 作为关注分数的玩家，我每一次锁定的入账应可精确核算：普通消行分、T-spin 分、combo 奖励各一次，等级越高奖励越高。

- **AC-5 递增公式**：comboBonus = COMBO_BONUS_BASE × combo × level，COMBO_BONUS_BASE = 50（单一事实来源于 game.js 顶部常量，同步 scripts/verify-game.cjs）；combo=0 时 comboBonus=0。样例：L1 链内第 1 次锁定（combo0）消 1 行 = 100×1 + 0 = 100（与 r18 逐值一致）。
- **AC-6 三轴叠加恰一次**：一次锁定的本次得分增量 = 普通消行分（消 1/2/3/4 行对应 [100,300,500,800]×level；按本次行数取档）+ T-spin 分（T-spin 锁定命中时按 r18 六档 full[100,800,1200,1600]/mini[0,100,200,1600]×level 取档）+ comboBonus，三者各计一次、无重复无遗漏；comboBonus 不再次参与等级进度（等级进度仍仅由累计消行数驱动，与 r18 一致）。样例：L1 链内第 4 次锁定（combo3）消 4 行 = 800×1 + 50×3×1 = 950；T-spin 场景（r18 六档样例）得分 = 档位分 + comboBonus 恰一次。
- **AC-7 等级倍率**：comboBonus 按当前 level 放大。样例：L2 链内第 4 次锁定（combo3）消 1 行 = 100×2 + 50×3×2 = 500；L2 链内第 2 次锁定（combo1）消 1 行 = 100×2 + 50×1×2 = 300。
- **AC-8 结算载荷与事件**：lockFlow 消行结算载荷透出 combo 索引与 comboBonus 增量（类比 r18 tspin 的 additive 载荷，快照/事件契约新增字段不破坏既有字段）；onScore 等事件序列与 r18/r19 契约一致；onGameOver 透出总分 = 全部锁定得分增量之和（含全部 comboBonus）。

### US3 重置玩家：重开即清零
> 作为对局玩家，我重新开始或游戏结束后不应残留上次的连击状态。

- **AC-9 会话隔离**：restart 与 OVER 后 combo 归 0（重开后首次清行锁定为 combo0、comboBonus=0）；combo 为会话内存值，不入持久化（刷新/重载后不恢复此前链态，持久化快照字段不含 combo）。

### US4 回归玩家：既有计分零变化
> 作为守成玩家，我单次消行/单独 T-spin 的既有得分不应被 combo 改动影响。

- **AC-10 零回归**：断链后首消/孤立单消（combo0）消 1/2/3/4 行得分与 r18 基线逐值一致（[100,300,500,800]×level）；T-spin 六档逐值不变（r18 单元样例全量复跑通过）。
- **AC-11 随机 50 局 soak**：verify-game 连续 50 局随机对局（每局 ≥50 次锁定），全程无状态漂移/无 NaN/无异常；任意抽样局的「逐次锁定得分之和」== 该局 onGameOver 总分。
- **AC-12 七套全绿**：verify-game（含新增 combo 用例段：链递增/断链/不断链操作/混链/公式样例/事件/soak）、qa-e2e-jsdom、verify-ui、verify-audio、verify-constants、assembly-check 全部通过；qa-e2e 三处旧两轴消行计分断言期望随 combo 轴修正（r19 QA 实测参考：AC-06.5 4行 900→950、HUD 分数 900→950、L2 消 1 行 +200→+500；期望值必须按各场景实际链态由公式推导并复核，禁止照抄旧期望）；game/audio/persist 0 行 diff（仅允许 game.js、scripts/verify-game.cjs、scripts/qa-e2e-jsdom.cjs 差分）；代码 VERSION 三模块一致（不变）。

## 3. 范围与非目标

- **范围内（P0）**：combo 链语义（AC-1~4）、comboBonus 计分与等级倍率（AC-5~7）、结算载荷/事件/总分（AC-8）、会话隔离（AC-9）、回归与 soak（AC-10~11）、七套全绿收口（AC-12）。
- **非目标**：Combo 指示器 UI（取代 r19#AC-12，归 P2 后续需求）；B2B（Back-to-Back）奖励；Perfect Clear 奖励；combo 值持久化；combo 参与等级进度。

## 4. 交互流程摘要

锁定（lock）→ 判定本次消行数 n：n≥1 → 链内 combo 索引 +1（链内第 1 次=0），本次得分 = 普通消行档位（[100,300,500,800]×level，按 n 取档）+ T-spin 档位（若 T-spin 锁定，r18 六档不变）+ 50×combo×level；n=0 → combo 归 0，仅普通/T-spin 得分。hold/旋转（含踢墙）/软降/硬降/重力下落均不改链态。restart/OVER → combo 归 0。onGameOver → 总分透出（含全部 comboBonus）。链态为会话内存值，不随持久化存读。

## 5. 关键数值规格（数值单一事实来源 → game.js 顶部常量）

| 项 | 值 | 说明 |
|---|---|---|
| COMBO_BONUS_BASE | 50 | comboBonus = BASE × combo × level；必须同步 scripts/verify-game.cjs 断言 |
| combo 索引 | 链内第 1 次清行锁定 = 0，逐次 +1 | 触点=锁定；断链/restart/OVER 归 0 |
| 普通消行档位 | [100,300,500,800] × level | 按本次消 1/2/3/4 行取档，r18 不变 |
| T-spin 档位 | full[100,800,1200,1600] / mini[0,100,200,1600] × level | r18 六档逐值不变 |
| 叠加规则 | 三轴各计一次 | 无重复、无遗漏；comboBonus 不进等级进度 |

## 6. 优先级

- **P0**：AC-1~8（链语义与计分）、AC-9（会话隔离）、AC-10~11（回归/soak）、AC-12（全绿收口）。
- **P1**：无。
- **P2**：Combo 指示器 UI（另立需求，非本需求范围）。

## 7. 依赖与风险

- **依赖**：r18 事件契约与 T-spin 计分基线；r22 当前主线（READY 预览与 e2e 断言基线，含 r15 取代记录）；r19 语义与 QA 实测结论（三处期望修正方向已实测给出参考值）。
- **风险**：
  - qa-e2e 期望值必须按场景实际链态推导（r19 实测 950/500 均对应链内第 4 次清行锁定 combo3 的链态），禁止硬编码错链态 → 以 verify-game 公式样例为权威，qa-e2e 期望与其对齐；
  - 0-diff 红线：除允许差分文件外其余模块 0 行 diff，防止实现越界触碰 audio/ui/persist；
  - 指示器缺失不再阻断（已移出范围，取代 r19#AC-12）。

## 8. 里程碑

- **M1（P0）实现与自测**：game.js 实现 combo 链与计分（常量/纯函数）、verify-game 新增 combo 用例段（链递增/断链/操作/混链/公式样例/事件/soak）、qa-e2e 三处期望修正 → 本地七套全绿。
- **M2（P0）QA 复验与验收**：QA 复验 AC-1~12 + 0-diff 红线 + VERSION 一致 → 产品验收；通过后登记产品版本 v3.6 至 docs/teamflow/memory.md，并同批提交/合并（见 §9）。
- **M3（P2）**：Combo 指示器 UI 另立需求（后续）。

## 9. 工程约束

- **分支**：保持当前分支 `feat/combo-line-clear-reward`（宿主已创建，基于含 r22 合并的主线）；不得新建或切换其他分支。
- **未提交改动**：工作区仅有未跟踪的 `?? docs/teamflow/20260828-r20-combo-line-clear-reward/`（本需求任务夹，含 meta.json，runId=tf-mtcomxpq-heissu）——保留不清理；本需求全部产物（PRD/TECHNICAL/QA-REPORT/ACCEPTANCE）写入该夹，夹建后不可变、不归档不升版。
- **P0 文件范围（允许差分）**：`game.js`、`scripts/verify-game.cjs`、`scripts/qa-e2e-jsdom.cjs`（仅修正三处消行计分期望：AC-06.5 4行 900→950、HUD 分数 900→950、L2 消 1 行 +200→+500）。
- **0-diff 红线**：`audio.js`、`ui.js`、`style.css`、`index.html`、持久化逻辑 0 行 diff；verify-ui / verify-audio / verify-constants / assembly-check 全绿；代码 VERSION 三模块一致（不变）。
- **提交时机**：遵循 r19 约定「feat/feature 不提交、验收后同批」——实现与任务夹改动验收通过后同批提交并合并，不提前提交。
- **日志**：命令输出日志写入 `logs/teamflow/<runId>/`，不得散落项目根；TeamFlow 契约文档仅写 `docs/teamflow/` 下；不得改动 AGENTS.md 及历史文档夹。
- **产品版本**：验收通过时登记产品版本 v3.6（docs/teamflow/memory.md），代码 VERSION 不改。