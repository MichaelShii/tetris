# r17 响应式重排 验收报告（产品经理 · 最终验收）

**验收对象：** r17 全面响应式重排 —— S<600px 竖屏单列 + 底部触控操作区 / M 600–1023px 多列 / L≥1024px 桌面基线
**基线依赖：** docs/teamflow/20260827-r16-mobile-touch-controls（AC-1~14 不得回归）｜**取代：** 无
**验收人：** 产品经理（acceptance lead）
**验收对象文件：** index.html / style.css / scripts/verify-ui.cjs / scripts/qa-e2e-jsdom.cjs / docs/teamflow/memory.md + 任务夹

## 结论（先行）

**✅ 通过（accepted）。** 验收人独立重跑七套脚本实测全绿：verify-game **97** / verify-audio **24** / verify-ui **23** / verify-persist **15** / verify-constants **2** / assembly-check **ALL** / qa-e2e-jsdom **366/366**（含 r17 段）。AC-1~13 逐条核对满足；game/audio/persist/ui.js 0 行 diff 红线保持；VERSION 2.3.0 三模块一致。无 P0/P1/P2 缺陷；P3 观察 3 项（D1/D2/D3）不阻塞，随验收写入产品待办。真机几何类验证（环境限制非缺陷）沿用既有先例列入人工补测清单。

## 验收证据（本次独立复核）

| 项 | 实测 |
|---|---|
| 七套脚本重跑 | 97/24/23/15/2/ALL/366，exit 全部 0（logs/teamflow/tf-mtbtl6gk-vuwx4p/acc-verify.txt） |
| git 足迹 | 分支 feat/responsive-layout；改动 = memory.md / index.html / verify-ui.cjs / qa-e2e-jsdom.cjs / style.css + 未跟踪任务夹；game/audio/persist/ui.js 均不在 diff |
| 结构核查 | §7 断点框架全仓唯一（纯 CSS 媒体查询派生样式，无 JS 重复逻辑）；.stat-grid 包裹层为唯一 DOM 增量；DOM 顺序恒为 L 档 grid 基线；--dock-h 多处文本重复系 CSS 自定义属性媒体作用域必然，算式自洽 |

## 逐 AC 核对表

| AC | 判 | 依据 |
|---|---|---|
| AC-1 S 档单列、0 横向溢出、无面板重叠 [P0] | ✅ | §7.1 `display:contents`+order 列序表（10~70 七段）+ 卡片 max-width 防溢出；e2e 静态断言 ✓；scrollWidth≤clientWidth 真机清单#1 |
| AC-2 触控区固定底部、上缘≥50%视口、总高≤45%、0 重叠 [P0] | ✅ | .touchpad fixed 沿用；`#main{padding-bottom:var(--dock-h)}`（verify-ui 断言存在）；S 净高算术 2×48+16+32+inset=144+inset ≤45%×568、上缘 100vh−144 >50% 成立（QA 手工核对）；真机复核清单#2 |
| AC-3 safe-area 避让 [P0] | ✅ | `viewport-fit=cover`（index.html L5 + verify-ui 断言）；底 padding = max(8px, env(inset))（L1212/1265/1267 双行兜底）；inset=34 模拟真机清单#3 |
| AC-4 按键/可点元素 ≥44×44、六键齐全语义不变 [P0] | ✅ | `--tpad-key:3rem`=48px；S/M 档 `html.has-touch .btn{min-height:44px}`（L1274/1324/1343）；L 保持 40px 基座（AC-7 零回归）；六键 DOM 与语义零改动 |
| AC-5 has-touch 纯 CSS 显隐、不重置对局 [P0] | ✅ | r16 机制原样；e2e r17 增删 has-touch 快照逐字段不变 + phase RUNNING + dispose 类回收 ✓；ui.js 0 diff |
| AC-6 M 档多列、触控保留 0 重叠 [P0] | ✅* | §7.3 两列 `minmax(0,1fr) 340px`；§7.4 三列 `minmax(180px,1fr) 340px minmax(180px,1fr)`（768px 处每侧 190px，D4 订正落地）；dock 保留 M=64+inset；*D1(P3)：600–676px 子区间板框 min-content 312px>轨道 236px 视觉溢出被 body overflow-x:hidden 裁剪（无横向滚动），登记待办，真机复验清单#5 裁决 |
| AC-7 L 档与 r16 基线几何一致零回归 [P0] | ✅ | §7.5 零新增规则；基座 `.stat-grid{gap:var(--sp-5)}` 复刻原 gap（e2e 静态断言）；DOM 顺序即基线、无重排；截图比对真机清单#6 |
| AC-8 运行中跨档切换不重载不重置、连续 5 次无漂移 [P0] | ✅ | e2e r17 resize 5 轮（390/768/1024/320/844）快照逐字段不变 + RUNNING + hash/history 无重载信号 + 风暴后仍可游玩 ✓；ui.js onResize 仅 DPR 重烘焙、零档位感知（构造保证） |
| AC-9 小屏横屏变体全可见可玩 [P1] | ✅* | §7.2 landscape：row 重排 + 面板复位 + HUD 4 列 + `#board{max-height:calc(100vh-150px)}` 显示层缩放；*D2(P3)：150px 为 568×320/640×360 对拍占位量，真机校准清单#4 |
| AC-10 可读性：数值≥16px、正文≥12px、无截断 [P1] | ✅ | 字号 token 表最小 `--fs-xs:12px`（正文实际 13/15px、tkey 标签 15px），统计数值 `--fs-2xl:32px`/`--fs-xl:24px` ≥16；S 档仅 #title 36→24 压缩、无更小覆盖；无截断/省略真机清单#1 |
| AC-11 触控习惯区 55%–92%、键距≥8px、多指不串扰 [P1] | ✅ | 两行 dock `gap:var(--sp-4) var(--sp-2)`=行距 16/键距 8（自动证据）；中心带由 `min-height:max(…,16.5vh)` 保障；多指语义 r16 AC-9 回归内嵌 366 ✓，真机清单#7 |
| AC-12 现有 HTML 按钮全档可达、PAUSED/OVER 无副作用 [P0] | ✅ | S/M 44px、L 40px 基座全档可点；PAUSED/OVER 语义=r16 行为原样（零 JS/DOM 行为改动）+ e2e 回归全绿 |
| AC-13 零回归出口 [P0] | ✅ | 七套全绿 97/24/23/15/2/ALL/366；verify-ui +3（20→23）恰达上限；game/audio/persist/ui 0 diff；VERSION 2.3.0 三一致（verify-constants ✓） |

## M3 架构核查

- 未注入 blueprint JSON → 蓝图逐点比对 N/A；按「重复实现 / 适配器漂移 / 结构破坏」下限核查：断点框架全仓唯一、JS 侧零重复逻辑（onResize 无档位感知）、.tkey 组件零改动（两行 dock 仅容器级 flex-wrap）、r16 横屏侧轨经 §7.1b portrait 收口零改动（级联 QA 复核通过）。
- 无「应提取未提取」、无适配器漂移、无既有结构破坏。结构评价：合规，无架构返工项。

## 遗留与建议（不阻塞验收）

| 编号 | 级别 | 内容 | 建议 |
|---|---|---|---|
| D1 | P3 | M 档 600–676px 板框 min-content 312px > 轨道 236px 视觉溢出（无横向滚动） | 下轮 M 档轨道改 `minmax(312px,1fr)` 或 M 下界上调 676px，真机对拍后裁决 |
| D2 | P3 | S 横屏棋盘 `max-height:calc(100vh-150px)` 为对拍占位量 | 568×320 / 640×360 真机校准 |
| D3 | P3 | verify-ui 仅断言 S 档 `--dock-h` calc 形状，M 档 64+inset 无自动化护栏 | 下轮补 M 档断点断言 |

**人工补测清单（环境限制非缺陷，随 QA-REPORT 集中处理）**：真机单列几何/字号截断（AC-1/10）、dock 上缘与总高%/中心带（AC-2/11）、iOS safe-area inset=34（AC-3）、S 横屏 568×320/640×360（AC-9·裁决 D2）、600–676px 复验（AC-6·裁决 D1）、L 档截图比对（AC-7）、跨档手势 5 次与多指（AC-8/11）。

## 判定

**✅ 通过（accepted）。** 分支 feat/responsive-layout 全部改动未提交（含任务夹），按 ADR-2026-08-27 由 host 验收后同批提交（建议信息：`feat(Tetris v3.4): 全面响应式重排 - S/M/L 三档断点…`），提交后按流程走分支合并决策。

<!-- state -->{"phase":"acceptance","summary":"r17 响应式重排验收通过（accepted）：独立重跑七套全绿 97/24/23/15/2/ALL/366（exit 全 0），AC-1~13 逐条核对满足、r16 基线 AC-1~14 无回归（game/audio/persist/ui 0 diff、VERSION 2.3.0 三一致）；M3 架构核查合规无返工项；P3 遗留 3 项不阻塞（D1 M 档 600-676px 板框溢出建议 minmax(312px,1fr)/下界 676、D2 S 横屏 150px 占位待真机、D3 M 档 --dock-h 补断言）；真机几何清单随人工补测。git 未提交留 host 同批提交。","memory":["ACCEPTANCE.md 已单次写入 docs/teamflow/20260828-r17-responsive-layout/（判定=✅ 通过 accepted，无 P0/P1/P2，P3×3 不阻塞）","验收独立复核：七套脚本实跑 97/24/23/15/2/ALL/366 全绿 exit 0；git diff 仅 memory/index.html/verify-ui/qa-e2e/style.css+任务夹（game/audio/persist/ui 0 diff）","M3 核查：无 blueprint 输入；§7 断点框架全仓唯一、.tkey 零改动、onResize 零档位感知、§7.1b portrait 收口保 r16 侧轨——无重复实现/适配器漂移","待办登记 r17 遗留：D1(M 档 600-676 板框 312>236 溢出,建议 minmax(312px,1fr) 或下界 676)/D3(verify-ui 补 M 档断言)；D2(150px 真机校准)随人工补测汇总"],"extra":{"verdict":"accepted","done":true}}<!-- /state -->