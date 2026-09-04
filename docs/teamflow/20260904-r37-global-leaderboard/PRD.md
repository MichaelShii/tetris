<!-- meta: summary="r37 全网排行榜 Phase 1：Cloudflare Workers+KV 后端（提交/榜单两接口、折中校验、设备/IP 限流、CORS 白名单）+ leaderboard.js（OVER 自动提交、匿名设备 UUID+昵称、总榜/周榜 Top20、file:///断网静默降级）；红线：assembly-check 自包含审计改『仅 API 域白名单例外』、AC-08 升格『离线可玩、联网才有全网榜』，game/audio 0-diff、VERSION 不动、既有七套全绿+新增 verify-leaderboard" -->
# PRD — r37 全网排行榜功能（Phase 1，分阶段实施）

基线依赖：docs/teamflow/20260904-r36（其既定行为—信息面板恰两组（stat-grid 四块 + global-stats 四行）、全局统计单键持久化（saveStats/PAYLOAD_VERSION=1）、stat-grid HUD、VERSION 三模块 2.3.0、persist.js「tetris.* 键址 + 出口访问」唯一事实源、七套回归全绿—不得回归；本需求亦承继 r26+ 装配/自包含审计契约与 game.js onGameOver 事件出口，均为只读消费、0 行改动）
取代：docs/teamflow/20260904-r36#AC-5（assembly-check「自包含审计（无外部依赖、音频文件审计）逐字保持」段；该审计源自 v2.7 起 AC-08「自包含与离线：零 http(s) 引用、断网可玩」，现由 scripts/assembly-check.cjs §5 强制）：assembly-check 的「无 http(s) 引用」审计改为「仅 API 域名白名单例外」，AC-08 自包含口径同步升格为「离线可玩、联网才有全网榜」（本 PRD 即同步落盘点）

## 1. 背景与目标

- **背景**：游戏已部署到 GitHub Pages（`https://michaelshii.github.io/tetris/`），前端为纯静态零构建形态（file:// 双击即玩、零网络）。本轮交付**全网排行榜第 1 阶段「折中校验版」**：前端在游戏 OVER 时自动提交成绩，榜单面板展示总榜/周榜 Top 20；服务端做**折中校验**（昵称清洗、按等级与对局时长推算的理论速度上界异常标记、每设备/每 IP 限流、CORS 仅放行 GitHub Pages 域名）。**严格防作弊的服务端重放校验（复用 game.js 在服务端重放整局）为 Phase 2 后续迭代**，本期不做，但提交协议载荷携带**协议版本号字段**预留扩展点。
- **目标**：玩家（匿名）联网游玩后成绩自动进入全网榜并可查看 Top 20（总榜+周榜）；身份为设备 UUID + 昵称（首次提交弹窗一次、本地持久化、设置可改）；`file://` 或断网时「全网榜」入口与面板**静默隐藏**，离线体验与现状**完全一致**；产品根继续保持零构建扁平纯 JS，后端 Worker 独立目录独立部署；既有回归脚本全绿，仅按裁定调整 assembly-check 自包含审计口径并新增 verify-leaderboard。
- **本需求红线/口径裁定（落盘）**：① assembly-check「无 http(s) 引用」审计 →「仅 API 域名白名单例外」（例外仅在 leaderboard.js 内单一 API 基址常量，其余任何 http(s) 仍判失败）；② AC-08 自包含口径由「零 http(s) 引用、断网可玩」升格为「**离线可玩、联网才有全网榜**」；③ 产品根零构建约束不扩展至后端 Worker（独立目录、独立部署）。

## 2. 用户故事与验收标准（AC，本夹内从 AC-1 编号）

### U1 成绩提交（OVER 自动）
> 作为玩家，我打完一局（OVER）后分数自动上报，不用任何手动操作；网络不好时也绝不打扰我。

- **AC-1（P0）leaderboard.js UMD 模块与装配**：新增 `leaderboard.js`，UMD 契约导出 `window.TetrisLeaderboard`（工厂函数 + 返回 api/dispose，风格与 persist.js 一致：纯函数优先、能力探测降级不 throw）；`index.html` 在 `ui.js` 之后、内联装配之前引入 `./leaderboard.js`（本地相对引用，非 http）；与其他模块的接线（创建/装配/dispose）复用既有 UMD 模式。
- **AC-2（P0）OVER 自动提交**：对局 OVER（复用 game.js onGameOver 事件出口，引擎 0 行改动）时自动提交成绩：载荷字段 = `nickname`/`score`/`level`/`lines`/`durationMs`/`deviceId`/`protocolVersion`，其中 `protocolVersion=1`（本期固定，Phase 2 扩展点）；**score>0 才提交**（0 分局不提交、不上榜）；单局**恰提交一次**（restart/隐藏/卸载不重复触发；失败重试至多 1 次退避后静默放弃，仍不重复）。
- **AC-3（P0）失败静默、本地游玩零影响**：提交失败（断网/超时/429/4xx/5xx）一律静默——无弹窗、无 console 报错、不影响继续游玩与本地离线数据；降级后可随时再次游玩，下次 OVER 再自然提交。

### U2 匿名身份（设备 + 昵称）
> 作为玩家，我不注册不登录，换个昵称就上榜单；下次来还是我，昵称自动带出。

- **AC-4（P0）设备 UUID**：首次加载生成 UUID v4 作为 `deviceId`，持久化到 localStorage **persist.js 的 `tetris.*` 键址约定**（建议键 `tetris.deviceId`，经 persist 新增出口 saveDeviceId/load 访问，禁止裸 setItem/getItem）；技术方案裁定键名。同一设备跨局/跨刷新/跨天保持同一 `deviceId`；localStorage 不可用时降级为本次会话内内存随机 id（不 throw）。
- **AC-5（P0）昵称首次弹窗一次 + 持久化 + 可改**：首次提交（OVER 且 score>0）时若无昵称，弹出昵称输入（一次）；昵称校验与清洗客户端同服务端规则——trim 后长度 1–12 字符、字符白名单 = 可打印 ASCII + CJK（U+4E00–U+9FFF，不含 emoji/控制符），非法字符剔除、空则拒绝并提示重新输入；合法后持久化到 persist.js（建议键 `tetris.nickname`，`saveNickname` 出口），此后提交自动带出；**设置中提供「修改昵称」入口**，修改即持久化、下一局提交生效。

### U3 榜单展示
> 作为玩家，我能在游戏里看到全网的 Top 20，既能看总榜也能看本周榜。

- **AC-6（P0）GET /api/leaderboard 双视图**：返回**总榜 + 周榜**两个视图（各 Top 20：nickname/score/level/lines/durationMs，字段集由技术方案裁定），前端渲染名次/昵称/分数/等级/消行；面板内可切换总榜↔周榜（默认总榜）；请求失败/超时显示降级占位（如「暂不可用」）而非崩溃、不阻塞游戏。
- **AC-7（P0）视觉与可访问性**：榜单面板视觉沿用科技玻璃风（DESIGN token，不新增关键帧/风格族）；**挂载位置（设置弹层或侧栏）由 UI 设计裁定**；面板与入口带可访问标注（aria-label/aria-live 适度，避免刷屏）。

### U4 降级与离线（核心红线）
> 作为玩家，我断网或双击 file:// 打开时：一切照旧，跟没有排行榜一模一样。

- **AC-8（P0）file:///断网静默降级**：`location.protocol` 非 http/https（file:// 等）或 fetch 不可用/失败时，leaderboard.js 进入**禁用态**：「全网榜」入口与面板**静默隐藏**（不渲染、不留占位、不报错、0 次 fetch 调用）；本地离线游玩（游戏/信息面板/设置/持久化）与现状**完全一致**；判定与禁用均不影响其他模块。
- **AC-9（P0）assembly-check 自包含审计改「仅 API 域白名单例外」**：assembly-check §5 自包含（AC-08）审计由「0 个 http(s) 引用」改为「**仅 API 域名白名单例外**」——允许且仅允许 `leaderboard.js` 内**单一 API 基址常量**（值 = 部署后 Worker 域名，技术方案钉死，形如 `https://<worker>.<子域>.workers.dev`）及其 fetch 调用出现 http(s)，**其余任何文件（index.html/game/audio/ui/persist/style）任何 http(s) 引用仍判失败**；同时新增装配锚点断言：`leaderboard.js` 在脚本序中、`window.TetrisLeaderboard` 导出面存在、声明降级禁用态的可观测标记（如 api.degraded 或等价，技术方案裁定）。

### U5 后端（Cloudflare Workers + KV）
> 作为服务，我收分、存榜、限流、挡白名单外来源，跟 GitHub Pages 前端互不拖累。

- **AC-10（P0）Worker 独立工程与两接口**：后端 Worker 放**产品根独立目录**（具体结构由技术方案裁定，与前端解耦、独立部署到 Cloudflare Workers + KV 免费档）；`POST /api/score`（提交）与 `GET /api/leaderboard`（榜单）两路由；KV 存储**总榜**与**周榜**（周榜按 ISO 周滚动，换周自动切换），各视图 Top 20 有序返回。
- **AC-11（P0）服务端折中校验**：① 昵称清洗——trim → 按白名单（可打印 ASCII + CJK）剔除非法字符 → 截断至 ≤12，清洗后为空 → 400；② 分数合理性——按 `level`（等级决定的最小落块间隔，须与 game.js 顶部速度表常量口径一致）与 `durationMs` 推算理论速度上界，`score`/`lines` 超出上界 → 标记 **anomaly 且不入榜**（响应可观测标记；具体拒绝形态 400/标记返回由技术方案裁定，验收钉「异常载荷不入 KV 榜单」）；③ `protocolVersion` 非当前值（1）→ 400（Phase 2 扩展点）。
- **AC-12（P0）限流**：每设备 60s 窗口 ≤5 次、每 IP 60s 窗口 ≤20 次提交（数值可由技术方案微调并写入文档），超限 → 429（含 Retry-After）；限流不波及 GET。
- **AC-13（P0）CORS 白名单**：仅放行 `https://michaelshii.github.io`；**拒绝 `Origin: null`**（file:// 请求天然不可用，与「离线无榜」设计一致）；OPTIONS 预检返回正确 Allow-Methods/Headers（含 Content-Type）。

### U6 工程与回归
> 作为 QA/产品，一切可测、可回归、可离线、契约落盘。

- **AC-14（P0）verify-leaderboard.cjs**：新增 `scripts/verify-leaderboard.cjs`（**Node 下 mock fetch**），覆盖：载荷构造全字段与 protocolVersion=1、score=0 不提交、单局恰一次与失败重试 ≤1 次、昵称清洗（长度/白名单/空拒）、deviceId 稳定与降级、file:// 禁用态（0 fetch/入口隐藏）、429 与网络失败静默、榜单渲染（mock 响应 → 双视图）。全绿为回归出口。
- **AC-15（P0）七套既有全绿 + 新增 E2E 用例 + 0-diff 红线**：`qa-e2e-jsdom` 补用例——OVER 触发提交（fetch spy 恰 1 次、载荷全字段）、昵称首弹→持久化→自动带出、触发后修改昵称生效、file:// 管线降级（无入口节点、0 fetch 调用）、榜单面板渲染与总榜/周榜切换（mock）；**游戏引擎与红线**：`game.js`/`audio.js` 0 行 diff、onSfx 事件面 0 变化、VERSION 三模块（game/ui/audio=2.3.0）与 persist 模块版本/PAYLOAD_VERSION 全不动、persist.js 仅新增 deviceId/nickname 键与出口（既有 stats 载荷/load/saveStats 0 改动）；`verify-game`/`verify-audio`/`verify-persist`/`verify-constants` 0 行 diff；`assembly-check` 仅按 AC-9 调整审计并新增装配锚点断言；`qa-e2e` 仅新增用例不改既有断言。**八套全绿（七套既有 + verify-leaderboard），不加后门**。
- **AC-16（P0）file:// 双击仍可完整游玩**：发布形态与本地双击均验证完整游玩（开始→游玩→OVER→重开，离线全程可用、无「全网榜」入口、0 报错），与现状一致。
- **AC-17（P1）文档契约同步**：README 增联网榜说明与「已知取舍」（离线无榜/Phase 1 折中校验）；r37 任务夹产物（TECHNICAL/QA-REPORT/ACCEPTANCE）落定「联网才有全网榜、离线体验不变、assembly 审计白名单例外」契约；历史任务夹不修改。
- **AC-18（P1）人工补测清单（留产品验收）**：真机（iOS/Android）联网提交与榜单渲染、断网/弱网（飞行模式/慢网）提交静默与入口隐藏、首次昵称弹窗交互、设置改昵称后提交生效、榜单视觉与玻璃风一致性、读屏（入口/面板/昵称输入语义）、周榜换周/滚动边界、FPS 与面板开关性能、（部署后）真实线上 CORS 正反例 curl 抽查。

## 3. 范围与非目标

- **范围**：前端——新增 `leaderboard.js`（身份/提交/榜单/降级）+ `index.html`（装配 + 设置入口/昵称修改 + 榜单面板挂载）+ `persist.js`（新增 deviceId/nickname 键与出口）+ `ui.js`/`style.css`（入口与面板最小接线/样式，技术方案裁定）+ 后端——产品根独立目录 Worker 工程（路由/KV/校验/限流/CORS）+ 三脚本（新增 `verify-leaderboard.cjs`、`assembly-check.cjs` 审计按 AC-9、`qa-e2e-jsdom.cjs` 补用例）+ 任务夹文档。
- **非目标**：不做账号体系/登录/第三方登录；**不做服务端重放校验（Phase 2，本期仅协议版本号预留 + anomaly 标记扩展点）**；不做榜单分页（仅 Top 20）、不做地区/好友等多维度榜、不做玩家间交互（点赞/评论）；不改既有计分/等级/速度数值与引擎行为（0-diff）；产品根不引入 package.json/构建链/前端框架/前端依赖；KV/Worker 不做多机房/多键分区（免费档够用）；**离线对局不排队补传**（离线无榜，数据自然丢失，符合设计）；不改既有七套脚本的既有断言（assembly 审计口径调整除外，见 AC-9）。

## 4. 交互流程摘要

1. **联网游玩**：页面加载 → leaderboard.js 启动 → persist 读 `deviceId`（无则生成并保存）→ 正常游玩（引擎 0 感知）。
2. **OVER 提交**：OVER 且 score>0 → 若昵称缺失：弹出昵称输入（一次，校验/清洗，持久化后继续）→ 组装载荷（protocolVersion=1）→ POST /api/score；失败静默（至多 1 次退避重试），不打扰、不重复。
3. **看榜**：设置中（弹层或侧栏，UI 裁定）打开「全网榜」面板 → GET /api/leaderboard → 渲染总榜（默认）/周榜 Top 20，可切换；失败显示「暂不可用」占位。
4. **改昵称**：设置中「修改昵称」→ 持久化 → 下一局提交生效。
5. **离线/file://**：protocol 非 http/https 或 fetch 失败 → leaderboard.js 禁用态：「全网榜」入口与面板静默隐藏、0 fetch、0 报错——本地游玩流程与现状逐字一致。

## 5. 优先级

- **P0**：AC-1 ~ AC-16（模块与装配、自动提交与静默、身份、榜单展示、降级红线、assembly 审计调整、后端全套、verify-leaderboard、七套回归与 0-diff、file:// 回归验证）。
- **P1**：AC-17（文档契约同步）、AC-18（人工补测清单）。
- **P2**：无（Phase 2 重放校验另立需求）。

## 6. 依赖与风险

- **依赖**：persist.js `tetris.*` 键址与出口惯例（AC-4/5 只增键）；ui.js 设置弹层装配点（入口/昵称挂载）；game.js onGameOver 事件出口（只读消费，0 行改动）；GitHub Pages 已部署（背景成立）。
- **风险**：① KV 免费档写配额（约 1,000 次/日）——限流（AC-12）+ 失败静默兜底，峰量超配额仅排行榜短暂不可用、不影响游玩；② 速度上界公式可能误杀极高手速/专注 T-spin 的玩家——anomaly 标记不入榜、Phase 2 重放校验接管；③ CORS/域名白名单配置错误导致线上榜不可用——部署验收含 curl 正反例（AC-18）；④ Worker 部署域名与前端 API 基址常量不一致——单一常量 + assembly 白名单钉死同一值、部署 checklist 同步；⑤ 昵称白名单误伤（emoji/生僻字）——白名单明确不含 emoji，简化优先（Phase 2 可扩）；⑥ 弱网提交丢失——静默可接受，属 Phase 1 折中边界（已在非目标声明）。

## 7. 里程碑建议

- **M1 后端**：Worker 独立目录工程——两路由 + KV 总榜/周榜 + 校验/限流/CORS；worker 冒烟（本地 mock/curl 正反例）。
- **M2 前端**：leaderboard.js（身份/提交/榜单渲染/降级）+ index.html 装配与设置入口/昵称 + ui.js/style.css 最小接线 + persist 新键。
- **M3 测试收口**：verify-leaderboard 全绿 + qa-e2e 新用例全绿 + assembly 审计改后全绿 + 既有七套零回归 + file:// 回归验证。
- **M4 部署与验收**：Worker 部署上线 + 线上 CORS/提交/榜单实测 + README/任务夹协同契约 + 人工补测（AC-18）+ 产品验收；验收通过后按流程合回 main（用户确认时机）。

## 8. 工程约束

- 产品根保持**零构建扁平纯 JS**（不引入 package.json/构建链，代码形态与 UMD 契约不变）；所有新前端代码仅以 `leaderboard.js` 单一 UMD 模块形式进入产品根。
- **后端 Worker 工程放独立目录**（具体结构由技术方案裁定），与产品根解耦、独立部署（Cloudflare Workers + KV 免费档），不进入前端交付物。
- **维持全部既有回归脚本全绿**：verify-game/verify-audio/verify-ui/verify-persist/verify-constants 既有断言零改动（0 行 diff）；assembly-check 仅按 AC-9 调整审计口径并新增装配锚点断言；qa-e2e-jsdom 仅新增用例。
- **file:// 双击仍可完整游玩**，离线体验与现状完全一致（AC-8/AC-16）。
- **分支与提交基线**：当前分支 `feat/global-leaderboard`（HEAD 87c81f3，含 r36 全量已提交）；未提交改动仅 untracked 任务夹 `docs/teamflow/20260904-r37-global-leaderboard/`（含本 PRD 及后续产物，随本需求提交，不入业务代码）；实施基于 r36 提交之上进行；验收通过后合回 main 的时机经用户确认（沿袭 r35/r36 流程）。