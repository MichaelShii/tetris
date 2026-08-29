# TECHNICAL：触控操作区重设计（掌机十字 + 旋转簇 + 背景四方案）

<!-- meta: summary="r24 技术方案：S 竖屏 dock 双簇（左十字 3×3 + 右旋转簇）+ 标准/紧凑/横屏三档 CSS 媒体查询 + 背景四皮肤（DOCK_SKINS 单一事实来源、persist settings 包络 dockSkin 字段、sanitize 新增 string 枚举类型、外观组 radio 即时切换）+ 验证纯追加/1 处登记改写" -->

基线依赖：docs/teamflow/20260829-r23-back-to-back-multiplier（B2B 计分校准/toast 载荷全部不动）；触控层承继 r16（键盘回放器 TOUCH_KEYS / 三态 / 守卫）、r17（断点框架）、r19（S 一屏零滚动五行骨架）、r21（has-touch 门控 / 侧轨 z-order）、r9（设置弹层分组）。PRD：同任务夹 PRD.md（AC-1~15）；DESIGN：同任务夹 DESIGN.md（§4.2 尺寸表 / §4.3 四皮肤 / §6 改动面）。

**实施唯一视觉依据**：用户已评审设计稿 `docs/teamflow/drafts/20260829-touchpad-cross-design-draft.html`；本文件落实现契约，冲突时以 PRD AC 与设计稿为准。

---

## 1. 总览与工程约束（0-diff 红线）

| 文件 | 动作 | 约束 |
|---|---|---|
| index.html | 修改 | 双簇 wrapper + ✛ + 设置弹层「外观」组（纯 DOM，静态） |
| style.css | 修改 | 重写 .touchpad 布局块；新增三元尺寸 token / 紧凑媒体 / 四皮肤 / 作用域 |
| ui.js | 修改 | dockSkin 会话状态 + 即时切换 + 持久化接线 + DOCK_SKINS/applyDockSkin 导出 |
| persist.js | 修改 | sanitize 新增 string 枚举类型 + settings 包络 dockSkin 字段 + DOCK_SKINS 导出 |
| scripts/verify-ui.cjs | 修改 | **纯追加** §r24 断言段；既有断言 0 行改动 |
| scripts/qa-e2e-jsdom.cjs | 修改 | **纯追加** §r24 用例段；既有用例 0 行改动 |
| scripts/verify-persist.cjs | 修改 | **1 处登记改写**（往返用例补 dockSkin 字段，见 §7.2）+ 纯追加 |
| game.js / audio.js | **0 diff** | 红线（PRD §8.2）；VERSION 不动（§8.3，verify-constants 保持绿） |
| scripts/verify-game / verify-audio / verify-constants / assembly-check | 0 改动 | 七套全绿出口（AC-13） |

**代码形态与风格**：纯 JS UMD、工厂函数 + 闭包、纯函数优先、`dispose()` 统一清理——与既有 `createTouchControls` / `persistSettings` 段同构。所有新增断言按 r16/r21 先例「纯追加到文件尾部或独立 test 段」，旧期望零改动（AC-13）。

---

## 2. 数据模型与存储

### 2.1 持久化载荷（persist.js，AC-8）

存储键不变：`TETRIS_PERSIST_KEY = 'tetris.v2'`（既有 JSON 载荷）。**settings 包络新增字段 `dockSkin`**：

```js
// persist.js 顶部
const DOCK_SKINS = ['glass', 'float', 'fade', 'pod']   // 枚举单一事实来源（新导出面）
DEFAULT_SETTINGS → { ..., previewQueueEnabled: true, dockSkin: 'fade' }  // 默认 C 渐隐（AC-7/8）
```

- **readState / encode / saveSettings 三处同步增补 `dockSkin` 字段**；`PAYLOAD_VERSION` **不变**（纯增量字段：旧载荷缺该键 → readState 回默认 `fade`；新载荷被旧逻辑读取时多余字段被忽略——向后兼容，见裁定 D2）。
- **sanitize 新增 `string` 枚举类型**（纯扩展，既有 integer/float/boolean 分支与断言零改动）：

```js
if (schema.type === 'string') {
  const values = Array.isArray(schema.values) ? schema.values : []
  if (typeof value === 'string' && values.indexOf(value) !== -1) return value
  return def // 非法/缺失 → 回默认（AC-8 非法回退）
}
// 用法：sanitize(settings.dockSkin, { type: 'string', values: DOCK_SKINS, def: 'fade' })
```

- **单一事实来源链**：persist.js `DOCK_SKINS` ↔ ui.js `DOCK_SKINS` ↔ index.html 四 radio `value` —— verify-ui 交叉断言防漂移（沿 r16 TOUCH_KEYS 交叉先例）。
- 持久化通道语义不变：ui.js 仍是「旁观写回」（只在真实变更点调用 `saveSettings`，AC-8 与既有设置通道同源）。

### 2.2 会话状态（ui.js）

- 新增闭包 `let dockSkin = 'fade'`（createUI 内，与 ghostEnabled/bgmEnabled 同层）。
- **快照/引擎零耦合**：dockSkin 不进入引擎快照、不参与 pendingReward、不触发 renderAll（纯 class 切换，AC-7「引擎快照无漂移」由构造保证——没有任何引擎调用路径）。

---

## 3. 接口契约（API Design：UMD 面 + DOM 面）

### 3.1 persist.js 导出面（增补，全部向后兼容）

| 导出 | 变化 | 契约 |
|---|---|---|
| `DOCK_SKINS` | 新增 | `['glass','float','fade','pod']`（只读数组） |
| `DEFAULT_SETTINGS.dockSkin` | 新增字段 | `'fade'`（默认 C） |
| `sanitize` | 内部扩展 | 新增 `{ type:'string', values:[…], def }` schema；既有三个类型行为逐字节不变 |
| `load() / saveSettings(s)` | 载荷增补 | settings.dockSkin 枚举白名单清洗，非法/缺失 → `fade`；永远不 throw |

### 3.2 ui.js 导出面（增补）

| 导出 | 契约 |
|---|---|
| `DOCK_SKINS` | `['glass','float','fade','pod']`，与 persist.DOCK_SKINS 深等（verify-ui 交叉） |
| `applyDockSkin(el, skin)` | 纯函数：**全量移除**四皮肤类 `.touchpad--skin-*` 再添加 `.touchpad--skin-${skin}`（非枚举输入 → 不添加、返回 false）；幂等；供装配与测试复用 |
| `TOUCH_KEYS` / `createTouchControls` / `isTouchDevice` | **零改动**（AC-1/AC-6 红线；DOM 仅重组，`.tkey[data-action=…]` 选择器仍全部命中） |

### 3.3 DOM 契约（index.html）

**触控区（#touch-controls.touchpad，AC-1/AC-3）**——六 `.tkey[data-action]` 字面量/数量与 r16 一致、**零改名零重映射**；qa-e2e 既有断言（恰 6 个、data-action↔TOUCH_KEYS 集合全等、aria-label 全集）零改动即绿（DOM 顺序无既有断言，可随簇重排）：

```html
<div id="touch-controls" class="touchpad" aria-label="触屏操控区">
  <!-- 左十字簇：grid-template-areas ". up ." "lf hub rt" ". dn ."；源序 up→lf→rt→dn 恰落四区 -->
  <div class="tpad-cross">
    <button type="button" class="tkey tkey--dir" data-action="hardDrop" aria-label="硬降"><span class="tkey__icon">⤓</span><span class="tkey__label">硬降</span></button>
    <button type="button" class="tkey tkey--dir" data-action="moveLeft"  aria-label="左移"><span class="tkey__icon">◀</span><span class="tkey__label">左</span></button>
    <button type="button" class="tkey tkey--dir" data-action="moveRight" aria-label="右移"><span class="tkey__icon">▶</span><span class="tkey__label">右</span></button>
    <button type="button" class="tkey tkey--dir" data-action="softDrop"  aria-label="软降"><span class="tkey__icon">▼</span><span class="tkey__label">软降</span></button>
    <span class="tpad-cross__hub" aria-hidden="true">✛</span>   <!-- 纯装饰：无 data-action、pointer-events:none、grid-area:hub -->
  </div>
  <!-- 右旋转簇：纵列，Hold 上 / 旋转下 -->
  <div class="tpad-main">
    <button type="button" class="tkey tkey--hold"   data-action="hold"   aria-label="Hold 暂存"><span class="tkey__icon">📦</span><span class="tkey__label">Hold</span></button>
    <button type="button" class="tkey tkey--rotate" data-action="rotate" aria-label="旋转"><span class="tkey__icon">⟳</span><span class="tkey__label">旋转</span></button>
  </div>
</div>
```

**设置弹层「外观」组（静态 DOM，位于辅助组之后；AC-7/AC-14/AC-12）**：

```html
<div class="settings-group settings-group--appearance">
  <h3 class="settings-group__title">外观</h3>
  <div class="settings-group__content">
    <div id="dock-skin-control" class="ghost-control" role="group" aria-label="操作区背景">
      <span class="stat__label">操作区背景</span>
      <div class="dock-skin-control__list" role="radiogroup">
        <label class="dock-skin-option"><input type="radio" name="dock-skin" value="glass">A 玻璃 dock</label>
        <label class="dock-skin-option"><input type="radio" name="dock-skin" value="float">B 无底浮键</label>
        <label class="dock-skin-option"><input type="radio" name="dock-skin" value="fade" checked> C 渐隐托盘</label>
        <label class="dock-skin-option"><input type="radio" name="dock-skin" value="pod">D 双簇座舱</label>
      </div>
    </div>
  </div>
</div>
```

- **显示门控 = CSS（裁定 D3）**：`.settings-group--appearance { display:none }`（基座）+ `html.has-touch .settings-group--appearance { display:block }` —— 沿用 r16 touchpad「纯 CSS 显隐不重置对局」先例；「不渲染」= 不可见且不入可访问性树（display:none），非触屏桌面（has-touch=false，r21 判定）整组隐藏（AC-12）。元素恒在 DOM → ui.js `must()`/绑定恒可执行。
- 原生 radio 自带键盘可达 + radio 语义（AC-14），`:focus-visible` 走既有全局外环。

### 3.4 style.css token 面（AC-2/AC-15，裁定 D1）

| Token | 值 | 作用域 |
|---|---|---|
| `--tpad-key`（**保留**） | 3rem=48px | :root 基座 —— M/L 底栏键径 + 既有断言（qa-e2e 1642/1644/1647 零改动） |
| `--tpad-key-dir` | 标准 4rem=64 / 紧凑 3.5rem=56 / 横屏 3.5rem=56 | S 竖屏 media + landscape media 内覆写 |
| `--tpad-key-hero` | 标准 6rem=96 / 紧凑 5rem=80 / 横屏 5rem=80 | 同上 |
| `--tpad-key-hold` | 标准 3.5rem=56 / 紧凑 3rem=48 / 横屏 3rem=48 | 同上 |
| `--tpad-gap` | 标准 12px / 紧凑横屏 10px | 同上 |

**裁定 D1 说明**：DESIGN §4.1 要求 `--tpad-key` 单值→三元组；直接改名会击穿 qa-e2e 既有断言（1642 `--tpad-key: 3rem`、1644 `.tkey{width/height:var(--tpad-key)}`、1647 窄屏兜底）与 M/L `--dock-h` 算式（1504/1525 `calc(var(--tpad-key)+…)`）。**保留 `--tpad-key` 作 M/L 底栏与兼容别名，三元组仅在 S 竖屏/横屏作用域生效**——S 视觉与 DESIGN §4.2 完全一致，M/L 行为不变，三处既有断言零改动。基座 `.tkey` 仍写 `width/height: var(--tpad-key)`，键型覆写走 `.tpad-cross .tkey` / `.tpad-main .tkey--hold` / `.tpad-main .tkey--rotate`（选择器特异性高于基座，源序无关）。

---

## 4. 前端结构与装配

### 4.1 index.html（T1）

- 触控区：`#touch-controls` 内插 `.tpad-cross`（4 键 + hub）与 `.tpad-main`（2 键），六 `.tkey[data-action]` 原样迁移（文件 105~116 行区间整体替换为 §3.3 结构）；注释更新为 r24 契约说明。
- 设置弹层：`settings-modal__body` 辅助组之后追加 `.settings-group--appearance`（§3.3 结构）。
- 其余 DOM 零改动（统计/系统钮/棋盘/遮罩/图例）。

### 4.2 style.css（T2）—— 四个作用域块

1. **基座（媒体查询外）**：`.touchpad` 保留 gating 与布局原语（position:fixed、z-index、display:none、touch-action:none、tap-highlight、user-select、padding、safe-area inset），**容器视觉（background glass / backdrop-filter / border-top / box-shadow）迁出**——M/L 恒玻璃由基座承载，S 由块 2 覆写，横屏由块 3 覆写。既有 `html.has-touch .touchpad{display:flex}`、`@media (max-width:379px){--tpad-key:2.75rem}` 窄屏兜底**保留**（兼容断言；S 键径由簇规则裁决，无视觉冲突）。`.tkey` 组件三态规则整体保留（scale 由 0.96 改 0.94——设计稿定稿，DESIGN §3），辉光 `::before` opacity、hover:(hover:hover)、reduced-motion 全保留。
2. **S 竖屏（`@media (max-width:599px) and (orientation:portrait)`）**：`.touchpad{position:static}` 等 r19 规则保留；**新增** `.touchpad{background: 渐隐渐变（C 默认）; border-top:none; box-shadow:none; backdrop-filter:none}` + 两簇布局（`.tpad-cross` grid 3×3、`.tpad-main` 纵列）+ 键型尺寸覆写（`.tpad-cross .tkey`→dir、`.tpad-main .tkey--hold`→hold、`.tpad-main .tkey--rotate`→hero）+ `--tpad-gap:12px`。
   **紧凑档两条媒体查询（纯 CSS，无 JS，AC-4）**：
   - `@media (max-width:599px) and (orientation:portrait) and (max-width:359px)` → dir 3.5rem / hero 5rem / hold 3rem / gap 10px
   - `@media (max-width:599px) and (orientation:portrait) and (max-height:639px)` → 同上（OR 语义两分支同值，同时命中无冲突）
   （写作 `@media (orientation:portrait) and (max-width:359px)` 等更简；实现以设计稿与两分支语义为准，verify-ui 断言两分支存在。）
   320 验算（AC-4，注释入 CSS）：32 padding + 188 十字 + 80 右簇 + 16 簇距 = **316 ≤ 320** ✓。
3. **横屏侧轨（`@media (orientation:landscape)`，AC-10）**：重写为左轨 `.tpad-cross`（56 十字）+ 右轨 `.tpad-main`（Hold 48 上 / 旋转 80 下）；轨容器改 `::before/::after` 宽 `calc(3*var(--tpad-key-dir)+2*var(--tpad-gap)+2*12px) ≈ 212px`，贴 safe-area（`left/right: env(safe-area-inset-left/right)`、底 `calc(…+env(safe-area-inset-bottom))`）；键 `z-index:1` 盖轨（**r21 修复保留**）；轨道背景沿用 `rgba(35,35,45,.45)`+`--line` 描边（皮肤覆写见块 4）。
4. **四皮肤类（AC-7/AC-9/AC-15）**：**只写在块 2（S 竖屏）与块 3（横屏）内部**——`.touchpad--skin-glass`（--glass-bg+blur+上描边+投影）/ `-float`（去容器底，键帽自带投影）/ `-fade`（渐隐渐变，与块 2 默认同值，显式幂等）/ `-pod`（双簇各带主色径向光环托，伪元素静态 gradient）。**M/L（≥600px）块零新增** → 恒玻璃由构造保证（非源序依赖），皮肤类在 M/L 不存在的选择器天然不生效（AC-9 验证 = structure 断言 + git diff 审查）。

### 4.3 ui.js（T3）

在 createUI 中新增「外观」段（置于预览队列开关之后、设置弹层绑定附近，模式对齐 previewQueue 开关）：

```js
// 枚举单一事实来源（与 persist.DOCK_SKINS 交叉断言）
const DOCK_SKINS = ['glass', 'float', 'fade', 'pod']
// 纯函数：全量去旧类再添新类（防残留多类竞争）；非法输入不加类返回 false
function applyDockSkin(el, skin, skins) {
  if (!el) return false
  const set = skins || DOCK_SKINS
  ;(set).forEach(function (s) { el.classList.remove('touchpad--skin-' + s) })
  if (set.indexOf(skin) === -1) return false
  el.classList.add('touchpad--skin-' + skin)
  return true
}
```

1. **初始化**：`let dockSkin = 'fade'`；装配期在 `els` 收集后 `applyDockSkin(pad, dockSkin)`（pad 缺失即跳过——触控区可选，既有契约）。
2. **持久化恢复**：persist.load 恢复块（ui.js 1645~1674 区间）增补 `if (typeof st.dockSkin === 'string' && DOCK_SKINS.indexOf(st.dockSkin) !== -1) dockSkin = st.dockSkin`，随后 `applyDockSkin(pad, dockSkin)` + `syncDockSkin()`（同步 radio checked 态）。
3. **persistSettings() 增补** `dockSkin: dockSkin`（ui.js 1629~1642 区间）。
4. **即时切换**：`querySelectorAll('[name="dock-skin"]')` 绑定 `change` → `dockSkin = radio.value; applyDockSkin(pad, dockSkin); persistSettings(); syncDockSkin()`。**不重载、不重置对局、不触引擎**（AC-7）。
5. **dispose() 增补**：解绑 radio change 监听（沿既有 dispose 惯例）。
6. 导出面（ui.js UMD return 块）增补 `DOCK_SKINS` 与 `applyDockSkin`。
7. **#touch-controls 可缺失**：`root.querySelector('#touch-controls')` 已可为 null（r16 既有）——外观组/皮肤全链路在 pad 缺失时静默降级（皮肤类无处可挂即无效果，radio 仍可操作、仍持久化）。

### 4.4 persist.js（T4）

- 顶部：`const DOCK_SKINS = ['glass','float','fade','pod']`；`DEFAULT_SETTINGS.dockSkin = 'fade'`（§2.1）。
- sanitize：新增 `string` 分支（§2.1 代码）。
- readState / encode / saveSettings：settings 三处增补 `dockSkin`（readState 用 string 枚举 schema；encode 序列化；saveSettings 走 readState 清洗）。
- 导出面增补 `DOCK_SKINS`。

---

## 5. 关键实现点与边界情况

### 5.1 裁定表（与 DESIGN/PRD 的细化一致，供验收追溯）

| 裁定 | 决策 | 依据 |
|---|---|---|
| D1 | `--tpad-key` 保留为 M/L 底栏/兼容别名；三元组仅在 S 竖屏+横屏作用域生效 | 既有 qa-e2e 断言 1642/1644/1647 + M/L `--dock-h` 算式零改动（AC-13）|
| D2 | dockSkin 入 settings 包络字段（存储键仍 tetris.v2），PAYLOAD_VERSION 不变 | 纯增量、旧载荷缺省回退、向后兼容读取（AC-8 通道同源）|
| D3 | 「外观」组静态 DOM + CSS 门控（基座 display:none，has-touch 显示） | r16 touchpad 纯 CSS 显隐先例；不重置对局；元素恒在 DOM 绑定恒可用（AC-12）|
| D4 | 四皮肤类只写在 S 竖屏与横屏 media 内；M/L 零新增 | 恒玻璃由构造保证（AC-9），非源序依赖 |
| D5 | 横屏键径 56/80/48 = landscape 内 dir/hero/hold token 覆写 | PRD AC-10 取代设计稿内 52/76/46 |
| D6 | AC-10「不与 playfield 列区重叠」口径 = 板框包围盒不重叠；568×320 算术：轨 212+212，板框 ≤110px 宽居中内嵌于 [212, vw−212]，余量 ≥13px；hold/next 井可透于半透明轨下（设计稿已确认）| PRD AC-10 原文 + 几何验算；QA 截图终验 |

### 5.2 边界与守卫

- **✛ 纯装饰三层保险（AC-3）**：无 `data-action`（createTouchControls 的 `.tkey[data-action=…]` 选择器不命中）、`pointer-events:none`（DOM 事件零到达）、`aria-hidden`（不入读屏）。qa-e2e 增加「点击 hub 零合成事件」用例。
- **dockSkin 非法值双保险**：persist readState 的 string 枚举 sanitize（回 fade）+ ui.js 恢复段自校验（白名单），两处任一兜住即回默认（AC-8）。
- **persist.js 未加载**（装配根不传 persist）：dockSkin 会话内可用（默认 fade、切换生效），不持久化——与既有设置降级语义一致（ui.js persist null 分支）。
- **皮肤类残留互斥**：`applyDockSkin` 全量移除四类再添加——避免快速连续切换时双类竞争（裁定 D4 的 class 层面配套）。
- **多实例/测试隔离**：has-touch 归属计数不变（r16）；皮肤类是容器实例状态，不共享；dispose 解绑 radio 监听。
- **紧凑判定纯 CSS、零 JS**：档位不进快照/持久化/闭包（r17 派生样式哲学）；320px 不溢出由紧凑档 token 数学保证（316≤320）。
- **一屏零滚动（AC-5）**：dock 行高标准 ≈248 / 紧凑 ≈222 由布局自然形成，棋盘区 `flex:1` 让高（r19 骨架不动，仅 dock 让高值随簇变化）；QA 三视口截图终验。
- **keyboard 可达**：radio 原生可达；✛ 非焦点元素；`.tkey` Enter/空格激活路径零改动（qa-e2e 既有用例回归）。
- **safe-area**：横屏轨底 `calc(…+env(safe-area-inset-bottom))`；竖屏 dock 基座 padding 已含 inset（不改写）。
- **回放器零逻辑改动（AC-6）**：`createTouchControls`、TOUCH_KEYS、dispatch/守卫/DAS 时钟全部不动；DOM 重组后六键 querySelector 仍全命中——逐键等效由构造保持。

---

## 6. 测试策略

### 6.1 七套脚本变更矩阵（AC-13 出口）

| 脚本 | 变更 | 内容 |
|---|---|---|
| verify-game / verify-audio / verify-constants / assembly-check | **0 改动** | 红线证明；触控区零引擎触达 |
| verify-persist | **1 处登记改写 + 纯追加** | 见 6.2 |
| verify-ui | **纯追加** §r24 段 | 见 6.3 |
| qa-e2e-jsdom | **纯追加** §r24 段 | 见 6.4 |

### 6.2 verify-persist.cjs（登记改写 1 处 + 追加）

- **登记改写**：往返用例 saveSettings 调用增加 `dockSkin:'pod'`、期望字面量（79 行）增加 `dockSkin:'pod'`——新字段进入真实写/读往返覆盖；其余既有断言（DEFAULT_SETTINGS 深等 70/108/155/166 行因 DEFAULT_SETTINGS 同步增字段而自然通过）零改动。
- **纯追加**：① `DOCK_SKINS` 导出与值域断言；② `DEFAULT_SETTINGS.dockSkin === 'fade'`；③ sanitize string 枚举矩阵（白名单命中 / 非法值回 def / 非字符串回 def / def 缺省）；④ 同 line 127 先例：旧载荷缺 dockSkin 字段 → 恢复默认 fade。

### 6.3 verify-ui.cjs（纯追加 §r24）

- **index.html DOM**：`.tpad-cross` 含恰 4 个 `.tkey[data-action]`（hardDrop/moveLeft/moveRight/softDrop）+ `.tpad-cross__hub` 无 data-action 且含 aria-hidden；`.tpad-main` 含 hold+rotate 恰 2 键；六键全集与 TOUCH_KEYS 交叉（既有 AC-1 断言并存）。
- **✛ 非交互（源码断言）**：hub 无 `data-action`、CSS 含 `pointer-events:none`（作用域内）。
- **style.css 尺寸（AC-2/AC-4/AC-10）**：三元 token 存在；S 标准块内 dir 4rem/hero 6rem/hold 3.5rem/gap 12px；紧凑两媒体（max-width:359 / max-height:639）内 3.5/5/3rem + gap 10px（±1px 断言：rem→px 换算）；landscape 块内 3.5/5/3rem。320 算术（316≤320）以注释形式在 CSS 中 + 本段比值断言锚定 token 数值。
- **皮肤与作用域（AC-7/AC-9）**：四皮肤类选择器存在且**均出现在 S 竖屏与横屏 slice 内**；M/L slice（r17 切片先例）**不含** `.touchpad--skin`（恒玻璃构造保证断言）。
- **外观组（AC-7/AC-12/AC-14）**：四个 radio（name=dock-skin、value=枚举、默认 checked=fade）；CSS 基座 `display:none` + `html.has-touch` 显示两条规则存在；radio 交互语义（原生 input）。
- **导出面交叉**：`T.DOCK_SKINS` 深等 `P.DOCK_SKINS`（require persist.js）；T.applyDockSkin 纯函数矩阵（合法/非法/幂等/全量替换）。
- **AC-14**：min 键径 48px（3rem hold 紧凑）≥ 44 断言（token 数值）。

### 6.4 qa-e2e-jsdom.cjs（纯追加 §r24）

- 初始装配（touch:true）：`#touch-controls` 带 `.touchpad--skin-fade` 默认类。
- **即时生效（AC-7）**：开设置弹层 → 点「A 玻璃 dock」radio → 类替换为恰一皮肤类（`applyDockSkin` 全量替换语义）；注入 spy persist 断言 `saveSettings` 收到 `dockSkin:'glass'`；引擎快照逐字段无漂移、phase 仍 RUNNING（对齐 r17 pick8 比对先例）。
- **restart 保持（AC-7）**：切换后 restart → dockSkin 类不变。
- **持久化恢复（AC-8）**：同 backing 注入第二实例（verify-persist makeBacking 先例）→ 皮肤类恢复、radio checked 恢复。
- **✛ 零事件（AC-3）**：对 hub dispatch touchstart/touchend/click → 无合成 keydown、piece.x 不变、无 toast/音效副作用。
- **桌面门控（AC-12）**：touch:false 实例 → `html.has-touch` 缺省、`.settings-group--appearance` 结构断言隐藏规则存在（jsdom 无布局，显隐走源码断言先例）。
- 既有 r16/r17/r19/r21/r23 用例零改动回归（六键四类输入源、has-touch 归属、断点 resize、TOUCH_KEYS 交叉等）。

### 6.5 QA 真机清单承接（TECH 不验证项，PRD R1/R2/R4 缓解）

- AC-2 computed-size 实测 ±1px（标准/紧凑/横屏三档截图量测）；
- AC-4 320×568 `scrollWidth ≤ clientWidth`；AC-5 三视口 `scrollHeight ≤ clientHeight` 一屏零滚动；
- AC-10 横屏侧轨包围盒与板框零遮挡截图对拍（568×320 / 640×360）；
- AC-7 四方案截图对拍（含 C 默认态棋盘辨识度，AC-15）。

---

## 7. 任务拆分（无派发任务 → 并行任务表；git 动作入表）

> 并行度：T1 与 T4 无依赖可先并行 → T2/T3 依赖 T1 DOM 契约与 T4 persist 契约后并行 → T5 收口。对应 PRD §7 里程碑：M1=T1+T2（布局骨架，AC-1~5）、M2=T3+T4（设置/持久化/横屏，AC-7~10）、M3=T5（回归出口，AC-11~15）。

| 任务 | 文件边界 | 依赖 | 验收点（关联 AC） |
|---|---|---|---|
| T1 触控 DOM 重组 + 外观组 | index.html | 无（可最先） | 六键字面量/数量零改名、hub 三层保险、radio×4 默认 fade（AC-1/3/7/12） |
| T2 CSS 布局与皮肤 | style.css | T1 类名契约 | 三档尺寸/紧凑两 media/皮肤四类作用域/M/L 恒玻璃（AC-2/4/5/9/10/15） |
| T3 ui.js dockSkin 接线 | ui.js | T1 DOM + T4 契约 | DOCK_SKINS/applyDockSkin 导出、即时切换、持久化恢复、dispose（AC-7/8） |
| T4 persist.js 枚举扩展 | persist.js | 无（可最先） | sanitize string 类型、dockSkin 字段、DOCK_SKINS 导出、非法回退（AC-8） |
| T5 验证收口 | verify-ui.cjs / verify-persist.cjs / qa-e2e-jsdom.cjs | T1~T4 落地 | 七套全绿、登记改写仅 1 处、旧期望零回归（AC-11/13/14） |

**git 动作（PRD §8.7 工程约束，强制）**：分支保持 **main**（原始需求未指定分支动作）；工作区开发期间允许未提交改动；**开发完成且七套全绿后，代码改动与任务夹（PRD/DESIGN/TECHNICAL 已有 + 本轮）同批一次性提交**（提交信息参照 r23 风格，如 `feat: 触控区掌机式双簇重排 + 操作区背景四方案（r24）`）；QA/ACCEPTANCE 阶段该批提交保持（不追加拆散提交），验收通过后按既有惯例收口（验收后合回主线=main 即已完成）。**禁止逐任务分散 commit、禁止改任务夹外任何历史文档。**

---

## 8. 回归红线自查（出口清单）

1. `git diff game.js audio.js` 为空；`verify-constants` 绿（VERSION 三模块一致，未动）。
2. 六 `.tkey[data-action]` 字面量/数量与 r16 一致（TOUCH_KEYS 常量 0 diff）。
3. `createTouchControls` / 键盘回放器 / DAS·软降 repeat 路径 0 逻辑 diff。
4. 非触屏桌面：外观组隐藏、M/L 恒玻璃、桌面视觉 0 变化（AC-12/9）。
5. 七套脚本全绿；verify-ui / qa-e2e 既有断言 0 行改动，verify-persist 登记改写仅 1 处（§6.2）。

<!-- blueprint -->
{"summary":"r24 为纯 UI 迭代：S 竖屏触控区按掌机双簇（左十字+右旋转）重组、紧凑/横屏三档纯 CSS 尺寸、操作区背景四皮肤经设置「外观」组即时切换并走既有 persist settings 包络持久化——engine/audio 0 diff，验证只做纯追加+1 处登记改写","modules":{"/index.html":{"responsibility":"触控区双簇 DOM（.tpad-cross 4 键+✛ hub、.tpad-main Hold/旋转）+ 设置弹层「外观」组（radio×4）——六 .tkey[data-action] 字面量/数量与 r16 零改名","dependsOn":[],"assemblyOrder":3,"why":"静态 DOM 契约面：按钮实例、aria 语义、radio 默认值与枚举均由标记承载（沿 r16 纯 CSS 显隐先例），JS 只按 data-action/name 绑定，验证脚本源码扫描可锁定"},"/style.css":{"responsibility":".touchpad 布局重写：保留 --tpad-key 兼容别名 + 新增 --tpad-key-dir/-hero/-hold/--tpad-gap 三元组（S 竖屏+横屏作用域）、紧凑两条媒体查询、四皮肤类（仅 S/横屏块内）、M/L 恒玻璃零新增","dependsOn":["/index.html"],"assemblyOrder":3,"why":"视觉与档位全部收口 CSS（r17 派生样式哲学：档位不进 JS/快照/持久化）；皮肤类作用域用媒体块隔离实现 AC-9 构造保证，不依赖源序"},"/ui.js":{"responsibility":"dockSkin 会话闭包：初始化/持久化恢复/即时 class 切换/persistSettings 写回/dispose 解绑；新增 DOCK_SKINS 常量 + applyDockSkin 纯函数导出；触控绑定零改动","dependsOn":["/persist.js","/index.html"],"assemblyOrder":2,"why":"UI 层持有皮肤状态但零引擎触达（快照无漂移 AC-7 由构造保证）；applyDockSkin 提为纯函数使枚举清洗可 Node 单测，与 persist 白名单形成双保险"},"/persist.js":{"responsibility":"sanitize 新增 string 枚举类型；settings 包络增 dockSkin 字段（readState/encode/saveSettings 三处）；DEFAULT_SETTINGS.dockSkin='fade'；导出 DOCK_SKINS","dependsOn":[],"assemblyOrder":1,"why":"持久化是纯逻辑 UMD 可独立先行；枚举白名单与 ui.js 双保险，PAYLOAD_VERSION 不变（纯增量向后兼容），杜绝散落 setItem"},"/scripts/verify-ui.cjs":{"responsibility":"纯追加 §r24 断言：双簇 DOM/hub 非交互/tri 档 token 数值/紧凑两 media/皮肤作用域切片/M-L 无皮肤类/外观组门控与 radio/DOCK_SKINS 交叉","dependsOn":["/index.html","/style.css","/ui.js","/persist.js"],"assemblyOrder":4,"why":"沿用 r17 T3 源码结构断言先例锁定无布局引擎可断的契约；皮肤枚举三处（persist/ui/HTML）交叉断言的唯一收口"},"/scripts/verify-persist.cjs":{"responsibility":"1 处登记改写（往返用例补 dockSkin 字段）+ 纯追加（DOCK_SKINS/DEFAULT 值/sanitize string 矩阵/缺省回退）","dependsOn":["/persist.js"],"assemblyOrder":4,"why":"登记改写仅限新增字段进入端到端往返，旧语义断言零触碰（AC-13 出口纪律）"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"纯追加 §r24：默认皮肤类/切换即时生效+快照无漂移/restart 保持/持久化恢复/✛ 点击零事件/桌面门控；既有六键输入源用例零改动回归","dependsOn":["/index.html","/style.css","/ui.js","/persist.js"],"assemblyOrder":4,"why":"jsdom 可行为验证皮肤状态机与持久化接线；几何（320px/一屏/侧轨遮挡）无布局引擎不可测，按 PRD R4 落 QA 真机清单"},"duplications":["皮肤枚举三处声明（persist.DOCK_SKINS / ui.DOCK_SKINS / index.html radio value）→ verify-ui 交叉断言防漂移（沿 r16 TOUCH_KEYS 先例）","--tpad-key 兼容别名与三元组取值重叠（M/L 48 vs 紧凑 hold 48）→ 作用域裁决注释 + M/L slice 无皮肤类断言防误染","紧凑判定两媒体（宽≤359 ∥ 高≤639）同值双写 → 注释互引，防仅改一处漂移"],"tasks":[{"title":"T1 触控 DOM 重组 + 外观组（index.html）","files":["/index.html"],"spec":"双簇 wrapper（.tpad-cross/.tpad-main）+✛ hub 三层保险 + 设置弹层外观组 radio×4，六 .tkey 字面量/数量零改名"},{"title":"T2 CSS 布局与皮肤（style.css）","files":["/style.css"],"spec":"三元 token（--tpad-key 兼容保留）+ S 竖屏双簇/紧凑两媒体/横屏侧轨 56·80·48 + 四皮肤类仅挂 S/横屏 + M/L 恒玻璃"},{"title":"T3 ui.js dockSkin 接线","files":["/ui.js"],"spec":"DOCK_SKINS/applyDockSkin 导出、装配初始化、persist 恢复、radio change 即时切换、persistSettings 写回、dispose 解绑"},{"title":"T4 persist.js 枚举扩展","files":["/persist.js"],"spec":"sanitize string 枚举类型、settings.dockSkin 三处增补、DEFAULT_SETTINGS.dockSkin='fade'、DOCK_SKINS 导出"},{"title":"T5 验证收口（verify-ui/persist/qa-e2e）","files":["/scripts/verify-ui.cjs","/scripts/verify-persist.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"纯追加 §r24 断言段 + verify-persist 登记改写 1 处；七套全绿、旧期望零回归；代码与任务夹同批提交"}]}
<!-- /blueprint -->

---

<!-- state -->
{"phase":"tech","summary":"r24 技术方案已写入任务夹：S 竖屏 dock 双簇（.tpad-cross grid3×3 四键+✛ hub 三层保险、.tpad-main Hold/旋转）+ 三档尺寸（标准 64/96/56·12、紧凑 56/80/48·10 纯 CSS 两 media、横屏 56/80/48）均收口 style.css；关键裁定 D1~D6——--tpad-key 保留为 M/L 兼容别名（三元组仅 S/横屏作用域，qae2e 1642/1644/1647 与 M/L --dock-h 零改动）、dockSkin 入 persist settings 包络（PAYLOAD_VERSION 不变、sanitize 新增 string 枚举）、外观组 CSS 门控、皮肤类仅写 S/横屏 media 块（M/L 恒玻璃构造保证）、横屏 56/80/48 取代稿内 52/76/46、AC-10 零遮挡口径=板框包围盒（568×320 算术内嵌）；ui.js 新增 DOCK_SKINS+applyDockSkin 纯函数（即时 class 全量替换、非法回退双保险、零引擎触达）；verify-ui/qae2e 纯追加、verify-persist 登记改写仅 1 处（往返补 dockSkin 字段）；任务 T1(index.html,独立)∥T4(persist.js,独立)→T2(style.css)∥T3(ui.js)→T5 收口；git 保持 main、七套全绿后代码与任务夹同批提交（禁分散 commit）","memory":["r24 TECH 定稿：六 .tkey[data-action] 字面量/数量零改名、DOM 顺序可随簇重排（qae2e 只断言集合非顺序）、hub=span.tpad-cross__hub 无 data-action+aria-hidden+pointer-events:none","尺寸 token 兼容方案：--tpad-key(3rem/48px) 保留供 M/L 底栏+既有断言；--tpad-key-dir/-hero/-hold(+--tpad-gap) 三元组仅在 S 竖屏(标准4/6/3.5rem·gap12) 与 compact/landscape(3.5/5/3rem·gap10) 媒体内覆写，基座 .tkey 仍写 var(--tpad-key)","dockSkin 持久化=DEFAULT_SETTINGS+readState+encode+saveSettings 四处置；sanitize 新增 {type:'string',values,def} 分支（既有三类型零改动）；PAYLOAD_VERSION 不变；verify-persist 往返用例(73/79行)补 dockSkin 字段=唯一登记改写","外观组静态 DOM+CSS 门控（基座 display:none、html.has-touch 显示）；ui.js 恒绑定（元素恒在 DOM）；radio 原生语义 AC-14；切换=applyDockSkin 全量去旧类再添新类+persistSettings()","皮肤四类(.touchpad--skin-glass/-float/-fade/-pod)只写 S 竖屏+landscape media 块内；M/L 块零新增→恒玻璃构造保证；320 验算 32+188+16+80=316≤320；dock 行高标准≈248/紧凑≈222","红线出口：game/audio 0 diff、VERSION 不动、createTouchControls/TOUCH_KEYS/回放器 0 逻辑 diff、桌面 0 变化；七套全绿（verify-ui/qae2e 纯追加、verify-persist 1 处登记改写）；任务 T1∥T4→T2∥T3→T5；main 分支保持、全绿后代码+任务夹同批提交"]}
<!-- /state -->