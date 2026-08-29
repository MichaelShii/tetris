# QA-REPORT — r23 Back-to-back 奖励倍率（连续 Tetris/T-Spin 无间隙倍率）

- 任务夹：`docs/teamflow/20260829-r23-back-to-back-multiplier/`
- 分支：`feat/back-to-back-multiplier`；基线依赖：r21（toast 子系统）+ r20（combo/多轴计分，含 r18 tspin 判定）；无取代项
- QA 执行：独立测试工程师；日期：2026-08-29

## 结论（verdict）

**验收就绪（Acceptance-ready）。** 七套验证全绿 + QA 独立对抗抽查 46/46 + 0-diff 红线上成立；AC-1~10 全部通过证据支撑（AC-11 为 P2 另立，本需求正确不实现）；未发现缺陷；无 P0/P1/P2/P3 缺陷项。

## 范围与环境

- 被测交付：`game.js`（第四计分轴 b2bBonus=400×level、b2bChain 布尔链态）、`ui.js`（buildRewardText 三轴合并）、`scripts/verify-game.cjs` / `scripts/verify-ui.cjs` / `scripts/qa-e2e-jsdom.cjs`（纯追加测试）
- 基线红线：`audio.js` / `persist.js` / `index.html` / `style.css` 0 行 diff；其余脚本 0 行
- 环境：Node v22.22.3 + jsdom（脚本化 DOM 断言）；本模型无图像输入 → 视觉观感类归人工补测
- 日志：`logs/teamflow/tf-mtd6yvyp-pih1ms/qa-*.log`（七套）+ `qa-r23-independent.log`（独立抽查）

## 验证执行（sandbox-legal）

| # | 套件 | 结果 | 说明 |
|---|---|---|---|
| 1 | `node scripts/verify-game.cjs` | ✅ 130/130 | §16.0~§16.10：资格矩阵/公式/防御、链递增、三路断链、操作无关、混链、公式样例+L2 边界、四轴叠加、载荷/事件/onGameOver 累和、会话隔离、零回归、B2B soak |
| 2 | `node scripts/verify-audio.cjs` | ✅ 24/24 | onSfx 事件面 0 变化（audio.js 0 行） |
| 3 | `node scripts/verify-ui.cjs` | ✅ 29/29 | r23 三轴矩阵：三轴串/序断言/四路跳轴防御（缺省/0/NaN 跳轴→既有双轴文案零变化） |
| 4 | `node scripts/verify-constants.cjs` | ✅ 2/2 | VERSION 三模块一致 |
| 5 | `node scripts/verify-persist.cjs` | ✅ 15/15 | persist.js 0 行；b2bChain 不入持久化 |
| 6 | `node scripts/assembly-check.cjs` | ✅ ALL | 装配 + 自包含 + 音频 0 文件 |
| 7 | `node scripts/qa-e2e-jsdom.cjs` | ✅ 429/429 | 含 r23 独立 env（animMs:240）B1~B9 直测 |
| 8 | QA 独立对抗抽查 `qa-r23-independent.cjs` | ✅ 46/46 | 属性式：资格矩阵全 kind×cleared、公式/防御/纯函数性、单源导出、snapshot 契约（b2bChain 恒布尔/初始 off、b2bBonus 空闲 null）、restart 归零 |
| 9 | soak（verify-game r23 + verify-ui r23 复跑） | ✅ 无漂移 | 50 局确定性注入，逐锁增量累和==onGameOver 总分，无 NaN/负分 |

## AC 映射（PRD 本任务夹 AC-1~11）

| AC | 判定 | 证据 |
|---|---|---|
| AC-1 资格判定（Tetris / T-Spin Full≥1 行；Mini/No-line/普通不资格，复用 r18 tspinKind） | 通过 | §16.0 + 独立抽查 A 组；qa-e2e B6/B7（No-line/Mini 断链） |
| AC-2 链态机（资格→on；非资格消行/0 行/No-line→off；hold/旋转/软降/硬降/暂停不改；restart/OVER→off） | 通过 | §16.2/16.3/16.8；qa-e2e B6/B7/B8；实现：finishLock 首行唯一出口（E3 防双计数） |
| AC-3 加分时机与公式（count=资格&&链 on：400×升级前 level；链断后首资格仅置链） | 通过 | §16.1/16.5；qa-e2e B1（首锁 b2bBonus=0 且 toast 静默）、B2/B3 |
| AC-4 数值单源 B2B_BONUS_BASE=400（game.js 常量，verify-game/qa-e2e 引用同一导出） | 通过 | game.js:82 + §16.0（assert 导出=400）+ qa-e2e B 段 `TG.B2B_BONUS_BASE` 推导；独立抽查 C 组 |
| AC-5 四轴叠加恰一次、不进等级进度 | 通过 | §16.6（二锁增量 1350）+ qa-e2e B2/B3（lines/level 不受 b2b 影响）、B5（三轴 2250） |
| AC-6 载荷与总分一致（b2bBonus 载荷、onGameOver=逐锁增量之和、snapshot 暴露 b2bChain） | 通过 | §16.7 + §16.10 soak；qa-e2e B1~B9 各帧值 |
| AC-7 会话隔离（不入持久化；restart/OVER 归零；与 combo 链并行） | 通过 | §16.8；qa-e2e B2（双链并行）/B8（OVER/restart）；persist 0 行 |
| AC-8 旧期望零改动 + 七套全绿（新用例纯追加） | 通过 | git diff：verify-game/verify-ui/qa-e2e 增 723 行删 0 行；四套无关套件全绿 |
| AC-9 toast 三轴合并恰各一次、同源一致、B2B≤0 时既有文案零变化 | 通过 | verify-ui r23 矩阵 + qa-e2e B2（Combo·B2B）/B5（三轴序）/B4（无 B2B 轴）+ r21 S4 继承面（1600ms 淡出）、AC-06.4 LEVEL UP 共存 |
| AC-10 P1 视觉/读屏（aria-live=polite、reduced-motion 沿用） | 通过 | qa-e2e B9（aria-live=polite、role=status）；animMs=0 无载荷不弹由 r21 段继承断言 |
| AC-11 P2 链态指示器（本需求不实现） | 正确未实现 | PRD §6 优先级 P2 另立；无代码/无测试残留 |

## 0-diff 红线核验（git 层）

- `git status --porcelain`：仅 5 个红名单文件 modified + 任务夹 untracked；无场外改动
- `git diff --numstat`：`audio.js`/`persist.js`/`index.html`/`style.css` 均无输出（0 行）
- game.js 变更 47 增 5 删：5 处删除均为载荷传递签名扩展（b2bBonusVal 参透），无行为删除
- 三个测试文件均为纯追加（增 723 行 / 删 0 行）→ AC-8「既有断言零行级改动」成立

## M3 架构审计（轻量）

- **无重复实现**：`b2bQualifies` 复用 r18 `tspinKind` 产物（kind==='full'），未另写 T-spin 判定；`b2bBonus` 与 r20 `comboBonus` 同构纯函数；链态迁移与 comboChain 共用 finishLock 首行触点
- **单一事实来源**：`B2B_BONUS_BASE=400` 仅 game.js 顶部常量区一处，双测试端均经导出引用（AC-4）
- **抽象恰当**：未过度抽取（三轴共享 pendingReward 机制，ui.js 仅 +7 行）；既有结构无破损（assembly-check 全过、VERSION 一致、audio/persist 0 行）
- **blueprint JSON**：本会话未注入 blueprint → 逐项比对不适用（N/A）
- 审计结论：无架构缺陷

## 缺陷表

| 编号 | 严重级(P0/P1/P2/P3) | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

**未发现缺陷。**

（注：QA 独立抽查初跑 1 项 FAIL 为 QA 自撰断言错误——空闲期 `combo` 应为 null（r20 契约），非产品缺陷；修正断言后 46/46 全绿。）

## 人工补测清单（环境限制，非交付缺陷）

| 项 | 验收标准 | 方法 | 工具 |
|---|---|---|---|
| B2B toast 动效观感（toast-in-out 1600ms 缓动、三轴合并排版、LEVEL UP 同帧重叠视觉） | 无遮挡、层级合理、节奏自然 | 人工游戏触发 Tetris→Tetris/T-Spin 连发观察 | 真实浏览器（Chrome/Edge） |
| 视觉 layout 美学（retina 清晰度、深色毛玻璃下新 B2B 文本对比度） | 与既有 toast 视觉一致 | 人工目检 | 真实浏览器 |
| 真实屏幕阅读器朗读（aria-live=polite 已脚本化断言，需真人读屏确认语气/节奏） | 三轴文案被完整朗读 | 开启 NVDA/VoiceOver 触发奖励 | 读屏软件 |
| 移动端 100dvh 动态工具栏 / safe-area / 多指触控 | 布局不抖动、无截断 | 真机横竖屏 + 多指快速旋转/软降 | 真机 |
| 长跑 FPS/性能（B2B 高频触发 + toast 动画） | 帧率稳定无卡顿 | 人工连续多局观察 | DevTools Performance |
| 音频输出（本需求 audio.js 0 行，无新音效；仅确认既有 clear 音效不受影响） | 消行音效正常 | 人工听测 | 真实浏览器 |

## 备注（供验收引用）

- 规范偏差处置沿用 dev 结论且已被测试真值锁定：PRD §5 表「主奖励轴+B2B 轴」口径（如 1200=800+400）不含 combo 轴；引擎实际增量含 combo（连发二锁总 2050、B9 口径 1250 轴增量），qa-e2e B2 `score===2050` 与 §16.1 断言真值一致，注释已标明口径
- TECHNICAL B6 与 §16.2/E1 的链语义矛盾已按 §16.2/E1 实现：No-line 锁结算帧 `b2bChain=false`（断链）、后续资格锁结算帧 `true`（重新置链）——qa-e2e B6 直测定格
- 分支 `feat/back-to-back-multiplier` 保持未提交；任务夹与代码验收后同批提交（host 收口）