# 验收报告 — r37 全网排行榜功能（Phase 1）

- 任务夹：docs/teamflow/20260904-r37-global-leaderboard/
- 验收依据：本夹 PRD.md（AC-1~18，P0=AC-1~16，P1=AC-17~18）
- 基线依赖：docs/teamflow/20260904-r36；取代：r36#AC-5（assembly 自包含审计「0 http(s) 引用」→「仅 API 域白名单例外」）
- 基线提交：`feat/global-leaderboard` @ 87c81f3，工作树未提交改动 = 本次交付（含 D1/D2 修复轮）
- 验收方式：QA-REPORT + 独立对抗抽查复核 + 本验收对红线/契约锚点的独立 spot-check（git diff / 白名单正则三处同式 / API 单源 / worker Retry-After / 日志打点）

## 1. 验收结论（依证据）

QA 九套全绿（game 157 / audio 24 / ui 66 / constants 2 / persist 30 / assembly ALL PASSED / verify-leaderboard 21 / qa-e2e 628 / worker smoke 29）+ QA 独立对抗 53/53（本验收复核日志尾行确认 53 passed, 0 failed）。红线独立复核：`git diff --stat game.js audio.js` 与五套既有 verify 脚本均为空；VERSION 三模块 2.3.0、PAYLOAD_VERSION=1 未动；persist 纯增量（仅 deviceId/nickname 键 + saveDeviceId/saveNickname/sanitize* 出口）。

## 2. 逐条 AC 核对

| AC | 判定 | 证据 |
|---|---|---|
| AC-1 UMD 模块与装配 | ✅ | leaderboard.js UMD 工厂 + api/dispose；index.html 在 ui.js 后内联装配前引入；assembly §3/§6/§6c 锚点断言 |
| AC-2 OVER 自动提交 | ✅ | 载荷 7 字段 + protoVer=1、score>0 才提交、单局恰一次（同定格对象去重/restart 不重入）、失败退避至多 1 次后静默；qa-e2e fetch spy 恰 1 次 |
| AC-3 失败静默 | ✅ | 链路 catch 不 throw、退避 1 次后放弃、无弹窗无 console 错误；独立抽查网络失败/429 均 2 次后静默 |
| AC-4 设备 UUID | ✅ | generateDeviceId UUID v4；persist tetris.deviceId 键（saveDeviceId 出口、禁裸 setItem）；降级会话内内存不 throw；独立抽查 50 次生成均合法 |
| AC-5 昵称首弹一次+持久化+可改 | ✅ | 首弹门槛恰 1 次、白名单清洗/非法剔除/空拒（#nm-error 不关闭）、saveNickname 持久化、设置可改下一局生效 |
| AC-6 GET 双视图 | ✅ | 总榜+周榜 Top20、面板切换默认总榜、失败降级占位不阻塞；mock 渲染断言 + 独立抽查 7.10/7.11 |
| AC-7 视觉与可访问性 | ✅ | 玻璃风沿用 DESIGN token（.lb-*/.nm-* 纯追加、复用 overlay-in/reduced-motion）；aria-label 标注（细项入 AC-18 读屏人工项） |
| AC-8 file:// 断网静默降级 | ✅ | 非 http(s) 或 fetch 不可用 → degraded：入口/面板静默隐藏、0 fetch；qa-e2e file:// 真实管线完整游玩零报错 |
| AC-9 assembly 白名单例外 | ✅ | §5 负断言仅放行 leaderboard-api.michaelshii.workers.dev；其余文件任何 http(s) 仍判失败；§6c 装配锚点（createLeaderboard 导出/degraded 标记）；本验收复核 API_HOST 与 leaderboard.js API_BASE 同源 |
| AC-10 Worker 独立工程+两接口 | ✅ | worker/ 独立目录独立部署；POST /api/score + GET /api/leaderboard；KV 总榜/周榜（ISO 周滚动）Top20；smoke + 独立抽查三键写入 |
| AC-11 服务端折中校验 | ✅ | 昵称 trim→白名单→截 12→空 400；anomaly（速度上界）→400 且 entry:/board: 零写入；protoVer≠1→400（独立抽查确认） |
| AC-12 限流 | ✅ | 设备 20/10min + IP 60/10min（RATE_LIMITS 单一事实源）；超限 429 且 Retry-After=600（D1 修复后双分支均带，本验收复核 index.js 两处） |
| AC-13 CORS 白名单 | ✅ | 仅 https://michaelshii.github.io（403 无 ACAO）；Origin:null 403；OPTIONS 正确；独立抽查三态通过 |
| AC-14 verify-leaderboard.cjs | ✅ | 新增脚本 21/21，mock fetch 覆盖载荷/0 分/恰一次/清洗/deviceId/降级/静默/渲染 |
| AC-15 七套既有全绿+E2E+0-diff | ✅ | 五套 verify 0 行 diff（本验收 git diff 复核为空）；qa-e2e 仅新增用例（628，既有断言零改动）；八套全绿无后门 |
| AC-16 file:// 完整游玩 | ✅ | 发布形态与本地双击真实管线完整游玩（开始→游玩→OVER→重开）零报错、无入口、0 fetch |
| AC-17 文档契约同步 | ✅ | README 第 19 条+「已知取舍」+AC-08 口径改行+八套验证命令+项目结构（D2 修复复核通过）；历史任务夹未修改 |
| AC-18 人工补测清单 | ✅ 达成（留跟进） | 真机/读屏/换周/线上 CORS 等 8 项清单已列（QA §5）；环境限制（Worker 未部署、KV id 占位符）非交付缺陷，部署后须跟进 |

## 3. M3 架构一致性（独立复核）

- **Blueprint 遵循**：TECH `<!-- blueprint -->` 存在；按模块对照——/persist.js 增量键（序 1）✓、/ui.js 两弹层工厂+接线（序 4）✓、/leaderboard.js UMD 纯逻辑无 DOM（序 5）✓、/index.html 纯追加+内联装配（序 6）✓、/style.css 独立类族纯追加 ✓、verify-leaderboard（序 8）✓、worker 独立目录 ✓。装配序 persist→audio→game→ui→leaderboard→createUI 由 assembly §6 断言。
- **重复实现判定**：昵称白名单正则三处（leaderboard/persist/worker）已确认逐字同式、测试交叉覆盖（独立抽查 7.x + persist 侧同规断言）；serv 端复制系零构建扁平结构无法共享常量的必然，客户端复制为注释明示的「双保险」——均属 TECH D3 记载的有意文档化重复，非结构漂移，不构成返工项。P3 提示记录在案（见 §4）。
- **存储事实源/抽象**：persist.js 仍为唯一存储事实源；saveStats/formatSessionTime 收敛未回退；dispose 链（leaderboard/ui 双侧）完整；未发现适配器漂移或破坏既有结构。

## 4. 意见与遗留（非阻断）

- **P3 提示**（随 QA 记录，不阻断交付）：① 白名单正则三处复制靠人工盯同步（TECH D3 已文档化）；② leaderboard.js 内 POST/GET 两处 fetch 超时包装可抽 fetchJson 局部简化。
- **部署前置（交接项）**：worker/wrangler.toml KV id 占位 `REPLACE_WITH_KV_NAMESPACE_ID` 部署时替换；部署后核对 API_BASE 三处同源（leaderboard.js / assembly §5 API_HOST / worker README）并执行 AC-18 线上 curl 正反例；真机人工补测清单（AC-18）在部署后完成。
- **合流**：本需求验收通过，按既定流程由用户确认后由 host 将 `feat/global-leaderboard`（业务代码+任务夹+worker/ 一次提交）合回 main。
- **Phase 2**：服务端重放校验已列入 memory.md 已知待办，protocolVersion=1 与 anomaly 扩展点已预留。

## 5. 判定

P0（AC-1~16）全部满足、P1（AC-17~18）达成；红线（engine 0-diff、VERSION/PAYLOAD_VERSION 不动、file:// 离线体验逐字不变）核验通过；M3 架构符合 blueprint、无返工项；无 P0~P2 缺陷。AC-18 真机/线上项为环境限制的部署后跟进项，非交付缺陷。

验收结论：✅ 通过