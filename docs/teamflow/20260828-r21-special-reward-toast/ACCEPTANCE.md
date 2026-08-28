# ACCEPTANCE — r21 特殊奖励 Toast（Combo / T-Spin）

- 需求：Combo 与 T-Spin 消行奖励即时 Toast —— 纯展示不改计分（取代 `r19#AC-12` 指示器 UI 归 P2 的落地；基线依赖 r20-combo-line-clear-reward，含 r18 T-spin 六档与 r22 主线行为）
- 验收人：产品经理（验收负责人）；日期：2026-08-28
- 分支：`feat/special-reward-toast`；任务夹：`docs/teamflow/20260828-r21-special-reward-toast/`
- 验收方式：独立复跑全部验证套件 + 源码/样式/DOM 核验 + git diff 红线上限核对

## 结论（verdict first）

**✅ 通过。** 八套验证独立复跑全绿；0-diff 红线成立（engine/persist 0 行）；PRD AC 表 12 条（AC-1~12）全部满足；QA 首轮发现的 D-1（P2）已修复并有回归实证；架构 M3 无重复实现、无结构破坏；未发现未决缺陷。遗留仅环境限制型人工补测 5 项（不阻塞验收，见 §四）。

## 一、独立复跑结果（2026-08-28，日志 logs/teamflow/tf-mtctcv9m-ou8v65/accept-*.log）

| 套件 | 结果 | 说明 |
|---|---|---|
| verify-game | 全绿（exit 0） | 119 用例，含 §14.6 / §15.10 双 soak（各 50 局确定性注入，逐锁增量累和 == onGameOver 总分、无 NaN/负分）|
| verify-audio | 全绿 | 24，事件序列零变化 |
| verify-ui | 全绿 | 28（23 既有 + 5 新增；旧断言零行级改动）|
| verify-constants | 全绿 | 2，VERSION 三模块一致（未动）|
| verify-persist | 全绿 | 15（persist 0-diff）|
| assembly-check | ALL CHECKS PASSED | 自包含 / 装配序 / 音频审计 |
| qa-e2e-jsdom | 395 / 395 | 367 既有零改动 + r21 S1~S10（+28）纯追加 |
| qc-r21-independent（QA 独立对抗，复跑） | 44 / 44 | A1~A4 + B1~B8，含 D-1 实证（B7）、事件面零新增（B6）、多轴合并恰 2 段（B8）|

## 二、AC 对照表（PRD AC-1~12）

| AC | 判定 | 证据 |
|---|---|---|
| AC-1 复用既有 toast 子系统 + 常量收敛 UI 契约 | ✅ | `#reward-toast` 为 createFeedback 扩槽（非新组件），沿用 `--z-toast` / `toast-in-out` keyframes；`TOAST_DURATION=1600`（1200~2000 由 verify-ui 锁定）；无新增引擎接口 |
| AC-2 Combo 触发，数值与结算一致 | ✅ | buildRewardText 直读载荷 comboBonus/combo；qe S2 `Combo ×1 +50`；qc B8 `Combo ×3 +150` 链值实打 |
| AC-3 T-Spin 六档分档 Toast；No-line 不弹 | ✅ | `T_SPIN_TIER_LABEL` 六档 + 最小形态兜底；cleared<1 跳过；qe S5（restart 后首消 T-Spin Single +800，D-1 实证）/ S6（No-line 0 弹）|
| AC-4 单帧多轴合并恰 1 根、无轴丢弃 | ✅ | 单结算帧单次 reward()；合并序 T-Spin 前 · Combo 后；verify-ui 矩阵与 qc B8「恰 2 段 · 分隔、两轴俱在」断言 |
| AC-5 全 0 奖励静默 | ✅ | buildRewardText → null → 不调 reward()；qe S1 |
| AC-6 1600ms 衰减 / 显示期替换 / OVER·restart 0 残留 / 与 LEVEL UP 共存 | ✅ | 独立 rewardTimer 单定时器替换（不堆积）；qe S3（restart 0 残留）/ S8（OVER 0 残留）/ S7（双槽同帧并存）；jsdom 假时钟断言淡出 |
| AC-7 数值同源、会话隔离、persist 0-diff | ✅ | comboBonus 载荷直读、tspinBonus 同函数同参派生（文案值与引擎恒等）；pendingReward 会话内存、OVER/restart 归零、无跨局状态；persist 0-diff |
| AC-8 aria-live=polite（P1） | ✅ | index.html L80 `role="status" aria-live="polite" hidden`；文本为主不依赖纯色；reduced-motion 镜像（style.css L1242）|
| AC-9 DESIGN token 视觉 + 四档布局（P1） | ✅* | 零新 token 同族胶囊：top:28px、max-width:min(92%,320px)、white-space:normal 换行、toast-in-out 1600ms ease-out 复用；S竖 fs-xs / S横 fs-sm 降级；*真机视觉/动效观感随人工补测 |
| AC-10 0-diff 红线 engine 0 行 | ✅ | `git diff HEAD` 仅 ui.js / style.css / index.html / verify-ui.cjs / qa-e2e-jsdom.cjs（+489/−8 全 UI 侧）；game.js/audio.js/persist.js 0 行；R1 解除（tspin 载荷引擎已透出，S5 全链路实证）|
| AC-11 零回归 + soak 无漂移 + 旧期望零改动 | ✅ | §1 八套全绿；§14.6/§15.10 soak 通过（引擎 0-diff 前提下必然稳）；qa-e2e/verify-ui 旧断言 0 行级改动 |
| AC-12 onSfx 事件面 0 变化 | ✅ | engine 0-diff → 事件序列恒等（verify-game 绿）；reward() 无任何音效调用；qc B6 24 次 onSfx ⊆ 既有 8 事件零新增 |

## 三、架构检查（M3）

- 本会话未注入 blueprint JSON；按 TECHNICAL「五件套」设计逐项核对：模块 / 职责 / 装配点相符，无偏离、无漏抽取。
- 无重复实现：buildRewardText 单点定义单点消费；toast-in-out keyframes 单定义双槽复用（800/1600ms 仅时长差）；T_SPIN_TIER_LABEL 单一事实来源；UI 层零计分逻辑（纯只读展示，消费既有 clearing 载荷 additive 字段）。
- 既有结构无破坏：LEVEL UP 路径逐字不变（dispose 仅加性追加 clearReward）；createFeedback 返回键扩为四键（缺槽 no-op，向后兼容）；导出双通道齐备。**无 P1，无重构需求。**

## 四、缺陷复核与遗留

- **D-1（P2，已修复）**：restart 后首个计分消行为 T-Spin 时，clearing 帧 score=0&&lines=0 曾被重启代理误清 pendingReward → 修复为 ③ 分支追加 `clearedIndices === null` 守卫；回归实证：qe S5 + qc B7（同种子对照热修前后）。引擎 0 行。**未发现未决缺陷。**
- **环境限制人工补测（非交付缺陷，验收后择机执行）**：AC-9 真机视觉/四档布局；AC-6 动效观感 + reduced-motion 对比；AC-8 读屏播报；音效可听性；移动端 Toast 位置/安全区。

## 五、结论与移交

- 判定：**✅ 通过**（AC-1~12 全过；M3 无 P1；0-diff 红线成立；八套全绿零回归）。
- 移交：登记 memory 产品版本（v3.6 → **v3.7**）；随后同批提交（5 个改动文件 + 本任务夹）至 `feat/special-reward-toast`；人工补测 5 项转入环境补测汇总。