# r29 横屏双轨与三列内容共存（landscape-dual-track-no-overlap）— 产品验收

<!-- meta: summary="r29 验收结论：⚠️ 有条件通过。核心修复（AC-1 让位块）落实且与 TECHNICAL §4.1 逐条一致，AC-6/AC-7 契约与红线 0 diff 复核通过，六套脚本 exit0 + qa-e2e 复跑 507/507；但 AC-2 真实浏览器几何探测未执行（无驱动 → 正确退化源码断言+人工比对），恰是本需求防叠压漏检的核心补强，叠压消除仅源码级证明；QA-REPORT.md 未交付到任务夹（交付物缺口）；r16 长按速率等价测试一次 506/507 系时序抖动（复跑全绿）。条件：① 实机/真实浏览器人工补测 M/L 横屏叠压消失、内容居中，② 补 QA-REPORT 交付物，③ flaky r16 用例复核。架构遵循 blueprint，无重复实现/无结构破坏，无需重工。" -->

基线依赖：docs/teamflow/20260830-r28-landscape-dual-track
取代：docs/teamflow/20260830-r28-landscape-dual-track#AC-1（叠压行为）、#E1（板底悬浮观测项升级）

---

## 1. 验收方法与依据

本次为流水线断点续跑后的**人工验收**（QA 阶段被跳过、QA-REPORT 未产出、验收阶段此前因 token 预算中断）。验收基于：

- 对工作区实际改动（`git diff` + 逐文件核对）的**代码级复核**；
- 独立执行七套验证脚本（结果落盘 `logs/teamflow/tf-mtfo8exi-qwyyjv/acc-*.log`）；
- 对 `scripts/r29-browser-overlap.cjs` 条件性真实浏览器探测的实际运行；
- 对任务夹 `PRD.md` / `TECHNICAL.md` / `DESIGN.md` 与实现的一致性比对。

**工作区改动面（git 复核）**：仅 `style.css`(+43)、`scripts/verify-ui.cjs`(+76)、`scripts/qa-e2e-jsdom.cjs`(+130) 三处修改；新增 `scripts/r29-browser-overlap.cjs` 与任务夹 `docs/teamflow/20260830-r29/`。`game.js` / `audio.js` / `persist.js` / `ui.js` / `index.html` 相对 HEAD **0 diff**（红线满足）。

**七套脚本实跑结果**：

| 脚本 | 结果 |
|---|---|
| verify-game | exit 0 |
| verify-audio | exit 0 |
| verify-ui | 54/54 pass（含 §r29 五组） |
| verify-constants | 2/2 pass（VERSION 三模块 === 2.3.0，与 TECHNICAL.md 不漂移） |
| verify-persist | exit 0 |
| assembly-check | exit 0 |
| qa-e2e-jsdom | 首跑 506/507，**复跑 507/507**（r16 长按速率等价用例抖动） |

---

## 2. 逐条 AC 核对

| AC | 优先级 | 判据 | 结果 | 说明 |
|---|---|---|---|---|
| **AC-1** 横屏恒双轨+内容让位不叠压 | P0 | `#main` 左右各让出 212/104px+inset；双轨保留；取代 r28 叠压 | ✅ | style.css 文件尾新增 `@media (orientation: landscape) and (min-width: 600px)` + `html.has-touch #main`（padding-left calc(212px+inset-left) / padding-right calc(104px+inset-right)），grid→flex-column 单列居中，面板卡化，双轨承继；与 TECHNICAL §4.1 逐条一致；verify-ui/qa-e2e §r29 让位断言全绿；门控裸组合无 max-width |
| **AC-2** 真实浏览器视觉/布局检查 | P0 | 条件性：真实浏览器几何不相交；无浏览器退化源码断言+人工比对 | ⚠️ 部分 | `r29-browser-overlap.cjs` 正确交付并执行——**未检测到 playwright/puppeteer 驱动 → 走 PRD 允许的退化路径（SKIP exit 0，留 AC-7 人工补测）**。叠压消除仅在源码/几何论证层面证明（TECHNICAL §4.2 横向带宽互斥），**无真实浏览器几何证据**。详见 §3 意见 1 |
| **AC-3** 窄屏 S 横屏视觉保持 | P0 | <600px 横屏 §7.2 卡片流/面panel flex 复位零变化 | ✅ | 门控 `min-width:600px` 不命中 S 横屏；§7.2 (`max-width:599px and landscape`) 原文保留（qa-e2e §r29 断言 42356/53972）；M 两档/L 段零触控规则断言全绿 |
| **AC-4** 竖屏零回归 | P0 | S dock / M-L 行式底栏零变化 | ✅ | 媒体查询 `orientation:landscape` 不命中竖屏；§7.1 portrait dock、M-L 行式栏、`--dock-h` 板底预留不动；qa-e2e §r29 竖屏零回归断言全绿 |
| **AC-5** 桌面/键鼠视觉零变化 | P0 | 非 has-touch 零变化 | ✅ | `html.has-touch` 门控前缀保证非触控横屏不命中；verify-ui §r29 桌面零变化负面断言（非 has-touch 前缀 #main 无 212 让位，计数 0）+ grid 模板原文（minmax(0,1fr) 340px 等）保持 |
| **AC-6** 契约与回放器零逻辑 | P0 | TOUCH_KEYS 六值↔data-action 不变；回放器 0 逻辑 | ✅ | `ui.js` / `index.html` 0 diff；六键 data-action 集合与 TOUCH_KEYS 六值交叉一致；回放器路径（touch→合成 keydown）逐字段零变；r27 互换语义（上软降/下硬降）承继 |
| **AC-7** 红线 0 diff + VERSION 不动 | P0 | game/audio/persist 0 diff；VERSION 不动；交互/press/safe-area/多指承继 | ✅ | `game.js` `audio.js` `persist.js` `ui.js` `index.html` 相对 HEAD 0 diff；VERSION 三模块 === 2.3.0；`--dock-h`/safe-area/多指守卫/`:active` 三态全部承继（本需求仅追加 #main 让位声明） |
| **AC-8** 七套全绿零回归 | P0 | 七套全绿；r24/r26/r27/r28 零回归 | ⚠️ | 六套 exit 0；qa-e2e 首跑 1 例 r16 长按速率等价 506/507（时序抖动），**复跑 507/507**。§r29 六组 + r24/r26/r27/r28 §段全部零回归 |
| **AC-9** 人工补测清单 | P1 | M/L 横屏实机/切换态/S 横屏/竖屏行式栏/读屏/safe-area/多指/FPS/手感 | ⚠️ 未闭环 | PRD §2 AC-9 已列清单，但**任务夹无 QA-REPORT.md**，人工补测清单未作为交付物正式登记/留验；需补交付（见 §3 意见 2） |

---

## 3. 意见与遗留（P1 为主，不构成产品缺陷）

1. **AC-2 真实浏览器几何证据缺失（最关键）**：r29 核心风险恰是「脚本断言漏检叠压」。本次环境无 playwright/puppeteer 驱动，`r29-browser-overlap.cjs` 正确走退化路径（SKIP exit 0），故「双轨与信息面板/按钮 `getBoundingClientRect` 相交面积=0、`#main` 无横向滚动」**未在真实浏览器实测**。叠压消除为源码断言 + TECH §4.2 横向带宽互斥论证，工程上可靠但非直接证据。**条件**：须在真实设备/浏览器（emulate 768×400 / 1024×600 横屏 has-touch）确认叠压消失、内容居中、无横向滚动；或提供带驱动环境下 `r29-browser-overlap.cjs` 的全绿输出。
2. **交付物缺口：任务夹缺 `QA-REPORT.md`**：PRD §3 交付物明确要求 QA-REPORT/ACCEPTANCE 入任务夹，QA 阶段在断点续跑中被跳过未产出 QA-REPORT。本次验收报告补充了实跑证据，但正式 QA-REPORT（含七套明细、AC-9 人工补测清单登记）仍未交付。**条件**：补一份 QA-REPORT.md 入任务夹（或由您在验收意见中确认接受本次实地验证作为等价证据）。
3. **r16 长按速率等价用例 flaky**：qa-e2e 首跑该用例（K= vs T= 软降格数差 ≤1）一次 506/507，复跑全绿——属时序边界抖动而非回归（r16 断言，非 r29 改面；r29 仅 CSS/断言改动，未触 DAS 时钟）。**条件**：建议后续复核该用例稳定性或加抖动量容忍。

## 4. 架构/blueprint 一致性（质量门）

- **blueprint 遵循**：5 模块（style.css / verify-ui / qa-e2e / index.html / ui.js）分工、assembly order 均按 `<!-- blueprint -->` 落地。本需求为**纯 CSS 作用域布局让位**，无模块抽取/无新增抽象，符合 blueprint「唯一生产代码改动 = style.css 新增 1 媒询块」的定位。
- **无重复实现 / 无适配器漂移 / 无结构破坏**：改动为纯追加（style.css +43、两验证脚本 + 追加 §r29 段），无覆盖既有规则、无复制触控逻辑、无破坏现有栅格/双轨结构。`html.has-touch #main`(1,1,1) 特异性反超 §7.3/§7.4 `#main`(1,0,0) 为设计意图的级联裁决，非结构破坏。
- **结论**：架构质量合格，**无需重工**。

## 5. 验收结论

**⚠️ 有条件通过（Conditional Pass）**

实现层面（AC-1/3/4/5/6/7）全部满足且与设计/技术方案逐条一致，红线 0 diff、VERSION 一致、契约零逻辑、七套全绿（除 1 例 flaky 复跑通过），无需架构重工。**暂不判「✅ 通过」**，因本需求的核心防回归主题——AC-2 真实浏览器几何证据——未在本次环境产生（退化路径正确但未实测），且任务夹缺正式 QA-REPORT 交付物（AC-9 人工补测清单未登记）。

**通过条件（满足后即转「✅ 通过」）**：
1. 真实设备/浏览器确认 M/L 横屏（≥600px）叠压消失、内容居中、无横向滚动（或提供带驱动 `r29-browser-overlap.cjs` 全绿输出）；
2. 补 `QA-REPORT.md` 入任务夹（或您确认接受本次实地验证等价）；
3. 复核 r16 flaky 长按用例。

**遗留观察项（不阻断，P1）**：AC-9 人工补测清单在实机环境执行（叠压手感/横竖屏切换态/读屏语义/safe-area/多指/FPS）；板底 188px 双轨 vs `--dock-h` 预留差（r28#E1 残余）在本方案以横向让位覆盖，真机若有板底视觉残留仅作观测，不入代码。

<!-- state -->{"phase":"acceptance","verdict":"conditional-pass","summary":"r29 验收：⚠️ 有条件通过。AC-1 让位块（style.css 追加 @media landscape and min-width:600px + html.has-touch #main 212/104+inset 左右 padding + flex-column 居中）与 TECHNICAL §4.1 逐条一致；AC-3/4/5/6/7 全部满足——红线五文件 0 diff、VERSION 2.3.0 一致、TOUCH_KEYS 契约零逻辑、桌面/S 横屏/竖屏零回归；六套脚本 exit0 + qa-e2e 复跑 507/507，r24/r26/r27/r28 §段零回归。条件保留：① AC-2 真实浏览器几何探测未执行（无驱动正确退化 SKIP，叠压消除仅源码+几何论证级证明，缺浏览器几何证据——恰为本需求防叠压漏检核心），② 任务夹缺 QA-REPORT.md（QA 阶段被跳过未产出，AC-9 人工补测清单未登记），③ r16 长按速率等价用例一次 506/507 系时序抖动复跑全绿。架构遵循 blueprint、无重复实现/无结构破坏，无需重工。","memory":["r29 验收⚠️有条件通过：AC-1/3/4/5/6/7 满足，红线五文件 0 diff、VERSION 2.3.0、契约零逻辑；六套 exit0、qa-e2e 复跑 507/507","核心条件=AC-2 真实浏览器几何探测未跑（无 playwright/puppeteer 驱动 → r29-browser-overlap.cjs 正确退化 SKIP），叠压消除仅源码断言+TECH§4.2 横向带宽互斥论证级证明，缺 getBoundingClientRect 相交=0 实证→留实机人工补测","交付物缺口=任务夹缺 QA-REPORT.md（QA 阶段被跳过），AC-9 人工补测清单未登记；r16 长按速率等价用例 flaky（506/507 一次）复跑绿","架构遵循 blueprint（纯 CSS 作用域让位、无模块抽取/无重复实现/无结构破坏）无需重工；memory 不动（bug 修复非新约定）"]}<!-- /state -->
