# QA-REPORT — r24 移动端触控操作区重设计（掌机十字 + 旋转簇 + 背景四方案）

## 结论（verdict）

**验收就绪**。七套验证全绿 + QA 独立对抗抽查 37/37 + 静态审计/红线全部成立，未发现缺陷。
零回归红线上确认（game/audio 0 diff、VERSION 三模块一致、TOUCH_KEYS/回放器零逻辑改动、仅 7 文件改动）。
浏览器 computed 布局实测因环境沙箱拒绝 Chrome/Edge 子进程（crashpad/mojo 拒绝访问 0x5）降级为 jsdom + 静态验算，
AC-2/4/5/9/10 的实测量与视觉项列入人工补测清单（环境限制，非交付缺陷）。

## 1. 范围与环境

- 产品根 `products/tetris/`，分支 main，工作区改动 = 7 个目标文件 + 任务夹 3 文档（无散落文件）。
- 交付面：`index.html` 掌机双簇（.tpad-cross 4 键+✛hub / .tpad-main Hold+旋转）、`ui.js` 外观组与 applyDockSkin、
  `persist.js` DOCK_SKINS+sanitize string 分支、`style.css` 三档尺寸/四皮肤/门控、三条验证脚本增补。
- 环境：node v22 + jsdom（harness pnpm 路径）；无图像输入；headless 浏览器被沙箱拒绝（见 §6）。

## 2. 执行结果：七套验证（全部重跑通过，日志 logs/teamflow/tf-mte60543-w71v24/qa-out.log）

| 套件 | 结果 |
|---|---|
| verify-game.cjs | 130/130 pass |
| verify-audio.cjs | 24/24 pass |
| verify-constants.cjs | 2/2 pass（VERSION 2.3.0 三模块一致） |
| verify-persist.cjs | 19/19 pass |
| verify-ui.cjs | 36/36 pass |
| assembly-check.cjs | ALL CHECKS PASSED |
| qa-e2e-jsdom.cjs | 447/447 ALL PASSED |

## 3. QA 独立对抗抽查（qa-r24-independent.cjs，37/37 通过，不同攻击面）

- **A 契约独立扫描（9）**：六 data-action ↔ TOUCH_KEYS 集合全等（DOM 重组零改名）；十字簇恰 4 键、右簇恰 2 键且 Hold 源序在旋转前；
  hub 为 span 无 data-action/tabindex/role、aria-hidden、无 .tkey 键类 + CSS pointer-events:none；
  radio 恰 4 个值 ↔ DOCK_SKINS 全等、默认 checked=fade 且位于设置弹层子树；ui/persist 枚举深等。
- **B sanitize 对抗矩阵（11）**：对象/数组/函数/数字/null/undefined/空串/空白/大小写变体/String 包装对象全回 def 不 throw；
  def 缺省合法→原值、非法→undefined；schema null/无 type 安全；原始 backing 注入非法值（绕过 saveSettings）→ readState 清洗回 fade；
  r23 旧载荷无 dockSkin 字段 → 恢复 fade 且其余七设置原样、PAYLOAD_VERSION 仍 1。
- **C 行为端到端（17）**：装配默认 fade 类+radio 同步；四皮肤循环切换恰一类+持久化写回+引擎快照全字段零漂移；
  弹层开启（req-12 自动暂停）中切换即时生效且零音效（正交）；弹层开关不扰动皮肤类；backing 注入非法值二次装载回退 fade 且 radio 镜像；
  合法值跨实例恢复；dispose 后 radio 点击零写（解绑）；✛ 七种事件零合成 keydown/零副作用（对照 moveLeft 正常 x−1）；
  restart 皮肤保持；桌面无 has-touch + 外观组基座 display:none + has-touch 显示规则；dispose 后 has-touch 回收；零全局泄漏。

## 4. 零回归红线（git 审计）

- `git diff game.js audio.js` 空；VERSION 三模块 2.3.0 不动。
- `ui.js` diff 未触 TOUCH_KEYS/createTouchControls 定义（仅 export 上下文行）与回放器；六 `data-action` 字面量零改名。
- 涉及文件恰 7 个（index/persist/style/ui + verify-ui/verify-persist/qa-e2e）；任务夹 PRD/DESIGN/TECHNICAL 未触碰。
- 测试脚本改动：verify-ui、qa-e2e 纯追加；verify-persist 1 处登记改写（往返用例补 `dockSkin:'pod'`——
  新持久化字段进入真实写读往返，属 payload 契约扩展而非旧期望反转，初始默认值断言零改动）。

## 5. 架构检查（M3 质量门）

- 无 blueprint JSON 注入（无待抽取模块清单可对照）；按既有扁平 UMD 架构 + 工厂/闭包约定落地。
- **重复实现**：sanitize string 枚举分支仅 persist.js 一处（唯一 `schema.type === 'string'`）；皮肤类拼接仅 ui.js
  applyDockSkin 一处；DOCK_SKINS 定义仅 persist/ui 双端 + index.html radio value 三处，全部由 verify-ui 交叉断言防漂移（延续
  TOUCH_KEYS 既有模式）——非缺陷。
- **抽象恰当**：applyDockSkin 纯函数导出（Node 可单测、全量去类防双类残留）；ui 侧白名单自校验与 persist 清洗构成双保险。
- **装配/结构**：assembly-check ALL + 447 E2E 覆盖 file:// 管线；`--tpad-key` 基座别名保留（D1）避免 M/L 既有断言/算式连锁改动。
- 观察项（非缺陷）：style.css 作用域切片（S 竖屏/横屏块）与四皮肤类名耦合，已由 verify-ui 位置断言 + qa-e2e 行为断言双锁；
  紧凑档两条 media（max-width:359 ∥ max-height:639）嵌套于 portrait 块内，与 AC-4 判定式一致。

## 6. 缺陷表

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| — | — | — | 未发现缺陷（七套全绿 + 独立 37/37 + 红线零差异） | — | — | — |

## 7. 人工补测清单（环境限制：沙箱拒绝浏览器子进程 + 无图像输入，非交付缺陷）

| # | 验收标准 | 方法 | 工具 |
|---|---|---|---|
| 1 | AC-2/AC-4 紧凑档实测量：320×568 portrait touch 下十字 56 / 旋转 80 / Hold 48、gap 10、touchpad 与整页横向零溢出（scrollWidth≤clientWidth） | 非沙箱环境运行 `node logs/teamflow/tf-mte60543-w71v24/qc-r24-browser.cjs`（CDP 数值断言，仅输出数字） | Chrome/Edge headless + 触摸模拟 |
| 2 | AC-2 标准档 375×667：64/96/56、gap 12，computed 与规格偏差 ≤1px | 同上脚本 ② 段 | 同上 |
| 3 | AC-5 一屏零滚动：320×568 / 375×667 / 390×844 竖屏 `documentElement.scrollHeight ≤ clientHeight` | 同上 ①/②/③ 段 | 同上 |
| 4 | AC-9 M/L 恒玻璃：800×600 touch 下 .touchpad 背景为玻璃（非渐隐渐变），切换四皮肤背景不变 | 同上 ⑥ 段 | 同上 |
| 5 | AC-10 横屏侧轨：568×320 landscape 键径 56/80/48；板框包围盒内嵌 [212, vw−212] 零遮挡（余量≥13px）；safe-area 贴底 | 同上 ④ 段 + 真机截图对拍 | 同上 + DevTools 截图 |
| 6 | AC-7/15 C 渐隐默认态棋盘辨识度/对比度（正常亮度清晰可辨） | 截图对拍（设计稿 vs 实渲染） | DevTools/真机 |
| 7 | AC-14 键盘可访问性：外观组 radio 方向键切换、焦点态清晰、读屏朗读 | 仅键盘走查 + 屏幕阅读器 | NVDA/系统朗读 |
| 8 | 真机延续项：100dvh 动态工具栏、safe-area、多指并发不串扰、FPS 手感 | 真机走查（承继 r16/r19/r21 清单） | Android/iOS 真机 |
| 9 | 回放器等效：六键点击 = 键盘事件逐键等效（含踢墙/落底计分/onSfx）于真机再抽样 | 真机对照操作 | 真机 |

> 静态证据已先行成立：紧凑档 320px 验算注释（32+188+16+80=316≤320）、媒体条件与 PRD 判定式逐字一致、
> verify-ui 对三档 token 与紧凑分支的存在性断言、皮肤作用域切片断言、横屏轨宽算式（3×56+2×10+2×12=212px）。

## 8. 结论

AC-1~15 全部通过或由静态断言+代码审计锁定，人工补测项均为数值/视觉/真机确认性质（标准与方法已给出）。
交付满足「七套全绿出口 + 零回归红线」要求，同意流转验收。