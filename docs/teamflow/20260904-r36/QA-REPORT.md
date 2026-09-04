# QA-REPORT — r36 移除整个「本局统计」块（#session-stats 卡）

- **需求**：删除 `#session-stats` 整卡（含已放置/对局时长两行 + session-announce 播报），信息面板收敛为两组（「对局统计」stat-grid 四块 +「全局统计」global-stats 四行）。
- **基线**：main（HEAD 7f7e827，r34+r35 已合回）；工作区改动 = index.html / ui.js / style.css / verify-ui.cjs / qa-e2e-jsdom.cjs 五文件 + untracked r36 任务夹。
- **测试日期**：本次交付。
- **范围**：功能 + 契约/断言清除 + 红线保持 + 轻量架构检查。

## 一、范围与环境

| 项 | 值 |
|---|---|
| 分支 | main |
| 变更面 | index.html、ui.js、style.css、scripts/verify-ui.cjs、scripts/qa-e2e-jsdom.cjs（共 5 文件，94+/373−） |
| 红线文件 | game.js / audio.js / persist.js + verify-game/audio/persist/constants + assembly-check.cjs = 0 行 diff |
| VERSION | game/ui/audio 三模块 2.3.0（一致） |
| 验证方式 | 七套脚本（Node/jsdom）+ 独立对抗抽查 qa-r36-independent（45/45）+ 源码扫描 |

## 二、验证结果

### 1. 七套全绿（AC-9，全部 0 fail）

| 套件 | 结果 |
|---|---|
| verify-game | 157/157 pass |
| verify-audio | 24/24 pass |
| verify-persist | 30/30 pass |
| verify-constants | 2/2 pass |
| verify-ui | 66/66 pass |
| assembly-check | ALL CHECKS PASSED |
| qa-e2e-jsdom | 587/587 pass |

### 2. 独立对抗抽查（qa-r36-independent，非交付脚本，自建锚点）

共 45/45 通过，覆盖：
- **整卡删除证明（删除非隐藏）**：index.html 全文 `id="session-stats"`/`#ss-placed`/`#ss-time`/`#session-announce`/`#ss-lines` 均为 -1；`.session-stat` 恰 0；file:// jsdom 装配后 `#session-stats`/`#ss-placed-value`/`#ss-time-value`/`#session-announce` 均 === null。
- **信息面板恰两组**：`#stat-grid` 内 `.stat` 恰 4（r17 基线）、`#global-stats` `.global-stat` 恰 4；源序 stat-grid 闭合 < global-stats 开 < hold-well 开。
- **ui.js 契约**：`createSessionStats`/`sessionStats` 残留 0；`formatSessionTime` 与 `createGlobalStats` 保留并正确导出（createGlobalStats 为 function、createSessionStats 为 undefined）。
- **触控/最高分/消行基线**：`#touch-controls .tkey` 恰 6（r16/r27）、`#hi-score` 存在（最高分唯一通道）、`#lines` 存在（本局消行唯一）。
- **红线**：game/audio/ui VERSION 均 2.3.0。
- **全局统计四行字段齐全**：gs-placed/gs-lines/gs-time/gs-games 四 value 均存在。

### 3. 逐项 AC 核对

- **AC-1**（整卡删除、两面板组、源序）✓ 通过（源码 + DOM 装配双层证明）。
- **AC-2**（ui.js 组件与接线全清，保留 global-stats）✓ 通过（createSessionStats 全清；createGlobalStats 装配/must/dispose/导出保留）。
- **AC-3**（verify-ui r32 session 断言删除、其余逐字保留）✓ 通过。
- **AC-4**（qa-e2e session 用例删除、其余保留）✓ 通过。
- **AC-5**（assembly-check 锚点）✓ 通过（assembly-check.cjs 0 行 diff，本就无 session 锚点；持久化 API 检查保留）。
- **AC-6**（全局统计持久化语义逐字不变）✓ 通过（verify-persist 30/30、qa-e2e r34/r35 数据通道全绿；persist 0 行 diff）。
- **AC-7**（stat-grid HUD 零改动）✓ 通过（`.stat` 恰 4、`#hi-score`/`#lines` 保留）。
- **AC-8**（红线 0 diff）✓ 通过（game/audio/persist + verify 四脚本 + assembly 全 0 行；VERSION 2.3.0）。
- **AC-9**（七套全绿零回归）✓ 通过。
- **AC-10**（任务夹文档契约）✓ 本 QA-REPORT 落定此契约。
- **AC-11**（P1 人工补测）→ 见「人工补测清单」。

## 三、人工补测清单（环境限制，非交付缺陷）

> 本项为纯展示删除（无新增视觉/交互），jsdom 已验证 DOM 结构（恰两组、无第三组、`#session-stats` 删除）。下列真实浏览器/实机读屏与手感项无法在本沙箱自动验证，留产品验收：

| 验收项 | 验收标准 | 方法/工具 | 备注 |
|---|---|---|---|
| 横屏双轨布局 | 信息面板两组（对局/全局）无第三组、无叠压 | 真机横屏目检 | 环境限制 |
| 竖屏 S 行式布局 | 两组卡片在 #main areas 内就位，mini-grid 高度无回归 | 真机竖屏目检（<600px） | 环境限制 |
| 桌面 M/L / 键鼠 | 与删卡前一至两组布局合理、无空隙劣化 | 桌面浏览器目检 | 环境限制 |
| 读屏朗读 | 「本局统计」播报消失；两组数据（分数/最高分/等级/消行 + 全局四项）正常播报 | 屏幕阅读器 | 环境限制 |
| r34/r35 复用 | 真机切后台/清后台/刷新不丢/暂停不计/旧存档迁移/双轨竖屏叠压 | 真机复核 | r34/r35 补测项复用 |

## 四、缺陷表

未发现缺陷。

## 五、结论

**交付通过，验收就绪。** 信息面板已按 r36 契约收敛为两组（stat-grid 四块 + global-stats 四行），`#session-stats` 整卡（含两行 + session-announce）已删除（删除非隐藏，源码与 DOM 双层证明），ui.js/verify-ui/qa-e2e 相关消费与契约全清，global-stats 持久化与 stat-grid HUD 逐字保留；红线（game/audio/persist 0 行、VERSION 2.3.0、onSfx 面 0 变化）确认保持。七套全绿（157/24/30/2/66/assembly PASSED/587），独立抽查 45/45。无功能缺陷；AC-11 真机/读屏项留产品验收（环境限制，非交付缺陷）。

## 附：架构检查（规则项 0，M3 门禁）

- **无重复存储封装**：`persist.js` 为唯一存储事实源（createStorage 探测 + saveStats/load 单一入口，SANITIZE 兜底）；ui.js 仅经 `persist.saveStats`/load 消费，无散落 setItem/getItem。✓
- **全局统计唯一事实收敛**：`saveStats` 只增不减累加收敛于 persist 层；UI 端 `createGlobalStats` 只读镜像，无独立累计。✓
- **`formatSessionTime` 单例共享**：删卡后仍为唯一纯函数，供 `createGlobalStats` 累计时长复用，无副本。✓
- **受控重复（既有沿袭，非新增）**：`createGlobalStats` 与 `createHud` 的 `flash` 小段（≤8 行）属 r32/r34 已接受的受控重复，本需求未新增同类重复。✓
- **结论**：无重复抽象/未提取抽象/结构破坏，架构合格。
