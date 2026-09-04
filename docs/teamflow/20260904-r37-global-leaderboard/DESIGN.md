<!-- meta: summary="r37 全网排行榜设计：挂载裁定=设置弹层末尾追加『联网排行榜』组（昵称行+全网榜行，默认 hidden，激活才显示）+两个新弹层族（#leaderboard-modal 总榜/周榜 Top20 玻璃卡、#nickname-modal 昵称首弹/修改）；弹层互斥（开新弹层先关设置，避双焦点陷阱，关榜焦点回 #btn-settings）；榜单=名次/昵称/分数/等级/消行五列+加载/暂不可用(含重试)/空态；全部复用既有 token 与 @keyframes overlay-in，零新增 keyframe/token，新组件独立类名不动既有规则体；降级=两组行 hidden、弹层不可达、0 fetch。" -->
# r37 全网排行榜 Phase 1 — DESIGN（设置入口 + 排行榜弹层 + 昵称弹层）

## 0. 设计结论速览

- **挂载裁定（AC-7）**：入口放**设置弹层内新增组「联网排行榜」**（PRD 允许的「设置弹层或侧栏」二选一：侧栏即 `#panel-left` 已被两组统计占满、单屏布局零改，故选设置弹层）；榜单本体为**独立弹层 `#leaderboard-modal`**（与设置弹层同族玻璃卡，Top 20 列表需要纵向空间，叠在设置弹层内不可行——设置弹层体已是全屏滚动）。
- **三层新增 UI【新增·r37】**：① 设置弹层末尾**纯追加**一组 `.settings-group--leaderboard`（昵称行 + 全网榜行）；② `#leaderboard-modal`（总榜/周榜分段切换 + Top 20 列表 + 三态：加载/暂不可用/空）；③ `#nickname-modal`（昵称首弹一次/设置内修改，共用同一弹窗组件）。
- **降级（AC-8）**：`leaderboard.js` 判定 `location.protocol` 非 http/https 或 fetch 不可用 → `degraded=true` → 设置组两行 `hidden`、两弹层不可达、**0 次 fetch**；本地游玩与现状逐字一致。
- **红线落实**：零新增关键帧（弹层入场复用既有 `@keyframes overlay-in`）、零新增 token；新组件一律**独立类名**，既有规则体（`.settings-modal` 族 / `.stat-grid` / `.global-stats` 等）逐字不动；game/audio 0-diff。
- **弹层互斥（裁定）**：任何时点仅一个弹层激活——从设置打开排行榜/昵称弹层时**先关闭设置弹层**（复用其 close 路径），关闭排行榜后焦点回全局 `#btn-settings`（恒在、不会 hidden），避免双焦点陷阱与双 Escape 捕获。

## 1. 模块与信息架构

### 1.1 挂载裁定与理由（AC-7 落位）

| 候选 | 裁定 | 理由 |
|---|---|---|
| 侧栏（panel-left 内新卡） | ✗ | 信息面板已含对局统计 + 全局统计两组、左栏高度预算已满（r34 棋盘预算复核过），Top 20 列表无处可容 |
| 设置弹层内嵌榜单 | ✗ | 设置弹层体为全屏滚动卡，内嵌 20 行列表加剧滚动层级，且周榜切换控件与列表同屏会压缩设置区 |
| **设置弹层入口 + 独立排行榜弹层** | ✓ | 入口行低成本挂载；榜单弹层独立获得纵向空间（列表可滚）；降级钩子统一（入口行随设置组一起 hidden） |

### 1.2 信息架构（增量）

```
#settings-modal（既有弹层）
└─ .settings-modal__body
   └─ .settings-group--leaderboard 【新增·r37，纯追加于 body 末尾、按键设置组之后】
      ├─ 昵称行  role=group：stat__label「昵称」 + output #lb-nickname-value + btn#btn-edit-nickname「修改」
      └─ 全网榜行 role=group：stat__label「全网榜」 + btn#btn-open-leaderboard「查看榜单」

#leaderboard-modal.lb-modal 【新增·r37】背板 + 玻璃卡（dialog）
└─ 卡内：header（标题「全网排行榜」 + 关闭 ×）
   └─ body：.lb-tabs 分段（总榜 | 周榜） + ol#lb-list（Top 20 行 × 状态区 #lb-state）

#nickname-modal.nm-modal 【新增·r37】背板 + 玻璃卡（dialog）
└─ 卡内：header（标题「设置昵称」）+ body（label + input#nm-input + #nm-error + 取消/确定）

leaderboard.js（UMD，逻辑模块，无 DOM 家族）：
  身份（tetris.deviceId UUID + tetris.nickname）→ OVER 提交 → GET 榜单数据映射 → 弹层开合遥控 → degraded 判定
```

### 1.3 可见性矩阵（状态 × 元素）

| 状态 | 设置组两行 | #leaderboard-modal | #nickname-modal | fetch | 说明 |
|---|---|---|---|---|---|
| **激活态**（http/https + fetch 可用） | 可见 | 可打开 | 首弹/修改可打开 | 提交 + 开榜拉取 | 默认形态 |
| **禁用态**（file:// 或 fetch 不可用） | `hidden` | 保持 `hidden` 不可达 | `hidden` | **0 次** | AC-8：不渲染不留占位不报错；两弹层 DOM 在但不可见不可聚焦 |
| 打开中·加载 | 可见 | 打开，`#lb-state` 显示「加载中…」 | — | GET 1 次 | 每次打开拉取（Phase 1 不做轮询） |
| 打开中·失败/超时/4xx/5xx | 可见 | `#lb-state` 显示「暂不可用」 + 重试钮 | — | — | AC-6：占位不崩溃、不阻塞游戏 |
| 打开中·空榜 | 可见 | `#lb-state` 显示「暂无成绩，快去创造纪录」 | — | — | 周榜换周时天然出现 |

## 2. 线框描述

### 2.1 设置弹层新增组【新增·r37】（纯追加，`.settings-group--keys` 闭合之后）

```html
<div class="settings-group settings-group--leaderboard" id="lb-settings-group" hidden>
  <h3 class="settings-group__title">联网排行榜</h3>
  <div class="settings-group__content">
    <div class="lb-name-row" role="group" aria-label="昵称设置">
      <span class="stat__label">昵称</span>
      <output id="lb-nickname-value" class="lb-nickname-value" aria-live="polite">未设置</output>
      <button type="button" id="btn-edit-nickname" class="btn btn--secondary">修改</button>
    </div>
    <div class="lb-entry-row" role="group" aria-label="打开全网排行榜">
      <span class="stat__label">全网榜</span>
      <button type="button" id="btn-open-leaderboard" class="btn btn--secondary" aria-label="打开全网排行榜">查看榜单</button>
    </div>
  </div>
</div>
```

- `label` 沿用 `.stat__label`（与音量/开关各行同构）；`output` 显示当前昵称或「未设置」，修改后即时刷新。
- **默认 `hidden`**，由 `leaderboard.js` 激活态移除（禁用态保持，天然满足 file://「无入口」）。
- 行式排版：label 左、控件右——与 `.audio-controls` / `.ghost-control` 既有行式对齐（**不进既有卡化/行式选择器**，独立 `.lb-*` 规则，r34 惯例）。

### 2.2 #leaderboard-modal【新增·r37】（弹层族骨架，镜像 `.settings-modal` 骨架构型）

```html
<div id="leaderboard-modal" class="lb-modal" hidden>
  <div class="lb-modal__backdrop"></div>
  <div class="lb-modal__card" role="dialog" aria-modal="true" aria-label="全网排行榜">
    <div class="lb-modal__header">
      <h2 class="lb-modal__title">全网排行榜</h2>
      <button type="button" class="lb-modal__close" aria-label="关闭排行榜">×</button>
    </div>
    <div class="lb-modal__body">
      <div class="lb-tabs" role="group" aria-label="榜单视图">
        <button type="button" class="lb-tab" data-view="total" aria-pressed="true">总榜</button>
        <button type="button" class="lb-tab" data-view="weekly" aria-pressed="false">周榜</button>
      </div>
      <ol id="lb-list" class="lb-list"></ol>
      <div id="lb-state" class="lb-state" hidden></div>
    </div>
  </div>
</div>
```

- 行骨架（由 `leaderboard.js` 渲染，每行一个 `<li>`，五列网格）：
  ```html
  <li class="lb-row">
    <span class="lb-rank" aria-label="第 1 名">1</span>
    <span class="lb-name" aria-label="昵称 玩家甲">玩家甲</span>
    <span class="lb-score" aria-label="分数 12000">12000</span>
    <span class="lb-level" aria-label="等级 8">8</span>
    <span class="lb-lines" aria-label="消除 60">60</span>
  </li>
  ```
- 不渲染列头行（五列语义由每单元格 `aria-label` 承担，节省高度、避免多余 DOM）；`durationMs` 在载荷中但不展示（AC-6 只要求名次/昵称/分数/等级/消行）。
- `#lb-state` 承载三态文本与「重试」钮（`<button class="btn btn--secondary">重试</button>`，点按重发 GET）；重试失败仍显「暂不可用」。
- 挂载位置：`index.html` **脚本之前**的弹层容器区（`#settings-modal` 之后、`#touch-controls` 之前），与 settings-modal 同约定——createUI 装配期即可 must() 校验。

### 2.3 #nickname-modal【新增·r37】（同一弹层族骨架）

```html
<div id="nickname-modal" class="nm-modal" hidden>
  <div class="nm-modal__backdrop"></div>
  <div class="nm-modal__card" role="dialog" aria-modal="true" aria-labelledby="nm-title">
    <div class="nm-modal__header">
      <h2 id="nm-title" class="nm-modal__title">设置昵称</h2>
    </div>
    <div class="nm-modal__body">
      <label for="nm-input" class="nm-label">昵称（1–12 字符，字母数字或中文）</label>
      <input id="nm-input" class="nm-input" type="text" maxlength="12" autocomplete="off" spellcheck="false">
      <p id="nm-error" class="nm-error" role="alert" hidden></p>
      <div class="nm-actions">
        <button type="button" id="nm-cancel" class="btn btn--secondary">取消</button>
        <button type="button" id="nm-confirm" class="btn btn--primary">确定</button>
      </div>
    </div>
  </div>
</div>
```

- 首个文本输入件——独立 `.nm-input` 样式（项目无既有 input 样式可复用），视觉用既有 token 拼装（见 §4.2）。
- 打开者：① 首弹——OVER 且 score>0 且无昵称（提交前置门槛）；② 设置内「修改」——预填当前昵称。
- 白名单清洗（trim → 剔除非可打印 ASCII/非 CJK → ≤12）客户端先行（AC-5，与服务端同规则）；清洗后为空 → `#nm-error` 显示「昵称不能为空」并**不关闭**；取消 → 关闭且本次不上榜（静默）。

### 2.4 档位

- **桌面 / M**：两弹层卡宽 `min(92vw, 420px)`，水平垂直居中，`max-height: min(80vh, 560px)`，`.lb-modal__body` / 列表区 `overflow-y:auto`（复用 settings-modal 卡滚动条样式写法，独立类名）。
- **S 竖屏（portrait <600）**：卡宽 `min(94vw, 420px)`、卡高 `min(86vh, 600px)`——与设置弹层同档（r9 阈值沿继承）；列表行高不变、横向不溢出（§4.3 核对）。
- **S 横屏 / 横屏双轨**：排行榜/昵称弹层与设置弹层同为 overlay 层，被 r30 旋转锁屏遮罩（`#rotate-overlay`）覆盖属既定行为，**不新增轨道内布局**（沿 r34 §2.4 声明）。
- 触屏：两弹层按钮均为 `≥44px` 可点目标（`--tpad-key` 结论沿承：`.lb-tab` / `.nm-actions` 按钮高度 `--fs-md` 行高 + padding 达标，尺寸核对见 §4.3）。

## 3. 交互与动效

### 3.1 交互流程

- **打开排行榜**：设置弹层 → 点「查看榜单」→ 关设置弹层（既有 close 路径）→ 开 `#leaderboard-modal` → 焦点落 `.lb-modal__close`（镜像 settings-modal 约定）→ 触发一次 GET；其间 `#lb-state` 显示「加载中…」；成功 → 渲染列表、隐藏 `#lb-state`；失败 → 「暂不可用」+ 重试。
- **关闭排行榜**：关闭 × / 背板点击 / Esc → 焦点回全局 `#btn-settings`（设置弹层已关、恒在元素）。
- **视图切换**：点击 `总榜`/`周榜` → 互斥 `aria-pressed`，用已有响应数据重渲染当前视图（一次 GET 已含双视图，切换**零网络请求**）。
- **昵称首弹（提交前置门槛，裁定）**：OVER 且 score>0 且无昵称 → 开 `#nickname-modal`（覆盖 OVER 态棋盘）；确定且合法 → `saveNickname` 持久化 → 提交本次成绩；取消 → 关闭且**本次不上榜**（静默，下次 OVER 仍无昵称则再弹——「一次」口径 = 单局只弹一次、不叠加不重复触发）。失败重试（≤1 退避后放弃）不重复弹窗。
- **设置内改昵称**：点「修改」→ 预填打开同一弹窗；确定 → 立即持久化（AC-5「修改即持久化、下一局提交生效」）；该局已提交的不回溯重提。
- **全链路静默**：提交成功/失败均无 toast、无 console 报错（AC-3）；仅昵称首弹是唯一主动 UI。

### 3.2 动效（零新增关键帧）

| 元素 | 动效 | 来源 |
|---|---|---|
| 弹层入场（背板 + 卡片） | 复用既有弹层入场（`@keyframes overlay-in` + `.is-open` 门控，r9 设置弹层同款） | 复用 |
| 列表行 / 名次变化 | **无动画**（避免逐行进场开销与新风格族） | 静态 |
| 周榜/总榜切换 | 无动画，即时换渲染 | 静态 |
| 昵称错误提示 | 无动画（文本出现） | 静态 |
| 昵称行值更新 | 无动画（低频、仅设置内） | 静态 |

- `prefers-reduced-motion: reduce`：新弹层复用同一入场关键帧与 `.is-open` 门控，沿既有 reduce 处理（TECH 复核使新弹层落入既有 reduce 规则或镜像其 `animation:none`）。

## 4. 视觉规格

### 4.1 Token 复用（零新增 token，r29/r31/r32/r34 惯例）

`--glass-bg`（+ `blur(20px) saturate(140%)` 玻璃配方）、`--line`（卡描边/行分隔）、`--radius-md`（卡角）、`--bg-deep`/`--surface`（背板）、`--ink`（标题/值）、`--muted`（label/名次）、`--primary`/`--primary-hi`（选中 tab/焦点）、`--accent`（前三名次）、`--danger`（错误文本）、`--font-ui`（昵称/行名）、`--font-mono` + `tabular-nums`（分数/等级/消行/名次）、`--fs-xs/sm/md/lg`、`--sp-1/2/3`、`--z-overlay-bg`/`--z-overlay-card`（弹层层级，DOM 序压过其他 overlay 即可）、`--glow-accent` 可选（榜首名次辉光，克制使用）。

### 4.2 组件规格【新增·r37】（独立类名，不进入既有选择器列表）

- `.lb-modal` / `.nm-modal`：背板 `--bg-deep` 淡化 + 玻璃卡四件套（`--glass-bg` + blur/saturate + `--line` 描边 + `--radius-md`）；`.is-open` 门控与设置弹层同构；卡内滚动条沿用 `.settings-modal__card::-webkit-scrollbar` 写法（独立选择器副本）。
- `.lb-tabs`：分段容器（`--sp-2` gap）；`.lb-tab` 底 = `--surface` 底 + `--line` 描边 + `--radius-sm`；`aria-pressed="true"` 态 = `--primary` 文字 + `--primary` 描边（或 `--primary-glow` 轻辉光），沿用 keycap `aria-pressed` 先例（`[aria-pressed="true"]` 选择器写法，独立类目）。
- `.lb-row`：`display:grid; grid-template-columns: 3ch 1fr auto 2ch 3ch; gap: var(--sp-2); align-items:baseline;`；行内距 `--sp-1 --sp-2`；行分隔 `--line` 1px（非最后行）；hover/focus-visible 背景淡提（`--surface` mix，不新增色）。
- `.lb-rank`：`.lb-rank--top`（名次 ≤3）`--accent` + 加粗（可加 `--glow-accent` 微光）；其余 `--muted` `--fs-sm`。
- `.lb-name`：`--fs-sm` `--ink`，`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`（≤12 字不折行）。
- `.lb-score/.lb-level/.lb-lines`：`--font-mono` + `tabular-nums` `--fs-sm`，右对齐。
- `.lb-state`：`--fs-sm` `--muted` 居中 + 内距 `--sp-4`；重试钮普通 `.btn--secondary`。
- `.nm-input`：`width:100%`；`--surface` 底 + `--line` 描边 + `--radius-sm` + `--sp-2` 内距；`--ink` 文字 `--fs-md`；`:focus-visible` 描边 `--primary-hi`。
- `.nm-error`：`--danger` `--fs-xs`，`margin-top: var(--sp-1)`。
- 设置组行：`.lb-name-row` / `.lb-entry-row` 内容行式（label 左 + 值 + 钮右），`#lb-nickname-value` 用 `.lb-nickname-value` 独立类（`--fs-sm` `--ink`，未设置为 `--muted`）。

### 4.3 尺寸核对（写死前验算）

- 五列：名次 3ch(≈22px) + 昵称 ≤180px(12 CJK×15px) + 分数 mono 7ch(≈54px) + 等级 2ch(≈16px) + 消行 3ch(≈24px) + 3×gap(24px) ≈ **320px ≤ 380px**（卡 420 − 2×20 内距）✓；S 竖屏 94vw(≈355px@375) − 40 ≈ 315px，昵称列弹性收缩 + ellipsis ✓。
- 弹层高度：header ≈48 + tabs ≈40 + 列表 `max-height: min(56vh, 420px)` ≈ 508px ≤ `min(80vh,560px)` ✓。
- 触屏命中：`.lb-tab` 高 = `--fs-md` 行高 + `--sp-2`×2 ≈ 40px——**不足 44px**，触屏档（`html.has-touch`）下调至 ≥44px（沿用 `--tpad-key` 类媒体查询门控，独立规则）✓；`.nm-actions` 按钮沿既有 `.btn` 高度（≥44px）✓。
- 昵称输入：字号 `--fs-md`(15px) + 内距，命中 ≥44px ✓。

## 5. 可访问性

- **dialog 语义**：两弹层卡 `role="dialog" aria-modal="true"` + `aria-label`（排行榜）/ `aria-labelledby`（昵称弹窗标题）；打开时焦点入卡（排行榜→关闭钮；昵称→输入框），关闭时还原（排行榜→`#btn-settings`；昵称→触发钮），Esc 关闭（镜像 settings-modal `onSettingsModalKeyDown` 模式，各自独立绑定）。
- **焦点陷阱**：两弹层各自 trap Tab（镜像 ui.js r9 既有 `trapTab` 实现；**弹层互斥**保证同刻仅一个陷阱生效——从设置打开新弹层先关设置）。
- **视图切换**：`.lb-tabs` `role="group"` + 两按钮 `aria-pressed`（沿 keycap 开关先例，**不用 tablist**——避免引入新角色语义与焦点管理复杂度）；aria 与视觉态同源（同一 `[aria-pressed]` 选择器）。
- **列表**：`<ol class="lb-list">` 天然序号语义；每行各单元格带 `aria-label`（第 N 名/昵称/分数/等级/消除），**不加 `aria-live`**（列表按需打开呈现，无即时推送——AC-7「适度」红线，防读屏刷屏）。
- **昵称输入**：可见 `<label for>` + `maxlength=12`；错误 `#nm-error role="alert"` + 输入框 `aria-describedby`（错误出现时挂）；清洗在输入时即时做（非法字符按键即剔除），提示文案「昵称不能为空」读屏可及。
- **对比度**：沿用既有 token（label `--muted` / 值 `--ink` / 错误 `--danger` 均通过既有对比度基线）；名次 unranked 用 `--muted`、Top3 用 `--accent`（黄金 4.5:1 于深底可读，沿用既有 accent 用途）。
- **禁用态**：file:// 下两行 `hidden` ⇒ 不在 Tab 序/读屏树；两弹层 `hidden` 不可达；**0 fetch**（可在 DevTools/verify 断言计数）。
- **prefers-reduced-motion**：新弹层入场沿既有 reduce 处理（§3.2）；焦点/状态变化零动画。

## 6. 改动面与契约（意图层，TECH 细化）

| 文件 | 改动（意图） |
|---|---|
| `index.html` | 纯追加：① 脚本序 `ui.js` 之后增 `<script src="./leaderboard.js">`（内联装配之前，AC-1）；② 弹层容器区追加 `#leaderboard-modal` / `#nickname-modal` 空卡（脚本前入 DOM，装配期 must() 可校验）；③ `.settings-group--keys` 后纯追加 `.settings-group--leaderboard`（默认 hidden） |
| `style.css` | 纯追加独立规则：`.lb-modal/.nm-modal`（同族玻璃卡 + `overlay-in` 复用 + `.is-open`）、`.lb-tabs/.lb-tab`、`.lb-row/.lb-rank(+top)/.lb-name/.lb-score/.lb-level/.lb-lines`、`.lb-state`、`.lb-name-row/.lb-entry-row/.lb-nickname-value`、`.nm-label/.nm-input/.nm-error/.nm-actions`、触屏 ≥44px 门控；**既有规则体零改** |
| `ui.js` | 【新增】`createLeaderboardPanel(els, api)` / `createNicknamePrompt(els, api)`（签名平行 `createHud` → `{…, dispose}`；开合/焦点陷阱/Esc 镜像 settings-modal 模式）；装配锚点 `must()`×N（#lb-modal/#nm-modal/#btn-open-leaderboard/#btn-edit-nickname/#lb-nickname-value/#lb-list/#lb-state/#nm-input 等）；设置弹层开新弹层先关（互斥）；`dispose` 对称清理；**既有组件逻辑零改** |
| `leaderboard.js`（新） | UMD `window.TetrisLeaderboard`：身份（deviceId 生成+持久化经 persist 出口、nickname 读写）、OVER 提交（单局恰一次、score>0、失败静默）、GET 双视图数据映射、degraded 判定（协议/fetch 探测，禁用态隐藏设置组两行、不渲染、0 fetch）；工厂 + `dispose`，能力探测降级不 throw（persist.js 风格） |
| `persist.js` | 仅增键/出口：`tetris.deviceId`/`tetris.nickname` + `saveDeviceId/saveNickname`（经既有 load/save 通道；既有 stats 载荷 0 改动） |
| 验证 | `verify-leaderboard.cjs` 新增（AC-14）；`assembly-check` 按 AC-9 改白名单审计 + 装配锚点断言；`qa-e2e-jsdom` 仅新增用例（AC-15）；**既有七套既有断言期望零改动** |
| `game.js` / `audio.js` | **0 行 diff**（只读消费 onGameOver；无引擎改动） |

## 7. 风险与验收备注

- **双弹层焦点**：互斥裁定已消解双陷阱；TECH 需确保「设置开 → 新弹层开」时序内无焦点窗口。
- **首弹取消语义**：取消 = 放弃本次提交（静默），与离线无榜语义自洽；QA 断言按「单局恰一次弹窗、取消不上榜、无昵称下局再弹」口径。
- **榜单空/失败态**：不阻塞、可重试、可关闭；重试循环命中限流（429）→ 仍显「暂不可用」（静默，无计数提示）。
- **验证口径**：file:// 断言「入口不可见且不可聚焦、0 fetch」（DOM 保留 hidden 或移除由 TECH 裁定，QA 以可观测行为断言）。
- **P1 人工补测**（AC-18 留存）：读屏朗读两弹层与昵称输入语义、iOS/Android 真机弹层键盘弹出与高度、弱网切换视图、Top3 名次样式一致性。

<!-- state -->{"phase":"design","summary":"r37 设计定稿：挂载裁定=设置弹层末尾纯追加『联网排行榜』组（昵称行+全网榜行，默认 hidden，激活才显示）+独立排行榜弹层 #leaderboard-modal（总榜/周榜分段 aria-pressed 切换、Top20 五列网格 名次/昵称/分数/等级/消行、加载/暂不可用+重试/空三态，打开即拉取零轮询、切换零请求）+ #nickname-modal（首弹=OVER 且 score>0 且无昵称的提交前置门槛，取消=放弃本次提交静默；设置内修改预填即时持久化）；弹层互斥裁定（开新弹层先关设置→避双焦点陷阱，关榜焦点回 #btn-settings）；全部复用既有 token 与 @keyframes overlay-in、零新增关键帧/零新增 token、新组件独立类名不动既有规则体、触屏 ≥44px 门控、prefers-reduced-motion 沿既有 reduce；禁用态（file:///fetch 不可用）= 两行 hidden、弹层不可达、0 fetch；game/audio 0-diff、persist 仅增 deviceId/nickname 键。","memory":["r37 挂载：入口=设置弹层 .settings-group--leaderboard（纯追加于 keys 组后、默认 hidden）；榜单本体=独立弹层 #leaderboard-modal，与 #nickname-modal 共用弹层族骨架（backdrop+卡 role=dialog aria-modal、.is-open 门控、onSettingsModalKeyDown 式 Esc/陷阱镜像）","弹层互斥：从设置打开新弹层先关设置弹层，任何时点仅一个弹层激活；排行榜关闭后焦点回全局 #btn-settings（恒在，避免焦点丢失）；昵称弹窗取消=放弃本次提交（静默），无昵称下局再弹","榜单交互：总榜/周榜 aria-pressed 双钮（role=group 不用 tablist），一次 GET 含双视图切换零请求；打开即拉取不轮询；失败→#lb-state『暂不可用』+重试钮；空榜文案『暂无成绩，快去创造纪录』","视觉：零新增 token/keyframe——弹层入场复用 @keyframes overlay-in + --glass-bg blur(20px) saturate(140%) 四件套；Top3 名次 --accent 加粗、其余 --muted；分数/等级/消行 mono+tabular-nums；.nm-input 为首个文本输入件（独立类，--surface+--line 描边+--primary-hi focus）","可访问性：列表用 ol 天然序号+每格 aria-label、不加 aria-live（防刷屏）；昵称 label for + maxlength12 + role=alert 错误 + 输入时白名单即时剔除；触屏下 .lb-tab ≥44px（has-touch 门控独立规则）","改动面意图：index.html 纯追加（leaderboard.js 脚本位=ui.js 后内联前、两弹层空卡脚本前入 DOM、设置组）；style.css/ui.js 纯追加独立类与 createLeaderboardPanel/createNicknamePrompt（签名平行 createHud）；persist 仅增 tetris.deviceId/tetris.nickname+saveDeviceId/saveNickname；game/audio 0-diff","验证口径：file:// 断言入口不可见不可聚焦+0 fetch；首弹『单局恰一次』；取消不上榜；TECH 需复核新弹层落入既有 prefers-reduced-motion reduce 处理"]}<!-- /state -->