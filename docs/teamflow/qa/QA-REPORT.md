# 俄罗斯方块（Tetris）简化版 — QA 测试报告（v2.4 · ghostY 非法入参防御 · OBS-12-1 关闭）

- **被测交付**：`products/tetris/` v2.4（AC-12.12 引擎 `ghostY` 入参防御，对齐 TECHNICAL §6.2 E-12-08，关闭 OBS-12-1，P3 健壮性/文档-实现对齐）
- **测试执行**：2026-08-18，QA 独立复核
- **验收唯一依据**：PRD v2.4 §2（AC-01 ~ AC-14 + 追加 AC-12.12）、§9 验收总则
- **上一版**：v2.3（已归档 `QA-REPORT-v2.3.md`）

---

## 0. 结论（先行）

**✅ 达到可验收标准（QA 侧判定）**：AC-12.12（E-12-08 / OBS-12-1 关闭）文档-实现对齐缺口已补齐，六套验证全绿（**52 / 19 / 7 / 装配 / 188**，E2E 188），AC-01~14 回归底线全绿，无 P0/P1/P2 缺陷。防御分支不改合法路径（独立断言合法落点 102/102 幂等一致）。**1 项 P3 观察项 OBS-12-2（非阻断，超出本次 E-12-08 文档验收范围的额外健壮性建议）登记**。无新增玩家可见功能，代码相关人工补测项沿袭 v2.3/v2.2 清单（环境限制，非交付缺陷）。

---

## 1. 测试范围与环境

- **范围**：本次变更 = `game.js` `ghostY` 入参防御；`verify-game.cjs` 断言 51→52；TECHNICAL §6.2 标注、memory/AGENTS 状态同步。回归 = AC-01~14 全量底线。
- **环境**：Node v22.22.3，Windows。沙箱**禁止启动带 CDP 的真实浏览器**（Playwright/Puppeteer/chromedriver 一律策略拒绝）→ 真实浏览器自动化不可行，按产品约定走 jsdom DOM 级 E2E + 静态/单元验证路径。
- **验证命令**（产品根，输出重定向至 `logs/teamflow/tf-msytlok5-08oeu5/`）：
  - `node scripts/verify-game.cjs`（引擎 52 项）
  - `node scripts/verify-audio.cjs`（19 项）、`node scripts/verify-ui.cjs`（7 项）
  - `node scripts/verify-constants.cjs`（VERSION 一致 + 文档对账）、`node scripts/assembly-check.cjs`（装配/自包含/音频审计）
  - `node scripts/qa-e2e-jsdom.cjs`（188 项 DOM E2E + file:// 管线）
  - QA 独立对抗脚本（`qa-adversarial2.cjs`，102 断言 + 超范围观察）

## 2. 用例与结果

| 用例组 | 结果 | 说明 |
|---|---|---|
| verify-game（52）| ✅ 52/52 | 含 E-12-08 新用例（rot=-1/4/5/100、未知 type、piece null）|
| verify-audio（19）| ✅ 19/19 | 音效引擎回归 |
| verify-ui（7）| ✅ 7/7 | UI 契约回归 |
| verify-constants | ✅ 通过 | 三模块 VERSION `'2.3.0'` 一致（未强制升版，符合技术方案）；文档口径对账无漂移 |
| assembly-check | ✅ 通过 | 装配顺序 audio→game→ui、自包含、0 音频文件 |
| qa-e2e-jsdom（188）| ✅ 188/188 | DOM E2E + file:// 管线；页面加载无全局 error |
| **AC-12.12 防御语义** | ✅ 通过 | 见下节逐项 |
| **AC-01~14 回归底线** | ✅ 全绿 | verify-game/E2E 覆盖，合法路径零变化 |

### 2.1 AC-12.12 防御语义独立复核（对齐 E-12-08）

- `rot` 归一：`((rot%4)+4)%4`，`rot=-1/4/5/100` 及整数越界 `7/-7/13/-4/8/9` 全部归一后与 `rot∈{0..3}` 落点**逐一一致**（每 type 每 rot，102/102）。
- 未知 `type`：回退原样返回 `piece.y`，不抛错（null/123/''/'BOGUS'/{}/'x' 均不抛错）。
- `piece === null`/`undefined`：返回哨兵 `-1`（类型 number，不抛错）。
- 合法路径零变化：`collides`/`shapeOf` 未改动；空棋盘 7 type × rot 0..3 幂等一致（同入参落点稳定、返回类型 number）。
- 纯函数/零副作用：verify-game 已断言 ghostY 不改快照、不触发 onSfx。

### 2.2 QA 独立对抗（证明验证真实区分力）

对 `game.js` `ghostY` 防御逻辑做负向法思考：整数越界 `rot`（±越界）**该防御已覆盖且全绿**；`NaN`/小数/`undefined` `rot` 当前仍抛错（见 §3 OBS-12-2）——本次 E-12-08 文档已知用例为整数 `rot`，故不属本次验收缺口，但如实登记。

## 3. 发现的缺陷

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| OBS-12-2 | P3（观察项，非阻断） | 引擎 `ghostY` 入参防御 | `T.ghostY(board,{type:'I',rot:NaN/3.5/undefined,x:3,y:0})` | 不抛错、返回类型安全 number | `((rot%4)+4)%4` 对 NaN/小数/undefined 归不到 0–3，索引 `SHAPES[type][非整数]` 为 `undefined` → `collides` 抛 `Cannot read properties of undefined (reading 'length')` | AC-12.12（超文档已知用例，建议追加：归一前 `Math.trunc` 或 `Number.isInteger` 校验） |

> **注**：OBS-12-2 **不构成 P0/P1/P2 缺陷**——E-12-08/AC-12.12 已知用例明确为整数 `rot`（`-1/4/5/100`），合法流程 `rot` 为内部旋转计数器恒整数 0–3；且 v2.3 在整数越界 `rot` 下也抛错，v2.4 已修复该整数越界缺口。OBS-12-2 仅为超出本次文档范围的健壮性建议（P3，不阻断验收）。

**除 OBS-12-2 外：未发现 P0/P1/P2 缺陷。** OBS-12-1 已关闭（实现 + 文档 + 测试 + 状态同步四方一致）。

## 4. 人工补测清单（环境限制，非交付缺陷）

以下项涉及听感/像素/真实时序/真实多浏览器/读屏，当前沙箱禁用 CDP 真实浏览器无法自动实测，**不判失败**，供人工复核：

| # | 验收标准 | 验证方法 | 工具 | 说明 |
|---|---|---|---|---|
| A1 | 幽灵块可辨识度（AC-12.8）| 暗色玻璃基调下透明度 0.16/0.75、线宽 2、色相目测 | 真机浏览器截图 | 沿袭 v2.2 清单 |
| A2 | 旋转后复杂形状 I/S/Z 落点目测（AC-12.3）| 各旋转态幽灵与硬降固定位置对齐 | 真机 | 沿袭 v2.2 |
| A3 | 1920×1080 / 1366×768 双分辨率无错位（AC-12.8）| 幽灵与实体块/网格/面板对齐 | DevTools 设备模拟 | 沿袭 v2.2 |
| A4 | 相邻边界可辨识（AC-12.11）| 低/高堆积场景 | 真机 | 沿袭 v2.2 |
| A5 | 刷新及时性/性能（AC-12.10）| 移动/旋转/软降幽灵刷新 ≤100ms、含幽灵 FPS≥55 | Performance 采样 | 沿袭 v2.2 |
| A6 | 幽灵块开关可访问性（AC-13.1/13.5）| Tab 聚焦、:focus-visible、aria 读屏 | NVDA/VoiceOver | 沿袭 v2.3 |
| A7 | 开关回合中切换即时生效（AC-13.3）| PLAYING 中点击 ≤100ms 显/隐切换 | 真机 | 沿袭 v2.3 |
| A8 | 计分规则真机复核（AC-14）| 硬降不加分、消行公式、软降不加分 | 真机 | 沿袭 v2.3 |
| A9 | 开关状态会话保持（AC-13.4）| 结束→重开不变、刷新恢复默认 | 真机 | 沿袭 v2.3 |

> 本期 v2.4 无新增玩家可见功能，故未新增人工项；沿袭项与 v2.3/v2.2 验收清单一致。

## 5. 测试产物

- `logs/teamflow/tf-msytlok5-08oeu5/qa-verify-game.log`、`qa-verify-audio.log`、`qa-verify-ui.log`、`qa-verify-constants.log`、`qa-assembly.log`、`qa-e2e.log`、`qa-adversarial2.log`、`qa-adversarial.log`
- 对抗脚本：`logs/teamflow/tf-msytlok5-08oeu5/qa-adversarial2.cjs`

---
*QA 测试工程师独立复核记录（v2.4）。上一版 QA 报告归档至 `docs/teamflow/qa/QA-REPORT-v2.3.md`。*
