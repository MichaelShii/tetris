# r16 移动端触屏控制 — 验收报告（产品经理 · 最终验收）

## 结论

**✅ 通过。** r16 六键触屏控制满足 PRD AC-1~14（P0×12 / P1×2）全部验收标准，架构一致性核查（M3 质量门）合规，无 P0/P1/P2 缺陷；P3 观察 D1/D2 按设计接受（D1 已写回 memory）。验收复跑（本报告撰写时独立执行）七套全绿：`verify-game 97 / verify-audio 24 / verify-ui 20 / verify-constants 2 / verify-persist 15 / assembly-check ALL PASSED / qa-e2e 354/354`（主段 339 + file:// 段 15 累计）。

## 验收对象与基线

- **对象**：分支 `feat/mobile-touch-controls` @ `9546d07`（实现与 PRD/DESIGN/TECHNICAL 入库）；工作区仅未跟踪任务夹 `QA-REPORT.md`（本报告随交付一并提交）。
- **基线依赖**：r15 多格预览队列（docs/teamflow/20260827-r15-multi-grid-preview-queue）；无「取代」项——触屏为新增输入通道，未改任何既有 AC 行为。
- **评审证据**：任务夹 PRD（AC-1~14 原文）、TECHNICAL `<!-- blueprint -->`、QA-REPORT（67 行）、QA 独立抽查脚本与日志、接受方复跑日志 `logs/teamflow/tf-mtbp8o1b-cm72wz/accept-run.log`、ui.js/style.css/index.html 代码抽查。

## AC 逐项检查表

| AC | 级别 | 验收判定 | 证据 |
|---|---|---|---|
| AC-1 触屏显隐按设备检测、不重置状态 | P0 | ✅ | isTouchDevice 三通道（ontouchstart!=null / maxTouchPoints / pointer:coarse，Node/jsdom 恒 false）+ `html.has-touch` 纯 CSS 显隐；E2E 双路径断言 |
| AC-2 PAUSED/OVER 下按钮无副作用 | P1 | ✅ | createTouchControls RUNNING 守卫拦截派发（仅 preventDefault）；QA C3 click 三态（READY/PAUSED/OVER 零输入零音效） |
| AC-3 左/右移动等效键盘（1s 差值≤1 格） | P0 | ✅ | E2E 600ms 长按走引擎 SOFT_DROP_REPEAT_MS 时钟：K=17 / T=17（差值 0 ≤ 1），Δ≥6 证连续 repeat、松手无残留 |
| AC-4 软降等效 ↓ | P0 | ✅ | 同上，K=17 / T=17 |
| AC-5 硬降=空格（事件序列一致） | P0 | ✅ | E2E 触屏硬降 vs 键盘 事件序列相等断言（含计分/lockFlow/onSfx） |
| AC-6 旋转含踢墙 20 次 100% 一致 | P0 | ✅ | E2E 固定序列 20 次触屏 vs 键盘旋转盘面逐格一致 |
| AC-7 Hold 每周期限 1 次 | P0 | ✅ | E2E（'c' 经 window onHoldKey 同路径；周期内二次点击无效与 r14 一致） |
| AC-8 防滚动/缩放/选中/长按（位移 0px） | P0 | ✅ | pad/按钮/canvas 层 preventDefault + `touch-action:none`；E2E defaultPrevented 断言 |
| AC-9 多指互不串扰、连点无抖动 | P0 | ✅ | 每键独立 `activeKeys` Set（同键重复忽略防双发）；E2E 双指 + QA C6 |
| AC-10 触屏与键盘并存互不干扰 | P0 | ✅ | QA C9 跨通道双向实证（键盘输入完整可用）；D1 为已知固有权衡（见下） |
| AC-11 现有 HTML 按钮全流程可达 | P0 | ✅ | 既有按钮/面板零改动，E2E 暂停↔继续循环无死角 |
| AC-12 布局不遮挡 ≥95%、按钮 ≥44×44 | P1 | ✅ | `--tpad-key` 3rem(48px)/窄屏 2.75rem(44px)；竖屏遮挡 99.8% 保留、横屏侧轨中列零遮挡（TECH 算术） |
| AC-13 图例触屏化不误导 | P0 | ✅ | `html.has-touch .key-hints { display:none }` + 触屏键双标签（字形+文字）；E2E 静态断言 |
| AC-14 七套全绿零回归 | P0 | ✅ | **接受方复跑** 97/24/20/2/15/ALL/354 全绿；r15/r14 全 AC 无回归（E2E 含 r14/r15 段）；桌面键鼠无 has-touch → 零视觉变化（PRD 所列计数为 r15 基线，新增触屏用例使 verify-ui 17→20、qa-e2e 294→354，属预期增长） |

## 架构一致性核查（M3 质量门）

- **蓝图落地**：TECHNICAL `<!-- blueprint -->` 五模块（index.html → style.css → ui.js → verify-ui → qa-e2e）全部落地，职责与 assemblyOrder 一致；触屏代码全仓唯一实现点，无重复实现/适配器漂移。
- **红线满足**：`game.js / audio.js / persist.js` 本提交 0 行 diff（git show --stat 证实）；ui.js 零新增速率常量（DAS 170/软降 50 不变，E2E 断言回归基线）；触屏长按复用键盘 repeat 时钟（PRD §8 约束）。
- **已登记合规偏差（有证据）**：isTouchDevice 叠加 `ontouchstart !== null` 判别（jsdom#2429，jsdom 事件属性 null vs 浏览器 undefined，保「jsdom 恒 false」蓝图意图）；TECH §2.1 `label` 字段以实现为准（键名由 DOM 承载，verify-ui 已对齐）。
- **结论**：无需架构返工，不构成有条件通过。

## P3 观察项裁定

- **D1（触屏/键盘同键交错共享 held 槽，任一通道 keyup 冲掉另一通道长按 repeat）**：AC-10 与「复用键盘 repeat」双约束下「触屏=键盘事件回放器」设计的**必要推论**，非实现缺陷。接受不改，已写回 memory.md 团队约定（输入通道条目）防后续误报。
- **D2（has-touch 注释「归属计数」实为 boolean）**：注释精度问题，单例应用不可达。接受不改。

## 意见与遗留

- **人工补测 R1~R10**（真机能力检测 / 防滚动缩放与长按菜单 / 375×667 与 812×375 布局遮挡 / 刘海安全区 / 真实多指 / 长按速率手感 / 触屏笔记本混合设备 / 桌面零视觉变化 / 按键音效听感 / D1 真机复验）：环境限制非缺陷，已并入 memory.md 待办「人工补测汇总」，真机环境就绪后集中补测。
- **交付确认**：本需求产物齐全（PRD/DESIGN/TECHNICAL/QA-REPORT/ACCEPTANCE 五件套于任务夹）；memory.md 仅按约定层最小写回，未动迭代索引与 AGENTS.md。

<!-- state -->{"phase":"acceptance","summary":"r16 移动端触屏控制验收通过：AC-1~14 逐项达标，架构核查（M3）合规，无 P0/P1/P2 缺陷；接受方复跑七套全绿 97/24/20/2/15/ALL/354（qa-e2e 主段 339 + file:// 段 15 累计）；P3 D1（跨通道同键共享 held 槽互扰=回放器设计必要推论）与 D2（注释精度）按设计接受；真机补测 R1~R10 入 memory 人工补测待办","verdict":"accepted","memory":["r16 ACCEPTANCE 已写任务夹：验收通过（feat/mobile-touch-controls @ 9546d07，复跑七套 97/24/20/2/15/ALL/354 全绿）","D1 裁定：触屏与键盘同键交错共享 held 槽为逐键等效回放器必要推论，接受不改——已作为输入通道约定写入 memory.md 团队约定层","真机补测 R1~R10 已并入 memory.md 人工补测汇总待办（与既有音效/布局等环境限制项同一行）","交付闭：r16 任务夹五件套齐（PRD/DESIGN/TECHNICAL/QA-REPORT/ACCEPTANCE），memory 仅约定层最小写回，未动迭代索引/AGENTS.md"],"extra":{"done":true,"acResult":{"AC-1":"P0✅ AC-2":"P1✅ AC-3":"P0✅ AC-4":"P0✅ AC-5":"P0✅ AC-6":"P0✅ AC-7":"P0✅ AC-8":"P0✅ AC-9":"P0✅ AC-10":"P0✅ AC-11":"P0✅ AC-12":"P1✅ AC-13":"P0✅ AC-14":"P0✅"},"suites":{"verify-game":97,"verify-audio":24,"verify-ui":20,"verify-constants":2,"verify-persist":15,"assembly-check":"ALL PASSED","qa-e2e-jsdom":354}}}<!-- /state -->