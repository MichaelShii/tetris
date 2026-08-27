# QA-REPORT — r15 多格预览队列（Tetris v3.2）

> 任务夹：`docs/teamflow/20260827-r15-multi-grid-preview-queue/` · 分支：`main`（合并提交 e182521，feat/multi-grid-preview-queue → main） · 测试人：QA 测试工程师

## 0. 结论（先行）

**✅ 验收就绪。七套验证脚本全绿（97/24/17/2/15/ALL/294），独立对抗性抽查 130/130 通过，r14 Hold 行为零回归，未发现任何 P0~P3 缺陷（含架构类）。** 环境限制项见 §4 人工补测清单，均非交付缺陷。

## 1. 范围与环境

- **需求**：Next 预览区从单格升级为 3 格队列（顺序与 7-bag 出块严格一致）；设置弹层新增「预览队列」开关（默认开、即时隐藏/恢复、localStorage 持久化）；取代基线 PRD#AC-06.1 单格预览（队列首格即下一块）。
- **验收依据**：本夹 PRD.md AC-1 ~ AC-12（P0×9/P1×3）+ §5 量化指标（队列长短恒 3 / 固定序列 20 次出生 100% 一致 / 切换 ≤200ms / 刷新持久化恢复）。
- **测试基线**：`main` @ e182521（合并后），工作树仅未跟踪任务夹；覆盖 8 个交付文件（game.js/persist.js/index.html/ui.js/style.css/README.md + 4 个脚本）。
- **环境限制（沙箱）**：禁止 CDP 驱动真实浏览器（Playwright/Puppeteer/--remote-debugging-port 均拒绝）；音效听感、像素视觉、真实计时（≤200ms）、file:// 真实刷新持久化无法自动验证 → 列入 §4 人工补测，未判失败。

## 2. 测试执行与结果

### 2.1 七套验证脚本（AGENTS.md §4 官方命令，产品根执行，输出落 `logs/teamflow/tf-mtbhyymk-oj2jpj/qa-*.log`）

| # | 脚本 | 结果 | 说明 |
|---|---|---|---|
| 1 | `node scripts/verify-game.cjs` | ✅ 97/97 | 既有 88（FIFO 重构等价回归护栏）+ 新增 r15 §13 九项（NEXT_QUEUE_SIZE/peekN 边界·非消耗·跨袋/snapshot.queue/AC-2 打桩 20 次/AC-5 冻结·重置·OVER/AC-11 Hold 共存） |
| 2 | `node scripts/verify-audio.cjs` | ✅ 24/24 | 音效引擎零回归（r15 未触碰 audio.js） |
| 3 | `node scripts/verify-ui.cjs` | ✅ 17/17 | 含 createNextQueueRenderer 导出/缺 canvas 抛错契约（AC-4 装配面） |
| 4 | `node scripts/verify-constants.cjs` | ✅ 2/2 | VERSION 三模块一致；存量漂移未放大（memory 待办，符合 blueprint 裁决） |
| 5 | `node scripts/verify-persist.cjs` | ✅ 15/15 | 默认开/往返 false/旧载荷回默认/sanitize 非布尔回默认/PAYLOAD_VERSION=1 锁定（AC-8） |
| 6 | `node scripts/assembly-check.cjs` | ✅ ALL CHECKS PASSED | 含 r15 新 selector（#preview-queue-control/#btn-preview-queue）装配审计、自包含、零音频文件 |
| 7 | `node scripts/qa-e2e-jsdom.cjs` | ✅ 294/294 | 含 r15 段：48×80 尺寸、READY 三格渲染、开关三信号默认开、关闭整区隐藏+游戏不受影响、重开即时恢复与 snapshot 一致、关闭期多次 hardDrop 不错位、二次装载持久化恢复、Hold 并存（AC-1/3/6/7/8/9/11） |

**合计：487 项断言全绿，与合并提交声明（97/24/17/2/15/ALL/294）逐项一致。**

### 2.2 独立对抗性抽查（QA 自写，`logs/teamflow/tf-mtbhyymk-oj2jpj/qa-adv-r15.cjs` → 130/130）

覆盖既有套件未显式覆盖/易盲区：

| 组 | 内容 | 结果 |
|---|---|---|
| E1 | rng=0.5 打桩连续 **25 次**出生（超 PRD 20 次），逐次断言"出生===上一快照队首"、任意检查点队列恒长 3 且 queue[0]===next；两次独立对局 25 次出生序列逐项一致（确定性） | ✅ |
| E2 | restart 后前 7 次出生互不重复（完整新袋，无漏块） | ✅ |
| E3 | PAUSED 冻结：5 次快照 + tick(1e6) 队列/next 不变；恢复后出生=冻结时队首 | ✅ |
| E4 | Hold 共存 3 轮：空槽首 hold 消费队首、同块再 hold 为 no-op（holdUsed 门控）、出生后交换不消耗队列、全程队列恒 3 不脱节（AC-11） | ✅ |
| E5 | start 前阻断出生区 → 立即 OVER；OVER 终态队列恒长 3 且多快照/tick 稳定 | ✅ |
| U1 | 默认 aria-pressed=true+文案「开」、整区可见、READY/start 3 格渲染（fill=12） | ✅ |
| U2 | **暂停期切换（补盲）**：PAUSED 下关闭 → 整区隐藏+队列冻结+score/level 不变；恢复后 hardDrop 出生=冻结队首（关闭期无干扰）；重开即时恢复且与 snapshot.queue 一致 | ✅ |
| U3 | 隐藏期 restart → 整区保持隐藏、新队列恒长 3 且队首=next；重开恢复显示 | ✅ |
| U4 | 持久化双装载：关闭写盘（load 回读 previewQueueEnabled=false，七设置完整负载）→ 二次 createUI 恢复关闭态并即时落到显隐 | ✅ |

## 3. 验收项对照表（AC-1 ~ AC-12）

| AC | 验收要点 | 自动化断言 | 结果 |
|---|---|---|---|
| AC-1 P0 | 队列 3 格、顺序=7-bag 出块、首格=下一块 | verify-game §13③ / e2e 226-233,1240-1242 / E1 | ✅ |
| AC-2 P0 | 固定序列 20 次出生 100% 一致 | verify-game §13⑤（20 次）/ E1（25 次×2 局逐项一致） | ✅ |
| AC-3 P0 | lockFlow 前移、补尾恒 3 | verify-game §13④ / e2e / E1 每步 | ✅ |
| AC-4 P0 | 48×24 迷你格渲染复用、空槽留白不报错 | verify-ui 契约 / ui.js drawMiniPieceAt 单点共享 / e2e fill=12；像素呈现→人工 | ✅（逻辑）+ 人工 |
| AC-5 P1 | PAUSED 冻结 / restart 重置 / OVER 稳定 | verify-game §13⑥⑦⑧ / E3 / E5 / U3 | ✅ |
| AC-6 P0 | 开关默认开、可访问（Tab/aria-pressed 不只靠颜色）、即时 | e2e 1234-1239 / U1 / DOM 核查（独立于 #btn-hold 镜像模式） | ✅ |
| AC-7 P0 | 关闭整区隐藏、游戏不重置；重开立即恢复 | e2e 1249-1267 / U2 / U3；≤200ms 真实计时→人工（实现为同步 DOM 更新，风险低） | ✅（逻辑）+ 人工 |
| AC-8 P0 | localStorage 持久化、刷新保持、首用默认开 | verify-persist 新 5d/5e+往返 / e2e 1309-1328 双装载 / U4；真浏览器刷新→人工 | ✅（逻辑）+ 人工 |
| AC-9 P1 | 关闭期不影响出块序列 | e2e 1271-1283 关闭期多次 hardDrop / U2 暂停期变体；引擎无开关字段（纯显示层） | ✅ |
| AC-10 P0 | 引擎 queue+peekN+snapshot+单测 | verify-game §13①② / 导出面（NEXT_QUEUE_SIZE=3、createQueue、getSnapshot） | ✅ |
| AC-11 P1 | Hold 共存：队首消费、交换不消耗 | verify-game §13⑨ / e2e 1340-1350 / E4（3 轮）+ r14 存量 Hold 用例全绿 | ✅ |
| AC-12 P0 | 七套全绿无回归、新开关与六设置互不干扰 | §2.1 全绿；e2e 既有 237+ 基线断言同在 | ✅ |

## 4. 人工补测清单（环境限制，非交付缺陷）

| # | 验收项 | 补测方法 | 工具 | 备注 |
|---|---|---|---|---|
| 1 | AC-4 队列视觉：48×80 队列窗、3 槽间距 4px、空槽留白、玻璃/辉光风格 | 双击 index.html 观察 READY/游戏过程队列呈现与整体风格融合 | 浏览器 | 逻辑层已由 fill-count 断言覆盖 |
| 2 | AC-6/7 交互观感：设置弹层开关点击、Tab 焦点环、键盘操作 | 打开设置弹层操作「预览队列」开关 | 浏览器 | jsdom 已断言 DOM 状态机 |
| 3 | AC-7 开关切换 ≤200ms 即时性 | 连续快速切换并目测（实现为同步 DOM 更新，预期无感延迟） | 浏览器 | 真实计时指标 |
| 4 | AC-8 file:// 刷新持久化 | 关闭→刷新页面→确认保持关闭、首次使用默认开 | 浏览器（file://） | jsdom 双装载逻辑已验证 |
| 5 | 音频/其他设置回归听感 | 音量/BGM/静音、Hold 交互手感抽查 | 浏览器 | verify-audio 24/24 已绿 |
| 6 | 双分辨率/布局（如需求含） | 窗宽调整目测队列区与信息面板 | 浏览器 | DESIGN token 层面 |

## 5. 架构核查（M3 质量门）

**结论：合规，无架构缺陷。** 对照 TECHNICAL.md 内嵌 `<!-- blueprint -->`：

1. **模块抽取与装配**：按蓝图 modules 全量落地且依赖/装配序一致——game.js(order1: NEXT_QUEUE_SIZE+createQueue FIFO+peekN+snapshot.queue)→ persist.js(order2: previewQueueEnabled additive 不升 PAYLOAD_VERSION)→ index.html(order2: 48×80+开关 DOM 前置脚本)→ ui.js(order3: 渲染器+开关三信号)→ style.css(order2: 窗框样式上移容器+canvas 透明)→ README(order4: v3.2 同步)。`must('#btn-preview-queue')` 装配契约 DOM/JS 同版本就位。
2. **重复实现检查**：无新增重复。存储单点——localStorage 全仓仅 persist.js 使用（ui.js/game.js/audio.js 零直连）；队列无第二可变状态源——snapshot.queue 由单一游标 `state.next`+`peekN` 派生，lockFlow/hold/restart/tick 零流程改动（重写风险被 88 用例等价护栏锁住）。
3. **抽象抽取**：drawMiniPieceAt 单点共享（旧 next/hold 渲染器改调 (0,0)，行为逐字节等价）；createNextWellRenderer 保留为兼容壳（头注声明、verify-ui+既有 e2e 双兜底），属有意保留非漂移。
4. **声明过的既有风险处置符合裁决**：e2e 尺寸断言 24→80 三处耦合已同步（e2e line224 绿）；verify-constants VERSION 存量漂移按 memory 待办不放大（蓝图明示"不新增 VERSION 字段"）。
5. **工程合规**：assembly-check 全过（含新 selector）；提交纪律（分支合并前 5 波提交 + merge --no-ff）；任务夹未入库；日志收口 logs/teamflow/。

## 6. 缺陷

**未发现缺陷。**

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

（架构类：无 P1 架构缺陷可报；全部模块级核查见 §5。）

## 7. 结论

- **功能**：AC-1~AC-12 全部通过（自动化断言覆盖全部 12 项；AC-4/7/8 的像素/计时/真实刷新部分依赖人工复核，逻辑层均已绿）。
- **回归**：r14 Hold 行为零回归（verify-game/e2e/verify-ui 存量 Hold 用例全绿 + 对抗 E4 专项 3 轮）；既有 AC 基线 237+ e2e 断言同在。
- **工程**：架构合规、无重复实现、无 P0~P3 缺陷。
- **结论**：**验收就绪**（人工补测 6 项按 §4 执行后放行）。