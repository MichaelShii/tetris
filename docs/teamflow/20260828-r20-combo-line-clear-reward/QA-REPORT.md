# QA-REPORT — r20 Combo 连消奖励（引擎计分验收收口）

## 结论（verdict）：✅ 验收就绪（Acceptance Ready）

七套验证全绿 + 独立对抗抽查通过，0-diff 红线成立（仅 `game.js` / `scripts/verify-game.cjs` / `scripts/qa-e2e-jsdom.cjs` 三文件差分），架构核查无 P1。「未发现缺陷」。

## 1. 范围与环境

- **需求**：r20 Combo 连消奖励（AC-1~12，PRD 见任务夹 `docs/teamflow/20260828-r20-combo-line-clear-reward/PRD.md`；取代 r19#AC-12 指示器 UI → P2）
- **基线依赖**：r19（combo 语义/验证基线）+ r18（T-spin 六档计分）+ r22（当前主线 READY 预览留白）
- **被测交付**：分支 `feat/combo-line-clear-reward`，工作区未提交（`M game.js`、`M scripts/verify-game.cjs`、`M scripts/qa-e2e-jsdom.cjs`、`?? 任务夹`）
- **环境**：Node v22.22.3 + jsdom；Windows 沙箱；日志 `logs/teamflow/tf-mtcomxpq-heissu/qa-r20-*.log`
- **代码审查**：game.js diff 41 行（常量/纯函数/链闭包/lockFlow 载荷/finishLock 单点/restart 清链/导出）；verify-game §15 11 组用例；qa-e2e 三处期望按链态推导表修正（900→950、HUD 900→950、+200→+500）

## 2. 用例与结果

| 套件 | 结果 |
|---|---|
| `node scripts/verify-game.cjs` | ✅ 119/119（含新增 §15.0~§15.10 共 11 组） |
| `node scripts/qa-e2e-jsdom.cjs` | ✅ 367/367 |
| `node scripts/verify-ui.cjs` | ✅ 23/23 |
| `node scripts/verify-audio.cjs` | ✅ 24/24 |
| `node scripts/verify-constants.cjs` | ✅ 2/2（VERSION 三模块一致，2.3.0 不变） |
| `node scripts/assembly-check.cjs` | ✅ ALL CHECKS PASSED |
| **独立对抗抽查**（QA 自写 `qa-r20-adversarial-combo.cjs`，重力锁定路径——开发用例未覆盖的同一 finishLock 出口） | ✅ 4/4：重力首清 combo0 / 二清 combo1（链递增）/ 0 清行重力锁断链 / 断链后首清归 0 |

### AC 覆盖（全部通过）

| AC | 断言位置 | 结果 |
|---|---|---|
| AC-1 连消递增链 0→1→2→3 | verify-game §15.1（animMs:240 经 clearing 期快照） | ✅ |
| AC-2 断链（0 清行 / No-line T-spin） | §15.2 | ✅ |
| AC-3 hold/旋转(含踢墙)/软降/硬降不断链 | §15.3 | ✅ |
| AC-4 普通+T-spin 混链 0→1→2 | §15.4 | ✅ |
| AC-5 comboBonus=50×combo×level、combo0=0、防御 NaN/负值/level<1 | §15.0 | ✅ |
| AC-6 三轴恰各一次、不进等级进度 | §15.6（4 锁 lines=8 level=1） | ✅ |
| AC-7 等级倍率：L2 combo3 消1行=500；L1 combo3 消4行=950 | §15.5 例 2/3 | ✅ |
| AC-8 载荷/事件透出、onGameOver 总分=逐次之和 | §15.7/§15.10 | ✅ |
| AC-9 restart/OVER 归 0、会话内存不入持久化 | §15.8（persist.js 0-diff） | ✅ |
| AC-10 零回归（断链首消/孤立单消与 r18 逐值一致、T-spin 六档 §14 复跑） | §15.9 + 既有 §14 | ✅ |
| AC-11 随机 50 局 soak 无漂移 | §15.10（50 局×60 锁，逐锁增量累和==over 总分） | ✅ |
| AC-12 七套全绿 + 0-diff 红线 + VERSION 一致 | 本报告 §2 全表 | ✅ |

### qa-e2e 三处期望链态推导（L353/L354/L386，与 TECHNICAL §6 权威表一致）

| 锁 | 场景 | 清行 | 链态 | level(乘数) | 增量 | 累计 |
|---|---|---|---|---|---|---|
| A | AC-03 首锁 | 1 | combo0 | L1 | 100 | 100 |
| B | AC-03 二锁（4 行） | 4 | combo1 | L1 | 800+50=850 | **950** |
| X1 | AC-06 升级锁（setLines(9)） | 1 | combo2 | L1(升级前) | 100+100=200 | 1150 |
| C2 | AC-06 计分锁（L2 消 1 行） | 1 | combo3 | L2 | 200+300=**500** | 1650 |

三处期望修正均经公式重推导（非照抄），AC-06 双锁结构保留 → combo3×L2 语义成立。

## 3. 架构核查（M3 质量门）

- **blueprint 遵循**：TECHNICAL.md 内 `<!-- blueprint -->` 三模块（game.js / verify-game.cjs / qa-e2e-jsdom.cjs）与实现差分完全一致；comboBonus 仅在 lockFlow 计算一次（game.js L601-602）随 clearing 载荷传入 finishLock、单点入账（L643），**无计分路径重复**；链更新仅 finishLock 首行无条件出口（L637）+ restart 归零（L718），无第二维护点。✅
- **重复实现排查**：`COMBO_BONUS_BASE`/`comboBonus` 单一事实来源（game.js 定义与导出，verify-game §15.0 断言，qa-e2e 注释引用，无第三份拷贝）；持久化/存储零新增抽象（persist.js 0-diff）；快照 additive `combo`/`comboBonus` 完全复用 r18 tspin 生命周期模式。无漂移、无重复 wrapper/adapter。✅
- **结构完好**：assembly-check 全过（UMD 契约、自包含、装配序）；7 模块触碰面 = 3 源码文件，其余 0 行 diff。✅
- **结论**：架构无 P1，无抽取缺口、无破坏性结构改动。

## 4. 缺陷

**未发现缺陷。**

备注（非缺陷）：TECHNICAL §15.5 表格中「T-spin Full Single combo1×L1=800+50=850」为 tspin 轴+combo 轴增量（不含基分轴 100）；实现/测试按三轴和 950 断言，代码内注释已说明，属文档记法粒度差异，不影响验收。

## 5. 人工补测清单（环境限制，非交付缺陷）

| 验收项 | 方法 | 工具 | 说明 |
|---|---|---|---|
| 真实音频输出（clear/levelUp/hardDrop 音效随 combo 链正确触发） | 浏览器实听，连续消 2~3 行（理论上 combo1/2 每锁仍恰 1 次 clear 音） | 手动 + 浏览器 | 环境限制（无法听音频）；引擎侧事件序列已由 verify-game §15.7 断言 |
| 持久化回恢复后链态归 0（刷新/重载后首次消行为 combo0） | 对局中消 2 行 → 刷新页面 → 继续对局消 1 行，核对 HUD 得分无 combo 增量 | 手动（file:// 浏览器） | 环境限制；persist.js 0-diff + 不序列化链态已静态确认 |
| 移动端 100dvh/安全区/多点触控/FPS | 真机实玩 | 手动 | 本需求 0 UI diff，存在性回归风险极低 |

## 6. 版本与收尾

- VERSION 三模块一致 2.3.0（不变）；产品版本 v3.6 待验收时登记 `docs/teamflow/memory.md`。
- 分支 `feat/combo-line-clear-reward` 未动；验收通过后同批提交（含任务夹 PRD/TECHNICAL/QA-REPORT）。