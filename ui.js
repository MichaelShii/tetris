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
 *     三态遮罩（焦点管理）、LEVEL UP toast + 特殊奖励 toast（r21 Combo/T-Spin 双槽）、
 *     音量/静音控件、窗口 resize 适配、触屏操控通道（r16：合成键盘事件回放器，见下）。
 *
 * 对外契约（浏览器）：window.TetrisUI；Node/CommonJS 下同时 module.exports。
 *   TetrisUI.createUI(options?) → { game, dispose }   （一键装配，含游戏实例）
 *   TetrisUI.createBoardRenderer(canvas, opts?)        （签名对齐 TECHNICAL §3.4）
 *   TetrisUI.createNextWellRenderer(canvas)            （签名对齐 TECHNICAL §3.4）
 *   TetrisUI.createHoldWellRenderer(canvas)           （r14 暂存预览，签名同 createNextWellRenderer）
 *   TetrisUI.createNextQueueRenderer(canvas)          （r15 多格预览队列 48×80，签名同 createNextWellRenderer）
 *   TetrisUI.createHud(els) / createOverlay(els) / createFeedback(els)
 *                                                      （签名对齐 TECHNICAL §3.5）
 *   TetrisUI.TOUCH_KEYS                               （r16 触屏六键回放表，单一事实来源）
 *   TetrisUI.isTouchDevice()                          （r16 触屏能力检测，Node 恒 false）
 *   TetrisUI.createTouchControls(els, game, opts?)    （r16 触屏输入控制器 → { dispose }，
 *                                                      签名风格同 createHud/createAudioPanel）
 *   TetrisUI.formatSessionTime(ms)                    （r32 会话时长格式纯函数，Node 可单测；
 *                                                      r36 起供全局统计累计时长复用）
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
 *   │   │   ├─ .hold-well > .stat__label + #hold-well（4×2 迷你 Canvas，r14 Hold 暂存）
 *   │   │   ├─ .next-well > .stat__label + #next-well（48×80 三格队列 Canvas，r15）
 *   │   │   └─ #audio-controls.audio-controls（v2.0 音量控件）
 *   │   │       ├─ #btn-mute（aria-pressed 静音切换）
 *   │   │       └─ .audio-controls__row > #btn-vol-down + #vol-value + #btn-vol-up
 *   │   ├─ #board-col > #board-frame（position:relative；tabindex="-1" 供焦点归还）
 *   │   │       ├─ #board（10×20 主 Canvas）
 *   │   │       ├─ #overlay[hidden] > #overlay-card > #overlay-title / #overlay-sub / #overlay-btn
 *   │   │       ├─ #feedback-toast[hidden]（LEVEL UP 胶囊）
 *   │   │       └─ #reward-toast[hidden]（r21 特殊奖励胶囊：Combo/T-Spin 合并文案；挂载点族既有惯例）
 *   │   └─ #panel-right.panel > #key-hints + #controls(#btn-start / #btn-pause / #btn-restart)
 *   └─ #touch-controls.touchpad（可选，r16）> 6 × .tkey[data-action]   （触屏操控区，html.has-touch 下才渲染，AC-1）
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

    // r15 多格预览队列：3 槽纵向队列窗（单 Canvas 48×80）；槽 = 既有 4×2 迷你槽位，
    // 槽间距 var(--sp-1)=4px；NEXT_SLOTS 对齐 game.js NEXT_QUEUE_SIZE 导出（AC-10）
    const QUEUE_SLOT_GAP = 4
    const NEXT_SLOTS = (typeof TetrisGame !== 'undefined' && TetrisGame.NEXT_QUEUE_SIZE) || 3
    const QUEUE_CSS_H = NEXT_SLOTS * WELL_ROWS * WELL_CELL + (NEXT_SLOTS - 1) * QUEUE_SLOT_GAP // 3*24+2*4=80

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

    // 消行动画包络（r13，AC-1 数值断言锚点；DESIGN §4.3 霓虹脉冲：渐亮→过曝→熄灭）
    // 引擎 createGame 默认 animMs 与该常量同源（240）；本表为 Node 可断言的单一事实来源
    const ANIM_MS = 240      // 动画时长 ms（验收容差 160~320）
    const ANIM_PEAK = 1.25   // 峰值乘性亮度（AC-1 下限 1.2）
    const ANIM_PEAK_T = 0.40 // 峰值到达点（占 T 比例）；渐亮段 ease-out-quart

    // r21（AC-1/AC-6）：特殊奖励 Toast（Combo/T-Spin）时长与文案常量（PRD §4 / TECHNICAL §3.1）
    // TOAST_DURATION 独立于 LEVEL UP 的 TOAST_MS=800；值域 1200~2000 由 verify-ui 断言锁定。
    const TOAST_DURATION = 1600   // 奖励 Toast 时长 ms（AC-1/AC-6）
    const REWARD_JOIN = ' · '     // 多轴合并分隔符（AC-4：T-Spin 在前 · Combo 在后）
    const T_SPIN_TIER_LABEL = {   // 展示档位名映射（零新引擎常量；键 = kind:cleared，DESIGN 文案）
      'full:1': 'Single',
      'full:2': 'Double',
      'full:3': 'Triple',
      'mini:1': 'Mini',
      'mini:2': 'Mini Double',
      'mini:3': 'Triple',
    }

    /**
     * 消行动画亮度曲线（纯函数，AC-1/AC-9 数值断言锚点）：
     * p = animProgress ∈ [0,1] → B ∈ [0, ANIM_PEAK]。
     * B(0)=1（首帧原亮度，无叠加，等于静态绘制）；渐亮 1→1.25（ease-out-quart，
     * 帧增量单调递减，可断言）；淡出 1.25→0（ease-in-quart，先慢后快；
     * 结束帧 B=0 → 塌缩帧无视觉跳变，AC-6）。色相保持：只提亮/渐隐、不换色（DESIGN §5.2）。
     */
    function pulseBrightness(p) {
      if (p <= 0) return 1
      if (p <= ANIM_PEAK_T) {
        const u = p / ANIM_PEAK_T
        const e = 1 - Math.pow(1 - u, 4)
        return 1 + (ANIM_PEAK - 1) * e // 渐亮：1 → 1.25
      }
      const w = (p - ANIM_PEAK_T) / (1 - ANIM_PEAK_T)
      return ANIM_PEAK * (1 - Math.pow(w, 4)) // 淡出：1.25 → 0
    }

    /** 系统减弱动态偏好（r13，AC-7）：matchMedia 存在且命中 reduced → 动画时长降级为 0（即时消除）。
     *  typeof 守卫：jsdom/Node 无 matchMedia 时安全返回 false。 */
    function prefersReducedMotion() {
      return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    /**
     * r21（AC-4/AC-5/AC-7）：奖励合并文案纯函数（新 UI API，Node 可单测）。
     * payload = clearing 期快照载荷直取：{ tspin, combo, comboBonus, cleared, level }。
     * 返回合并文案 string；全 0 / 无有效轴 → null（AC-5 不弹）。轴序：T-Spin 在前、Combo 在后，
     * 以 REWARD_JOIN 分隔（AC-4）。数值同源：
     *   - Combo 轴 = comboBonus **直读载荷**（引擎 finishLock 已累加同一值，sec AC-7）；
     *   - T-Spin 轴 = TetrisGame.tspinBonus(kind, cleared, level) 同函数同参数派生（与引擎恒等，
     *     乘数取动画期快照 level = 升级前 level）。
     * 防御：comboBonus 非正数 / tspin 非 mini|full / cleared<1 / level<1 → 跳过对应轴；
     * TetrisGame 缺失（Node 直 require 场景）→ T-Spin 轴跳过（typeof 守卫，与 NEXT_SLOTS 同风格）。
     */
    function buildRewardText(p) {
      const parts = []
      // 轴序：T-Spin 在前、Combo 在后（AC-4/DESIGN；合并序见文案模板『T-Spin Double +1200 · Combo ×2 +100』）
      if (
        p &&
        (p.tspin === 'full' || p.tspin === 'mini') &&
        typeof p.cleared === 'number' &&
        p.cleared >= 1 &&
        typeof TetrisGame !== 'undefined' &&
        TetrisGame.tspinBonus
      ) {
        const b = TetrisGame.tspinBonus(p.tspin, p.cleared, p.level) // 与引擎同函数同参数 → 恒等（AC-7）
        if (b > 0) {
          const label = T_SPIN_TIER_LABEL[p.tspin + ':' + p.cleared] // 映射缺失 → 最小形态『T-Spin +bonus』（PRD 允许）
          parts.push('T-Spin' + (label ? ' ' + label : '') + ' +' + b) // 'T-Spin Single +800'
        }
      }
      if (p && typeof p.comboBonus === 'number' && p.comboBonus > 0 && p.combo >= 1) {
        parts.push('Combo ×' + p.combo + ' +' + p.comboBonus) // 'Combo ×2 +100'
      }
      // 轴序：T-Spin 在前 · Combo 在中 · B2B 末尾追加（r21 合并规则扩展为三轴，AC-9）；
      // B2B 轴 = 载荷 b2bBonus 直读（引擎 finishLock 已累加同一值 → 与结算恒等，AC-9 同源）；
      // 防御：b2bBonus 非正数 / 缺省 / NaN → 轴跳过 → 既有双轴文案零变化（AC-9/E10）
      if (p && typeof p.b2bBonus === 'number' && p.b2bBonus > 0) {
        parts.push('B2B +' + p.b2bBonus) // 'B2B +400'
      }
      return parts.length > 0 ? parts.join(REWARD_JOIN) : null
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

        // r13（AC-1）：动画帧被消行由下方 anim 分支接管（霓虹脉冲），静态遍历跳过 → 未消除行逐像素不变
        const animRows = fx && fx.anim ? fx.anim.indices : null
        for (let row = 0; row < ROWS; row++) {
          if (animRows && animRows.indexOf(row) !== -1) continue
          for (let col = 0; col < COLS; col++) {
            const cell = s.board[row][col]
            if (cell) drawCell(cell, col * CELL, row * CELL)
          }
        }

        // r13（AC-1/AC-8，动画帧）：霓虹脉冲——被消行不立即消失，按动画进度提亮/渐隐
        //（引擎快照驱动，UI 无自有计时器；暂停快照 frozen → 自动冻帧，AC-4）。
        // 每格 ≤2 基元：渐亮 = 烘焙 sprite 原样 + 白热叠加；淡出 = 整体渐隐至 0（结束帧 B=0）。
        if (fx && fx.anim) {
          const B = pulseBrightness(fx.anim.progress)
          for (let ai = 0; ai < fx.anim.indices.length; ai++) {
            const row = fx.anim.indices[ai]
            if (row < 0 || row >= ROWS) continue
            for (let col = 0; col < COLS; col++) {
              if (!s.board[row][col]) continue
              const px = col * CELL
              const py = row * CELL
              if (B >= 1) {
                drawCell(s.board[row][col], px, py) // 基元1：烘焙 sprite 原样
                if (B > 1) {
                  // 基元2：白热叠加，不透明度 ∝ 亮度增量（1 → 峰值 1.25 全白）
                  ctx.globalAlpha = (B - 1) / (ANIM_PEAK - 1)
                  ctx.fillStyle = '#ffffff'
                  roundRectPath(ctx, px, py, CELL, CELL, 3)
                  ctx.fill()
                  ctx.globalAlpha = 1
                }
              } else {
                ctx.globalAlpha = B // 淡出：整体渐隐至 0（色相不变，DESIGN §5.2）
                drawCell(s.board[row][col], px, py)
                ctx.globalAlpha = 1
              }
            }
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

    /** r15 抽取共享：迷你格绘制（含顶部高光），px/py = 格左上角（css px）。
     *  自 createNextWellRenderer/createHoldWellRenderer 逐格绘制体抽取，行为逐字节等价。 */
    function drawMiniCell(ctx, fill, px, py) {
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

    /** r15 抽取共享：单槽 rot0 迷你方块绘制。ox/oy = 槽内原点（css px）；
     *  水平/垂直居中逻辑为既有实现原样保留；两既有渲染器以 (0, 0) 调用，行为逐字节等价。 */
    function drawMiniPieceAt(ctx, type, ox, oy) {
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
      const baseX = Math.floor((WELL_COLS - actualW) / 2)
      const baseY = Math.floor((WELL_ROWS - actualH) / 2)
      const fill = TetrisGame.COLORS[type].fill
      for (let r = minR; r <= maxR; r++) {
        const row = shape[r]
        for (let c = minC; c <= maxC; c++) {
          if (!row[c]) continue
          drawMiniCell(ctx, fill, ox + (baseX + c - minC) * WELL_CELL, oy + (baseY + r - minR) * WELL_CELL)
        }
      }
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

        // r15：逐格绘制体抽取为共享 drawMiniPieceAt（(0, 0) 调用，行为逐字节等价）
        drawMiniPieceAt(ctx, type, 0, 0)
      }

      function dispose() {
        disposed = true
      }

      resize()
      return { render: render, dispose: dispose }
    }

    /** Hold 暂存方块迷你预览（r14，签名同 createNextWellRenderer）：4×2、12px；琥珀金描边由 CSS 提供 */
    function createHoldWellRenderer(canvas) {
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new Error('TetrisUI.createHoldWellRenderer: 需要 <canvas> 元素')
      }
      const maybeCtx = canvas.getContext('2d')
      if (!maybeCtx) throw new Error('TetrisUI.createHoldWellRenderer: 无法获取 2d 上下文')
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

      /** render(type | null)：null = 空预览；旋转态 0、水平居中、垂直居中 */
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

        // r15：逐格绘制体抽取为共享 drawMiniPieceAt（(0, 0) 调用，行为逐字节等价）
        drawMiniPieceAt(ctx, type, 0, 0)
      }

      function dispose() {
        disposed = true
      }

      resize()
      return { render: render, dispose: dispose }
    }

    /** 多格预览队列渲染器（r15，签名对齐 createNextWellRenderer）：单 Canvas
     *  WELL_COLS×12 × QUEUE_CSS_H（默认 48×80，3 槽 y 偏移 0/28/56）；
     *  canvas 透明——板底/描边/辉光由 .next-well 容器承担（DESIGN 裁决 A 案）。
     *  render(queue|null)：queue 可含 null 空槽（不绘制，容器板底留白，AC-4）；
     *  r22 起由调用方门控：READY 传 null 留白，start 后才渲染队列（取代 r15 AC-1）。 */
    function createNextQueueRenderer(canvas) {
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new Error('TetrisUI.createNextQueueRenderer: 需要 <canvas> 元素')
      }
      const maybeCtx = canvas.getContext('2d')
      if (!maybeCtx) throw new Error('TetrisUI.createNextQueueRenderer: 无法获取 2d 上下文')
      const ctx = maybeCtx
      let disposed = false

      function resize() {
        const cssW = WELL_COLS * WELL_CELL
        const cssH = QUEUE_CSS_H
        canvas.style.width = cssW + 'px'
        canvas.style.height = cssH + 'px'
        const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, DPR_CAP)
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      /** render(queue | null)：每槽绘制 rot0 迷你块；槽 y = i*(槽高+间距) → 0/28/56 */
      function render(queue) {
        if (disposed) return
        ctx.clearRect(0, 0, WELL_COLS * WELL_CELL, QUEUE_CSS_H)
        if (!queue) return
        for (let i = 0; i < NEXT_SLOTS; i++) {
          const type = queue[i] || null
          if (type) drawMiniPieceAt(ctx, type, 0, i * (WELL_ROWS * WELL_CELL + QUEUE_SLOT_GAP))
          // 空槽：不绘制 → 容器板底色自然留白（AC-4）
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
     * createFeedback(els) → { levelUp(), reward(text), clearReward(), dispose() }（r21 扩）
     * LEVEL UP toast 800ms（AC-06.4，行为零改动）+ 板框辉光脉冲一次（伪元素 opacity 动画）。
     * els: { toast, boardFrame?, rewardToast? }
     *   rewardToast（r21 可选键）：特殊奖励 Toast 槽（#reward-toast）；缺省时 reward() no-op、
     *   clearReward()/dispose() 仅处理既有槽——请求兼容（缺槽不抛、返回键兼容，AC-11）。
     * reward(text)：与 levelUp() 同构的单定时器替换模式（独立 rewardTimer，与 LEVEL UP 互不干扰）：
     *   clearTimeout → textContent → hidden=false → 去 .is-showing → 强制 reflow 重启 → 加 .is-showing
     *   → rewardTimer = setTimeout(…去类 + hidden=true, TOAST_DURATION)。只动类/文本/定时器，
     *   无板框脉冲、无音效（AC-12）；显示期内新结算直接替换、不堆积。
     */
    function createFeedback(els) {
      let timer = null
      let rewardTimer = null

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

      /** r21：特殊奖励 Toast（独立定时器；缺槽 no-op，向后兼容） */
      function reward(text) {
        if (!els.rewardToast) return // 请求兼容：缺槽静默（R3 零污染）
        if (rewardTimer !== null) clearTimeout(rewardTimer)
        els.rewardToast.textContent = text
        els.rewardToast.hidden = false
        els.rewardToast.classList.remove('is-showing')
        void els.rewardToast.offsetWidth // 强制 reflow 重启动画（替换不堆积）
        els.rewardToast.classList.add('is-showing')
        rewardTimer = setTimeout(function () {
          els.rewardToast.classList.remove('is-showing')
          els.rewardToast.hidden = true
          rewardTimer = null
        }, TOAST_DURATION)
      }

      /** r21：即时清空奖励槽（0 残留；OVER/restart 路径，含缺槽守卫） */
      function clearReward() {
        if (rewardTimer !== null) {
          clearTimeout(rewardTimer)
          rewardTimer = null
        }
        if (els.rewardToast) {
          els.rewardToast.classList.remove('is-showing')
          els.rewardToast.hidden = true
        }
      }

      function dispose() {
        if (timer !== null) clearTimeout(timer)
        timer = null
        els.toast.classList.remove('is-showing')
        els.toast.hidden = true
        if (els.boardFrame) els.boardFrame.classList.remove('is-pulsing')
        clearReward() // r21：双槽一并清理（OVER/restart 走既有 dispose 路径扩清）
      }

      return { levelUp: levelUp, reward: reward, clearReward: clearReward, dispose: dispose }
    }

    /**
     * createAudioPanel(els, engine, onChange?) → { sync(), dispose }（v2.0，AC-10）
     * 音量/静音控件：M 键与按钮双入口 → engine setter → sync() 唯一 DOM 镜像点
     * （单一写入口，双入口状态天然一致，AC-10.2）。
     * els: { mute, volDown, volUp, volValue }（index.html #audio-controls，DESIGN token）。
     * 按钮点击后 blur 归还焦点（E9/E-SFX-12，防空格二次触发）。
     * onChange?（v2.6 可选）：真实变更点（onMute/onVolDown/onVolUp）触发一次，用于持久化
     * 旁观写回；初始 sync() 不触发（避免装配即多写一次默认值）。
     */
    function createAudioPanel(els, engine, onChange) {
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

      function notify() {
        if (typeof onChange === 'function') onChange()
      }

      function onMute() {
        engine.setMuted(!engine.isMuted())
        sync()
        notify()
        blurElement(els.mute)
      }
      function onVolDown() {
        engine.setVolume(engine.getVolume() - step) // clamp 在 engine 内
        sync()
        notify()
        blurElement(els.volDown)
      }
      function onVolUp() {
        engine.setVolume(engine.getVolume() + step)
        sync()
        notify()
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
     * 3b. 触屏输入通道（r16，AC-1~14；依据 PRD §5.1 / TECHNICAL §3.3）
     *     触屏不是第二套输入逻辑，而是"键盘事件的回放器"：touch down/up 合成为与
     *     实体键相同 key 码、bubbles:true 的 KeyboardEvent 派发，复走 game.js 既有
     *     held/startKeyRepeat/updateHeld（DAS/软降时钟）与 keyAction 分发表——
     *     零新速率常量（PRD §8 红线）、引擎零改动。"逐键等效"由构造保证而非口头承诺。
     * ==================================================================== */

    // 触屏六键回放表（.action 与 index.html .tkey[data-action] 六值一一对应，verify-ui 交叉断言
// 防漂移）；r31 语义修订：触控键=动作级分发（game.input），不再合成键盘事件，与键盘绑定解耦
// （改绑 action 的主键不影响触屏按键）；.key 字段保留为「该动作的默认绑定键」——
// verify-ui 以此断言「默认键表下触屏与键盘逐键等效」护栏。
    const TOUCH_KEYS = [
      { action: 'moveLeft', key: 'ArrowLeft', holdable: true },
      { action: 'moveRight', key: 'ArrowRight', holdable: true },
      { action: 'rotate', key: 'ArrowUp', holdable: false },
      { action: 'softDrop', key: 'ArrowDown', holdable: true },
      { action: 'hardDrop', key: ' ', holdable: false },
      { action: 'hold', key: 'c', holdable: false },
    ]

    // r24 操作区背景四皮肤枚举（与 persist.DOCK_SKINS / index.html radio value 三处单一事实
    // 来源，verify-ui 交叉断言防漂移；值域与 persist 深等）
    const DOCK_SKINS = ['glass', 'float', 'fade', 'pod']

    // r24 纯函数：全量移除四皮肤类再添加目标类（防快速连续切换双类残留竞争，裁定 D4 的
    // class 层面配套）；非枚举输入（含空/缺失）不加类返回 false；幂等；无 DOM 亦可 Node 单测
    function applyDockSkin(el, skin, skins) {
      if (!el) return false
      const set = skins || DOCK_SKINS
      ;(set).forEach(function (s) {
        el.classList.remove('touchpad--skin-' + s)
      })
      if (set.indexOf(skin) === -1) return false
      el.classList.add('touchpad--skin-' + skin)
      return true
    }

    /* ======================================================================
     * 2.6 r31 自定义按键——纯函数区（键名显示表 / 绑定工具 / 默认表合并；
     *     Node 可单测；与 persist.normalizeKey/isBindableKey 语义一致，verify-ui 交叉断言防漂移）
     * ==================================================================== */

    // 9 动作固定序（对齐 persist.KEY_ACTIONS = game.GAME_BIND_ACTIONS + mute，交叉断言）
    const KEYBIND_ACTIONS = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotate', 'hold', 'togglePause', 'restart', 'mute']

    // 动作展示文案（DESIGN §2.1 线框；一行一个可交互元素）
    const KEYBIND_LABELS = {
      moveLeft: '左移',
      moveRight: '右移',
      softDrop: '软降',
      hardDrop: '硬降',
      rotate: '旋转',
      hold: 'Hold 暂存',
      togglePause: '暂停',
      restart: '重新开始',
      mute: '静音',
    }

    // 键名显示表（normalize → 可见字符；DESIGN §4.2：可见字符不依赖 shape 字符防读屏丢失）
    const KEY_DISPLAY = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', ' ': '空格' }

    /** keycap 键名展示（箭头/空格归一；其余单字符大写；未知键原样） */
    function keyDisplayLabel(key) {
      if (typeof key !== 'string') return ''
      const k = key === ' ' ? ' ' : key.toLowerCase()
      if (Object.prototype.hasOwnProperty.call(KEY_DISPLAY, k)) return KEY_DISPLAY[k]
      return k.length === 1 ? k.toUpperCase() : k
    }

    /** 键名规范化（与 persist.normalizeKey 同构；persist 缺失时本函数兜底） */
    function normalizeKbKey(key) {
      if (typeof key !== 'string' || key.length === 0) return null
      const s = key === ' ' ? ' ' : key.trim()
      if (s.length === 0) return null
      return s.toLowerCase()
    }

    // 黑名单键（与 persist.FORBIDDEN_KEYS 同构；组合键由捕获层按 ctrlKey/altKey/metaKey 拒绝）
    const KB_FORBIDDEN = {
      tab: 1, enter: 1, escape: 1, capslock: 1, shift: 1, control: 1, ctrl: 1, alt: 1,
      altgraph: 1, meta: 1, contextmenu: 1, numlock: 1, scrolllock: 1, pause: 1, insert: 1,
      delete: 1, home: 1, end: 1, pageup: 1, pagedown: 1, backspace: 1, printscreen: 1,
    }
    const KB_ARROWS = { arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1 }

    /** 可绑定键判定（与 persist.isBindableKey 同构） */
    function isKbLegalKey(key) {
      const s = normalizeKbKey(key)
      if (s === null) return false
      if (KB_FORBIDDEN[s]) return false
      if (/^f\d{1,2}$/.test(s)) return false
      if (s.length === 1) return true
      return KB_ARROWS[s] === true
    }

    /** 默认键表（game.js 单一事实来源；Node/未加载 game.js 时回退模块内常量双声明（verify-ui 交叉断言）） */
    const DEFAULT_KEYS_LOCAL = {
      moveLeft: 'arrowleft', moveRight: 'arrowright', softDrop: 'arrowdown', hardDrop: ' ',
      rotate: 'arrowup', hold: 'c', togglePause: 'p', restart: 'r', mute: 'm',
    }
    function defaultKeyBindingsMap() {
      const d = (typeof TetrisGame !== 'undefined' && TetrisGame.DEFAULT_KEYBINDINGS) || null
      if (d) return Object.assign({}, d, DEFAULT_KEYS_LOCAL) // game.js 提供时以其为准
      return Object.assign({}, DEFAULT_KEYS_LOCAL)
    }

    /** 合并绑定表（默认 ∪ 自定义；仅接受可绑定键，非法忽略；persist 侧已白名单清洗，此处双保险） */
    function mergeKeyBindings(custom) {
      const out = defaultKeyBindingsMap()
      if (custom && typeof custom === 'object') {
        for (let i = 0; i < KEYBIND_ACTIONS.length; i++) {
          const a = KEYBIND_ACTIONS[i]
          if (isKbLegalKey(custom[a])) out[a] = normalizeKbKey(custom[a])
        }
      }
      return out
    }

    // 触屏设备检测（r21 语义收窄，原 r16 §5.8 全能力检测）：**主指针为粗指针**
    // （matchMedia('(pointer: coarse)')，手机/平板）才显示触控键——触屏笔记本/触屏显示器
    // PC 的主指针是鼠标，不再显示（用户裁定，r21 任务夹；右轨 z-order 缺陷同轮修复）。
    // Node（window 未定义）恒 false；jsdom 的 matchMedia 恒 matches:false → 恒 false，
    // 既有 E2E 默认路径零变化；opts.touch:true 强制注入测试（混合设备真触屏用户仍可用
    // 键盘/鼠标游玩，功能无损）。
    function isTouchDevice() {
      if (typeof window === 'undefined') return false
      try {
        if (typeof window.matchMedia === 'function') {
          const mq = window.matchMedia('(pointer: coarse)')
          return !!(mq && mq.matches)
        }
      } catch (e) {
        /* 检测失败按非触屏处理，不抛（兜底不中断） */
      }
      return false
    }

    /**
     * createTouchControls(els, game, opts?) → { dispose }（r16）
     * els:  { pad }  #touch-controls 触屏操控区元素（缺失抛错：缺少 #touch-controls）
     * game: createGame 实例（getPhase() RUNNING 守卫；合成事件由窗口级键盘层消费）
     * opts: { root? } 合成事件派发目标（默认 document；事件 bubbles:true 冒泡到 window）
     *
     * 每键四类输入源 → 同一"发声点"（TECHNICAL §3.3）：
     *   touchstart       → preventDefault + RUNNING 守卫 + activeKeys 注册 + 派发合成 keydown
     *   touchend/cancel  → preventDefault + activeKeys 释放 + 派发合成 keyup
     *   keydown(Enter/Space 聚焦键) → preventDefault + stopPropagation + tap()
     *   click（鼠标/笔，混合设备）  → tap()
     * tap() = RUNNING 守卫 + keydown + keyup（短按单步：keydown 注册 held 后即释放 → 恰好 1 格）
     * 长按由 touchstart 只派 keydown → game.js held Map 注册 → 既有 DAS/软降 repeat 时钟驱动。
     */
    function createTouchControls(els, game, opts) {
      if (!els || !els.pad) {
        throw new Error('TetrisUI.createTouchControls: 缺少 #touch-controls（触屏操控区元素，见 index.html DOM 契约）')
      }
      const pad = els.pad
      const root = (opts && opts.root) || (typeof document !== 'undefined' ? document : null)
      const activeKeys = new Set() // action 级激活集合：多指各键独立、同键重复忽略（AC-9）

      // 合成键盘事件（与 qa-e2e 既有 key()/keyUp() 辅助器同构，行为逐字节等于真实按键）
      function dispatch(type, key) {
        if (!root) return
        let ev = null
        try {
          ev = new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true })
        } catch (e) {
          // jsdom/老旧环境兜底：无 key 字段则以 defineProperty 补足（不抛）
          if (typeof window !== 'undefined' && typeof window.Event === 'function') {
            ev = new window.Event(type, { bubbles: true, cancelable: true })
          }
        }
        if (ev && typeof ev.key === 'undefined') {
          try { Object.defineProperty(ev, 'key', { value: key }) } catch (e2) { /* 忽略 */ }
        }
        if (ev) root.dispatchEvent(ev)
      }

      // AC-2 守卫：仅 RUNNING 下派发（PAUSED/OVER 点击无输入、无副作用、无音效）；
      // 空格在此不会触发 game.js 任何阶段键——触屏键=游戏输入（动作级分发），
      // 暂停恢复仍由现有按钮/P 键负责（避免语义偏差）。
      function isRunning() {
        return typeof game === 'object' && game !== null && typeof game.getPhase === 'function' && game.getPhase() === 'RUNNING'
      }

      // 短按单步：down+up → 动作首击（held 注册）后即释放 → 恰好 1 步（holdable 键语义不变：
      // moveLeft/moveRight=1 格、softDrop=1 格；rotate/hardDrop/hold=单发）
      function tap(action) {
        if (!isRunning()) return
        gameInput(action, true)
        gameInput(action, false)
      }

      // r31（DESIGN D-6）：动作级分发——优先 game.input（触控键=动作，不依赖键盘绑定键，
      // 改绑不影响触控；held 标签 'touch:<action>' 与绑定键字符串不冲突）；旧引擎回退
      // 合成键盘事件（TOUCH_KEYS.key 回放表，行为与 r16 逐字节等价）。
      function gameInput(action, down) {
        if (typeof game === 'object' && game !== null && typeof game.input === 'function') {
          game.input(action, down)
          return
        }
        dispatch(down === false ? 'keyup' : 'keydown', entryKeyFor(action))
      }
      function entryKeyFor(action) {
        for (let i = 0; i < TOUCH_KEYS.length; i++) {
          if (TOUCH_KEYS[i].action === action) return TOUCH_KEYS[i].key
        }
        return null
      }

      // 容器级防默认行为（AC-8）：.touchpad 无交互子节点区域一律 preventDefault（防滚动/缩放/选中/长按菜单）
      const onPadTouch = function (e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault()
      }
      pad.addEventListener('touchstart', onPadTouch, { passive: false })
      pad.addEventListener('touchmove', onPadTouch, { passive: false })

      const handles = TOUCH_KEYS.map(function (entry) {
        const keyBtn = pad.querySelector('.tkey[data-action="' + entry.action + '"]')
        if (!keyBtn) {
          throw new Error('TetrisUI.createTouchControls: 缺少触屏键 .tkey[data-action=' + entry.action + ']（见 index.html DOM 契约）')
        }
        const onTouchStart = function (e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault() // AC-8 + 抑制合成 click（AC-9 连点不双发）
          if (activeKeys.has(entry.action)) return // 同键已激活（快连点/多指同键）→ 忽略，防抖动式重复（TECHNICAL §5.2）
          if (!isRunning()) return // AC-2：PAUSED/OVER 仅 preventDefault，不派发
          activeKeys.add(entry.action)
          gameInput(entry.action, true) // 动作级分发 → 引擎 held 注册 + 首击；长按由既有时钟驱动
        }
        const onTouchEnd = function (e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault()
          if (!activeKeys.has(entry.action)) return
          activeKeys.delete(entry.action)
          gameInput(entry.action, false) // 释放 → 引擎 held 删除 + stopKeyRepeat（window blur 后为无害 no-op）
        }
        const onKeyDown = function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault() // 取消默认按钮激活（不产生 click 双发）
          e.stopPropagation() // 阻断冒泡到 window，防 game.js 键盘层二次吸收同一按键（AC-10 细化）
          tap(entry.action)
        }
        const onClick = function () {
          tap(entry.action) // 仅鼠标/笔（混合设备）；触屏路径已被 touchstart/touchend preventDefault 抑制
        }
        keyBtn.addEventListener('touchstart', onTouchStart, { passive: false })
        keyBtn.addEventListener('touchend', onTouchEnd, { passive: false })
        keyBtn.addEventListener('touchcancel', onTouchEnd, { passive: false })
        keyBtn.addEventListener('keydown', onKeyDown)
        keyBtn.addEventListener('click', onClick)
        return { btn: keyBtn, onTouchStart: onTouchStart, onTouchEnd: onTouchEnd, onKeyDown: onKeyDown, onClick: onClick }
      })

      function dispose() {
        pad.removeEventListener('touchstart', onPadTouch)
        pad.removeEventListener('touchmove', onPadTouch)
        handles.forEach(function (h) {
          h.btn.removeEventListener('touchstart', h.onTouchStart)
          h.btn.removeEventListener('touchend', h.onTouchEnd)
          h.btn.removeEventListener('touchcancel', h.onTouchEnd)
          h.btn.removeEventListener('keydown', h.onKeyDown)
          h.btn.removeEventListener('click', h.onClick)
        })
        activeKeys.clear()
      }
      return { dispose: dispose }
    }

    /* ======================================================================
     * 3c. r32 会话时长格式化（formatSessionTime）+ r36 移除「本局统计」整卡：
     *     r36 删除「本局统计」面板（含其只读渲染组件与状态跳变播报），
     *     仅保留 formatSessionTime 纯函数（供 r34 全局统计累计时长复用）。
     *     数据源：game.js 快照 sessionTimeMs（有效时长 ms，暂停不计、OVER 定格）。
     *     动效全复用既有 .is-flashing + stat-flash（120ms，HUD_FLASH_MS），零新增关键帧。
     * ==================================================================== */

    /** r32：会话时长格式化纯函数（格式锚点，verify-ui 断言矩阵）。
     *  ms → `mm:ss`（<1h，分秒前导零），≥1h 自动 `hh:mm:ss`（时无前导零）；
     *  <1s 取整为 0；非数 / NaN / Infinity / 负数 → '00:00' 防御（对齐 E6 风格）。
     *  与 buildRewardText 同风格：展示格式化纯函数居 ui.js、Node 可单测。
     *  实现与 r32 TECHNICAL §3.3 A 参考代码逐行同构。 */
    function formatSessionTime(ms) {
      const total = typeof ms === 'number' && isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const sec = total % 60
      const pad = function (n) { return String(n).padStart(2, '0') }
      return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : pad(m) + ':' + pad(sec)
    }

    /**
     * r34：全局统计只读渲染组件（签名 r36 起对齐 createHud → { update, dispose }）。
     * els: { placed, lines, time, games }——#gs-placed-value / #gs-lines-value /
     *   #gs-time-value / #gs-games-value（createUI 内 must()×4 装配，缺失即抛错）。
     * 只读镜像 persist 载荷（禁独立累计，AC-4 漂移红线）：update(payload) 接受**部分**载荷
     *   { placed?, lines?, timeMs?, games? }，缺省字段跳过；值文本变更才写 + 行级 .is-flashing
     *   闪动（120ms，复用 stat-flash）；timeMs 经 formatSessionTime（mm:ss / ≥1h hh:mm:ss，与 r32 同函数）。
     * flash 小段与 createHud 刻意重复（≤8 行，不抽公共 helper——抽离须改既有组件，
     * 违反既有逻辑零改红线；r32/r34 已接受此受控重复，承继同款理由）。
     */
    function createGlobalStats(els) {
      const timers = new Map()

      function flash(block) {
        if (!block) return
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

      function setNum(el, value) {
        const t = String(value)
        if (el.textContent !== t) {
          setText(el, t)
          flash(el.parentElement)
        }
      }

      function update(p) {
        if (!p || typeof p !== 'object') return
        if (typeof p.placed === 'number') setNum(els.placed, p.placed)
        if (typeof p.lines === 'number') setNum(els.lines, p.lines)
        if (typeof p.timeMs === 'number') setNum(els.time, formatSessionTime(p.timeMs))
        if (typeof p.games === 'number') setNum(els.games, p.games)
      }

      function dispose() {
        timers.forEach(function (t) { clearTimeout(t) })
        timers.clear()
      }

      return { update: update, dispose: dispose }
    }

    /* ======================================================================
     * 3e. r37 全网排行榜弹层组件工厂（纯追加独立组件；签名平行 createHud/createGlobalStats
     *      → { dispose }）。职责分界（r37 TECH §3.3）：leaderboard.js 纯逻辑无 DOM，
     *      DOM 组件工厂归 ui.js——复用 must()/焦点陷阱/Esc/背板已有基建：
     *      ① createLeaderboardPanel：榜单弹层（#leaderboard-modal 开合 / 三态渲染 /
     *         总榜周榜 aria-pressed 互斥切换零请求 / api.degraded → 设置组隐藏 / 昵称行刷新）；
     *      ② createNicknamePrompt：昵称弹层（#nickname-modal，首弹确认=持久化+续提、
     *         设置修改=仅持久化、取消=静默放弃本局提交）。
     *     弹层互斥（DESIGN 裁定）：开新弹层前先关设置弹层（见 createUI 接线处）——
     *     本文件不直接引用 closeSettingsModal，由接线层组合驱动。
     * ==================================================================== */

    /** 焦点陷阱选择器（镜像 createUI 内 enableFocusTrap 的既有清单，独立绑定副本） */
    const LB_TRAP_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    /**
     * createLeaderboardPanel(els, api) → { open, close, refreshNickname, dispose }
     * els: { settingsGroup, nicknameValue, btnEditNickname, btnOpenLeaderboard,
     *        modal, modalClose, tabTotal, tabWeekly, list, stateEl }（createUI 内 must() 解析传入）
     * api: leaderboard 句柄（degraded / fetchBoards——契约见 leaderboard.js §3.2）。
     * 状态机（r37 TECH §4.2）：closed → opening(loading] → data(总榜|周榜) | error(暂不可用+重试) |
     *   empty(暂无成绩) → closed；数据缓存于弹层，tab 切换仅改渲染视图（零请求），重开重新拉取（零轮询）。
     * 弹层开合镜像 settings-modal 既有模式：hidden 属性 + rAF 加 .is-open + 160ms 后 hidden 复位；
     * Esc/焦点陷阱/背板×关闭均独立绑定（互斥保证同刻仅一陷阱）。
     */
    function createLeaderboardPanel(els, api) {
      let isOpen = false
      let openRafId = null
      let keyHandler = null
      let trapHandler = null
      let cached = null // { ok:true, all, week } | { ok:false }
      let activeView = 'total' // 'total' | 'weekly'
      let loadSeq = 0 // 竞态守卫：重开/关闭使在途 fetch 结果作废
      let disposed = false

      // AC-8：degraded → 设置组保持 hidden（index.html 默认 hidden，激活才移除——DESIGN §2.1）
      els.settingsGroup.hidden = api.degraded ? true : false

      function renderState(kind) {
        // kind: 'loading' | 'error' | 'empty'
        els.list.innerHTML = ''
        els.stateEl.hidden = false
        els.stateEl.textContent = ''
        if (kind === 'loading') {
          els.stateEl.textContent = '加载中…'
        } else if (kind === 'empty') {
          els.stateEl.textContent = '暂无成绩，快去创造纪录'
        } else {
          els.stateEl.textContent = '暂不可用'
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'btn btn--secondary'
          btn.textContent = '重试'
          btn.addEventListener('click', onRetry)
          els.stateEl.appendChild(btn)
        }
      }

      function renderList(rows) {
        els.list.innerHTML = ''
        rows.forEach(function (item, i) {
          const rank = i + 1
          const li = document.createElement('li')
          li.className = 'lb-row'
          const cell = function (cls, label, text) {
            const el = document.createElement('span')
            el.className = cls
            el.setAttribute('aria-label', label)
            el.textContent = text
            return el
          }
          li.appendChild(cell('lb-rank' + (rank <= 3 ? ' lb-rank--top' : ''), '第 ' + rank + ' 名', String(rank)))
          li.appendChild(cell('lb-name', '昵称 ' + item.nickname, String(item.nickname)))
          li.appendChild(cell('lb-score', '分数 ' + item.score, String(item.score)))
          li.appendChild(cell('lb-level', '等级 ' + item.level, String(item.level)))
          li.appendChild(cell('lb-lines', '消除 ' + item.lines, String(item.lines)))
          els.list.appendChild(li)
        })
        els.stateEl.hidden = true
        els.stateEl.textContent = ''
      }

      function render() {
        if (!cached) return
        if (!cached.ok) { renderState('error'); return }
        const rows = activeView === 'total' ? cached.all : cached.week
        if (!rows || rows.length === 0) { renderState('empty'); return }
        renderList(rows)
      }

      function load() {
        const seq = ++loadSeq
        renderState('loading')
        api.fetchBoards().then(function (res) {
          if (disposed || seq !== loadSeq) return
          cached = res
          render()
        })
      }

      function onRetry() {
        load()
        blurElement(this)
      }

      function switchView(view) {
        if (disposed || activeView === view) return
        activeView = view
        els.tabTotal.setAttribute('aria-pressed', view === 'total' ? 'true' : 'false')
        els.tabWeekly.setAttribute('aria-pressed', view === 'weekly' ? 'true' : 'false')
        if (cached) render() // 已缓存 → 切换零请求
      }

      function onTabTotalClick() { switchView('total'); blurElement(this) }
      function onTabWeeklyClick() { switchView('weekly'); blurElement(this) }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          e.stopPropagation() // 阻断 window 级游戏键盘（镜像 settings-modal Esc 约定）
          close()
        }
      }

      function enableTrap() {
        const focusables = Array.prototype.slice.call(
          els.modal.querySelectorAll(LB_TRAP_SELECTOR)
        ).filter(function (el) {
          return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        })
        if (focusables.length === 0) return
        trapHandler = function (e) {
          if (e.key !== 'Tab') return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus()
          }
        }
        els.modal.addEventListener('keydown', trapHandler)
      }

      function disableTrap() {
        if (trapHandler) {
          els.modal.removeEventListener('keydown', trapHandler)
          trapHandler = null
        }
      }

      function open() {
        if (isOpen || disposed || api.degraded) return
        isOpen = true
        els.modal.hidden = false
        openRafId = requestAnimationFrame(function () {
          openRafId = null
          // 关闭竞态守卫：关闭已发生在该帧之前则不补加动画类
          if (isOpen) els.modal.classList.add('is-open')
        })
        if (els.modalClose && typeof els.modalClose.focus === 'function') els.modalClose.focus()
        document.addEventListener('keydown', onKeyDown)
        enableTrap()
        load()
      }

      function close() {
        if (!isOpen) return
        isOpen = false
        loadSeq++ // 在途 fetch 结果作废
        if (openRafId !== null) { cancelAnimationFrame(openRafId); openRafId = null }
        els.modal.classList.remove('is-open')
        setTimeout(function () {
          if (!isOpen) els.modal.hidden = true
        }, 160) // 与 #overlay 动画时长一致
        document.removeEventListener('keydown', onKeyDown)
        disableTrap()
        // D8：焦点统一回 #btn-settings（恒在，避免焦点丢失）
        const sb = document.getElementById('btn-settings')
        if (sb && typeof sb.focus === 'function') sb.focus()
      }

      /** refreshNickname(value)——昵称行从 persist 回读刷新（value: string|null） */
      function refreshNickname(value) {
        const name = value || null
        els.nicknameValue.textContent = name || '未设置'
        els.nicknameValue.classList.toggle('is-set', !!name)
      }

      function dispose() {
        if (disposed) return
        disposed = true
        close() // 复位弹层（含 esc/陷阱/计时清理；D8 焦点落 #btn-settings）
        els.tabTotal.removeEventListener('click', onTabTotalClick)
        els.tabWeekly.removeEventListener('click', onTabWeeklyClick)
      }

      els.tabTotal.addEventListener('click', onTabTotalClick)
      els.tabWeekly.addEventListener('click', onTabWeeklyClick)

      return { open: open, close: close, refreshNickname: refreshNickname, dispose: dispose }
    }

    /**
     * createNicknamePrompt(els, api, opts?) → { open, dispose }
     * els: { modal, input, error, confirm, cancel }（createUI 内 must() 解析传入）
     * api: leaderboard 句柄（setNickname/submitPending/cancelPendingSubmission）
     * opts.onApplied?: 确认持久化成功后的回调（createUI 接线：昵称行刷新）
     * 打开者二（r37 TECH §3.3）：① 首弹——api.onNeedNickname 回调（OVER 后置门槛，input 空）；
     *   ② 设置「修改」——预填当前昵称。确认语义按打开者区分：首弹 confirm → setNickname+
     *   submitPending（续提）；设置 confirm → setNickname 仅持久化（§5#5）；取消 → cancelPendingSubmission
     *   + 关弹层（本次不上榜，静默）；非法 → #nm-error role=alert 显示且不关闭。
     * 输入时即时按 D3 剔除非法字符（input 事件内 sanitize 回写 + maxlength=12 由 HTML 属性保证）。
     */
    function createNicknamePrompt(els, api, opts) {
      const opt = opts || {}
      let isOpen = false
      let mode = 'first' // 'first'（首弹确认→续提）| 'edit'（修改→仅持久化）
      let openRafId = null
      let keyHandler = null
      let trapHandler = null
      let disposed = false

      function showError(msg) {
        els.error.textContent = msg
        els.error.hidden = false
      }

      function clearError() {
        els.error.textContent = ''
        els.error.hidden = true
      }

      function onInput() {
        // D3 即时剔除：仅保留白名单字符集（白名单以 worker 正则为准，双端同规应收紧同源）
        const clean = String(els.input.value).replace(/[^\p{L}\p{N} _\-·.]/gu, '')
        if (clean !== els.input.value) els.input.value = clean
        clearError()
      }

      function onConfirm() {
        const name = els.input.value
        const ok = api.setNickname(name)
        if (!ok) {
          // 非法（空/清洗后超长/首字符空白或符号）：显示错误不关闭
          showError(name.trim() === '' ? '昵称不能为空' : '昵称包含不支持的字符，请使用字母、数字、中文、空格、_、-、·、.')
          return
        }
        if (mode === 'first') api.submitPending() // 首弹确认 → 续提（该局已提交的不回溯重提）
        clearError()
        if (typeof opt.onApplied === 'function') opt.onApplied(name)
        close()
      }

      function onCancel() {
        api.cancelPendingSubmission() // 取消 = 放弃本次提交（静默，无残留；edit 模式无待提交为 no-op）
        close()
      }

      function onBackdropClick(e) {
        if (e.target && e.target.classList && e.target.classList.contains('nm-modal__backdrop')) onCancel()
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          e.stopPropagation() // 阻断 window 级游戏键盘（镜像 settings-modal Esc 约定）
          onCancel()
        }
      }

      function enableTrap() {
        const focusables = Array.prototype.slice.call(
          els.modal.querySelectorAll(LB_TRAP_SELECTOR)
        ).filter(function (el) {
          return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        })
        if (focusables.length === 0) return
        trapHandler = function (e) {
          if (e.key !== 'Tab') return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus()
          }
        }
        els.modal.addEventListener('keydown', trapHandler)
      }

      function disableTrap() {
        if (trapHandler) {
          els.modal.removeEventListener('keydown', trapHandler)
          trapHandler = null
        }
      }

      function close() {
        if (!isOpen) return
        isOpen = false
        if (openRafId !== null) { cancelAnimationFrame(openRafId); openRafId = null }
        els.modal.classList.remove('is-open')
        setTimeout(function () {
          if (!isOpen) els.modal.hidden = true
        }, 160)
        document.removeEventListener('keydown', onKeyDown)
        disableTrap()
        // D8：焦点统一回 #btn-settings
        const sb = document.getElementById('btn-settings')
        if (sb && typeof sb.focus === 'function') sb.focus()
      }

      /** open(m, prefill)——m: 'first'|'edit'；prefill: 设置修改预填的当前昵称 */
      function open(m, prefill) {
        if (isOpen || disposed) return
        mode = m === 'edit' ? 'edit' : 'first'
        els.input.value = typeof prefill === 'string' ? prefill : ''
        clearError()
        isOpen = true
        els.modal.hidden = false
        openRafId = requestAnimationFrame(function () {
          openRafId = null
          if (isOpen) els.modal.classList.add('is-open')
        })
        if (els.input && typeof els.input.focus === 'function') els.input.focus()
        document.addEventListener('keydown', onKeyDown)
        enableTrap()
      }

      function dispose() {
        if (disposed) return
        disposed = true
        close()
        els.confirm.removeEventListener('click', onConfirm)
        els.cancel.removeEventListener('click', onCancel)
        els.input.removeEventListener('input', onInput)
        els.modal.removeEventListener('click', onBackdropClick)
      }

      els.confirm.addEventListener('click', onConfirm)
      els.cancel.addEventListener('click', onCancel)
      els.input.addEventListener('input', onInput)
      els.modal.addEventListener('click', onBackdropClick)

      return { open: open, dispose: dispose }
    }

    /* ======================================================================
     * 4. 装配 createUI —— 一键接入 game.js（持有渲染/UI 全部副作用）
     * ==================================================================== */

    /**
     * createUI(options?) → { game, dispose }
     * options:
     *   el?           查询根（默认 document；用于隔离测试/多实例）
     *   rng? / autoLoop? / keyboard? / autoPauseOnBlur?   透传给 game.js createGame
     *   onSnapshot? / onLevelUp? / onGameOver?   宿主附加回调（与内部回调串联）；
     *                  onGameOver(score, snap?)——r37 起第二参 snap 为 OVER 定格帧快照
     *                  （prevSnapshot，D4；仅加参，既有宿主只读首参零影响）
     *   persist?      （v2.6 可选）应用层持久化句柄 = TetrisPersist.createPersistence()；
     *                 提供则启动恢复四设置+回填 HUD 最高分、onSnapshot 只增不减写回；
     *                 缺失即等效旧版（不持久化、零影响，向后兼容）。
     *   leaderboard?  （r37 可选）全网排行榜逻辑句柄 = TetrisLeaderboard.createLeaderboard({persist})；
     *                 提供则装配两弹层组件（榜单/昵称）+ 设置组激活态；缺失即等效旧版
     *                 （组件不装配、设置组保持 hidden，向后兼容——对齐 persist 可选模式）。
     * 内部创建 game（autoLoop/keyboard 默认开启），并驱动：逐帧渲染 → HUD →
     * 遮罩同步 → 升级反馈 → 按钮绑定（点击后 blur 防空格二次触发，E9）→ resize。
     */
    function createUI(options) {
      if (typeof TetrisGame === 'undefined' || !TetrisGame.createGame) {
        throw new Error('TetrisUI.createUI: 未加载 game.js（需先引入 <script src="game.js">）')
      }
      const opts = options || {}
      const root = opts.el || document
      // 消行动画时长（r13，AC-7）：显式 opts.animMs > reduced-motion 检测 > 默认 240。
      // E2E 传 animMs:0 即绕过 matchMedia（jsdom 无 matchMedia，typeof 守卫安全）。
      const animMs = opts.animMs !== undefined ? opts.animMs : prefersReducedMotion() ? 0 : ANIM_MS

      /* ---- 取 DOM（缺失即抛错，保证装配期暴露接线问题） ---- */
      function must(selector) {
        const el = root.querySelector(selector)
        if (!el) throw new Error('TetrisUI.createUI: 缺少必需元素 ' + selector + '（见 ui.js DOM 契约）')
        return el
      }

      const boardCanvas = must('#board')
      const holdCanvas = must('#hold-well')
      const nextCanvas = must('#next-well')
      const boardFrame = must('#board-frame')
      const overlayEl = must('#overlay')
      const toastEl = must('#feedback-toast')
      const rewardToastEl = must('#reward-toast') // r21：特殊奖励 Toast 挂载点（index.html 同批交付，缺失即抛错）

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
      const holdWell = createHoldWellRenderer(holdCanvas)
      const nextWell = createNextQueueRenderer(nextCanvas) // r15：单格预览 → 3 格队列窗（48×80）
      const hud = createHud(hudEls)
      const overlay = createOverlay(overlayEls)
      const feedback = createFeedback({ toast: toastEl, rewardToast: rewardToastEl, boardFrame: boardFrame }) // r21：双槽（LEVEL UP + 特殊奖励）
      /* ---- r34 全局统计面板（只读镜像 persist 载荷；挂载点 #global-stats 与 must()×4 契约同批交付——
         缺失即抛错；零交互控件/零事件监听，数据唯一事实在 persist 层，AC-4 禁 UI 独立累计） ---- */
      const globalStats = createGlobalStats({
        placed: must('#gs-placed-value'),
        lines: must('#gs-lines-value'),
        time: must('#gs-time-value'),
        games: must('#gs-games-value'),
      })

      /* ---- 触屏操控区装配（r16，AC-1 显隐；TECHNICAL §2.2） ----
         #touch-controls 可选：缺失不抛错、不建控制器，既有宿主零影响；
         has-touch 类由 createUI 独占 add/remove（归属计数），多实例/测试隔离不互踩。 ---- */
      const touchPadEl = root.querySelector ? root.querySelector('#touch-controls') : null
      const touchDevice = opts.touch !== undefined ? !!opts.touch : isTouchDevice()
      let touchClassOwned = false
      if (touchDevice && typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('has-touch')
        touchClassOwned = true
      }

      let disposed = false
      let prevSnapshot = null
      // r21：clearing 动画期奖励载荷暂存（单一定义，结构见 TECHNICAL §2.2）：
      // { tspin, combo, comboBonus, cleared, level }；动画帧幂等覆写 → 结算帧消费置 null →
      // OVER/restart 置 null（0 残留）
      let pendingReward = null
      // r31 自定义按键绑定表（默认 ∪ 持久化；装配期先默认，persist 恢复块覆写后 applyKeyBindings）
      let keyBindings = defaultKeyBindingsMap()

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
      // onChange：音量/静音真实变更点 → 持久化旁观写回（不新增第三设置入口，仅观察）
      const audioPanel = createAudioPanel(audioEls, sfx, function () {
        persistSettings()
      })

      // M 键静音：设置而非游戏态 → ui.js 独立监听，任意 phase 生效（AC-10.2）；
      // r31：键位走绑定表（默认 m，可在按键设置改绑；表为按键映射单一事实来源）
      function onMuteKey(e) {
        if (e.repeat) return
        const k = normalizeKbKey(e.key)
        if (k !== null && keyBindings.mute === k) {
          sfx.setMuted(!sfx.isMuted())
          audioPanel.sync()
          persistSettings()
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
        persistSettings()
        blurElement(this)
        // AC-13.3：回合中切换即时生效——立即以当前快照重绘，不依赖下一次按键/重力步
        renderAll(game.getSnapshot())
      }
      ghostBtn.addEventListener('click', onGhostToggle)

      /* ---- BGM 开关（v2.4，AC-14） ----
         合成背景乐，仅 ui.js 接线 → audio.js startBgm/stopBgm（发声职责唯一在 audio.js）；
         默认关（AC-14.1 未经交互不出声，首次 unlock 后可用）；状态本轮内保持、
         刷新恢复默认（AC-14.4）；与音量/静音控件独立（AC-14.3，仅 M 键/按钮管 mute）。
         三信号 = aria-pressed + aria-label + 文案形态（AC-14.5，非仅颜色）。 ---- */
      const bgmBtn = must('#btn-bgm')
      let bgmEnabled = false // 默认关（AC-14.1）

      function syncBgmBtn() {
        bgmBtn.setAttribute('aria-pressed', bgmEnabled ? 'true' : 'false')
        bgmBtn.setAttribute('aria-label', '背景音乐：' + (bgmEnabled ? '开启' : '关闭'))
        bgmBtn.textContent = bgmEnabled ? '🎵 BGM：开' : '🎵 BGM：关'
      }
      syncBgmBtn()

      function onBgmToggle() {
        bgmEnabled = !bgmEnabled
        if (bgmEnabled) sfx.startBgm()
        else sfx.stopBgm()
        syncBgmBtn()
        persistSettings()
        blurElement(this)
      }
      bgmBtn.addEventListener('click', onBgmToggle)

      /* ---- 踢墙旋转开关（v2.9，AC-19.7） ----
         驱动引擎 rotate 三态分支（game.setWallKickEnabled）；UI 只读旁观 + 装配期同步，
         复用 ghost/BGM 开关三信号模式；默认开（AC-19.1）；切换实时生效（AC-19.5）。 ---- */
      const wallKickBtn = must('#btn-wallkick')
      let wallKickEnabled = true // 默认开（AC-19.1）

      function syncWallKickBtn() {
        wallKickBtn.setAttribute('aria-pressed', wallKickEnabled ? 'true' : 'false')
        wallKickBtn.setAttribute('aria-label', '踢墙旋转：' + (wallKickEnabled ? '开启' : '关闭'))
        wallKickBtn.textContent = wallKickEnabled ? '🔄 踢墙旋转：开' : '🔄 踢墙旋转：关'
      }
      syncWallKickBtn()

      function onWallKickToggle() {
        wallKickEnabled = !wallKickEnabled
        if (typeof game !== 'undefined' && game && typeof game.setWallKickEnabled === 'function') {
          game.setWallKickEnabled(wallKickEnabled) // 驱动引擎开关（装配期同步）
        }
        syncWallKickBtn()
        persistSettings()
        blurElement(this)
      }
      wallKickBtn.addEventListener('click', onWallKickToggle)

      /* ---- Hold 暂存开关（r14，AC-10/11/12/13/14/15） ----
         复用 ghost/wallKick 开关三信号模式（aria-pressed + aria-label + 文案）；
         驱动引擎 setHoldEnabled；状态会话内保持、刷新恢复默认（开启）。 ---- */
      const holdBtn = must('#btn-hold')
      let holdEnabled = true  // 默认开（AC-11）
      let holdUsed = false    // 本周期是否已 hold（AC-5，与引擎同步）

      function syncHoldBtn() {
        holdBtn.setAttribute('aria-pressed', holdEnabled ? 'true' : 'false')
        holdBtn.setAttribute('aria-label', 'Hold 暂存：' + (holdEnabled ? '开启' : '关闭'))
        holdBtn.textContent = holdEnabled ? '📦 Hold 暂存：开' : '📦 Hold 暂存：关'
      }
      syncHoldBtn()

      function onHoldToggle() {
        holdEnabled = !holdEnabled
        if (typeof game !== 'undefined' && game && typeof game.setHoldEnabled === 'function') {
          game.setHoldEnabled(holdEnabled)
        }
        syncHoldBtn()
        persistSettings()
        blurElement(this)
      }
      holdBtn.addEventListener('click', onHoldToggle)

      /* ---- 预览队列开关（r15，AC-6/7/8/9） ----
         纯显示层开关：仅控制 .next-well 整区显隐与队列渲染，引擎无开关（AC-9）；
         复用 ghost/hold 开关三信号模式（aria-pressed + aria-label + 文案）；
         状态会话内保持、刷新按持久化恢复（AC-8）；切换即时重绘（AC-7，同步无动效）。 ---- */
      const previewQueueBtn = must('#btn-preview-queue')
      let previewQueueEnabled = true // 默认开（AC-6）；队列由引擎无条件维护

      function syncPreviewQueueBtn() {
        previewQueueBtn.setAttribute('aria-pressed', previewQueueEnabled ? 'true' : 'false')
        previewQueueBtn.setAttribute('aria-label', '预览队列：' + (previewQueueEnabled ? '开启' : '关闭'))
        previewQueueBtn.textContent = previewQueueEnabled ? '👁 预览队列：开' : '👁 预览队列：关'
      }
      syncPreviewQueueBtn()

      function onPreviewQueueToggle() {
        previewQueueEnabled = !previewQueueEnabled
        syncPreviewQueueBtn()
        persistSettings()
        blurElement(this)
        // AC-7：切换即时生效——立即以当前快照重绘（≤200ms 同步路径），不依赖下一次按键/重力步
        renderAll(game.getSnapshot())
      }
      previewQueueBtn.addEventListener('click', onPreviewQueueToggle)

      /* ---- 操作区背景四皮肤（r24，AC-7/8/12/14） ----
         会话闭包 dockSkin（默认 C 渐隐）：装配期 applyDockSkin 挂类、即时切换全量替换类
         （不重载 / 不重置对局 / 零引擎触达——快照无漂移由构造保证，AC-7）；
         设置弹层「外观」组（原生 radio name=dock-skin）由 CSS 门控显隐（基座 display:none、
         html.has-touch 才显示，AC-12），元素恒在 DOM → 绑定恒可执行；
         选择写持久化（settings.dockSkin，AC-8）；#touch-controls 缺失（r16 可选）时
         皮肤类无处可挂即无效果，radio 仍可操作、仍持久化。 ---- */
      let dockSkin = 'fade'
      if (touchPadEl) applyDockSkin(touchPadEl, dockSkin)

      function syncDockSkin() {
        const radios = root.querySelectorAll ? root.querySelectorAll('[name="dock-skin"]') : null
        if (!radios) return
        for (let i = 0; i < radios.length; i++) {
          radios[i].checked = radios[i].value === dockSkin
        }
      }
      syncDockSkin()

      function onDockSkinChange() {
        const radios = root.querySelectorAll ? root.querySelectorAll('[name="dock-skin"]') : null
        if (!radios) return
        for (let i = 0; i < radios.length; i++) {
          if (radios[i].checked) {
            dockSkin = radios[i].value
            break
          }
        }
        if (touchPadEl) applyDockSkin(touchPadEl, dockSkin)
        persistSettings()
        syncDockSkin()
      }
      const dockSkinRadios = root.querySelectorAll ? root.querySelectorAll('[name="dock-skin"]') : null
      if (dockSkinRadios) {
        for (let i = 0; i < dockSkinRadios.length; i++) {
          dockSkinRadios[i].addEventListener('change', onDockSkinChange)
        }
      }

      /* ---- Hold 暂存键（r31 移除 window 直读 C/Shift：hold 现为可绑定动作，由 game.js
          keyAction L2 绑定表分发（默认 c），holdEnabled guard 保留在引擎 hold() 内）；
          触屏 Hold 键走动作级 game.input('hold')。 ---- */

      /* ---- v3.0 设置弹层（AC-01~06：齿轮图标触发的毛玻璃风格模态框） ----
         设置状态为会话内保持（不持久化），每次打开重置。
         打开弹层自动暂停（req-12：RUNNING→PAUSED；READY/PAUSED/OVER 幂等跳过），
         关闭后保持暂停、由玩家按 P/空格/Esc 恢复；restart() 天然回 RUNNING。 ---- */
      const settingsBtn = must('#btn-settings')
      const settingsModal = must('#settings-modal')
      let settingsModalOpen = false
      let lastFocusedElement = null
      let focusTrapHandler = null
      let openRafId = null // 打开动画帧句柄：关闭时取消，防 is-open 在关闭后仍被补加（快速开合竞态）

      function openSettingsModal() {
        if (settingsModalOpen) return
        settingsModalOpen = true
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

        // req-12：打开设置弹层自动暂停——引擎持态（game.js togglePause），UI 只做 RUNNING 态单点触发；
        // READY/PAUSED/OVER 由 togglePause 幂等跳过（同 L943 onWallKickToggle 守卫模式）
        if (typeof game !== 'undefined' && game && game.getPhase() === 'RUNNING' && typeof game.togglePause === 'function') {
          game.togglePause()
        }

        settingsModal.hidden = false
        openRafId = requestAnimationFrame(function () {
          openRafId = null
          // 关闭竞态守卫：若关闭已发生在该帧之前，不再补加动画类（E2E 快速开合断言）
          if (settingsModalOpen) settingsModal.classList.add('is-open')
        })

        // 焦点管理：移动到关闭按钮
        const closeBtn = settingsModal.querySelector('.settings-modal__close')
        if (closeBtn) closeBtn.focus()

        // 启用焦点陷阱
        enableFocusTrap(settingsModal)

        // 键盘事件：ESC关闭
        document.addEventListener('keydown', onSettingsModalKeyDown)
        // 点击外部关闭：由 onSettingsModalClick 委托单次绑定处理（v3.0 修复：不再每次 open 追加监听）
      }

      function closeSettingsModal() {
        if (!settingsModalOpen) return
        settingsModalOpen = false
        endRecording() // r31：关闭弹层即退出录制态（清理 capture 监听/样式/提示计时）

        // 取消未执行的打开动画帧，并同步移除动画类（快速开合时 is-open 不得残留）
        if (openRafId !== null) {
          cancelAnimationFrame(openRafId)
          openRafId = null
        }
        settingsModal.classList.remove('is-open')

        // 动画结束后隐藏
        setTimeout(function() {
          settingsModal.hidden = true
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
          // 弹层打开期间游戏已自动暂停（req-12）：ESC 只关弹层（AC-04），阻止冒泡到
          // window 级游戏键盘，避免同时触发 game.js PAUSED 键表的 ESC 恢复（弹层保持打开）
          e.stopPropagation()
          closeSettingsModal()
        }
      }

      // 焦点陷阱（复用 #overlay 的焦点管理模式）
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
        if (focusTrapHandler) {
          settingsModal.removeEventListener('keydown', focusTrapHandler)
          focusTrapHandler = null
        }
      }

      // 齿轮图标按钮事件绑定（AC-01）：具名 handler，dispose 对称解绑（v3.0 修复：原匿名绑定导致移除无效）
      function onSettingsBtnClick() {
        openSettingsModal()
        blurElement(this)
      }
      settingsBtn.addEventListener('click', onSettingsBtnClick)

      // 事件委托：仅处理弹层结构性点击（关闭按钮 / 背景遮罩，AC-03/AC-04）。
      // v3.0 修复：六个设置控件（mute/vol±/ghost/bgm/wallkick）一律直绑单一触发路径
      // （mute/vol± 在 createAudioPanel 内，ghost/bgm/wallkick 在上文直绑），
      // 不再经委托 id 分支二次触发——单次绑定、dispose 具名移除。
      function onSettingsModalClick(e) {
        const target = e.target
        // 关闭按钮
        if (target.classList.contains('settings-modal__close')) {
          closeSettingsModal()
          return
        }
        // 点击背景遮罩关闭（单次绑定，避免每次 open 累积监听）
        if (target.classList.contains('settings-modal__backdrop')) {
          closeSettingsModal()
          return
        }
      }
      settingsModal.addEventListener('click', onSettingsModalClick)

      /* ---- 应用层持久化（v2.6，可选依赖，跨切面基础设施） ----
         由装配根传入 opts.persist = TetrisPersist.createPersistence()（persist.js）。
         persist 缺失（未加载 persist.js / 测试不注入）即等效旧版：不持久化、不读取、零影响。
         持久化仅「旁观」——只 read 既有 setter/closures 的状态并写回，绝不成为第三个变更入口；
         写入点收敛在真实变更点（onMuteKey / ghost / BGM / audioPanel onChange）+ onSnapshot 只增不减。
         settings 来源仍是既有闭包（ghostEnabled/bgmEnabled）+ sfx 引擎 setter，此处只读写不驱动。
         ---- */
      const persist =
        opts.persist && typeof opts.persist.load === 'function' && typeof opts.persist.saveHighScore === 'function'
          ? opts.persist
          : null

      /* ---- r37 全网排行榜装配（可选句柄 opts.leaderboard；缺失=旧版零影响，对齐 persist 可选模式） ----
         DOM 契约：12 锚点 must()×N（缺失即抛，与 index.html 同批交付——§3.3 装配锚点清单；
         仅当 leaderboardHandle 存在时装配——§5#10「缺失不装配相关组件」，旧宿主零影响）；
         弹层互斥：从设置打开新弹层先 closeSettingsModal()（§3.3/D8；其 close 路径含端录制/焦点还原）；
         api.degraded → 设置组保持 hidden（index.html 默认 hidden，激活才移除——DESIGN §2.1，D9）。 ---- */
      const leaderboardHandle = opts.leaderboard || null
      let leaderboardPanel = null
      let nicknamePrompt = null
      if (leaderboardHandle) {
        const lbSettingsGroup = must('#lb-settings-group')
        const lbNicknameValue = must('#lb-nickname-value')
        const btnEditNickname = must('#btn-edit-nickname')
        const btnOpenLeaderboard = must('#btn-open-leaderboard')
        const leaderboardModal = must('#leaderboard-modal')
        const lbListEl = must('#lb-list')
        const lbStateEl = must('#lb-state')
        const nicknameModal = must('#nickname-modal')
        const nmInput = must('#nm-input')
        const nmError = must('#nm-error')
        const nmConfirm = must('#nm-confirm')
        const nmCancel = must('#nm-cancel')
        leaderboardPanel = createLeaderboardPanel({
          settingsGroup: lbSettingsGroup,
          nicknameValue: lbNicknameValue,
          modal: leaderboardModal,
          modalClose: leaderboardModal.querySelector('.lb-modal__close'),
          tabTotal: leaderboardModal.querySelector('.lb-tab[data-view="total"]'),
          tabWeekly: leaderboardModal.querySelector('.lb-tab[data-view="weekly"]'),
          list: lbListEl,
          stateEl: lbStateEl,
        }, leaderboardHandle)
        nicknamePrompt = createNicknamePrompt({
          modal: nicknameModal,
          input: nmInput,
          error: nmError,
          confirm: nmConfirm,
          cancel: nmCancel,
        }, leaderboardHandle, {
          // 昵称行即时刷新（persist 回读；设置组 output，DESIGN §2.1）
          onApplied: function () {
            const st = (persist && typeof persist.load === 'function') ? persist.load() : null
            leaderboardPanel.refreshNickname(st && st.nickname ? st.nickname : null)
          },
        })
        // 首弹门槛：OVER 后置回调（决策树在 leaderboard.js reportOver；此处只开弹窗）
        leaderboardHandle.onNeedNickname(function () {
          closeSettingsModal() // 防御性互斥（幂等 no-op 当未开）
          nicknamePrompt.open('first', '')
        })
        // 从设置打开新弹层：先关设置（互斥），再开目标弹层
        btnOpenLeaderboard.addEventListener('click', function () {
          closeSettingsModal()
          leaderboardPanel.open()
          blurElement(this)
        })
        btnEditNickname.addEventListener('click', function () {
          closeSettingsModal()
          const st = (persist && typeof persist.load === 'function') ? persist.load() : null
          nicknamePrompt.open('edit', st && st.nickname ? st.nickname : '')
          blurElement(this)
        })
        // 初始昵称行回显（load 恢复后；未设置 → 「未设置」弱化）
        const st0 = (persist && typeof persist.load === 'function') ? persist.load() : null
        leaderboardPanel.refreshNickname(st0 && st0.nickname ? st0.nickname : null)
      }

      let persistedHighScore = 0
      // r34 全局统计只读镜像（唯一覆写点：load 恢复初值 / onStats 全量读回；绝不独立累计，AC-4）
      const statsUi = { placed: 0, lines: 0, timeMs: 0, games: 0 }
      // 可选 HUD 最高分元素（#hi-score）：装配根未提供则该钩子为空——回读为 no-op、向后兼容
      const hiScoreEl = persist ? root.querySelector('#hi-score') : null

      function updateHiScoreEl() {
        if (!hiScoreEl) return
        const v = String(persistedHighScore)
        if (hiScoreEl.textContent !== v) hiScoreEl.textContent = v
      }

      // 当前设置快照 → persist.saveSettings（持久化层 sanitize 兜底，不在此猜值）
      function persistSettings() {
        if (!persist || typeof persist.saveSettings !== 'function') return
        try {
          persist.saveSettings({
            volume: typeof sfx.getVolume === 'function' ? sfx.getVolume() : undefined,
            muted: typeof sfx.isMuted === 'function' ? sfx.isMuted() : undefined,
            ghostEnabled: ghostEnabled,
            bgmEnabled: bgmEnabled,
            wallKickEnabled: wallKickEnabled,
            holdEnabled: holdEnabled,
            previewQueueEnabled: previewQueueEnabled,
            dockSkin: dockSkin, // r24 操作区背景四皮肤（枚举白名单，persist readState 清洗）
            keybindings: keyBindings, // r31 自定义按键 9 动作绑定表（persist sanitizeKeybindings 白名单清洗）
          })
        } catch (e) { /* 持久化层契约不 throw；再兜底一层保证永不中断游戏 */ }
      }

      // 启动恢复：load() 取回 { highScore, settings }，回填 HUD 最高分 + 恢复四设置
      if (persist) {
        let loaded = null
        try {
          loaded = persist.load()
        } catch (e) { loaded = null }
        if (loaded && typeof loaded === 'object') {
          if (loaded.highScore != null) persistedHighScore = loaded.highScore
          const st = loaded.settings
          if (st && typeof st === 'object') {
            if (typeof st.volume === 'number' && typeof sfx.setVolume === 'function') sfx.setVolume(st.volume)
            if (typeof st.muted === 'boolean' && typeof sfx.setMuted === 'function') sfx.setMuted(st.muted)
            if (typeof st.ghostEnabled === 'boolean') ghostEnabled = st.ghostEnabled
            // BGM：恢复开关态（AC-14.1 未经交互不出声；此处仅置初值+镜像，不启动合成循环）
            if (typeof st.bgmEnabled === 'boolean') bgmEnabled = st.bgmEnabled
            // 踢墙：恢复开关态（AC-19.6）；引擎同步在 createGame 之后补做（装配时序，见下）
            if (typeof st.wallKickEnabled === 'boolean') wallKickEnabled = st.wallKickEnabled
            // r14 Hold 暂存：恢复开关态
            if (typeof st.holdEnabled === 'boolean') holdEnabled = st.holdEnabled
            // r15 预览队列：恢复开关态
            if (typeof st.previewQueueEnabled === 'boolean') previewQueueEnabled = st.previewQueueEnabled
            // r24 操作区背景：恢复开关态（双保险——persist readState 已按枚举白名单清洗，
            // 此处再自校验兜底；任一兜住即回默认 fade，AC-8）
            if (typeof st.dockSkin === 'string' && DOCK_SKINS.indexOf(st.dockSkin) !== -1) dockSkin = st.dockSkin
            // r31 自定义按键：恢复绑定表（persist 已按 9 动作白名单清洗；此处再自校验兜底）
            if (st.keybindings && typeof st.keybindings === 'object') {
              keyBindings = mergeKeyBindings(st.keybindings)
            }
          }
        }
        // r34 全局统计：初始镜像 = persist 载荷（只读；缺省 0/00:00；禁 UI 独立累计，AC-4 漂移红线）
        const gs = loaded && loaded.stats && typeof loaded.stats === 'object' ? loaded.stats : null
        if (gs) {
          if (typeof gs.placed === 'number') statsUi.placed = gs.placed
          if (typeof gs.lines === 'number') statsUi.lines = gs.lines
          if (typeof gs.timeMs === 'number') statsUi.timeMs = gs.timeMs
          if (typeof gs.games === 'number') statsUi.games = gs.games
        }
        globalStats.update(statsUi)
        if (touchPadEl) applyDockSkin(touchPadEl, dockSkin)
        syncDockSkin() // radio checked 镜像（含 #touch-controls 缺失时的纯状态恢复）
        audioPanel.sync() // 音量/静音 DOM 镜像
        syncGhostBtn()
        syncBgmBtn()
        syncWallKickBtn()
        syncHoldBtn()
        syncPreviewQueueBtn()
        updateHiScoreEl()
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
        // r13（AC-1/AC-8，三分支分发，取代点红线 §4.2）：
        // 1) 动画帧（快照含 clearedIndices）→ fx.anim 霓虹脉冲（含 PAUSED 冻结帧：进度定格自动冻帧，AC-4）；
        // 2) 完结帧（前一快照在动画、本帧已塌缩）→ fx=undefined 抑制白闪，防「脉冲+事后闪」双重反馈；
        // 3) 其余 → 既有 flashIndicesFor 白闪反推原样（即时路径保留白闪 = 现状等价，AC-7；
        //    animMs=0 时快照永无 clearedIndices，恒走此分支）。
        const isClearing = s.clearedIndices !== null
        const justFinished = !isClearing && prevSnapshot !== null && prevSnapshot.clearedIndices !== null
        let fx
        if (isClearing) fx = { anim: { indices: s.clearedIndices, progress: s.animProgress } }
        else if (!justFinished) {
          const fl = flashIndicesFor(s)
          if (fl) fx = { flashLines: fl }
        }
        boardRenderer.render(s, fx, ghostEnabled)
        // r15 多格预览队列（AC-3/5/11）+ r22 语义修订：队列仅对局中渲染——READY 态
        // 传 null（三槽留白，r15 AC-4 空槽语义），消除「未开局先展示随机序列」观感
        // （用户裁定，取代 r15 AC-1「READY 亦渲染初始 3 格」；引擎队列照常构造，
        // start 后首帧即渲染，所见即所打）；预览开关关闭时隐藏整区（含标签，AC-7）+ 渲染 null（AC-9）
        const nextWellContainer = nextCanvas ? nextCanvas.parentElement : null
        if (nextWellContainer) {
          nextWellContainer.style.display = previewQueueEnabled ? '' : 'none'
        }
        nextWell.render(previewQueueEnabled && s.phase !== 'READY' ? s.queue : null)
        // r14 Hold 暂存预览（AC-13）：holdEnabled 关闭时隐藏容器、渲染 null
        const holdWellContainer = holdCanvas ? holdCanvas.parentElement : null
        if (holdWellContainer) {
          holdWellContainer.style.display = holdEnabled ? '' : 'none'
        }
        holdWell.render(holdEnabled ? s.holdPiece : null)
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
        animMs: animMs, // r13（AC-7）：构造期只读注入（解析见 createUI 顶部）
        onSnapshot: function (s) {
          renderAll(s)
          // r21（AC-4/5/6/7，奖励 Toast 驱动；只读消费 clearing 载荷，纯展示零新触发源）：
          // ① 动画期：暂存载荷（clearing 帧恒携带同一载荷，幂等覆写；animMs=0 无动画帧 → 恒不弹）
          if (s.clearedIndices !== null) {
            pendingReward = {
              tspin: s.tspin,
              combo: s.combo,
              comboBonus: s.comboBonus,
              b2bBonus: s.b2bBonus, // r23（AC-9）：B2B 第三路载荷直读暂存（同 comboBonus 机制，引擎结算恒等）
              cleared: s.clearedIndices.length,
              level: s.level,
            }
          } else if (pendingReward !== null) {
            // ② 结算帧（上次在动画、本次塌缩——pendingReward 非空即等价证明，无需 prevSnapshot）：
            //    与 LEVEL UP（onLevelUp 结算点）同位触发（AC-6 时机一致）
            if (s.phase === 'OVER') {
              // OVER 清空优先（终局反馈由遮罩承担，防闪现）
              pendingReward = null
              feedback.clearReward()
            } else {
              const text = buildRewardText(pendingReward) // AC-5：全 0/No-line → null → 不弹
              pendingReward = null
              if (text !== null) feedback.reward(text)
            }
          }
          // ③ OVER / restart 清空（AC-6 0 残留：restart 帧必为 score=0&&lines=0&&clearedIndices=null&&RUNNING，
          //    无副作用覆盖首启；未显示时 clearReward 即幂等 no-op）
          //    r21 D-1 守卫：首个计分消行的 clearing 帧 score=0&&lines=0 属正常计分前帧（引擎结算帧才落分，
          //    发射序见 game.js：clearing 快照 emit 先于 finishLock），不得被 restart 代理误清 pendingReward（AC-3 无豁免）
          if (s.phase === 'OVER' || (s.phase === 'RUNNING' && s.score === 0 && s.lines === 0 && s.clearedIndices === null)) {
            pendingReward = null
            feedback.clearReward()
          }
          // v2.6：最高分只增不减——仅当单游当前分 > 已持久化最高分时写回（AC-16 / 变更单 §3）
          if (persist && typeof persist.saveHighScore === 'function' && s.score > persistedHighScore) {
            persistedHighScore = s.score
            try { persist.saveHighScore(s.score) } catch (e) { /* 契约不 throw，兜底不中断 */ }
            updateHiScoreEl() // r35：最高分单通道唯一于 #hi-score（全局卡 hi 行已删，破纪录不再镜像）
          }
          if (typeof opts.onSnapshot === 'function') opts.onSnapshot(s)
        },
        onLevelUp: function (level) {
          feedback.levelUp()
          if (typeof opts.onLevelUp === 'function') opts.onLevelUp(level)
        },
        onGameOver: function (score) {
          // D4（r37）：第二参 prevSnapshot = OVER 定格帧快照（引擎三处 OVER 路径均 emit 先于
          // onGameOver，renderAll 已将 prevSnapshot 更新至定格帧；仅加参，既有宿主只读首参零影响）
          if (typeof opts.onGameOver === 'function') opts.onGameOver(score, prevSnapshot)
        },
        onSfx: function (name) {
          sfx.play(name) // 事件名 → 合成引擎（AC-09；发声职责唯一在 audio.js）
        },
        // r34 全局统计入账/补记：集成点唯一接线——引擎 onStats（'over' 定格 / 'flush' 补记）→
        // persist.saveStats 只增不减累加 → load 读回全量覆写 statsUi 镜像（UI 只读，禁独立累计 AC-4）；
        // persist 缺 saveStats 时等效旧版（跳过持久化，UI 静默）；契约不 throw，兜底不中断
        onStats: function (delta) {
          if (persist && typeof persist.saveStats === 'function') {
            try {
              persist.saveStats(delta)
              const st = persist.load()
              statsUi.placed = st.stats.placed
              statsUi.lines = st.stats.lines
              statsUi.timeMs = st.stats.timeMs
              statsUi.games = st.stats.games
              globalStats.update(statsUi)
            } catch (e) { /* 契约不 throw，兜底不中断 */ }
          }
        },
      })

      const handle = { game: game, dispose: dispose }

      // 装配时序（v2.9，AC-19.6）：persist.load() 恢复块在 createGame 之前执行，
      // 故这里在 createGame 之后补一次引擎同步，防「UI 显示已恢复值、引擎仍默认开」漂移。
      game.setWallKickEnabled(wallKickEnabled)
      game.setHoldEnabled(holdEnabled) // r14：Hold 暂存开关同步到引擎
      // r31：自定义按键装配——引擎同步（含持久化恢复值；8 游戏动作，mute 自动剔除）+ 按键组 DOM
      game.setKeyBindings(keyBindings)

      /* ---- r31 按键设置组（捕获状态机 IDLE↔RECORDING；DESIGN §3.2） ----
         DOM：.settings-group--keys 内 9 行 #kb-<action>（.keycap 即录制入口）+ #kb-msg-<action>
         （role=status 提示）+ #kb-reset 恢复默认；捕获期全局 capture keydown 接管并
         stopPropagation（弹层打开期游戏已暂停，此层再屏蔽恢复键/误触），
         合法无冲突写入 → 即时生效 + persistSettings（与既有设置一致：捕获即生效）。 ---- */
      const keybindRows = {}
      let recordingAction = null
      let keybindMsgTimer = null

      function keycapBtn(action) { return keybindRows[action].btn }
      function keycapMsg(action) { return keybindRows[action].msg }

      function refreshKeycaps() {
        for (let i = 0; i < KEYBIND_ACTIONS.length; i++) {
          const a = KEYBIND_ACTIONS[i]
          const btn = keycapBtn(a)
          btn.textContent = keyDisplayLabel(keyBindings[a])
          btn.setAttribute('aria-label', KEYBIND_LABELS[a] + '，当前键 ' + keyDisplayLabel(keyBindings[a]))
          btn.classList.remove('is-recording', 'is-conflict', 'has-error', 'is-saved')
        }
      }

      function clearKeybindStates() {
        if (keybindMsgTimer !== null) { clearTimeout(keybindMsgTimer); keybindMsgTimer = null }
        for (let i = 0; i < KEYBIND_ACTIONS.length; i++) {
          const msg = keycapMsg(KEYBIND_ACTIONS[i])
          if (msg) { msg.hidden = true; msg.textContent = '' }
          const b = keycapBtn(KEYBIND_ACTIONS[i])
          b.classList.remove('is-conflict', 'has-error', 'is-saved')
        }
      }

      // r31 提示：role=status aria-live=polite 即时播报 + 指定状态行标红，1.6s 后连同状态自隐
      // （DESIGN §3.3：冲突两行 is-conflict / 非法单行 has-error 持久 1.6s 后清除）
      function showKeybindMsg(action, text, conflictWith) {
        clearKeybindStates()
        const msg = keycapMsg(action)
        if (msg) { msg.textContent = text; msg.hidden = false }
        if (conflictWith) {
          keycapBtn(action).classList.add('is-conflict')
          keycapBtn(conflictWith).classList.add('is-conflict')
        } else {
          keycapBtn(action).classList.add('has-error')
        }
        keybindMsgTimer = setTimeout(function () {
          keybindMsgTimer = null
          clearKeybindStates()
        }, 1600)
      }

      function applyKeyBindings() {
        if (typeof game !== 'undefined' && game && typeof game.setKeyBindings === 'function') game.setKeyBindings(keyBindings)
        persistSettings() // 即时写持久化（persist 缺失时 no-op）
      }

      // 录制期全局 capture 接管：屏蔽游戏键输入（stopPropagation）+ 防滚动/聚焦二次激活
      function onKeybindCapture(e) {
        e.stopPropagation()
        e.preventDefault()
        if (e.key === 'Escape') { endRecording(); return } // Esc = 取消录制（不关弹层）
        if (e.ctrlKey || e.altKey || e.metaKey) { rejectKeybind('组合键不可绑定'); return } // 组合键黑名单
        const k = normalizeKbKey(e.key)
        if (k === null || !isKbLegalKey(k)) { rejectKeybind('该键不可绑定'); return } // 黑名单/非法
        // 冲突：被其他动作占用 → 两行同时标红 + 行内提示，留 RECORDING
        let conflictAction = null
        for (let i = 0; i < KEYBIND_ACTIONS.length; i++) {
          const a = KEYBIND_ACTIONS[i]
          if (a !== recordingAction && keyBindings[a] === k) { conflictAction = a; break }
        }
        if (conflictAction !== null) {
          showKeybindMsg(recordingAction, '与「' + KEYBIND_LABELS[conflictAction] + '」冲突，请换键', conflictAction)
          return
        }
        // 合法无冲突：写入 + 即时生效 + 持久化 + 120ms success 描边淡出
        keyBindings[recordingAction] = k
        applyKeyBindings()
        refreshKeycaps()
        const btn = keycapBtn(recordingAction)
        btn.classList.add('is-saved')
        endRecording()
        setTimeout(function () { btn.classList.remove('is-saved') }, 120)
      }

      function rejectKeybind(text) {
        showKeybindMsg(recordingAction, text)
      }

      function startRecording(action) {
        endRecording() // 幂等取消既有录制（含 capture 监听/样式）
        clearKeybindStates()
        recordingAction = action
        const btn = keycapBtn(action)
        btn.classList.add('is-recording')
        btn.textContent = '按下新键…'
        btn.setAttribute('aria-pressed', 'true')
        btn.setAttribute('aria-label', KEYBIND_LABELS[action] + '，录制中：按下新键，或按 Esc 取消')
        if (typeof window !== 'undefined') window.addEventListener('keydown', onKeybindCapture, { capture: true })
      }

      function endRecording() {
        if (recordingAction === null) return
        const action = recordingAction
        recordingAction = null
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeybindCapture, { capture: true })
        const btn = keycapBtn(action)
        btn.setAttribute('aria-pressed', 'false')
        btn.textContent = keyDisplayLabel(keyBindings[action])
        btn.setAttribute('aria-label', KEYBIND_LABELS[action] + '，当前键 ' + keyDisplayLabel(keyBindings[action]))
        btn.classList.remove('is-recording')
      }

      function onKeycapClick(action) {
        if (recordingAction === action) { endRecording(); return } // 再点当前行 = 取消录制
        startRecording(action)
      }

      function onKeybindReset() {
        endRecording()
        keyBindings = defaultKeyBindingsMap()
        refreshKeycaps()
        applyKeyBindings()
        blurElement(this)
      }

      // 按键组静态 DOM 装配（装配期 must 校验：index.html 同批交付）
      KEYBIND_ACTIONS.forEach(function (action) {
        const btn = must('#kb-' + action)
        const msg = root.querySelector('#kb-msg-' + action)
        const onClick = function () { onKeycapClick(action) }
        btn.addEventListener('click', onClick)
        keybindRows[action] = { btn: btn, msg: msg, onClick: onClick }
      })
      const keybindResetBtn = must('#kb-reset')
      const onKeybindResetClick = function () { onKeybindReset() }
      keybindResetBtn.addEventListener('click', onKeybindResetClick)
      refreshKeycaps() // 装配期按绑定表刷新键名（含持久化恢复值）

      /* ---- 触屏控制器与画布防默认（r16） ----
         触屏控制器在 pad 存在时创建（合成键盘事件，复走键盘层时钟/语义，引擎零改动）；
         游戏板画布级 touchstart/touchmove 均 preventDefault（AC-8）——只挂 canvas
         （无交互子节点），不挂 #board-frame 容器（避免误伤遮罩/按钮点击）。 ---- */
      let touchControls = null
      if (touchPadEl) {
        touchControls = createTouchControls({ pad: touchPadEl }, game, { root: root })
      }
      let canvasTouchGuard = null
      if (touchDevice) {
        canvasTouchGuard = function (e) {
          e.preventDefault()
        }
        boardCanvas.addEventListener('touchstart', canvasTouchGuard, { passive: false })
        boardCanvas.addEventListener('touchmove', canvasTouchGuard, { passive: false })
      }

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
      // v3.0 修复：六个设置控件各自直绑单一触发路径——mute/vol± 在 createAudioPanel 内绑定，
      // ghost/bgm/wallkick 在上文直绑（不再经弹层委托 id 分支；委托仅处理 close/backdrop 结构性点击）

      // E9：鼠标点击按钮不落焦点（防空格/回车二次触发按钮）
      const btnList = [
        hudEls.btnStart, hudEls.btnPause, hudEls.btnRestart, overlayEls.btn, settingsBtn,
        ghostBtn, bgmBtn, wallKickBtn, // E9：设置开关同样补 mousedown guard（防空格误触发）
      ]
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
        // v3.0 修复：清理设置弹层事件——命名 handler 对称解绑（原匿名绑定移除无效、委托从未移除、直绑 removeEventListener 被 v3.0 diff 删除 → 泄漏治理）
        settingsBtn.removeEventListener('click', onSettingsBtnClick)
        settingsModal.removeEventListener('click', onSettingsModalClick)
        ghostBtn.removeEventListener('click', onGhostToggle)
        bgmBtn.removeEventListener('click', onBgmToggle)
        wallKickBtn.removeEventListener('click', onWallKickToggle)
        holdBtn.removeEventListener('click', onHoldToggle) // r14
        previewQueueBtn.removeEventListener('click', onPreviewQueueToggle) // r15
        if (dockSkinRadios) {
          for (let i = 0; i < dockSkinRadios.length; i++) {
            dockSkinRadios[i].removeEventListener('change', onDockSkinChange) // r24
          }
        }
        closeSettingsModal() // 关闭弹层并清理内部事件（ESC keydown / 焦点陷阱 / r31 录制态）
        // r31：按键设置组监听对称解绑 + 提示计时清理
        if (keybindMsgTimer !== null) clearTimeout(keybindMsgTimer)
        KEYBIND_ACTIONS.forEach(function (action) {
          keybindRows[action].btn.removeEventListener('click', keybindRows[action].onClick)
        })
        keybindResetBtn.removeEventListener('click', onKeybindResetClick)
        mousedownGuards.forEach(function (entry) {
          entry.btn.removeEventListener('mousedown', entry.guard)
        })
        // r16：触屏控制器对称解绑 + 画布防默认守卫移除 + has-touch 类归属回收（谁加谁删）
        if (touchControls) touchControls.dispose()
        if (canvasTouchGuard) {
          boardCanvas.removeEventListener('touchstart', canvasTouchGuard)
          boardCanvas.removeEventListener('touchmove', canvasTouchGuard)
        }
        if (touchClassOwned && typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.classList.remove('has-touch')
        }
        boardRenderer.dispose()
        holdWell.dispose()
        nextWell.dispose()
        hud.dispose()
        globalStats.dispose() // r34：清除全局统计闪动定时器（与 createHud 对称）
        // r37：排行榜组件对称解绑（弹层复位/监听移除）+ 逻辑句柄清理（契约不 throw，兜底不中断）
        if (leaderboardPanel) leaderboardPanel.dispose()
        if (nicknamePrompt) nicknamePrompt.dispose()
        if (leaderboardHandle && typeof leaderboardHandle.dispose === 'function') {
          try { leaderboardHandle.dispose() } catch (e) { /* 契约不 throw，兜底不中断 */ }
        }
        overlay.dispose()
        feedback.dispose()
        game.dispose()
        // v2.6：持久化层纯内存/存储句柄清理（不留定时器/监听泄漏；persist 缺失时为空 no-op）
        if (persist && typeof persist.dispose === 'function') {
          try { persist.dispose() } catch (e) { /* 契约不 throw，兜底不中断 */ }
        }
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
      // r13（AC-1/AC-9）：消行动画包络常量与亮度曲线单一事实来源（Node 可断言，同 GHOST 先例）
      ANIM_MS: ANIM_MS,
      ANIM_PEAK: ANIM_PEAK,
      ANIM_PEAK_T: ANIM_PEAK_T,
      pulseBrightness: pulseBrightness,
      // r21：奖励 Toast 时长常量与合并文案纯函数（新 UI API，Node 可单测；AC-1/AC-7）
      TOAST_DURATION: TOAST_DURATION,
      buildRewardText: buildRewardText,
      // r32：会话时长格式锚点纯函数（Node 可单测，verify-ui 断言矩阵）
      formatSessionTime: formatSessionTime,
      createUI: createUI,
      // 渲染/UI 组件（签名对齐 TECHNICAL §3.4 / §3.5，便于宿主独立使用与测试）
      createBoardRenderer: createBoardRenderer,
      createNextWellRenderer: createNextWellRenderer,
      createHoldWellRenderer: createHoldWellRenderer, // r14：暂存预览渲染器（签名同 createNextWellRenderer）
      createNextQueueRenderer: createNextQueueRenderer, // r15：多格预览队列渲染器（签名同 createNextWellRenderer）
      createHud: createHud,
      createOverlay: createOverlay,
      createFeedback: createFeedback,
      createAudioPanel: createAudioPanel, // v2.0：音量/静音控件（AC-10，签名对齐 TECHNICAL §3.3）
      // r34：全局统计只读渲染组件（签名平行 createHud → { update, dispose }；只读镜像 persist 载荷）
      createGlobalStats: createGlobalStats,
      // r37：排行榜/昵称弹层组件工厂（签名平行 createGlobalStats → { dispose }；DOM 交互归 ui.js）
      createLeaderboardPanel: createLeaderboardPanel,
      createNicknamePrompt: createNicknamePrompt,
      // r16：触屏输入通道（TOUCH_KEYS 单一事实来源 / 能力检测 / 输入控制器，签名对齐 TECHNICAL §3.1/§3.3）
      TOUCH_KEYS: TOUCH_KEYS,
      isTouchDevice: isTouchDevice,
      createTouchControls: createTouchControls,
      // r24：操作区背景四皮肤枚举 + 全量替换纯函数（Node 可单测，与 persist 白名单双保险）
      DOCK_SKINS: DOCK_SKINS,
      applyDockSkin: applyDockSkin,
      // r31：自定义按键契约（动作序/文案/键名显示/绑定工具，Node 可单测；与 persist/game 交叉断言）
      KEYBIND_ACTIONS: KEYBIND_ACTIONS.slice(),
      KEYBIND_LABELS: Object.assign({}, KEYBIND_LABELS),
      keyDisplayLabel: keyDisplayLabel,
      normalizeKbKey: normalizeKbKey,
      isKbLegalKey: isKbLegalKey,
      mergeKeyBindings: mergeKeyBindings,
    }
  }
)
