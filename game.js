/*!
 * tetris/game.js — 俄罗斯方块（Tetris）简化版 · 游戏核心逻辑
 * ============================================================================
 * 任务：游戏核心逻辑 game.js（T6 会话聚合 + T7 游戏循环 + T8 键盘输入的合并交付）
 * 依据：PRD §5（数值唯一基准）/ DESIGN §4.1（输入映射）/ TECHNICAL §3（接口契约）
 *
 * 对外契约（浏览器）：window.TetrisGame；Node/CommonJS 下同时 module.exports。
 *   - 不依赖任何 UI 元素 ID：输入仅绑定 window/document 级事件；渲染/UI 由宿主
 *     消费 getSnapshot() 与 onSnapshot 回调自行实现（本文件零 DOM 副作用）。
 *
 * 状态机（任务命名，等价于 TECHNICAL 命名）：
 *   READY / RUNNING / PAUSED / OVER
 *   READY --start--> RUNNING；RUNNING --pause--> PAUSED --resume--> RUNNING；
 *   任意态 --restart--> RUNNING；RUNNING --lose--> OVER。
 *   （等价映射：RUNNING ≡ PLAYING，OVER ≡ GAME_OVER，见 PHASE_ALIAS）
 *
 * 墙踢说明：PRD §5「单点旋转（无踢墙高级规则）」、AC-02.4 —— 旋转后越界/压块
 *   一律拒绝且方块保持原位（本实现不实现高级踢墙偏移）。
 *
 * 使用示例（宿主装配，无 UI 依赖）：
 *   const game = TetrisGame.createGame({
 *     autoLoop: true,                        // 内部 rAF 时钟驱动下落；宿主亦可 autoLoop:false 自行 tick()
 *     onSnapshot: (s) => render(s),          // 状态变化即回调（渲染/UI 消费，只读）
 *     onLevelUp:  (lvl) => showLevelUp(),    // 升级反馈（LEVEL UP toast）
 *     onGameOver: (score) => showGameOver(), // 结束反馈（最终分数）
 *     onSfx:      (name) => audio.play(name),// v2.0：音效事件出口（只发事件名，AC-09）
 *   });
 *   game.start();
 *   game.dispose();                          // 统一清理时钟/监听（AC-05.4 无残留）
 * ============================================================================
 */
(function (root, factory) {
  'use strict'
  const api = factory()
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api
  if (typeof window !== 'undefined' && window !== null) window.TetrisGame = api
})(
  typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict'

    /* ======================================================================
     * 1. 常量（数值单一事实来源，PRD §5）
     * ==================================================================== */

    const VERSION = '2.3.0'
    const COLS = 10 // 棋盘 10 列
    const ROWS = 20 // 棋盘 20 行（row 0 = 顶）
    const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
    const PHASES = ['READY', 'RUNNING', 'PAUSED', 'OVER']
    const PHASE_ALIAS = { RUNNING: 'PLAYING', OVER: 'GAME_OVER' } // 等价命名映射（文档用）

    // 音效事件集（v2.0，AC-09；TECHNICAL §2.1 单一事实来源）：
    // audio.js 参数表 / 装配（ui.js onSfx→play）/ 测试统一引用，杜绝字符串漂移
    const SFX_EVENTS = ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver']

    // 踢墙旋转偏移表（v2.9，AC-19.2：固定次序/固定值，不可由玩家配置——Guideline 简化单点表）
    // 开关=开 时，旋转碰撞依次尝试：左移 → 右移 → 上移，各 1 格；全部失败则保持原位
    const WALL_KICK_OFFSETS = [
      [-1, 0],
      [+1, 0],
      [0, -1],
    ]

    // 计分：单次消 1/2/3/4 行 = 100/300/500/800 × 等级（AC-06.5）
    const LINE_SCORES = [100, 300, 500, 800]
    // 触底锁定缓冲（AC-03.5，≤ 500ms）
    const LOCK_DELAY_MS = 500
    // 输入 DAS：首移延迟 170ms / 重复 100ms（≥ 8 次/秒，AC-02.1）；软降重复 50ms（AC-02.2）
    const DAS_DELAY_MS = 170
    const DAS_REPEAT_MS = 100
    const SOFT_DROP_REPEAT_MS = 50
    // 下落间隔：max(100, 1000 × 0.85^(L−1)) ms（AC-06.3，下限 100）
    const GRAVITY_BASE_MS = 1000
    const GRAVITY_DECAY = 0.85
    const GRAVITY_MIN_MS = 100
    // 单帧 dt 上限（防失焦切回跳帧穿透，E8）
    const DT_CLAMP_MS = 250
    // 单次 tick 内重力步数上限（防御性，正常 ≤3）
    const MAX_GRAVITY_STEPS = 8

    /* ======================================================================
     * 2. 方块形状（7 型 × 4 旋转态，构建期预计算）与配色（DESIGN §5.2）
     * ==================================================================== */

    // 各型 rot0 基形（标准 Tetromino 矩阵；I 用 4×4 包围盒，O 用 2×2，其余 3×3）
    const BASE_SHAPES = {
      I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      O: [
        [1, 1],
        [1, 1],
      ],
      T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
      ],
      S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0],
      ],
      Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0],
      ],
      J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0],
      ],
      L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0],
      ],
    }

    /** 顺时针旋转矩阵（n×n，原地不动返回新矩阵） */
    function rotateMatrixCW(m) {
      const n = m.length
      const out = []
      for (let r = 0; r < n; r++) {
        out.push(new Array(n).fill(0))
      }
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          out[c][n - 1 - r] = m[r][c]
        }
      }
      return out
    }

    /** SHAPES[type][rot]：7 型 × 4 旋转态（rot 0/1/2/3 = 0°/90°/180°/270° 顺时针） */
    const SHAPES = {}
    for (const t of TYPES) {
      const s0 = BASE_SHAPES[t]
      const s1 = rotateMatrixCW(s0)
      const s2 = rotateMatrixCW(s1)
      const s3 = rotateMatrixCW(s2)
      SHAPES[t] = [s0, s1, s2, s3]
    }

    /** DESIGN §5.2 七色（hex 兜底值，色相两两不同，AC-07.5）；fill/glow 供渲染层使用 */
    const COLORS = {
      I: { fill: '#3fe0f0', glow: '#3fe0f0' },
      O: { fill: '#f3e24a', glow: '#f3e24a' },
      T: { fill: '#b54ae0', glow: '#b54ae0' },
      S: { fill: '#41e08c', glow: '#41e08c' },
      Z: { fill: '#ff4d4d', glow: '#ff4d4d' },
      J: { fill: '#3f6fe0', glow: '#3f6fe0' },
      L: { fill: '#ff9e3d', glow: '#ff9e3d' },
    }

    /* ======================================================================
     * 3. 引擎纯函数（零 DOM、不可变数据；输入决定输出）
     * ==================================================================== */

    /** 空棋盘：20 行 × 10 列，全 null */
    function createBoard() {
      return Array.from({ length: ROWS }, () => new Array(COLS).fill(null))
    }

    /** Piece 的旋转态形状矩阵 */
    function shapeOf(piece) {
      return SHAPES[piece.type][piece.rot]
    }

    /** Piece 的绝对坐标格点列表（[{x,y}, ...]，供渲染与合并使用） */
    function pieceCells(piece) {
      const shape = shapeOf(piece)
      const cells = []
      for (let r = 0; r < shape.length; r++) {
        const row = shape[r]
        for (let c = 0; c < row.length; c++) {
          if (row[c]) cells.push({ x: piece.x + c, y: piece.y + r })
        }
      }
      return cells
    }

    /** 碰撞检测：越界（左右/底部）或与已固定方块重叠 → true（AC-02.4） */
    function collides(board, piece) {
      const shape = shapeOf(piece)
      for (let r = 0; r < shape.length; r++) {
        const row = shape[r]
        for (let c = 0; c < row.length; c++) {
          if (!row[c]) continue
          const x = piece.x + c
          const y = piece.y + r
          if (x < 0 || x >= COLS || y >= ROWS) return true
          if (y >= 0 && board[y][x] !== null) return true
        }
      }
      return false
    }

    /** 出生碰撞判定（游戏结束判定用，E4）：与 collides 同语义的别名 */
    function spawnCollides(board, piece) {
      return collides(board, piece)
    }

    /** 是否触底：下方一格即碰撞 */
    function isGrounded(board, piece) {
      return collides(board, { type: piece.type, rot: piece.rot, x: piece.x, y: piece.y + 1 })
    }

    /**
     * 幽灵块（落点预览）垂直落点计算（AC-12.1/12.12；v2.2 新增，复用 collides，不改其实现）
     * 从 piece.y 起逐步 y+1 直至 collides 为真，返回最后一个非碰撞 y。
     * 语义与 hardDrop 的落点循环逐格一致 → 幽灵块位置 = 硬降实际固定位置，偏差 0 格。
     * 垂直直线、无踢墙（仅迭代 y，不产生任何侧向偏移，AC-12.5）。
     * v2.4 入参防御（E-12-08，AC-12.12，关闭 OBS-12-1）：非法/越界入参不抛错、返回类型安全值——
     *   - rot 用 %4 归一并负数归一到 0–3（等价 ((v%4)+4)%4）；
     *   - 未知 type 回退原样（无对应形状→落点即当前位置 y，不抛错）；
     *   - piece === null 防御返回安全默认哨兵 -1（类型安全 number，不抛错）。
     *   合法性路径零行为变化（唯一调用方 ui.js 已守卫合法 piece）。
     * @param {Array<Array<string|null>>} board  不可变棋盘（20×10）
     * @param {{type:string,rot:number,x:number,y:number} | null} piece
     * @returns {number} 垂直落点 y（≥ piece.y；若 piece 当前即碰撞则返回 piece.y）；
     *                   piece 为 null 时返回 -1
     */
    function ghostY(board, piece) {
      if (piece === null || piece === undefined) return -1 // E-12-08：null 防御，返回安全默认 number
      const type = piece.type
      if (!SHAPES[type]) return piece.y // E-12-08：未知 type 回退原样（不抛错）
      const rot = ((piece.rot % 4) + 4) % 4 // E-12-08：rot%4 归一，负数归 0–3
      let y = piece.y
      while (!collides(board, { type: type, rot: rot, x: piece.x, y: y + 1 })) y++
      return y
    }

    /** 固定活动块：返回新 board，原 board 不变（不可变） */
    function merge(board, piece) {
      const next = board.map(function (row) {
        return row.slice()
      })
      for (const cell of pieceCells(piece)) {
        if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
          next[cell.y][cell.x] = piece.type
        }
      }
      return next
    }

    /**
     * 消行：满行一次性消除（一次最多 4 行，E3），返回新 board + cleared + indices（供闪白）。
     * 无满行时返回原 board 引用（未发生变更，仍满足不可变语义）。
     */
    function clearLines(board) {
      const indices = []
      for (let r = 0; r < ROWS; r++) {
        if (board[r].every(function (c) { return c !== null })) indices.push(r)
      }
      if (indices.length === 0) return { board: board, cleared: 0, indices: indices }
      const kept = []
      for (let r = 0; r < ROWS; r++) {
        if (indices.indexOf(r) === -1) kept.push(board[r])
      }
      const next = kept.slice()
      while (next.length < ROWS) next.unshift(new Array(COLS).fill(null))
      return { board: next, cleared: indices.length, indices: indices }
    }

    /** 计分：单次消 n 行 = [100,300,500,800][n−1] × level（AC-06.5/AC-14，PRD §5 唯一实现）。
     *  v2.3 起计分仅来源于消行：硬降/软降/自然落地均不加分（AC-14，去除 dropBonus 每格 +1）。 */
    function scoreForLines(n, level) {
      return (LINE_SCORES[n - 1] || 0) * level
    }

    /** 等级：累计消行每满 10 行升 1 级，level = ⌊lines/10⌋ + 1（AC-06.2） */
    function levelForLines(lines) {
      return Math.floor(lines / 10) + 1
    }

    /** 下落间隔：max(100, 1000 × 0.85^(L−1)) ms（AC-06.3，下限 100；L3=723 需四舍五入） */
    function gravityMs(level) {
      // +1e-9 消除浮点误差（0.85² 在 IEEE754 下为 722.4999…，需四舍五入到 723）
      return Math.max(
        GRAVITY_MIN_MS,
        Math.round(GRAVITY_BASE_MS * Math.pow(GRAVITY_DECAY, level - 1) + 1e-9)
      )
    }

    /**
     * 7-bag 随机队列（标准 Tetris 随机系统，AC-17）。
     * 每 7 块为一轮（bag）：将全部 7 种方块放入袋中并 Fisher-Yates 洗牌，
     * 依次发完后再创建新袋。确保每 7 块中每种方块恰好出现一次。
     * rng 可注入（默认 Math.random）便于确定性测试。
     * peek() 不消耗；next() 返回当前并补新值。
     */
    function createQueue(rng) {
      const rand = typeof rng === 'function' ? rng : Math.random

      function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1))
          var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp
        }
        return arr
      }

      function newBag() { return shuffle(TYPES.slice()) }

      var bag = newBag()
      var idx = 0
      var peeked = false
      var peekVal = null

      return {
        peek: function () {
          if (!peeked) {
            if (idx >= bag.length) { bag = newBag(); idx = 0 }
            peekVal = bag[idx]
            peeked = true
          }
          return peekVal
        },
        next: function () {
          if (peeked) {
            peeked = false
            var v = peekVal
            idx++
            return v
          }
          if (idx >= bag.length) { bag = newBag(); idx = 0 }
          return bag[idx++]
        },
      }
    }

    /* ======================================================================
     * 4. 状态机（纯函数，迁移矩阵严格按 TECHNICAL §5.1 = DESIGN §2.3）
     * ==================================================================== */

    const PHASE_TRANSITIONS = {
      READY: { start: 'RUNNING', restart: 'RUNNING' },
      RUNNING: { pause: 'PAUSED', restart: 'RUNNING', lose: 'OVER' },
      PAUSED: { resume: 'RUNNING', restart: 'RUNNING' },
      OVER: { restart: 'RUNNING' },
    }

    /** 非法迁移返回原 phase（幂等、不抛错） */
    function transition(phase, event) {
      const row = PHASE_TRANSITIONS[phase]
      return row && Object.prototype.hasOwnProperty.call(row, event) ? row[event] : phase
    }

    /* ======================================================================
     * 4b. 键盘映射单一来源表 keyAction（v2.1 新增，AC-11；TECHNICAL §2.1/§3.1）
     *     纯函数：阶段 × 按键 → 动作，无 DOM/状态依赖，Node 可单测。
     *     「空格双语义」在此按 phase 分流（READY=start / RUNNING=hardDrop /
     *     PAUSED=继续 / OVER=重开【D-01 甲】），分支互斥保证一次按键单一动作。
     * ==================================================================== */

    /**
     * 键盘映射单一来源表（PRD §5.1 输入映射；v2.1 新增空格 PAUSED/OVER 语义）
     * @param {string} phase  'READY'|'RUNNING'|'PAUSED'|'OVER'
     * @param {string} key    KeyboardEvent.key（onKeyDown 传入；非字符串/未知键 → null）
     * @returns {string|null} action ∈ start|restart|togglePause|moveLeft|moveRight|softDrop|rotate|hardDrop，或 null（无动作）
     */
    function keyAction(phase, key) {
      if (typeof key !== 'string') return null
      const lower = key.toLowerCase()
      const table = {
        READY: { ' ': 'start', enter: 'start', r: 'restart' },
        RUNNING: {
          ' ': 'hardDrop',
          arrowleft: 'moveLeft',
          arrowright: 'moveRight',
          arrowdown: 'softDrop',
          arrowup: 'rotate',
          x: 'rotate',
          p: 'togglePause',
          escape: 'togglePause',
          r: 'restart',
        },
        PAUSED: { ' ': 'togglePause', p: 'togglePause', escape: 'togglePause', r: 'restart' },
        OVER: { ' ': 'restart', r: 'restart', enter: 'restart' },
      }
      const row = table[phase]
      if (!row) return null // 未知 phase → null（防御，E-11-09）
      return Object.prototype.hasOwnProperty.call(row, lower) ? row[lower] : null
    }

    /* ======================================================================
     * 5. 方块派生（spawn / rotated）
     * ==================================================================== */

    /** 出生：x = ⌊(COLS − 宽)/2⌋（居中 4–5 列区域），y = 0，完全可见（AC-01.3） */
    function spawn(type) {
      const width = SHAPES[type][0][0].length
      return { type: type, rot: 0, x: Math.floor((COLS - width) / 2), y: 0 }
    }

    /** 顺时针旋转 90°（dir=-1 逆时针；不查碰撞，碰撞判定在会话层，E1） */
    function rotated(piece, dir) {
      const d = dir === -1 ? 3 : 1
      return { type: piece.type, rot: (piece.rot + d) % 4, x: piece.x, y: piece.y }
    }

    /* ======================================================================
     * 6. 会话聚合 createGame（唯一可变状态持有者；工厂 + 闭包，不用 class）
     * ==================================================================== */

    /**
     * @param {object} [options]
     * @param {() => number} [options.rng] 随机源（默认 Math.random）
     * @param {boolean} [options.autoLoop=true] 内部 rAF 时钟驱动下落；false 时宿主自行调 tick(dtMs)
     * @param {boolean} [options.keyboard=true] 浏览器下自动绑定 window 级键盘
     * @param {boolean} [options.autoPauseOnBlur=true] 失焦/切页自动暂停（AC-04.4）
     * @param {boolean} [options.wallKickEnabled=true] 踢墙旋转开关（AC-19.1，默认开；false=无踢墙 AC-18 语义）
     * @param {(s: GameSnapshot) => void} [options.onSnapshot] 状态变化回调（只读快照）
     * @param {(phase: GamePhase) => void} [options.onPhaseChange]
     * @param {(level: number) => void} [options.onLevelUp] 升级瞬间（AC-06.4）
     * @param {(score: number) => void} [options.onGameOver]
     * @param {(name: SfxEvent) => void} [options.onSfx] 音效事件发射（v2.0，AC-09）：
     *        仅"成功"动作与关键事件触发（移动/旋转/软降/硬降/消行/升级/结束），
     *        引擎只发事件名不触碰音频 API（Node 可测、零 DOM 副作用）
     */
    function createGame(options) {
      const opts = options || {}
      const rng = typeof opts.rng === 'function' ? opts.rng : Math.random
      const autoLoop = opts.autoLoop !== false
      const keyboardOn = opts.keyboard !== false
      const autoPauseOnBlur = opts.autoPauseOnBlur !== false
      const cb = {
        onSnapshot: typeof opts.onSnapshot === 'function' ? opts.onSnapshot : null,
        onPhaseChange: typeof opts.onPhaseChange === 'function' ? opts.onPhaseChange : null,
        onLevelUp: typeof opts.onLevelUp === 'function' ? opts.onLevelUp : null,
        onGameOver: typeof opts.onGameOver === 'function' ? opts.onGameOver : null,
        onSfx: typeof opts.onSfx === 'function' ? opts.onSfx : null,
      }

      const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
      const hasRaf = typeof requestAnimationFrame === 'function'

      /* ---- 会话私有状态（单一可变点） ---- */
      const state = {
        phase: 'READY',
        board: createBoard(),
        piece: null,
        next: null,
        score: 0,
        level: 1,
        lines: 0,
        lockTimer: 0,
        gravityAcc: 0,
        queue: null,
      }
      state.queue = createQueue(rng)
      state.next = state.queue.next()

      let disposed = false
      let lastPhase = state.phase
      // 踢墙旋转开关（v2.9，AC-19.1：默认开；仅 rotate 内自判读取，UI 经 setWallKickEnabled 同步）
      let wallKickEnabled = opts.wallKickEnabled !== false

      /* ---- 快照与回调 ---- */
      function snapshot() {
        return {
          phase: state.phase,
          board: state.board.map(function (row) { return row.slice() }),
          piece: state.piece ? { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y } : null,
          next: state.next,
          score: state.score,
          level: state.level,
          lines: state.lines,
        }
      }

      function emit() {
        if (disposed) return
        const snap = snapshot()
        if (cb.onSnapshot) cb.onSnapshot(snap)
        if (snap.phase !== lastPhase) {
          lastPhase = snap.phase
          if (cb.onPhaseChange) cb.onPhaseChange(snap.phase)
        }
      }

      /**
       * 音效事件发射（v2.0，AC-09）：只发事件名，不触碰音频 API。
       * 仅"动作成功路径"调用（被拒/非法态不发射，AC-09.3）；一次动作可多事件，
       * 顺序 hardDrop → clear → levelUp → gameOver（E-SFX-04/05）。
       */
      function sfx(name) {
        if (disposed) return
        if (cb.onSfx) cb.onSfx(name)
      }

      /* ---- 锁定流程：消行 → 计分 → 升级 → spawn → 出生碰撞 → GAME_OVER（单一时钟原子处理） ---- */
      function lockFlow() {
        const clearedRes = clearLines(merge(state.board, state.piece))
        state.board = clearedRes.board
        state.piece = null
        state.lockTimer = 0
        state.gravityAcc = 0

        let levelUp = false
        if (clearedRes.cleared > 0) {
          state.score += scoreForLines(clearedRes.cleared, state.level) // 多行一次计分（E3）
          state.lines += clearedRes.cleared
          const newLevel = levelForLines(state.lines)
          levelUp = newLevel > state.level
          state.level = newLevel
          sfx('clear') // 一次消行动作恰好 1 次（含 2/3/4 行，AC-09.2/E-SFX-03）
        }

        // spawn 下一块（next 预览先出块再补新）
        const type = state.next
        state.next = state.queue.next()
        const p = spawn(type)
        if (spawnCollides(state.board, p)) {
          // 出生即碰撞 → 游戏结束（E4，AC-05.1）
          state.phase = transition(state.phase, 'lose')
          stopLoop()
          emit()
          if (levelUp && cb.onLevelUp) cb.onLevelUp(state.level)
          if (levelUp) sfx('levelUp') // 与 LEVEL UP 回调同栈（AC-09.4）
          if (cb.onGameOver) cb.onGameOver(state.score)
          sfx('gameOver') // 进入 OVER 态恰好 1 次，与遮罩回调同栈（AC-09.4）
          return { ok: true, locked: true, cleared: clearedRes.cleared, levelUp: levelUp, gameOver: true }
        }
        state.piece = p
        emit()
        if (levelUp && cb.onLevelUp) cb.onLevelUp(state.level)
        if (levelUp) sfx('levelUp')
        return { ok: true, locked: true, cleared: clearedRes.cleared, levelUp: levelUp, gameOver: false }
      }

      function spawnFirst() {
        // 仅在 READY/RUNNING 重置后调用（棋盘为空，出生必不碰撞，防御性校验）
        const type = state.next
        state.next = state.queue.next()
        const p = spawn(type)
        if (spawnCollides(state.board, p)) {
          state.phase = transition(state.phase, 'lose')
          stopLoop()
        } else {
          state.piece = p
        }
      }

      /* ---- 公共动作 ---- */
      function start() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'READY') return { ok: false, reason: 'illegal-phase' }
        state.phase = transition(state.phase, 'start')
        spawnFirst()
        emit()
        if (keyboardRef) keyboardRef.reset()
        if (autoLoop) startLoop()
        return { ok: true }
      }

      function restart() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        state.board = createBoard()
        state.score = 0
        state.level = 1
        state.lines = 0
        state.lockTimer = 0
        state.gravityAcc = 0
        state.queue = createQueue(rng) // 队列重建（TECHNICAL §5.3）
        state.next = state.queue.next()
        state.piece = null
        state.phase = transition(state.phase, 'restart') // 任意态 → RUNNING
        spawnFirst()
        emit()
        if (keyboardRef) keyboardRef.reset()
        if (autoLoop) startLoop()
        return { ok: true }
      }

      function togglePause() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase === 'RUNNING') {
          state.phase = transition(state.phase, 'pause')
          stopLoop()
          emit()
          return { ok: true }
        }
        if (state.phase === 'PAUSED') {
          state.phase = transition(state.phase, 'resume')
          if (autoLoop) startLoop()
          emit()
          return { ok: true }
        }
        return { ok: false, reason: 'illegal-phase' }
      }

      function move(dir) {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING' || !state.piece) return { ok: false, reason: 'illegal-phase' }
        const d = dir === -1 ? -1 : 1
        const moved = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x + d, y: state.piece.y }
        if (collides(state.board, moved)) return { ok: false, reason: 'blocked' } // E2 原位不动（不发声，AC-09.3）
        state.piece = moved
        if (!isGrounded(state.board, state.piece)) state.lockTimer = 0 // 脱离触底则重置缓冲
        emit()
        sfx('move') // 仅移动成功（含 DAS 每次成功，AC-09.2）
        return { ok: true }
      }

      function rotate() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING' || !state.piece) return { ok: false, reason: 'illegal-phase' }
        const next = rotated(state.piece, 1)
        if (!collides(state.board, next)) {
          // 原地合法：直接成功（AC-18/AC-19 共用路径）
          state.piece = next
          if (!isGrounded(state.board, state.piece)) state.lockTimer = 0
          emit()
          sfx('rotate') // 仅旋转成功
          return { ok: true }
        }
        // v2.9（AC-19.4）：开关关闭 → 无踢墙，保持原位（AC-18 语义，零偏移）
        if (wallKickEnabled === false) {
          return { ok: false, reason: 'wall-kick-denied' }
        }
        // v2.9（AC-19.2）：开关打开 → 按固定偏移表逐格尝试踢墙
        for (var wi = 0; wi < WALL_KICK_OFFSETS.length; wi++) {
          const off = WALL_KICK_OFFSETS[wi]
          const candidate = { type: next.type, rot: next.rot, x: next.x + off[0], y: next.y + off[1] }
          if (!collides(state.board, candidate)) {
            state.piece = candidate // 命中：x/y 随偏移更新、rot 生效
            if (!isGrounded(state.board, state.piece)) state.lockTimer = 0
            emit()
            sfx('rotate') // 仅旋转成功
            return { ok: true }
          }
        }
        // v2.9（AC-19.3）：全部偏移失败 → 保持原位
        return { ok: false, reason: 'wall-kick-denied' }
      }

      function softDrop() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING' || !state.piece) return { ok: false, reason: 'illegal-phase' }
        const moved = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + 1 }
        if (collides(state.board, moved)) {
          // 软降后仍触底 → 立即固定（TECHNICAL §6.2）；下移未成功不发射 softDrop
          // （E-SFX-02），lockFlow 内的 clear/levelUp/gameOver 正常发射
          return lockFlow()
        }
        state.piece = moved
        state.lockTimer = 0
        emit()
        sfx('softDrop') // 仅软降成功下移 1 格
        return { ok: true }
      }

      function hardDrop() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING' || !state.piece) return { ok: false, reason: 'illegal-phase' }
        let d = 0
        while (!collides(state.board, { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + d + 1 })) {
          d++
        }
        // v2.3（AC-14）：硬降落地不加分（移除 dropBonus 每格 +1）；仅锁定的消行在 lockFlow 计分
        state.piece = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + d }
        sfx('hardDrop') // 每次硬降恰好 1 次（落点计算后、lockFlow 前，E-SFX-04 顺序首项）
        return lockFlow() // 硬降立即固定，不走缓冲
      }

      /** 手动时钟驱动：宿主在 autoLoop:false 时每帧调用（dt 单位 ms，内部 clamp ≤ 250） */
      function tick(dtMs) {
        if (disposed || state.phase !== 'RUNNING' || !state.piece) return
        const dt = dtMs < 0 ? 0 : dtMs > DT_CLAMP_MS ? DT_CLAMP_MS : dtMs
        state.gravityAcc += dt

        let changed = false
        const interval = gravityMs(state.level)
        let guard = 0
        // 重力步：到点下落一格；触底则停止并转入锁定缓冲计时
        while (state.phase === 'RUNNING' && state.piece && state.gravityAcc >= interval && guard < MAX_GRAVITY_STEPS) {
          guard++
          state.gravityAcc -= interval
          const moved = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + 1 }
          if (!collides(state.board, moved)) {
            state.piece = moved
            state.lockTimer = 0
            changed = true
          } else {
            break // 触底
          }
        }
        if (state.phase !== 'RUNNING') return // 循环中可能已触发 GAME_OVER

        if (isGrounded(state.board, state.piece)) {
          state.lockTimer += dt // 缓冲按真实流逝时间累积（AC-03.5）
          if (state.lockTimer >= LOCK_DELAY_MS) {
            lockFlow()
            changed = true
          }
        } else {
          state.lockTimer = 0
        }
        if (changed) emit()
      }

      /** 强制结束（宿主/测试用）：RUNNING → OVER */
      function lose() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
        state.phase = transition(state.phase, 'lose')
        stopLoop()
        emit()
        if (cb.onGameOver) cb.onGameOver(state.score)
        sfx('gameOver') // 强制结束也发声（E-SFX-06，进入 OVER 态恰好 1 次）
        return { ok: true }
      }

      /* ---- 内部 rAF 时钟（差值计时，暂停不累积；dt clamp ≤ 250，E7/E8） ---- */
      let rafId = null
      let lastFrame = 0
      function startLoop() {
        if (disposed || rafId !== null || !hasRaf) return
        lastFrame = performance.now()
        function step(t) {
          rafId = requestAnimationFrame(step)
          const dt = t - lastFrame
          lastFrame = t
          if (dt > 0) tick(dt)
          if (state.phase !== 'RUNNING') stopLoop()
        }
        rafId = requestAnimationFrame(step)
      }
      function stopLoop() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
      }

      /* ---- 失焦/切页自动暂停（AC-04.4；恢复焦点不自动恢复） ---- */
      function onVisibilityChange() {
        if (typeof document !== 'undefined' && document.hidden && state.phase === 'RUNNING') togglePause()
      }
      function onWindowBlur() {
        if (state.phase === 'RUNNING') togglePause()
      }

      /* ---- 键盘输入（window 级 keydown/keyup，不依赖任何元素；DAS/软降重复） ---- */
      const held = new Map() // code -> { action, delay, repeat, acc, fired }
      let keyRafId = null
      let keyTimerId = null

      function stopKeyRepeat() {
        if (keyRafId !== null) {
          cancelAnimationFrame(keyRafId)
          keyRafId = null
        }
        if (keyTimerId !== null) {
          clearInterval(keyTimerId)
          keyTimerId = null
        }
      }
      function startKeyRepeat() {
        if (keyRafId !== null || keyTimerId !== null) return
        if (hasRaf) {
          let last = performance.now()
          function step(t) {
            keyRafId = requestAnimationFrame(step)
            const dt = Math.min(t - last, 100)
            last = t
            updateHeld(dt)
            if (held.size === 0) stopKeyRepeat()
          }
          keyRafId = requestAnimationFrame(step)
        } else {
          keyTimerId = setInterval(function () { updateHeld(16) }, 16)
        }
      }
      function updateHeld(dt) {
        for (const entry of held.values()) {
          entry.acc += dt
          if (!entry.fired) {
            if (entry.acc >= entry.delay) {
              entry.fired = true
              entry.acc = 0
              entry.action()
            }
          } else if (entry.acc >= entry.repeat) {
            entry.acc = 0
            entry.action()
          }
        }
      }

      function onKeyDown(e) {
        const k = e.key
        // 方向键/空格一律拦截，防页面滚动 + 防遮罩按钮聚焦时空格二次激活（DESIGN §4.1，E-11-03）
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowUp' || k === ' ') {
          e.preventDefault()
        }
        if (e.repeat) return // 重复键由 DAS/软降定时器管理，单发键忽略系统重复

        // v2.1：行为等价重构——按键→动作由单一来源表 keyAction 分发（TECHNICAL §3.1）
        const action = keyAction(state.phase, k)
        if (!action) return // null = 无动作（READY/OVER 按 P 等，AC-11.6）
        if (action === 'start') { start(); return }
        if (action === 'restart') { restart(); return }
        if (action === 'togglePause') { togglePause(); return }
        if (action === 'rotate') { rotate(); return }
        if (action === 'hardDrop') { hardDrop(); return }
        // moveLeft/moveRight/softDrop：保留既有 DAS/软降按住语义（首击 + held 注册）
        if (action === 'moveLeft') {
          if (!held.has('ArrowLeft')) {
            held.set('ArrowLeft', { action: function () { move(-1) }, delay: DAS_DELAY_MS, repeat: DAS_REPEAT_MS, acc: 0, fired: false })
            move(-1)
            startKeyRepeat()
          }
          return
        }
        if (action === 'moveRight') {
          if (!held.has('ArrowRight')) {
            held.set('ArrowRight', { action: function () { move(1) }, delay: DAS_DELAY_MS, repeat: DAS_REPEAT_MS, acc: 0, fired: false })
            move(1)
            startKeyRepeat()
          }
          return
        }
        if (action === 'softDrop') {
          if (!held.has('ArrowDown')) {
            held.set('ArrowDown', { action: function () { softDrop() }, delay: SOFT_DROP_REPEAT_MS, repeat: SOFT_DROP_REPEAT_MS, acc: 0, fired: true })
            softDrop()
            startKeyRepeat()
          }
          return
        }
      }

      function onKeyUp(e) {
        const k = e.key
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown') {
          held.delete(k)
          if (held.size === 0) stopKeyRepeat()
        }
      }

      function onKeyBlur() {
        held.clear()
        stopKeyRepeat()
      }

      let keyboardAttached = false
      function attachKeyboard() {
        if (keyboardAttached || !isBrowser) return
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', onKeyBlur)
        keyboardAttached = true
      }
      function detachKeyboard() {
        if (!keyboardAttached) return
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onKeyBlur)
        held.clear()
        stopKeyRepeat()
        keyboardAttached = false
      }
      const keyboardRef = {
        reset: function () {
          held.clear()
          stopKeyRepeat()
        },
      }

      /* ---- 公开 API ---- */
      const api = {
        getSnapshot: function () { return snapshot() },
        getPhase: function () { return state.phase },
        start: start,
        togglePause: togglePause,
        restart: restart,
        move: move,
        rotate: rotate,
        // v2.9（AC-19.1/19.5）：踢墙开关读写（UI 装配期同步；钳制为布尔，实时生效）
        setWallKickEnabled: function (enabled) {
          if (disposed) return false
          wallKickEnabled = enabled === true
          return true
        },
        getWallKickEnabled: function () { return wallKickEnabled },
        softDrop: softDrop,
        hardDrop: hardDrop,
        tick: tick,
        lose: lose,
        attachKeyboard: attachKeyboard,
        detachKeyboard: detachKeyboard,
        isKeyboardAttached: function () { return keyboardAttached },
        dispose: function () {
          if (disposed) return
          disposed = true
          stopLoop()
          detachKeyboard()
          if (autoPauseOnBlur && isBrowser) {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('blur', onWindowBlur)
          }
        },
        /**
         * 内部测试钩子（非对外契约，勿在生产调用）：用于确定性单测构造场景。
         */
        _debug: {
          setBoard: function (b) { state.board = b.map(function (row) { return row.slice() }) },
          setPiece: function (p) { state.piece = p ? { type: p.type, rot: p.rot, x: p.x, y: p.y } : null },
          setNext: function (t) { if (TYPES.indexOf(t) !== -1) state.next = t },
          setLines: function (n) {
            state.lines = n
            state.level = levelForLines(n)
          },
        },
      }

      /* ---- 初始化：绑定失焦监听 + 键盘 + 初始 READY 快照 ---- */
      if (autoPauseOnBlur && isBrowser) {
        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('blur', onWindowBlur)
      }
      if (keyboardOn) attachKeyboard()
      emit()

      return api
    }

    /* ======================================================================
     * 7. 对外导出（window.TetrisGame / module.exports）
     * ==================================================================== */
    return {
      VERSION: VERSION,
      COLS: COLS,
      ROWS: ROWS,
      TYPES: TYPES.slice(),
      PHASES: PHASES.slice(),
      PHASE_ALIAS: Object.assign({}, PHASE_ALIAS),
      SFX_EVENTS: SFX_EVENTS.slice(), // v2.0：音效事件集（audio.js/装配/测试统一引用）
      LINE_SCORES: LINE_SCORES.slice(),
      LOCK_DELAY_MS: LOCK_DELAY_MS,
      DAS_DELAY_MS: DAS_DELAY_MS,
      DAS_REPEAT_MS: DAS_REPEAT_MS,
      SOFT_DROP_REPEAT_MS: SOFT_DROP_REPEAT_MS,
      GRAVITY_BASE_MS: GRAVITY_BASE_MS,
      GRAVITY_DECAY: GRAVITY_DECAY,
      GRAVITY_MIN_MS: GRAVITY_MIN_MS,
      SHAPES: SHAPES,
      COLORS: COLORS,
      PHASE_TRANSITIONS: PHASE_TRANSITIONS,
      // 引擎纯函数
      createBoard: createBoard,
      shapeOf: shapeOf,
      pieceCells: pieceCells,
      collides: collides,
      spawnCollides: spawnCollides,
      isGrounded: isGrounded,
      ghostY: ghostY, // v2.2：幽灵块落点预览纯函数（AC-12.1）
      merge: merge,
      clearLines: clearLines,
      scoreForLines: scoreForLines,
      levelForLines: levelForLines,
      gravityMs: gravityMs,
      createQueue: createQueue,
      spawn: spawn,
      rotated: rotated,
      transition: transition,
      keyAction: keyAction, // v2.1：键盘映射单一来源表（AC-11，Node 可单测）
      // 会话工厂
      createGame: createGame,
    }
  }
)
