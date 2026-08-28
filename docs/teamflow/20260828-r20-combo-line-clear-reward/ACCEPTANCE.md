# 验收报告 — r20 Combo 连消奖励

- 需求：r20 Combo 连消奖励（PRD AC-1~12）；取代 r19#AC-12（Combo 指示器 UI）→ 归 P2 另立需求，不再作为本需求验收项
- 基线依赖：r19（combo 语义/QA 实测结论）+ r18（T-spin 六档计分）+ r22（READY 预览留白）
- 被测交付：分支 `feat/combo-line-clear-reward`；未提交改动仅 `game.js` / `scripts/verify-game.cjs` / `scripts/qa-e2e-jsdom.cjs` + 任务夹（0-diff 红线成立）
- 验收依据：PRD.md（本任务夹）+ QA-REPORT.md + 验收独立复跑七套验证
- **结论：✅ 通过（验收就绪，无缺陷、无架构返工项）**

## AC 逐条核对

| AC | 判据 | 验证证据 | 结果 |
|---|---|---|---|
| AC-1 | 连消递增链：锁定清≥1行索引+1，首消 combo0，种子场景 0→1→2→3 | verify-game §15.1（固定种子连续 4 清行锁，clearing 期快照 combo 0→1→2→3，bonus=50×idx×L1） | ✅ |
| AC-2 | 任意锁定清 0 行断链归 0（含 No-line T-spin） | §15.2：清行→0 清行锁→首清回 combo0；T full×0 行 No-line 亦断链 | ✅ |
| AC-3 | hold/旋转(含踢墙)/软降/硬降不断链不推进 | §15.3：四操作后下一清行锁索引连续（combo1×L1=50） | ✅ |
| AC-4 | 普通与 T-spin 消行可混合续链 | §15.4：普通 1 行→T-spin Full Single→普通 1 行 = 0→1→2（T-spin 锁三轴和 950） | ✅ |
| AC-5 | comboBonus=50×combo×level，combo0=0 分 | §15.0（COMBO_BONUS_BASE=50 单一来源 + 数值表 + NaN/负值/level<1 防御）+ §15.5 例 1（L1 combo0 消1行=100） | ✅ |
| AC-6 | 三轴（普通/T-spin/combo）叠加恰各一次，comboBonus 不进等级进度 | §15.6：4 锁 1/1/2/4 行→lines=Σ=8、level 仍 1；§15.4 T-spin 锁 100+800+50（基分轴不重算） | ✅ |
| AC-7 | 等级倍率：L2 combo3 消 1 行=500；L1 combo3 消 4 行=950 | §15.5 例 2/3（950/500）+ qa-e2e「1150→1650」双锁结构实打 | ✅ |
| AC-8 | 结算载荷/事件透出 combo 索引与 bonus；onGameOver 总分=逐锁之和 | §15.7：clearing 期 combo/comboBonus 暴露、完结回 null、clear 恰 1 次首帧、hardDrop→clear→levelUp 次序、onGameOver=450=100+150+200 | ✅ |
| AC-9 | restart/OVER 归 0；combo 会话内存不入持久化 | §15.8（restart 与 OVER→restart 后首清 combo0/增量 0）；persist.js 0-diff（快照无 combo 字段） | ✅ |
| AC-10 | 零回归：断链后首消/孤立单消与 r18 逐值一致；T-spin 六档不变 | §15.9（1/2/3/4 行 ×L1/L2 孤立消逐值=r18 基线）+ §14 六档全量复跑 | ✅ |
| AC-11 | 随机 50 局 soak 总分一致无漂移 | §15.10：50 局×≥50 锁混合动作，无 NaN/负分/异常，逐锁增量累和==onGameOver 总分 | ✅ |
| AC-12 | 七套全绿（qa-e2e 三处期望修正）+ 0-diff 红线 + VERSION 三模块一致 | 验收独立复跑（见下）+ `git diff --stat` 仅 3 文件 + verify-constants 2/2（VERSION 2.3.0 一致） | ✅ |

## 验收独立复跑（本报告执行，非仅采信 QA）

| 套件 | 结果 |
|---|---|
| verify-game | ✅ 119/119（含新增 §15.0~15.10 共 11 组） |
| qa-e2e-jsdom | ✅ 367/367（三处期望 950 / HUD 950 / +500 实打；AC-06 双锁 1150→1650 印证 combo3×L2） |
| verify-ui / verify-audio / verify-constants | ✅ 23/23 / 24/24 / 2/2（VERSION 三模块一致 2.3.0） |
| assembly-check | ✅ ALL CHECKS PASSED |

0-diff 红线：`git diff --stat` 仅 `game.js`(+41) / `scripts/verify-game.cjs`(+377) / `scripts/qa-e2e-jsdom.cjs`(+8)，其余（audio/ui/persist/index.html/style.css）0 行差分。

## M3 架构核查

- 实现与 TECHNICAL 一致：`comboBonus` 仅在 lockFlow L601-602 计算一次（乘数取升级前 level），随 clearing 载荷（L614）传 finishLock **L643 单点三轴入账**；`comboChain` 仅 finishLock L637 单一出口递增/归零 + restart L718 归零——无计分路径重复、无第二写点
- `COMBO_BONUS_BASE=50`（L79）与 `comboBonus` 纯函数（L460）单一事实来源，导出对齐（L1184/1215）；快照 additive `combo/comboBonus` 仅 clearing 期非 null（L563-564）——载荷契约与 r18 tspin 同构，不破坏既有字段
- persist/ui/audio 0-diff，无存储抽象漂移；assembly-check 结构完好
- **无 blueprint deviation / 无重复实现 / 无结构破坏 → 架构无返工项**

## 意见与遗留

- **无阻断缺陷**。备注（非缺陷）：TECHNICAL §15.5 表中「800+50=850」为 tspin 轴+combo 轴增量、不含基分轴 100，实现按三轴和 950 断言，代码注释已说明——文档数值口径差异，不影响验收。
- **人工补测清单（环境限制，非交付缺陷）**：① 真实音频随 combo 链触发（浏览器实听）；② 刷新/重载后链态归 0（持久化隔离实机复核）；③ 移动端（本需求 0 UI diff，存在性风险极低）。
- 指示器 UI（取代 r19#AC-12）归 P2，另立需求跟踪。
- 产品版本 **v3.6** 已按 PRD §9 约定登记至 `docs/teamflow/memory.md` 迭代索引；代码 VERSION 2.3.0 保持不变。
- 遗留动作：验收后同批提交（`game.js` + 两验证脚本 + 任务夹）至分支 `feat/combo-line-clear-reward`。

<!-- state -->{"phase":"acceptance","summary":"r20 Combo 连消奖励验收通过：AC-1~12 全过；验收独立复跑七套全绿（verify-game 119/119 含 §15 11 组、qa-e2e 367/367 三处期望 950/950/+500 实打、ui 23/audio 24/constants 2、assembly ALL、VERSION 2.3.0 一致）；0-diff 红线成立（仅 game.js/verify-game.cjs/qa-e2e-jsdom.cjs）；M3 架构无返工项（comboBonus 单点计算随载荷、chain 单一出口、常量单一事实来源、persist 0-diff）；无缺陷，备注 TECHNICAL §15.5 850 为两轴增量口径；人工补测 3 项环境限制非交付缺陷；v3.6 已登记 memory；指示器 UI 归 P2；待同批提交。","memory":["r20 验收通过（tf-mtcomxpq-heissu）：AC-1~12 全过、七套独立复跑全绿、M3 无返工、0-diff 仅三文件","v3.6 已登记 memory 迭代索引（取代 r19#AC-12 指示器→P2 另立）","遗留：同批提交 game.js+verify-game+qa-e2e + 任务夹；人工补测 3 项（音频实听/刷新链态归0/移动端）非交付缺陷","TECHNICAL §15.5 850 为 tspin+combo 两轴增量口径，实现按三轴和 950 断言（注释已说明）非缺陷"],"verdict":"accepted","extra":{"done":true,"version":"v3.6","acceptance":"docs/teamflow/20260828-r20-combo-line-clear-reward/ACCEPTANCE.md"}}<!-- /state -->