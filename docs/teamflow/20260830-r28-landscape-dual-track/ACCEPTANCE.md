# ACCEPTANCE — r28 横屏双轨门控放宽（tf-mtfdc6do-l56no2）

## 结论

**✅ 通过（accepted）**——AC-1~AC-6（P0×6）全部满足，AC-7（P1）人工补测清单已移交产品验收；M3 架构一致性检查无异常；无 P0/P1/P2 缺陷，仅 1 处 P3 注释陈旧（非阻塞）。

## 验收现场独立复跑（非采信 QA 报告）

| 套件 | 结果 |
|---|---|
| verify-game | ok 130 / fail 0 |
| verify-audio | ok 24 / fail 0 |
| verify-ui（含 §r28 47-49） | ok 49 / fail 0 |
| verify-constants（VERSION 2.3.0 三模块一致） | ok 2 / fail 0 |
| verify-persist | ok 19 / fail 0 |
| assembly-check | ALL CHECKS PASSED |
| qa-e2e-jsdom（含 §r28 六组，r24/r26/r27 零回归） | 通过 492 / 492 |

工作区核对：分支 main；改动恰为 style.css / scripts/verify-ui.cjs / scripts/qa-e2e-jsdom.cjs 三处（diff 10/81/121 行）+ 任务夹未跟踪；**game.js / audio.js / persist.js / ui.js / index.html 0 diff**。日志落 `logs/teamflow/tf-mtfdc6do-l56no2/ac-*.log`。

## AC 逐条核对

| AC | 判据 | 现场核证 | 结果 |
|---|---|---|---|
| **AC-1**（P0）横屏恒双轨、取代行式 | 移除/放宽侧轨宽度门控；≥600px 横屏不落行式底栏；键位与竖屏一致（硬降在下、软降在上） | style.css:1321 = 裸 `@media (orientation: landscape) {`；全文件无 `(orientation: landscape) and (max-width` 残留组合；L1602 内层 landscape 块仅卡片化选择器（.stat-grid/#controls 等）零触控规则 → §5.5 为横屏唯一 .touchpad 权威（级联独裁成立）；L1929 §7.2 `@media (max-width: 599px) and (orientation: landscape)` 原样保留（S 竖屏切片锚点不漂移） | ✅ |
| **AC-2**（P0）契约与回放器零逻辑改动 | .tkey[data-action] ↔ TOUCH_KEYS 六值零变化；上=softDrop/下=hardDrop（r27 语义承继） | ui.js / index.html 0 diff；qa-e2e §r28 左轨源序 softDrop→moveLeft→moveRight→hardDrop、右轨 hold→rotate、六键动作集合各恰 1 全绿 | ✅ |
| **AC-3**（P0）竖屏 M/L 行式底栏保持现状 | 竖屏 M/L 六键一排恒玻璃、r27 冻结键序；S dock 零变化 | 基座 order 1..4（hardDrop 左 右 softDrop）冻结未动（style.css L1071+）；verify-ui M 双档断言与 r27 段全绿；qa-e2e §r28⑥ 证明 M 两档+L 段零触控规则（横屏不再落行式属设计使然，非回归） | ✅ |
| **AC-4**（P0）桌面/键鼠零变化 | 非 has-touch 视觉/布局 0 变化 | index.html/ui.js 0 diff；无新增/改动桌面侧 CSS 规则；桌面相关断言零回归 | ✅ |
| **AC-5**（P0）红线 0 diff | game/audio/persist 0 diff；VERSION 不动；按压/safe-area/多指承继 | git status 确证五红线文件 0 diff；verify-constants 2/2（VERSION 2.3.0 未动）；style.css 改动仅门控行+注释（10 行 diff），规则体 1322-1505 零动 | ✅ |
| **AC-6**（P0）七套脚本全绿出口 | r26/r27 门控/行式栏断言改写（取代 r26#AC-3）+ §r28 段；七套全绿零回归 | verify-ui r26 断言登记改写（785-788：裸门控+全文件护栏）+ §r28 三测（门控文本精确/§7.2 独立锚点恒等/双作用域 nth-child 同串）；qa-e2e §r28 六组（双轨 DOM/键位映射/hub 零事件/源序触控语义/不落行式栏）；七套独立复跑全绿，r24/r26/r27 零回归 | ✅ |
| **AC-7**（P1）人工补测清单更新 | 真机横屏双轨手感（含 ≥600px 宽屏）/横竖屏切换态/竖屏 M/L 行式栏回归/读屏/safe-area-多指-FPS | QA-REPORT M1-M5 与 PRD AC-7 清单逐项对应，移交产品人工验收（本环境无真机/图像输入，属环境限制非交付缺陷） | ✅（留人工） |

## M3 架构一致性检查

- 蓝图 JSON（TECHNICAL.md L143 `<!-- blueprint -->` 注入块）逐模块核对：`/style.css`（order 1：§5.5 门控放宽，规则体零动）✓、`/scripts/verify-ui.cjs`（order 2：r26 断言改写 + §r28 段）✓、`/scripts/qa-e2e-jsdom.cjs`（order 3：§r28 段）✓、`/index.html` 与 `/ui.js`（order 0：红线段 0 diff，契约锚点）✓。**实现与蓝图一致，无越界改动。**
- 重复实现：无漂移。TOUCH_KEYS 单一事实来源；双作用域 nth-child 映射为**有意级联重复**（注释声明 + verify-ui §r28 双作用域同串断言 + 防去重护栏钳制）。
- 抽象缺失/结构破坏：无——单行媒体查询放宽无需额外抽象；花括号/块嵌套完整（QA 独立抽查 304/304）。
- **结论：未发现架构缺陷，不触发 ⚠️/❌ 条件。**

## 缺陷与遗留

| 编号 | 级别 | 内容 | 处置 |
|---|---|---|---|
| QA-r28-01 | P3 | style.css L1068 r27 order 注释括注仍写「≥600px 横屏门控行式栏」——r28 已移除该门控；规则体仅作用于行式栏（order 对显式 grid-area 无视觉影响），**行为零影响，纯注释陈旧** | **接受，非阻塞**；建议下次触碰 CSS 时顺手清理（未列入待办） |

无 P0/P1/P2 缺陷。E1/E2 环境限制按 QA 报告承继（并入 M1/M5 人工项）。

## 验收结论

r28「横屏（has-touch、任意宽度）恒走左右双轨十字」交付满足 PRD 全部验收标准：门控放宽落点精确（style.css §5.5 唯一权威、规则体零动、无组合门控残留）、红线段 0 diff、TOUCH_KEYS 契约与回放器 0 逻辑改动、r26 断言登记改写（取代 r26#AC-3）与 §r28 断言段齐备、七套脚本验收现场独立复跑全绿零回归。**判定：✅ 通过。** 交付物（含任务夹四文档）未提交，由 host 验收确认后按工程约束在 main 同批单提交（含记忆更新收口）。