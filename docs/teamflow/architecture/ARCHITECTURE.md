# 俄罗斯方块（Tetris）简化版 — 架构与脚手架方案（ARCHITECTURE）

- 版本：v1.0
- 关联文档：`products/tetris/docs/prd/PRD.md`（v1.0，验收唯一依据）、`products/tetris/docs/design/DESIGN.md`（v1.0，视觉/交互规范）
- 定位：本文档给出**工程侧脚手架方案**（技术栈、目录结构、模块划分、依赖、构建/测试/CI、初始化步骤）。所有数值、验收口径一律以 PRD/DESIGN 为准，本文档不修改其中任何规格。
- 与 DESIGN 的分工：DESIGN 面向**交付物形态与视觉**（单文件、token、动效、可访问性）；本文档面向**工程组织**（源码分层、构建、测试、CI）。两者以「构建产物 = 单一内联 index.html」为衔接点，无冲突。

> **实际交付偏差（v1.0 交付后补注）**：本方案规划的 TS + Vite + Vitest 工程管线（`src/` 分层、构建、CI）**未在本期执行**——开发阶段按并行任务以纯 JS 扁平文件交付（`game.js` / `ui.js` / `style.css` / `index.html`，UMD 契约，零 Node 工具链），同样满足 AC-08 自包含。实际文件布局见 `README.md`「项目结构」与 `QA-REPORT.md`；本方案保留为可选工程化升级路径。

---

## 1. 现状核验与硬约束

**现状**：`tetris/` 下仅有 `PRD.md`、`DESIGN.md`，无既有代码/配置/依赖，从零搭建工程骨架；两份既有文档保持原位、不改动。

**从 PRD/DESIGN 提取的不可协商约束（脚手架必须满足）**：

| 约束 | 来源 | 对工程的含义 |
|---|---|---|
| 交付物为单一自包含 index.html，`file://` 双击即玩 | PRD §1.2/§5、AC-08 | 构建产物必须单文件内联 CSS/JS，无外部引用、无 ES Module 加载 |
| 零外部依赖、0 网络请求、断网可用 | PRD §1.3/§7.1、AC-08 | 运行时零依赖；禁止 CDN/字体/图片 |
| 10×20 板、7 方块、单点旋转（无踢墙） | PRD §5 | 引擎规则与数值以 PRD §5 为准 |
| 计分/升级/速度公式固定 | PRD §5 | `scoring.ts` 为单一事实来源，单测钉死公式 |
| 四态状态机闭环（开始/暂停/结束/重开） | PRD §4 | `state/machine.ts` 纯函数化，可单测 |
| 毛玻璃/霓虹/深色/信息面板 | DESIGN §2/§5 | token 以 DESIGN §5.1 为准，配色以 §5.2 为准 |
| 性能红线：不动画 box-shadow/backdrop-filter；单 Canvas 渲染层；`performance.now()` 差值计时 | DESIGN §4.3/§7、PRD §7.2 | 渲染与动效实现约束 |
| 兼容 Chrome/Edge ≥ 90、FF ≥ 95、Safari ≥ 15 | PRD §7.1 | 构建 target ES2020；OKLCH/backdrop-filter/inert 需降级链 |

**关于「零构建」的边界说明**：PRD 的「零构建」约束的是**交付物与玩家体验**（双击即玩、无网络、断网可用），不约束开发期源码形态。本方案采用「模块化 TS 源码 + 开发期构建 → 单文件交付物」：构建产物与 DESIGN §8「单一 index.html 内联」完全一致，AC-08 在交付物上成立；且仓库根目录**提交一份构建产物 index.html**，验收方不装 Node 也可直接双击测试。

---

## 2. 技术栈决策与取舍

**推荐方案（方案 A）**：TypeScript + Vite（`vite-plugin-singlefile`）+ Vitest；**运行时零依赖**；Node 仅作开发工具链。

| 方案 | 说明 | 结论 |
|---|---|---|
| **A. TS + Vite + singlefile + Vitest** | 模块化 TS 源码，构建产出单文件 index.html；引擎纯逻辑全量单测；dev 模式 HMR | ✅ **推荐** |
| B. 纯原生单文件（无工具链） | 直接手写 index.html 内联 JS | 备选：仅当「仓库禁止任何 Node 工具链」类硬约束存在时选用 |
| C. React + Vite | 引入 React 运行时 | ❌ 不推荐，理由见下 |

**取舍说明**：

1. **为何用 TypeScript 而非纯 JS**：引擎层（碰撞、旋转、计分、状态机）是纯逻辑，类型系统显著降低越界/状态错乱风险；`noUncheckedIndexedAccess` 直接防住棋盘数组越界这类 Tetris 高频 bug；单测价值最大的部分恰是纯函数。
2. **为何不用 React**：本游戏只有一个动态渲染面（Canvas 棋盘），DOM 面板是少量静态结构，React 组件树收益趋近于零；React 运行时（内联后约 40–60KB）违背「零依赖、首屏 ≤ 500ms」的轻量目标；rAF 游戏循环与 React 渲染周期互相纠缠，徒增复杂度。**DOM 层用原生 DOM 直写 + CSS 变量即可。**
3. **为何 Node 只做工具链不做运行时**：游戏 100% 客户端逻辑，无后端需求（PRD §3.2 明确不做后端服务）。
4. **为何保留开发期构建**：兼得「自包含交付物（AC-08）」与「工程化收益（类型检查、单测、CI 审计）」；构建产物即 DESIGN 要求的单文件。
5. **方案 B 的代价**：无类型检查、无自动化单测、多人维护风险上升；若选用，PRD 数值验收需改为人工实测 + 文档内自检清单。

---

## 3. 目录结构树

```
tetris/
├── index.html                ← 交付物：自包含单文件（npm run build 生成，提交入库，双击即玩）
├── PRD.md                    ← 既有，不改动（验收唯一依据）
├── DESIGN.md                 ← 既有，不改动（视觉/交互规范）
├── ARCHITECTURE.md           ← 本文档
├── README.md                 ← 项目说明：开发/构建/验收速览
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── .github/workflows/ci.yml  ← CI（可选，推荐）
├── scripts/
│   ├── copy-dist.mjs         ← dist/index.html → 根 index.html
│   └── check-standalone.mjs  ← AC-08 自包含审计（无外部引用/无网络引用）
└── src/
    ├── index.html            ← Vite 开发入口（仅开发用，非交付物）
    ├── main.ts               ← 组合根：装配 engine/state/input/render/ui
    ├── engine/               ← 纯逻辑层，零 DOM，全量单测
    │   ├── types.ts
    │   ├── tetromino.ts      ← 7 方块形状/4 旋转态/出生位/DESIGN §5.2 配色
    │   ├── board.ts          ← 10×20 网格、碰撞、合并、消行、出生碰撞
    │   ├── scoring.ts        ← 计分/升级/速度（PRD §5 单一事实来源）
    │   ├── queue.ts          ← 下一个方块（均匀随机，可注入 RNG）
    │   └── *.test.ts         ← 与源码同目录（Vitest 默认 glob）
    ├── state/
    │   ├── machine.ts        ← READY/PLAYING/PAUSED/GAME_OVER 状态机（纯函数）
    │   ├── game.ts           ← 会话聚合：board+当前块+next+分数+等级+行数+锁定
    │   └── loop.ts           ← rAF + performance.now() 差值计时；失焦自动暂停
    ├── input/
    │   └── keyboard.ts       ← window 级 keydown/keyup；DAS 170/100ms、软降 50ms
    ├── render/
    │   ├── canvas.ts         ← 唯一渲染层；方块精灵预渲染（辉光烘焙）
    │   └── next-well.ts      ← 下一个方块迷你预览 Canvas
    ├── ui/
    │   ├── hud.ts            ← 分数/等级/行数/状态灯/按钮可用性（DESIGN §2.3 矩阵）
    │   ├── overlay.ts        ← 三态遮罩 + 焦点管理 + aria-live + inert
    │   └── feedback.ts       ← LEVEL UP toast（800ms±200）+ 板框辉光脉冲
    └── styles/
        ├── main.css          ← @import 汇总
        ├── tokens.css        ← DESIGN §5.1 token（hex 先行 + @supports OKLCH/color-mix）
        ├── base.css          ← 背景层/网格纹理/排版
        ├── layout.css        ← 三列 grid 240/340/240、≤1100px 堆叠、1366/1920 适配
        └── components.css    ← 玻璃面板/按钮/统计块/kbd/遮罩/toast/focus/reduced-motion
```

> 注意区分：根 `index.html` 是**构建产物（交付物）**，`src/index.html` 是**开发入口**；README 与 CI 中均明确标注，避免误编辑。

---

## 4. 核心模块划分

### 4.1 引擎层 `engine/`（纯函数、零 DOM、全量单测）

| 文件 | 职责 | 关键导出（示意） | 对应 AC |
|---|---|---|---|
| `types.ts` | 共享类型：`Cell` / `TetrominoType` / `RotationState` / `Board` / `GameSnapshot` 等 | — | — |
| `tetromino.ts` | 7 方块形状矩阵（4 旋转态**预计算**）、出生位置（顶部居中、完全可见）、DESIGN §5.2 配色 | `SHAPES`、`spawn(type)`、`rotated(type, r)` | AC-02.3/4、AC-07.5 |
| `board.ts` | 10×20 网格；碰撞 / 合并 / 消行（一次最多 4 行）/ 出生碰撞（游戏结束判定） | `createBoard()`、`collides()`、`merge()`、`clearLines() → {board, cleared}` | AC-03.2/3、AC-05.1 |
| `scoring.ts` | **PRD §5 单一事实来源**：`scoreForLines(n,L)=[100,300,500,800][n−1]×L`；`levelForLines(lines)=⌊lines/10⌋+1`；`gravityMs(L)=max(100, 1000×0.85^(L−1))`。**v2.3 移除硬降加分** `dropBonus`（硬降/软降/自然落地均不加分，仅消行计分，AC-14） | `scoreForLines`、`levelForLines`、`gravityMs` | AC-06.3/5、AC-14（公式 100% 钉死） |
| `queue.ts` | 下一个方块；**均匀随机**（PRD §3.2 明确非目标：不做 7-bag）；可注入 RNG 便于测试 | `createQueue(rng)`、`next()` | AC-06.1（预览） |

### 4.2 状态层 `state/`

| 文件 | 职责 | 要点 |
|---|---|---|
| `machine.ts` | 四态状态机，纯函数 `transition(state, event) → state`；事件 `start/pause/resume/restart/lose`；按键合法性按 DESIGN §2.3 矩阵过滤 | READY：回车/空格=开始；PLAYING：全操作键；PAUSED：仅 P/Esc/R；GAME_OVER：仅 R/回车 → AC-04/05 |
| `game.ts` | 会话聚合：board + 当前块 + next + 分数 + 等级 + 行数 + 锁定逻辑；动作 `move/rotate/softDrop/hardDrop/tick/lock`；触底锁定延迟 ≤ 500ms（AC-03.5）；**v2.3 硬降不加分**（仅消行计分，AC-14）；重开全量重置（AC-05.4） | 单一时钟内完成「移动→碰撞→固定」原子处理（PRD §7.2） |
| `loop.ts` | rAF + `performance.now()` 差值累加器驱动下落（非 setInterval 堆叠）；`visibilitychange`/`window blur` → 自动暂停，恢复焦点**不**自动继续（AC-04.4）；暂停期间不累积计时，恢复后按差值续跑 | 支撑 AC-03.1 实测误差 ≤ 50ms |

### 4.3 输入层 `input/`

| 文件 | 职责 | 要点 |
|---|---|---|
| `keyboard.ts` | window 级 `keydown`/`keyup`；`preventDefault` 拦截方向键/空格防页面滚动；按当前状态过滤按键 | DAS：初始延迟 170ms、重复 100ms（≥ 8 次/秒，AC-02.1）；软降按住重复 50ms；`keyup` 终止 DAS/软降；映射表严格按 DESIGN §4.1 |

### 4.4 表现层 `render/` + `ui/`（对应 DESIGN §2.2 七个模块）

| 文件 | 职责 | 要点 |
|---|---|---|
| `render/canvas.ts` | 唯一 Canvas（10×20，唯一逐帧重绘层）；网格线、锁定块、当前块；消行闪白 140ms 叠加层 | 方块精灵**预渲染到离屏 canvas（辉光烘焙）**，逐帧仅 drawImage，避免 shadowBlur 性能陷阱；DPR 感知（上限 2）→ §1.3 FPS |
| `render/next-well.ts` | 下一个预览：迷你 Canvas 4×2、格 12px、琥珀金细描边（DESIGN §3.5） | 仅在 next 变化时重绘 |
| `ui/hud.ts` | 分数/等级/行数（`tabular-nums` + 变化高亮 120ms）、四态状态灯、按钮启用/禁用矩阵（§2.3） | DOM 仅在数值变化时更新（AC-06.1 ≤ 200ms） |
| `ui/overlay.ts` | 三态遮罩复用组件：文案/主按钮/辉光色按状态切换；`role="dialog"` + `aria-modal`；打开时焦点移入主按钮，关闭归还游戏容器；`inert` 圈禁背景（特性检测降级为手动焦点圈禁） | AC-01.2/3、AC-04.1、AC-05.3；DESIGN §6 |
| `ui/feedback.ts` | LEVEL UP toast（800ms±200，AC-06.4）+ 板框辉光脉冲一次；`prefers-reduced-motion` 降级 | 辉光一律走伪元素 opacity（不动画 box-shadow） |

### 4.5 装配与样式

- `main.ts`：组合根——取 DOM 引用、装配 engine/state/input/render/ui、resize 处理、初始 READY 态、暴露 `start/pause/restart` 给按钮与键盘。
- `styles/`：`tokens.css` 实现 DESIGN §5.1（hex 先行，`@supports (color: oklch(...))` 覆盖 OKLCH、`color-mix`）；`layout.css` 三列 240/340/240、列距 24px、≤1100px 单列堆叠、1366×768 / 1920×1080 无遮挡（AC-07.4）；`components.css` 含主/次按钮规范（深玻璃底 + 靛紫描边 + 辉光，白字对比 ≈ 13:1）与 `prefers-reduced-motion` 全量降级。

### 4.6 工具与测试 `scripts/`

- 引擎/状态单测（Vitest，`environment: 'node'`，无需 DOM/jsdom）。
- `copy-dist.mjs`、`check-standalone.mjs`（AC-08 审计，见 §6）。

---

## 5. 依赖清单

| 类别 | 依赖 | 用途 | 版本建议 |
|---|---|---|---|
| 运行时 | **无** | 构建产物零依赖，满足 PRD 零外部依赖 | — |
| 开发期 | `typescript` | 类型检查（`tsc --noEmit`） | ^5.6 |
| 开发期 | `vite` | dev 服务器 / 构建打包 | ^6（团队已有大版本可沿用） |
| 开发期 | `vite-plugin-singlefile` | 将全部 JS/CSS 内联进单一 index.html（file:// 可用） | ^2 |
| 开发期 | `vitest` | 引擎/状态单测 | ^3 |
| 可选 | `eslint` + `typescript-eslint` + `prettier` | 代码质量 | 团队规范 |
| 可选 | `@playwright/test` | file:// 场景 E2E 冒烟（AC 自动化） | 团队需要时再加 |

- 运行环境：**Node ≥ 20 LTS**（Vite 6 要求）。
- 无 `@types/node` 硬需求（构建脚本为纯 `.mjs`；`vite.config.ts` 不依赖 node API；如需再补）。

---

## 6. 构建 / 测试 / CI 配置要点

### 6.1 `package.json`（关键字段）

```json
{
  "name": "tetris",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build && node scripts/copy-dist.mjs && node scripts/check-standalone.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview",
    "check": "npm run typecheck && npm run test && npm run build"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.0.0",
    "vitest": "^3.0.0"
  }
}
```

### 6.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

### 6.3 `vite.config.ts`（root 指向 src，产物落到 dist，singlefile 内联）

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  root: 'src',                    // 开发入口 src/index.html
  base: './',                     // 相对路径，file:// 安全
  plugins: [viteSingleFile()],    // 全部 JS/CSS 内联为单一 HTML
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',             // Chrome/Edge ≥ 90、FF ≥ 95、Safari ≥ 15
    cssCodeSplit: false,
    assetsInlineLimit: 100000000, // 兜底：资源全部内联
  },
  test: {
    environment: 'node',          // 引擎纯逻辑测试，无需 DOM
  },
})
```

### 6.4 构建脚本

`scripts/copy-dist.mjs`（dist → 根 index.html，交付物提交入库）：

```js
import { copyFileSync } from 'node:fs'
copyFileSync(new URL('../dist/index.html', import.meta.url), new URL('../index.html', import.meta.url))
```

`scripts/check-standalone.mjs`（AC-08.1 审计：内联 + 无外部/网络引用）：

```js
import { readFileSync } from 'node:fs'
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const fail = (msg) => { console.error('✗ ' + msg); process.exit(1) }
if (!html.includes('<script')) fail('缺少内联 <script>')
if (!html.includes('<style')) fail('缺少内联 <style>')
if (/https?:\/\//.test(html)) fail('存在 http(s) 引用，违反 AC-08.1')
for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
  if (m[1].startsWith('//') || (m[1].startsWith('/') && !m[1].startsWith('./')))
    fail('存在外部/绝对资源引用: ' + m[1])
}
console.log(`✓ dist/index.html 自包含审计通过（${(html.length / 1024).toFixed(1)} KB）`)
```

### 6.5 CI（`.github/workflows/ci.yml`，可选但推荐）

```yaml
name: CI
on: [push, pull_request]
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: node scripts/check-standalone.mjs
      - run: git diff --exit-code -- index.html   # 提交的交付物必须与构建产物一致（防手改/过期）
      - uses: actions/upload-artifact@v4
        with: { name: tetris, path: dist/index.html }
```

### 6.6 测试要点

- 引擎/状态单测重点：**数值公式 100% 钉死**（AC-06.5 要求自动化验证 1/2/3/4 行计分）：`scoreForLines(1..4, L)`、`levelForLines(10/20/…)=2/3/…`、`gravityMs(1)=1000`、`gravityMs(2)=850`、`gravityMs(3)≈723`、下限 100。
- 碰撞/消行/旋转拒绝（AC-02.4、AC-03.2/3）、出生碰撞即结束（AC-05.1）、重开重置无残留（AC-05.4）、DAS 常量（170/100ms）。
- 可选 E2E：Playwright 以 `file://` 打开 `dist/index.html` 做冒烟（覆盖 AC-01/AC-08 自动化），按团队需要再引入。

---

## 7. 初始化步骤（可在工作区直接执行）

> 工作区 Windows 环境，以下命令在 PowerShell 执行。

```powershell
# 1) 进入项目目录（tetris/ 已存在）
cd E:\Code\OpenSource\DSH-Plugin\tetris

# 2) 初始化 npm 并安装开发依赖
npm init -y
npm install -D typescript vite vite-plugin-singlefile vitest
```

3) **落盘配置文件**（内容见 §6）：`package.json`（覆盖 scripts/devDependencies）、`tsconfig.json`、`vite.config.ts`、`scripts/copy-dist.mjs`、`scripts/check-standalone.mjs`、`.gitignore`（`node_modules/`、`dist/`；**根 index.html 不忽略**）、`README.md`、`.github/workflows/ci.yml`。

4) **创建开发入口与冒烟装配**：

`src/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TETRIS</title>
</head>
<body>
  <script type="module" src="/main.ts"></script>
</body>
</html>
```

`src/main.ts` 先放冒烟版（验证管道）：`import './styles/main.css'` + 创建 DOM 骨架/空 Canvas；`src/styles/main.css` 以 `@import` 汇总 4 个样式分片（分片可先空置）。

5) **管道冒烟（先跑通工具链，再写业务）**：

```powershell
npm run dev      # http://localhost:5173 应渲染空页面、无报错
npm run build    # 生成 dist/index.html 与根 index.html，审计通过
# 资源管理器双击 tetris\index.html，页面可打开、Console 0 报错
```

6) **按 §4 实现模块**（建议顺序）：`engine/*`（含单测全绿）→ `state/*` → `input/keyboard.ts` → `render/*` → `ui/*` → `styles/*` 完善 → 每完成一步 `npm run check`。

7) **验收**：`npm run check` 全绿后，按 PRD §2 AC-01~08 逐条手测（`file://` 双击 `index.html`，DevTools Network = 0 请求），数值类对照 PRD §5。

---

## 8. 里程碑映射（对应 PRD §8）

| 里程碑 | 本方案对应产出 | 出口标准 |
|---|---|---|
| M1 核心玩法 | `engine/` + `state/machine.ts` 基础版 + `render/canvas.ts` 最小渲染 + `input/keyboard.ts`（移动/旋转/软降/硬降） | 引擎单测全绿；AC-01/02/03/05 通过 |
| M2 计分与难度 | `scoring.ts` 接入 + 升级 + `state/loop.ts` 暂停/失焦 + `next-well.ts` | AC-04、AC-06 通过 |
| M3 视觉与交付 | `ui/`（hud/overlay/feedback）+ `styles/` 全套 + a11y + 构建审计 | AC-07、AC-08 通过；§1.3 指标达标 |
| M4 验收 | 全量回归 + `scripts/check-standalone.mjs` + CI 门禁 | AC-01~08 全过，无 P0/P1 遗留 |

---

## 9. 风险与注意

| 风险 | 缓解 |
|---|---|
| `file://` 下模块/CORS 限制 | 构建产物内联为单一 `<script>`，无 ES Module 加载；`check-standalone` 强制审计 |
| 根 `index.html` 被误当源码手改 | README + 文件头注释标注「构建产物，勿手改」；CI `git diff --exit-code` 门禁 |
| `backdrop-filter` / OKLCH / `inert` 旧浏览器不支持 | 分别按 DESIGN §5.5 降级链处理；`inert` 特性检测降级为手动焦点圈禁 |
| 数值漂移（计分/速度/升级） | `scoring.ts` 单一事实来源 + 单测钉死公式，改动必须同步测试与 PRD |
| 逐帧动效性能（≥ 55 FPS） | 辉光烘焙到离屏精灵；DOM 仅在数值变化时更新；不动画 box-shadow/backdrop-filter |
| 时钟漂移（失焦/切页） | `performance.now()` 差值计时 + 失焦自动暂停（AC-04.4） |
