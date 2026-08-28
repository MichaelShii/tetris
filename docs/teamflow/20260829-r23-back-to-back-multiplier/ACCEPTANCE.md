# ACCEPTANCE — r23 Back-to-back 奖励倍率（连续 Tetris/T-Spin 无间隙倍率）

## 结论

**✅ 通过（accepted）**。AC-1~10 全部通过，AC-11 为 P2 另立（正确不实现）；M3 架构质量门无风险项、零返工；七套验证独立复跑全绿（verify-game 130 / verify-audio 24 / verify-ui 29 / verify-constants 2 / verify-persist 15 / assembly ALL / qa-e2e 429）＋ QA 独立对抗抽查 46/46；0-diff 红线成立（audio.js / persist.js / index.html / style.css 0 行）。未发现缺陷。

## 验收证据（独立复核）

- 分支 `feat/back-to-back-multiplier`；`git diff --numstat`：game.js +47/-5（5 删为签名扩展）、ui.js +7/0、verify-game.cjs +477/0、verify-ui.cjs +58/0、qa-e2e-jsdom.cjs +188/0 —— **audio.js / persist.js / index.html / style.css 0 行**；未提交仅新任务夹（同批由 host 收口）。
- 验收人独立复跑七套全部 exit=0（日志 `logs/teamflow/tf-mtd6yvyp-pih1ms/acceptance-verify.log`）；代码抽查：game.js L82 `B2B_BONUS_BASE=400`、L472 `b2bQualifies`、L480 `b2bBonus`、L562/673/755 链态生命线、L679 四轴叠加、L593-594 快照暴露；ui.js L197-198 B2B 轴载荷直读。

## AC 检查表（PRD §3，P0:1-9 / P1:10 / P2:11）

| AC | 判定 | 证据 |
|---|---|---|
| AC-1 资格判定 | ✅ | `b2bQualifies` 复用 r18 `tspinKind`（Tetris 4 行 / T-Spin Full≥1 行）；Mini/No-line/普通消行无资格；verify-game §16 资格矩阵 + qa-e2e B1 |
| AC-2 链态机 | ✅ | `b2bChain` 布尔会话态；finishLock 首行唯一出口（资格→on / 非资格消行·0行·No-line→off）；hold/旋转/软降/硬降不迁移；restart 归零；verify-game §16 三路断链 + qa-e2e B7 |
| AC-3 加分时机与公式 | ✅ | `b2bBonus = 400 × 升级前 level`，仅「资格 且 清除前链 on」触发恰一次；链断后首资格仅置链；verify-game §16 公式样例 + L2 + 升级边界 |
| AC-4 数值单一事实来源 | ✅ | `B2B_BONUS_BASE=400` 仅 game.js 常量区（L82 导出，PRD §5 一致），verify-game §16.0 与 qa-e2e B 段双端引用同值 |
| AC-5 四轴叠加恰一次 | ✅ | L679 `基分+tspin+comboBonus+b2bBonus` 同帧各一次、B2B 不进 lines/level；verify-game §16 四轴 1350 |
| AC-6 载荷与总分一致性 | ✅ | 载荷携带 `b2bBonus`；快照暴露 `b2bChain`（恒 boolean）+`b2bBonus`（clearing 期非 null）；onGameOver 总分=逐锁增量之和；verify-game §16 累和 + qa-e2e B2（score 2050） |
| AC-7 会话隔离 | ✅ | 链态不入持久化（persist.js 0 行）；restart/OVER 归零；与 combo 链可同帧并行互不影响；verify-game §16 隔离 + verify-persist 15/15 |
| AC-8 旧期望零改动+七套全绿 | ✅ | 测试文件纯追加（+723/0 行）既有断言零行级删改；七套独立复跑全绿；无后门 |
| AC-9 reward toast 并入 B2B | ✅ | ui.js `buildRewardText` 轴序 T-Spin→Combo→B2B 末尾；`'B2B +N'` 载荷直读同源（与结算恒等）；缺省/0/NaN 跳轴→既有双轴文案零变化；单帧三轴合并恰各一次（qa-e2e B3）；OVER/restart 清空、1600ms 替换、LEVEL UP 共存沿用 r21（B4 + r21 继承段 S4/AC-06.4） |
| AC-10 DESIGN 与读屏（P1） | ✅ | index.html/style.css 0 行 → 零新 token，沿用 r21 四档字号 / toast-in-out / aria-live=polite / reduced-motion 边界（主 E2E animMs:240）；B9 aria-live 断言补入 |
| AC-11 链态指示器（P2 另立） | 📝 不实现 | 参照 r19#AC-12 先例归 P2 另立需求，本需求范围外（正确不实现） |

## M3 架构质量门

- 无 blueprint JSON 注入 → 逐项比对 N/A。
- 无重复实现：`b2bQualifies` 复用 r18 tspinKind 产物（不重写几何判定）；`b2bBonus` 与 comboBonus 为同构纯函数（同模式新轴，非复制）；链态与 comboChain 共用 finishLock 首行触点（单一出口，无双写）。
- 单一事实来源：`B2B_BONUS_BASE` 仅 game.js 常量区，双测试端经导出引用（AGENTS §4）。
- 既有结构无破损：r18/r20/r21 契约面（onSfx / 快照 / 持久化）0 变化，无适配器漂移。**无返工项。**

## 意见与遗留

1. **规范偏差两处（非缺陷，已按 TASK 第 3 条以真值断言处置）**：TECHNICAL §16.1/§16.5 样例数值为 PRD §5「主+B2B 轴」口径（2000/1900/1200，不含 combo 轴），引擎实际增量含 combo 50/100（连发 Tetris 二锁=1250、总 2050），与 qa-e2e B2 `score===2050` 内部一致；TECHNICAL B6 结算帧链值描述与 §16.2/E1 矛盾，按 E1 实现（No-line 断链帧 false、后续资格锁 true）。两者均被真值断言锁定，不影响任何 AC。
2. **人工补测（环境限制，非交付缺陷）**：B2B toast 三轴排版/连发动效观感（真人浏览器触发连发）、真实读屏朗读新文案（NVDA/VoiceOver）、移动端 100dvh/safe-area/多指、长跑 FPS、消行音效听测 —— 已并入 memory 人工补测汇总，待真实浏览器环境集中补测。
3. **P3 观察**：AC-11 B2B 链态指示器随 r19#AC-12 指示器族归 P2 另立，snapshot 的 `b2bChain` 即为其预留消费面。

## 验收登记

- 本任务夹：ACCEPTANCE.md 落盘；memory 迭代索引登记 v3.8＝r23（含人工补测汇总增量）；分支 `feat/back-to-back-multiplier` 与任务夹由 host 验收后同批提交。

<!-- state -->{"phase":"acceptance","summary":"r23 验收 ✅ 通过：AC-1~10 全过（AC-11 P2 另立正确不实现）；验收人独立复跑七套全绿 130/24/29/2/15/ALL/429 + QA 独立对抗 46/46；0-diff 红线成立（audio/persist/index/style 0 行，测试纯追加）；M3 无 blueprint（N/A）+ 无重复实现/单源/结构无破损 → 零返工；规范偏差两处已按真值断言锁定非缺陷；人工补测 5 项为环境限制并入 memory 汇总；ACCEPTANCE.md 落盘任务夹，memory 登记 v3.8","memory":["r23 验收 ✅ 通过（tf-mtd6yvyp-pih1ms）：独立复跑七套全绿，红线 0 行确认，无缺陷无返工；ACCEPTANCE.md 于任务夹","memory 迭代索引登记 v3.8=r23；人工补测汇总新增 r23 项（B2B toast 三轴观感/连发动效 + 真实读屏新文案）","AC-11 B2B 链态指示器归 P2 另立（随 r19#AC-12 指示器族）；snapshot.b2bChain 为预留消费面","分支 feat/back-to-back-multiplier 与任务夹待 host 同批提交"]}<!-- /state -->