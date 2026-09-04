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
    const SFX_EVENTS = ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold']

    // 多格预览队列（r15，AC-10；PRD §5 数值单一事实来源）：Next 预览区格数（恒 3）
    const NEXT_QUEUE_SIZE = 3

    // 踢墙旋转偏移表（v2.9，AC-19.2：固定次序/固定值，不可由玩家配置——Guideline 简化单点表）
    // 开关=开 时，旋转碰撞依次尝试：左移 → 右移 → 上移，各 1 格；全部失败则保持原位
    const WALL_KICK_OFFSETS = [
      [-1, 0],
      [+1, 0],
      [0, -1],
    ]

    // 计分：单次消 1/2/3/4 行 = 100/300/500/800 × 等级（AC-06.5）
    const LINE_SCORES = [100, 300, 500, 800]
    // r18 T-spin 加分（PRD §3 表；索引 = 本次清除行数）：
    // full: 0 行=No-line 100 / 1/2/3 行=800/1200/1600；mini: 0 行无档=0 / 1/2 行=100/200 /
    // 3 行按 Full Triple=1600（无 Mini Triple 档，防漏分）；kind='none'（未判定）一律不调用
    const T_SPIN_BONUS = {
      full: [100, 800, 1200, 1600],
      mini: [0, 100, 200, 1600],
    }
    // r20 计分：combo 递增奖励基数（PRD §5，AC-5/7）——comboBonus = 50 × combo × level；
    // 单一事实来源：verify-game.cjs §15.0 与 qa-e2e 期望推导统一引用
    const COMBO_BONUS_BASE = 50
    // r23（PRD §5）：Back-to-back 定值基数——b2bBonus = B2B_BONUS_BASE × level，不随链长递增
    // （区别于 combo）；资格 = Tetris 4 行 / T-Spin Full ≥1 行；单一事实来源：verify-game §16.0 / qa-e2e B 段引用
    const B2B_BONUS_BASE = 400
    // 触底锁定缓冲（AC-03.5，≤ 500ms）
    const LOCK_DELAY_MS = 500
    // 触底缓冲重置预算（r33，PRD §5/AC-03.5）：每方块至多 15 次成功移动/旋转重置（旋转+移动同一上限）；
    // 随出生/hold 交换/restart 归零；被拒不计数；软降/硬降/重力不计数
    const LOCK_MOVE_RESET_MAX = 15
    // 输入 DAS：首移延迟 170ms / 重复 100ms（≥ 8 次/秒，AC-02.1）；软降重复 50ms（AC-02.2）
    const DAS_DELAY_MS = 170
    const DAS_REPEAT_MS = 100
    const SOFT_DROP_REPEAT_MS = 50

    // r31 自定义按键（单键制：9 动作各绑 1 主键，一对一；DESIGN D-1/D-7）：
    // 默认绑定表 = keyAction 两级分发 L2 的基座；与 persist.DEFAULT_KEYBINDINGS 双声明，
    // verify-ui 交叉断言防漂移（DOCK_SKINS 先例）。键名一律小写规范化（键盘事件
    // 'ArrowLeft' → 'arrowleft'；空格保持 ' '）。
    const DEFAULT_KEYBINDINGS = {
      moveLeft: 'arrowleft',
      moveRight: 'arrowright',
      softDrop: 'arrowdown',
      hardDrop: ' ',
      rotate: 'arrowup',
      hold: 'c',
      togglePause: 'p',
      restart: 'r',
      mute: 'm',
    }
    // 可改游戏动作（8）：mute 为设置/音频动作，由 ui.js 读取绑定表消费，不进 keyAction（0-diff 音效职责）
    const GAME_BIND_ACTIONS = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotate', 'hold', 'togglePause', 'restart']
    // 触屏/回放动作级输入的 held 标签前缀（'touch:moveLeft' 等，与键盘绑定键字符串绝不冲突）
    const TOUCH_TAG_PREFIX = 'touch:'
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
     * peek() / peekN(n) 不消耗；next() 返回队首并移除（补新值）。
     * r15（AC-10）：重构为 FIFO 物化流——items[] 耗尽时整袋补入（ensure），
     * 构造期预填首袋使 rand 消耗时点与旧 lazy 模型逐点一致（含状态型 rng）；
     * peek/next 公开语义等价，新增 peekN(n) 非消耗、可跨袋读取（n ≤ 0 → []）。
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

      // 已物化的后续方块 FIFO；耗尽时整袋补入，保证袋内排列与袋间顺序 = 标准 7-bag
      const items = []
      function ensure(n) {
        while (items.length < n) {
          const b = newBag()
          for (let i = 0; i < b.length; i++) items.push(b[i])
        }
      }
      ensure(1) // 构造期预填首袋：rand 消耗时点与旧模型（构造时 newBag）逐点一致

      return {
        peek: function () { ensure(1); return items[0] },
        peekN: function (n) {
          const k = typeof n === 'number' && n > 0 ? Math.floor(n) : 0
          ensure(k)
          return items.slice(0, k)
        },
        next: function () { ensure(1); return items.shift() },
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
     * 4b. 键盘映射单一来源表 keyAction（v2.1 新增，AC-11；r31 两级分发，DESIGN §3.1）
     *     纯函数：阶段 × 按键 × 绑定表 → 动作，无 DOM/状态依赖，Node 可单测。
     *     L1 系统阶段键（READY/OVER 的 Enter/空格 → start/restart，零回归，不随绑定
     *     且黑名单不可被占用）；L2 绑定表（默认 ∪ 自定义，8 游戏动作一对一）。
     * ==================================================================== */

    // r31：L1 系统阶段键（黑名单键由 persist/ui 层保证不可绑定 → 与 L2 永无冲突）。
    // READY/OVER：空格/Enter → start/restart（零回归）；PAUSED：空格 → togglePause（AC-11.2
    // 「空格=继续」历史语义保留为阶段型固定键，不随绑定——防止改绑空格后暂停无法空格继续）
    const SYSTEM_STAGE_KEYS = {
      READY: { ' ': 'start', enter: 'start' },
      OVER: { ' ': 'restart', enter: 'restart' },
      PAUSED: { ' ': 'togglePause' },
    }

    /** r31：键名规范化（KeyboardEvent.key → 绑定表小写键名；空格保持 ' '；非字符串/空白 → null） */
    function normalizeKeyName(key) {
      if (typeof key !== 'string' || key.length === 0) return null
      const s = key === ' ' ? ' ' : key.trim()
      if (s.length === 0) return null
      return s.toLowerCase()
    }

    /**
     * r31：绑定表清洗（防御性 + 幂等）。仅接受字符串键名；非法/缺失回退默认；
     * 后位动作与前者撞键 → 回退默认（一对一保证，冲突由 UI 捕获层前置拦截）。
     * @param {object} raw 任意输入（8 动作键可来自 persist 清洗结果或宿主注入）
     * @returns {object} 8 动作全量绑定表（含默认回退）
     */
    function sanitizeBindings(raw) {
      const src = raw && typeof raw === 'object' ? raw : {}
      const out = {}
      const used = {}
      for (let i = 0; i < GAME_BIND_ACTIONS.length; i++) {
        const a = GAME_BIND_ACTIONS[i]
        const custom = src[a]
        const v = custom !== undefined && custom !== null ? normalizeKeyName(custom) : null
        if (v !== null && typeof v === 'string' && v.length > 0 && !Object.prototype.hasOwnProperty.call(used, v)) {
          out[a] = v
          used[v] = true
        } else {
          out[a] = DEFAULT_KEYBINDINGS[a]
          used[DEFAULT_KEYBINDINGS[a]] = true
        }
      }
      return out
    }

    /**
     * 键盘映射单一来源表（PRD §5.1 输入映射；v2.1 新增空格 PAUSED/OVER 语义；r31 两级分发）
     * @param {string} phase  'READY'|'RUNNING'|'PAUSED'|'OVER'
     * @param {string} key    KeyboardEvent.key（onKeyDown 传入；非字符串/未知键 → null）
     * @param {object} [bindings] 绑定表（默认 DEFAULT_KEYBINDINGS；部分表缺省回默认）
     * @returns {string|null} action ∈ start|restart|togglePause|moveLeft|moveRight|softDrop|rotate|hardDrop|hold，或 null（无动作）
     */
    function keyAction(phase, key, bindings) {
      if (typeof key !== 'string') return null
      const lower = key === ' ' ? ' ' : key.trim().toLowerCase()
      // 未知 phase → null（防御，E-11-09）
      if (PHASES.indexOf(phase) === -1) return null
      // L1：系统阶段键（READY/OVER：Enter/空格 → start/restart，PAUSED：空格 → togglePause；零回归，不随绑定）
      const sys = SYSTEM_STAGE_KEYS[phase]
      if (sys && Object.prototype.hasOwnProperty.call(sys, lower)) return sys[lower]
      // L2：绑定表（默认 ∪ 自定义；8 游戏动作一对一；mute 由 ui.js 消费不进此表）
      const map = bindings || DEFAULT_KEYBINDINGS
      if (map && typeof map === 'object') {
        for (let i = 0; i < GAME_BIND_ACTIONS.length; i++) {
          const a = GAME_BIND_ACTIONS[i]
          let v = null
          if (Object.prototype.hasOwnProperty.call(map, a) && map[a] !== undefined && map[a] !== null) v = map[a]
          else if (Object.prototype.hasOwnProperty.call(DEFAULT_KEYBINDINGS, a)) v = DEFAULT_KEYBINDINGS[a]
          if (v === lower) return a
        }
      }
      return null // 未知 phase / 无动作 → null（防御，E-11-09）
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

    /** r18：角点实判定；越界按实（墙），对 T 局内不可达（旋转后 3×3 必在界内），纯防御 */
    function cornerSolid(board, x, y) {
      return x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x] !== null
    }

    /**
     * r18（AC-1/2/4/5）：T-spin 几何分类（纯函数，零依赖对局状态；非 T 恒 'none'）。
     * 3×3 邻域以旋转后（含 kick 位移后）T 的 piece.x/y 为左上角，四角为 TL/TR/BL/BR；
     * 实 = 该格非空（对**合并后**棋盘判定——即锁定瞬间快照，含踢墙位移；越界按实，防御）。
     * 实角 ≥3 成立（AC-4：0/1/2 不判）；4 实角 = Full；3 实角缺角位于 T 头部一侧
     * （rot0 顶行/rot1 右列/rot2 底行/rot3 左列，PRD §3 对角对表述以 TECH §3.2 头部侧裁定取代，
     * F1~F8 权威样例固化）= Mini，否则 = Full。本作 T 形状（标准 SRS）四旋转态从不占据框角，
     * 四角全为环境格 → 无"自身占角"判据。
     */
    function tspinKind(board, piece) {
      if (piece.type !== 'T') return 'none'
      const x = piece.x
      const y = piece.y
      const tl = cornerSolid(board, x, y)
      const tr = cornerSolid(board, x + 2, y)
      const bl = cornerSolid(board, x, y + 2)
      const br = cornerSolid(board, x + 2, y + 2)
      const n = (tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0)
      if (n < 3) return 'none' // AC-4：0/1/2 实角不判
      if (n === 4) return 'full' // 四实角 = Full
      const missingHeadSide =
        (piece.rot === 0 && (!tl || !tr)) ||
        (piece.rot === 1 && (!tr || !br)) ||
        (piece.rot === 2 && (!bl || !br)) ||
        (piece.rot === 3 && (!tl || !bl))
      return missingHeadSide ? 'mini' : 'full'
    }

    /** r18（AC-6/7）：T-spin 加分 = 基准分 × level（与 scoreForLines 同构）；kind='none' → 0 */
    function tspinBonus(kind, cleared, level) {
      if (kind !== 'full' && kind !== 'mini') return 0
      const base = T_SPIN_BONUS[kind][cleared]
      return typeof base === 'number' ? base * level : 0
    }

    /** r20（AC-5/7）：combo 递增奖励 = COMBO_BONUS_BASE × combo × level；
     * combo=0 → 0；防御：非有限数 / 负值 / level<1 → 0（E6，无 NaN/负分路径） */
    function comboBonus(combo, level) {
      if (!(combo >= 0) || !(level >= 1)) return 0
      return COMBO_BONUS_BASE * combo * level
    }

    /** r23（AC-1）：B2B 资格判定，复用 r18 tspinKind 产物。
     * 资格 = ① cleared===4（Tetris；T 型实际至多 3 行，防御性涵盖，与 kind 无关）
     *        ② kind==='full' 且 cleared 1~3（T-Spin Full Single/Double/Triple）。
     * Mini（含 Mini 消行）、普通 1/2/3 行、cleared=0（含 No-line T-spin）→ false（AC-1/AC-2）。 */
    function b2bQualifies(kind, cleared) {
      if (!(cleared >= 1)) return false
      if (cleared === 4) return true
      return kind === 'full'
    }

    /** r23（AC-3）：B2B 奖励 = B2B_BONUS_BASE × level；仅当「本次资格 且 chainOnBefore=true」→ 加分，否则 0。
     * level 取本次锁升级前 level（调用点 lockFlow 的 state.level）；防御：非有限数 / level<1 → 0（E6 同款）。 */
    function b2bBonus(chainOnBefore, kind, cleared, level) {
      if (chainOnBefore !== true) return 0
      if (!b2bQualifies(kind, cleared)) return 0
      if (!(level >= 1)) return 0
      return B2B_BONUS_BASE * level
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
     * @param {number} [options.animMs=240] 消行动画时长 ms（r13，AC-1/AC-9；容差 160~320；0 = 即时消除 = reduced-motion 等价，AC-7）
     * @param {(s: GameSnapshot) => void} [options.onSnapshot] 状态变化回调（只读快照）
     * @param {(phase: GamePhase) => void} [options.onPhaseChange]
     * @param {(level: number) => void} [options.onLevelUp] 升级瞬间（AC-06.4）
     * @param {(score: number) => void} [options.onGameOver]
     * @param {(name: SfxEvent) => void} [options.onSfx] 音效事件发射（v2.0，AC-09）：
     *        仅"成功"动作与关键事件触发（移动/旋转/软降/硬降/消行/升级/结束），
     *        引擎只发事件名不触碰音频 API（Node 可测、零 DOM 副作用）
     * @param {(delta: {reason:'over'|'flush', placed:number, lines:number, timeMs:number, games:number}) => void} [options.onStats]
     *        r34 全局统计生命周期事件出口（AC-1/4/5/6）：'over'=OVER 定格全量入账（games=1 恒发一次）；
     *        'flush'=当前局未入账时长补记（delta>0 才发，games=0）；引擎零累计事实、只发增量
     */
    function createGame(options) {
      const opts = options || {}
      // r31：启动注入绑定表（可选；宿主可在 createGame 后经 setKeyBindings 再改）
      let keyBindings = sanitizeBindings(opts.keyBindings)
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
        // r34：全局统计入账/补记事件出口（OVER 定格 / 隐藏·卸载补记；与 onSfx 同风格——只发增量载荷不触碰持久化）
        onStats: typeof opts.onStats === 'function' ? opts.onStats : null,
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
        // r13 消行动画（AC-1）：clearing 子阶段（仅在 RUNNING 下存在；初始 null，见 §2.2）
        clearing: null,
        // r14 Hold 暂存槽（AC-1）：null 或 { type: string }（仅存 type，rot/x/y 由 spawn 重置）
        holdPiece: null,
      }
      state.queue = createQueue(rng)
      state.next = state.queue.next()

      let disposed = false
      let lastPhase = state.phase
      // 踢墙旋转开关（v2.9，AC-19.1：默认开；仅 rotate 内自判读取，UI 经 setWallKickEnabled 同步）
      let wallKickEnabled = opts.wallKickEnabled !== false
      // r14 Hold 暂存开关（AC-11）：默认开；UI 经 setHoldEnabled 同步
      let holdEnabled = opts.holdEnabled !== false
      // r14 Hold 使用限制（AC-5）：每个方块下落周期内是否已使用过 hold
      let holdUsed = false
      // r18（AC-1）：T-spin 会话旋转窗口——rotate 成功置 true；move/软硬降/重力下移/新周期清 false；
      // "旋转落地即锁定"（旋转后不得再有任何动作/下移）方可判；lockFlow 判定后消费复位
      let tspinPending = false
      // r20（AC-3/AC-10）：combo 链计数——锁定触点、仅「锁定是否清行」驱动（会话内存，不入持久化）：
      // 清行锁递增（combo 链内索引 = 递增前链值），清 0 行 / No-line T-spin 断链（归 0），restart 归 0；
      // hold/旋转（含踢墙）/软硬降/重力均不断链（与 tspinPending 的「操作清窗」语义刻意分离，互不干扰）
      let comboChain = 0
      // r23（AC-2/AC-7）：b2bChain 布尔会话链态——仅「锁定是否资格事件」驱动（与 comboChain 同触点
      // 但独立变量，D7 不做通用链抽象）：资格锁置 true（含断链后重新置链）、非资格消行/0 行/No-line/Mini
      // 置 false；hold/旋转/软硬降/重力不迁移；restart 归 false（OVER 为终态，出口即 restart，D6）
      let b2bChain = false
      // r32（AC-2/AC-4，additive）：会话统计闭包（与 comboChain/b2bChain 同风格：闭包会话内存，不入 state 对象）：
      // piecesPlaced = 成功落定计数（单一计数源，唯一收口在 lockFlow +1；Hold/移动/旋转/悬浮 0 不计）；
      // sessionTimeMs = 会话有效时长 ms（唯一累计在 tick 的 RUNNING 分支——暂停时钟停转天然不计，OVER 定格）；
      // start/restart 归零重计；0 行为变化（纯计数/累加赋值，不读取既有状态、不改返回值/emit/sfx）
      let piecesPlaced = 0
      let sessionTimeMs = 0
      // r34（AC-4/5/6，additive）：全局统计入账幂等标记——statsAccounted（本局 OVER 是否已定格入账，
      // start/restart 重置；重入/二次 OVER 帧拦截）+ timeFlushWatermark（本局已入账时长 ms，每次
      // flush/over 后推进；差值=只发未入账部分，同帧双触发/多事件自然归零）。双标记职责不同不作合并。
      let statsAccounted = false
      let timeFlushWatermark = 0
      // r33（AC-03.5，additive）：触底锁定重置预算剩余次数——per-piece 会话内存（与 r32 计数同风格闭包，
      // 不入 state 对象）：每次方块出生重置为 LOCK_MOVE_RESET_MAX；触底成功动作/悬空清零动作各 −1（封底 0）；
      // 被拒不耗；软降/硬降/重力不耗——仅 move/rotate 成功分支读写，_debug getter 作断言锚点
      let lockMoveResetsRemaining = LOCK_MOVE_RESET_MAX
      // r33：预算出生点单一收口小助手（spawnFirst / finishLock / hold×2 共用；spawn() 纯函数零改动保导出契约）
      function resetLockMoveBudget() {
        lockMoveResetsRemaining = LOCK_MOVE_RESET_MAX
      }

      /* ---- r34 全局统计入账/补记（纯增量；入账数据走 onStats 事件出口，不经快照——键集零追加） ---- */
      /** 事件发射（全零增量早退；disposed/无回调早退——事件面零新 sfx，纯数据通道） */
      function emitStats(reason, placed, lines, timeMs, games) {
        if (disposed || !cb.onStats) return
        if (!placed && !lines && !timeMs && !games) return
        cb.onStats({ reason: reason, placed: placed, lines: lines, timeMs: timeMs, games: games })
      }
      /** OVER 定格全量入账（finishLock 出生碰撞 + lose() 双入口调用；statsAccounted 幂等防重入） */
      function accountOver() {
        if (disposed || statsAccounted) return
        statsAccounted = true
        const delta = sessionTimeMs - timeFlushWatermark
        timeFlushWatermark = sessionTimeMs
        emitStats('over', piecesPlaced, state.lines, delta, 1)
      }
      /** 补记当前局未入账时长（RUNNING 判定 + 水印差值；幂等；测试/宿主可直调——Node 无 DOM 亦可） */
      function flushTime() {
        if (disposed || statsAccounted || state.phase !== 'RUNNING') return
        const delta = sessionTimeMs - timeFlushWatermark
        if (delta <= 0) return
        timeFlushWatermark = sessionTimeMs
        emitStats('flush', 0, 0, delta, 0)
      }
      // 隐藏/卸载补记（不受 autoPauseOnBlur 门控——补记必须恒可用；pagehide 兜底双保险）
      function onPageHide() { flushTime() }
      function onBeforeUnload() { flushTime() }
      // 消行动画时长（r13，AC-1/AC-9）：默认 240ms（容差 160~320）；0 = 即时消除（与 reduced-motion 等价，AC-7）；
      // 强制布尔/负值兜底为默认值（对齐 wallKickEnabled 的 opts 解析风格）；构造期只读，无运行期 setter
      const animMs = typeof opts.animMs === 'number' && opts.animMs >= 0 ? opts.animMs : 240

      /* ---- 快照与回调 ---- */
      function snapshot() {
        return {
          phase: state.phase,
          board: state.board.map(function (row) { return row.slice() }),
          piece: state.piece ? { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y } : null,
          next: state.next,
          // r15：多格预览队列（AC-1/AC-3/AC-10）：恒长 NEXT_QUEUE_SIZE；首格 = 下一出生块。
          // peekN 非消耗（derive 只读，不推进队列），队列内容与后续逐次 next() 消费序严格一致
          queue: [state.next].concat(state.queue.peekN(NEXT_QUEUE_SIZE - 1)),
          score: state.score,
          level: state.level,
          lines: state.lines,
          // r32（AC-13，additive）：会话统计——成功落定计数（恒非负整数、单一计数源）与会话有效时长 ms
          // （暂停不计、OVER 定格；恒 number）；生命周期与 score/level/lines 一致（非 clearing 期附加字段）
          piecesPlaced: piecesPlaced,
          sessionTimeMs: sessionTimeMs,
          // r13（AC-10，additive）：动画期附加快照字段；非动画期恒 null（不影响既有消费方对比）
          clearedIndices: state.clearing ? state.clearing.indices.slice() : null,
          animProgress: state.clearing ? Math.min(1, state.clearing.elapsed / animMs) : null,
          // r14 Hold 暂存槽类型（null 或 type 字符串）
          holdPiece: state.holdPiece ? state.holdPiece.type : null,
          // r18（AC-8，additive）：T-spin 判定类型（'full'|'mini'|'none'）；仅 clearing 期非 null
          tspin: state.clearing ? state.clearing.tspin : null,
          // r20（AC-8，additive）：本次锁定的 combo 链内索引与 combo 奖励增量；仅 clearing 期非 null
          // （生命周期对齐 r18 tspin：非动画期恒 null，不破坏既有消费方对比）
          combo: state.clearing ? state.clearing.combo : null,
          comboBonus: state.clearing ? state.clearing.comboBonus : null,
          // r23（AC-6，additive）：Back-to-back 链态（恒 boolean 连续暴露——测试与 P2 指示器消费面）
          // 与本次锁 B2B 增量（仅 clearing 期非 null，生命周期对齐 r20 comboBonus）
          b2bChain: b2bChain,
          b2bBonus: state.clearing ? state.clearing.b2bBonus : null,
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
      // r13（AC-1/AC-4）：clearing 子阶段——消行而非立即塌缩：动画期（T=animMs）保持含满行棋盘，
      // 进度由引擎 tick 驱动（唯一时钟），完结帧整体执行原子步（finishLock，两路径共享唯一实现，
      // 杜绝双份维护漂移）；暂停冻结/续播自然成立（clearing 不随暂停清空，AC-4）。
      function lockFlow() {
        const merged = merge(state.board, state.piece)
        const res = clearLines(merged) // 预计算，动画路径完结帧复用（AC-2 逐格等价来源）
        // r32（AC-2）：唯一落定收口——软降触底/硬降/自然 lockTimer/T-spin/No-line 全部经此，每方块恰 +1；
        // 随后无论进 clearing 子阶段还是 finishLock 均不二次计数（单一计数源，与对局事件一一对应）
        piecesPlaced += 1
        // r18（AC-1/9）：锁定瞬间快照判定（合并后棋盘 = 含踢墙位移后的最终落位）；
        // 窗口与 type 双门后消费复位（一块一判，与 state.piece = null 同栈）
        const kind = tspinPending && state.piece.type === 'T' ? tspinKind(merged, state.piece) : 'none'
        // r20（AC-5）：combo 链内索引（当前链值，预递增：清行累加在 finishLock 唯一出口，此处只读）与
        // 本次奖励增量；乘数取升级前 state.level（此刻 level 尚未被 finishLock 更新，与 r18 tspinBonus 同点位）；
        // cleared=0（含 No-line T-spin）→ comboIndex=0、comboVal=0；两值随载荷跨动画期传递（与 r18 同构，杜绝重算漂移）
        const comboIndex = res.cleared > 0 ? comboChain : 0
        const comboVal = res.cleared > 0 ? comboBonus(comboIndex, state.level) : 0
        // r23（AC-3）：本次锁 B2B 增量——链值只读（迁移唯一出口在 finishLock 首行，E3 防双计数）；
        // 乘数取升级前 state.level（与 combo 同点位）；非资格/链 off → 0；随载荷跨动画期传递（杜绝重算漂移）
        const b2bVal = b2bBonus(b2bChain, kind, res.cleared, state.level)
        tspinPending = false
        state.piece = null
        state.lockTimer = 0
        state.gravityAcc = 0
        // r14 AC-15：holdEnabled 关闭时，当前方块锁定后清空暂存槽
        if (!holdEnabled && state.holdPiece !== null) {
          state.holdPiece = null
        }
        if (res.cleared > 0 && animMs > 0) {
          // → clearing 子阶段：保持含满行棋盘（视觉静止），动画结束帧才塌缩
          state.board = merged
          state.clearing = { indices: res.indices, elapsed: 0, res: res, tspin: kind, combo: comboIndex, comboBonus: comboVal, b2bBonus: b2bVal } // r18：判定随载荷跨动画期传递；r20：combo 索引/奖励增量同传；r23：B2B 增量同传
          sfx('clear') // 动画开始帧恰好 1 次（AC-3；2/3/4 行均 1 次，AC-09.2/E-SFX-03）
          emit() // 首帧快照 clearedIndices + animProgress=0
          // 入口返回值：levelUp/gameOver 为「完成时」才确定的结果（§2.4），动画接管期恒 false
          return { ok: true, locked: true, cleared: res.cleared, levelUp: false, gameOver: false }
        }
        // —— 既有原子步（cleared=0 或 animMs=0 与现状逐点等价，AC-2/AC-7）——
        return finishLock(res.board, res.cleared, true, kind, comboIndex, comboVal, b2bVal)
      }

      /** 动画完结帧：elapsed ≥ animMs → 原子步整体执行（塌缩→计分/行数/升级→spawn→碰撞） */
      function completeClearing() {
        const cl = state.clearing
        state.clearing = null
        finishLock(cl.res.board, cl.res.cleared, false, cl.tspin, cl.combo, cl.comboBonus, cl.b2bBonus) // r18：动画载荷携带的 tspin 判定（sfx('clear') 已首帧发射）；r20：combo 载荷同传；r23：B2B 增量同传
      }

      /** 原子步（即时路径与动画完结帧共享唯一实现）：塌缩 → 计分 → 升级 → spawn → 出生碰撞 → GAME_OVER。
       *  playClearSfx=true 时于本步发射 sfx('clear')（即时路径）；动画路径已在首帧发过 → false。 */
      function finishLock(board, cleared, playClearSfx, tspin, combo, comboBonusVal, b2bBonusVal) {
        state.board = board
        // r20（AC-3/AC-10）：链更新无条件置于最前——清行递增 / 清 0 行断链 / No-line T-spin 断链 /
        // 出生碰撞（GAME_OVER）全部必经同一出口（恰一次；E3 防双计数：禁止在 lockFlow 预增）
        comboChain = cleared > 0 ? comboChain + 1 : 0
        // r23（AC-2）：b2bChain 迁移唯一出口（与 comboChain 同触点，finishLock 首行）——
        // 资格锁→true / 非资格消行·0 行·No-line·Mini→false；lockFlow 只读链值算增量（E3 防双计数）
        b2bChain = b2bQualifies(tspin, cleared) ? true : false
        let levelUp = false
        // r18（AC-6/7/11）：T-spin 加分与普通消行分叠加恰各一次（kind='none' → 恒 0）；
        // 乘数取升级前 state.level，与 scoreForLines 同点位；bonus 不触碰 lines → 不推进等级
        const bonus = tspinBonus(tspin, cleared, state.level)
        if (cleared > 0) {
          state.score += scoreForLines(cleared, state.level) + bonus + comboBonusVal + b2bBonusVal // 普通基分 + T-spin 分 + combo 奖励 + B2B 奖励（四轴恰各一次，AC-6；b2b 不触碰 lines/level）
          state.lines += cleared
          const newLevel = levelForLines(state.lines)
          levelUp = newLevel > state.level
          state.level = newLevel
          if (playClearSfx) sfx('clear') // 一次消行动作恰好 1 次（含 2/3/4 行，AC-09.2/E-SFX-03）
        } else if (bonus > 0) {
          state.score += bonus // No-line T-spin（cleared=0 + full）：加分但无 clear/无行/无升级（AC-8/11）
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
          accountOver() // r34：出生碰撞 OVER 入口①——定格全量入账（piecesPlaced/lines/sessionTimeMs 已定格；幂等）
          return { ok: true, locked: true, cleared: cleared, levelUp: levelUp, gameOver: true }
        }
        state.piece = p
        resetLockMoveBudget() // r33：finishLock 自然出生点——锁定后新块预算恢复满额（防跨方块继承耗尽预算）
        holdUsed = false // r14 AC-5：新方块出生后重置 hold 使用限制
        emit()
        if (levelUp && cb.onLevelUp) cb.onLevelUp(state.level)
        if (levelUp) sfx('levelUp')
        return { ok: true, locked: true, cleared: cleared, levelUp: levelUp, gameOver: false }
      }

      function spawnFirst() {
        // r18：新方块周期开启 → 旋转窗口失效（start/restart 出生处清窗）
        tspinPending = false
        // 仅在 READY/RUNNING 重置后调用（棋盘为空，出生必不碰撞，防御性校验）
        const type = state.next
        state.next = state.queue.next()
        const p = spawn(type)
        if (spawnCollides(state.board, p)) {
          state.phase = transition(state.phase, 'lose')
          stopLoop()
        } else {
          state.piece = p
          resetLockMoveBudget() // r33：start/restart 出生点——新方块周期预算满额（TECHNICAL §2.3）
        }
      }

      /* ---- 公共动作 ---- */
      function start() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'READY') return { ok: false, reason: 'illegal-phase' }
        state.phase = transition(state.phase, 'start')
        // r32（AC-4/5）：READY→start 新局归零（防御性——READY 期本就为 0，保证新对局从绝对零起）
        piecesPlaced = 0
        sessionTimeMs = 0
        // r34：新会话复位两入账标记（OVER 后新局从零入账）
        statsAccounted = false
        timeFlushWatermark = 0
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
        state.clearing = null // r13（AC-6/§2.2）：restart 强制清空动画状态（防宿主异常调用留脏）
        state.holdPiece = null // r14：restart 清空暂存槽
        holdUsed = false // r14：restart 重置 hold 使用限制（与 spawnFirst 后新方块出生同语义）
        tspinPending = false // r18：restart 新周期清窗
        comboChain = 0 // r20：restart 新周期清链（链态=会话内存，start/READY 初始即 0）
        b2bChain = false // r23：restart 新周期清链（同会话内存口径；OVER 为终态不可观察，出口即 restart，D6）
        // r32（AC-4/5）：restart 任意态归零重计（与其它会话重置同批；OVER 出口必经本函数）
        piecesPlaced = 0
        sessionTimeMs = 0
        // r34：新会话复位两入账标记（OVER 定格后经 restart 开新局，防跨局叠加）
        statsAccounted = false
        timeFlushWatermark = 0
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
        if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
        // r13（AC-4/E2）：动画期输入一律拒绝（不排队、不发声），reason='clearing' 为内部枚举（UMD 签名不变）
        if (state.clearing) return { ok: false, reason: 'clearing' }
        if (!state.piece) return { ok: false, reason: 'illegal-phase' }
        const d = dir === -1 ? -1 : 1
        const moved = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x + d, y: state.piece.y }
        if (collides(state.board, moved)) return { ok: false, reason: 'blocked' } // E2 原位不动（不发声，AC-09.3）
        state.piece = moved
        tspinPending = false // r18（D-01/AC-1）：水平移动成功清窗——"最后动作是旋转"字面，滑入不判
        // r33（AC-03.5）：成功移动三支化——触底且预算>0 → 重置缓冲至满额（重新计满 LOCK_DELAY_MS）；
        // 触底且预算=0 → 不重置（缓冲按原速率续计至 500ms 锁定）；悬空 → 沿用既有清零路径（AC-1）；
        // 成功动作（触底重置或悬空清零）各耗 1 预算（封底 0）；被拒路径零触碰（不重置不发声不耗预算）
        if (isGrounded(state.board, state.piece)) {
          if (lockMoveResetsRemaining > 0) state.lockTimer = 0
        } else {
          state.lockTimer = 0 // 悬空清零（既有路径逐字节保留）
        }
        if (lockMoveResetsRemaining > 0) lockMoveResetsRemaining-- // 含悬空清零动作（PRD §4「预算 −1（≤15，含悬空清零动作）」）
        emit()
        sfx('move') // 仅移动成功（含 DAS 每次成功，AC-09.2）
        return { ok: true }
      }

      function rotate() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
        // r13（AC-4/E2）：动画期输入一律拒绝（不排队、不发声），reason='clearing' 为内部枚举（UMD 签名不变）
        if (state.clearing) return { ok: false, reason: 'clearing' }
        if (!state.piece) return { ok: false, reason: 'illegal-phase' }
        const next = rotated(state.piece, 1)
        if (!collides(state.board, next)) {
          // 原地合法：直接成功（AC-18/AC-19 共用路径）
          state.piece = next
          // r33：原地旋转成功——同 move 三支化（触底+预算>0 重置满额 / 触底+预算=0 不重置 / 悬空既有清零），成功动作耗 1 预算
          if (isGrounded(state.board, state.piece)) {
            if (lockMoveResetsRemaining > 0) state.lockTimer = 0
          } else {
            state.lockTimer = 0 // 悬空清零（既有路径逐字节保留）
          }
          if (lockMoveResetsRemaining > 0) lockMoveResetsRemaining-- // 含悬空清零动作
          emit()
          sfx('rotate') // 仅旋转成功
          tspinPending = true // r18（AC-1）：旋转成功置窗（原地旋转，位移非必需）
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
            // r33：kick 命中旋转成功——同 move 三支化（触底+预算>0 重置满额 / 触底+预算=0 不重置 / 悬空既有清零），成功动作耗 1 预算
            if (isGrounded(state.board, state.piece)) {
              if (lockMoveResetsRemaining > 0) state.lockTimer = 0
            } else {
              state.lockTimer = 0 // 悬空清零（既有路径逐字节保留）
            }
            if (lockMoveResetsRemaining > 0) lockMoveResetsRemaining-- // 含悬空清零动作
            emit()
            sfx('rotate') // 仅旋转成功
            tspinPending = true // r18（AC-1）：kick 命中置窗（踢墙位移后的最终落位，AC-9 快照）
            return { ok: true }
          }
        }
        // v2.9（AC-19.3）：全部偏移失败 → 保持原位
        return { ok: false, reason: 'wall-kick-denied' }
      }

      function softDrop() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
        // r13（AC-4/E2）：动画期输入一律拒绝（不排队、不发声），reason='clearing' 为内部枚举（UMD 签名不变）
        if (state.clearing) return { ok: false, reason: 'clearing' }
        if (!state.piece) return { ok: false, reason: 'illegal-phase' }
        const moved = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + 1 }
        if (collides(state.board, moved)) {
          // 软降后仍触底 → 立即固定（TECHNICAL §6.2）；下移未成功不发射 softDrop
          // （E-SFX-02），lockFlow 内的 clear/levelUp/gameOver 正常发射
          tspinPending = false // r18（D-02/AC-3）：软降触底立即锁定也清窗——最后动作是下落尝试
          return lockFlow()
        }
        state.piece = moved
        tspinPending = false // r18（AC-3）：软降成功下移清窗
        state.lockTimer = 0
        emit()
        sfx('softDrop') // 仅软降成功下移 1 格
        return { ok: true }
      }

      function hardDrop() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
        // r13（AC-4/E2）：动画期输入一律拒绝（不排队、不发声），reason='clearing' 为内部枚举（UMD 签名不变）
        if (state.clearing) return { ok: false, reason: 'clearing' }
        if (!state.piece) return { ok: false, reason: 'illegal-phase' }
        let d = 0
        while (!collides(state.board, { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + d + 1 })) {
          d++
        }
        // v2.3（AC-14）：硬降落地不加分（移除 dropBonus 每格 +1）；仅锁定的消行在 lockFlow 计分
        state.piece = { type: state.piece.type, rot: state.piece.rot, x: state.piece.x, y: state.piece.y + d }
        tspinPending = false // r18（AC-3）：硬降清窗（落点计算后、lockFlow 前）
        sfx('hardDrop') // 每次硬降恰好 1 次（落点计算后、lockFlow 前，E-SFX-04 顺序首项）
        return lockFlow() // 硬降立即固定，不走缓冲
      }

      /**
       * Hold 暂存操作（r14，AC-1 ~ AC-6）。
       * @returns {{ ok: boolean, reason?: string }}
       *   ok=true  → 暂存/交换成功（UI 应播放 hold 音效）
       *   ok=false → 被拒（UI 不播放音效）
       *   reason: 'disabled' | 'illegal-phase' | 'clearing' | 'already-used' | 'no-piece'
       */
      function hold() {
        if (disposed) return { ok: false, reason: 'illegal-phase' }
        if (state.phase !== 'RUNNING') return { ok: false, reason: 'illegal-phase' }
        if (state.clearing) return { ok: false, reason: 'clearing' }
        if (!holdEnabled) return { ok: false, reason: 'disabled' }
        if (!state.piece) return { ok: false, reason: 'no-piece' }
        if (holdUsed) return { ok: false, reason: 'already-used' }

        const currentType = state.piece.type

        if (state.holdPiece === null) {
          // 暂存槽为空：当前方块 → 暂存槽，next → 当前方块
          state.holdPiece = { type: currentType }
          const nextType = state.next
          state.next = state.queue.next()
          state.piece = spawn(nextType)
          resetLockMoveBudget() // r33：hold 暂存（槽空）出生点——新方块周期预算满额
        } else {
          // 暂存槽非空：交换当前方块与暂存槽
          const heldType = state.holdPiece.type
          state.holdPiece = { type: currentType }
          state.piece = spawn(heldType)
          resetLockMoveBudget() // r33：hold 交换出生点——换出方块新周期预算满额
          // next 不变——交换暂存槽不消耗队列
        }

        tspinPending = false // r18：hold 交换/存入完成后新方块周期开启 → 窗口失效

        // 出生碰撞检测（AC-4 重置出生点后可能碰撞 → GAME OVER）
        if (spawnCollides(state.board, state.piece)) {
          state.phase = transition(state.phase, 'lose')
          stopLoop()
          emit()
          if (cb.onGameOver) cb.onGameOver(state.score)
          sfx('gameOver')
          return { ok: true } // 返回 ok=true 因为 hold 操作本身成功（音效由 hold 驱动，gameOver 由 sfx 驱动）
        }

        holdUsed = true
        emit()
        sfx('hold')
        return { ok: true }
      }

      /** 手动时钟驱动：宿主在 autoLoop:false 时每帧调用（dt 单位 ms，内部 clamp ≤ 250） */
      function tick(dtMs) {
        if (disposed || state.phase !== 'RUNNING') return
        const dt = dtMs < 0 ? 0 : dtMs > DT_CLAMP_MS ? DT_CLAMP_MS : dtMs
        // r32（AC-4）：唯一 RUNNING 时钟累计——本函数首行守卫已保证仅 RUNNING 进入（PAUSED/OVER 天然停表）；
        // clearing 动画期放此处（clearing 分支之前）也计（对局进行中非暂停）；纯累加不改 changed/emit 语义（0 行为变化）
        sessionTimeMs += dt
        // r13（AC-5）：动画期 piece===null，原「!state.piece」早退必须让位——clearing 守卫先行：
        // dt 只进动画进度（gravityAcc/lockTimer 冻结），完结帧整体执行原子步
        if (state.clearing) {
          state.clearing.elapsed += dt
          if (state.clearing.elapsed >= animMs) completeClearing()
          else emit()
          return
        }
        if (!state.piece) return
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
            tspinPending = false // r18（AC-3）：自然重力实际下移清窗（旋转后悬空落地不判）
            state.lockTimer = 0
            changed = true
          } else {
            break // 触底——未移动不清窗（旋转落地后经 lockTimer 锁定仍判，E11）
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
        state.clearing = null // r13（AC-6/§2.2）：OVER 后动画状态清空，无残留亮度帧
        state.phase = transition(state.phase, 'lose')
        stopLoop()
        emit()
        if (cb.onGameOver) cb.onGameOver(state.score)
        sfx('gameOver') // 强制结束也发声（E-SFX-06，进入 OVER 态恰好 1 次）
        accountOver() // r34：OVER 入口②（强制结束）——定格全量入账（与入口①互斥由 phase 状态机 + statsAccounted 兜底）
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
        if (typeof document !== 'undefined' && document.hidden && state.phase === 'RUNNING') {
          flushTime() // r34：先补记（此刻仍 RUNNING 的已玩时长入账）再自动暂停——顺序不可反（切后台时长不丢不虚增）
          togglePause()
        }
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

      /* ---- r31：动作级分发核心（键盘 L2 与触屏/回放动作输入共用） ---- */

      // 单发动作即时执行；moveLeft/moveRight/softDrop 返回 'holdable'（held/DAS 由调用方注册）
      function fireAction(action) {
        if (action === 'start') { start(); return null }
        if (action === 'restart') { restart(); return null }
        if (action === 'togglePause') { togglePause(); return null }
        if (action === 'rotate') { rotate(); return null }
        if (action === 'hardDrop') { hardDrop(); return null }
        if (action === 'hold') { hold(); return null }
        if (action === 'moveLeft' || action === 'moveRight' || action === 'softDrop') return 'holdable'
        return null
      }

      // held 注册 + 首击立即执行（沿袭既有语义：move 首移 / softDrop 首格 / DAS 由时钟接管；
      // 同键重复忽略；key 为 held 键标——键盘=绑定键名，触屏='touch:<action>'）
      function routeHeldAction(action, key) {
        if (held.has(key)) return
        let spec = null
        if (action === 'moveLeft') spec = { action: function () { move(-1) }, delay: DAS_DELAY_MS, repeat: DAS_REPEAT_MS, acc: 0, fired: false }
        else if (action === 'moveRight') spec = { action: function () { move(1) }, delay: DAS_DELAY_MS, repeat: DAS_REPEAT_MS, acc: 0, fired: false }
        else if (action === 'softDrop') spec = { action: function () { softDrop() }, delay: SOFT_DROP_REPEAT_MS, repeat: SOFT_DROP_REPEAT_MS, acc: 0, fired: true }
        if (spec === null) return
        held.set(key, spec)
        spec.action()
        startKeyRepeat()
      }

      // 触屏/回放动作级输入（DESIGN D-6：动作分发不依赖键盘绑定键；TOUCH_KEYS 六动作恒生效）
      function actionInput(action, down) {
        if (disposed) return false
        const tag = TOUCH_TAG_PREFIX + String(action)
        if (down === false) {
          if (held.has(tag)) {
            held.delete(tag)
            if (held.size === 0) stopKeyRepeat()
          }
          return true
        }
        if (down !== true) return false
        if (fireAction(action) === 'holdable') routeHeldAction(action, tag)
        return true
      }

      // r31：preventDefault 随绑定动态化（DESIGN §3.1：方向键/空格/单字符可打印键一律拦截，
      // 防滚动 + 防遮罩/按钮聚焦时空格二次激活，沿袭 E-11-03）
      function preventForKey(k) {
        if (typeof k !== 'string' || k.length === 0) return false
        const lower = k === ' ' ? ' ' : k.toLowerCase()
        if (lower === ' ' || lower === 'arrowleft' || lower === 'arrowright' || lower === 'arrowup' || lower === 'arrowdown') return true
        if (lower.length === 1) return true // 单字符可打印键（字母/数字/标点）
        return false
      }

      function onKeyDown(e) {
        const k = e.key
        if (preventForKey(k)) e.preventDefault()
        if (e.repeat) return // 重复键由 DAS/软降定时器管理，单发键忽略系统重复

        // r31：两级分发——L1 系统阶段键（READY/OVER）+ L2 绑定表（默认∪自定义）
        const action = keyAction(state.phase, k, keyBindings)
        if (!action) return // null = 无动作（READY/OVER 按 P 等，AC-11.6）
        if (fireAction(action) === 'holdable') {
          const norm = normalizeKeyName(k)
          if (norm !== null) routeHeldAction(action, norm)
        }
      }

      function onKeyUp(e) {
        const k = normalizeKeyName(e.key)
        if (k === null) return
        // r31：同键删除（onKeyDown 按绑定键名注册、onKeyUp 同名删除——消除
        // 「keyup 删不到 held 条目 → DAS 卡死」陷阱，DESIGN §3.1 裁定证据 1）
        if (held.has(k)) {
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
        // r14 Hold 暂存开关读写（UI 装配期同步；钳制为布尔，实时生效）
        setHoldEnabled: function (enabled) {
          if (disposed) return false
          holdEnabled = enabled === true
          return true
        },
        getHoldEnabled: function () { return holdEnabled },
        getHoldPiece: function () { return state.holdPiece ? state.holdPiece.type : null },
        hold: hold,
        softDrop: softDrop,
        hardDrop: hardDrop,
        tick: tick,
        flushTime: flushTime, // r34：补记当前局未入账时长（Node 测试/宿主直调；幂等）
        lose: lose,
        attachKeyboard: attachKeyboard,
        detachKeyboard: detachKeyboard,
        isKeyboardAttached: function () { return keyboardAttached },
        // r31：自定义按键——绑定表读写（清洗幂等；键变更即释放 held，防旧键卡死 DAS/软降时钟）
        setKeyBindings: function (map) {
          if (disposed) return false
          keyBindings = sanitizeBindings(map)
          held.clear()
          stopKeyRepeat()
          return true
        },
        getKeyBindings: function () {
          const out = {}
          for (let i = 0; i < GAME_BIND_ACTIONS.length; i++) out[GAME_BIND_ACTIONS[i]] = keyBindings[GAME_BIND_ACTIONS[i]]
          return out
        },
        input: actionInput, // r31：动作级输入（触屏/回放；与键盘绑定解耦）
        dispose: function () {
          if (disposed) return
          disposed = true
          stopLoop()
          detachKeyboard()
          if (autoPauseOnBlur && isBrowser) {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('blur', onWindowBlur)
          }
          // r34：卸载补记监听对称移除（不受 autoPauseOnBlur 门控——与注册侧条件严格一致）
          if (isBrowser) {
            window.removeEventListener('pagehide', onPageHide)
            window.removeEventListener('beforeunload', onBeforeUnload)
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
          // r33（AC-03.5/AC-10）：触底重置预算只读 getter——断言锚点（debug 导出路线，不追加快照字段，
          // 保 r32 §4.1-9 快照键集断言零改动；TECHNICAL §2.5）
          getLockMoveResetsRemaining: function () { return lockMoveResetsRemaining },
        },
      }

      /* ---- 初始化：绑定失焦监听 + 键盘 + 初始 READY 快照 ---- */
      if (autoPauseOnBlur && isBrowser) {
        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('blur', onWindowBlur)
      }
      // r34：隐藏/卸载补记监听——恒注册（不受 autoPauseOnBlur 门控，补记必须恒可用；dispose 对称移除）
      if (isBrowser) {
        window.addEventListener('pagehide', onPageHide)
        window.addEventListener('beforeunload', onBeforeUnload)
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
      NEXT_QUEUE_SIZE: NEXT_QUEUE_SIZE, // r15：多格预览队列格数（AC-10，恒 3）
      LINE_SCORES: LINE_SCORES.slice(),
      // r18（AC-6）：T-spin 加分六档（索引 = 清除行数；mini 3 行按 Full Triple=1600 防漏分）
      T_SPIN_BONUS: { full: T_SPIN_BONUS.full.slice(), mini: T_SPIN_BONUS.mini.slice() },
      // r20（PRD §5）：combo 递增奖励基数（单一事实来源，verify-game.cjs §15.0 断言）
      COMBO_BONUS_BASE: COMBO_BONUS_BASE,
      // r23（PRD §5）：Back-to-back 定值基数（单一事实来源，verify-game.cjs §16.0 / qa-e2e B 段断言）
      B2B_BONUS_BASE: B2B_BONUS_BASE,
      LOCK_DELAY_MS: LOCK_DELAY_MS,
      // r33（PRD §5）：触底锁定重置预算上限（每方块至多 15 次成功移动/旋转重置；单一事实来源）
      LOCK_MOVE_RESET_MAX: LOCK_MOVE_RESET_MAX,
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
      // r18：T-spin 几何判定 / 加分纯函数（Node 可单测）
      tspinKind: tspinKind,
      tspinBonus: tspinBonus,
      // r20：combo 奖励纯函数（Node 可单测，同 tspinBonus）
      comboBonus: comboBonus,
      // r23：B2B 资格 / 奖励纯函数（Node 可单测，同 comboBonus）
      b2bQualifies: b2bQualifies,
      b2bBonus: b2bBonus,
      transition: transition,
      keyAction: keyAction, // v2.1：键盘映射单一来源表（AC-11，Node 可单测）；r31 两级分发（第三参绑定表）
      // r31：自定义按键契约（默认键表 / 可改动作 / 动作级输入）
      DEFAULT_KEYBINDINGS: Object.assign({}, DEFAULT_KEYBINDINGS),
      GAME_BIND_ACTIONS: GAME_BIND_ACTIONS.slice(),
      // 会话工厂
      createGame: createGame,
    }
  }
)
