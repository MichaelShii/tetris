# docs/teamflow/memory.md — 产品记忆与待办

> 维护者：TeamFlow 流水线。本文件是**产品约定层**（ADR-0008）：只记录跨需求长期有效的信息——团队约定、技术栈、已知待办。
> 每个需求的完整产物在各自任务夹 `docs/teamflow/<yyyyMMdd>-rN-slug>/` 内；**本文件不再承载「当前迭代记忆」**（2026-08-25 收敛：原 v2.3~v2.9 七段重复内容已并入下方迭代索引，细节见各版本 history 快照 / QA-REPORT / git log）。

## 团队约定与技术栈

- **形态**：零构建自包含静态 Web 应用（双击 `index.html` 即玩，离线可用）；UMD 模块 `game.js`（引擎）/ `ui.js`（装配+渲染）/ `audio.js`（音效+BGM）/ `persist.js`（持久化），index.html 内联装配。
- **视觉**：科技玻璃风（DESIGN §5 token）；信息面板开关控件统一交互模式（幽灵块 AC-13 / BGM AC-15 / 踢墙 AC-19 对齐）。
- **持久化**：`persist.js` 是唯一事实来源（localStorage 键 `tetris.*` 前缀，能力探测失败降级内存 Map 绝不 throw）；`ui.js` 只消费 `load/saveHighScore/saveSettings`，禁止直接 setItem/getItem。
- **验证**：七套脚本 = `verify-game` / `verify-audio` / `verify-ui` / `verify-persist` / `verify-constants` / `assembly-check` / `qa-e2e-jsdom`；回归出口标准 = 七套全绿、不加后门。
- **版本号语义（2026-08-25 起）**：模块头部 `VERSION` 是**发布版本**——仅对外发版时统一升位；流水线迭代不碰代码头版本，文档迭代以任务夹为单位（不再使用全局递增版本号管理文档）。
- **工程指令**：分支/提交类要求由 PRD「工程约束」小节承载，开发先执行动作再写码。
- **输入（r16 起）**：触屏为新增输入通道——触屏键合成键盘事件复走 game.js 既有 held/DAS/软降 repeat 时钟与 keyAction 语义（零新速率常量、引擎零改动），`html.has-touch` 纯 CSS 显隐。已知权衡（QA D1，验收接受）：触屏与键盘同键交错共享 held 槽，任一通道 keyup 会冲掉另一通道长按 repeat——「逐键等效回放器」设计的必要推论，非缺陷、不改动。

## 迭代索引

> 一行一版；详细验收记录在各 run 的 QA-REPORT / ACCEPTANCE 与 `docs/teamflow/history/v<版本>/` 快照。

| 版本 | 日期 | 需求 | 结果 |
|---|---|---|---|
| v1.0 | 2026-08-16 | 简易俄罗斯方块：闭环玩法、计分、难度升级、科技玻璃风 | ✅ 交付完成 |
| v2.0 | 2026-08-16 | 音效系统（七类合成音效）+ 音量/静音控制 | ⚠️ 有条件通过；人工补测待完成 |
| v2.1 | 2026-08-16 | 暂停/继续快捷键（P 双向 / 空格继续 / OVER 重开） | ⚠️ 有条件通过；人工补测待完成 |
| v2.2 | 2026-08-16 | 幽灵块落点预览（ghostY 纯函数 + 半透明渲染） | ⚠️ 有条件通过；P3 观察项 OBS-12-1（后由 v2.4 关闭） |
| v2.2-tc | 2026-08-16 | tech：新增 verify-constants.cjs 自检脚本 | ✅ 关闭；P3 OBS-TC-1 文档口径（已更正关闭） |
| v2.2-hotfix | 2026-08-16 | patch：README 标点热修（斜杠→顿号） | ✅ 交付完成 |
| v2.2-hotfix-2 | 2026-08-16 | patch×3：README 全角空格复核（初判+两轮复核） | 📝 需求不适用（U+3000 不存在），需求关闭 |
| v2.3 | 2026-08-18 | 幽灵块开关（AC-13）+ 移除硬降加分 dropBonus（AC-14） | ⚠️ 有条件通过；开关可访问性/计分人工补测待完成 |
| v2.3.1 | 2026-08-18 | visual：方块辉光收敛（shadowBlur 10→5） | ✅ 无遗留 |
| v2.4 | 2026-08-18 | ghostY 非法入参防御（OBS-12-1 关闭）；新登记 OBS-12-2 | ✅ 通过（52/19/7/装配/188） |
| v2.5 | 2026-08-18 | BGM 背景音乐（AC-15）：合成旋律 + 开关 + 音量联动 | ⚠️ 有条件通过（tf-mszkunr9）：遗留 TECHNICAL 补 BGM 契约 + B1~B9 人工补测 |
| v2.6 | 2026-08-18 | tech：持久化层 persist.js（AC-16 最高分 + 四设置恢复） | ❌打回→✅修复后通过（tf-mt317a5e）：BUG-P1-1 适配器漂移已修 |
| v2.8 | 2026-08-24 | 无踢墙旋转系统（AC-18）：碰撞保持原位 + `wall-kick-denied` | ✅ 通过（tf-mt5afdch，分支 feat/v2.8-no-wallkick） |
| v2.7 | 2026-08-24 | 7-bag 随机算法（AC-17）：袋内 Fisher-Yates、每 7 块全覆盖 | ✅ 通过（tf-mt417ope，56 用例含 7-bag 契约组） |
| v2.9 | 2026-08-25 | 踢墙旋转开关（AC-19）：默认开=踢墙偏移表，关=v2.8 行为 + 开关持久化 | ✅ 通过（tf-mt85o5jj，197/197 e2e）；P3：verify-constants 存量漂移（见待办） |
| v3.0 | 2026-08-25 | 设置弹层毛玻璃风格（AC-1~8）：设置项从左面板移出至齿轮图标触发的模态框，按分组展示 | ✅ 通过（r9 + 人工热修后全绿：装配时序修复 + E2E 五缺陷收口，236/236） |

## 已知待办

- **verify-constants 版本断言对齐**：脚本硬编码 `EXPECTED_VERSION='2.3.0'`，而 TECHNICAL §2.2 已随 v2.9 重写为踢墙偏移表（场外既有漂移，非某轮引入）。建议一次性裁定发布版本号（如统一升 '2.9.0' 并同步三模块头部 + TECHNICAL §2.2 + 脚本期望值），使七套回归全绿。
- **TECHNICAL.md 补 BGM 契约章节**（v2.5 遗留文档缺口）：BGM_DEFS（bpm96/triangle/peak0.16/14 音 C 大调/lookahead 调度/独立 bgmVoices 池/masterGain 汇入/dispose 无泄漏）落盘供追溯。
- **人工补测汇总（环境限制非缺陷）**：各轮 QA-REPORT §6/§7 清单——音效听感/时序、B1~B9 听感视觉读屏、幽灵块暗色可辨识度/双分辨率、开关可访问性与即时性、快捷键时序、r16 真机触屏补测 R1~R10（真机能力检测/防滚动缩放/375×667+812×375 布局遮挡/刘海安全区/真实多指/长按速率手感/触屏笔记本混合设备/桌面零视觉变化/按键音效听感/D1 跨通道真机复验，详见 r16 QA-REPORT）等，待有真实浏览器环境时集中补测。
- **测试增强（P3 建议）**：qa-e2e 补 AC-09.6 显式断言（首次交互后 AudioContext resume 恰好 1 次）；`#btn-mute` 静音态 aria-label 动态切换「取消静音」。
- ~~**qa-e2e 测试桩缺口（v3.0）**~~ ✅ 已收口（人工热修，2026-08-25）：spy 补 startBgm/stopBgm 代理；key() 改 document 派发（贴近真实冒泡链）；is-open 动画类断言等待 rAF；弹层 ESC 加 stopPropagation（不误触游戏暂停）+ 打开动画帧取消；file:// 管线新增 console.error「装配失败」回归断言；修复后 236/236 全绿。
- **OBS-12-2（P3 观察）**：`ghostY` 对 NaN/小数/undefined rot 归一不收敛会抛错（合法流程 rot 恒整数 0–3 不触发）；健壮性迭代可在归一前加 `Math.trunc` 校验。
- **设置弹层打开期间恢复键窗口（req-12 遗留，P3）**：req-12 打开弹层自动暂停后，弹层打开期间 window 键表的 P/空格（PAUSED=恢复）仍生效——弹层保持打开而游戏被恢复 RUNNING。E2E 仅覆盖「关闭后按空格 → RUNNING」恢复路径；是否在弹层打开期吞掉恢复键待下一需求裁定（当前按最小改动保持现状，验收 ✅ 通过）。
- **QA-13-01（r13 遗留，P3 观察）**：game.js `animMs` 引擎默认值(240)与 ui.js `ANIM_MS`(240)无跨模块一致性断言（对比 VERSION 有 verify-constants 钳制）；因 ui `createUI` 恒显式传 animMs 风险已钳制，建议后续测试增强轮统一补跨模块常量一致性断言。

## 说明

- 新需求的产物写入新任务夹 `docs/teamflow/<yyyyMMdd>-r<N>[-<slug>]/`（host 在流水线启动时自动建夹并命名；夹建后不可变，重试/续跑复用同夹）。
- 回归基线引用方式：新 PRD 头部声明「基线依赖：<既往任务夹名>」；行为变更用「取代：<某夹>#<AC>」标注——历史夹永不改动。
- backlog（需求/任务/缺陷）事实源：`$DSH_HOME/teamflow/<workspace>/`
- 运行日志：`logs/teamflow/<runId>/`
