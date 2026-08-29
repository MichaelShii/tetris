# TECHNICAL：触控键帽质感统一与横屏侧轨校正 + 「操作区背景」2×2 缩略选择器

<!-- meta: summary="r26 技术方案：横屏侧轨 .rail 元素化（基座 display:contents 中性化 + 横屏块加 <600px 门控实现 AC-3 M/L 恒行式底栏裁定、左轨212/右轨104 单边描边、皮肤挂点 ::before/::after 迁至 .rail）+ S/横屏作用域全键正圆补 Hold + 旋转主键常亮环（仅强度参数）+ 外观组 2×2 radio 缩略选择器（name 另起一行）——ui.js/persist.js 0 diff，verify-ui 1 处登记改写（取代 r24#AC-7 授权）+ 纯追加，其余纯追加" -->

基线依赖：docs/teamflow/20260829-r24-touchpad-cross（其 AC-1~15 全部不得回归——双簇 DOM/六键 `data-action`、三元尺寸 token、四皮肤与持久化通道、横屏几何断言是本次修改与校正对象）；触控行为基线承继 r16 逐键等效/守卫/三态、r19 一屏零滚动、r21 has-touch 门控与侧轨 z-index。PRD：同任务夹 PRD.md（AC-1~15）；DESIGN：同任务夹 DESIGN.md（§2.2 .rail 化 / §2.3 2×2 选择器 / §4.3 常亮环 / §4.4 皮肤挂点迁移）。

**实施唯一视觉依据**：用户已评审设计稿 `docs/teamflow/drafts/20260829-touchpad-cross-design-draft.html` 横屏 mock（`.rail rail--l/rail--r pad` 结构、单边描边、右轨窄面板）与四皮肤 v-card 基准；本文件落实现契约，冲突时以 PRD AC 与设计稿为准。

---

## 1. 总览与工程约束（0-diff 红线）

| 文件 | 动作 | 约束 |
|---|---|---|
| index.html | 修改 | `#touch-controls` 内插两个 `.rail` 包裹簇（六 `.tkey[data-action]` 字面量/数量零改名）；「外观」组单选改 2×2 缩略结构（input 属性顺序/value 零变化） |
| style.css | 修改 | 横屏块加 **`and (max-width: 599px)` 门控**（AC-3）；`.rail` 轨道盒 + 单边描边（弃 `::before/::after` 全边描边）；四皮肤横屏挂点迁至 `.rail`；S/横屏作用域全键 `border-radius:50%`（Hold 补漏）+ 旋转常亮环（仅强度参数）；「外观」组 2×2 选择器样式（基座作用域） |
| ui.js / persist.js | **0 diff** | 红线（§3.1 证明：绑定/持久化路径全部选择器式，DOM 结构变化无触碰） |
| scripts/verify-ui.cjs | 修改 | **1 处登记改写**（603 行左半「文本紧跟 input」断言 → name-span 断言；取代 r24#AC-7 授权）+ **纯追加 §r26 段**；其余既有断言 0 行改动 |
| scripts/qa-e2e-jsdom.cjs | 修改 | **纯追加 §r26 段**；r24/r21/r19/r16 既有用例 0 行改动 |
| scripts/verify-persist.cjs | **0 改动** | dockSkin 往返登记 r24 已有；AC-14「禁止新增改写」 |
| verify-game / verify-audio / verify-constants / assembly-check | 0 改动 | 红线；VERSION 不动（verify-constants 保持绿） |

**代码形态与风格**：沿用 r24 TECH 同款——纯 JS UMD、纯函数优先、断言「纯追加到 §r26 独立 test 段」；登记改写仅限 §6.2 声明的最小必要 1 处。所有视觉改动复用既有 token（`--surface-2/--line/--primary/--primary-hi/--muted/--fs-xs/--radius-md/--glass-bg`），**零新增色板/阴影/半径 token、零新增动画**（AC-6/AC-15）。

---

## 2. 数据模型与存储

### 2.1 持久化（persist.js，0 diff）

**无新字段**。`tetris.dockSkin`（glass|float|fade|pod，默认 fade）持久化通道 r24 已交付完整契约：`DEFAULT_SETTINGS.dockSkin`、sanitize `{type:'string', values, def}` 白名单、readState/encode/saveSettings 三处增补、`PAYLOAD_VERSION` 不变、非法/缺失回退 fade。r26 不改一行（§3.1 给出不变性证明）。

### 2.2 会话状态（ui.js，0 diff）

闭包 `let dockSkin = 'fade'`、`DOCK_SKINS`、`applyDockSkin(el, skin, skins)`（全量去旧类再添新类）、radio change 即时切换、persistSettings 写回、dispose 解绑——r24 已交付，**r26 零改动**。皮肤类仍挂 `#touch-controls`（`touchpad--skin-*`），类名与语义不变；横屏视觉挂点变化仅由 style.css 选择器目标（`.touchpad--skin-x .rail`）承担，JS 无感知。

---

## 3. 接口契约（API Design：UMD 面 + DOM 面）

### 3.1 UMD 面零新增（红线证明，AC-11/13）

| 导出面 | r26 状态 | 不变性论证 |
|---|---|---|
| persist.DOCK_SKINS / ui.DOCK_SKINS / ui.applyDockSkin | **零改动** | 枚举值、纯函数契约（合法/非法/幂等/全量替换）均不依赖 DOM 结构 |
| ui.js 外观组绑定 | **零改动** | 绑定/同步/切换全部按 `root.querySelectorAll('[name="dock-skin"]')` 选择器寻址 input；2×2 重构后 input 仍是原生 radio、`name="dock-skin"`、value 枚举不变 → 选择器全命中、checked 镜像/change 事件零变化 |
| persist 通道 | **零改动** | dockSkin 字段名、枚举、默认值、非法回退不变；saveSettings 载荷字面量不变 |
| createTouchControls / TOUCH_KEYS / 回放器 | **零改动** | 六 `.tkey[data-action]` 选择器按类名+属性寻址，`.rail` 包裹后仍全部命中（后代选择器） |

### 3.2 DOM 契约（index.html）

**触控区（AC-2/AC-4）**——新增两个 `.rail` 包裹簇（六键字面量/数量/`data-action`/aria-label 与 r16/r24 零改名；`verify-ui` r24 断言 `crossStart`/`mainStart` 源序与簇内键序列不变）：

```html
<div id="touch-controls" class="touchpad" aria-label="触屏操控区">
  <!-- r26：独立轨道元素 .rail--l/.rail--r（AC-2）——横屏承载单边描边玻璃轨；竖屏/M/L 由 CSS
       display:contents 中性化（布局与 r24 逐字节等）；六 .tkey[data-action] 零改名 -->
  <div class="rail rail--l">
    <div class="tpad-cross">
      <button type="button" class="tkey tkey--dir" data-action="hardDrop" aria-label="硬降"><span class="tkey__icon">⤓</span><span class="tkey__label">硬降</span></button>
      <button type="button" class="tkey tkey--dir" data-action="moveLeft"  aria-label="左移"><span class="tkey__icon">◀</span><span class="tkey__label">左</span></button>
      <button type="button" class="tkey tkey--dir" data-action="moveRight" aria-label="右移"><span class="tkey__icon">▶</span><span class="tkey__label">右</span></button>
      <button type="button" class="tkey tkey--dir" data-action="softDrop"  aria-label="软降"><span class="tkey__icon">▼</span><span class="tkey__label">软降</span></button>
      <span class="tpad-cross__hub" aria-hidden="true">✛</span>
    </div>
  </div>
  <div class="rail rail--r">
    <div class="tpad-main">
      <button type="button" class="tkey tkey--hold"   data-action="hold"   aria-label="Hold 暂存"><span class="tkey__icon">📦</span><span class="tkey__label">Hold</span></button>
      <button type="button" class="tkey tkey--rotate" data-action="rotate" aria-label="旋转"><span class="tkey__icon">⟳</span><span class="tkey__label">旋转</span></button>
    </div>
  </div>
</div>
```

- `.rail` 为纯布局/视觉元素：无 `data-action`、无 `.tkey` 类、无 aria 语义（`display:contents` 时不入可访问性树；横屏为视觉盒）。`verify-ui` r24「双簇源序 cross→main、簇内键序列」断言零改动通过（`class="tpad-cross"` 源序仍在 `class="tpad-main"` 之前，簇内无 div 插入 del `</div>` 切片语义）。

**设置弹层「外观」组（AC-7~9，取代 r24 横排单选）**——**input 属性顺序保持** `type="radio" name="dock-skin" value="…"( checked)`（r24 verify-ui 598~602/603 右半断言零改动）；名称移入独立 span（603 左半断言登记改写，§6.2）：

```html
<div class="dock-skin-control__list" role="radiogroup">
  <label class="dock-skin-option">
    <input type="radio" name="dock-skin" value="glass">
    <span class="dock-skin-option__tile dock-skin-option__tile--glass" aria-hidden="true">
      <span class="dskin-dot"></span><span class="dskin-dot"></span><span class="dskin-dot"></span><span class="dskin-dot"></span><span class="dskin-dot dskin-dot--hero"></span>
    </span>
    <span class="dock-skin-option__name">A 玻璃 dock</span>
  </label>
  <!-- B 无底浮键 / C 渐隐托盘（checked，默认） / D 双簇座舱 —— 同构，name 文案见 DESIGN §2.3 -->
</div>
```

### 3.3 style.css token 面（零新增 token，AC-6）

全部复用既有 token：`--surface-2/--line`（键帽）、`--primary` 的 color-mix（常亮环/微底）、`--primary-hi`（旋转图标/✓）、`--glow-primary`（按压辉光，承继）、`--glass-bg/--line`（轨/选择器 tile）、`--fs-xs/--muted`（名称行）、`--radius-md`（轨/tile 圆角）、`--accent`（焦点环）。**不新增**任何 `--*` 调色/半径/阴影 token。

---

## 4. 前端结构与装配

### 4.1 index.html（T1）

1. `#touch-controls` 105~126 行区间整体替换为 §3.2 结构（`.rail--l` 包 `.tpad-cross`、`.rail--r` 包 `.tpad-main`），注释更新为 r26 契约说明（rail 元素化/display:contents 中性化/单边描边简述）。
2. 设置弹层「外观」组 200~205 行替换为 2×2 缩略结构（§3.2），radio value/checked=fade 不变。
3. 其余 DOM 零改动（统计/系统钮/棋盘/遮罩/图例/脚本序）。

### 4.2 style.css（T2）——五个改动点

1. **基座 `.rail` 中性化**（媒体查询外，置于 1078 行 `.tpad-cross__hub` 后）：`.touchpad .rail { display: contents; }` —— 竖屏/M/L 下簇直接参与 `.touchpad` flex 布局，间距/对齐与 r24 逐字节等（`gap/padding/align-items` 算式不变）；横屏块覆写回视觉盒（同特异性、源序靠后胜出）。display:contents 的 rail 无盒、不进可访问性树、不影响任何既有选择器（全为后代选择器）。
2. **横屏块门控（AC-3，1183 行）**：`@media (orientation: landscape)` → `@media (orientation: landscape) and (max-width: 599px)`。前缀匹配，`verify-ui` 锚点 `indexOf('@media (orientation: landscape)')` 零改动保持。≥600px 横屏不命中本块 → 落基座 `.touchpad`（1043 行：行式底栏恒 `--glass-bg`/border-top/投影），即 **M/L 横屏恒行式底栏不渲染侧轨**（裁定落地）；S 手机横屏行为不变。同步更新 1775 行失效注释（「沿用 r16 (orientation:landscape) 规则」→ r24/r26 侧轨说明）。
3. **横屏 `.rail` 轨道盒（AC-2，取代 1215~1234 行 `::before/::after`）**：
   ```css
   .touchpad .rail { display:flex; flex-direction:column; align-items:center; justify-content:center;
                     border-radius:var(--radius-md); background:rgba(35,35,45,0.45); }
   .touchpad .rail--l { width: calc(3*var(--tpad-key-dir) + 2*var(--tpad-gap) + 2*12px); /* ≈212px 左轨 */
                        border-right: 1px solid var(--line);               /* 单边右描边（AC-2） */
                        margin-left: env(safe-area-inset-left); }
   .touchpad .rail--r { width: calc(var(--tpad-key-hero) + 2*12px);        /* ≈104px 内容收口（DESIGN 窄面板裁定） */
                        border-left: 1px solid var(--line);                /* 单边左描边 */
                        margin-right: env(safe-area-inset-right); }
   ```
   外层 `.touchpad` 保留 `bottom: env(safe-area-inset-bottom)`、`height: calc(3*dir+2*gap)`（188px）、`align-items` 由 center 改 **stretch**（rail 撑满轨高，簇在其内居中）；`.touchpad .tkey { position:relative; z-index:1 }` 承继（r21 语义：键盖轨）。轨内键簇规则（十字 grid / 右簇纵列 / 字号档）零改动。**删除** `.touchpad::before/::after` 轨容器与全部 `::before/::after` 皮肤覆写段（1307~1334 行）。`padding: 0 12px` 保留（轨宽算式的 +2×12 部分即内容内边距）。
4. **皮肤挂点迁移 + 正圆补漏 + 常亮环（S 竖屏与横屏两作用域并行修改）**：
   - **全键正圆（AC-5）**：三选择器补齐 `border-radius:50%`——S 块：cross 已有（1633）、rotate 已有（1659）、**hold 补**（1645~1650 块内加）；横屏块：cross **补**、rotate 已有（1282）、**hold 补**（1270~1275 块内加）。零新增 radius token。
   - **旋转主键常亮环（AC-6，DESIGN §4.3，两作用域同改，仅强度参数）**：`border-color: rgba(139,124,246,0.55)`（color-mix fallback）+ 下一行 `border-color: color-mix(in oklch, var(--primary) 55%, transparent)`（常态紫色常亮环）；微底 `background: color-mix(in oklch, var(--primary) 16%, var(--surface-2))` **维持**（含 `#363050` fallback 行）；图标 `.tkey--rotate .tkey__icon { color: var(--primary-hi) }`；`::after` 静态细环维持。
   - **横屏皮肤挂点（AC-2/AC-12）**：`.touchpad--skin-glass::before/::after` → `.touchpad--skin-glass .rail { background: var(--glass-bg); backdrop-filter: blur(20px) saturate(140%) }`（单边描边保留）；`-float` → `.rail { background: transparent; border-color: transparent }`（键帽投影规则维持）；`-fade` → `.rail { background: linear-gradient(180deg, rgba(23,23,23,0), rgba(35,35,45,0.82) 36%, rgba(26,26,34,0.95)); border-color: transparent }`；`-pod` → `.rail { background: transparent; border-color: transparent }` + 簇光环托规则（1336~1352 行）**维持不变**。选择器仍含 `.touchpad--skin-*` needle → r24 皮肤作用域断言（≥2 处且全在 S/横屏 slice 内）零改动通过。
5. **2×2 缩略选择器（AC-7~9，基座作用域，置于外观组门控规则 1089 行后；不得出现 `.touchpad--skin-` 字样——保护皮肤作用域切片断言）**：
   ```css
   .dock-skin-control__list { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; } /* 2×2 */
   .dock-skin-option { position:relative; display:flex; flex-direction:column; gap:8px; cursor:pointer; min-width:0; }
   .dock-skin-option input[type="radio"] { position:absolute; opacity:0; width:1px; height:1px; } /* 视觉隐藏仍可聚焦（AC-9/15） */
   .dock-skin-option__tile { position:relative; height:48px; border:1px solid var(--line);
                             border-radius:var(--radius-md); background:rgba(23,23,23,0.45);
                             overflow:hidden; display:flex; align-items:center; justify-content:center; }
   .dock-skin-option input:checked + .dock-skin-option__tile { border-color:var(--primary); }  /* 选中描边（1px 换色不位移） */
   .dock-skin-option input:checked + .dock-skin-option__tile::after { /* ✓ 徽标：右上 16px 圆 --surface-2 底 + --primary 描边 + --primary-hi ✓（AC-9 双信号） */ }
   .dock-skin-option input:focus-visible + .dock-skin-option__tile { outline:2px solid var(--accent); outline-offset:2px; }
   .dock-skin-option__name { font-size:var(--fs-xs); color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; } /* 名称另起一行（AC-8） */
   .dskin-dot { width:7px; height:7px; border-radius:50%; background:var(--surface-2); border:1px solid var(--line); }
   .dskin-dot--hero { width:10px; height:10px; border-color:var(--primary); }
   .dock-skin-option__tile--glass { background:var(--glass-bg); }        /* A：真实皮肤变量 mini 化（AC-8，非静态图标） */
   .dock-skin-option__tile--float { background:transparent; }
   .dock-skin-option__tile--fade  { background:linear-gradient(180deg, rgba(23,23,23,0), rgba(35,35,45,0.82) 36%, rgba(26,26,34,0.95)); }
   .dock-skin-option__tile--pod   { background:radial-gradient(closest-side, rgba(139,124,246,0.30), rgba(139,124,246,0)); }
   /* 320px 预算（AC-7，注释入 CSS）：设弹层卡片 ≈92vw≈294 − 2×16 卡片 padding − 12 列距 = 250 → tile≈125 ≥ 110 ✓
      名称 nowrap+ellipsis 兜底 → 0 横向挤出/堆叠（QA 截图终验） */
   ```
   选中/键盘/语义全走原生 radio（方向键+Space、`:focus-visible` 焦点环承继既有 `--accent`）；切换即时生效/持久化/非法回退/has-touch 门控全部承继（AC-10，ui.js 零改动）。

### 4.3 ui.js / persist.js（T3 取消——0 diff）

无编码任务。绑定/持久化/切换全路径按 §3.1 论证不变；`#touch-controls` 缺失降级语义不变（rail 随容器整体缺失）。T5 以 `git diff` 空 + 七套全绿证明红线。

---

## 5. 关键实现点与边界情况

### 5.1 裁定表（r26 细化，供验收追溯）

| 裁定 | 决策 | 依据 |
|---|---|---|
| R-D1 | 横屏侧轨块加 `and (max-width: 599px)` 门控 → M/L（≥600px）横屏不命中侧轨、落基座行式底栏恒玻璃 | AC-3（设计稿仅画手机横屏）；verify-ui 锚点前缀匹配零改动 |
| R-D2 | `.rail` 元素承载轨道；基座 `display:contents` 中性化 | AC-2 独立元素 + 设计稿结构；中性化保证竖屏/M/L 布局与 r24 逐字节等（后代选择器全兼容） |
| R-D3 | 右轨内容收口 ≈104px（80+2×12），左轨 ≈212px 承继 | DESIGN §2.2 新增裁定（对齐设计稿 rail--r 窄面板、中列余量只增不减）；r24 无「右轨宽 212」断言 → 纯追加新断言 |
| R-D4 | 横屏皮肤挂点由 `.touchpad::before/::after` → `.rail`（单边描边保留） | AC-2；皮肤作用域断言 needle 不变 |
| R-D5 | 正圆/常亮环仅强度参数（常亮环 color-mix primary 55%、图标 primary-hi、微底 16% 维持） | AC-5/6「零新增色板」 |
| R-D6 | verify-ui 登记改写仅 1 处（603 行左半文本位置断言 → name-span 断言） | 取代 r24#AC-7（AC-8 名称另起一行必然改变文本承载）；qa-e2e 零改写（radio 按 value 选择器驱动） |

### 5.2 边界与守卫

- **rail 元素化零回归**：`.rail` 无 `data-action`/无键类 → 回放器 `createTouchControls` 选择器与 `verify-ui` 六键聚合正则完全不命中 rail；簇内键 `veri` 切片断言（`slice(crossStart, mainStart)` / `slice(mainStart, '</div>')`）在 rail 包裹下逐字节等价（证明见 §3.2 注）。hub 三层保险（无 data-action / pointer-events:none / aria-hidden）零改动。
- **display:contents 兼容**：现代浏览器全支持（含 Safari/Chrome/Firefox）；退出机制=横屏块覆写回 flex；jsdom 无布局引擎只断言源码。
- **门控防击穿**：`@media (orientation: landscape) and (max-width: 599px)` 与 r19 S 横屏块 `@media (max-width: 599px) and (orientation: landscape)` 语义等价（OR 顺序无关）；verify-ui 新增断言：landSlice 起始 80 字符内含 `and (max-width: 599px)`，且 `@media (min-width: 600px)` 各块（1809/1831）不含 `.rail`/`.touchpad--skin-`（M/L 恒玻璃构造保证）。
- **皮肤作用域断言防护**：选择器 tile 皮肤类命名 `.dock-skin-option__tile--glass/-float/-fade/-pod`（**刻意避开 `.touchpad--skin-` 字符串**），否则 r24 皮肤切片断言误炸——T2 必查。
- **320 不溢出双保险**：`grid-template-columns: repeat(2, minmax(0,1fr))` 吸收宽度 + `--name` nowrap/ellipsis；tile 1px 边框换色不位移（选中态零布局抖动）。
- **a11y**：radio 视觉隐藏但可聚焦（非 display:none）；聚焦环画在 tile（`input:focus-visible + tile`）；名称即 label 文本（input 被 label 文本标签标注）；✓ 徽标 + 描边双信号（不依赖颜色单通道，AC-9/15）。
- **touchpad 可选降级**：`#touch-controls` 缺失（r16 既有）→ rail/皮肤类随容器缺失，radio 仍可操作持久化——承继 r24 §4.3.7。
- **横屏几何（AC-4 承继）**：键径 56/48/80、safe-area（touchpad `bottom` env + rail `margin-left/right` env）、中列板框零遮挡、z-index 键盖轨——语义与 r24 完全一致（仅承载方式变更），既有断言零改动；截图对拍 QA 真机承接。
- **零新增动画**：选择器选中态描边/勾选显隐走 120ms 过渡（reduced-motion 承继既有），皮肤切换沿用 r24「立即换类」不渐变动画。

---

## 6. 测试策略

### 6.1 七套脚本变更矩阵（AC-14 出口）

| 脚本 | 变更 | 内容 |
|---|---|---|
| verify-game / verify-audio / verify-constants / assembly-check | **0 改动** | 红线证明；ui/persist 0 diff + VERSION 不动 |
| verify-persist | **0 改动** | dockSkin 往返登记 r24 已有；AC-14 禁止新增改写 |
| verify-ui | **1 处登记改写 + 纯追加 §r26** | 见 6.2 |
| qa-e2e-jsdom | **纯追加 §r26** | 见 6.3 |

### 6.2 verify-ui.cjs（登记改写 1 处 + 纯追加 §r26）

- **登记改写（唯一 1 处，603 行）**：`assert.ok(/> C 渐隐托盘<\/label>/ …)` 左半 → `assert.ok(/dock-skin-option__name">C 渐隐托盘<\/span>/.test(htmlR24), …)`。理由：取代 r24#AC-7（AC-8 要求名称另起一行独立块），旧「文本紧跟 input 同一行」断言语义被取代条款作废；右半 `<input type="radio" name="dock-skin" value="fade" checked>` 断言**零改动**（input 属性顺序保持）。此为 §5.1 R-D6 落点，禁止再动其他既有断言。
- **纯追加 §r26 段（不并入既有 test）**：
  1. `.rail` DOM：恰 2 个（`rail--l` 在 `rail--r` 之前）；`rail--l` 区间内含 `tpad-cross` 且含恰 4 键、`rail--r` 区间内含 `tpad-main` 含 hold+rotate（切片断言沿 645~656 先例）；rail 元素无 data-action/无 `tkey` 类。
  2. 基座 `.touchpad .rail { display: contents }` 规则存在（竖屏中性化）。
  3. 横屏门控（AC-3）：landSlice 起始含 `and (max-width: 599px)`；`@media (min-width: 600px)` 两 M 块（1809/1831 切片）均不含 `.rail`/`.touchpad--skin-`；基座行式底栏三件套（`background: var(--glass-bg)` + `border-top: 1px solid var(--line)` + 投影，1043~1056）存在。
  4. 轨道盒（AC-2）：`.rail--l` 含 `border-right: 1px solid var(--line)`、`.rail--r` 含 `border-left`；宽度算式（212/104 calc 串）存在；`@media (orientation: landscape)` 块内**不含** `.touchpad::before`/`.touchpad::after`（伪元素轨已拆除）。
  5. 正圆（AC-5）：S 竖屏 slice 与 landSlice 各含三键类 `border-radius: 50%`（`.tpad-cross .tkey` / `.tkey--rotate` / `.tkey--hold`）。
  6. 常亮环（AC-6）：两作用域各含 `border-color: color-mix(in oklch, var(--primary) 55%, transparent)` 与 `.tkey--rotate .tkey__icon { … --primary-hi }`；**无新增调色 token** 断言：style.css 头部 `:root` 变量计数较 r24 基线不变（或 token 名集合 ⊆ r24 集合）。
  7. 选择器（AC-7~9）：`.dock-skin-control__list` 含 `repeat(2, minmax(0,1fr))` + gap 12px；四个 `.dock-skin-option__name` 文案（A/B/C/D）各另起一行（span 结构）；四个 `__tile--*` 皮肤类存在；`input:checked + tile` 选中描边与 ✓ 徽标规则存在；320 算术（294−32−12=250 → tile≈125≥110）以 CSS 注释存在 + 本段锚定列宽算式。
  8. 皮肤作用域防护：`.dock-skin-option__tile--` 类不产生 `.touchpad--skin-` 新出现位置（既有 r24 切片断言即在守卫）。
  9. 既有 r24/r19/r21/r16 断言 0 行改动回归（git diff 审查辅助）。

### 6.3 qa-e2e-jsdom.cjs（纯追加 §r26）

- **rail 结构运行时**：`.rail` 恰 2、`.rail--l` 含 `.tpad-cross`、`.rail--r` 含 `.tpad-main`、rail 非 `.tkey` 且无 data-action；六键 querySelector 仍全命中（`doc.querySelector('.tkey[data-action="moveLeft"]')` 等）。
- **新结构下 radio 仍可点中**（AC-10）：点击 `input[name="dock-skin"][value="glass"]`（label 内多 span 不阻断）→ 皮肤类恰一 `touchpad--skin-glass` + persist 写回 + 快照无漂移（对齐 r24 ⑤ 先例，g2 通用快照比对）。
- 四皮肤循环切换/持久化恢复/非法回退沿用 r24 既有用例（零改动）回归。
- 既有 r16/r17/r19/r21/r23/r24 全部用例零改动回归（含六键四类输入源、has-touch 归属、断点 resize、hub 三事件零合成）。
- 桌面门控（AC-12）：沿用 r24 ⑥（源码断言），新增：touch:false 实例下 `.settings-group--appearance` 结构断言不变。

### 6.4 QA 真机清单承接（TECH 不验证项，PRD R2/R5 缓解）

- AC-1/AC-2/AC-6 截图对拍：横屏 Hold 正圆 48px、`.rail` 单边描边质感、旋转常亮环紫色突出感（对照设计稿 rail--l/rail--r mock 与四皮肤 v-card）；
- AC-3/AC-4 断点实测：≥600px 横屏 = 行式底栏恒玻璃（无侧轨）；手机横屏 568×320/640×360 侧轨包围盒与板框中列零遮挡、safe-area 贴边、键 z 盖轨；
- AC-7/AC-8 截图：320px 视口 2×2 零溢出、预览面真实皮肤示意 + 名称另起一行；
- AC-15：C 默认态与四皮肤下棋盘辨识度对拍（旋转键增强不污染棋盘区）。

---

## 7. 任务拆分（无派发任务 → 并行任务表；git 动作入表）

> 并行度：T1（DOM）可最先；T2 依赖 T1 类名契约；T4 依赖 T1+T2 落地；T5 收口。ui.js/persist.js 无编码任务（0-diff 红线由 T5 证明）。对应 PRD §7 里程碑：M1=T1+T2 键帽/侧轨（AC-1~6+AC-12）、M2=T1+T2 选择器（AC-7~10）、M3=T4+T5 收口（AC-11/13/14/15）。

| 任务 | 文件边界 | 依赖 | 验收点（关联 AC） |
|---|---|---|---|
| T1 触控 rail 包裹 + 2×2 选择器标记 | index.html | 无（可最先） | 六键字面量/数量零改名、rail×2 结构、input 属性顺序/value/checked=fade 不变（AC-2/5/7/8/9） |
| T2 CSS：门控/rail 化/正圆/常亮环/选择器 | style.css | T1 类名契约 | 横屏 <600px 门控、212/104 单边描边轨、伪元素轨拆除、三键类正圆、常亮环仅强度参数、2×2 样式、M/L 恒玻璃（AC-1~9/12） |
| T4 验证：verify-ui 登记改写+纯追加 | scripts/verify-ui.cjs | T1+T2 落地 | 603 行 1 处改写、§r26 断言段全绿、既有断言 0 回归（AC-3~9/14） |
| T5 验证：qa-e2e 纯追加+收口 | scripts/qa-e2e-jsdom.cjs | T1~T4 | §r26 段全绿、ui/persist 0 diff 证明、七套全绿（AC-10/11/13/14） |

**git 动作（PRD §8 工程约束，强制）**：分支保持 **main**；开发期间允许未提交改动；**实现完成且七套全绿后，代码改动与任务夹（PRD/DESIGN/TECHNICAL 已有 + 本轮）同批一次性提交**（提交信息参照 r23/r24 风格，如 `feat: 触控键帽质感统一 + 横屏侧轨 .rail 校正 + 操作区背景 2×2 缩略选择器（r26）`）；QA/ACCEPTANCE 阶段该批提交保持（不追加拆散提交）。**禁止逐任务分散 commit、禁止改任务夹外任何历史文档**。

---

## 8. 回归红线自查（出口清单）

1. `git diff game.js audio.js ui.js persist.js` 为空（ui/persist 亦 0 diff）；`verify-constants` 绿（VERSION 未动）。
2. 六 `.tkey[data-action]` 字面量/数量与 r16/r24 一致（TOUCH_KEYS 0 diff）；`createTouchControls`/回放器 0 逻辑 diff。
3. 非触屏桌面：外观组隐藏、M/L 恒玻璃（竖/横屏）、桌面视觉 0 变化（AC-12）。
4. 皮肤作用域：`.touchpad--skin-*` 出现位置全部在 S 竖屏/横屏 slice 内（r24 断言守卫）；选择器 tile 类不污染该 needle（AC-12）。
5. 七套脚本全绿；verify-ui 登记改写仅 1 处（603 行，R-D6 授权），verify-persist 登记改写 0 新增，qa-e2e 纯追加。

<!-- blueprint -->
{"summary":"r26 为 r24 交付的纯视觉/设置 UI 校正：横屏侧轨由伪元素全边描边改为独立 .rail 元素单边描边（基座 display:contents 中性化 + 横屏块加 <600px 门控实现 M/L 恒行式底栏裁定）、S/横屏作用域全键正圆补 Hold、旋转主键常亮环仅强度参数（零新 token）、外观组改 2×2 radio 缩略选择器（真实皮肤 mini 预览+名称另起一行）——ui.js/persist.js 0 diff（绑定选择器式论证），verify-ui 1 处登记改写（取代 r24#AC-7 授权）+ 纯追加，qa-e2e 纯追加","modules":{"/index.html":{"responsibility":"#touch-controls 内插 .rail--l（包 .tpad-cross 4 键+✛）/.rail--r（包 .tpad-main Hold/旋转）轨道元素 + 设置弹层外观组 2×2 缩略单选标记（四 label>input[radio name=dock-skin]+tile 预览+name span，input 属性顺序/value/checked=fade 零变化）","dependsOn":[],"assemblyOrder":1,"why":"静态 DOM 契约面：六键 data-action 与 radio value 是 ui.js 绑定与验证脚本交叉的唯一锚点，rail 包裹与 name 独立 span 必须保持这些锚点逐字节不变（后代选择器兼容包裹、value 选择器兼容重构）"},"/style.css":{"responsibility":"基座 .rail display:contents 中性化；横屏块加 and (max-width:599px) 门控（AC-3 M/L 恒底栏）+ .rail--l/--r 轨道盒（212/104 单边描边/safe-area/z-index）+ 皮肤挂点 ::before/::after 迁 .rail；S/横屏作用域三键类 border-radius:50% + 旋转常亮环 color-mix(primary 55%)/图标 primary-hi；2×2 选择器基座样式（grid 1fr 1fr、48px tile、checked 描边+✓、focus 环、四皮肤 mini 预览）","dependsOn":["/index.html"],"assemblyOrder":2,"why":"视觉/媒体/作用域全收口 CSS（r17 派生样式哲学）；display:contents 中性化使竖屏/M/L 布局与 r24 逐字节等零回归风险面；皮肤挂点与选择器 tile 类刻意避开 .touchpad--skin- needle 保护 r24 皮肤作用域切片断言；门控用前缀匹配保持 verify-ui 锚点零改动"},"/scripts/verify-ui.cjs":{"responsibility":"唯一 1 处登记改写（603 行左半文本紧跟 input 断言→name-span 断言，取代 r24#AC-7 授权）+ 纯追加 §r26 段（rail DOM/display:contents/横屏门控与 M 块无皮肤/单边描边轨道盒/伪元素轨拆除/三键类正圆/常亮环 token 归零/2×2 结构/320 预算）","dependsOn":["/index.html","/style.css"],"assemblyOrder":3,"why":"沿用 r17/r24 源码结构断言先例在无布局引擎下锁定全部可断契约；登记改写边界最小化（1 处）并显式记录授权依据，满足 AC-14 出口纪律"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"纯追加 §r26：rail 结构运行时断言（恰 2、包裹关系、非键类无 data-action）+ 新结构下 radio 点击仍即时生效写持久化（对齐 r24 快照比对先例）；既有全部用例零改动回归","dependsOn":["/index.html","/style.css","/ui.js","/persist.js"],"assemblyOrder":4,"why":"行为面零变化的运行时证明——jsdom 无布局，几何/媒体断言留在 verify-ui 源码层，e2e 只证明 DOM 重组后交互路径（radio click/六键查詢/回放器）逐字节等价"},"/ui.js":{"responsibility":"0 diff 红线：dockSkin 闭包/DOCK_SKINS/applyDockSkin/[name=dock-skin] 绑定/持久化恢复/dispose 全保持 r24 现状","dependsOn":["/persist.js","/index.html"],"assemblyOrder":0,"why":"绑定全为选择器式（name/value 不变）→ DOM 结构重构零触碰；迭代原则=能被 CSS/DOM 表达的变化不进 JS"},"/persist.js":{"responsibility":"0 diff 红线：dockSkin 字段/枚举白名单/默认 fade/非法回退全保持 r24 现状","dependsOn":[],"assemblyOrder":0,"why":"持久化协议无变化；AC-14 禁止新增 verify-persist 登记改写"},"duplications":["旋转主键常亮环/正圆规则在 S 竖屏与横屏两作用域重复书写（r24 已同构重复；承继结构，§r26 断言锁两处一致）","皮肤横屏挂点（.rail）与竖屏挂点（dock 容器）双实现，语义同源（DESIGN §4.4）；已用皮肤类 needle 断言做单向漂移保护","212/104 轨道宽算式在 CSS 注释与验证断言两处重复；沿用 r24 注释+断言双锚定惯例锁值"]},"tasks":[{"title":"T1 触控 rail 包裹 + 2×2 选择器标记（index.html）","files":["/index.html"],"spec":"插 .rail--l/.rail--r 包裹双簇（六键零改名）+ 外观组 2×2 缩略单选标记（input 属性/value/checked 不变、name 入 span）"},{"title":"T2 CSS：门控/rail 化/正圆/常亮环/选择器样式（style.css）","files":["/style.css"],"spec":"横屏块加 <600px 门控、基座 display:contents、.rail 轨道盒单边描边 212/104、伪元素轨与皮肤挂点迁移、三键类正圆、旋转常亮环仅强度参数、2×2 tile/选中/聚焦/四皮肤 mini 预览样式"},{"title":"T4 验证：verify-ui 登记改写+§r26 纯追加","files":["/scripts/verify-ui.cjs"],"spec":"603 行 1 处改写 + §r26 断言段（rail/门控/轨道/正圆/常亮环/2×2/作用域防护）全绿、既有断言 0 回归"},{"title":"T5 验证：qa-e2e §r26 纯追加+收口","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"§r26 段（rail 结构/新结构 radio 点击）+ 七套全绿 + ui/persist 0 diff 证明，main 全绿后同批提交"}]}
<!-- /blueprint -->

---

<!-- state -->
{"phase":"tech","summary":"r26 技术方案已写入任务夹：横屏侧轨 .rail 元素化（基座 .touchpad .rail{display:contents} 中性化保竖屏/M/L 布局与 r24 逐字节等；横屏块 @media(orientation:landscape) 前加 and(max-width:599px) 门控落地 AC-3 M/L 恒行式底栏裁定——verify-ui landStart 锚点前缀匹配零改动）、.rail--l≈212(单边右描边)/.rail--r≈104(单边左描边，DESIGN 窄面板新增裁定)取代 ::before/::after 全边描边、皮肤挂点迁 .rail；S/横屏作用域三键类 border-radius:50%（Hold 补漏）+ 旋转常亮环 color-mix(primary 55%,transparent)+图标 primary-hi（微底 16% 维持，仅强度参数零新 token）；外观组 2×2 radio 缩略选择器（repeat(2,minmax(0,1fr))·48px tile·input:checked+tile 描边+✓ 徽标·focus-visible 环·四皮肤 mini 预览类名 dock-skin-option__tile--x 刻意避开 .touchpad--skin- needle 防作用域断言误炸·320 预算注释 250→tile125≥110）；ui.js/persist.js 0 diff（绑定/持久化全选择器式论证）；verify-ui 唯一 1 处登记改写=603 行文本紧跟 input 断言→name-span 断言（取代 r24#AC-7 授权），verify-persist 0 新增；qa-e2e 纯追加；任务 T1(index.html)→T2(style.css)→T4(verify-ui)∥T5(qa-e2e 收口)；main 保持、七套全绿后代码+任务夹同批提交","memory":["r26 TECH 裁定 R-D1~R-D6：横屏块加 max-width:599px 门控（M/L 恒行式底栏，锚点前缀匹配零改动）、rail 元素化+基座 display:contents 中性化、右轨 104px 内容收口、皮肤挂点迁 .rail、常亮环仅强度参数、verify-ui 登记改写仅 603 行 1 处","实施关键：.rail 无 data-action/无键类（回放器与六键聚合正则不命中）；簇切片断言（crossStart/mainStart/首个 </div>）在 rail 包裹下逐字节等价；基座行式底栏三件套(--glass-bg/border-top/投影)承 M/L 横屏","选择器 tile 皮肤类命名 .dock-skin-option__tile--glass/-float/-fade/-pod：避开 .touchpad--skin- 字符串，否则 r24 皮肤作用域切片断言（≥2处且全在 S/横屏 slice 内）误炸","input 属性顺序保持 type→name→value(→checked)，r24 verify-ui 598~602/603 右半零改动；qa-e2e 按 value 选择器点击零改写；ui.js [name=dock-skin] 绑定零改动","横屏 .touchpad align-items 改 stretch 撑 rail 轨高 188px，键 z-index:1 盖轨承继 r21；skin 横屏规则改 .rail 目标仍含 .touchpad--skin-* needle","七套出口：verify-game/audio/constants/assembly/persist 0 改动；verify-ui 1 登记改写+纯追加 §r26；qa-e2e 纯追加；git main 全绿同批提交"]}<!-- /state -->