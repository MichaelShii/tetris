# QA-REPORT：r26 移动端触控键帽质感统一与横屏侧轨校正 + 2×2 缩略选择器（复测）

任务夹：docs/teamflow/20260829-r26-touchpad-keys-dock-skin/ ｜ 基线：r24（docs/teamflow/20260829-r24-touchpad-cross）
分支：main（未提交改动 4 文件 + 本任务夹，符合「同批提交」约定）

## 0. 结论（先行）

**验收通过（可验收）**。上轮打回的 6 项 verify-ui CSS 断言缺口（T2 style.css 未交付）已全部补齐，本轮 verify-ui **44/44**、qa-e2e **463/463**、七套全绿；上轮缺陷表 D1~D4（P0×2/P1×2）**全部闭环**；独立对抗抽查 23/23；红线 0-diff（game/audio/ui/persist）与 VERSION 一致成立；架构 M3 无新增结构性问题。P0/P1 均无未决项，仅剩环境限制类人工补测（真机目测/读屏/多指，非交付缺陷）。

## 1. 范围与环境

- 测试对象：工作树 4 处改动（index.html T1、style.css T2、scripts/verify-ui.cjs T4、scripts/qa-e2e-jsdom.cjs T5）+ 本任务夹文档。
- 环境：Node v22.22.3 + jsdom（无浏览器驱动、当前模型无图像输入）→ 运行七套验证脚本 + 源码结构断言 + 独立对抗抽查；视觉主观项全部入「人工补测清单」，不猜测不重试。
- 日志：logs/teamflow/tf-mte906e9-fj1z8l/qa-r26-*.txt、qa-r26-adversarial.log（无根目录散落）。

## 2. 用例与结果（对照 AC-1~15）

| AC | 内容 | 验证手段 | 结果 |
|---|---|---|---|
| AC-1 | 横屏 Hold 正圆 border-radius:50% | verify-ui「两作用域三键类正圆」+ 对抗抽查 | ✅ |
| AC-2 | 独立 .rail 元素 + 单边描边（弃伪元素全边） | qa-e2e §r26 rail 结构（恰 2、包裹、无 data-action）；verify-ui 轨道盒/伪元素轨拆除断言；对抗抽查 | ✅ |
| AC-3 | M/L 横屏恒行式底栏（<600px 门控） | verify-ui 门控 + M 块零侧轨断言（600/768 双档正则）；style.css L1313 实查 | ✅ |
| AC-4 | 横屏几何零回归（承继 r24 AC-10） | qa-e2e 既有 447 用例零回归（463 全绿）；git diff 审查 | ✅ |
| AC-5 | 全触控键帽正圆（Hold 补漏） | verify-ui 三键类断言 ×2 作用域；对抗抽查 | ✅ |
| AC-6 | 旋转主键增强零新增色板 | verify-ui 常亮环 color-mix(primary 55%)；对抗抽查 :root token 计数 = 49（与 r24 基线一致） | ✅ |
| AC-7 | 2×2 网格不挤出 | verify-ui 网格/320 预算断言；对抗抽查 repeat(2,minmax(0,1fr)) | ✅ |
| AC-8 | 真实皮肤缩略图 + 名称另起一行 | verify-ui 四 name span + tile 皮肤类；qa-e2e 装配默认 fade；对抗抽查（dskin-dot mini 预览 + name span 4 档） | ✅ |
| AC-9 | 选中态 + radio 语义 | verify-ui checked 描边+✓/focus-visible 环；CSS 实查 | ✅ |
| AC-10 | 即时生效/持久化/非法回退/has-touch 不变 | qa-e2e §r26：radio 点击→皮肤类全量替换+checked 同步+settings.dockSkin 写持久化+引擎快照零漂移+dispose；persist 19/19 | ✅ |
| AC-11 | game/audio 0 diff、VERSION 一致 | git diff 空 + verify-constants 2/2 | ✅ |
| AC-12 | 作用域仅 S 竖屏 + 手机横屏；M/L 恒玻璃 | verify-ui「皮肤作用域防护」+ M 档断点断言 | ✅ |
| AC-13 | 回放器零逻辑改动、按压/三态/safe-area/多指承继 | qa-e2e 既有触屏仿真用例全部沿用零改动（463 全绿，含回放器锚点穿越 rail 命中） | ✅ |
| AC-14 | 七套全绿 + 断言纪律 | 见 §3 | ✅ |
| AC-15 [P1] | 辨识度与可访问性 | 结构侧：radio 键盘可达/focus 环/tile aria-hidden/键 aria-label（断言绿）；视觉辨识度真机人工 | ✅（视觉部分转人工） |

## 3. 七套脚本与断言纪律

| 脚本 | 本轮 | 上轮 | 说明 |
|---|---|---|---|
| verify-game | 130/130 | 130 | 0 diff |
| verify-audio | 24/24 | 24 | 0 diff |
| verify-constants | 2/2 | 2 | VERSION 一致 |
| verify-persist | 19/19 | 19 | 脚本未改动，登记改写 0 新增 |
| assembly-check | ALL PASSED | ALL | 装配/自包含/音频审计 |
| verify-ui | **44/44** | 38/44 | 6 项 CSS 依赖断言随 T2 落地转绿；登记改写仅 1 处（603 行，取代 r24#AC-7 授权）+ §r26 纯追加 8 test；另 1 处测试缺陷登记修正（M 档双前缀正则，HEAD r24 同缺，非 r26 引入） |
| qa-e2e-jsdom | **463/463** | 447 | §r26 纯追加 16 断言（rail 结构 + 新结构 radio 即时生效写持久化 + 引擎零漂移） |

红线复核：ui.js/persist.js 0 diff（git diff 空）、game.js/audio.js 未出现在 git status、回放器零逻辑改动、verify-persist.cjs 未改动、qa-e2e 纯追加（+98 行）。

## 4. 缺陷表

**未发现缺陷**（本轮新增）。

上轮缺陷复测（全部闭环）：

| 编号 | 严重级 | 模块 | 上轮实际行为 | 本轮复测 | 关联验收项 |
|---|---|---|---|---|---|
| D1 | P0 | style.css | 基座 `.touchpad .rail{display:contents}` 缺失（双簇间距漂移） | ✅ style.css L1078 已落地，verify-ui 该断言绿，M/L 竖屏布局与 r24 逐字节等 | AC-2 |
| D2 | P0 | style.css | 横屏块 1183 无 <600px 门控（M/L 横屏误走侧轨） | ✅ L1313 `(orientation:landscape) and (max-width:599px)` 已落地，M 档双断点断言绿 | AC-3 |
| D3 | P1 | style.css | Hold 双作用域缺 border-radius:50% | ✅ 横屏 L1414 / S 竖屏 L1794 均已补，verify-ui 两作用域三键类断言绿 | AC-1/AC-5 |
| D4 | P1 | style.css | 旋转常亮环 55% 未落 + 2×2 选择器零样式 | ✅ 常亮环 L1425/1807（color-mix 55% + fallback）；选择器全套样式 L1101~1215（网格/48px tile/checked 描边+✓/focus 环/dskin-dot） | AC-6~9 |

## 5. 架构核查（M3 质量门）

- **蓝图比对**：TECHNICAL.md L248 注入 blueprint，实现逐项符合——index.html（.rail--l 包十字 4 键+✛ / .rail--r 包 Hold+旋转；2×2 radio 标记，input 属性顺序/value/checked=fade 零变化）、style.css（display:contents 中性化、门控、212/104 单边描边轨、正圆、常亮环仅强度参数、2×2 全套）、verify-ui（1 登记改写+纯追加）、qa-e2e（纯追加）、ui.js/persist.js 0 diff。无偏差。
- **重复实现**：持久化仅 persist.js 单一 createStorage（能力探测→内存降级），无第二套存储封装漂移。`.touchpad--skin-pod` 的 ::before 光环在「横屏轨块 / S 横屏布局块」两处媒体作用域重复为**承继 r24 的既有模式**（HEAD 基线同构，非 r26 引入），且属皮肤装饰非轨边框，作用域被 AC-12 断言锁定——记录为观察项，不构成缺陷。
- **抽象/结构**：扁平纯 JS 契约面下无应抽未抽的重复逻辑；无结构性损坏。

## 6. 人工补测清单（环境限制，非交付缺陷）

| 验收标准 | 方法 | 工具 |
|---|---|---|
| rail 中性化后 S 竖屏/M/L 竖屏双簇间距与 r24 一致（D3 量值确认） | 真机/浏览器 getComputedStyle 比对 | 真机/DevTools |
| 横屏+竖屏 Hold/旋转键正圆、无圆角方形观感 | 真机目测 | 真机 |
| M/L 横屏为行式底栏恒玻璃、无侧轨 | 真机横屏旋转 | 真机 |
| 2×2 缩略图可辨、选中描边+✓ 清晰 | 真机目测 | 真机 |
| 横屏轨/竖屏底栏贴 safe-area（100dvh 动态工具栏）不遮挡 | 带刘海/圆角真机 | 真机 |
| 六键多指同时按压独立生效 | 真机多指 | 真机 |
| :active 按压反馈/松手回静态 | 真机目测 | 真机 |
| radio 组读屏语义、tile aria-hidden、键 aria-label | TalkBack/VoiceOver 朗读 | 读屏工具 |
| FPS/性能（jsdom 无布局引擎） | 真机操作流畅度 | 真机 |

## 7. 结论

行为层零回归 + 视觉/设置 UI 修正全部落地且闭环：七套全绿、0-diff 红线成立、14 条 P0 AC 全过、AC-15（P1）结构侧全过。**判定：验收通过**，可进入产品验收；人工补测清单 9 项请产品经理按 §6 在真机终验后确认。