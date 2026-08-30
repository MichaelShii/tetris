# r28 横屏双轨十字布局（landscape-dual-track）TECHNICAL

<!-- meta: summary="r28 技术方案：唯一生产代码改动 = style.css §5.5 横屏侧轨门控 `@media (orientation: landscape) and (max-width: 599px)` → `@media (orientation: landscape)`（行 1321，注释同步更新），级联分析证明 §5.5 块成为横屏唯一 .touchpad 权威（S 横屏内层/§7.2/M 两档板区块全部零触控规则，无源序覆盖冲突）；十字键零改动（DOM 源序 softDrop→moveLeft→moveRight→hardDrop + §5.5(1387-1390)=竖屏(1762-1765) 共用 nth-child grid-area 映射 → 上软降/下硬降天然成立）；竖屏 M/L（基座 .touchpad + order 冻结）与 S dock、桌面（has-touch 门控）零变化；改动面收口 style.css + verify-ui/qa-e2e 断言改写与 §r28 段（T1/T2/T3 文件互不相交可并行），game/audio/persist/ui.js/index.html 0 diff、VERSION 不动、七套全绿" -->

基线依赖：docs/teamflow/20260830-r27-dpad-hard-soft-swap（十字键 上=softDrop/下=hardDrop 互换语义、`.tkey[data-action]` ↔ `TOUCH_KEYS` 六值契约、触控=键盘回放器路径、M/L 行式底栏键序 order 冻结语义不得回归）。

取代：docs/teamflow/20260829-r26-touchpad-keys-dock-skin#AC-3（R-D1「M/L 横屏恒行式底栏」门控裁定）→ 横屏（has-touch、任意宽度）恒走左右双轨十字；r26 侧轨结构/皮肤挂点/正圆/常亮环等规则体全承继不取代。

> 本迭代为**作用域裁定变更**（非重设计）：无数据模型、无 API、无状态变化；唯一生产代码改动是 1 处 CSS 媒体查询门控。下列 §1~§3 为「不变契约重述」防止回归，§4 为核心实现点与级联证明，§5 测试策略，§6 任务拆分，§7 工程约束。

---

## 1. 数据模型与存储（零变化）

| 面 | 现状（承继） | 本需求 |
|---|---|---|
| 对局状态 | game.js 闭包内不可变棋盘/快照（`getSnapshot()`） | 0 diff |
| 持久化 | persist.js `createPersistence`（settings：音量/静音/`dockSkin` 四枚举） | 0 diff；四皮肤值域与存储通道逐字节不动 |
| `dockSkin` | ui.js `DOCK_SKINS` ↔ persist `DOCK_SKINS` ↔ index.html radio value 三处单一事实来源 | 不动——皮肤挂点随门控放宽**自然延展**到宽屏横屏，不新增存储字段 |

**结论**：横屏双轨是纯 CSS 表现层裁定，无任何数据/存储新增；`--dock-h`（M 板底预留，1965/1986）为既有板面变量，不属于本需求持有。

## 2. API 设计（零新增；契约重述）

静态 `file://` 单页，无路由、无后端 API。公开面仅 UMD 契约，本需求全部 0 逻辑改动：

| 契约 | 位置 | 签名/值域 | 本需求 |
|---|---|---|---|
| `TetrisUI.TOUCH_KEYS` | ui.js:1062 | 六值表（softDrop/moveLeft/moveRight/hardDrop/hold/rotate）——回放器单一事实来源 | 0 逻辑改动（AC-2） |
| `TetrisUI.createTouchControls(els, game, opts?)` | ui.js:1121 | `→ {dispose}`；`touchstart`→preventDefault+RUNNING 守卫+activeKeys 注册+合成 keydown（1114-1115）；长按由 game.js held Map/DAS 驱动 | 0 逻辑改动（AC-2/AC-5） |
| `TetrisUI.createUI(opts)` | ui.js ~1867 | `touch` 能力检测 → `html.has-touch` 类 + createTouchControls | 0 逻辑改动 |

**键位映射参数**（入参零变化）：`.tkey[data-action]`（index.html:119-122、130-131）↔ `TOUCH_KEYS[].action`（ui.js:1171 装配期校验存在性）；回放器锚点 `[data-action=moveLeft/hold/rotate]` 穿越 `.rail` 包裹命中（r26 已锚定）。

## 3. 前端结构与状态管理

**DOM（单模板三作用域，零改动）**：`#touch-controls`（index.html:113-134）唯一实例——`.rail--l > .tpad-cross`（源序 softDrop→moveLeft→moveRight→hardDrop + ✛ hub）+ `.rail--r > .tpad-main`（hold→rotate）；S 竖屏 dock / 横屏双轨 / M-L 行式底栏均为 CSS 重排同一 DOM（构造保证 AC-3 双作用域同步）。

**作用域裁定（本需求修订仅第 2 行）**：

| 作用域 | 布局 | 键帽正圆 | 四皮肤 | 轨/底 | 十字键位 |
|---|---|---|---|---|---|
| S 竖屏 dock（<600px 竖） | r24 双簇 | ✅ | ✅ | 皮肤类 | 上软降/左/右/下硬降（r27） |
| **横屏双轨（任意宽度横）【修订】** | **双轨 rail--l/rail--r** | ✅ | ✅（挂 `.rail`） | 皮肤类 | 上软降/左/右/下硬降（r27 天然一致） |
| M/L 行式底栏（≥600px 竖） | 一行六键 | ❌ | ❌ | 恒 `--glass-bg` | 硬降 左 右 软降 Hold 旋转（r27 order 冻结） |
| 桌面非触控 | 无触控区 | — | — | — | 键盘操作 |

**状态管理**：无 JS 状态参与——横竖屏切换纯媒体查询接管（orientationchange 无 JS 监听、即切即现、不重置对局）；触控控制器 activeKeys/DAS 复用 game.js held Map 零改动；`html.has-touch` 类由 createUI 既有能力检测管理，本需求不动。

## 4. 关键实现点与边界

### 4.1 唯一代码改动（style.css:1317-1321，含注释）

```css
/* 改前（r26 R-D1，行 1317-1320 注释 + 行 1321 门控） */
/* AC-3 门控（裁定 R-D1）：and (max-width: 599px)——M/L（≥600px）横屏恒落基座行式底栏（恒玻璃），不引入侧轨 */
@media (orientation: landscape) and (max-width: 599px) {

/* 改后（r28，取代 r26#AC-3；注释同步改写为「横屏任意宽度恒双轨」） */
@media (orientation: landscape) {
```

规则体（1322-1505）零动：`--tpad-key-dir/hero/hold` 56/80/48、轨高 calc 188px、左右轨 212/104 calc 串、单边描边、safe-area 四边、键 z-index:1 盖轨、三态动效、四皮肤挂 `.rail`、旋转常亮环 55%——逐字节承继。

### 4.2 级联独裁性证明（放宽后无冲突，关键论证）

改动后横屏（任意宽度）同时命中的块及其触控规则存量：

| 匹配块 | 位置 | 含 .touchpad/.tkey/.rail 规则？ | 结论 |
|---|---|---|---|
| §5.5 横屏侧轨门控块（放宽后） | 1321-1505 | ✅ 全部双轨规则 | **横屏唯一触控权威** |
| §7.1 内层 `(orientation: landscape)` | 1602-1615 | ❌ 仅板卡玻璃（stat-grid 等） | 无冲突 |
| §7.1 内层 `(orientation: portrait)` | 1618-1923 | ✅ S 竖屏 dock | 横屏不匹配，竖屏行为不变 |
| §7.2 S 横屏幕面块 `(max-width:599px) and (orientation:landscape)` | 1929-1959 | ❌ 仅 #main/#board/HUD | 独立查询，**保留不触碰**（非目标） |
| §7.3/§7.4 M 板区块 600-767 / 768-1023 | 1962-1998 | ❌ 仅 :root `--dock-h` / #main grid / .btn | 无触控规则 → 无源序覆盖冲突 |

> 证明：所有与横屏同宽的**后源**块（§7.2、§7.3、§7.4）对触控区零声明，故 §5.5 门控块内声明不会被同特异性后源覆盖；竖屏 S dock 全部收口 `(orientation: portrait)` 内层围栏，不会反超（注释 1575 先例同款）。M 档两处 `@media (min-width: 600px)`/`(min-width: 768px)` 为板面查询，与触控门控正交。

### 4.3 十字键零改动根因（AC-1/2 键位一致性）

- DOM 源序 index.html:119-122：`softDrop → moveLeft → moveRight → hardDrop`（r27 互换后序）。
- §5.5 内 nth-child grid-area 映射 1387-1390 与竖屏块 1762-1765 为**同一串文本**（共用映射）：`nth-child(1)→up / 2→lf / 3→rt / 4→dn`。
- 两者合成 → 横屏上=软降、下=硬降**自动成立**，与竖屏 r27 语义逐位一致——零额外代码，测试仅需断言「两作用域映射同串共存」防漂移。

### 4.4 接受项（QA 登记，勿在 r28 代码内处理）

- **E1（M/L 横屏板底预留差）**：600-1023 横屏仍匹配 M 板区块，`#main{padding-bottom:var(--dock-h)}`（1973/1994）按行式底栏 ~64px 预留，而固定双轨高 188px → 板底约 124px 可能落入轨后。PRD 非目标明确「不调整 S/M/L 断点三档划分」「不处理 M 档溢出遗留 D 项」→ 不入 r28 代码；列入 AC-7 真机补测（≥600px 宽屏横屏实机观测点），若实测遮挡明显，作为后续需求处理（建议形态：横屏门控内追加板底预留覆写，严禁本期混入）。
- **E2（E2E 断点模拟限制）**：jsdom 不执行媒体查询 → 「≥600px 横屏不落行式栏」以**源码断言**（门控裸 landscape + M 切片零触控规则）替代真实断点注册（PRD 风险 3 明示）。

### 4.5 红线复核（AC-5/AC-7）

- game.js / audio.js / persist.js / ui.js / index.html：0 diff；`VERSION` 三模块一致且不动；`TOUCH_KEYS` 六值 ↔ `.tkey[data-action]` 交叉零变化（r26/r27 既有断言即为红线，零回归即绿）。
- 承继项：:active 三态 / `touch-action:none` / safe-area 四边 / 多指守卫（canvas touchstart/touchmove preventDefault）/ hub 三层保险——全由规则体与 ui.js 既有代码承载，门控改动不触碰。

## 5. 测试策略

### 5.1 断言改写（verify-ui.cjs，取代 r26#AC-3 授权）

| 位置 | 现状 | 改写后 |
|---|---|---|
| 测试 785-806 `r26: 横屏块 <600px 门控 + M 块零侧轨` | 787-788 断言 `landSliceR24.slice(0,80)` 含 `and (max-width: 599px)` | **核心改写**：断言头 80 字符含 `@media (orientation: landscape)` 且**不含** `max-width`（门控放宽）；标题/注释改述为「横屏恒双轨门控（r28 取代 r26#AC-3）」 |
| 792-802 M 两档零 `.rail`/零皮肤类 | 断言逻辑 | **保留不动**（构造保证：rail/皮肤只挂 §5.5 门控块，M 切片永远不含）；仅注释更新语义「M/L 竖屏恒玻璃」 |
| 803-805 基座行式底栏三件套 | 断言逻辑 | 保留；注释「（M/L 横屏落点）」→「（M/L **竖屏**行式底栏落点）」 |
| 585-591 切片锚点 | `landStartR24 = indexOf('@media (orientation: landscape)')` | **零改动**：改前改后均命中 §5.5 门控行 1321（门控文本是原串的前缀）；`landEndR24 = indexOf('6. 可访问性与降级')` 仍为 1507 |

**追加 §r28 段**（verify-ui 尾部 931 行后，纯追加）：① 门控文本精确断言：`cssR24` 含裸 `@media (orientation: landscape)` 且门控头无 `max-width`；② §7.2 独立断言：`sLandR24 !== -1 && sLandR24 > landEndR24`（S 横屏幕面查询仍在门控块之后——两条独立媒体查询，仅侧轨门控放宽）；③ 双作用域同映射断言：nth-child grid-area 四行串在 landSliceR24 与 sPortraitR24 **各全量共存**（键位一致性构造保证）；④ grid 模板断言：`'. up .' 'lf hub rt' '. dn .'` 两切片各 ≥1 处（同模板）。

### 5.2 qa-e2e-jsdom.cjs §r28 段（追加于 r27 段 2545 行后、2547 汇总前）

沿用 r27 harness（`window.TetrisUI.createUI({root, touch:true, persist})` + 合成 `new window.Event('touchstart'/'touchend', {bubbles:true, cancelable:true})`）：

1. **双轨 DOM**：`.rail--l/.rail--r` 恰 2、左右轨互不串簇（rail--l 无 .tpad-main / rail--r 无 .tpad-cross）、十字簇恰 4 键 + hub（mirror r27 2454-2456）。
2. **键位映射**：十字簇源序五字段 softDrop→moveLeft→moveRight→hardDrop（mirror r27 2478）；六键 data-action 集合不变各恰 1。
3. **触控语义**：源序首键 touch→piece.y+1 单步（softDrop 契约）；源序末键 touch→落锁（board 变化 + hardDrop 音效，RUNNING 承续）（mirror r27 2530-2541）。
4. **hub 零事件**：合成 touchstart/touchend → 无合成 keydown、piece.x 不动（mirror r27 2518-2525）。
5. **不落行式栏（源码级，E2）**：`css18f = fs.readFileSync(style.css)` 断言右侧门控 = 裸 `@media (orientation: landscape)`（无 max-width 尾缀）且 M 两档切片（`/@media \(min-width: (?:600|768)px\)/` 起至下一 `@media`）零 `.touchpad`/`.tkey`/`.rail` 选择器 → 级联落点 = 双轨。
6. **竖屏零回归（源扫描）**：基座行式底栏三件套与 order 四规则存在（与 verify-ui 803/903 同源）；段内 dispose 无异常 + has-touch 归属回收（mirror r27 2544）。

### 5.3 出口命令（产品根，七套全绿 AC-6）

`node scripts/verify-game.cjs` / `verify-audio.cjs` / `verify-ui.cjs` / `verify-constants.cjs` / `verify-persist.cjs` / `assembly-check.cjs` / `qa-e2e-jsdom.cjs`；r24/r26/r27 既有断言零回归（AC-6/AC-14 基线语义）。

## 6. 任务拆分（文件边界互不相交 → 并行）

| 任务 | 文件 | 规格 | 验收判据 |
|---|---|---|---|
| **T1** style.css 门控放宽 | `/style.css` | §5.5 行 1321 门控移除 `and (max-width: 599px)` + 注释改写（取代 r26 R-D1）；规则体零动 | 门控文本为裸 `@media (orientation: landscape)`；规则体 1322-1505 与 HEAD diff 为空 |
| **T2** verify-ui 断言改写+§r28 段 | `/scripts/verify-ui.cjs` | 787-788 改写为裸门控断言；785/790/803 注释语义更新；尾部追加 §r28 段（5.1） | `node scripts/verify-ui.cjs` 全绿，含 §r28 新增 check 恰 4 项语义 |
| **T3** qa-e2e §r28 段 | `/scripts/qa-e2e-jsdom.cjs` | r27 段后追加 §r28 六组断言（5.2） | `node scripts/qa-e2e-jsdom.cjs` 全绿、无既有断言回归 |
| **T4** 红线复核（只读核验） | `/game.js` `/audio.js` `/persist.js` `/ui.js` `/index.html` | git diff 与 verify-constants/assembly/persist 复核 0 diff、VERSION 一致 | 上述文件相对 HEAD 0 diff；`verify-constants` 三模块 VERSION 一致 |
| **T5** 回归+提交 | 全部 | T1-T4 完成后七套脚本全绿；main 当前 HEAD 单 commit 同批含任务夹（§7） | 七套全绿 + `git status` 干净（仅任务夹与改动文件入 commit） |

依赖：T1/T2/T3 相互并行（文件不相交）；T4 依赖 T1（对照 CSS 变化面复核）；T5 依赖 T1-T4。T2/T3 可先于 T1 完成（断言描述目标态），合流后统一跑全绿。

## 7. 工程约束（PRD §7 第 4 条，执行要求）

- 基于 **main 当前 HEAD** 实施，**不开新分支**。
- 工作区未提交改动仅任务夹 `docs/teamflow/20260830-r28-landscape-dual-track/`（含 meta.json），随交付**同批单提交**，不另行处理。
- memory.md 不动（行为裁定变更，非新团队约定/技术栈决策）。

---

<!-- blueprint -->{"summary":"横屏双轨 = 纯 CSS 作用域裁定变更：唯一生产代码改动是 style.css §5.5 门控放宽（其余 0 diff），断言登记改写于 verify-ui/qa-e2e，T1/T2/T3 文件互不相交可并行","modules":{"/style.css":{"responsibility":"§5.5 横屏侧轨门控放宽：`and (max-width: 599px)` 移除 → 横屏任意宽度恒双轨；规则体/皮肤/safe-area/三态零动","dependsOn":["/index.html（DOM 源序 + rail 结构契约）"],"assemblyOrder":1,"why":"布局作用域由媒体查询裁决，扁平 CSS 既是唯一变更点也是契约源；级联证明 §5.5 块为横屏唯一 .touchpad 权威（M 板区块零触控规则 → 无后源覆盖冲突）"},"/scripts/verify-ui.cjs":{"responsibility":"r26 门控断言改写（787-788 → 裸 landscape + 无 max-width）+ 新增 §r28 段（门控文本精确/§7.2 独立/双作用域同 nth-child 映射与 grid 模板共存）","dependsOn":["/style.css"],"assemblyOrder":2,"why":"CSS 源扫描是媒体查询行为最廉价可靠的断言面（jsdom 不执行媒体查询，源码断言即行为证明）"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"§r28 段：双轨 DOM/键位映射/hub 零事件/源序键触控语义 + 源码级『不落行式栏』断言","dependsOn":["/index.html","/style.css"],"assemblyOrder":3,"why":"复用 r27 harness（createUI touch:true + 合成 touchstart/touchend），触控=键盘回放器路径即时验证"},"/index.html":{"responsibility":"0 diff 红线：触控区 DOM 源序/五字段/六键 data-action 为键位一致性与回放器契约单一来源","dependsOn":[],"assemblyOrder":0,"why":"单模板三作用域（S/横屏/M-L 均 CSS 重排同一 DOM）——零改动，仅作契约锚点"},"/ui.js":{"responsibility":"0 diff：TOUCH_KEYS 六值表 + createTouchControls 回放器（touchstart→合成 keydown）契约","dependsOn":["/index.html"],"assemblyOrder":0,"why":"键位语义由 DOM 源序 + 媒体查询落位锁死，JS 层无需感知布局作用域"}},"duplications":["切片锚点共串风险：`landStartR24 = indexOf('@media (orientation: landscape)')` 为 §5.5 门控（1321）独有前缀，§7.2（1929）前缀是 max-width 不会误命中；门控放宽后 §7.2 原查询必须原样保留，否则 sLand 锚点与 S 横屏断言漂移","nth-child grid-area 映射在 §5.5（1387-1390）与竖屏块（1762-1765）各存一份：两处同串为刻意共享（键位一致构造保证），断言按『两切片同串共存』防单边漂移，不去重不合并"],"tasks":[{"title":"T1 style.css 门控放宽","files":["/style.css"],"spec":"§5.5 行 1321 移除 `and (max-width: 599px)` 门控 + 注释改写（取代 r26 R-D1）；规则体零动"},{"title":"T2 verify-ui.cjs 断言改写+§r28 段","files":["/scripts/verify-ui.cjs"],"spec":"787-788 改写为裸 landscape 门控断言、785/790/803 注释语义更新；尾部追加 §r28 段（门控文本/§7.2 独立/双作用域同 nth-child 与 grid 模板）"},{"title":"T3 qa-e2e-jsdom.cjs §r28 段","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"r27 段后追加 §r28：双轨 DOM/六键映射/hub 零事件/触控语义 + 源码级不落行式栏（M 切片零触控规则）"},{"title":"T4 红线复核","files":["/index.html","/ui.js","/persist.js","/game.js","/audio.js"],"spec":"只读复核 0 diff：git diff + verify-constants/assembly/persist 脚本"},{"title":"T5 回归与提交","files":[],"spec":"T1-T4 后七套全绿 → main 当前 HEAD 同批单 commit（含任务夹）"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r28 技术方案定稿：唯一生产代码改动 style.css:1321 门控 `and (max-width: 599px)` 移除（裸 `@media (orientation: landscape)`），注释同步改写取代 r26#AC-3；级联独裁性证明——横屏同宽后源块（§7.2/M 两档）零触控规则、竖屏 dock 收口 portrait 内层围栏 → 无源序覆盖冲突；十字键零改动（DOM 源序 + §5.5=竖屏共用 nth-child grid-area 映射 → 上软下硬天然一致）；verify-ui 787-788 改写+§r28 段、qa-e2e 追加 §r28 六组断言（含源码级『不落行式栏』）；接受项 E1（M/L 横屏板底 --dock-h 64px<轨高 188px 预留差）入 AC-7 真机补测不入本期代码；T1/T2/T3 文件互不相交并行 + T4 红线复核 + T5 七套全绿 main 单 commit","memory":["r28 技术方案：唯一代码改动 = style.css §5.5 门控放宽（1321 行 `and (max-width: 599px)` 移除），级联证明 §5.5 块成为横屏唯一 .touchpad 权威","十字键零改动根因：DOM 源序 softDrop→moveLeft→moveRight→hardDrop + §5.5(1387-1390)=竖屏(1762-1765) 共用 nth-child grid-area 映射 → 上软降/下硬降自动成立；断言按两切片同串共存防漂移","verify-ui 改写面：785-806 测试 787-788 门控断言改为裸 landscape+无 max-width，792-802/803-805 断言逻辑保留仅注释更新；585-591 切片锚点零改动（indexOf 前缀命中不变）；尾部追加 §r28 段（门控文本/§7.2 独立/双作用域同映射）","qa-e2e 追加 §r28 段（2545 后）：双轨 DOM/六键映射/hub 零事件/触控语义 + 源码级不落行式栏（M 切片零触控规则，E2 jsdom 限制替代方案）","接受项 E1：600-1023 横屏 #main padding-bottom:var(--dock-h) 64px < 轨高 188px 预留差，PRD 非目标不入本期代码，列 AC-7 真机补测；E2：jsdom 不执行媒体查询，『≥600px 不落行式栏』用源码断言","任务拆分 T1 style.css / T2 verify-ui / T3 qa-e2e 文件互不相交并行，T4 红线复核（game/audio/persist/ui/index 0 diff、VERSION 不动），T5 七套全绿 main HEAD 单 commit 含任务夹"]}<!-- /state -->