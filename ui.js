/*!
 * tetris/ui.js — 科技玻璃风渲染与样式（主棋盘 Canvas + 信息面板 + 遮罩 + LEVEL UP 反馈）
 * ============================================================================
 * 任务：T9 渲染（canvas + next-well）+ T10 UI（hud + overlay + feedback）+ T11 样式桥接
 * 依据：PRD §5 / DESIGN §2.3、§3.5、§4.3、§5、§6 / TECHNICAL §3.4、§3.5
 *
 * 与 game.js 的集成（零重复职责）：
 *   - game.js 已持有：引擎/状态/时钟/游戏键盘（window 级）/失焦自动暂停 → 本文件
 *     不绑定游戏操作键，只消费 getSnapshot() 与 onSnapshot 回调（只读快照）。
 *   - v2.0 例外：静音是"设置"而非"游戏态"，M 键与首次交互解锁（AudioContext）由
 *     本文件独立监听（任意游戏态生效，AC-10.2/AC-09.6），与 game.js 键盘无冲突。
 *   - 本文件拥有：唯一游戏 Canvas 逐帧渲染、迷你预览、HUD 数值/状态灯/按钮矩阵、
 *     三态遮罩（焦点管理）、LEVEL UP toast、音量/静音控件、窗口 resize 适配。
 *
 * 对外契约（浏览器）：window.TetrisUI；Node/CommonJS 下同时 module.exports。
 *   TetrisUI.createUI(options?) → { game, dispose }   （一键装配，含游戏实例）
 *   TetrisUI.createBoardRenderer(canvas, opts?)        （签名对齐 TECHNICAL §3.4）
 *   TetrisUI.createNextWellRenderer(canvas)            （签名对齐 TECHNICAL §3.4）
 *   TetrisUI.createHud(els) / createOverlay(els) / createFeedback(els)
 *                                                      （签名对齐 TECHNICAL §3.5）
 *
 * 自动装配：ui.js 加载后若检测到应用 DOM（#board 存在），将在 DOMContentLoaded
 * 时自动 createUI() 并把句柄写入 window.__tetris（双击 index.html 即玩，AC-01）。
 * 宿主若自行装配，请在 DOMContentLoaded 前执行 window.__tetris = createUI(...)，
 * 自动装配会检测到句柄并跳过（幂等，防双实例）。
 *
 * DOM 契约（元素 ID 为技术方案 §4 + DESIGN §2.1 约定；style.css 同步实现）：
 *   body
 *   ├─ #page-bg                       背景层（玻璃折射源）
 *   ├─ #header > #title + #status(#status-dot + #status-text)
 *   ├─ #main
 *   │   ├─ #panel-left.panel
 *   │   │   ├─ #stat-score.stat    > .stat__label + .stat__value.stat__value--score
 *   │   │   ├─ #stat-level.stat    > .stat__label + .stat__value.stat__value--num
 *   │   │   ├─ #stat-lines.stat    > .stat__label + .stat__value.stat__value--num
 *   │   │   ├─ .next-well > .stat__label + #next-well（4×2 迷你 Canvas）
 *   │   │   └─ #audio-controls.audio-controls（v2.0 音量控件）
 *   │   │       ├─ #btn-mute（aria-pressed 静音切换）
 *   │   │       └─ .audio-controls__row > #btn-vol-down + #vol-value + #btn-vol-up
 *   │   ├─ #board-col > #board-frame（position:relative；tabindex="-1" 供焦点归还）
 *   │   │       ├─ #board（10×20 主 Canvas）
 *   │   │       ├─ #overlay[hidden] > #overlay-card > #overlay-title / #overlay-sub / #overlay-btn
 *   │   │       └─ #feedback-toast[hidden]（LEVEL UP 胶囊）
 *   │   └─ #panel-right.panel > #key-hints + #controls(#btn-start / #btn-pause / #btn-restart)
 *   遮罩/反馈必须作为 #board-frame 子节点（覆盖游戏板区域，非全页，DESIGN §3.2）。
 *   游戏键盘由 game.js 内部处理；按钮仅作辅助入口（点击后 blur 防空格二次触发，E9）；
 *   v2.0：M 键与 AudioContext 解锁由本文件独立监听（设置/兼容性职责，非游戏态）。
 * ============================================================================
 */
(function (root, factory) {
  'use strict'
  const api = factory()
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api
  if (typeof window !== 'undefined' && window !== null) window.TetrisUI = api
})(
  typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict'

    /* ======================================================================
     * 1. 常量（与 game.js 对齐；视觉数值以 DESIGN §3.1/§4.3 为准）
     * ==================================================================== */

    const VERSION = '2.3.0'

    // 主棋盘：10×20、格 28px（DESIGN §3.1）
    const COLS = 10
    const ROWS = 20
    const CELL = 28

    // 迷你预览：4×2、格 12px（DESIGN §3.5）
    const WELL_COLS = 4
    const WELL_ROWS = 2
    const WELL_CELL = 12

    // 动效时长（DESIGN §4.3）
    const FLASH_MS = 140   // 消行闪白
    const HUD_FLASH_MS = 120 // 数值变化高亮
    const FADE_MS = 160    // 遮罩淡入淡出
    const TOAST_MS = 800   // LEVEL UP toast（AC-06.4：800ms ± 200ms）

    // DPR 上限（E15：cap 2）
    const DPR_CAP = 2

    // 方块精灵辉光外扩边距（css px）
    const GLOW_PAD = 14

    // 渲染常量色（Canvas 不消费 CSS 变量；DESIGN §5.1 近似值）
    const BOARD_BG = 'rgba(15, 14, 22, 0.92)'
    const GRID_LINE = 'rgba(242, 242, 242, 0.06)'
    const FLASH_FILL = 'rgba(255, 255, 255, 0.85)'
    const WELL_BG = 'rgba(15, 14, 22, 0.92)'
    const WELL_GRID = 'rgba(242, 242, 242, 0.05)'

    // 幽灵块（落点预览）视觉参数（v2.2，AC-12.8；DESIGN §5.6 单一事实来源）
    // 同色系半透明空心轮廓：描边 + 极淡填充，无辉光、无顶部高光。
    // 该表为 Node 可断言参数（verify-ui / E2E），实际绘制调用见 drawGhost。
    const GHOST = {
      OUTLINE_ALPHA: 0.75, // 轮廓描边不透明度（可编程测量，AC-12.8）
      FILL_ALPHA: 0.16,    // 内部极淡填充不透明度（约 1/5 实体，凸显空心未落定）
      LINE_WIDTH: 2,       // 轮廓线宽（css px，随 DPR 由 ctx.setTransform 缩放）
    }

    // 游戏态 → UI 文本/状态（game.js 命名：READY/RUNNING/PAUSED/OVER）
    const STATUS_LABEL = {
      READY: 'READY',
      RUNNING: 'PLAYING',
      PAUSED: 'PAUSED',
      OVER: 'GAME OVER',
    }
    const STATUS_DATA = {
      READY: 'ready',
      RUNNING: 'playing',
      PAUSED: 'paused',
      OVER: 'gameover',
    }

    // 三态遮罩规格（RUNNING 不显示遮罩）
    const OVERLAY_SPEC = {
      READY: { title: '开始游戏', sub: '回车 / 空格 开始', btn: '开始游戏', state: 'ready' },
      PAUSED: { title: '已暂停', sub: '按 P / Esc 继续', btn: '继续游戏', state: 'paused' },
      OVER: { title: 'GAME OVER', sub: '', btn: '重新开始', state: 'gameover' },
    }

    /** 特性检测：浏览器是否支持 inert 属性（E13 降级为手动焦点圈禁） */
    const supportsInert = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype

    /** 点击/操作后归还焦点（E9/E-SFX-12：防空格/回车误触发按钮） */
    function blurElement(el) {
      if (el && typeof el.blur === 'function') el.blur()
    }

    /** 无音效引擎时的 no-op 降级（audio.js 缺失时兜底；AC-09.7 无声不报错） */
    function nullSfxEngine() {
      return {
        unlock: function () {},
        play: function () {},
        setVolume: function () {},
        getVolume: function () { return 0.8 },
        setMuted: function () {},
        isMuted: function () { return false },
        isAvailable: function () { return false },
        dispose: function () {},
      }
    }

    /* ======================================================================
     * 2. 渲染层：主棋盘 Canvas（签名对齐 TECHNICAL §3.4）
     * ==================================================================== */

    function roundRectPath(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2)
      c.beginPath()
      c.moveTo(x + rr, y)
      c.arcTo(x + w, y, x + w, y + h, rr)
      c.arcTo(x + w, y + h, x, y + h, rr)
      c.arcTo(x, y + h, x, y, rr)
      c.arcTo(x, y, x + w, y, rr)
      c.closePath()
    }

    /** hex 颜色 → rgba 字符串（追加目标 alpha）。接受 #rgb / #rrggbb；
     *  返回原样（若 hex 非法），供 Canvas 辉光等需要透明度的场景使用。 */
    function hexToRgba(hex, alpha) {
      if (typeof hex !== 'string') return hex
      const h = hex.replace('#', '')
      if (h.length !== 3 && h.length !== 6) return hex
      const full = h.length === 3 ? h.split('').map(function (c) { return c + c }).join('') : h
      const r = parseInt(full.slice(0, 2), 16)
      const g = parseInt(full.slice(2, 4), 16)
      const b = parseInt(full.slice(4, 6), 16)
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
    }

    /**
     * createBoardRenderer(canvas, opts?) → { render(s, fx?), resize, dispose }
     * 唯一逐帧重绘层：井底 + 网格线 + 已固定块 + 活动块 + 消行闪白叠加（140ms）。
     * 方块精灵（含辉光）预烘焙到离屏 canvas，逐帧仅 drawImage（E15，≥55 FPS）。
     */
    function createBoardRenderer(canvas, opts) {
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new Error('TetrisUI.createBoardRenderer: 需要 <canvas> 元素')
      }
      const maybeCtx = canvas.getContext('2d')
      if (!maybeCtx) throw new Error('TetrisUI.createBoardRenderer: 无法获取 2d 上下文')
      const ctx = maybeCtx
      const dprCap = (opts && opts.dprCap) || DPR_CAP
      const sprites = new Map()
      let flash = null // { lines: number[], until: number }
      let disposed = false

      function currentDpr() {
        return Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, dprCap)
      }

      function bakeSprite(type) {
        const dpr = currentDpr()
        const size = CELL + GLOW_PAD * 2
        const sprite = document.createElement('canvas')
        sprite.width = Math.round(size * dpr)
        sprite.height = Math.round(size * dpr)
        const maybeSctx = sprite.getContext('2d')
        if (!maybeSctx) throw new Error('TetrisUI.createBoardRenderer: 无法创建精灵画布')
        const sctx = maybeSctx
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        const color = TetrisGame.COLORS[type]
        // 辉光烘焙一次（shadowBlur 一次性成本；此后逐帧仅 drawImage）
        // v2.3.1（视觉收敛）：shadowBlur 10→5、光晕降 ~55% 浓度，保留霓虹质感但更清晰
        //（用户反馈 10px 满浓度辉光偏糊、如近视眼观感；AC-07「霓虹元 ≥1 种」仍满足）
        sctx.shadowColor = hexToRgba(color.glow, 0.55)
        sctx.shadowBlur = 5
        roundRectPath(sctx, GLOW_PAD, GLOW_PAD, CELL, CELL, 3)
        sctx.fillStyle = color.fill
        sctx.fill()

        // 内部压暗描边（霓虹灯管轮廓）
        sctx.shadowBlur = 0
        sctx.lineWidth = 1
        sctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'
        roundRectPath(sctx, GLOW_PAD + 0.5, GLOW_PAD + 0.5, CELL - 1, CELL - 1, 2.5)
        sctx.stroke()

        // 顶部 1px 白 25% 内高光（DESIGN §5.2）
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
        sctx.beginPath()
        sctx.moveTo(GLOW_PAD + 2, GLOW_PAD + 1.5)
        sctx.lineTo(GLOW_PAD + CELL - 2, GLOW_PAD + 1.5)
        sctx.stroke()

        return sprite
      }

      function getSprite(type) {
        let sprite = sprites.get(type)
        if (!sprite) {
          sprite = bakeSprite(type)
          sprites.set(type, sprite)
        }
        return sprite
      }

      function drawCell(type, px, py) {
        const sprite = getSprite(type)
        ctx.drawImage(sprite, px - GLOW_PAD, py - GLOW_PAD, CELL + GLOW_PAD * 2, CELL + GLOW_PAD * 2)
      }

      function drawPiece(piece) {
        const shape = TetrisGame.SHAPES[piece.type][piece.rot]
        for (let r = 0; r < shape.length; r++) {
          const row = shape[r]
          for (let c = 0; c < row.length; c++) {
            if (!row[c]) continue
            const bx = piece.x + c
            const by = piece.y + r
            if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) continue
            drawCell(piece.type, bx * CELL, by * CELL)
          }
        }
      }

      /**
       * 幽灵块（落点预览）同色半透明空心轮廓（v2.2，AC-12.8；DESIGN §5.6）。
       * 不烘焙 sprite、不入 sprites 缓存；无辉光、无顶部高光（区别于实体块）。
       * 每个占格画空心圆角矩形（内缩 0.5px 防描边溢出格界）；以 ctx.save/restore
       * 包裹，绘制后复位 globalAlpha/lineWidth，避免污染后续 drawCell（E-12-09）。
       * @param {{type:string,rot:number,x:number,y:number}} piece  y 已为 ghostY 落点
       * @param {string} type  用于取 COLORS[type].fill 同色系填色
       */
      function drawGhost(piece, type) {
        const fill = TetrisGame.COLORS[type] ? TetrisGame.COLORS[type].fill : '#ffffff'
        const shape = TetrisGame.SHAPES[type] ? TetrisGame.SHAPES[type][piece.rot] : null
        ctx.save()
        try {
          for (let r = 0; r < (shape ? shape.length : 0); r++) {
            const row = shape[r]
            for (let c = 0; c < row.length; c++) {
              if (!row[c]) continue
              const bx = piece.x + c
              const by = piece.y + r
              if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) continue
              const px = bx * CELL
              const py = by * CELL
              // 极淡同色填充（空心未落定语义，alpha 0.16）
              ctx.globalAlpha = GHOST.FILL_ALPHA
              ctx.fillStyle = fill
              roundRectPath(ctx, px + 0.5, py + 0.5, CELL - 1, CELL - 1, 2)
              ctx.fill()
              // 半透明同色轮廓描边（alpha 0.75，线宽 2）
              ctx.globalAlpha = GHOST.OUTLINE_ALPHA
              ctx.strokeStyle = fill
              ctx.lineWidth = GHOST.LINE_WIDTH
              roundRectPath(ctx, px + 0.5, py + 0.5, CELL - 1, CELL - 1, 2)
              ctx.stroke()
            }
          }
        } finally {
          ctx.restore()
        }
      }

      function drawGrid() {
        ctx.strokeStyle = GRID_LINE
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let c = 1; c < COLS; c++) {
          const x = c * CELL + 0.5
          ctx.moveTo(x, 0)
          ctx.lineTo(x, ROWS * CELL)
        }
        for (let r = 1; r < ROWS; r++) {
          const y = r * CELL + 0.5
          ctx.moveTo(0, y)
          ctx.lineTo(COLS * CELL, y)
        }
        ctx.stroke()
      }

      /**
       * render(s, fx?, ghostEnabled?)：s 为只读快照；fx.flashLines 触发 140ms 消行闪白叠加层；
       * ghostEnabled 为幽灵块辅助开关（v2.3，AC-13）：false 时不渲染幽灵轮廓，其余值（含缺省）开启。
       */
      function render(s, fx, ghostEnabled) {
        if (disposed) return
        if (fx && fx.flashLines && fx.flashLines.length > 0) {
          flash = { lines: fx.flashLines, until: performance.now() + FLASH_MS }
        }

        // 防御：渲染开头重置透明度与变换，不依赖上次 drawGhost 的 ctx 残留
        //（v2.3：幽灵开关关闭/开启态叠加渲染必须互不污染，AC-13.2）
        ctx.globalAlpha = 1

        ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL)
        ctx.fillStyle = BOARD_BG
        ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
        drawGrid()

        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const cell = s.board[row][col]
            if (cell) drawCell(cell, col * CELL, row * CELL)
          }
        }

        // 幽灵块（v2.2，AC-12）：仅 PLAYING（RUNNING 且有活动块）绘制，层级介于
        // 「已固定块」与「当前实体块」之间（AC-12.8 实体永不被遮挡）。落点由引擎
        // 纯函数 ghostY 即时重算（纯显示派生，不进快照，AC-12.6）；PAUSED 快照
        // 不变即冻结、READY/OVER 无 piece 即不绘（AC-12.9）。
        // v2.3（AC-13）：幽灵辅助开关关闭（ghostEnabled === false）时不渲染。
        if (ghostEnabled !== false && s.phase === 'RUNNING' && s.piece) {
          const gy = TetrisGame.ghostY(s.board, s.piece)
          drawGhost({ type: s.piece.type, rot: s.piece.rot, x: s.piece.x, y: gy }, s.piece.type)
        }

        if (s.piece) drawPiece(s.piece)

        if (flash) {
          if (performance.now() < flash.until) {
            ctx.fillStyle = FLASH_FILL
            for (let i = 0; i < flash.lines.length; i++) {
              const row = flash.lines[i]
              if (row >= 0 && row < ROWS) ctx.fillRect(0, row * CELL, COLS * CELL, CELL)
            }
          } else {
            flash = null
          }
        }
      }

      /** 同步画布缓冲到 DPR（cap 2）；DPR 变化后重烘焙精灵 */
      function resize() {
        if (disposed) return
        const cssW = COLS * CELL
        const cssH = ROWS * CELL
        canvas.style.width = cssW + 'px'
        canvas.style.height = cssH + 'px'
        const dpr = currentDpr()
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        sprites.clear()
      }

      function dispose() {
        disposed = true
        sprites.clear()
        flash = null
      }

      // OBS-1 修复：初始化即按 DPR 烘焙缓冲，避免高 DPI 首帧按 1× 渲染发虚
      resize()
      return { render: render, resize: resize, dispose: dispose }
    }

    /** 下一个方块迷你预览（签名对齐 TECHNICAL §3.4）：4×2、12px；琥珀金描边由 CSS 提供 */
    function createNextWellRenderer(canvas) {
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new Error('TetrisUI.createNextWellRenderer: 需要 <canvas> 元素')
      }
      const maybeCtx = canvas.getContext('2d')
      if (!maybeCtx) throw new Error('TetrisUI.createNextWellRenderer: 无法获取 2d 上下文')
      const ctx = maybeCtx
      let disposed = false

      function resize() {
        const cssW = WELL_COLS * WELL_CELL
        const cssH = WELL_ROWS * WELL_CELL
        canvas.style.width = cssW + 'px'
        canvas.style.height = cssH + 'px'
        const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, DPR_CAP)
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      function drawMiniCell(fill, px, py) {
        roundRectPath(ctx, px + 0.5, py + 0.5, WELL_CELL - 1, WELL_CELL - 1, 2)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
        ctx.beginPath()
        ctx.moveTo(px + 2, py + 1.5)
        ctx.lineTo(px + WELL_CELL - 2, py + 1.5)
        ctx.stroke()
      }

      /** render(type | null)：READY 态传 null（空预览）；旋转态 0、水平居中、垂直居中 */
      function render(type) {
        if (disposed) return
        ctx.clearRect(0, 0, WELL_COLS * WELL_CELL, WELL_ROWS * WELL_CELL)
        ctx.fillStyle = WELL_BG
        ctx.fillRect(0, 0, WELL_COLS * WELL_CELL, WELL_ROWS * WELL_CELL)
        ctx.strokeStyle = WELL_GRID
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let c = 1; c < WELL_COLS; c++) {
          const x = c * WELL_CELL + 0.5
          ctx.moveTo(x, 0)
          ctx.lineTo(x, WELL_ROWS * WELL_CELL)
        }
        for (let r = 1; r < WELL_ROWS; r++) {
          const y = r * WELL_CELL + 0.5
          ctx.moveTo(0, y)
          ctx.lineTo(WELL_COLS * WELL_CELL, y)
        }
        ctx.stroke()

        if (!type || !TetrisGame.SHAPES[type]) return
        const shape = TetrisGame.SHAPES[type][0]
        // 计算实际非零区域边界（避免矩阵空行导致偏移量为负、方块被裁剪）
        let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
              if (r < minR) minR = r
              if (r > maxR) maxR = r
              if (c < minC) minC = c
              if (c > maxC) maxC = c
            }
          }
        }
        const actualW = maxC - minC + 1
        const actualH = maxR - minR + 1
        const ox = Math.floor((WELL_COLS - actualW) / 2)
        const oy = Math.floor((WELL_ROWS - actualH) / 2)
        const fill = TetrisGame.COLORS[type].fill
        for (let r = minR; r <= maxR; r++) {
          const row = shape[r]
          for (let c = minC; c <= maxC; c++) {
            if (!row[c]) continue
            drawMiniCell(fill, (ox + c - minC) * WELL_CELL, (oy + r - minR) * WELL_CELL)
          }
        }
      }

      function dispose() {
        disposed = true
      }

      resize()
      return { render: render, dispose: dispose }
    }

    /* ======================================================================
     * 3. UI 组件（签名对齐 TECHNICAL §3.5）
     * ==================================================================== */

    /**
     * createHud(els) → { update(s), dispose }
     * 分数/等级/行数（仅变化时更新 DOM + 120ms 高亮）、四态状态灯、按钮启用矩阵
     * （DESIGN §2.3）。els: { score, level, lines, scoreBlock, levelBlock, linesBlock,
     * statusDot, statusText, btnStart, btnPause, btnRestart }
     */
    function createHud(els) {
      const timers = new Map()

      function flash(block) {
        const prev = timers.get(block)
        if (prev !== undefined) clearTimeout(prev)
        block.classList.add('is-flashing')
        timers.set(block, setTimeout(function () {
          block.classList.remove('is-flashing')
          timers.delete(block)
        }, HUD_FLASH_MS))
      }

      function setText(el, value) {
        if (el.textContent !== value) el.textContent = value
      }

      function update(s) {
        const score = String(s.score)
        if (els.score.textContent !== score) {
          setText(els.score, score)
          flash(els.scoreBlock)
        }
        const level = String(s.level)
        if (els.level.textContent !== level) {
          setText(els.level, level)
          flash(els.levelBlock)
        }
        const lines = String(s.lines)
        if (els.lines.textContent !== lines) {
          setText(els.lines, lines)
          flash(els.linesBlock)
        }

        els.statusDot.dataset.status = STATUS_DATA[s.phase] || 'ready'
        setText(els.statusText, STATUS_LABEL[s.phase] || s.phase)

        const running = s.phase === 'RUNNING'
        const paused = s.phase === 'PAUSED'
        els.btnStart.disabled = s.phase !== 'READY'
        els.btnPause.disabled = !(running || paused)
        els.btnPause.textContent = paused ? '继续' : '暂停'
        els.btnRestart.disabled = s.phase === 'READY'
      }

      function dispose() {
        timers.forEach(function (t) { clearTimeout(t) })
        timers.clear()
      }

      return { update: update, dispose: dispose }
    }

    /**
     * createOverlay(els) → { show(phase, payload?), hide(), dispose() }
     * 三态遮罩：文案/主按钮/辉光色按态切换；role="dialog" + aria-modal；
     * 打开时焦点移入主按钮，关闭归还游戏容器；Tab 焦点陷阱兜底（inert 降级）。
     * els: { overlay, title, sub, btn, gameContainer }
     */
    function createOverlay(els) {
      let hideTimer = null
      let lastFocused = null
      let open = false

      function focusables() {
        return Array.prototype.slice.call(
          els.overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(function (el) {
          return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        })
      }

      function trapTab(e) {
        if (e.key !== 'Tab' || !open) return
        const items = focusables()
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }

      function show(phase, payload) {
        const spec = OVERLAY_SPEC[phase]
        if (!spec) return // RUNNING 不显示遮罩
        if (hideTimer !== null) {
          clearTimeout(hideTimer)
          hideTimer = null
        }

        open = true
        lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

        els.overlay.dataset.state = spec.state
        els.title.textContent = spec.title
        els.sub.textContent = phase === 'OVER' ? '最终分数 ' + (payload && payload.finalScore != null ? payload.finalScore : 0) : spec.sub
        els.btn.textContent = spec.btn

        els.overlay.hidden = false
        requestAnimationFrame(function () {
          if (open) els.overlay.classList.add('is-open')
        })

        els.overlay.setAttribute('role', 'dialog')
        els.overlay.setAttribute('aria-modal', 'true')
        if (els.title.id) els.overlay.setAttribute('aria-labelledby', els.title.id)

        if (supportsInert && els.overlay.parentElement) {
          // 背景圈禁：遮罩所在板框之外的兄弟内容置 inert（特性检测降级为 Tab 陷阱）
          const parent = els.overlay.parentElement
          const siblings = parent.children
          for (let i = 0; i < siblings.length; i++) {
            const node = siblings[i]
            if (node !== els.overlay) node.inert = true
          }
        }

        els.btn.focus()
      }

      function hide() {
        if (!open) return
        open = false
        els.overlay.classList.remove('is-open')
        els.overlay.removeAttribute('role')
        els.overlay.removeAttribute('aria-modal')
        els.overlay.removeAttribute('aria-labelledby')

        if (supportsInert && els.overlay.parentElement) {
          const siblings = els.overlay.parentElement.children
          for (let i = 0; i < siblings.length; i++) {
            const node = siblings[i]
            if (node !== els.overlay) node.inert = false
          }
        }

        hideTimer = setTimeout(function () {
          els.overlay.hidden = true
          hideTimer = null
        }, FADE_MS)

        const target = els.gameContainer || lastFocused
        if (target && typeof target.focus === 'function') target.focus()
      }

      function dispose() {
        if (hideTimer !== null) clearTimeout(hideTimer)
        els.overlay.removeEventListener('keydown', trapTab)
        open = false
      }

      els.overlay.addEventListener('keydown', trapTab)
      return { show: show, hide: hide, dispose: dispose }
    }

    /**
     * createFeedback(els) → { levelUp(), dispose() }
     * LEVEL UP toast 800ms（AC-06.4）+ 板框辉光脉冲一次（伪元素 opacity 动画）。
     * els: { toast, boardFrame? }
     */
    function createFeedback(els) {
      let timer = null

      function levelUp() {
        if (timer !== null) clearTimeout(timer)
        els.toast.hidden = false
        els.toast.classList.remove('is-showing')
        void els.toast.offsetWidth // 强制 reflow 重启动画
        els.toast.classList.add('is-showing')

        if (els.boardFrame) {
          els.boardFrame.classList.remove('is-pulsing')
          void els.boardFrame.offsetWidth
          els.boardFrame.classList.add('is-pulsing')
        }

        timer = setTimeout(function () {
          els.toast.classList.remove('is-showing')
          if (els.boardFrame) els.boardFrame.classList.remove('is-pulsing')
          els.toast.hidden = true
          timer = null
        }, TOAST_MS)
      }

      function dispose() {
        if (timer !== null) clearTimeout(timer)
        timer = null
        els.toast.classList.remove('is-showing')
        els.toast.hidden = true
        if (els.boardFrame) els.boardFrame.classList.remove('is-pulsing')
      }

      return { levelUp: levelUp, dispose: dispose }
    }

    /**
     * createAudioPanel(els, engine) → { sync(), dispose }（v2.0，AC-10）
     * 音量/静音控件：M 键与按钮双入口 → engine setter → sync() 唯一 DOM 镜像点
     * （单一写入口，双入口状态天然一致，AC-10.2）。
     * els: { mute, volDown, volUp, volValue }（index.html #audio-controls，DESIGN token）。
     * 按钮点击后 blur 归还焦点（E9/E-SFX-12，防空格二次触发）。
     */
    function createAudioPanel(els, engine) {
      let disposed = false
      const step = (typeof TetrisAudio !== 'undefined' && TetrisAudio.VOLUME_STEP) || 0.1

      function fmt(v) {
        return Math.round(v * 100) + '%'
      }

      /** 唯一 DOM 镜像：aria-pressed + 文案/图标形态 + 音量数值（同步 ≤ 200ms） */
      function sync() {
        if (disposed) return
        const muted = engine.isMuted()
        els.mute.setAttribute('aria-pressed', muted ? 'true' : 'false')
        els.mute.classList.toggle('is-muted', muted)
        els.mute.textContent = muted ? '🔇 已静音' : '🔊 静音' // 形态变化（非仅颜色，AC-10.6）
        els.volValue.textContent = fmt(engine.getVolume())
      }

      function onMute() {
        engine.setMuted(!engine.isMuted())
        sync()
        blurElement(els.mute)
      }
      function onVolDown() {
        engine.setVolume(engine.getVolume() - step) // clamp 在 engine 内
        sync()
        blurElement(els.volDown)
      }
      function onVolUp() {
        engine.setVolume(engine.getVolume() + step)
        sync()
        blurElement(els.volUp)
      }

      els.mute.addEventListener('click', onMute)
      els.volDown.addEventListener('click', onVolDown)
      els.volUp.addEventListener('click', onVolUp)

      // E9/E-SFX-12：鼠标点击不抢焦点（防空格/回车误触发音量按钮）
      const guards = [els.mute, els.volDown, els.volUp].map(function (btn) {
        const guard = function (e) { e.preventDefault() }
        btn.addEventListener('mousedown', guard)
        return { btn: btn, guard: guard }
      })

      sync() // 初始镜像（80% / 未静音，AC-10.4）

      function dispose() {
        if (disposed) return
        disposed = true
        els.mute.removeEventListener('click', onMute)
        els.volDown.removeEventListener('click', onVolDown)
        els.volUp.removeEventListener('click', onVolUp)
        guards.forEach(function (entry) { entry.btn.removeEventListener('mousedown', entry.guard) })
      }

      return { sync: sync, dispose: dispose }
    }

    /* ======================================================================
     * 4. 装配 createUI —— 一键接入 game.js（持有渲染/UI 全部副作用）
     * ==================================================================== */

    /**
     * createUI(options?) → { game, dispose }
     * options:
     *   el?           查询根（默认 document；用于隔离测试/多实例）
     *   rng? / autoLoop? / keyboard? / autoPauseOnBlur?   透传给 game.js createGame
     *   onSnapshot? / onLevelUp? / onGameOver?   宿主附加回调（与内部回调串联）
     * 内部创建 game（autoLoop/keyboard 默认开启），并驱动：逐帧渲染 → HUD →
     * 遮罩同步 → 升级反馈 → 按钮绑定（点击后 blur 防空格二次触发，E9）→ resize。
     */
    function createUI(options) {
      if (typeof TetrisGame === 'undefined' || !TetrisGame.createGame) {
        throw new Error('TetrisUI.createUI: 未加载 game.js（需先引入 <script src="game.js">）')
      }
      const opts = options || {}
      const root = opts.el || document

      /* ---- 取 DOM（缺失即抛错，保证装配期暴露接线问题） ---- */
      function must(selector) {
        const el = root.querySelector(selector)
        if (!el) throw new Error('TetrisUI.createUI: 缺少必需元素 ' + selector + '（见 ui.js DOM 契约）')
        return el
      }

      const boardCanvas = must('#board')
      const nextCanvas = must('#next-well')
      const boardFrame = must('#board-frame')
      const overlayEl = must('#overlay')
      const toastEl = must('#feedback-toast')

      const hudEls = {
        score: must('#stat-score .stat__value'),
        level: must('#stat-level .stat__value'),
        lines: must('#stat-lines .stat__value'),
        scoreBlock: must('#stat-score'),
        levelBlock: must('#stat-level'),
        linesBlock: must('#stat-lines'),
        statusDot: must('#status-dot'),
        statusText: must('#status-text'),
        btnStart: must('#btn-start'),
        btnPause: must('#btn-pause'),
        btnRestart: must('#btn-restart'),
      }
      const overlayEls = {
        overlay: overlayEl,
        title: must('#overlay-title'),
        sub: must('#overlay-sub'),
        btn: must('#overlay-btn'),
        gameContainer: boardFrame,
      }

      const boardRenderer = createBoardRenderer(boardCanvas)
      const nextWell = createNextWellRenderer(nextCanvas)
      const hud = createHud(hudEls)
      const overlay = createOverlay(overlayEls)
      const feedback = createFeedback({ toast: toastEl, boardFrame: boardFrame })

      let disposed = false
      let prevSnapshot = null

      /* ---- 音效引擎与音量控件（v2.0，AC-09/AC-10） ----
         SfxEngine 生命周期 = createUI（不随 restart() 重建）→ 音量/静音跨
         「结束 → 重新开始」保持、页面刷新重置（AC-10.5）；测试可注入 opts.sfxEngine。 ---- */
      const audioEls = {
        mute: must('#btn-mute'),
        volDown: must('#btn-vol-down'),
        volUp: must('#btn-vol-up'),
        volValue: must('#vol-value'),
      }
      const sfx =
        opts.sfxEngine ||
        (typeof TetrisAudio !== 'undefined' && typeof TetrisAudio.createSfxEngine === 'function'
          ? TetrisAudio.createSfxEngine()
          : nullSfxEngine()) // audio.js 缺失兜底（AC-09.7 无声不报错）
      const audioPanel = createAudioPanel(audioEls, sfx)

      // M 键静音：设置而非游戏态 → ui.js 独立监听，任意 phase 生效（AC-10.2）；
      // game.js 键盘不拦截 'm'，无冲突；忽略系统重复（按住不连切）
      function onMuteKey(e) {
        if (e.repeat) return
        if (e.key === 'm' || e.key === 'M') {
          sfx.setMuted(!sfx.isMuted())
          audioPanel.sync()
        }
      }
      // 首次用户交互解锁 AudioContext（AC-09.6；once 语义，触发后自解绑）
      function unlockAudio() {
        sfx.unlock()
      }
      let audioListenersBound = false
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onMuteKey)
        window.addEventListener('pointerdown', unlockAudio, { once: true })
        window.addEventListener('keydown', unlockAudio, { once: true })
        audioListenersBound = true
      }

      /* ---- 幽灵块辅助开关（v2.3，AC-13） ----
         纯显示控制：仅决定渲染层是否绘制幽灵轮廓，不触引擎/数值/音效；
         会话内保持（结束 → 重开不重置）、刷新恢复默认（开启），AC-13.4。 ---- */
      const ghostBtn = must('#btn-ghost')
      let ghostEnabled = true

      // 唯一 DOM 镜像：aria-pressed + aria-label + 文案形态三信号（AC-13.5，非仅颜色）
      function syncGhostBtn() {
        ghostBtn.setAttribute('aria-pressed', ghostEnabled ? 'true' : 'false')
        ghostBtn.setAttribute('aria-label', '幽灵块辅助：' + (ghostEnabled ? '开启' : '关闭'))
        ghostBtn.textContent = ghostEnabled ? '👻 幽灵块：开' : '👻 幽灵块：关'
      }
      syncGhostBtn()

      function onGhostToggle() {
        ghostEnabled = !ghostEnabled
        syncGhostBtn()
        blurElement(this)
        // AC-13.3：回合中切换即时生效——立即以当前快照重绘，不依赖下一次按键/重力步
        renderAll(game.getSnapshot())
      }

      /* ---- 消行闪白行索引（best-effort 精确）：
         game.js 快照不含被消行索引；用上一快照的 board+piece 经其导出的纯函数
         merge/clearLines 反推（锁定前最后一次 emit 的 piece 通常即锁定块）---- */
      function flashIndicesFor(s) {
        if (!prevSnapshot || !(s.lines > prevSnapshot.lines)) return null
        if (!prevSnapshot.piece) return null
        const merged = TetrisGame.merge(prevSnapshot.board, prevSnapshot.piece)
        const res = TetrisGame.clearLines(merged)
        if (res.cleared > 0) return res.indices
        // 兜底：piece 定位偏差导致反推为空时，闪上一快照中已满的行
        const full = []
        for (let r = 0; r < ROWS; r++) {
          if (prevSnapshot.board[r].every(function (c) { return c !== null })) full.push(r)
        }
        return full.length > 0 ? full : null
      }

      function renderAll(s) {
        const fx = flashIndicesFor(s)
        boardRenderer.render(s, fx ? { flashLines: fx } : undefined, ghostEnabled)
        nextWell.render(s.phase === 'READY' ? null : s.next)
        hud.update(s)
        if (s.phase === 'RUNNING') overlay.hide()
        else overlay.show(s.phase, { finalScore: s.score })
        // GAME OVER 板框红光描边（style.css #board-frame.is-gameover，DESIGN §4.2）
        boardFrame.classList.toggle('is-gameover', s.phase === 'OVER')
        prevSnapshot = s
      }

      /* ---- 创建游戏并串联回调（只读快照消费，无反向写入） ---- */
      const game = TetrisGame.createGame({
        rng: opts.rng,
        autoLoop: opts.autoLoop !== false,
        keyboard: opts.keyboard !== false,
        autoPauseOnBlur: opts.autoPauseOnBlur !== false,
        onSnapshot: function (s) {
          renderAll(s)
          if (typeof opts.onSnapshot === 'function') opts.onSnapshot(s)
        },
        onLevelUp: function (level) {
          feedback.levelUp()
          if (typeof opts.onLevelUp === 'function') opts.onLevelUp(level)
        },
        onGameOver: function (score) {
          if (typeof opts.onGameOver === 'function') opts.onGameOver(score)
        },
        onSfx: function (name) {
          sfx.play(name) // 事件名 → 合成引擎（AC-09；发声职责唯一在 audio.js）
        },
      })

      const handle = { game: game, dispose: dispose }

      // 单例句柄：宿主手动装配（window.__tetris = createUI()）可抑制自动装配；
      // 自动装配路径在此写入，供后续 createUI 调用/测试读取。
      if (typeof window !== 'undefined' && !window.__tetris) {
        window.__tetris = handle
      }

      /* ---- 按钮（辅助入口；游戏内键盘由 game.js 处理） ---- */
      function onStart() {
        game.start()
        blurElement(this)
      }
      function onPause() {
        game.togglePause()
        blurElement(this)
      }
      function onRestart() {
        game.restart()
        blurElement(this)
      }
      function onOverlayBtn() {
        const phase = game.getPhase()
        if (phase === 'READY') game.start()
        else if (phase === 'PAUSED') game.togglePause()
        else if (phase === 'OVER') game.restart()
        blurElement(this)
      }

      hudEls.btnStart.addEventListener('click', onStart)
      hudEls.btnPause.addEventListener('click', onPause)
      hudEls.btnRestart.addEventListener('click', onRestart)
      overlayEls.btn.addEventListener('click', onOverlayBtn)
      ghostBtn.addEventListener('click', onGhostToggle)

      // E9：鼠标点击按钮不落焦点（防空格/回车二次触发按钮）
      const btnList = [hudEls.btnStart, hudEls.btnPause, hudEls.btnRestart, overlayEls.btn, ghostBtn]
      const mousedownGuards = btnList.map(function (btn) {
        const guard = function (e) {
          e.preventDefault()
        }
        btn.addEventListener('mousedown', guard)
        return { btn: btn, guard: guard }
      })

      /* ---- resize 适配（DPR 变化重烘焙，保持清晰） ---- */
      function onResize() {
        boardRenderer.resize()
      }
      if (typeof window !== 'undefined') window.addEventListener('resize', onResize)

      function dispose() {
        if (disposed) return
        disposed = true
        if (typeof window !== 'undefined') window.removeEventListener('resize', onResize)
        if (audioListenersBound && typeof window !== 'undefined') {
          window.removeEventListener('keydown', onMuteKey)
          window.removeEventListener('pointerdown', unlockAudio)
          window.removeEventListener('keydown', unlockAudio)
        }
        audioPanel.dispose()
        sfx.dispose()
        hudEls.btnStart.removeEventListener('click', onStart)
        hudEls.btnPause.removeEventListener('click', onPause)
        hudEls.btnRestart.removeEventListener('click', onRestart)
        overlayEls.btn.removeEventListener('click', onOverlayBtn)
        ghostBtn.removeEventListener('click', onGhostToggle)
        mousedownGuards.forEach(function (entry) {
          entry.btn.removeEventListener('mousedown', entry.guard)
        })
        boardRenderer.dispose()
        nextWell.dispose()
        hud.dispose()
        overlay.dispose()
        feedback.dispose()
        game.dispose()
      }

      return handle
    }

    /* ======================================================================
     * 5. 自动装配（检测应用 DOM 后于 DOMContentLoaded 装配；宿主已装配则跳过）
     * ==================================================================== */

    let autoBootAttempted = false
    function tryAutoBoot() {
      if (autoBootAttempted) return
      autoBootAttempted = true
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      // 宿主已手动装配（window.__tetris = createUI()）→ 跳过
      if (window.__tetris && typeof window.__tetris.dispose === 'function') return
      // 非本应用页面（无 #board）→ 跳过
      if (typeof document.getElementById !== 'function' || !document.getElementById('board')) return

      function boot() {
        if (window.__tetris && typeof window.__tetris.dispose === 'function') return
        window.__tetris = createUI()
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot)
      } else {
        boot()
      }
    }
    tryAutoBoot()

    /* ======================================================================
     * 5. 对外导出
     * ==================================================================== */
    return {
      VERSION: VERSION,
      COLS: COLS,
      ROWS: ROWS,
      GHOST: GHOST, // v2.2：幽灵块视觉参数表（DESIGN §5.6 单一事实来源）
      createUI: createUI,
      // 渲染/UI 组件（签名对齐 TECHNICAL §3.4 / §3.5，便于宿主独立使用与测试）
      createBoardRenderer: createBoardRenderer,
      createNextWellRenderer: createNextWellRenderer,
      createHud: createHud,
      createOverlay: createOverlay,
      createFeedback: createFeedback,
      createAudioPanel: createAudioPanel, // v2.0：音量/静音控件（AC-10，签名对齐 TECHNICAL §3.3）
    }
  }
)
