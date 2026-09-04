# 俄罗斯方块（Tetris）工程架构 — ARCHITECTURE（r37 全网排行榜）

- `版本`：r37（2026-09-04 架构规划落盘；历史方案见 `docs/teamflow/history/v2.9/ARCHITECTURE.md`，本文档取代其成为**现行架构**）。
- `定位`：产品级长期工程文档——技术栈决策与取舍、目录结构、模块划分与契约、依赖清单、构建/测试/CI 要点、红线口径。**数值与验收以 PRD 为准、视觉与交互以 DESIGN 为准、接口签名以 TECHNICAL 为准**，本文只定工程组织，不重述规格。
- `关联`：任务夹 `docs/teamflow/20260904-r37-global-leaderboard/`（本需求产物）；`docs/teamflow/memory.md`（产品约定记忆，r37 约定已登记）。

---

## 0. 现状基线（r37 开局核验，事实优先）

- **前端形态**：扁平纯 JS · 零构建 · 零运行时依赖 · UMD（`window.TetrisGame` / `TetrisAudio` / `TetrisUI` / `TetrisPersist`）；`file://` 双击即玩、离线可用（AC-08 既有口径，r37 升格见 §7）。
- **产品根文件集**（assembly-check §5 审计面）：`index.html`、`game.js`、`audio.js`、`ui.js`、`persist.js`、`style.css`。
- **回归脚本**（七套，全部绿）：`verify-game` / `verify-audio` / `verify-ui` / `verify-persist` / `verify-constants` / `assembly-check` / `qa-e2e-jsdom`（r37 起 +`verify-leaderboard` 共八套）。
- **分支与基点**：`feat/global-leaderboard`（基点 `87c81f3`，r36 交付）；本需求任务夹已建（PRD/DESIGN 落盘中，夹名 `20260904-r37-global-leaderboard`）。
- **缺口**：`docs/teamflow/architecture/` 目录此前不存在（仅 history 快照）——本轮补齐，作为 architecture 阶段的地基产物。

---

## 1. 技术栈决策与取舍

### 1.1 前端：维持「零构建扁平纯 JS」——硬约束，非新决策

| 候选 | 结论 | 理由 |
|---|---|---|
| 扁平纯 JS + UMD（现状） | ✅ **采纳** | 交付即 `file://` 双击可玩；jsdom 管线直接 `require()` 各模块跑断言；无 node_modules、无构建链、可整个提交；gh-pages 纯静态托管天然兼容 |
| TS + React + Node 前端 | ❌ 排除 | React 运行时（≈40–60KB）违背零依赖/轻量；游戏唯一动态渲染面是 Canvas，DOM 层为少量静态结构，组件树收益趋零；rAF 循环与 React 渲染周期互相纠缠 |
| TS + Vite 单文件管线 | ◐ 保留正式排除 | v2.9 曾作为「可选升级路径」；r37 起产品根**禁止引入 package.json/构建链**（PRD 工程约束），该路径不再适用产品根 |

**取舍说明**：前端选型的全部约束来自「玩家体验」——离线可玩、无网络请求、双击即玩；任何构建产物需求都会破坏「提交即跑、零工具链」的验收闭环。代价是失去类型检查与打包优化，由「纯函数优先 + 契约断言脚本 + qa-e2e 全量回归」对冲（团队既定路线，r37 不改变）。

### 1.2 后端：Cloudflare Workers + KV（免费档）——新增决策

| 候选 | 结论 | 理由 |
|---|---|---|
| **Cloudflare Workers + KV** | ✅ **推荐** | 免费档（每日 10 万读 / 1000 写 / 1GB KV）对 Top20 榜单绰绰有余；与 gh-pages 各自独立托管，无需自有服务器与证书；KV 读多写少正配排行榜；部署一条命令（`wrangler deploy`） |
| Node/Express + 云主机 | ❌ | 需常驻服务器 + HTTPS 证书 + 运维成本，与「静态托管即可」的产品形态不匹配 |
| Vercel/Netlify Functions | ◐ 备选 | 函数配额/账号绑定，冷启动对多客户端并发拉榜不友好；可作替代但不优先 |
| Supabase/Firebase 等 BaaS | ❌ | 引入外部鉴权与账号体系，与「匿名、无账号、轻量」需求冲突；数据不受产品控制 |
| Worker + TypeScript 编译 | ◐ Phase 2 选项 | wrangler 支持 TS 直跑；Phase 1 用纯 JS ESM 保持零构建精神，兼容 Node 18 直测 |

**关键权衡**：
1. **独立子工程**：`worker/` 自带 `package.json`（仅 devDependency: wrangler），产品根零构建审计（assembly-check §5）只检查六文件集，`worker/` 不进入审计面——两套约束互不污染。
2. **KV 写入放大**：每次上榜提交 ≈ 3 次 KV 写（device 存档 + 总榜 + 周榜），免费档 1000 写/日对应 ≈ 300 次上榜/日，足够 Phase 1；若需扩容再谈付费档/去重缓存。
3. **限流的 KV 实现**：读改写计数（非原子），Phase 1「折中校验」可接受，文档化已知边界（§4.3）。
4. **协议版本号（`protoVer`）**：载荷自带版本字段，服务端回显 `proto`，为 Phase 2「服务端重放整局验分数」预留扩展点——本期不做重放，仅校验载荷合理性。

---

## 2. 目录结构树（r37 落地后）

```
products/tetris/
├── AGENTS.md                  ← 团队资产（既有，不动）
├── README.md                  ← 产品入口（团队资产）
├── index.html                 ← 交付物：零构建装配根（脚本序：persist→audio→game→ui→leaderboard→内联装配）
├── game.js / audio.js / ui.js / persist.js / style.css   ← 既有五模块（0-diff 或按契约追加）
├── leaderboard.js             ← r37 新增：全网榜 UMD 模块（dev 阶段产物，本轮规划契约）
├── scripts/                   ← 七套既有回归 + verify-leaderboard.cjs（r37 新增，dev 阶段）
├── docs/teamflow/
│   ├── SUMMARY.md
│   ├── memory.md              ← 产品约定记忆（r37 约定已登记）
│   ├── architecture/ARCHITECTURE.md   ← 本文档（本轮补齐）
│   ├── history/v2.9/…         ← 历史快照（只读）
│   └── 20260904-r37-global-leaderboard/  ← 本需求任务夹（PRD/DESIGN/…）
├── logs/teamflow/             ← 流水线日志（已存在）
└── worker/                    ← r37 新增：Cloudflare Workers 独立子工程（自身 package.json，不影响产品根）
    ├── package.json           ← { "type":"module", devDep: wrangler, scripts: dev/deploy/test }
    ├── wrangler.toml          ← name=tetris-leaderboard-api, main=src/index.js, kv_namespaces
    ├── .gitignore             ← node_modules/ .wrangler/ .dev.vars
    ├── README.md              ← 部署步骤 + API 契约速查 + 测试命令
    ├── src/
    │   ├── index.js           ← Worker 入口（ESM default export { fetch }）：路由分派、CORS、错误信封
    │   ├── validate.js        ← 纯函数：载荷解析、昵称清洗白名单、分数合理性上界、protoVer
    │   ├── store.js           ← KV 封装：device 存档 + board:all / board:week:<ISO周> 200 上限、去重、Top20
    │   └── rate-limit.js      ← KV 计数限流（每设备 / 每 IP，TTL 窗口）
    └── test/smoke.mjs         ← Node ≥18 冒烟：mock KV + 真实 Request/Response，覆盖 CORS/提交/清洗/上界/限流/降级
```

---

## 3. 模块划分与契约

### 3.1 前端（产品根）

| 文件 | 职责 | 契约要点 |
|---|---|---|
| `game.js` | 引擎（纯函数） | `window.TetrisGame`；**0-diff**（leaderboard 不触达引擎） |
| `audio.js` | 音效+BGM | `window.TetrisAudio`；**0-diff** |
| `persist.js` | 持久化唯一事实源 | 既有 `load/saveHighScore/saveSettings/saveStats`；**r37 增量**：+`saveDeviceId`（键 `tetris.deviceId`=UUIDv4）/ +`saveNickname`（键 `tetris.nickname`），业务侧禁止裸 setItem/getItem（memory.md 既有约定） |
| `ui.js` | 装配+渲染 | 既有契约 **0-diff 对齐**（r36 收敛后两组统计）；r37 只按 DESIGN 追加设置组与弹层挂钩（dev 阶段） |
| `leaderboard.js` | 全网榜 UMD（新） | `window.TetrisLeaderboard`；导出 `createLeaderboardPanel / createNicknamePrompt`（签名平行 `createHud`）；常量 `API_BASE`（唯一 API 域名登记点，见 §6.5）；**启用条件**：`location.protocol === 'https:'` 且 `window.TetrisPersist` 存在；file:// / 断网 → 入口两行 `hidden`、弹层不可达、**0 fetch**（DESIGN 裁定） |
| `index.html` | 装配根 | 脚本序 **persist→audio→game→ui→leaderboard→内联装配**（assembly-check §6 顺序断言保持成立）；设置组/两弹层空卡入 DOM（装配前） |

### 3.2 后端（worker/，独立子工程）

| 文件 | 职责 | 关键导出 |
|---|---|---|
| `src/index.js` | Worker 入口：路由 `/api/score`(POST) / `/api/leaderboard`(GET)、OPTIONS、CORS 门控、错误信封 | `default { fetch }`、`handleRequest`、`ALLOWED_ORIGIN` |
| `src/validate.js` | 纯函数（可在 Node 直测）：载荷字段解析与数值白名单、`cleanNickname`（长度≤12/字符白名单）、`checkPlausibility`（等级可达性 + 理论得分上界）、`PROTO_VER` | `parseSubmit / cleanNickname / checkPlausibility` |
| `src/store.js` | KV 读写：`entry:<deviceId>` 存档（同设备只保留最高分）、`board:all` 与 `board:week:<ISO周>`（≤200，Top20 展示）、ISO 周键、去重排序 | `addEntry / readBoards / isoWeekKey` |
| `src/rate-limit.js` | KV 计数限流（TTL 滑窗） | `rateLimitHit` |
| `test/smoke.mjs` | Node ≥18 冒烟：mock KV Map + 全局 `Request/Response` | 断言见 §6.3 |

---

## 4. API 契约（Phase 1 折中校验版）

### 4.1 POST `/api/score`

载荷（JSON，全部为"服务端只信自己算出的部分"）：`{ nickname, score, level, lines, durationMs, deviceId, protoVer }`。

| 字段 | 校验 | 失败码 |
|---|---|---|
| `nickname` | trim 后长度 1–12；字符白名单 `[字母/数字/空格/_/-/·/.]` | `invalid_nickname` |
| `score` | 非负整数 ≤1e9 | `bad_request` |
| `level` | 整数 1–999 | `bad_request` |
| `lines` | 整数 0–1e6 | `bad_request` |
| `durationMs` | 整数 0–86_400_000（24h 封顶） | `bad_request` |
| `deviceId` | `[A-Za-z0-9-]{8,64}`（前端 UUIDv4） | `bad_request` |
| `protoVer` | 必带整数 ≥1；>1 暂拒（Phase 2 扩展） | `bad_request` |
| — 合理性 | ① `minMsToReachLevel(level) ≤ durationMs`（等级按重力/行速推算的可达性）；② `score ≤ maxScoreCeiling(durationMs) × 1.05`（理论速度上界，逐级累加、24h 封顶） | `implausible_score` |

成功 `200`: `{ "ok": true, "accepted": true, "improved": boolean, "rank": number|null, "deviceId": "…" }`（`improved:false` = 同设备更低分，仅计入限流不上榜）。
限流 `429`: `{ "ok": false, "error": { "code": "rate_limited", … } }`。
格式错误 `400` / 方法不符 `405` / 未知路径 `404`：同信封。

### 4.2 GET `/api/leaderboard`

响应 `200`: `{ "ok": true, "proto": 1, "generatedAt": number, "all": [Top20], "week": [Top20] }`。
榜单元素（**匿名化**，不含 deviceId/ts）：`{ "rank": 1..20, "nickname": "…", "score": n, "level": n, "lines": n }`。
排序：分数降序，同分早提交在前。总榜/周榜一次 GET 双视图返回，切换零请求（DESIGN 裁定）。

### 4.3 CORS 与限流

- `ALLOWED_ORIGIN = 'https://michaelshii.github.io'`：命中 → 回 `Access-Control-Allow-Origin` + `Vary: Origin`；`Origin: null`（file://）或其它 Origin → **403 `bad_origin` 且不回 ACAO**（与「离线无榜」设计一致）；无 Origin 头（curl/服务端直连）→ 放行。
- OPTIONS 预检：允许源回 `204` + 允许方法 `GET,POST,OPTIONS`。
- 限流（KV 计数 + TTL 滑窗，读改写非原子——Phase 1 已知边界）：每设备 20 次 / 10 分钟；每 IP（`CF-Connecting-IP`，缺省跳过）60 次 / 10 分钟。

---

## 5. 依赖清单

| 位置 | 依赖 | 用途 | 版本 |
|---|---|---|---|
| 产品根 | **无** | 零依赖硬约束（含无 package.json、无 node_modules） | — |
| worker/ | `wrangler`（devDependency） | 本地调试（`wrangler dev`）与部署（`wrangler deploy`） | ^3.78 |
| worker/ | 运行时依赖 | **无**（纯 WS 运行时内建 API：KV、Request/Response） | — |
| 环境 | Node ≥ 18 | 产品七套脚本（CJS）+ worker 测试与 wrangler（wrangler 3 要求 ≥18） | ≥18 |

---

## 6. 构建 / 测试 / CI 配置要点

### 6.1 构建

- **产品根：无构建**（无 package.json/构建链；提交即产物）。
- **worker：无应用构建**（纯 ESM，wrangler 部署时自动 bundle）。

### 6.2 验证命令

- 产品根（八套 = 七套既有 + verify-leaderboard 新）：`node scripts/verify-*.cjs`、`node scripts/assembly-check.cjs`、`node scripts/qa-e2e-jsdom.cjs`、`node scripts/verify-leaderboard.cjs`。
- worker：`node test/smoke.mjs`（Node ≥18，mock KV，无网络）。

### 6.3 qa-e2e-jsdom 与 verify-leaderboard 边界

- `verify-leaderboard.cjs`（r37 新增，Node mock fetch）：测 leaderboard.js 的提交载荷组装、昵称弹窗判定、file:///断网的降级分支（**0 fetch** 断言）。
- `qa-e2e-jsdom` 补用例：OVER 且 score>0 触发提交路径、设置组两行 hidden 门控、弹层互斥、focus 归还。

### 6.4 assembly-check.cjs §5 白名单改造规格（红线，dev 阶段实施）

- 拼接串**加入 leaderboard.js**；
- 审计由「0 http(s) 引用」改为「**仅 API 域名白名单例外**」：`new RegExp('https?://(?!' + escapeRegExp(API_HOST) + ')', 'i')` 形态（API_HOST 与 leaderboard.js `API_BASE` 同源登记，见 §6.5）；
- §3/#6 选择器与脚本顺序断言同步登记新 DOM 钩子与 leaderboard.js 位；
- 其余审计（file:// 引用、音频文件、导出面）不动。

### 6.5 API 域名唯一登记点

`API_BASE`（前端 `leaderboard.js` 常量）与 assembly-check 白名单、worker README 三处统一写 **`https://tetris-leaderboard-api.michaelshi28.workers.dev`**（wrangler `name = "tetris-leaderboard-api"` 部署后的默认 workers.dev 域名；部署后如改自定义域名需三处同步，并保持 CORS 白名单仅 `michaelshii.github.io`）。alpha 阶段未部署时该常量为占位符，**不允许**在未部署前上线正式页。

### 6.6 CI（可选，本周不建）

建议（后续迭代）：GitHub Actions 单 job——产品根跑八套回归（Node 18，`qa-e2e-jsdom` 需 `npm i -g jsdom` 或 npx 缓存）+ `node worker/test/smoke.mjs`；部署用 `wrangler action`（需 secrets，Phase 1 可全人工 `wrangler deploy`）。

---

## 7. 红线/口径调整（团队决策流程裁定并落盘）

| # | 口径 | 调整 | 落盘点 |
|---|---|---|---|
| 1 | AC-08 自包含 | 升格为「**离线可玩、联网才有全网榜**」 | r37 PRD（待落）、SUMMARY 索引、QA/验收口径 |
| 2 | assembly-check「无 http(s) 引用」 | 改「仅 API 域名白名单例外」 | §6.4 规格（dev 实施）、r37 PRD |
| 3 | 新回归脚本 | +`verify-leaderboard.cjs`（回归出口 = 八套全绿、不加后门） | memory.md（已登记） |

历史任务夹/历史文档**不修改**（取代语义仅指向新口径生效点）。

---

## 8. 脚手架落地清单（architecture 阶段实际执行）

**本轮已落地**：`docs/teamflow/architecture/ARCHITECTURE.md`（本文档）；`worker/` 独立子工程（package.json / wrangler.toml / .gitignore / src 四模块 / test/smoke.mjs / README.md）；worker 冒烟全绿（见验证记录）；产品根七套回归全绿（未改动任何产品文件）。AGENTS.md 未改动（托管区已存在，跳过）。

**明确未落地（非本轮职责，理由）**：`leaderboard.js`、persist `saveDeviceId/saveNickname`、assembly-check 白名单与选择器登记、`verify-leaderboard.cjs`、qa-e2e 新用例 → TECH/dev 阶段按 §3.1/§6.4 契约实施；`PRD.md/TECHNICAL.md/QA-REPORT.md/ACCEPTANCE.md` 与 r37 任务夹 → 各自阶段落盘；worker 真实部署与 KV namespace 创建 → 需 Cloudflare 账号操作，验收前由产品经理/工程执行（wrangler.toml 已留 `id` 占位）。

---

<!-- state -->{"phase":"scaffold","summary":"r37 架构规划落盘：前端维持零构建扁平纯JS（TS/React 正式排除，v2.9 可选升级路径作废，理由与代价落盘）；后端新增 Cloudflare Workers+KV 免费档独立子工程 worker/（纯JS ESM 零运行时依赖，wrangler 仅 dev/deploy 工具），与产品根零构建审计互不污染；API 契约定稿（POST /api/score 载荷与合理性上界规则、GET /api/leaderboard 一次双视图 Top20 匿名化、CORS 仅 michaelshii.github.io 且拒 Origin:null、每设备20/10min+每IP60/10min 限流、protoVer 预留 Phase2）；红线调裁定稿（AC-08 升格『离线可玩、联网才有全网榜』、assembly-check §5 改仅 API 域名白名单例外、verify-leaderboard 新增共八套）；本轮已落地 worker/ 全套脚手架+冒烟测试与 ARCHITECTURE.md，产品根七套回归全绿、未动任何产品文件。","memory":["API 域名唯一登记点 https://leaderboard-api.michaelshii.workers.dev（wrangler name=tetris-leaderboard-api；前端 API_BASE/assembly 白名单/worker README 三处同源，改域名需同步且 CORS 白名单仅 michaelshii.github.io）","worker 技术栈：纯 JS ESM（package.json type=module）+ KV 命名空间绑定 LEADERBOARD；每上榜提交 KV 写放大≈3 次（entry 存档+board:all+board:week:<ISO周>）；限流为 KV 读改写非原子（Phase1 已知边界）；Node≥18 可 node test/smoke.mjs 直测（mock env+真实 Request/Response）","store 去重策略：entry:<deviceId> 只留最高分，同设备更低分仅计限流不上榜（improved:false）；board 上限 200、展示 Top20；榜单元素匿名化（无 deviceId/ts）","validate 合理性规则：nickname trim 1-12 字符白名单；minMsToReachLevel(level)≤durationMs 且 score≤maxScoreCeiling(durationMs)×1.05（逐级累加 24h 封顶）；protoVer 必带整数≥1 否则 400","assembly-check §5 改造规格已定：拼接串+leaderboard.js、正则改『仅 API 域名白名单例外』、§3/#6 选择器与脚本序同步登记（脚本序 persist→audio→game→ui→leaderboard→内联装配）」,"unchanged AGENTS.md（托管区已存在）、memory.md（r37 约定已登记）、产品根六文件+scripts 七套全绿；未落地项=leaderboard.js/persist 增量/verify-leaderboard/qa-e2e 新用例（dev 阶段）、PRD/TECH/QA/ACCEPTANCE（各自阶段）、worker 真实部署与 KV namespace（需账号操作，留 id 占位）"]}<!-- /state -->