# 俄罗斯方块（Tetris）简化版 — QA 测试报告（v2.5 · 背景音乐 BGM · AC-15）

- **被测交付**：`products/tetris/` v2.5（背景音乐 BGM：Web Audio 实时合成循环旋律 + 信息面板开关，AC-15，P0 本次交付项）
- **测试执行**：2026-08-18，QA 独立复核（run `tf-mszkunr9-qs3o6u`）
- **验收唯一依据**：PRD v2.5 §2（AC-01 ~ AC-15）、§5.4 BGM 规格、§9 验收总则
- **上一版**：v2.4（已归档 `docs/teamflow/history/v2.4/QA-REPORT.md`）

---

## 0. 结论（先行）

**✅ 达到可验收标准（QA 侧判定）**：v2.5 BGM（AC-15）实现与 PRD §5.4 逐条吻合，六套验证全绿（**52 / 23 / 7 / 2 / 装配ALL / 188**），回归底线 AC-01~14 不加后门全绿。QA 独立对抗抽查 **11/11**（BGM 静音/音量联动经 masterGain 链路、stopBgm 无残留、dispose 后 startBgm no-op）。AC-09.5 零音频文件审计、AC-08 自包含审计保持全绿。**无 P0/P1/P2 缺陷**；登记 1 项 P3 观察项 **OBS-BGM-1**（BGM 开关 UI 交互未在 E2E/verify-ui 层直接断言，非阻断，装配钩子与 audio 层已覆盖）+ **OBS-BGM-2**（模块 VERSION 未升 2.3.0，行为新增是否升版由产品验收裁定，非功能缺陷）。

---

## 1. 测试范围与环境

- **范围**：本次变更 = `audio.js`（BGM 合成引擎 `BGM_DEFS`/`startBgm`/`stopBgm`/`isBgmPlaying`，独立 `bgmVoices` 池 + masterGain 汇入）+ `ui.js`（`#btn-bgm` 开关接线 + dispose 解绑 + E9 防抢焦点）+ `index.html`（`#bgm-control`/`#btn-bgm` 装配）+ `style.css`（`#btn-bgm` 科技玻璃样式）+ `verify-audio.cjs`（补 4 条 BGM 契约）+ `assembly-check.cjs`（BGM 装配钩子）+ `README.md`（关闭 P2 BGM 项）。不改骨架状态机/`keyAction`/计分/数值/SFX 语义。回归 = AC-01~14 全量底线。
- **环境**：Node v22.22.3，Windows。沙箱**禁止启动带 CDP 的真实浏览器**（Playwright/Puppeteer/chromedriver 一律策略拒绝）→ 听感/像素/真实时序/真实多浏览器/读屏不可自动实测，按产品约定走 jsdom DOM E2E + 静态/单元/对抗验证路径；此类项列入 §4 人工补测，**不判失败**。

## 2. 用例与结果

| 用例组 | 结果 | 说明 |
|---|---|---|
| verify-game（52）| ✅ 52/52 | 引擎回归，AC-01~14 底线 |
| verify-audio（23）| ✅ 23/23 | 音效 19 + **BGM 契约 4 条**（默认关/启停+重开/dispose 无泄漏、独立 voice 池不受 SFX 并发上限、未解锁降级 0 报错、BGM_DEFS 合法）|
| verify-ui（7）| ✅ 7/7 | UI 契约回归 |
| verify-constants（2）| ✅ 2/2 | 三模块 VERSION `'2.3.0'` 一致（未强制升版，行为新增由验收裁定）|
| assembly-check | ✅ ALL PASSED | 含 **#bgm-control/#btn-bgm 装配钩子**、audio 导出面 `BGM_DEFS`、AC-08 自包含、**AC-09.5 音频审计 0 文件 / 无 `<audio>`** |
| qa-e2e-jsdom（188）| ✅ 188/188 + file:// | DOM E2E + file:// 管线；页面加载（含 BGM 开关 DOM）无全局 error |
| **QA 独立对抗 BGM** | ✅ 11/11 | 见 §2.1 |
| **AC-01~14 回归底线** | ✅ 全绿 | 不加后门，verify-game/E2E 覆盖 |

### 2.1 QA 独立对抗抽查（`qa-adversarial-bgm.cjs`，11/11）

验证测试套件未直接覆盖的链路：
- **静音联动（AC-15.9）**：`setMuted(true)` → masterGain.gain.value=0（BGM 随主链路静音）；取消 → 恢复 0.8 默认，无需重新 unlock。
- **音量联动（AC-15.8）**：`setVolume(0)` → BGM 无声；`setVolume(0.8)` → 恢复。
- **集成**：BGM 首个 loop 每音符 voice（osc+gain）实际创建并连 masterGain（合成 non-silent）。
- **停止无残留（AC-15.4）**：`stopBgm` 对全部 BGM voice 调 `stop`+disconnect。
- **dispose 后 startBgm** no-op、不抛错（无泄漏）。

## 3. 发现的缺陷

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| OBS-BGM-1 | P3（观察项，非阻断）| 测试覆盖 | BGM 开关 UI 交互（点击 `#btn-bgm` 触发 `startBgm/stopBgm`、aria 三信号同步）未在 verify-ui / qa-e2e-jsdom 层直接断言 | E2E 层补一条「点击开关 → audio 层调用」的定位断言 | 当前仅 assembly（DOM 选择器存在）+ verify-audio（audio 层契约）+ 代码审计（ui.js 接线正确）覆盖 | AC-15.3/15.14（建议后续 E2E 增强）|
| OBS-BGM-2 | P3（观察项，非阻断）| 版本 | 模块 `VERSION` 未升级（仍 `'2.3.0'`）| BGM 为行为新增，是否应升版（如 2.5.0）由产品验收裁定 | verify-constants 基线保持三模块一致 | 版本约定 |

> **除上述 2 项 P3 观察项外：未发现 P0/P1/P2 缺陷。** 两项均**不阻断验收**——AC-15 全部功能点均已实现并经代码审计 + 自动化验证 + 对抗抽查确认正确。

## 4. 人工补测清单（环境限制，非交付缺陷）

以下项涉及听感/像素/真实时序/真实多浏览器/读屏，当前沙箱禁用 CDP 真实浏览器**无法自动实测**，不判失败，供人工复核：

| # | 验收标准 | 验证方法 | 工具 | 说明 |
|---|---|---|---|---|
| B1 | BGM 开启 ≤500ms 可闻旋律（AC-15.3）| 首次交互后开 BGM，听歌词/节拍启动延迟 | 真机 Chrome 听测 | 新增（v2.5）|
| B2 | BGM 循环连续 ≥60s 无卡顿/无声空窗（AC-15.5）| 开 BGM 播放 60s，听循环连续性 | 真机 | 新增 |
| B3 | BGM 关闭 ≤300ms 停止无拖尾（AC-15.4 听感）| 关 BGM 听是否干净停止 | 真机 | 新增 |
| B4 | 音量/静音联动听测（AC-15.8/15.9）| 主音量 0%/静音 M 键/面板静音即时静 BGM、取消恢复 | 真机 | 新增 |
| B5 | 自动播放合规（AC-15.10）| 首次交互前开 BGM 不发声、DevTools Console 0 报错 | DevTools | 新增 |
| B6 | 双分辨率无错位（AC-15.1）| 1920×1080 / 1366×768 开关控件无遮挡 | DevTools 设备模拟 | 新增 |
| B7 | 开关可访问性（AC-15.14）| Tab 聚焦、:focus-visible、读屏可读 aria 状态 | NVDA/VoiceOver | 新增 |
| B8 | 状态保持（AC-15.13）| 结束→重开保持、刷新重置默认关闭 | 真机 | 新增 |
| B9 | 性能（AC-15.12）| BGM+高频操作 60s FPS≥55 | Performance 采样 | 新增 |

> 沿袭项（幽灵块可辨识/落点/计分规则等 v2.2~v2.4 清单）不减，属回归底线，见 history/v2.4 QA-REPORT §6。

## 5. 测试产物

- `scripts/` 六套验证全部 exit 0；QA 独立对抗脚本 `logs/teamflow/tf-mszkunr9-qs3o6u/qa-adversarial-bgm.cjs`（11/11）。
- 日志：`logs/teamflow/tf-mszkunr9-qs3o6u/qa-verify-{game,audio,ui,constants}.log`、`qa-assembly.log`、`qa-e2e.log`、`qa-adversarial-bgm.log`。

---

*QA 测试工程师独立复核记录（v2.5）。上一版 QA 报告归档至 `docs/teamflow/history/v2.4/QA-REPORT.md`。*
