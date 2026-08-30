# QA-REPORT — r28 横屏双轨门控放宽（tf-mtfdc6do-l56no2）

## 结论（verdict）

**验收就绪（acceptance-ready）**：AC-1~AC-6 自动化面全部通过，未发现 P0/P1/P2 缺陷；仅 1 处 P3 注释口径陈旧（非阻塞，见缺陷表）。红线段（game.js/audio.js/persist.js/ui.js/index.html 0 diff、VERSION 未动）复核通过。

## 范围与环境

- 交付变更集（git 实测）：`style.css`（§5.5 门控 `and (max-width: 599px)` 移除 → 裸 `@media (orientation: landscape)`，5+/5-，规则体零动）、`scripts/verify-ui.cjs`（r26 门控断言改写 + §r28×3 测试）、`scripts/qa-e2e-jsdom.cjs`（§r28×6 组断言）；任务夹 PRD/DESIGN/TECHNICAL 未跟踪待提交。
- 环境：Node v22、jsdom；无浏览器/真机/图像输入 → 视觉与真机项转「人工补测清单」（环境限制，非交付缺陷）。

## 用例与结果（七套全绿 + 独立抽查）

| # | 检验项 | 结果 |
|---|---|---|
| 1 | verify-game（引擎+onSfx 序列） | ✅ 130/130 |
| 2 | verify-audio（合成音效） | ✅ 24/24 |
| 3 | verify-ui（含 §r28：门控文本精确 47 / §7.2 独立 48 / 双作用域同串 49） | ✅ 49/49 |
| 4 | verify-constants（VERSION 三模块一致 2.3.0，未动） | ✅ 2/2 |
| 5 | verify-persist | ✅ 19/19 |
| 6 | assembly-check（装配/自包含/音频审计） | ✅ ALL PASSED |
| 7 | qa-e2e-jsdom（r24/r26/r27 零回归 + §r28 六组：双轨 DOM/六键 rail 映射/hub 三事件零回放/源序触控语义逐键/M·L 档零触控规则） | ✅ 492/492 |
| 8 | 独立对抗抽查（自有锚点 `qa-r28-independent.cjs`，与套件不共用断言实现） | ✅ 21/21 |
| 9 | 红线：git diff game/audio/persist/ui/index.html | ✅ 空输出 |
| 10 | AC-1 门控放宽：全文件无 `(orientation: landscape) and (max-width` 组合；§5.5 为横屏唯一 .touchpad 权威（内层 landscape 卡片块、§7.2 均零触控规则） | ✅ |
| 11 | AC-2 契约：index.html 六键源序 softDrop→moveLeft→moveRight→hardDrop（左轨）/ hold→rotate（右轨）；TOUCH_KEYS 六值域与 DOM 全等、回放器 0 逻辑改动 | ✅ |
| 12 | AC-3 竖屏冻结：基座 order 1..4（硬降 左 右 软降）源序递增在位；S 竖屏 dock 与横屏双轨 nth-child 映射归一化逐串全等 | ✅ |
| 13 | AC-4 桌面：非 has-touch 显隐 CSS 门控未动（qa-e2e 既有用例零回归） | ✅ |
| 14 | AC-5 红线/承继：如上 9 + 交互/按压/safe-area/多指由既有套件覆盖零回归 | ✅ |
| 15 | AC-6 断言改写；§7.2（L1929 max-width+landscape）原样保留，sLandR24 锚点零漂移，花括号平衡 304/304 | ✅ |

## 缺陷表

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| QA-r28-01 | P3 | style.css（§4 注释） | 读 style.css L1068-1070 r27 order 冻结注释 | 注释口径与 r28 门控放宽一致（≥600px 横屏已不再落行式栏） | 括注仍写「≥600px 横屏门控行式栏」——r28 移除门控后已无该场景；规则体本身仅作用于行式栏（order 对显式 grid-area 无视觉影响），**行为无影响**，纯注释陈旧 | AC-1 / AC-3 |

## 人工补测清单（环境限制，非交付缺陷）

| # | 验收项 | 方法 | 工具 |
|---|---|---|---|
| M1 | 真机横屏双轨手感（含 ≥600px 宽屏：7 寸平板横屏、折叠屏展开态）——左轨十字上软降/下硬降、右轨 Hold/旋转，键径 56/80/48 手感 | 真机旋转至横屏，六键逐一点按并观察 board 响应与键位落位 | 真机（Android/iOS） |
| M2 | 横竖屏切换态：旋转过程布局切换无闪白、坐标/键位不漂移、对局状态不被重置 | 对局中连续旋转设备 | 真机 |
| M3 | 竖屏 M/L 行式底栏回归：六键一排、恒玻璃、键序 硬降 左 右 软降 Hold 旋转；S dock 零变化 | 竖屏 ≥600px 与 <600px 各一档观察 | 真机/浏览器设备模拟 |
| M4 | 读屏语义：hub ✛ aria-hidden 不朗读、六键 aria-label 朗读正确 | 开启读屏（TalkBack/VoiceOver）扫读触控区 | 真机读屏 |
| M5 | safe-area / 100dvh 动态工具栏 / 多指 / FPS：侧轨贴边避让、工具栏收起无遮挡、双指同时点按互不干扰、旋转后帧率稳定 | 真机多指点按 + 性能面板 | 真机 + DevTools Performance |

## 架构检查（M3 质量门）

- 蓝图 JSON：本交付无注入 blueprint 块 → N/A；实现与 TECHNICAL.md 方案一致（单点门控放宽 + 断言改写 + §r28 追加，无越界改动）。
- 重复实现：无漂移——TOUCH_KEYS 单一事实来源（ui.js ↔ index.html 交叉断言）；双作用域（横屏/竖屏）nth-child 映射为 **有意的级联重复**（代码注释声明 + §r28 防合并护栏 + 同串断言钳制），非结构缺陷。
- 抽象缺失/结构破坏：无——纯 CSS 媒体查询单行放宽，无需抽象；花括号平衡 304/304，块嵌套完整。
- 结论：**未发现架构缺陷**。

## 说明

- 遗留处理（开发侧自述）：E1（`--dock-h` 64px < 轨高 188px 预留差）承继 AC-7 真机观测（→ 并入 M1/M5）；E2（jsdom 断点模拟限制）已由源码级断言替代落地，本次 QA 复核确认到位。
- 巡检发现 qa-e2e 既有 350/350 与 492/492 两轮输出分别对应 §r28 前/后段基线，无异常。