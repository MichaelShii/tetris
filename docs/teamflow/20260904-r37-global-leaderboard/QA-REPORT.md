# QA-REPORT — r37 全网排行榜功能（Phase 1 折中校验版）

- 基线依赖：docs/teamflow/20260904-r36；取代：r36#AC-5（assembly 自包含审计「0 http(s) 引用」→「仅 API 域白名单例外」）
- 任务夹：docs/teamflow/20260904-r37-global-leaderboard/（夹内 PRD AC-1~18 为验收依据：P0=AC-1~16，P1=AC-17~18）
- 基线提交：`feat/global-leaderboard` @ 87c81f3；工作树未提交改动 = 本次交付（含 D1/D2 修复轮）
- 测试日志：logs/teamflow/tf-mtmv0x8e-n8tqwr/qa2-*.log、qa2-independent.log（本 QA 复核轮）

## 1. 范围与环境

- 测试对象：leaderboard.js（新）、worker/ 后端（新）、persist.js（增量键）、ui.js（两弹层组件+接线）、index.html（脚本位/空卡/设置组/内联装配）、style.css（.lb-*/.nm-* 族）、assembly-check.cjs、verify-leaderboard.cjs（新）、qa-e2e-jsdom.cjs（r37 段）、README.md（D2 修复）。
- 环境：Windows，Node v22.22.3，jsdom E2E（file:// 真实管线），worker smoke + QA 独立抽查（mock KV + 真实 Request/Response），无真实外网/云端部署（Worker 未 deploy，KV id 为占位符 `REPLACE_WITH_KV_NAMESPACE_ID`）。
- 依据：PRD.md + TECHNICAL.md（本夹）；执行口径「联网才有全网榜、离线体验逐字不变」。

## 2. 执行结果（本复核轮全绿）

| 套件 | 结果 | 断言 |
|---|---|---|
| node scripts/verify-game.cjs | ✅ exit 0 | 157/157 |
| node scripts/verify-audio.cjs | ✅ exit 0 | 24/24 |
| node scripts/verify-ui.cjs | ✅ exit 0 | 66/66 |
| node scripts/verify-constants.cjs | ✅ exit 0 | 2/2（VERSION 三模块 2.3.0） |
| node scripts/verify-persist.cjs | ✅ exit 0 | 30/30 |
| node scripts/assembly-check.cjs | ✅ ALL CHECKS PASSED | §5 白名单负断言+装配锚点+§6c r37 段 |
| node scripts/verify-leaderboard.cjs | ✅ exit 0 | 21/21 |
| node scripts/qa-e2e-jsdom.cjs | ✅ exit 0 | 628/628（含 r37 段） |
| node worker/test/smoke.mjs | ✅ exit 0 | ALL PASSED (29) |

**QA 独立对抗抽查（本复核轮自建，非交付套件）**：logs/teamflow/tf-mtmv0x8e-n8tqwr/qa2-independent.mjs → **53/53 ALL PASSED**，覆盖：
- 导出契约：createLeaderboard/纯函数/常量（PROTOCOL_VERSION=1、API_BASE 单源 https 唯一登记）。
- 昵称清洗：CJK/ASCII（含空格 `_ - · .`）、≤12 通过；13 字/emoji/控制符/`<script>`/首字符符号/空拒；trim 先于校验；persist 侧同规。
- 载荷契约：7 字段（含 `protoVer=1`——TECH D2 钉名，PRD 概念名 protocolVersion，双端同式）；`durationMs===sessionTimeMs`（D4）；缺键→null。
- deviceId：50 次生成均为 UUID v4 且过 persist 清洗；persist 新键非法不写、合法往返、合并保留他键、旧载荷读回 null（向后兼容）。
- 决策树：无昵称首弹门槛恰 1 次、持态期 0 fetch；设昵称后提交恰 1 次 POST 全字段；同定格对象重复回调不重入（AC-2 单局恰一次）；新快照正常再提交；dispose 全短路；score=0 不弹窗不提交；网络失败与 429 均=初试+1 次退避重试共 2 次后静默、不 throw；degraded 0 fetch `{ok:false}`；拉榜 GET 成功透传。
- worker 独立复核：**D1 修复后**设备第 21 次/IP 第 61 次均 429 **且 Retry-After=600**（与 RATE_LIMITS.windowSecs 单一事实源一致）；CORS 三态（白名单 200+ACAO / 其它源 403 无 ACAO / Origin:null 403 无 ACAO）；anomaly→400 且 **entry:/board: 零写入**（rl: 限流计数键属预期）；protoVer=2→400；合法提交→200 + entry/board:all/board:week: 三键写入；榜单返回匿名化（无 deviceId/ts）；同设备更低分→200 `improved:false` 且榜内保留最高分。

## 3. 修复项复核（QA 打回 D1/D2 → 修复轮，本复核轮确认）

- **D1（P2，worker Retry-After）**：`worker/src/index.js` 两处 429 分支现均带 `Retry-After: String(RATE_LIMITS.*.windowSecs)`（600s）；smoke 升级设备第 21 次断言 + 新增 IP 第 61 次段并断言 Retry-After=600（29/29）；QA 独立抽查 7.1/7.2 复验通过。✅ 已修复
- **D2（P2，README 未同步）**：README 现含玩法第 19 条「全网排行榜（r37，联网启用）」+「已知取舍（r37）」节 + AC-08 行改口径「离线可玩、联网才有全网榜；http(s) 仅 API 域名白名单例外」+ AC-20 行 + 项目结构补 leaderboard.js/worker/verify-leaderboard + 「八套验证命令」含 verify-leaderboard（grep 锚点逐一核验）。✅ 已修复

## 4. 红线与架构核验（M3）

- 0-diff：`game.js`/`audio.js` 与五套既有 verify 脚本（verify-game/audio/ui/constants/persist）git diff 均为空；VERSION 三模块 2.3.0 未动；persist PAYLOAD_VERSION=1 未动、diff 纯增量 +80 行（仅 deviceId/nickname 键+清洗+两出口）。
- 改动面收口：index.html/ui.js/style.css/assembly-check/qa-e2e/README/persist/memory.md M + leaderboard.js/verify-leaderboard.cjs/worker//docs/teamflow/architecture/ 新增，与 PRD/交接声明一致。
- 蓝图（TECH `<!-- blueprint -->`）对照：/persist.js=增量键（顺序 1）✓、/leaderboard.js=UMD 纯逻辑无 DOM（顺序 5）✓、/ui.js=两弹层工厂+接线（顺序 4）✓、/index.html=脚本位+空卡+设置组+内联装配（顺序 6）✓、/style.css=独立类族纯追加 ✓、verify-leaderboard（顺序 8）✓——无偏差。
- 重复实现扫描：昵称白名单正则三处逐字同式（leaderboard/persist/worker）——「双端同规」契约下零构建扁平结构无法共享常量，属**有意的文档化重复**（TECH D3/§1.2），同步靠人工盯 → P3 提示；leaderboard.js 内 POST/GET 两处 fetch 超时包装（AbortController+8s）~15 行相似 → 可后续抽 fetchJson → P3 提示。**未发现重复安全包装/存储适配器漂移**；persist 仍为唯一存储事实源；worker 独立目录与 PRD「产品根零构建不扩至后端」裁定一致；dispose 链完整（leaderboard/ui 双侧）。

## 5. 人工补测清单（AC-18，留产品验收；环境限制，非交付缺陷）

| # | 验收项 | 方法/工具 | 说明 |
|---|---|---|---|
| 1 | 真机（iOS/Android）联网提交+榜单渲染 | 真机浏览器开发者工具/Network | 后端部署后 |
| 2 | 断网/弱网（飞行模式/慢网）提交静默+入口隐藏 | 真机 + 飞行模式/DevTools 节流 | |
| 3 | 首次昵称弹窗交互（含 emoji 剔除/取消不上榜） | 真机（触控输入法） | |
| 4 | 设置改昵称后下一局提交生效 | 真机 | |
| 5 | 榜单玻璃风一致性/面板开关性能（FPS）、面板视觉遮挡 | 真机目视 + DevTools Performance | 视觉判定项无法 DOM 断言，非交付缺陷 |
| 6 | 读屏语义（两弹层/昵称输入/aria-live） | iOS VoiceOver / TalkBack | |
| 7 | 周榜换周/滚动边界 | 真机 + 模拟时间或等待换周 | |
| 8 | （部署后）线上 CORS 正反例 curl | `curl -H "Origin: https://michaelshii.github.io"` 200 / `Origin: null` 403 | worker 未部署（KV id 占位符），部署后须核对 API_BASE 三处同源（leaderboard.js `leaderboard-api.michaelshii.workers.dev` / assembly §5 API_HOST / worker README） |

## 6. 缺陷表

| 编号 | 严重级(P0/P1/P2/P3) | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

**未发现缺陷**（P0~P2 全空）。上轮 QA 打回的 D1/D2 已按 §3 复核确认修复，未再复现。
架构提示（非缺陷，不阻断）：A1 昵称白名单正则三处文档化重复（同步靠人工盯，TECH D3 已记录）；A2 leaderboard.js 内 fetch 超时包装可抽 `fetchJson`（模块内局部，非本轮必须）。

## 7. 结论

- **P0（AC-1~16）全部满足，P1（AC-17~18）达成**：本复核轮九套全绿（game 157 / audio 24 / ui 66 / constants 2 / persist 30 / assembly ALL / leaderboard 21 / e2e 628 / worker smoke 29）+ 独立对抗 53/53；红线（game/audio/五套 verify 0-diff、VERSION 2.3.0、PAYLOAD_VERSION=1、persist 纯增量）核验通过；file:// 离线体验逐字不变（e2e 真实管线完整游玩零报错、0 fetch、入口隐藏）；D1/D2 修复复核通过；README 契约按 AC-17 同步。
- 判定：**验收就绪**。无 P0~P2 缺陷；A1/A2 为 P3 架构提示不阻断；AC-18 真机/部署后线上项列 §5 人工补测清单（环境限制非交付缺陷）。
- 交付提醒（非缺陷）：部署前置——worker/wrangler.toml KV id 占位 `REPLACE_WITH_KV_NAMESPACE_ID` 需在部署时替换；合回 main 待产品验收后用户确认（host 执行）。