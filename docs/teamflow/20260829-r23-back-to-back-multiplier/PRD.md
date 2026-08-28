<!-- meta: summary="Back-to-back 奖励倍率：连续无间隙的 Tetris / T-Spin Full 清除新增第四计分轴 b2bBonus=B2B_BONUS_BASE×level，并入结算与 r21 reward toast，链态为会话内存" -->

# PRD — Back-to-back 连续 Tetris / T-Spin 奖励倍率（r23）

基线依赖：docs/teamflow/20260828-r21-special-reward-toast 与 docs/teamflow/20260828-r20-combo-line-clear-reward（含 r18 T-spin 判定主线）；其既定行为不得回归。

## 1. 背景与目标

- **用户原话**：「Back-to-back 连续 Tetris/without 间隙的奖励倍率」「实现Back-to-back 连续 Tetris/without 间隙的奖励倍率」。
- **承接裁定（r22 轮需求分析已锁定，该轮在触点取消）**：按**方案 B** 实现——新增**独立加成计分轴**（定值基数 `B2B_BONUS_BASE × level` 追加，具体数值由本 PRD §5 定，需单一事实来源）+ 新增 **b2bChain 会话链态**。本需求即方案 B 的正式落地。
- **"倍率"口径**：不倍增既有消行/T-spin 基准分，而是以独立常量基数追加加分（与 r20 comboBonus 同为"加法加成轴"），既有分值轴一行不动。
- **目标**：连续（无间隙）Tetris 或 T-Spin Full 清除可获得成体系的额外奖励分；触发瞬间玩家**看得见**（并入 r21 reward toast）；链态会话隔离、数值单一事实来源、七套全绿零回归。
- **无取代项**：本需求为纯增量（新增第四计分轴 + reward toast 第三路载荷），不替换任何既有 AC 行为，故不声明「取代」。

## 2. 用户故事与验收标准

AC 编号仅对本任务夹有效（AC-1 起）。

### P0 — 计分本体（引擎 + 载荷 + 一致性）

**US-1 作为玩家，连续打出两个 Tetris（中间无其他清除），第二个 Tetris 应获得额外奖励分。**

- **AC-1 资格判定**：B2B 资格事件恰为两类——① Tetris（单次清除 4 行，非 T-spin 判定）；② T-Spin **Full** 且清除 ≥1 行（`kind='full'`）。T-Spin Mini、No-line T-spin、普通 1/2/3 行清除均不具资格。判定完全复用 r18 的 `tspinKind` 几何裁定（含原地/kick 旋转语义），不另写判定。
- **AC-2 链态机**：`b2bChain` 为布尔会话态，初始 `off`。迁移表（仅清除事件驱动）：资格事件 → `on`；任意**非资格**消行锁定（含 Mini 消行、普通 1/2/3 行）或清 0 行锁定（含 No-line T-spin）→ `off`（与 r20 combo 断链语义一致）；hold / 旋转（含踢墙）/ 软降 / 硬降 / 暂停 不改变链态；restart / OVER → `off`。
- **AC-3 加分时机与公式**：当且仅当「本次为资格事件 **且** 清除前 `b2bChain=on`」时触发恰一次 B2B 奖励：`b2bBonus = B2B_BONUS_BASE × level`（`level` 取本次清除发生时的当前等级，即升级前 level，与 r20 comboBonus 同约定）；链断后首个资格事件仅置链 `on`、不加分。
- **AC-4 数值单一事实来源**：`B2B_BONUS_BASE = 400` 为定值，唯一实现于 `game.js` 顶部常量区；`scripts/verify-game.cjs` 与 `qa-e2e-jsdom.cjs` 期望推导引用同一值；与本 PRD §5 一致（r20 同款约束：数值改动必须同步两处单测）。
- **AC-5 四轴叠加恰一次**：普通消行分 / T-spin 分 / combo 分 / B2B 分同帧独立叠加，各恰一次，不互斥、不重复、不抵消；B2B 分**不进等级进度**（等级仍仅由累计消行驱动，`levelForLines` 语义不变）。
- **AC-6 载荷与总分一致性**：清除事件载荷新增 `b2bBonus`（触发时 >0，否则 0/缺省=全 0 静默沿用 r21 约定）；`onGameOver` 总分 = 逐锁增量之和（含 b2bBonus），与 r20/r21 总分口径一致；snapshot（或等价只读面）暴露 `b2bChain` 供 UI/测试消费。
- **AC-7 会话隔离**：`b2bChain` 为会话内存，**不入持久化**（persist.js 0 行 diff）；restart/OVER 归 `off`；与 combo 链互不影响，可并行存在（同一清除帧可同时推进/触发两链）。
- **AC-8 旧期望零改动 + 七套全绿**：既有测试场景（无 B2B 触发）的计分与 toast 期望**零行级改动**；新用例全部追加至文件尾（种子公式见 TECH）；回归出口 = 七套全绿（verify-game / verify-audio / verify-ui / verify-persist / verify-constants / assembly-check / qa-e2e-jsdom），无后门。

**US-2 作为玩家，B2B 奖励触发瞬间应能从界面感知（与既有 Combo/T-Spin 奖励一致）。**

- **AC-9 reward toast 并入 B2B**：B2B 触发帧并入 r21 `#reward-toast` 子系统（buildRewardText 扩展）：toast 文本含 B2B 标识与数值，数值与结算 `b2bBonus` **同源一致**；单帧多轴（T-Spin / Combo / B2B）合并 1 根、各轴恰出现一次（r21 合并规则扩展为三轴）；未触发（b2bBonus≤0）时既有 Combo/T-Spin 文案零变化；OVER/restart 清空、1600ms 过期替换、与 LEVEL UP 同帧共存等全部沿用 r21 语义；`aria-live=polite` 槽位由 r21 继承。

### P1 — 视觉 / 可访问性打磨

- **AC-10 DESIGN 与读屏**：B2B toast 视觉复用 r21 四档字号与 `toast-in-out` 1600ms keyframes，**零新 token 优先**；`aria-live=polite` 与 reduced-motion 行为沿用 r21 边界声明（animMs=0 无载荷不弹；主 E2E 保持 animMs:240 环境），并为 B2B 路径补断言（P1，随 qa-e2e 追加段覆盖）。

### P2 — 后续（本需求不实现）

- **AC-11 B2B 链态指示器 UI**（如 "B2B" 徽标随链 on 点亮，供玩家感知链态而不只靠 toast）：归 P2 另立需求，参照 r19#AC-12（指示器归 P2）先例；本需求不实现。

## 3. 范围与非目标

**范围内**：引擎链态机与加分（P0）；载荷与总分一致性（P0）；reward toast 三轴合并（P0）；数值单源与七套回归（P0）；视觉/读屏断言（P1）。

**非目标**：不做 B2B 链态指示器 UI（AC-11，P2 另立）；不改 T-spin 判定本体（r18 不动）；不改 combo 链本体（r20 不动）；不改音效（audio.js 0 行，onSfx 事件面 0 变化——沿用 r21 约束）；不做链长递增倍率（区别于 combo 递增，B2B 为定值基数，§5）；不持久化链态；不调节难度/掉落。

## 4. 交互流程摘要

1. 引擎 `lock()` 触底 → 进入 clearing 帧：先按 r18 判定 tspin kind、按 r20 推进 combo，再按本需求判定资格 + 迁移 `b2bChain` → 计算 `b2bBonus` → 四轴汇总写入清除载荷。
2. UI 结算帧（r21 onSnapshot 驱动）：读取载荷 → buildRewardText 合并 T-Spin / Combo / B2B → `#reward-toast` 弹出一根；无任何奖励则静默。
3. restart / OVER：引擎清 `b2bChain`；toast 清空沿用 r21。
4. 全程**纯展示不改计分已有轴**；新增仅引擎一条加分路径与 toast 一条文案分支。

## 5. 数值规格（§5 单一事实来源 · 需同步 game.js 顶部常量与 verify-game/qa-e2e）

| 常量 | 值 | 说明 |
|---|---|---|
| `B2B_BONUS_BASE` | **400** | 定值基数，**不随链长递增**（区别于 comboBonus=50×combo×level 的递增）；单一事实来源 = game.js 顶部常量 |
| `b2bBonus` | `B2B_BONUS_BASE × level` | `level` 取本次清除发生时的当前等级（升级前，同 r20 约定）；防御：非有限数/level<1 → 0（E6 同款，无 NaN/负分路径） |

**样例（level=1）**：
| 序列 | 得分 |
|---|---|
| 单 Tetris | 800（仅 line） |
| 连发 Tetris 第 2 个起 | 800 + 400 = **1200** |
| 单 T-Spin Single | 800 |
| 连发 T-Spin Single 第 2 个起 | 800 + 400 = **1200** |
| 连发 T-Spin Double 第 2 个起 | 1200 + 400 = **1600** |
| 三连 Tetris 第 3 个 | 仍 1200（定值不递增） |

**与 Guideline 对照**：B2B Tetris = 1200 对齐现代规则（=1.5×800）；T-Spin Double/Triple 采用统一基数 400（简化口径，非按型 1.5 倍浮动）——此为产品裁定，随 AC-4 单源锁定。

## 6. 优先级总表

| 优先级 | AC | 内容 |
|---|---|---|
| P0 | AC-1/2/3/4/5/6/7/8/9 | 资格判定、链态机、加分公式、数值单源、四轴叠加、载荷与总分、会话隔离、旧期望零改动+七套全绿、toast 并入 |
| P1 | AC-10 | DESIGN 视觉（零新 token）、aria-live/reduced-motion 断言 |
| P2 | AC-11 | B2B 链态指示器 UI（另立需求） |

## 7. 依赖与风险

**依赖**：D1 = r18 T-spin 几何判定（`kind='full'/'mini'` 为资格判定上游，verify-game §14.5 锚定，不可回归）；D2 = r20 加成轴与会话态约定（升级前 level、断链语义、restart 归零、不入持久化）；D3 = r21 toast 子系统（`#reward-toast` / buildRewardText / 1600ms / aria-live=polite）。

**风险**：
- **R1（中）**：Mini/Full 边界误判会错误触发 B2B——测试必须以 r18 判定样例锚定资格用例（含原地/kick 旋转样例）。
- **R2（中）**：四轴叠加总分口径回归——qa-e2e 需覆盖同帧三轴（T-Spin+Combo+B2B）叠加种子，防双计/漏计。
- **R3（低）**：三轴合并后 toast 文案长度在 1600ms 内的可读性——P1 人工补测项（视觉/动效，环境限制）。
- **R4（低）**：升级边界等级乘数——单测覆盖"第 10 行 Tetris 恰升级"边界的升级前 level 乘数，与 combo 同校准。

## 8. 里程碑建议

M1 技术方案（链态实现点、载荷契约、toast 三轴合并、测试种子公式）→ 并行 T1 引擎（常量+链态+bonus+载荷，含 verify-game 单测）与 T2 toast 合并（ui.js + buildRewardText + verify-ui）→ T3 qa-e2e 追加段（文件尾纯追加）→ 七套收口 → QA 独立复跑 + 人工补测（视觉/动效/读屏/真机）→ 验收登记。

## 9. 工程约束（原样承载）

1. **分支**：`feat/back-to-back-multiplier`（当前所在分支，保持）——开发全程不切换、不 rebase 主分支；基线 = 当前 HEAD（5029cb5，r21 合并已在本分支上）。
2. **未提交改动**：`?? docs/teamflow/20260829-r23-back-to-back-multiplier/`（本需求任务夹，未跟踪）——**不得 stash / 删除 / 移动**；本 PRD 及后续 TECH / DESIGN / QA-REPORT / ACCEPTANCE 全部写入该夹。
3. **提交时机**：开发完成且七套全绿后，**代码与任务夹文档同批提交**至 `feat/back-to-back-multiplier`（r21 先例「任务夹同批提交」）；先执行提交动作再写码验收类说明。
4. **0-diff 红线**：`audio.js` / `persist.js` **0 行**；`index.html` / `style.css` 在 toast 纯复用前提下 0 行（若 P1 视觉确需最小追加，须在 TECH 方案中声明改动面与理由）。
5. **数值联动**：`B2B_BONUS_BASE` 改动必须同步 `scripts/verify-game.cjs` 与 `qa-e2e-jsdom.cjs`（AGENTS §4 单一事实来源）。
6. **验收登记**：验收通过后向 `docs/teamflow/memory.md` 迭代索引**登记 r23 一行**（下一版，预计 v3.8，以验收时 memory 现行为准顺延）；本需求**不引入新团队约定/技术栈决策**，不触发 memory 约定层修改（§5 之 memory 写回规则不适用）。