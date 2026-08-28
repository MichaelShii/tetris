# QA-REPORT — r21 特殊奖励 Toast（Combo/T-Spin 奖励提示）

- 需求：r21 special-reward-toast（取代 r19#AC-12；基线 r20-combo-line-clear-reward）
- 分支：feat/special-reward-toast（未提交改动：5 文件 + 本任务夹）
- QA 日期：2026-08-28 ｜ 验证人：独立 QA（修复后复核通过：D-1 已修复）

## 结论（verdict first）

**验收就绪。** 第一轮 QA 发现的 P2 缺陷 D-1（开局/restart 后首个计分事件为 T-Spin 消行时奖励 Toast 被清窗代理误吞）**已修复并回归通过**；本轮修复后全量复核：七套全绿（verify-game 119/119、qa-e2e 395/395、verify-ui 28/28、verify-audio 24/24、verify-constants 2/2、verify-persist 15/15、assembly-check ALL）+ 独立对抗 44/44 + 0-diff 红线成立（engine/persist 0 行）+ 事件面 0 变化。14 条 AC 全过，**未发现未决缺陷**。人工补测 5 项（视觉/动效/读屏/音效/移动端）为环境限制项，见 §六。

## 一、范围与环境

- 交付形态：纯 JS UMD（index.html 双击即玩），零构建；QA 环境 Node v22 + jsdom 29（harness 解析策略同 qa-e2e-jsdom.cjs），无真实浏览器/无图像输入 → 文案/布局断言走脚本化 DOM 数值，视觉项列人工补测。
- 改动文件（git numstat 核验，红名单五件套）：`ui.js`(+131/−8，−8 为头注释/文档重写，行为中性)、`style.css`(+46/−0)、`index.html`(+2/−0)、`scripts/verify-ui.cjs`(+126/−0)、`scripts/qa-e2e-jsdom.cjs`(+184/−0)；**engine/persist/其余脚本 0 行**（AC-10/AC-7 persist 0-diff 成立）。
- 日志：`logs/teamflow/tf-mtctcv9m-ou8v65/`（本轮复核 `qa2-*.log` + `fixD1-*.log`）。

## 二、测试执行与结果（本轮独立复跑，非采信 dev 日志）

| 套件 | 结果 | 说明 |
|---|---|---|
| node scripts/verify-game.cjs | PASS 119/119 | 含 §15 combo 链 11 组 + soak 无漂移（AC-11） |
| node scripts/verify-audio.cjs | PASS 24/24 | onSfx 事件面（AC-12） |
| node scripts/verify-ui.cjs | PASS 28/28 | 含 r21 新段 5 测试（常量/纯函数矩阵/源扫描） |
| node scripts/verify-constants.cjs | PASS 2/2 | VERSION 三模块一致 |
| node scripts/verify-persist.cjs | PASS 15/15 | persist 0-diff |
| node scripts/assembly-check.cjs | PASS ALL | 装配/自包含/音频文件审计 |
| node scripts/qa-e2e-jsdom.cjs | PASS 395/395 | 367 既有 + r21 S1~S10（28 断言，纯追加；S5 已改直测 D-1 修复行为） |
| logs/…/qc-r21-independent.cjs（QA 独立对抗，复跑） | PASS 44/44 | A 组 19 + B 组 25（含 B7 翻转断言修复后行为） |

**独立对抗抽查要点（复跑 44/44）：** A1 六档位标签 ×L1/L3 全网格文案、A2 文案数值与引擎 `tspinBonus/comboBonus` 全网格恒等（AC-7）、A3 TetrisGame 缺失守卫、A4 No-line/全 0/畸形载荷防御；B1 结算帧 OVER 抑制無闪现、B2 显示期替换+1600ms 定时器真实重置、B3 clearing 期暂停/恢复载荷不丢、B4 clearing 期 restart 0 残留、B5 animMs=0 恒不弹、B6 全程 24 次 plays ⊆ 标准 8 事件集零新增、B7 = D-1 修复实证（restart 后首消 T-Spin 照常弹 hidden=false）、B8 多轴合并恰 2 段 · 分隔序正确（AC-4）。

## 三、验收项对照

| AC | 结果 | 证据 |
|---|---|---|
| AC-1 复用既有 toast 子系统 + UI 契约新常量 | ✅ | createFeedback 扩 reward/clearReward（同 closure、独立 rewardTimer，LEVEL UP 行为零改动）；TOAST_DURATION=1600 + buildRewardText 双通道导出 |
| AC-2 Combo 触发 toast，数值与结算一致 | ✅ | S2/B2/B8；A2 恒等 |
| AC-3 T-Spin 分档 toast、No-line 不弹 | ✅ | 六档全网格 A1；No-line 不弹 A4/S6；**D-1 修复后 S5/B7：restart 后首消 T-Spin Single +800 照常弹** |
| AC-4 同帧多轴合并 1 根恰各一次 | ✅ | B8/S5：2 段 · 分隔、T-Spin 前 Combo 后、无轴丢弃 |
| AC-5 全 0 奖励静默 | ✅ | A4/B4/S1 |
| AC-6 1600ms 衰减/替换/OVER/restart 清空/与 LEVEL UP 共存 | ✅ | B2（替换重置+按时淡出）、B1（终局抑制）、B4（restart 清空）、S7（同帧双槽并存） |
| AC-7 数值同源 + 会话隔离 + persist 0-diff | ✅ | A2 恒等；pendingReward 闭包隔离；persist.js 0 行 |
| AC-8 aria-live=polite（P1） | ✅ | S9 + verify-ui 源扫描：role=status + aria-live=polite + hidden + 挂载序 |
| AC-9 DESIGN token 视觉 + 布局档（P1） | ✅* | 源扫描：零新 token、top:28px、max-width:min(92%,320px)、S 横 fs-sm/S 竖 fs-xs；*真机视觉列人工补测 |
| AC-10 0-diff 红线 engine 0 行 | ✅ | git numstat：game.js/verify-game.cjs 0 行；tspin 载荷 r18/r20 已预留透出（R1 解除） |
| AC-11 七套全绿 + soak 无漂移 + 旧期望零改动 | ✅ | 全绿；verify-ui +126/−0、qa-e2e +184/−0（纯追加） |
| AC-12 onSfx 事件面 0 变化 | ✅ | B6：24 plays ⊆ 8 事件集；audio.js 0 行 |
| （附加）取代 r19#AC-12 指示器 UI | ✅ | Toast 即指示器落地 |

## 四、缺陷

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| D-1 | P2 | ui.js（onSnapshot ③ 清窗代理） | restart 后首个计分事件为 T-Spin 消行（clearing 帧 score=0&&lines=0） | AC-3：六档任一 T-Spin 消行即弹 | 修复前：分支③ restart 代理误清 pendingReward → 静默缺失。**修复后**：分支③追加 `s.clearedIndices===null` 守卫，restart 帧仍清空、首消 clearing 帧不再误清 → S5/B7 实测照常弹 | AC-3 |

**未发现未决缺陷。** 修复面核实：ui.js 单点条件 + qa-e2e S5 去预热改直测 + 对抗脚本 B7 翻转断言；引擎 0 行（红线成立）。旧「其他观察」复核：① `must('#reward-toast')` 装配期硬依赖——仓库内 index.html 同批交付 + assembly-check 锁定配对成立（自包含范围内可接受，P3 观察非缺陷）；② reward()/levelUp() 同构小面积（独立定时器是契约要求）——非漂移风险。

## 五、架构检查（M3 质量门）

- blueprint（TECHNICAL §末尾 JSON）核对：五件套模块划分/职责/装配序与实现逐一相符，无偏离、无漏抽取、无新增模块；engine 0 行消费既有载荷的设计兑现。
- 无重复实现漂移：`buildRewardText` 单一定义单点消费（ui.js L174/L1752）；`toast-in-out` keyframes 单一定义双槽复用（800/1600ms 同位不同时长）；T_SPIN_TIER_LABEL/REWARD_JOIN 单一事实来源；数值经引擎导出纯函数同参派生，无第二套计分逻辑。
- 既有结构未见破坏（LEVEL UP 路径逐字不变、reduced-motion 镜像保持、旧期望纯追加）；导出契约双通道（module.exports + window.TetrisUI）齐备。
- **架构无 P1。**

## 六、人工补测清单（环境限制，非交付缺陷）

| 验收项 | 方法 | 工具 | 备注 |
|---|---|---|---|
| AC-9 视觉/布局：top:28px 与 LEVEL UP 纵向 stack、长文案换行入胶囊不越界、S/M/L 四档字号 | 真实浏览器触发 Combo/T-Spin 观察 | DevTools/手测 | jsdom 无真实布局；源扫描已锁 CSS 契约 |
| AC-6 动效：1600ms ease-out 观感、reduced-motion 下降级为静态 1600ms 停留 | 浏览器开关 prefers-reduced-motion 对比 | DevTools 渲染设置 | animMs=0 恒不弹（E9 声明边界，需验收裁定） |
| AC-8 屏幕阅读器播报（aria-live=polite） | 读屏触发 Toast | NVDA/VoiceOver | — |
| 实际音效可听性（事件面已由 B6 锁定） | 耳听 | 浏览器 | 常规回归 |
| 移动端：动态工具栏/安全区/触屏下 Toast 位置 | 真机触发 | 手机浏览器 | 常规回归 |

## 七、结论

- 修复后全量复核：**七套全绿 + 独立对抗 44/44 + 0-diff 红线成立 + 事件面 0 变化**；14 条 AC 全过；D-1 已修复并回归（S5/B7 双断言覆盖）。
- **未发现未决缺陷，判定验收就绪**；待产品在验收阶段登记 memory 产品版本（v3.6→下一版）、人工补测 5 项完成后同批提交（分支 feat/special-reward-toast，未提交改动 = 5 文件 + 本任务夹）。