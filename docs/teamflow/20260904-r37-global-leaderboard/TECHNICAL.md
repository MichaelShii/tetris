<!-- meta: summary="r37 全网排行榜 Phase 1 技术方案定稿：前端 leaderboard.js（UMD 纯逻辑：身份/OVER 提交/降级/拉榜映射/数据）与 ui.js 弹层组件工厂职责分界（修正 ARCHITECTURE §3.1 导出归属，以 DESIGN 为准）；载荷字段钉名 protoVer、昵称白名单以 worker 正则为准、durationMs=snapshot.sessionTimeMs（ui.js onGameOver 第二参 prevSnapshot 透传，引擎 0 改动）；persist 仅增 deviceId/nickname 键与 saveDeviceId/saveNickname（PAYLOAD_VERSION 不变）；限流钉 20/10min 设备+60/10min IP；T1~T9 按文件边界并行，git 基线 feat/global-leaderboard@87c81f3、验收后用户确认合回 main" -->
# TECHNICAL — r37 全网排行榜 Phase 1（折中校验版）技术方案

基线依赖：docs/teamflow/20260904-r36（其技术方案即本方案的上游基线——r36 定稿「信息面板恰两组、全局统计单键持久化 saveStats/PAYLOAD_VERSION=1、stat-grid HUD」；本需求零改动这些载荷与装配序，仅在其上纯追加）
取代：docs/teamflow/20260904-r36#AC-5（assembly-check「自包含审计逐字保持」段）——按本夹 PRD AC-9，assembly-check §5 审计改「仅 API 域名白名单例外」，AC-08 口径同步升格「离线可玩、联网才有全网榜」，本方案 §6.3 即实施规格

## §0 结论速览（关键裁定）

| # | 裁定 | 依据 |
|---|---|---|
| D1 | **导出归属收口**：`leaderboard.js` = 纯逻辑 UMD（身份/提交/降级/拉榜/数据映射，无 DOM 家族）；两个弹层组件工厂 `createLeaderboardPanel`/`createNicknamePrompt` 归 **ui.js**（与 createHud/createGlobalStats 同族，`must()`/trapTab/Esc 模式直接复用） | DESIGN §6 为 UI 权威；ARCHITECTURE §3.1「leaderboard.js 导出 createLeaderboardPanel/createNicknamePrompt」为脚手架期笔误，**以 DESIGN 为准**（dev 阶段不依赖该行；技术方案即修正点） |
| D2 | **提交载荷字段钉名 `protoVer`**（数值 1）；PRD AC-2/AC-14 所述 `protocolVersion` 即此字段的概念名（worker `validate.js parseSubmit` 已按 `protoVer` 落地，避免双名漂移） | worker 已落地契约唯一；本夹 PRD §6 风险④「单一常量钉死」精神 |
| D3 | **昵称白名单以 worker 正则为准**：`trim → 长度 1–12 → 首字符 [\p{L}\p{N}]、后续 [\p{L}\p{N} _\-·.]`（字母任意文种含 CJK、数字、空格/_/-/·/.，≤12）；PRD AC-5「可打印 ASCII + CJK」为意图表述（CJK ∈ \p{L}，白名单是其子集实现），两侧同规 | worker `cleanNickname` 已落地且冒烟通过；客户端必须逐字同式（AC-5「客户端同服务端规则」） |
| D4 | **durationMs 载荷单一事实源 = `snapshot.sessionTimeMs`**（暂停不计、OVER 定格，与全局统计同一引擎事实）；ui.js `onGameOver` 内部回调追加第二参数 `prevSnapshot`（纯增参，既有宿主仅读首参 score 不受影响）——三处 OVER 路径（finishLock 出生碰撞 L824 / hold 出生碰撞 L1072 / lose() L1140）均 **emit() 先于 onGameOver**，故 prevSnapshot 时点恒为 OVER 定格帧 | game.js 事实核验 + DESIGN「引擎 0 改动」红线 |
| D5 | **限流数值钉定**：每设备 **20 次 / 10 分钟**、每 IP **60 次 / 10 分钟**（已落地 worker `RATE_LIMITS`；PRD AC-12 建议 60s≤5/≤20 允许技术方案微调——10 分钟滑窗更平滑、免费档写配额余量充足） | ARCHITECTURE §4.3 + worker/index.js |
| D6 | **anomaly 拒绝形态 = 400 `implausible_score`**（不上榜、不入 KV——addEntry 不执行；响应即可观测标记）；`protoVer>1` → 400（Phase 2 扩展点） | worker/index.js submitScore + AC-11「异常载荷不入 KV 榜单」 |
| D7 | **score=0 门控在前端**：`reportOver` 收到 score≤0 即整体短路（不弹昵称、不提交、不上榜）；worker 允许 score=0（纵深防御，前端永不发送） | PRD AC-2 + DESIGN §3.1 |
| D8 | **弹层关闭焦点统一收口 `#btn-settings`**（恒在可见元素）：排行榜↔昵称弹层关闭后均回 `#btn-settings`；DESIGN §5「昵称→触发钮」在设置打开场景（互斥先关设置）下触发钮已 hidden，还原至 hidden 元素非法，故收口（比 DESIGN 更稳，语义等价） | DESIGN §5 焦点还原 + 弹层互斥裁定 |
| D9 | 设置组 `.settings-group--leaderboard` **不写任何 display 规则**（默认台型，`hidden` 属性天然生效）——与 `.settings-group--appearance` 的纯 CSS 门控（display:none + has-touch）机制不同：leaderboard 激活判定含运行时协议/fetch 探测，必须 JS 门控 `hidden` | DESIGN §2.1 + AC-8 |

## §1 数据模型与存储

### 1.1 前端持久化（persist.js 增量，单键带版本 JSON 不变）

- 承载结构：`tetris.v2` 单键 JSON（PAYLOAD_VERSION **保持 1 不变**——deviceId/nickname 为顶层纯增量字段，decode 缺省回 null 向后兼容）；module VERSION 2.6.0 不动。
- 顶层新字段（`readState`/`encode` 同步扩展，缺失回 null）：
  - `deviceId`：`sanitizeDeviceId(v)` = `typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null`（与 worker `DEVICE_ID_RE` 同式）。
  - `nickname`：`sanitizeNickname(v)` = `typeof v === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} _\-·.]{0,11}$/u.test(v.trim()) ? v.trim() : null`（与 worker `cleanNickname` 同式；首字符不允许空白/符号）。
- `load()` 返回追加 `deviceId`/`nickname` 两键（既有 `{highScore, stats, settings}` 键序/语义零改；`verify-persist` 的 `deepEqual(settings, DEFAULT_SETTINGS)` 断言不受影响——其仅深比 settings 子对象）。
- 新出口（对齐 saveHighScore/saveSettings/saveStats 风格：try/catch 兜底、dispose 后 false、写盘失败静默成功）：
  - `saveDeviceId(id) → boolean`（清洗后非 null 才写；合并保留 highScore/stats/settings）。
  - `saveNickname(name) → boolean`（同上）。
  - 业务侧禁止裸 setItem/getItem（memory.md 既有约定，AC-4）。
- 导出面追加 `sanitizeDeviceId`/`sanitizeNickname`（Node 直测用）。**verify-persist.cjs 0 行 diff**（红线 AC-15：新键测试由 verify-leaderboard/qa-e2e 承担）。

### 1.2 后端 KV 模型（worker/ 已落地，本文档钉死契约供前端对齐）

| KV 键 | 内容 | 说明 |
|---|---|---|
| `entry:<deviceId>` | 设备最高分完整 entry（含 nickname/score/level/lines/durationMs/deviceId/protoVer/ts） | 同设备只留最高分；更低分 `improved:false` 仅计限流不上榜 |
| `board:all` | 总榜列表（≤ MAX_BOARD=200） | 去重后分数降序、同分早提交在前；展示 Top 20 |
| `board:week:<ISO周>` | 周榜列表（键如 `2026-W36`，UTC 周一始） | 换周自动生成新键，旧周键自然过期（免费档不清理，可接受） |
| `rl:dev:<deviceId>` / `rl:ip:<ip>` | 限流计数器（put 带 `expirationTtl` 滑窗） | 读改写非原子——Phase 1 已知边界（ARCHITECTURE §4.3） |

- 写放大：每上榜提交 ≈ 3 次 KV 写（entry 存档 + board:all + board:week）→ 免费档 1000 写/日 ≈ 300 上榜/日，够用。
- 榜单元素匿名化（读接口不含 deviceId/ts）：`{ rank, nickname, score, level, lines }`。

## §2 API 设计

### 2.1 POST `/api/score`（提交）

- 载荷（JSON，字段名钉死，全部服务端只信自己算出的部分）：

| 字段 | 前端来源 | 服务端校验 | 失败码 |
|---|---|---|---|
| `nickname` | persist.load().nickname（首弹后已持久化） | trim + 1–12 + 白名单正则（D3） | `invalid_nickname` |
| `score` | snapshot.score（OVER 定格） | 非负整数 ≤1e9 | `bad_request` |
| `level` | snapshot.level | 整数 1–999 | `bad_request` |
| `lines` | snapshot.lines | 整数 0–1e6 | `bad_request` |
| `durationMs` | snapshot.sessionTimeMs（D4） | 整数 0–86_400_000 | `bad_request` |
| `deviceId` | persist.load().deviceId（UUID v4） | `[A-Za-z0-9-]{8,64}` | `bad_request` |
| `protoVer` | 常量 1（D2） | 必带整数 ≥1；>1 拒（Phase 2 预留） | `bad_request` |
| — 合理性 | — | ① `minMsToReachLevel(level) ≤ durationMs`（等级可达性）② `score ≤ maxScoreCeiling(durationMs) × 1.05`（DROP_MS_PER_LINE=100ms 硬降上界、24h 封顶、level 200 封顶） | `implausible_score`（400，不入 KV） |

- 响应：
  - `200 { "ok":true, "accepted":true, "improved":boolean, "rank":number|null, "deviceId":"…" }`（rank=总榜名次 1 起，或 null 未进前 200）。
  - `429 { "ok":false, "error":{ "code":"rate_limited", … } }`（500ms 内先 IP 后设备；`CF-Connecting-IP` 缺失跳过 IP 维度）。
  - `400/403/404/405`：错误信封 `{ "ok":false, "error":{ "code":…, "message":… } }`。
- 头：`Content-Type: application/json; charset=utf-8`、`Cache-Control: no-store`；CORS 头见 §2.3。

### 2.2 GET `/api/leaderboard`（榜单，一次双视图）

- 响应 `200 { "ok":true, "proto":1, "generatedAt":number, "all":Top20, "week":Top20 }`；元素 `{ rank:1..20, nickname, score, level, lines }`（匿名化）。
- 排序：分数降序、同分早提交在前；总榜/周榜一次返回 → 前端切换零请求（DESIGN 裁定）。
- 无分页（仅 Top 20，非目标）；GET 不受限流。

### 2.3 CORS 与预检

- `ALLOWED_ORIGIN = 'https://michaelshii.github.io'`（唯一登记）：
  - Origin 命中 → `Access-Control-Allow-Origin` + `Vary: Origin` + `Allow-Methods: GET,POST,OPTIONS` + `Allow-Headers: Content-Type` + `Max-Age: 86400`。
  - `Origin: null`（file://）或其它 Origin → **403 `bad_origin` 且不回任何 ACAO 头**（与「离线无榜」一致）。
  - 无 Origin 头（curl/服务端直连）→ 放行。
- OPTIONS 预检 → `204`。

### 2.4 前端 fetch 包装（leaderboard.js 内部）

- `API_BASE = 'https://leaderboard-api.michaelshii.workers.dev'`（文档唯一登记点：leaderboard.js 常量 ↔ assembly-check 白名单 ↔ worker README 三处同源，改域名须三处同步——PRD §6 风险④）。
- POST：`fetch(API_BASE + '/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), signal })`；超时 8s（AbortController）；响应非 2xx（含 429/4xx/5xx）一律视为失败。
- GET：`fetch(API_BASE + '/api/leaderboard', { method:'GET', signal })`，超时 8s；失败 → 面板「暂不可用」+ 重试（AC-6）。
- 失败静默：无 toast、无 console 报错（AC-3）；禁用一个全局 `console.error`。

## §3 前端组件与页面拆分

### 3.1 装配序（index.html，纯追加）

`persist(1) → audio(2) → game(3) → ui(4) → leaderboard(5) → 内联装配(6)`（assembly-check §6 断言锁 persist<audio<game<ui<createUI 序保持成立）。

### 3.2 leaderboard.js —— UMD 纯逻辑模块（`window.TetrisLeaderboard`，Node 可 require）

- `createLeaderboard(opts) → handle`，opts：`{ persist, canFetch? }`（canFetch 缺省 = `typeof fetch === 'function'` 且 `location.protocol` 为 `http:`/`https:`；Node 测试可注入 `canFetch:true/false` 显式越过环境探测）。
- handle 导出面（契约钉死，qa-e2e/verify-leaderboard/assembly 锚点同源）：
  - `degraded: boolean`（AC-8/AC-9 可观测标记：协议非 http/https 或 fetch 不可用 → true，能力探测降级不 throw，persist.js 风格）。
  - `reportOver(snap) → void`：AC-2 提交决策树（见 §4.1）；snap 缺 `score/level/lines/sessionTimeMs` 键或 `score<=0` → 短路；`degraded` → 短路。
  - `setNickname(name) → boolean`：客户端清洗（D3 同规）→ 合法则 `persist.saveNickname` + 刷新显示 + 若有待提交立即续提；非法（清洗后空/超长）→ false（不持久化）。
  - `submitPending() → void`：昵称首弹确认后续提（见 §4.1）。
  - `cancelPendingSubmission() → void`：昵称弹窗取消 → 清待提交（本次不上榜，静默）。
  - `fetchBoards() → Promise<{ok:true, all, week} | {ok:false}>`：内部 GET（§2.4）；失败/超时 → `{ok:false}`；数据为 worker 双视图原样透传（映射见 §3.2b）。
  - `onNeedNickname(cb)`：首弹触发回调注册（ui.js 接线时注入；cb 幂等，reportOver 内仅在「待提交且无昵称」时调用一次）。
  - `dispose()`：清 pendingSub/定时器（重试计时）。
- 内部常量：`PROTOCOL_VERSION = 1`、`API_BASE`（上文）、`SUBMIT_BACKOFF_MS = 1500`、`FETCH_TIMEOUT_MS = 8000`。
- 纯函数导出（Node 直测）：`sanitizeNickname(name)`（与 persist 同式，独立实现双保险）、`buildPayload(snap, deviceId, nickname) → object|null`（null=缺键）、`generateDeviceId() → string`（`crypto.randomUUID()` 优先；降级手工 v4=随机位拼装，不 throw）。
- **无 DOM**：对 DOM 的操作一律经 ui.js 组件；file:///断网由 degraded 门控,不触碰 DOM（AC-8「0 fetch、不渲染」）。

3.2b 数据映射（渲染契约，ui.js 展示面消费）：面板行 = `rank/nickname/score/level/lines` 五个 span（DESIGN §2.2 行骨架）；不展示 durationMs。

### 3.3 ui.js 新增（纯追加独立组件 + createUI 接线）

- **`createLeaderboardPanel(els, api) → { dispose }`**（签名平行 createHud，DESIGN §6）：
  - els：`{ settingsGroup:'#lb-settings-group', nicknameValue:'#lb-nickname-value', btnEditNickname, btnOpenLeaderboard, modal:'#leaderboard-modal', modalClose, tabTotal, tabWeekly, list:'#lb-list', stateEl:'#lb-state' }`。
  - 职责：打开即 `api.fetchBoards()`（loading→list/「暂不可用」+重试/「暂无成绩，快去创造纪录」三态，DESIGN §1.3）；总榜/周榜 `aria-pressed` 互斥切换（缓存数据重渲染，零请求）；昵称行值从 persist 回读刷新；`api.degraded` 为 true → 设置组 `hidden`（AC-8）。
  - 弹层开合镜像 settings-modal 既有模式：`hidden` 属性 + rAF 加 `is-open` + 160ms 后 `hidden` 复位；Esc/焦点陷阱/背板×关闭（镜像 `onSettingsModalKeyDown`/`enableFocusTrap` 实现，独立绑定）。
  - **弹层互斥（DESIGN 裁定）**：打开排行榜前先 `closeSettingsModal()`；关闭后焦点回 `#btn-settings`（D8）。
- **`createNicknamePrompt(els, api) → { dispose }`**：
  - els：`{ modal:'#nickname-modal', input:'#nm-input', error:'#nm-error', confirm:'#nm-confirm', cancel:'#nm-cancel' }`。
  - 打开者二：① 首弹——api.onNeedNickname 回调（OVER 后置门槛）；② 设置「修改」——预填当前昵称（`input.value = persist nickname`）。
  - 交互：合法 → `api.setNickname(name)`（确认=持久化+续提；修改=仅持久化）+ 关弹层；非法 → `#nm-error` role=alert 显示「昵称不能为空」不关闭；输入时即时按 D3 剔除非法字符（`input` 事件内 sanitize 回写 + `maxlength=12`）；取消 → `api.cancelPendingSubmission()` + 关弹层（静默）；焦点初始入输入框，关闭回 `#btn-settings`（D8）。
  - 弹层互斥同上（从设置「修改」打开先关设置）。
- **createUI 接线**（`opts.leaderboard?` 可选句柄，缺失=旧版零影响，对齐 persist 可选模式）：
  - 参数化 `must()`×N 装配锚点（缺失即抛）：`#lb-settings-group`、`#lb-nickname-value`、`#btn-edit-nickname`、`#btn-open-leaderboard`、`#leaderboard-modal`、`#lb-list`、`#lb-state`、`#nickname-modal`、`#nm-input`、`#nm-error`、`#nm-confirm`、`#nm-cancel`。
  - `api.onNeedNickname(… 开弹窗 …)` 接线；`api.degraded` → 设置组 hidden（默认 hidden，激活才移除——DESIGN §2.1）。
  - **onGameOver 内部回调追加第二参数**（D4）：`opts.onGameOver(score, prevSnapshot)`——仅加参，既有宿主（只读首参）零影响；`prevSnapshot` 即 createUI 闭包现有变量（L1483），时点为 OVER 定格帧（game.js 三路径 emit 先于 onGameOver，已核）。
  - dispose 链追加：`leaderboardPanel.dispose()`、`nicknamePrompt.dispose()`、`opts.leaderboard.dispose()`（对称解绑，见既有 dispose 块模式）。
- JSDoc（createUI 头部 options 注释）同步补 `leaderboard?`（可选）与 `onGameOver(score, snap?)` 第二参说明。

### 3.4 index.html 新增（纯追加，三处）

1. **脚本位**：`<script src="./ui.js">` 之后、内联装配之前加 `<script src="./leaderboard.js">`（本地相对引用，非 http——AC-1）。
2. **弹层容器区**：`#settings-modal` 闭合 `</div>`（现 L336）之后、脚本注释（现 L338）之前，纯追加 `#leaderboard-modal.lb-modal` / `#nickname-modal.nm-modal` 两个空卡骨架（DESIGN §2.2/§2.3 的静态 markup，初始 `hidden`；DOM 序在 `#overlay`/`#settings-modal` 之后 → 同 z 层级自然压上，无需改 z-index 值）。注：`#touch-controls` 实际位于 `#settings-modal` 之前（L135），DESIGN §2.2「之后/之前」为行文近似，本处以「settings-modal 之后、脚本之前」为唯一定位锚。
3. **设置弹层内**：`.settings-group--keys` 闭合后纯追加 `.settings-group--leaderboard`（DESIGN §2.1 markup 原样，默认 `hidden`；不写 display 规则——D9）。
4. **内联装配改造**（现 L344-358 块内追加，其余不动）：
   ```js
   var persistHandle = (window.TetrisPersist) ? window.TetrisPersist.createPersistence() : undefined
   var lbHandle = null
   if (window.TetrisLeaderboard && persistHandle) {
     lbHandle = window.TetrisLeaderboard.createLeaderboard({ persist: persistHandle })
   }
   window.TetrisUI.createUI({
     persist: persistHandle,
     leaderboard: lbHandle,
     onGameOver: function (score, snap) {
       if (lbHandle && snap) lbHandle.reportOver(snap)
     }
   })
   ```

### 3.5 style.css 新增（纯追加独立类，既有规则零改、零新增 token/关键帧）

- 弹层族：`.lb-modal` / `.nm-modal`（背板+玻璃卡四件套复用 `--glass-bg` blur(20px) saturate(140%) + `--line` 描边 + `--radius-md`；`.is-open` 入场复用 `@keyframes overlay-in`——独立 `.lb-modal.is-open`/`.nm-modal.is-open` 门控副本；卡宽 `min(92vw,420px)`/S 竖屏 `min(94vw,420px)`、`max-height:min(80vh,560px)`、卡内滚动条独立 `.lb-modal__body` 副本）；`prefers-reduced-motion: reduce` 块内补两弹层 `animation:none`（镜像既有 reduce 段，TECH 复核项——DESIGN §3.2）。
- 榜单：`.lb-tabs`/`.lb-tab`（`[aria-pressed="true"]` 态沿 keycap 先例独立选择器）、`.lb-row`（grid 五列 `3ch 1fr auto 2ch 3ch`）、`.lb-rank`(+`.lb-rank--top`)、`.lb-name`（ellipsis）、`.lb-score/.lb-level/.lb-lines`（mono+tabular-nums）、`.lb-state`。
- 昵称：`.nm-label/.nm-input`（首个文本输入件：`--surface`+`--line`+`--primary-hi` focus，独立类）、`.nm-error`（`--danger`）、`.nm-actions`。
- 设置组行：`.lb-name-row/.lb-entry-row/.lb-nickname-value`（行式 label+值+钮；**组本身不写 display**，D9）。
- 触屏门控：`html.has-touch .lb-tab { min-height:44px }` 等 ≥44px 独立规则（DESIGN §4.3；桌面 `.lb-tab` 40px 不达标已标注为有意）。

## §4 状态管理

### 4.1 提交状态机（leaderboard.js 内部，纯函数/闭包，无 class）

```
reportOver(snap)
 ├─ degraded → return                       （AC-8：0 fetch、0 动作）
 ├─ snap 缺键 或 snap.score<=0 → return     （AC-2：0 分局不提交不弹窗）
 ├─ pendingSub 已存在 → return              （防同局重复入流；恰一次兜底）
 └─ nickname = persist.load().nickname
     ├─ 无昵称 → pendingSub=snap；onNeedNickname() 恰一次   （首弹门槛）
     │    ├─ 确认(清洗合法) → setNickname → submitPending() → POST
     │    └─ 取消 → cancelPendingSubmission()：清 pendingSub，静默（本局不上榜，下局再弹）
     └─ 有昵称 → POST（buildPayload → fetch）
POST 结果：
 ├─ 成功(2xx) → 清 pendingSub/重试状态，完成
 └─ 失败 → 重试计数=1？→ 静默放弃（至多 1 次退避 1500ms 后重试；仍失败清 pendingSub）
```
- 「单局恰一次」= 引擎 onGameOver 每局一次（事件面既有保证）+ 上表 `pendingSub` 防重入 + 失败重试 ≤1 后清态。
- 无跨局状态残留：restart 后新 OVER 重新走完整流程（loading 弹窗若首弹被取消，下局再弹——DESIGN「一次」口径）。

### 4.2 榜单视图状态（createLeaderboardPanel 局部）

`closed → opening(loading) → data(总榜|周榜) | error(暂不可用+重试) | empty(暂无成绩) → closed`；数据缓存于面板，tab 切换仅改渲染视图（零请求）；重开重新拉取（零轮询）。

### 4.3 degraded 判定与停摆（AC-8）

判定时点 = `createLeaderboard` 构造期（协议 + fetch 探测）；`degraded=true` 后：设置组两行保持 `hidden`、两弹层不可达（`hidden` 不在 Tab 序/读屏树）、reportOver/fetchBoards 全部短路、**0 次 fetch**（可观测断言）。本地游玩链路（引擎/HUD/信息面板/设置/持久化）与该模块零耦合，与其无关。

## §5 关键实现点与边界情况

1. **UUID 稳定与降级**（AC-4）：`crypto.randomUUID()` 有则用；否则手工 v4；`localStorage` 不可用时 persist 内存降级 → 会话内稳定、跨会话丢（符合「不 throw」契约）；首次生成即 `saveDeviceId`。
2. **双端昵称同规**（D3）：清洗=trim→字符白名单剔除→长度校验；**服务端不剔除只拒**（合法字符集逐字同源；前端输入时即时剔除更友好）。emoji/控制符/首字符空白一律不通（Phase 2 可扩，PRD 风险⑤）。
3. **取消=放弃本次提交**：静默、不上榜、无残留（pendingSub 清空）；与「离线无榜」语义自洽（DESIGN §7）。
4. **弹层互斥与焦点**：任何时点仅一弹层激活；从设置开新弹层先 `closeSettingsModal()`（其既有 close 路径含 endRecording/焦点还原）；关闭统一回 `#btn-settings`（D8）；Tab 陷阱单实例（互斥保证同刻仅一陷阱）。
5. **nickname 修改与提交竞态**：OVER 弹窗打开期间用户点设置改昵称不可达（弹层互斥 + OVER 态设置钮可用？——OVER 期 `#btn-settings` 仍可点开设置：设置「修改昵称」路径与首弹路径互斥由同一互斥锁保证：改昵称确认只持久化**不续提当前 pendingSub**（DESIGN：该局已提交的不回溯重提；首弹确认才续提）——两种打开路径的确认行为不同，实现上以「打开者」区分（首弹 confirm → persist+submitPending；设置 confirm → persist 仅此）。
6. **0 分局不弹窗**（D7）：score=0 的 OVER 不触发昵称弹窗（避免 0 分局骚扰）。
7. **弱网/限流**：429 与网络失败同路径静默；重试命中限流 → 仍「暂不可用」（无计数提示，DESIGN §7）；GET 不受限流。
8. **file:// 双击**：degraded=true → 无入口、0 fetch、0 报错；info 面板/设置/持久化与现状逐字一致（AC-8/16）。
9. **周榜换周**：GET 返回时 worker 已按当前 ISO 周滚动；前端只渲染；空榜态文案「暂无成绩，快去创造纪录」。
10. **装配健壮性**：leaderboard.js 缺失（旧 CDN/缓存残留）→ `lbHandle=null`，createUI 不装配相关组件（persist 可选同款向后兼容）；`#overlay` 与两弹层同 z 域，DOM 序在后自然压上。
11. **prefers-reduced-motion**：两弹层入场沿既有 reduce（§3.5 补 `animation:none` 副本）——DESIGN 要求 TECH 复核项，已在改动面落实。
12. **performance**：列表 20 行一次性 innerHTML 拼接（无逐行动画、无逐行增删），面板开关零轮询；fetch 仅提交/开榜两触点。

## §6 测试策略

### 6.1 `scripts/verify-leaderboard.cjs`（新增，AC-14；Node mock fetch，`node:test` 风格对齐 verify-persist）

- 载荷构造：`buildPayload` 全字段含 `protoVer===1`；缺键 → null。
- score=0 / snap 缺键 → `reportOver` 不 fetch（fetch spy 计数 0）。
- 单局恰一次：同局二次 reportOver → 仍 1 次 fetch；失败重试 ≤1 次（注入 fake fetch 先败后成，断言 2 次 fetch 且最终成功态）；二次失败 → 静默（无 throw、无 console.error）。
- 昵称：`sanitizeNickname` 长度/白名单/空拒用例（含 CJK 通过、emoji 拒、首字符符号拒）；`setNickname` 非法 → false 且不持久化。
- deviceId：`generateDeviceId` 形态（UUID v4 兜底）；`saveDeviceId`/`persist.load().deviceId` 往返；persist 内存降级 → 会话内稳定。
- degraded：`createLeaderboard({canFetch:false})` → `degraded===true`、reportOver/fetchBoards 0 fetch；`{canFetch:true}` → false。
- 429/网络失败静默：fetch reject / 429 响应 → 无异常泄漏、pendingSub 清空。
- 榜单渲染辅助：mock `{ok:true, all:[...3], week:[...2]}` → 双视图数据透传；`{ok:false}` 路径。
- 退出码 0/1；**八套回归出口之一**。

### 6.2 `qa-e2e-jsdom.cjs` 新增用例（AC-15，仅追加不改既有断言；独立 §段「r37 全网排行榜」）

- OVER+score>0 → fetch spy 恰 1 次、载荷全字段（含 protoVer=1、durationMs=sessionTimeMs 映射、deviceId/nickname 真实值）——注入 `createLeaderboard({ persist, canFetch:true, fetchImpl:spy })` 经 `createUI({leaderboard})`。
- 昵称首弹：无昵称 OVER → `#nickname-modal` 开、input 空；输入非法 → `#nm-error` 显不关闭；合法确定 → persist `tetris.nickname` 落盘、POST 载荷带昵称；取消 → 不上榜、无 fetch。
- 修改昵称：设置「修改」预填；确定 → 即时持久化；下一局 OVER 提交带新昵称；该局已提交不回溯。
- file:// 管线：真实 index.html（jsdom `resources:'usable'`）→ degraded → 无 `#lb-settings-group` 可见性（hidden）、0 fetch（注入计数）；游戏完整游玩（开始→OVER→重开）零报错。
- 面板：mock GET 成功 → `#lb-list` 渲染 Top3 行、总榜/周榜 `aria-pressed` 切换零请求；失败 → `#lb-state`「暂不可用」+ 重试。
- 弹层互斥：设置打开 → 点「查看榜单」→ 设置已关 + 榜开；Esc 关榜 → 焦点 `#btn-settings`。

### 6.3 `assembly-check.cjs` 改造（AC-9，唯一被改的既有脚本）

- **§5 自包含审计**：拼接串追加 `leaderboard.js`；`https?://` 判断改「仅 API 域名白名单例外」——`new RegExp('https?://(?!' + escapeRegExp('leaderboard-api.michaelshii.workers.dev') + ')', 'i')`（API_HOST 常量与 leaderboard.js `API_BASE` 同源登记，ARCHITECTURE §6.5）；其余既有审计（本地引用/音频文件/导出面）逐字不动。
- **§3 选择器清单追加**：`#lb-settings-group`、`#lb-nickname-value`、`#btn-edit-nickname`、`#btn-open-leaderboard`、`#leaderboard-modal`、`#lb-list`、`#lb-state`、`#nickname-modal`、`#nm-input`（装配锚点与 ui.js must() 清单同源）。
- **§6 脚本序**：断言链追加 `li < ci`（leaderboard.js 在 ui.js 之后、createUI 调用之前）。
- **新增「r37 装配锚点」段**：`window.TetrisLeaderboard` 导出面（`createLeaderboard` 函数存在）；leaderboard.js 源码含 `/API_BASE\s*=/`（单一 API 基址）、`degraded` 标记；persist 导出 `saveDeviceId`/`saveNickname`；index.html 含 `<script src="./leaderboard.js">` 与 `createLeaderboard` 调用。
- 明确不变：verify-game/verify-audio/verify-ui/verify-persist/verify-constants **0 行 diff**（红线 AC-15）。

### 6.4 回归矩阵（验收出口：八套全绿 + worker smoke + 0-diff）

| 项 | 期望 |
|---|---|
| verify-game / verify-audio / verify-persist / verify-constants / verify-ui | **0 行 diff、保持全绿** |
| assembly-check（§5 白名单 + §3/§6 + 新锚点改造后） | ALL PASSED |
| qa-e2e-jsdom（+r37 新段） | 既有断言全绿 + 新段全绿（AC-15） |
| verify-leaderboard（新） | 全绿（AC-14） |
| worker `node test/smoke.mjs` | 27/27 全绿（回归重跑，无改动） |
| game.js / audio.js | **0 行 diff**（git diff 核验）；onSfx 事件面 0 变化 |
| VERSION（game/ui/audio=2.3.0）/ persist 模块 VERSION 2.6.0 / PAYLOAD_VERSION=1 | 全不动 |
| file:// 双击完整游玩 | 开始→游玩→OVER→重开，离线全程、无入口、0 报错（AC-16） |

### 6.5 人工补测清单（AC-18，留产品验收）

真机联网提交与榜单渲染、断网/弱网静默与入口隐藏、昵称首弹交互（含 emoji 剔除/取消不上榜）、设置改昵称后提交生效、榜单玻璃风一致性、读屏语义（两弹层/昵称输入）、周榜换周/滚动边界、FPS 与面板开关性能、（部署后）线上 CORS curl 正反例（`-H "Origin: https://michaelshii.github.io"` 200 / `Origin: null` 403）。

## §7 任务拆分（对齐蓝图，按文件边界并行；git 动作并入）

分支基线：`feat/global-leaderboard` @ 87c81f3（r36 已入库）；未提交仅 untracked 任务夹 `docs/teamflow/20260904-r37-global-leaderboard/`。
**git 约定（PRD §8 工程约束，逐字承继）**：① 实施基于 r36 提交之上；② 收口时业务代码 + 本任务夹全部文档随本需求**一次提交入库**（不入业务代码的 untracked 夹在此时入 git）；③ **合回 main 时机 = 验收通过后经用户确认**（沿袭 r35/r36 流程），本轮不做 merge。

| 任务 | 文件边界 | 说明（可并行依据） |
|---|---|---|
| T1 | `/persist.js` | 增量：sanitizeDeviceId/sanitizeNickname + load/encode 顶层键 + saveDeviceId/saveNickname + 导出（§1.1）；签名先行钉死，T2 可并行 |
| T2 | `/leaderboard.js`（新） | UMD 纯逻辑：createLeaderboard handle 全契约（§3.2）+ buildPayload/sanitize/generateDeviceId（§5 #1/#2）；依赖 persist 出口签名（T1 契约）；Node 可 require |
| T3 | `/index.html` | 四管线纯追加（§3.4：脚本位/两弹层卡/设置组/内联装配）；DOM 契约先行，T5 的 must() 依赖其同步交付 |
| T4 | `/style.css` | 纯追加独立类（§3.5）：lb/nm 族 + 触屏 44px + reduced-motion 副本 |
| T5 | `/ui.js` | createLeaderboardPanel/createNicknamePrompt + createUI 接线（must×N/onNeedNickname/degraded hidden/onGameOver 第二参/dispose 链）+ JSDoc（§3.3）；依赖 T2 api 契约 + T3 DOM（契约同步 → 可与 T1~T4 并行，收口合代码） |
| T6 | `/scripts/verify-leaderboard.cjs`（新） | §6.1 全用例，AC-14；依赖 T2 导出面 |
| T7 | `/scripts/assembly-check.cjs` | §6.3 改造（§5 白名单/§3 选择器/§6 序/新锚点），AC-9；依赖 T2/T3 产物 |
| T8 | `/scripts/qa-e2e-jsdom.cjs` | §6.2 新段追加（不改既有断言），AC-15；依赖 T1~T5 产物 |
| T9 | 收口（QA 主导） | 八套全绿 + worker smoke 重跑 + 0-diff 红线核验（§6.4）+ git 一次提交（含任务夹）；验收通过后用户确认合回 main |

顺序建议：T1/T2/T3/T4 并行 → T5/T6/T7 并行（基于已有产物）→ T8 → T9；冲突面仅 T5↔T3 的 DOM 契约与 T7↔T2 的导出面，均已在本文档钉死。

## §8 红线与验收映射（AC × 产出）

| AC | 落地点 |
|---|---|
| AC-1/2/3 | §3.2+§3.4（leaderboard.js 装配、reportOver 决策树、静默）；引擎 onGameOver 只读消费（0-diff） |
| AC-4/5 | §1.1+§5#1#2（persist 增量、UUID、首弹、白名单同规） |
| AC-6/7 | §2.2+§3.3+§3.5（双视图、Top20 渲染、玻璃风、a11y） |
| AC-8/16 | §3.2 degraded + §4.3 + §6.2 file:// 用例 |
| AC-9 | §6.3 assembly 改造规格 |
| AC-10~13 | §1.2+§2（worker 两接口/KV/校验/限流/CORS——已落地，本文档钉定契约） |
| AC-14/15 | §6.1+§6.2+§6.4（verify-leaderboard 新增、qa-e2e 新用例、八套全绿、0-diff） |
| AC-17/18 | §7 git 约定 + §6.5 人工补测（README/任务夹契约同步归 AC-17，随 T9 落盘） |

<!-- blueprint -->{"summary":"r37 匿名全网榜 Phase1：前端零构建纯 JS 追加 UMD 逻辑模块 leaderboard.js（身份/OVER 自动提交/降级/拉榜）+ ui.js 两个弹层组件工厂，后端 Cloudflare Workers+KV 已脚手架落地，TECH 钉死双端契约（protoVer/durationMs=sessionTimeMs/昵称白名单同规）实现并行开发与折中校验","modules":{"/persist.js":{"responsibility":"仅增 deviceId/nickname 顶层键与 saveDeviceId/saveNickname/sanitizeDeviceId/sanitizeNickname 出口；PAYLOAD_VERSION 不变、既有载荷零改","dependsOn":[],"assemblyOrder":1,"why":"持久化唯一事实源（memory.md 既有约定：业务侧禁裸 setItem）；新键必须收敛于此，否则跨模块漂移"},"/leaderboard.js":{"responsibility":"UMD 纯逻辑模块：createLeaderboard handle（degraded 判定/reportOver 决策树/buildPayload/fetchBoards/昵称首弹回调）+ 纯函数（sanitizeNickname/generateDeviceId）；无 DOM","dependsOn":["/persist.js"],"assemblyOrder":5,"why":"与 persist.js 同构（纯逻辑 Node 可 require、工厂+闭包、能力探测不 throw）；DOM 组件归 ui.js 以复用 must()/trapTab/Esc 基建——职责单一，Node 直测零 jsdom 依赖"},"/ui.js":{"responsibility":"新增 createLeaderboardPanel/createNicknamePrompt（弹层开合/焦点陷阱/Esc/互斥/三态渲染）+ createUI 接线（must×N、onNeedNickname、degraded hidden、onGameOver 第二参 prevSnapshot、dispose 链）","dependsOn":["/leaderboard.js","/index.html"],"assemblyOrder":4,"why":"DOM+交互基建（trapTab/焦点管理/overlay-in 门控）都在 ui.js；组件工厂平行 createHud 签名是项目既定模式；onGameOver 加参不破既有宿主"},"/index.html":{"responsibility":"纯追加：leaderboard.js 脚本位、#leaderboard-modal/#nickname-modal 空卡（settings-modal 后脚本前）、设置组 .settings-group--leaderboard、内联装配（createLeaderboard+createUI({leaderboard,onGameOver})）","dependsOn":["/leaderboard.js","/ui.js"],"assemblyOrder":6,"why":"装配根唯一入口；可选依赖注入模式对齐 persist（leaderboard 缺失=旧版零影响）；DOM 序保证弹层 z 层自然压上"},"/style.css":{"responsibility":"纯追加独立类：.lb-*/ .nm-* 族（玻璃卡四件套复用/overlay-in 复用/触屏 44px/reduced-motion 副本）；既有规则体零改","dependsOn":["/index.html"],"assemblyOrder":7,"why":"r34 既定规范（独立类名纯追加+零新增 token/关键帧），避免影响既有断点与组件"},"/scripts/verify-leaderboard.cjs":{"responsibility":"新增 Node mock fetch 回归：载荷/恰一次/重试≤1/昵称清洗/deviceId/degraded 0fetch/榜单映射","dependsOn":["/leaderboard.js","/persist.js"],"assemblyOrder":8,"why":"leaderboard.js 纯逻辑 → Node 直测零 jsdom；与 verify-persist 同风格，构成八套回归出口"},"/scripts/assembly-check.cjs":{"responsibility":"§5 自包含审计改『仅 API 域名白名单例外』+ 拼接串加 leaderboard.js + §3 选择器/§6 序登记 + r37 装配锚点段","dependsOn":["/index.html","/leaderboard.js","/persist.js"],"assemblyOrder":9,"why":"既有一致性审计面按 AC-9 唯一例外改造；其余脚本（verify-game/audio/ui/persist/constants）保持 0-diff"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"仅追加 r37 段：OVER 提交 spy/昵称首弹与修改/file:// 降级 0fetch/面板渲染切换/弹层互斥焦点","dependsOn":["/ui.js","/leaderboard.js","/index.html"],"assemblyOrder":10,"why":"DOM E2E 面唯一扩展点；既有断言零改动（AC-15 红线）"},"/worker/src/index.js":{"responsibility":"Worker 入口：路由/CORS 门控（仅 michaelshii.github.io 拒 Origin:null）/错误信封/限流（设备20+IP60 每10min）/anomaly→400","dependsOn":["/worker/src/validate.js","/worker/src/store.js","/worker/src/rate-limit.js"],"assemblyOrder":0,"why":"已随脚手架落地（独立子工程，与产品根零构建审计互不污染）；TECH 只钉契约不重写"},"duplications":["昵称白名单两处实现（persist sanitizeNickname 与 worker cleanNickname）系刻意双端同规镜像——必须逐字同式，防漂移：断言锚=verify-leaderboard 双向用例 + worker smoke","deviceId 清洗两处（persist sanitizeDeviceId / worker DEVICE_ID_RE）同规镜像，同上","protoVer 字段名（PRD『protocolVersion』概念 vs worker 已落地『protoVer』）——TECH 钉名 protoVer 为唯一线上名，README/QA 口径同步","ARCHITECTURE §3.1 称 leaderboard.js 导出弹层工厂（脚手架笔误）vs DESIGN §6 归 ui.js——已裁定以 DESIGN 为准，dev 不得按 ARCHITECTURE 该行实现"],"tasks":[{"title":"T1 persist.js 增量（deviceId/nickname 键与出口）","files":["/persist.js"],"spec":"仅增 sanitizeDeviceId/sanitizeNickname + load/encode 顶层键 + saveDeviceId/saveNickname + 导出；PAYLOAD_VERSION 与既有载荷零改"},{"title":"T2 leaderboard.js UMD 纯逻辑模块","files":["/leaderboard.js"],"spec":"createLeaderboard handle 全契约（degraded/reportOver/setNickname/submitPending/cancelPendingSubmission/fetchBoards/onNeedNickname/dispose）+ buildPayload/sanitizeNickname/generateDeviceId 纯函数，Node 可 require"},{"title":"T3 index.html 四管线纯追加","files":["/index.html"],"spec":"leaderboard.js 脚本位 + 两弹层空卡（settings-modal 后脚本前）+ 设置组 + 内联装配（createLeaderboard→createUI({leaderboard,onGameOver})）"},{"title":"T4 style.css 独立类追加","files":["/style.css"],"spec":".lb-*/ .nm-* 族独立规则 + 触屏 44px + reduced-motion 副本；既有规则零改、零新增 token/keyframe"},{"title":"T5 ui.js 弹层组件与 createUI 接线","files":["/ui.js"],"spec":"createLeaderboardPanel/createNicknamePrompt + must×N + onNeedNickname/degraded hidden/onGameOver 第二参 prevSnapshot/dispose 链 + JSDoc"},{"title":"T6 verify-leaderboard.cjs 新增","files":["/scripts/verify-leaderboard.cjs"],"spec":"按 §6.1 全用例（AC-14）实现 mock fetch 回归，八套出口之一"},{"title":"T7 assembly-check.cjs 白名单改造","files":["/scripts/assembly-check.cjs"],"spec":"按 §6.3（AC-9）改自包含审计白名单例外+选择器/脚本序登记+新装配锚点段"},{"title":"T8 qa-e2e-jsdom.cjs 新用例段","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"按 §6.2 追加 r37 段（OVER 提交/昵称首弹与修改/file:// 降级/面板/互斥），既有断言零改动"},{"title":"T9 收口回归与 git 一次提交","files":["/docs/teamflow/20260904-r37-global-leaderboard/"],"spec":"八套全绿+worker smoke+0-diff 红线核验；业务代码与任务夹随本需求一次提交；验收通过后用户确认合回 main"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r37 技术方案定稿：leaderboard.js=UMD 纯逻辑（createLeaderboard handle：degraded/reportOver/setNickname/submitPending/fetchBoards/onNeedNickname），弹层组件工厂归 ui.js（修正 ARCHITECTURE §3.1 笔误，以 DESIGN 为准）；载荷字段钉名 protoVer=1、durationMs=snapshot.sessionTimeMs（ui.js onGameOver 加第二参 prevSnapshot，三处 OVER 路径 emit 先于 onGameOver 已核验，引擎 0 改动）；昵称白名单以 worker 正则为准双端同规；persist 仅增 deviceId/nickname 顶层键+saveDeviceId/saveNickname（PAYLOAD_VERSION=1 不变、verify-persist 0-diff）；限流钉 20/10min 设备+60/10min IP；anomaly→400 不入 KV；弹层互斥+焦点统一回 #btn-settings；T1~T9 按文件边界并行（T1/T2/T3/T4 并行→T5/T6/T7→T8→T9），git=feat/global-leaderboard@87c81f3 一次提交、验收后用户确认合回 main","verifyScripts":["node scripts/verify-leaderboard.cjs","node scripts/assembly-check.cjs","node scripts/qa-e2e-jsdom.cjs","node scripts/verify-game.cjs","node scripts/verify-audio.cjs","node scripts/verify-ui.cjs","node scripts/verify-persist.cjs","node scripts/verify-constants.cjs","node worker/test/smoke.mjs"],"modules":{"/leaderboard.js":"UMD 纯逻辑：createLeaderboard handle（degraded/reportOver/setNickname/submitPending/cancelPendingSubmission/fetchBoards/onNeedNickname/dispose）+ buildPayload/sanitizeNickname/generateDeviceId；API_BASE 唯一登记点","/persist.js":"仅增 deviceId/nickname 顶层键 + saveDeviceId/saveNickname/sanitizeDeviceId/sanitizeNickname；PAYLOAD_VERSION 不变","/ui.js":"createLeaderboardPanel/createNicknamePrompt + createUI 接线（must×N/onNeedNickname/degraded hidden/onGameOver(score,prevSnapshot)/dispose 链）","/index.html":"leaderboard.js 脚本位 + 两弹层空卡（settings-modal 后脚本前）+ 设置组 + 内联装配 createLeaderboard→createUI({leaderboard,onGameOver})","/style.css":".lb-*/ .nm-* 独立类 + 触屏 44px + reduced-motion 副本；零新增 token/keyframe","/scripts/verify-leaderboard.cjs":"新增 mock fetch 八套第 8 套（AC-14 全用例）","/scripts/assembly-check.cjs":"§5 白名单例外 + §3/§6 登记 + r37 装配锚点段（AC-9）；其余五脚本 0-diff"},"memory":["TECH 钉定：protoVer 为线上载荷字段名（PRD『protocolVersion』概念映射）、durationMs 载荷=snapshot.sessionTimeMs（ui.js onGameOver 第二参透传 prevSnapshot，engine 0-diff）、昵称白名单以 worker 正则为准双端同规（persist sanitizeNickname 与 worker cleanNickname 逐字同式）","装配：index.html 脚本序 persist→audio→game→ui→leaderboard→内联装配；内联块 createLeaderboard({persist})→createUI({persist,leaderboard,onGameOver:(score,snap)=>lb.reportOver(snap)})；leaderboard 缺失=旧版零影响","导出归属裁定：弹层组件工厂 createLeaderboardPanel/createNicknamePrompt 归 ui.js（ARCHITECTURE §3.1 的 leaderboard.js 导出说法为笔误，以 DESIGN 为准）；leaderboard.js 纯逻辑无 DOM","限流数值钉定 20/10min 设备+60/10min IP（较 PRD 建议放宽，10min 滑窗更平滑，已落地 worker）；anomaly 拒绝形态=400 implausible_score 不入 KV；设置组无 display 规则（hidden 属性 JS 门控，D9）","弹层互斥：开新弹层先关设置；两弹层关闭焦点统一回 #btn-settings（D8，比 DESIGN『触发钮』稳）；昵称首弹确认=持久化+续提、设置修改确认=仅持久化；取消=清 pendingSub 静默不上榜","任务 T1~T9 按文件边界并行（T1/T2/T3/T4→T5/T6/T7→T8→T9）；git 基线 feat/global-leaderboard@87c81f3、业务代码+任务夹一次提交、验收后用户确认合回 main；phase 2 重放校验留待办（protoVer/anomaly 扩展点已预留）"]}<!-- /state -->