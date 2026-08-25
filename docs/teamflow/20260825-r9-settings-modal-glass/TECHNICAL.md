# 俄罗斯方块（Tetris）简化版 — 技术方案：设置弹层毛玻璃风格（v3.0）

- 版本：v3.0（v2.9 → v3.0 增量：**设置弹层毛玻璃风格**——将设置项从左面板移出至齿轮图标触发的毛玻璃风格模态框，按分组展示，保持科技玻璃设计语言）
- 角色：高级全栈工程师 · 技术方案
- 关联文档：`docs/teamflow/20260825-r9-settings-modal-glass/PRD.md`（v3.0，**验收唯一依据**，AC-01~08）、`docs/teamflow/20260825-r9-settings-modal-glass/DESIGN.md`（v3.0，设置弹层视觉/交互规范）、`AGENTS.md`（§4 工程约定）、`scripts/*`（可执行契约）
- 定位：将 PRD v3.0 增量（AC-01~08 设置弹层毛玻璃风格）落实为**与流水线派发任务对齐**的接口契约、实现要点、测试策略与任务拆分。AC-01~AC-19（v2.9）为本版回归底线。
- 交付物：`index.html`（左面板精简+齿轮图标+设置弹层DOM）+ `style.css`（齿轮图标样式+弹层样式+响应式）+ `ui.js`（弹层控制逻辑+焦点管理）+ 四个验证脚本用例更新。**不改**game.js/audio.js/persist.js/游戏逻辑/数值/音效/BGM/7-bag。

### 修订记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v3.0 | 2026-08-25 | 初版技术方案：设置弹层毛玻璃风格（AC-01~08） |

---

## 1. 总体架构与数据流（v3.0 增量视角）

```
ui.js（唯一变更点，装配根扩展）
  ├─ 新增设置弹层控制逻辑（打开/关闭/焦点管理/键盘事件）
  ├─ 新增齿轮图标按钮事件监听（打开设置弹层）
  ├─ 新增设置项迁移（从左面板移至弹层内分组）
  ├─ 新增焦点陷阱（防止Tab逃逸到游戏区域）
  ├─ 新增弹层动画控制（160ms ease-out 淡入淡出）
  ▼
index.html（DOM结构重组）
  ├─ 左面板移除设置区（#audio-controls/#ghost-control/#bgm-control/#wallkick-control）
  ├─ 左面板顶部新增齿轮图标按钮（#btn-settings）
  ├─ body末尾新增设置弹层DOM（settings-modal）
  │   ├─ 弹层背景遮罩（settings-modal__backdrop）
  │   ├─ 弹层卡片（settings-modal__card）
  │   │   ├─ 弹层标题（settings-modal__title）
  │   │   ├─ 音频组（settings-group--audio）
  │   │   │   ├─ 组标题（settings-group__title）
  │   │   │   ├─ 音量控制（#audio-controls）
  │   │   │   └─ BGM开关（#btn-bgm）
  │   │   ├─ 辅助组（settings-group--assist）
  │   │   │   ├─ 组标题（settings-group__title）
  │   │   │   ├─ 幽灵块开关（#btn-ghost）
  │   │   │   └─ 踢墙旋转开关（#btn-wallkick）
  │   │   └─ 关闭按钮（settings-modal__close）
  │   └─ 焦点陷阱容器（settings-modal__focus-trap）
  ▼
style.css（弹层样式扩展）
  ├─ 新增齿轮图标按钮样式（复用.btn--secondary）
  ├─ 新增设置弹层样式（复用#overlay毛玻璃规范）
  ├─ 新增分组样式
  ├─ 新增响应式适配（移动端≤480px）
  ▼
验证脚本（回归保障）
  ├─ verify-ui.cjs：新增弹层存在性断言
  ├─ assembly-check.cjs：必需元素清单更新
  ├─ qa-e2e-jsdom.cjs：弹层交互用例
  └─ verify-game.cjs/verify-audio.cjs/verify-constants.cjs：回归不变
```

**架构决策**：
1. **UI层重组，逻辑层不变**：设置项迁移仅改变DOM位置，功能逻辑（开关状态、持久化、引擎同步）完全保持。
2. **弹层为纯UI组件**：不引入新模块，弹层控制逻辑在ui.js内实现，保持扁平纯JS架构。
3. **复用现有设计语言**：弹层完全复用`#overlay`的毛玻璃规范、动画、焦点管理，确保设计一致性。
4. **游戏状态不变**：弹层打开时游戏继续运行（不暂停），关闭后设置状态保持。

---

## 2. 数据模型与存储

### 2.1 设置项状态（沿用v2.9，零改动）

所有设置项状态仍由ui.js闭包持有，持久化仍由persist.js旁观写回：

| 设置项 | 闭包变量 | 持久化键 | 引擎同步 | DOM镜像 |
|--------|----------|----------|----------|---------|
| 音量/静音 | sfx引擎内部 | tetris.v2.settings.volume/muted | sfx.setVolume/setMuted | #btn-mute + #vol-value |
| 幽灵块 | ghostEnabled | tetris.v2.settings.ghostEnabled | 仅渲染层 | #btn-ghost |
| BGM | bgmEnabled | tetris.v2.settings.bgmEnabled | sfx.startBgm/stopBgm | #btn-bgm |
| 踢墙旋转 | wallKickEnabled | tetris.v2.settings.wallKickEnabled | game.setWallKickEnabled | #btn-wallkick |

### 2.2 弹层状态（新增）

弹层自身状态为ui.js内部状态，不持久化（每次打开重置）：

```js
// ui.js 闭包新增（非持久化，会话内保持）
let settingsModalOpen = false  // 弹层是否打开
let lastFocusedElement = null  // 打开前焦点元素（关闭后归还）
```

### 2.3 DOM结构变更（index.html）

**左面板变更**：
- 移除：`#audio-controls`、`#ghost-control`、`#bgm-control`、`#wallkick-control`
- 新增：齿轮图标按钮（`#btn-settings`）位于顶部

**新增设置弹层DOM**（body末尾，overlay之后）：
```html
<div id="settings-modal" class="settings-modal" hidden>
  <div class="settings-modal__backdrop"></div>
  <div class="settings-modal__card" role="dialog" aria-modal="true" aria-label="设置">
    <div class="settings-modal__header">
      <h2 id="settings-modal__title" class="settings-modal__title">设置</h2>
      <button type="button" class="settings-modal__close" aria-label="关闭设置">×</button>
    </div>
    <div class="settings-modal__body">
      <div class="settings-group settings-group--audio">
        <h3 class="settings-group__title">音频设置</h3>
        <div class="settings-group__content">
          <!-- 原 #audio-controls 迁移至此 -->
          <div id="audio-controls" class="audio-controls" role="group" aria-label="音量控制">
            <!-- 保持原有结构 -->
          </div>
          <!-- 原 #bgm-control 迁移至此 -->
          <div id="bgm-control" class="ghost-control" role="group" aria-label="背景音乐开关">
            <span class="stat__label">背景音乐</span>
            <button type="button" id="btn-bgm" class="btn btn--secondary btn--audio"
                    aria-pressed="false" aria-label="背景音乐：关闭">🎵 BGM：关</button>
          </div>
        </div>
      </div>
      <div class="settings-group settings-group--assist">
        <h3 class="settings-group__title">辅助设置</h3>
        <div class="settings-group__content">
          <!-- 原 #ghost-control 迁移至此 -->
          <div id="ghost-control" class="ghost-control" role="group" aria-label="幽灵块开关">
            <span class="stat__label">幽灵块</span>
            <button type="button" id="btn-ghost" class="btn btn--secondary btn--audio"
                    aria-pressed="true" aria-label="幽灵块辅助：开启">👻 幽灵块：开</button>
          </div>
          <!-- 原 #wallkick-control 迁移至此 -->
          <div id="wallkick-control" class="ghost-control" role="group" aria-label="踢墙旋转开关">
            <span class="stat__label">踢墙旋转</span>
            <button type="button" id="btn-wallkick" class="btn btn--secondary btn--audio"
                    aria-pressed="true" aria-label="踢墙旋转：开启">🔄 踢墙旋转：开</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 3. API 设计

### 3.1 ui.js — 新增设置弹层控制函数（AC-01~04, AC-06）

```js
// 设置弹层控制（内部函数，不对外导出）
function openSettingsModal() {
  if (settingsModalOpen) return
  settingsModalOpen = true
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  
  const modal = must('#settings-modal')
  modal.hidden = false
  requestAnimationFrame(function() {
    modal.classList.add('is-open')
  })
  
  // 焦点管理：移动到关闭按钮
  const closeBtn = modal.querySelector('.settings-modal__close')
  if (closeBtn) closeBtn.focus()
  
  // 启用焦点陷阱
  enableFocusTrap(modal)
  
  // 键盘事件：ESC关闭
  document.addEventListener('keydown', onSettingsModalKeyDown)
  
  // 点击外部关闭
  modal.querySelector('.settings-modal__backdrop').addEventListener('click', closeSettingsModal)
}

function closeSettingsModal() {
  if (!settingsModalOpen) return
  settingsModalOpen = false
  
  const modal = must('#settings-modal')
  modal.classList.remove('is-open')
  
  // 动画结束后隐藏
  setTimeout(function() {
    modal.hidden = true
  }, 160) // 与 #overlay 动画时长一致
  
  // 焦点返回
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus()
  }
  
  // 禁用焦点陷阱
  disableFocusTrap()
  
  // 移除键盘事件
  document.removeEventListener('keydown', onSettingsModalKeyDown)
}

function onSettingsModalKeyDown(e) {
  if (e.key === 'Escape') {
    closeSettingsModal()
  }
}
```

### 3.2 焦点陷阱实现（AC-06）

```js
// 焦点陷阱（复用 #overlay 的焦点管理模式）
let focusTrapHandler = null

function enableFocusTrap(modal) {
  const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  const focusableElements = Array.prototype.slice.call(
    modal.querySelectorAll(focusableSelectors)
  ).filter(function(el) {
    return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  })
  
  if (focusableElements.length === 0) return
  
  focusTrapHandler = function(e) {
    if (e.key !== 'Tab') return
    
    const first = focusableElements[0]
    const last = focusableElements[focusableElements.length - 1]
    
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  
  modal.addEventListener('keydown', focusTrapHandler)
}

function disableFocusTrap() {
  const modal = must('#settings-modal')
  if (focusTrapHandler) {
    modal.removeEventListener('keydown', focusTrapHandler)
    focusTrapHandler = null
  }
}
```

### 3.3 齿轮图标按钮事件（AC-01）

```js
// 齿轮图标按钮（#btn-settings）事件绑定
const settingsBtn = must('#btn-settings')
settingsBtn.addEventListener('click', function() {
  openSettingsModal()
  blurElement(this)
})
```

### 3.4 设置项迁移后的事件绑定（AC-03）

设置项DOM迁移后，事件监听器需要重新绑定或使用事件委托。推荐**事件委托**：

```js
// 事件委托：监听设置弹层内的所有按钮点击
const settingsModal = must('#settings-modal')
settingsModal.addEventListener('click', function(e) {
  const target = e.target
  
  // 关闭按钮
  if (target.classList.contains('settings-modal__close')) {
    closeSettingsModal()
    return
  }
  
  // 音量按钮（#btn-mute, #btn-vol-down, #btn-vol-up）
  if (target.id === 'btn-mute') {
    onMute.call(target)
    return
  }
  if (target.id === 'btn-vol-down') {
    onVolDown.call(target)
    return
  }
  if (target.id === 'btn-vol-up') {
    onVolUp.call(target)
    return
  }
  
  // 开关按钮（#btn-bgm, #btn-ghost, #btn-wallkick）
  if (target.id === 'btn-bgm') {
    onBgmToggle.call(target)
    return
  }
  if (target.id === 'btn-ghost') {
    onGhostToggle.call(target)
    return
  }
  if (target.id === 'btn-wallkick') {
    onWallKickToggle.call(target)
    return
  }
})
```

### 3.5 UMD 导出（对外契约，齐平）

- `window.TetrisUI` 增加两个内部函数（不对外导出）：`openSettingsModal` / `closeSettingsModal`
- `window.TetrisUI.createUI(options)` 增加弹层控制逻辑，其他接口不变

---

## 4. 前端组件与页面划分

### 4.1 HTML结构变更（index.html）

**左面板（#panel-left）变更**：
- 移除：`#audio-controls`、`#ghost-control`、`#bgm-control`、`#wallkick-control`
- 新增：齿轮图标按钮（`#btn-settings`）位于顶部，`<button id="btn-settings" class="btn btn--secondary" aria-label="打开设置">⚙ 设置</button>`

**新增设置弹层DOM**（body末尾，overlay之后）：
- 完整结构见§2.3
- 弹层为全屏遮罩+居中卡片，复用`#overlay`的毛玻璃规范

### 4.2 CSS变更（style.css）

**齿轮图标按钮样式**（复用`.btn--secondary`）：
```css
#btn-settings {
  width: 100%;
  white-space: nowrap;
  margin-bottom: var(--sp-3);
}
```

**设置弹层样式**（复用`#overlay`毛玻璃规范）：
```css
.settings-modal {
  position: fixed;
  inset: 0;
  z-index: 100; /* 高于所有其他元素 */
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 160ms ease-out;
}

.settings-modal[hidden] {
  display: none;
}

.settings-modal.is-open {
  opacity: 1;
}

.settings-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 5, 8, 0.62);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.settings-modal__card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--sp-6);
}

.settings-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-modal__title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--ink);
}

.settings-modal__close {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  color: var(--muted);
  font-size: var(--fs-lg);
  cursor: pointer;
}

.settings-modal__close:hover,
.settings-modal__close:focus-visible {
  color: var(--accent);
}

.settings-group {
  margin-bottom: var(--sp-4);
}

.settings-group__title {
  margin: 0 0 var(--sp-2) 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.settings-group__content {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
```

**响应式适配**（移动端≤480px）：
```css
@media (max-width: 480px) {
  .settings-modal__card {
    width: 95%;
    max-height: 85vh;
    padding: var(--sp-4);
  }
}
```

### 4.3 JavaScript变更（ui.js）

**弹层控制逻辑**（新增内部函数）：
- `openSettingsModal()`：打开弹层，管理焦点
- `closeSettingsModal()`：关闭弹层，返回焦点
- `onSettingsModalKeyDown()`：键盘事件（ESC关闭）
- `enableFocusTrap()` / `disableFocusTrap()`：焦点陷阱
- 事件委托：监听弹层内所有按钮点击

**左面板精简**（AC-05）：
- 移除左面板设置区DOM（由HTML变更完成）
- 齿轮图标按钮事件绑定（AC-01）

**设置项迁移**（AC-03）：
- DOM迁移由HTML变更完成
- 事件监听改为事件委托（避免DOM迁移后事件丢失）

---

## 5. 状态管理

### 5.1 弹层状态（新增，会话内保持）

```js
// ui.js 闭包新增（非持久化）
let settingsModalOpen = false  // 弹层是否打开
let lastFocusedElement = null  // 打开前焦点元素（关闭后归还）
```

### 5.2 游戏状态不变（AC-04）

弹层打开时，游戏状态完全保持：
- PLAYING态：游戏继续运行，方块继续下落
- PAUSED态：游戏保持暂停
- READY/GAME_OVER态：游戏保持原状态

弹层关闭后，设置状态保持（不重置任何开关）。

### 5.3 设置项状态同步（沿用v2.9）

所有设置项状态同步机制完全保持：
- 音量/静音：sfx引擎内部状态 + UI镜像
- 幽灵块：ghostEnabled闭包 + 渲染层同步
- BGM：bgmEnabled闭包 + sfx.startBgm/stopBgm
- 踢墙旋转：wallKickEnabled闭包 + game.setWallKickEnabled

---

## 6. 关键实现要点与边界情况

### 6.1 实现要点

| 步骤 | 实现 | 说明 |
|------|------|------|
| 1. HTML重构 | index.html左面板移除设置区，新增齿轮图标按钮 | AC-01/AC-05 |
| 2. 弹层DOM | body末尾新增设置弹层完整结构 | AC-02/AC-03 |
| 3. CSS样式 | 新增齿轮图标按钮样式+弹层样式+分组样式+响应式 | AC-07 |
| 4. 弹层控制 | ui.js新增open/close/焦点管理/键盘事件 | AC-02/AC-04/AC-06 |
| 5. 事件委托 | 弹层内按钮点击事件委托 | AC-03 |
| 6. 焦点陷阱 | Tab/Shift+Tab在弹层内循环 | AC-06 |
| 7. 验证更新 | verify-ui/assembly-check/qa-e2e用例更新 | AC-08 |

### 6.2 边界情况与防御

| 边界 | 预期行为 | 测试覆盖 |
|------|----------|----------|
| 弹层打开时游戏继续 | PLAYING态弹层打开，方块继续下落，分数继续变化 | 手动测试 |
| 弹层打开时暂停 | PAUSED态弹层打开，游戏保持暂停 | 手动测试 |
| 焦点陷阱 | Tab/Shift+Tab在弹层内循环，不会跑到游戏区域 | qa-e2e |
| ESC关闭 | 弹层打开时按ESC立即关闭 | qa-e2e |
| 点击外部关闭 | 点击弹层背景遮罩关闭弹层 | qa-e2e |
| 焦点返回 | 弹层关闭后焦点返回齿轮图标按钮 | qa-e2e |
| 设置状态保持 | 弹层关闭后所有设置状态保持不变 | verify-game |
| 移动端适配 | ≤480px弹层宽度95%，高度85vh | 手动测试 |
| 设计一致性 | 弹层视觉与#overlay完全一致（颜色/模糊/圆角/动画） | 视觉对比 |
| 七套验证全绿 | 现有验证脚本全部通过 | 自动化测试 |

### 6.3 零副作用保证

- **不改**game.js/audio.js/persist.js（引擎/音效/持久化层完全不变）
- **不改**游戏逻辑/计分/等级/速度/7-bag/幽灵块/踢墙旋转开关功能
- **不改**现有UMD契约（window.TetrisGame/TetrisAudio/TetrisUI/TetrisPersist）
- **不新增**CSS变量/布局规则/动画/组件形态
- **不新增**JS模块（弹层逻辑在ui.js内实现）
- **仅改变**UI结构：设置项从左面板移至弹层，新增齿轮图标入口

---

## 7. 测试策略

### 7.1 自动化用例（脚本级）

| 脚本 | 变更 | 覆盖AC |
|------|------|--------|
| `scripts/verify-ui.cjs` | 新增「#settings-modal 存在」、「#btn-settings 存在」、「弹层内设置项存在」契约断言 | AC-01/02/03 |
| `scripts/assembly-check.cjs` | 必需元素清单增 `#btn-settings`、`#settings-modal`、`.settings-modal__card`、`.settings-modal__close` | AC-08 |
| `scripts/qa-e2e-jsdom.cjs` | 新增「点击 #btn-settings 打开弹层」「点击关闭按钮关闭弹层」「ESC关闭弹层」「弹层内设置项功能正常」用例 | AC-01/02/04/06 |
| `scripts/verify-game.cjs` | 不变（回归） | 回归 |
| `scripts/verify-audio.cjs` | 不变（回归） | 回归 |
| `scripts/verify-constants.cjs` | 不变（回归） | 回归 |
| `scripts/verify-persist.cjs` | 不变（回归） | 回归 |

### 7.2 回归底线

- AC-01 ~ AC-19 可自动化项 100% 全绿。
- 七套验证全绿：`verify-game / verify-audio / verify-ui / verify-constants / assembly-check / verify-persist / qa-e2e-jsdom`。
- 弹层交互不破坏现有设置项功能（音量/静音/幽灵块/BGM/踢墙旋转）。

### 7.3 验证命令（产品根下执行）

```bash
node scripts/verify-game.cjs      # 引擎回归（不变）
node scripts/verify-audio.cjs     # 音效引擎回归（不变）
node scripts/verify-ui.cjs        # UI契约（新增弹层存在性断言）
node scripts/verify-constants.cjs # VERSION三模块一致（不变）
node scripts/verify-persist.cjs   # 持久化回归（不变）
node scripts/assembly-check.cjs   # 装配审计（新增弹层元素）
node scripts/qa-e2e-jsdom.cjs     # DOM E2E（新增弹层交互用例）
```

---

## 8. 任务拆分（与流水线派发对齐）

> git 约束（PRD §工程约束）：从主干最新提交新建分支 `feat/settings-modal-glass` 后实施。提交前确认工作区干净。基线 `7ae3da8`。

### T1: HTML重构 — 左面板精简+齿轮图标按钮（AC-01, AC-05）【M1】

- **文件边界**：`index.html`
- **变更内容**：
  1. 左面板（#panel-left）移除 `#audio-controls`、`#ghost-control`、`#bgm-control`、`#wallkick-control`。
  2. 左面板顶部新增齿轮图标按钮：`<button id="btn-settings" class="btn btn--secondary" aria-label="打开设置">⚙ 设置</button>`。
  3. body末尾（overlay之后）新增设置弹层完整DOM结构（见§2.3）。
- **验收标准**：左面板仅含游戏数据+齿轮图标；弹层DOM结构完整；AC-01/05验收条件满足。
- **依赖**：无。

### T2: CSS样式 — 弹层样式+齿轮图标+分组+响应式（AC-02, AC-07）【M1】

- **文件边界**：`style.css`
- **变更内容**：
  1. 新增齿轮图标按钮样式（#btn-settings，复用.btn--secondary）。
  2. 新增设置弹层样式（.settings-modal系列，复用#overlay毛玻璃规范）。
  3. 新增分组样式（.settings-group/.settings-group__title/.settings-group__content）。
  4. 新增响应式适配（移动端≤480px）。
- **验收标准**：弹层视觉与#overlay一致；响应式适配移动端；AC-02/07验收条件满足。
- **依赖**：无（可与T1并行）。

### T3: JavaScript — 弹层控制逻辑+焦点管理+事件委托（AC-02, AC-03, AC-04, AC-06）【M2】

- **文件边界**：`ui.js`
- **变更内容**：
  1. 新增弹层状态变量（settingsModalOpen/lastFocusedElement）。
  2. 新增openSettingsModal/closeSettingsModal函数。
  3. 新增焦点陷阱（enableFocusTrap/disableFocusTrap）。
  4. 新增键盘事件（ESC关闭）。
  5. 新增点击外部关闭（背景遮罩点击）。
  6. 齿轮图标按钮事件绑定。
  7. 弹层内按钮事件委托。
  8. 设置项迁移后的事件绑定（事件委托模式）。
- **验收标准**：弹层打开/关闭动画流畅；焦点陷阱防止Tab逃逸；ESC关闭；点击外部关闭；所有设置项功能正常；AC-02/03/04/06验收条件满足。
- **依赖**：T1（HTML结构存在）、T2（CSS样式存在）。

### T4: 验证脚本更新（AC-08）【M2】

- **文件边界**：`scripts/verify-ui.cjs`、`scripts/assembly-check.cjs`、`scripts/qa-e2e-jsdom.cjs`
- **变更内容**：
  1. verify-ui.cjs：新增弹层存在性断言（#settings-modal、#btn-settings、弹层内设置项）。
  2. assembly-check.cjs：必需元素清单增 #btn-settings、#settings-modal、.settings-modal__card、.settings-modal__close。
  3. qa-e2e-jsdom.cjs：新增弹层交互用例（打开/关闭/ESC/焦点/设置项功能）。
- **验收标准**：七套验证全绿；AC-08验收条件满足。
- **依赖**：T3（弹层控制逻辑存在）。

### T5: 文档同步（TECHNICAL/memory/SUMMARY）【M3】

- **文件边界**：`docs/teamflow/20260825-r9-settings-modal-glass/TECHNICAL.md`（本文档）、`docs/teamflow/memory.md`、`docs/teamflow/SUMMARY.md`
- **变更内容**：
  1. TECHNICAL记为v3.0（本文档）。
  2. memory增v3.0行 + 当前迭代记忆。
  3. SUMMARY更新tech摘要行（含v3.0 TECH归档注记）。
- **验收标准**：TECHNICAL v3.0、memory/SUMMARY登记。
- **依赖**：T1~T4（代码先绿）。

### 并行关系与推荐顺序

| 任务 | 可并行 | 说明 |
|------|--------|------|
| T1 | T2 | HTML与CSS重构互不依赖，可并行 |
| T3 | T4 | 均依赖T1+T2 |
| T5 | - | 依赖T1~T4（代码先绿） |

**推荐执行**：T1∥T2 → T3（依赖T1/T2）→ T4（依赖T3）→ T5。**git**：T1~T4落一处提交（或按文件边界拆分提交），T5文档提交；每个提交前 `git status` 确认干净。

---

## 9. 验收标准与回归底线

### 9.1 AC-01~08 专项验收

| AC | 验收点 | 自动化覆盖 |
|----|--------|------------|
| AC-01 | 齿轮图标按钮存在、可见、可点击、ARIA标签正确 | verify-ui + assembly-check + qa-e2e |
| AC-02 | 弹层打开/关闭动画流畅、200ms内、毛玻璃背景、关闭按钮、ARIA角色 | qa-e2e + 手动测试 |
| AC-03 | 弹层内设置项分组展示（音频组/辅助组）、所有设置项存在、功能正常 | verify-ui + qa-e2e + 手动测试 |
| AC-04 | 弹层关闭（关闭按钮/ESC/外部点击）、设置状态保持、游戏状态保持 | qa-e2e + 手动测试 |
| AC-05 | 左面板仅含游戏数据、无设置控件、布局整洁 | verify-ui + assembly-check |
| AC-06 | 移动端适配、键盘导航、焦点陷阱、ARIA属性 | qa-e2e + 手动测试 |
| AC-07 | 设计语言一致（颜色/模糊/圆角/动画/降级方案） | 视觉对比 + 手动测试 |
| AC-08 | 工程约束（扁平纯JS、UMD契约、验证脚本全绿） | 七套验证全绿 |

### 9.2 回归底线

- AC-01 ~ AC-19 可自动化项 100% 全绿。
- 七套验证全绿；无 P0/P1/P2 缺陷。
- 弹层交互不破坏现有设置项功能（音量/静音/幽灵块/BGM/踢墙旋转）。
- 弹层交互不破坏游戏逻辑（计分/等级/速度/7-bag）。

---

<!-- blueprint -->{"summary":"v3.0 设置弹层毛玻璃风格：UI结构重组——左面板移除设置区，新增齿轮图标入口触发全屏模态框(settings-modal)，弹层复用 #overlay 的 --glass-bg + backdrop-filter:blur(20px) saturate(140%) + --radius-lg 毛玻璃规范，按音频组/辅助组分组展示4个迁移设置项(音量/幽灵/BGM/踢墙)，开关保持原有 .btn--audio + aria-pressed 三信号模式，弹层关闭后游戏状态保持不变，焦点陷阱防止Tab逃逸，打开/关闭动画160ms ease-out 与 overlay 一致，响应式适配移动端(≤480px)，零新增 token/动效/布局，零视觉回归，改动面仅 index.html 重构 + style.css 弹层样式 + ui.js 弹层控制逻辑。","modules":{"/index.html":{"responsibility":"左面板移除设置区，新增齿轮图标按钮(#btn-settings)；body末尾新增设置弹层完整DOM(settings-modal)，按音频组/辅助组分组展示迁移的设置项","dependsOn":[],"assemblyOrder":1,"why":"HTML结构重组是本需求的基础——将设置项从左面板移至弹层，新增齿轮图标入口，为CSS和JS提供DOM目标"},"/style.css":{"responsibility":"新增齿轮图标按钮样式(.btn--secondary复用)；新增设置弹层系列样式(.settings-modal/.settings-modal__card/.settings-modal__backdrop)，复用#overlay毛玻璃规范；新增分组样式(.settings-group/.settings-group__title/.settings-group__content)；新增响应式适配(≤480px)","dependsOn":["/index.html"],"assemblyOrder":2,"why":"样式层复用现有设计语言(#overlay毛玻璃)，确保零视觉回归；响应式适配移动端；零新增CSS变量/布局规则"},"/ui.js":{"responsibility":"新增设置弹层控制逻辑：openSettingsModal/closeSettingsModal(打开/关闭+焦点管理)；焦点陷阱(enableFocusTrap/disableFocusTrap，Tab/Shift+Tab循环)；键盘事件(ESC关闭)；点击外部关闭(背景遮罩)；齿轮图标按钮事件绑定；弹层内按钮事件委托(避免DOM迁移后事件丢失)","dependsOn":["/index.html","/style.css"],"assemblyOrder":3,"why":"弹层控制逻辑在ui.js内实现，保持扁平纯JS架构；事件委托模式确保设置项迁移后事件绑定正确；焦点陷阱复用#overlay的焦点管理模式"},"/scripts/verify-ui.cjs":{"responsibility":"新增弹层存在性断言：#settings-modal存在、#btn-settings存在、弹层内设置项存在(#audio-controls/#ghost-control/#bgm-control/#wallkick-control)","dependsOn":["/index.html"],"assemblyOrder":4,"why":"UI契约自检，验证弹层DOM结构正确性，为qa-e2e提供基础断言"},"/scripts/assembly-check.cjs":{"responsibility":"必需元素清单增 #btn-settings、#settings-modal、.settings-modal__card、.settings-modal__close","dependsOn":["/index.html"],"assemblyOrder":4,"why":"装配+自包含审计，新增弹层元素必须入白名单否则审计红"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"新增弹层交互用例：点击#btn-settings打开弹层、点击关闭按钮关闭弹层、ESC关闭弹层、弹层内设置项功能正常、焦点陷阱防止Tab逃逸","dependsOn":["/ui.js"],"assemblyOrder":5,"why":"DOM E2E层覆盖弹层交互，验证打开/关闭/焦点管理/设置项功能，确保AC-01~04/06自动化覆盖"},"duplications":["弹层焦点陷阱与#overlay焦点陷阱逻辑相似（均为Tab/Shift+Tab循环），可考虑提取公共函数，但本需求为最小改动，暂保持重复（复用#overlay模式）"],"tasks":[{"title":"T1: HTML重构 — 左面板精简+齿轮图标按钮+弹层DOM","files":["/index.html"],"spec":"左面板移除#audio-controls/#ghost-control/#bgm-control/#wallkick-control；顶部新增#btn-settings齿轮图标；body末尾新增#settings-modal完整DOM结构"},{"title":"T2: CSS样式 — 弹层样式+齿轮图标+分组+响应式","files":["/style.css"],"spec":"新增#btn-settings样式(.btn--secondary复用)；新增.settings-modal系列样式(复用#overlay毛玻璃规范)；新增.settings-group分组样式；新增≤480px响应式适配"},{"title":"T3: JavaScript — 弹层控制逻辑+焦点管理+事件委托","files":["/ui.js"],"spec":"新增弹层状态变量+open/closeSettingsModal+焦点陷阱+ESC关闭+点击外部关闭；齿轮图标事件绑定；弹层内按钮事件委托"},{"title":"T4: 验证脚本更新","files":["/scripts/verify-ui.cjs","/scripts/assembly-check.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"verify-ui增弹层存在性断言；assembly-check增弹层必需元素；qa-e2e增弹层交互用例"},{"title":"T5: 文档同步","files":["/docs/teamflow/20260825-r9-settings-modal-glass/TECHNICAL.md","/docs/teamflow/memory.md","/docs/teamflow/SUMMARY.md"],"spec":"TECHNICAL记为v3.0；memory增v3.0行；SUMMARY更新tech摘要行"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"v3.0 技术方案已交付：设置弹层毛玻璃风格为 UI 结构重组——左面板移除设置区（#audio-controls/#ghost-control/#bgm-control/#wallkick-control），新增齿轮图标入口（#btn-settings）触发全屏模态框（settings-modal），弹层复用 #overlay 的 --glass-bg + backdrop-filter:blur(20px) saturate(140%) + --radius-lg 毛玻璃规范，按音频组/辅助组分组展示4个迁移设置项（音量/幽灵/BGM/踢墙），开关保持原有 .btn--audio + aria-pressed 三信号模式，弹层控制逻辑在 ui.js 内实现（open/closeSettingsModal + 焦点陷阱 + ESC关闭 + 点击外部关闭 + 事件委托），弹层关闭后游戏状态保持不变，焦点陷阱防止Tab逃逸，打开/关闭动画160ms ease-out 与 overlay 一致，响应式适配移动端(≤480px)，零新增 CSS token/动效/布局规则，零视觉回归，改动面仅 index.html 重构 + style.css 弹层样式 + ui.js 弹层控制逻辑。游戏逻辑（game.js/audio.js/persist.js）完全不变，AC-01~19回归底线不变，七套验证全绿。","version":"v3.0","memory":["v3.0 技术方案：设置弹层为 UI 结构重组，左面板移除设置区，新增齿轮图标入口触发全屏模态框","弹层复用 #overlay 的毛玻璃规范(--glass-bg + blur(20px) saturate(140%) + --radius-lg)","按音频组/辅助组分组展示4个迁移设置项，开关保持原有 .btn--audio + aria-pressed 模式","弹层控制逻辑在 ui.js 内实现（open/closeSettingsModal + 焦点陷阱 + ESC关闭 + 事件委托）","弹层关闭后游戏状态保持不变，焦点陷阱防止Tab逃逸，打开/关闭动画160ms ease-out","响应式适配移动端(≤480px)，零新增 token/动效/布局，零视觉回归","改动面仅 index.html 重构 + style.css 弹层样式 + ui.js 弹层控制逻辑，游戏逻辑完全不变","回归底线 AC-01~19(全量)+七套验证全绿；任务 T1∥T2→T3→T4→T5"]}<!-- /state -->