# QA-REPORT · r17 全面响应式重排（Tetris v3.4）

> meta：r17-qa / 分支 `feat/responsive-layout` / 基线 HEAD `9546d07` / 测试人：QA 测试工程师（独立复核）
> 关联：PRD `docs/teamflow/20260828-r17-responsive-layout/PRD.md`（AC-1~13）；基线依赖 r16 移动端触屏控制（AC-1~14 不得回归）

## 1. 结论（先行）

**验收就绪。未发现 P0/P1/P2 级缺陷。** 七套验证全绿（verify-game 97 / verify-audio 24 / verify-ui 23 / verify-persist 15 / verify-constants 2 / assembly-check ALL / qa-e2e-jsdom 366/366，含 r17 段 13 项），0-diff 红线保持（game/audio/persist/ui.js 各 0 行 diff），VERSION 三模块一致 2.3.0（verify-constants 2/2），verify-ui 断点断言恰 +3（20→23，符合 AC-13 上限）。架构核查无 P1 级发现。3 项 P3 观察（均不阻塞，已附处置建议）；真机几何类验收项受沙箱环境限制（禁 CDP 浏览器）列入 §5 人工补测清单。

## 2. 范围与环境

- 范围：r17 断点框架实现 —— `index.html`（.stat-grid 包裹 + viewport-fit=cover）、`style.css` §7（S/M/L 四档 + 两行 dock + S 横屏变体）、`scripts/verify-ui.cjs`（+3 断点源结构断言）、`scripts/qa-e2e-jsdom.cjs`（r17 e2e 段 + file:// 装配断言）、`docs/teamflow/memory.md`（布局约定 + v3.4 索引行）。
- 环境：Windows 沙箱（workspace-write）。**环境限制**：禁 CDP 驱动 Chrome/Edge → 真实浏览器几何（包围盒/滚动位移/像素/真机 inset）不可自动验证；jsdom 无布局引擎，断点命中由真实浏览器 CSS 兑现（PRD R4 已声明）。以上按规则入 §5 人工补测清单，非交付缺陷。
- 日志：`logs/teamflow/tf-mtbtl6gk-vuwx4p/qa-*.log`（7 份）。

## 3. 执行用例与结果

| 编号 | 用例 | 方式 | 结果 |
|---|---|---|---|
| C1 | 七套回归全绿 + 计数对齐（97/24/23/15/2/ALL/366） | 运行 7 套脚本 | ✅ |
| C2 | verify-ui 断点断言 +3 且 ≤+3（AC-13） | 运行 + diff 审阅 | ✅ 20→23 |
| C3 | 0-diff 红线：game/audio/persist/ui.js/verify-constants.cjs 零改动 | git diff --stat | ✅ 5 文件全空 |
| C4 | VERSION 三模块一致（AC-13） | verify-constants | ✅ '2.3.0'×3 |
| C5 | AC-8 跨档 resize 5 轮（390/768/1024/320/844）快照逐字段不变 + RUNNING + 无重载（hash/history 未变）+ 风暴后可游玩 | qa-e2e r17 段 | ✅ 6 项全 ✓ |
| C6 | AC-5 has-touch 增删不重置对局、dispose 类回收 | qa-e2e r17 段 | ✅ |
| C7 | AC-1 S 竖屏单列：flex column + order 列序表（stat 10/设置 20/预览 30/棋盘 40/Hold 50/提示 60/按钮 70）、卡片 max-width 420 防溢出 | 静态证据 + 源审阅 | ✅（真机几何→人工） |
| C8 | AC-2/3 dock 单一事实来源：--dock-h（S=2×48+16+32+inset=144+inset；M=48+2×8+inset=64+inset，与 r16 单行 dock 净高同算式核对成立）、#main padding-bottom 引用、.touchpad flex-wrap + min-height:max(..,16.5vh)、viewport-fit=cover + env 兜底双行 | 静态证据 + 手工算术核对 | ✅（上缘/中心带几何→人工） |
| C9 | AC-4 可点目标：--tpad-key 48px（=3rem，根字号缺省 16px）、S/M 各档 html.has-touch .btn min-height:44px（L 保持 r16 40px 基座 = AC-7 零回归要求） | 静态证据 + token 核对 | ✅ |
| C10 | AC-6 M 档：600-767 两列 minmax(0,1fr) 340px + 768-1023 三列 minmax(180px,1fr) 340px minmax(180px,1fr)（D4 订正 768→两侧 190px 无滚动） | 静态证据 + 算术核对 | ✅（⚠ 见 D1） |
| C11 | AC-7 L 档零新增：基座 grid 240|340|240 在首个 @media 前、.stat-grid 基座 gap:var(--sp-5) 复刻 #panel-left 原 flex gap（实测 L290-291 gap:var(--sp-5) 相符） | verify-ui + e2e 静态 + 源审阅 | ✅ |
| C12 | AC-9 S 横屏变体：row 覆盖 + HUD 4 列 + #board max-height:calc(100vh-150px) 显示层缩放（不碰画布/渲染）；r16 横屏侧轨零改动（§7.1b 两行 dock 收口 portrait，横屏规则源序不被反超） | 静态证据 + 级联分析 | ✅（⚠ 见 D2；真机→人工） |
| C13 | AC-12 现有按钮全可达、PAUSED/OVER 无副作用：DOM 除包裹层零变动、r16 点击路径/三态/防双发全套回归 | r16 e2e 回归（366 内含）+ DOM 比对 | ✅ |
| C14 | 结构完整性：style.css 括号 195/195 平衡、index.html div 41/41 平衡、两脚本 node --check 语法通过 | 静态审计 | ✅ |
| C15 | 装配契约：.stat-grid 包裹层含四块 .stat、HUD 经包裹照常渲染、assembly-check 全绿（含 find 后代选择器命中） | qa-e2e file:// 段 + assembly | ✅ |

## 4. 架构核查（M3 质量门禁）

- **蓝图符合性**：本轮无独立 blueprint JSON；实现严格按 PRD/TECHNICAL 范围——纯 CSS 媒体查询断点（派生样式非状态，零 JS/零引擎触达），唯一 DOM 增量为 .stat-grid 包裹层，DOM 顺序即 L 档基线（禁重排）✅。
- **重复实现排查**：断点框架单块（style.css §7）全仓唯一；无 JS 侧重复逻辑；--dock-h 在 S/M 两档 3 个媒体块内以同一算式文本重复声明，系 CSS 自定义属性媒体作用域必然（非漂移源），已手工核对两算式与各自 dock 净高自洽 ✅。
- **抽象合理性**：未过度工程——CSS-only + 单包裹 div，未引入新 JS 状态/常量；validate 脚本沿用 r16 源文本断言技术（防漂移护栏，非复制代码）✅。
- **结构健康度**：§7.1b 两行 dock 收口 portrait 正确避让 r16 横屏侧轨（级联分析通过）；ui.js onResize 仅 boardRenderer.resize()（DPR 重烘焙），零档位感知 = AC-8 构造保证 ✅。观察项见 D1~D3。

## 5. 缺陷登记表

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| D1 | P3 | 布局/断点 | 视口 600–676px（M 两列档下界）：板框 min-content 312px（280 画布+16×2 padding）> 轨道余量（600−340−24=236，阈值 676） | M 档棋盘主区完整可见、与信息列 0 重叠 | 板框右缘溢出轨道压向信息列（grid 内溢出不会被裁，仅视口外被既有 body overflow-x:hidden 裁剪），即 600–676px 带存在视觉重叠/截断 | AC-6 |
| D2 | P3 | 布局/S横屏 | S 横屏 568×320 / 640×360 真机 | 棋盘等比例缩放全显、无空间浪费 | `max-height: calc(100vh - 150px)` 为双样本对拍占位量（320−48−52≈220 可用高的推断值），未真机校准 | AC-9 |
| D3 | P3 | 架构/测试护栏 | 后续迭代修改 M 档 --dock-h 公式 | M 档 dock 单一事实来源有自动护栏 | verify-ui 仅断言 S 档 calc 形状；M 档 64+inset 算式无自动化断言（当前手工核对与 r16 单行 dock 净高一致，未来有漂移风险） | AC-2/AC-13 |

> D1/D2/D3 均由 dev 遗留观察互证确认，评估为边界档窄带/护栏增强类，均不阻塞验收。

## 6. 人工补测清单（环境限制，非交付缺陷；需真实浏览器/真机）

1. **AC-1/AC-10 真机单列**：≤430px 宽（iPhone SE/Pro Max 样本）卡片流列序、横向 0 溢出、数值≥16px/正文≥12px 无截断省略。
2. **AC-2/AC-11 触控区几何**：两行 dock 上缘≥50% 视口、总高≤45%、与最后卡片 0 重叠；中心带 55%–92%；键距≥8px 目检。
3. **AC-3 iOS safe-area**：刘海/底部条设备（viewport-fit=cover 生效）底内边距 = max(8px, env(inset))。
4. **AC-9 S 横屏**：568×320 / 640×360 全可见可玩、棋盘缩放无失真（对 D2 裁决）。
5. **AC-6/D1**：600–676px 两列档板框重叠复验，裁决是否将轨道上调 minmax(312px,1fr) 或 M 下界提至 676px。
6. **AC-7 L 档**：≥1024px 桌面与 r16 基线截图比对零漂移（.stat-grid 包裹后间距无变化）。
7. **AC-8 真机手势版**：运行中连续 5 次跨档旋转/resize 无漂移、无重载。
8. **AC-11 多指不串扰**：竖屏两行 dock 多指六键操作（r16 D1 观察延续场景）。

## 7. 结论

- 自动化层：七套全绿、断言计数符合出口、0-diff 红线与 VERSION 一致全部达成（AC-13 ✅）。
- 静态/算术层：AC-1~12 全部有静态证据或 e2e 行为证据支持；无 P0/P1/P2。
- 人工层：§5 D1~D3 三项 P3 观察 + §6 八项真机清单待 host/人工补测后终裁。
- **验收判定：可流转产品验收（ACCEPTANCE）**，无阻塞项。