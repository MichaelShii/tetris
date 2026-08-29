# ACCEPTANCE — r24 移动端触控操作区重设计（掌机十字 + 旋转簇 + 背景四方案）

## 结论

**✅ 通过（验收采纳）**。AC-1~15 逐条核对通过（P0×13 全过、P1×2 通过）；七套验证全绿 +
QA 独立对抗抽查 37/37；零回归红线独立复核成立（game/audio 0 diff、VERSION 2.3.0 三模块一致、
回放器零逻辑改动、恰 7 文件）；M3 架构质量门无缺陷、无返工项。
9 项几何/视觉/真机实测量因环境沙箱拒绝浏览器子进程列入人工补测清单——环境限制非交付缺陷，
不影响验收结论（与 r21/r23 同模式）。

## 验收依据

- **基线依赖**：r23（B2B 计分/Toast 等既有行为零回归）；触控层承继 r16 逐键等效/守卫、r19 一屏零滚动、r21 has-touch 门控。
- **取代**：r19#AC-3（六键单行 48px dock → 掌机双簇），历史夹未动。
- **独立核验**：git 审计（红线上成立）；verify-constants 独立复跑 0 fail；DOM/CSS 关键点抽查（双簇/✛ hub/外观组 radio×4/media 条件/skin 作用域）。

## 验收标准逐条核对（AC-1~15）

| AC | 标准（摘要） | 结果 | 证据 |
|---|---|---|---|
| AC-1 P0 | 布局契约一一对应 | ✅ | `.tpad-cross`（hardDrop/moveLeft/moveRight/softDrop）+✛hub、`.tpad-main`（hold/rotate）；六 data-action 与 TOUCH_KEYS 集合全等、零改名零重映射（QA 契约扫描 9/9；ui.js diff 纯追加 70+/0−） |
| AC-2 P0 | 尺寸规格 64/96/56·56/80/48·gap12 | ✅* | style.css 标准 1595-1597（64/96/56）+紧凑 1742-1744（56/80/48）、gap 12（紧凑 10 按设计稿）；verify-ui token 断点断言；computed ±1px 实测→补测 #1/#2 |
| AC-3 P0 | ✛ 纯装饰 | ✅ | hub=span 无 data-action/tabindex/role、aria-hidden、无 .tkey 键类、CSS pointer-events:none；qa-e2e 七事件零合成 keydown/零副作用（对照 moveLeft 正常 x−1） |
| AC-4 P0 | 紧凑判定 + 320px 零溢出 | ✅* | media（max-width:359 ∥ max-height:639）嵌套 portrait 块，与判定式逐字一致；320 验算注释 32+188+16+80=316≤320；verify-ui 断点断言；scrollWidth 实测→补测 #1 |
| AC-5 P0 | 一屏零滚动（承继 r19） | ✅* | verify-ui 视口断言+静态锁定；三档 scrollHeight≤clientHeight 实测量→补测 #3 |
| AC-6 P0 | 逐键等效 + 回放器零逻辑改动 | ✅ | createTouchControls/TOUCH_KEYS 定义 0 逻辑 diff（ui.js 全部新增行，键盘合成/分发路径未动）；qa-e2e 447/447=既有触屏仿真沿用+r24 新用例，r16 守卫一致 |
| AC-7 P0 | 「操作区背景」设置项 | ✅ | 设置弹层「外观」组 radio×4（默认 fade checked）；change→全量换类+persistSettings+radio 镜像；切换不重载/不重置对局，引擎快照逐字段零漂移（qa-e2e 断言） |
| AC-8 P0 | 持久化与非法回退 | ✅ | persist.js DOCK_SKINS+sanitize string 枚举分支（唯一）；缺省/非法回 fade；PAYLOAD_VERSION=1 不变，r23 旧载荷无字段→fade 且其余设置原样（QA sanitize 11/11） |
| AC-9 P0 | 皮肤作用域 | ✅* | 四皮肤类仅 S 竖屏/横屏作用域块（1307+/1683+），M/L 基座恒玻璃；verify-ui 位置断言+qa-e2e 行为断言双锁；computed 实证→补测 #4 |
| AC-10 P0 | 横屏侧轨重排 | ✅* | 56/80/48 分派（1185-1187）；轨宽算式 3×56+2×10+2×12=212px；safe-area 贴底+左右 inset；z-index 承继 r21 防遮键；[212,vw−212] 零遮挡截图→补测 #5 |
| AC-11 P0 | 引擎/音效 0 diff | ✅ | `git diff game.js audio.js` 空（exit-code 复验）；VERSION 2.3.0 三模块一致；verify-constants 独立复跑 0 fail |
| AC-12 P0 | 桌面无感 | ✅ | 外观组基座 display:none、has-touch 显示；qa-e2e 桌面门控/回收用例；全部 CSS 改动在触控作用域内，桌面视觉 0 变化 |
| AC-13 P0 | 七套全绿出口 | ✅ | 130/24/2/19/36/ALL/447 全绿（QA 重跑，日志 qa-out.log；verify-constants 独立复跑）；测试脚本纯追加，verify-persist 1 处登记改写=payload 契约扩展非期望反转；r23/r21/r19/r16 用例零回归 |
| AC-14 P1 | 触控目标与可访问性 | ✅* | 最小紧凑 Hold 48px≥44px；✛ aria-hidden 不入读屏；外观组原生 radio 键盘可达、焦点态清晰；读屏走查→补测 #7 |
| AC-15 P1 | DESIGN token 一致 | ✅* | 四皮肤复用既有玻璃/霓虹 token，零新增色板/阴影体系（代码审查确认）；C 渐隐默认态棋盘辨识度对拍→补测 #6 |

\* = 静态/自动化断言已成立；实测量/视觉项为环境受限人工补测项（清单见 QA-REPORT §7 与下方遗留）。

## M3 架构质量门

- 无 blueprint JSON 注入；按既有扁平 UMD + 工厂/闭包约定落地，装配一致（assembly-check ALL + file:// 管线 e2e 覆盖）。
- **无重复实现**：sanitize string 分支仅 persist.js 一处（唯一 `schema.type==='string'`）；皮肤类拼接仅 applyDockSkin 一处；DOCK_SKINS 三处（persist/ui/index radio）为既有 TOUCH_KEYS 式分布+交叉断言模式，verify-ui 交叉锁防漂移。
- **抽象恰当**：applyDockSkin 纯函数导出（Node 可单测、全量去类防双类残留）；ui 白名单自校验 + persist 清洗构成双保险。
- `--tpad-key` 基座别名保留（D1），M/L 既有断言/算式零连锁改动。
- 观察项（非缺陷）：皮肤类与 S/横屏作用域块 CSS 耦合由位置+行为断言双锁；紧凑双 media 嵌套 portrait 块与 AC-4 判定式一致。
- **结论：无返工项，架构面通过。**

## 零回归红线（独立复核）

- `git diff game.js audio.js` 空；VERSION 2.3.0 ×3（verify-constants 0 fail）。
- 改动恰 7 文件：index.html(35+/8−)、persist.js(17+/1−)、style.css(339+/31−)、ui.js(70+/0−)、verify-ui(157+/0)、verify-persist(50+/2−)、qa-e2e(120+/0)；game/audio 0 行。
- ui.js 纯追加（0 删除）→ TOUCH_KEYS/createTouchControls/回放器未触碰；index.html 8 删=旧六键单行 dock 移除，属取代 r19#AC-3 声明范围；style.css 31 删=旧 dock 定位/键距规则随作用域重构，基座原语保留。
- verify-persist 2 删=1 处登记改写（往返用例补 `dockSkin:'pod'`）+ 注释，旧期望零反转。
- 分支 main、工作区仅 7 目标文件+任务夹未提交（符合「与任务夹同批提交」约束）。

## 意见与遗留

1. **人工补测 9 项（环境限制非缺陷）**：AC-2/4 三档 computed 尺寸、AC-5 一屏零滚动、AC-9 M/L 恒玻璃、AC-10 横屏零遮挡截图对拍、AC-15 C 态辨识度、AC-14 读屏走查、真机 safe-area/多指/FPS/回放等效抽样；工具 `logs/teamflow/tf-mte60543-w71v24/qc-r24-browser.cjs` 已留档（非沙箱环境执行）。
2. **提交**：验收通过后代码（7 文件）+ 任务夹四文档（PRD/DESIGN/TECHNICAL/QA-REPORT/ACCEPTANCE）同批一次提交（分支 main，无指定分支动作）。
3. **memory.md**：无新团队约定/技术栈决策；仅按待办同主题行补记 r24 人工补测项。
4. 无打回项、无返工项。

## 总结论

r24 交付满足 PRD 全部验收条件（AC-1~15）与工程约束（七套全绿出口 + 零回归红线 + M3 结构质量），**✅ 通过**。