'use strict'
/*!
 * tetris/scripts/verify-game.cjs — game.js 行为自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-game.cjs
 *
 * 说明：项目暂无 package.json（T0 脚手架尚未执行），`.js` 按 CommonJS 解析，
 * 故本脚本用 `.cjs` + require 加载 game.js。若后续 package.json 设置
 * "type": "module"，浏览器侧契约（window.TetrisGame）不受影响；本脚本届时
 * 由 T0/T13 的 Vitest 用例（src 下的 .test.ts）替代或迁移。
 *
 * 覆盖：PRD §5 数值 100% 钉死（AC-06.5）、方块/旋转/碰撞/消行、状态机迁移
 * 矩阵全遍历、会话集成（AC-02/03/04/05/06 关键路径）、键盘映射 keyAction 矩阵
 * 与恢复节拍差值续算（v2.1，AC-11；TECHNICAL §7.1）。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../game.js')

/* ---------- 工具 ---------- */

function snapshotDeep(a, b) {
  // 除 phase 外全字段深比较（board 逐行）
  if (a.score !== b.score || a.level !== b.level || a.lines !== b.lines || a.next !== b.next) return false
  if ((a.piece === null) !== (b.piece === null)) return false
  if (a.piece) {
    if (a.piece.type !== b.piece.type || a.piece.rot !== b.piece.rot || a.piece.x !== b.piece.x || a.piece.y !== b.piece.y) return false
  }
  if (a.board.length !== b.board.length) return false
  for (let r = 0; r < a.board.length; r++) {
    for (let c = 0; c < a.board[r].length; c++) {
      if (a.board[r][c] !== b.board[r][c]) return false
    }
  }
  return true
}

function fullRow(type, exceptCol) {
  const row = []
  for (let c = 0; c < 10; c++) row.push(c === exceptCol ? null : type)
  return row
}

function countFilled(shape) {
  let n = 0
  for (const row of shape) for (const v of row) if (v) n++
  return n
}

/** 形状最低实心行索引（幽灵块空板落板底计算用，v2.2） */
function bottomRowOf(shape) {
  for (let r = shape.length - 1; r >= 0; r--) {
    for (const v of shape[r]) if (v) return r
  }
  return -1
}

/** 构造带单行横向掩体（row 行全 type，exceptCol 为空）的棋盘（v2.2 幽灵块落点测试用） */
function boardWithObstacle(type, row, exceptCol) {
  const b = T.createBoard()
  for (let c = 0; c < 10; c++) {
    if (c === exceptCol) continue
    b[row][c] = type
  }
  return b
}

/* ---------- 1. 导出与常量 ---------- */

test('exports: window 无关、模块导出齐全', () => {
  assert.equal(typeof T.createGame, 'function')
  assert.equal(typeof T.createBoard, 'function')
  assert.equal(typeof T.createQueue, 'function')
  assert.equal(typeof T.transition, 'function')
  assert.equal(T.COLS, 10)
  assert.equal(T.ROWS, 20)
  assert.deepEqual(T.TYPES, ['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
  assert.deepEqual(T.PHASES, ['READY', 'RUNNING', 'PAUSED', 'OVER'])
})

test('SFX_EVENTS: v2.0 音效事件集 7 值（AC-09，audio.js/装配/测试统一引用）', () => {
  assert.deepEqual(T.SFX_EVENTS, ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver'])
})

test('常量与 PRD §5 一致', () => {
  assert.deepEqual(T.LINE_SCORES, [100, 300, 500, 800])
  assert.equal(T.LOCK_DELAY_MS, 500) // AC-03.5
  assert.equal(T.DAS_DELAY_MS, 170) // AC-02.1
  assert.equal(T.DAS_REPEAT_MS, 100)
  assert.equal(T.SOFT_DROP_REPEAT_MS, 50) // AC-02.2
})

/* ---------- 2. 计分 / 等级 / 速度（AC-06.5 数值 100% 钉死） ---------- */

test('scoreForLines: 1/2/3/4 行 × 多等级', () => {
  assert.equal(T.scoreForLines(1, 1), 100)
  assert.equal(T.scoreForLines(2, 1), 300)
  assert.equal(T.scoreForLines(3, 1), 500)
  assert.equal(T.scoreForLines(4, 1), 800)
  assert.equal(T.scoreForLines(1, 2), 200)
  assert.equal(T.scoreForLines(2, 2), 600)
  assert.equal(T.scoreForLines(4, 2), 1600)
  assert.equal(T.scoreForLines(1, 3), 300)
  assert.equal(T.scoreForLines(3, 3), 1500)
  assert.equal(T.scoreForLines(4, 5), 4000)
})

test('dropBonus / levelForLines', () => {
  assert.equal(T.dropBonus(0), 0)
  assert.equal(T.dropBonus(5), 5)
  assert.equal(T.dropBonus(18), 18)
  assert.equal(T.levelForLines(0), 1)
  assert.equal(T.levelForLines(9), 1)
  assert.equal(T.levelForLines(10), 2) // AC-06.2
  assert.equal(T.levelForLines(20), 3)
  assert.equal(T.levelForLines(21), 3)
  assert.equal(T.levelForLines(100), 11)
})

test('gravityMs: 速度表与下限（AC-06.3）', () => {
  assert.equal(T.gravityMs(1), 1000)
  assert.equal(T.gravityMs(2), 850)
  assert.equal(T.gravityMs(3), 723)
  assert.equal(T.gravityMs(4), 614)
  assert.equal(T.gravityMs(50), 100) // 下限
  assert.equal(T.gravityMs(1000), 100)
  for (let l = 1; l < 40; l++) {
    assert.ok(T.gravityMs(l) >= T.gravityMs(l + 1), '速度随等级单调不增')
    assert.ok(T.gravityMs(l) >= 100, '不低于下限')
  }
})

/* ---------- 3. 方块定义（T1 契约） ---------- */

test('SHAPES: 7 型 × 4 旋转态，格数恒为 4，方形矩阵', () => {
  for (const t of T.TYPES) {
    const states = T.SHAPES[t]
    assert.equal(states.length, 4, t + ' 应有 4 个旋转态')
    const n = states[0].length
    for (const s of states) {
      assert.equal(s.length, n, t + ' 方形矩阵')
      for (const row of s) assert.equal(row.length, n, t + ' 行宽一致')
      assert.equal(countFilled(s), 4, t + ' 每态 4 格')
    }
  }
})

test('rotated: 顺时针旋转 4 次还原', () => {
  for (const t of T.TYPES) {
    const p = T.spawn(t)
    let q = p
    for (let i = 0; i < 4; i++) q = T.rotated(q, 1)
    assert.equal(q.rot, 0, t + ' rot 还原')
    assert.deepEqual(T.shapeOf(q), T.shapeOf(p), t + ' 形状还原')
  }
})

test('spawn: 顶部居中、完全在板内（AC-01.3）', () => {
  const expect = { I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 }
  for (const t of T.TYPES) {
    const p = T.spawn(t)
    assert.equal(p.x, expect[t], t + ' x 居中')
    assert.equal(p.y, 0)
    assert.equal(p.rot, 0)
    for (const cell of T.pieceCells(p)) {
      assert.ok(cell.x >= 0 && cell.x < 10 && cell.y >= 0 && cell.y < 20, t + ' 完全可见')
    }
  }
})

test('COLORS: 7 色 fill hex 两两不同（AC-07.5）', () => {
  const fills = T.TYPES.map((t) => T.COLORS[t].fill)
  assert.equal(new Set(fills).size, 7)
  for (const t of T.TYPES) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(T.COLORS[t].fill), t + ' hex 格式')
    assert.equal(typeof T.COLORS[t].glow, 'string')
  }
})

/* ---------- 4. 棋盘（T2 契约） ---------- */

test('createBoard: 20×10 全空', () => {
  const b = T.createBoard()
  assert.equal(b.length, 20)
  for (const row of b) {
    assert.equal(row.length, 10)
    assert.ok(row.every((c) => c === null))
  }
})

test('collides: 越界与压块（AC-02.4）', () => {
  const b = T.createBoard()
  const p = T.spawn('T') // 3×3，x=3
  assert.equal(T.collides(b, p), false)
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: -1, y: 0 }), true, '左越界')
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: 10, y: 0 }), true, '右越界')
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: 3, y: 19 }), true, '底部越界')
  b[1][3] = 'J' // T 在 (x+1=4? 见下) 占用验证
  // T rot0 格点：x+1, y / x, y+1 / x+1, y+1 / x+2, y+1；x=3,y=0 → (4,0)(3,1)(4,1)(5,1)
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: 3, y: 0 }), true, '压块')
})

test('merge: 不可变 + 写入类型', () => {
  const b = T.createBoard()
  const p = { type: 'S', rot: 0, x: 3, y: 0 }
  const m = T.merge(b, p)
  assert.notEqual(m, b, '返回新数组')
  assert.ok(b.every((row) => row.every((c) => c === null)), '原 board 不变')
  let filled = 0
  for (const row of m) for (const c of row) if (c === 'S') filled++
  assert.equal(filled, 4)
})

test('clearLines: 单行/多行一次性消除 + 上方行下移（AC-03.2/3）', () => {
  // 无满行
  const b0 = T.createBoard()
  b0[19][0] = 'J'
  const r0 = T.clearLines(b0)
  assert.equal(r0.cleared, 0)
  assert.deepEqual(r0.indices, [])
  assert.equal(r0.board, b0, '无变化时返回原引用')

  // 单行（row 19）
  const b1 = T.createBoard()
  b1[19] = fullRow('I', -1)
  b1[18][3] = 'T'
  const r1 = T.clearLines(b1)
  assert.equal(r1.cleared, 1)
  assert.deepEqual(r1.indices, [19])
  assert.ok(r1.board[0].every((c) => c === null), '顶部补入空行')
  assert.equal(r1.board[18][3], null, '上方行整体下移 1 行')
  assert.equal(r1.board[19][3], 'T', '原 row18 内容落到 row19')

  // 多行（rows 16-19 四行一次消）
  const b4 = T.createBoard()
  for (let r = 16; r < 20; r++) b4[r] = fullRow('I', -1)
  b4[15][0] = 'L'
  const r4 = T.clearLines(b4)
  assert.equal(r4.cleared, 4)
  assert.deepEqual(r4.indices, [16, 17, 18, 19])
  for (let r = 16; r < 19; r++) assert.ok(r4.board[r].every((c) => c === null), 'rows16-18 清空')
  assert.equal(r4.board[19][0], 'L', 'row15 内容落到 row19')
  assert.notEqual(r4.board, b4, '新数组')
  assert.equal(b4[19][0], 'I', '原 board 不变')
})

/* ---------- 5. 队列（T4 契约） ---------- */

test('createQueue: 注入 RNG 确定、peek 不消耗', () => {
  const seq = [0.05, 0.3, 0.75, 0.9] // 索引 0/2/5/6 → I/T/J/L
  let i = 0
  const q = T.createQueue(() => seq[i++ % seq.length])
  assert.equal(q.peek(), 'I')
  assert.equal(q.peek(), 'I', 'peek 不消耗')
  assert.equal(q.next(), 'I')
  assert.equal(q.peek(), 'T')
  assert.equal(q.next(), 'T')
  assert.equal(q.next(), 'J')
  assert.equal(q.next(), 'L')
  assert.equal(q.next(), 'I', '循环后回到 I')
})

test('createQueue: 默认均匀随机分布（大样本各型 ≈1/7）', () => {
  const counts = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 }
  const q = T.createQueue()
  for (let k = 0; k < 7000; k++) counts[q.next()]++
  for (const t of T.TYPES) {
    assert.ok(counts[t] > 700, t + ' 频率下限 ' + counts[t])
    assert.ok(counts[t] < 1300, t + ' 频率上限 ' + counts[t])
  }
})

/* ---------- 6. 状态机（T5 契约：迁移矩阵全遍历） ---------- */

test('transition: 迁移矩阵 20 格全遍历', () => {
  assert.equal(T.transition('READY', 'start'), 'RUNNING')
  assert.equal(T.transition('READY', 'pause'), 'READY')
  assert.equal(T.transition('READY', 'resume'), 'READY')
  assert.equal(T.transition('READY', 'restart'), 'RUNNING')
  assert.equal(T.transition('READY', 'lose'), 'READY')

  assert.equal(T.transition('RUNNING', 'start'), 'RUNNING')
  assert.equal(T.transition('RUNNING', 'pause'), 'PAUSED')
  assert.equal(T.transition('RUNNING', 'resume'), 'RUNNING')
  assert.equal(T.transition('RUNNING', 'restart'), 'RUNNING')
  assert.equal(T.transition('RUNNING', 'lose'), 'OVER')

  assert.equal(T.transition('PAUSED', 'start'), 'PAUSED')
  assert.equal(T.transition('PAUSED', 'pause'), 'PAUSED')
  assert.equal(T.transition('PAUSED', 'resume'), 'RUNNING')
  assert.equal(T.transition('PAUSED', 'restart'), 'RUNNING')
  assert.equal(T.transition('PAUSED', 'lose'), 'PAUSED')

  assert.equal(T.transition('OVER', 'start'), 'OVER')
  assert.equal(T.transition('OVER', 'pause'), 'OVER')
  assert.equal(T.transition('OVER', 'resume'), 'OVER')
  assert.equal(T.transition('OVER', 'restart'), 'RUNNING')
  assert.equal(T.transition('OVER', 'lose'), 'OVER')

  // 未知事件 → 原 phase（幂等）
  assert.equal(T.transition('RUNNING', 'bogus'), 'RUNNING')
})

/* ---------- 7. 会话集成（T6 契约，AC 关键路径） ---------- */

function freshGame(extra) {
  const events = { levelUp: [], gameOver: [], sfx: [], snapshots: [] }
  const g = T.createGame(
    Object.assign(
      {
        rng: () => 0, // 确定性：恒为 I
        autoLoop: false, // 手动 tick，避免测试依赖 rAF
        keyboard: false, // 不绑 DOM
        autoPauseOnBlur: false,
        onSnapshot: (s) => events.snapshots.push(s),
        onLevelUp: (l) => events.levelUp.push(l),
        onGameOver: (s) => events.gameOver.push(s),
        onSfx: (n) => events.sfx.push(n),
      },
      extra || {}
    )
  )
  return { g, events }
}

test('生命周期: READY → start → RUNNING → pause → resume → restart', () => {
  const { g, events } = freshGame()
  assert.equal(g.getPhase(), 'READY')
  let s = g.getSnapshot()
  assert.equal(s.score, 0)
  assert.equal(s.level, 1)
  assert.equal(s.lines, 0)
  assert.equal(s.piece, null)
  assert.ok(T.TYPES.includes(s.next))
  assert.equal(s.board.length, 20)

  const r = g.start()
  assert.deepEqual(r, { ok: true })
  assert.equal(g.getPhase(), 'RUNNING')
  s = g.getSnapshot()
  assert.ok(s.piece, '首块已出生')
  assert.equal(s.piece.y, 0)

  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')

  assert.equal(g.restart().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  s = g.getSnapshot()
  assert.equal(s.score, 0)
  assert.equal(s.level, 1)
  assert.equal(s.lines, 0)
  assert.ok(s.piece)
  assert.equal(events.snapshots.length >= 4, true, '初始+start+pause+resume 均有快照')
})

test('start 与 spawn 消费预览队列（确定性 RNG 序列）', () => {
  const seq = [0.05, 0.3, 0.75, 0.8] // 索引 0/2/5/5 → I/T/J/J
  let i = 0
  const g = T.createGame({ rng: () => seq[i++ % seq.length], autoLoop: false, keyboard: false, autoPauseOnBlur: false })
  const readys = g.getSnapshot()
  assert.equal(readys.next, 'I')
  g.start()
  const s = g.getSnapshot()
  assert.equal(s.piece.type, 'I', '首块 = READY 时预览')
  assert.equal(s.next, 'T', '预览已补新')
})

test('move: 左墙阻挡保持原位（AC-02.4）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 0 })
  const before = g.getSnapshot()
  const r = g.move(-1)
  assert.deepEqual(r, { ok: false, reason: 'blocked' })
  assert.equal(g.getSnapshot().piece.x, 0, '位置不变')
  const after = g.getSnapshot()
  assert.equal(snapshotDeep(before, after), true, '快照不变')
  assert.equal(g.move(1).ok, true, '右移成功')
  assert.equal(g.getSnapshot().piece.x, 1)
})

test('rotate: 旋转越界拒绝且原位（E1，AC-02.4）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'blocked' })
  const s = g.getSnapshot()
  assert.equal(s.piece.rot, 0, '旋转被拒，rot 不变')
  assert.equal(snapshotDeep(before, s), true, '快照不变')
  // 正常位置旋转成功
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.equal(g.rotate().ok, true)
  assert.equal(g.getSnapshot().piece.rot, 1)
})

test('softDrop: 下落 1 格；触底立即锁定（AC-02.2、AC-03.5）', () => {
  const { g } = freshGame()
  g.start()
  const y0 = g.getSnapshot().piece.y
  assert.equal(g.softDrop().ok, true)
  assert.equal(g.getSnapshot().piece.y, y0 + 1)

  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  const r = g.softDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true, '软降触底立即固定')
  assert.equal(r.cleared, 0)
  const s = g.getSnapshot()
  assert.ok(s.piece, '下一块已出生')
  assert.equal(s.board[18][4], 'T', 'T 已固定')
})

test('hardDrop: 立即落底 + 每格 +1 分（E5，PRD §5）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  const r = g.hardDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true)
  assert.equal(r.gameOver, false)
  const s = g.getSnapshot()
  assert.equal(s.score, 18, 'T 落底 18 格 × 1 分')
  assert.equal(s.board[19][3], 'T')
  assert.equal(s.board[19][4], 'T')
  assert.ok(s.piece, '下一块已出生')
})

test('消 4 行一次计分 800×L（AC-06.5、E3）', () => {
  const { g } = freshGame()
  g.start()
  // rows 16-19 各缺 col5，用竖 I（rot1 列 2 → 绝对 col 3+2=5）一次补齐 → 4 行
  const b = T.createBoard()
  for (let r = 16; r < 20; r++) b[r] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.deepEqual(
    { ok: r.ok, locked: r.locked, cleared: r.cleared, levelUp: r.levelUp, gameOver: r.gameOver },
    { ok: true, locked: true, cleared: 4, levelUp: false, gameOver: false }
  )
  const s = g.getSnapshot()
  assert.equal(s.score, 800, '800 × L1')
  assert.equal(s.lines, 4)
  assert.equal(s.level, 1)
  for (let r = 16; r < 20; r++) assert.ok(s.board[r].every((c) => c === null), '四行已清空')
})

test('升级: 累计 10 行 → 等级 2，onLevelUp 触发（AC-06.2/4）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setLines(9)
  assert.equal(g.getSnapshot().level, 1)
  // 仅 row19 缺 col5，竖 I 补齐 → 消 1 行 → lines 10 → level 2
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.cleared, 1)
  assert.equal(r.levelUp, true)
  const s = g.getSnapshot()
  assert.equal(s.lines, 10)
  assert.equal(s.level, 2)
  assert.equal(s.score, 100, '消 1 行 100 × L1')
  assert.deepEqual(events.levelUp, [2])
})

test('出生碰撞 → OVER + onGameOver（E4，AC-05.1/2）', () => {
  const { g, events } = freshGame()
  g.start()
  const b = T.createBoard()
  // I rot0 填充行在 4×4 盒内索引 1 → 出生绝对行 1，列 3-6；在 (1,4)(1,5) 放阻挡
  b[1][4] = 'J'
  b[1][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'O', rot: 0, x: 4, y: 18 })
  const r = g.hardDrop()
  assert.equal(r.ok, true)
  assert.equal(r.gameOver, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(g.getSnapshot().piece, null)
  assert.equal(events.gameOver.length, 1)
  // 结束态方向键无效（AC-05.2）
  assert.deepEqual(g.move(1), { ok: false, reason: 'illegal-phase' })
  assert.deepEqual(g.rotate(), { ok: false, reason: 'illegal-phase' })
  // 重开
  assert.equal(g.restart().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
})

test('restart: 任意态可重开，连续 5 轮无残留（AC-05.3/4）', () => {
  for (let round = 0; round < 5; round++) {
    const { g } = freshGame()
    g.start()
    g.hardDrop()
    g.hardDrop()
    const r = g.restart()
    assert.equal(r.ok, true)
    const s = g.getSnapshot()
    assert.equal(s.score, 0)
    assert.equal(s.level, 1)
    assert.equal(s.lines, 0)
    assert.ok(s.piece, '可立即游玩')
    for (const row of s.board) assert.ok(row.every((c) => c === null), '棋盘清空')
    // 从 PAUSED / OVER 重开
    g.togglePause()
    assert.equal(g.restart().ok, true)
    assert.equal(g.getPhase(), 'RUNNING')
  }
})

test('togglePause 往返快照一致（AC-04.3）', () => {
  const { g } = freshGame()
  g.start()
  g.hardDrop()
  const a = g.getSnapshot()
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  const b = g.getSnapshot()
  assert.equal(snapshotDeep(a, b), true, '分数/等级/行数/棋盘/方块/预览与暂停前一致')
})

test('tick: 重力间隔 1000ms（L1）驱动下落（AC-03.1）', () => {
  const { g } = freshGame()
  g.start()
  const y0 = g.getSnapshot().piece.y
  g.tick(250)
  g.tick(250)
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0, '750ms 未到间隔不下落')
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0 + 1, '满 1000ms 下落 1 格')
})

test('tick: 触底锁定缓冲 500ms（AC-03.5）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  g.tick(250) // 触底计时 250ms
  assert.equal(g.getSnapshot().piece.type, 'T', '缓冲期内未锁定')
  g.tick(250) // 500ms → 锁定
  const s = g.getSnapshot()
  assert.notEqual(s.piece.type, 'T', '已换新块')
  assert.equal(s.board[18][4], 'T', 'T 已固定')
})

test('tick 在非 RUNNING 下无副作用', () => {
  const { g } = freshGame()
  const before = g.getSnapshot()
  g.tick(10000)
  const after = g.getSnapshot()
  assert.equal(snapshotDeep(before, after), true)
  g.start()
  g.togglePause()
  const p = g.getSnapshot()
  g.tick(5000)
  assert.equal(snapshotDeep(p, g.getSnapshot()), true, '暂停不累积计时')
})

test('lose(): 强制结束', () => {
  const { g, events } = freshGame()
  g.start()
  assert.equal(g.lose().ok, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(events.gameOver.length, 1)
  assert.deepEqual(g.lose(), { ok: false, reason: 'illegal-phase' })
})

test('dispose: 清理后动作拒绝', () => {
  const { g } = freshGame()
  g.start()
  g.dispose()
  assert.deepEqual(g.start(), { ok: false, reason: 'illegal-phase' })
  assert.deepEqual(g.move(1), { ok: false, reason: 'illegal-phase' })
  assert.deepEqual(g.togglePause(), { ok: false, reason: 'illegal-phase' })
  g.dispose() // 幂等
})

test('PHASE_ALIAS: RUNNING≡PLAYING, OVER≡GAME_OVER（文档契约）', () => {
  assert.equal(T.PHASE_ALIAS.RUNNING, 'PLAYING')
  assert.equal(T.PHASE_ALIAS.OVER, 'GAME_OVER')
})

/* ---------- 8. 音效事件出口 onSfx（v2.0，AC-09；TECHNICAL §3.2/§7.1） ---------- */

test('onSfx: move 成功 → 恰好 1 次；被拒 → 0 次（AC-09.2/3）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 0 })
  assert.deepEqual(g.move(-1), { ok: false, reason: 'blocked' })
  assert.deepEqual(events.sfx, [], '左墙阻挡不发声')
  assert.deepEqual(g.move(1), { ok: true })
  assert.deepEqual(events.sfx, ['move'])
  assert.deepEqual(g.move(1), { ok: true })
  assert.deepEqual(events.sfx, ['move', 'move'], '每次成功移动各 1 次')
})

test('onSfx: rotate 成功 → 恰好 1 次；越界被拒 → 0 次（AC-09.3）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 }) // 旋转后底部越界 → 拒绝
  assert.deepEqual(g.rotate(), { ok: false, reason: 'blocked' })
  assert.deepEqual(events.sfx, [])
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.deepEqual(g.rotate(), { ok: true })
  assert.deepEqual(events.sfx, ['rotate'])
})

test('onSfx: softDrop 成功下移 → 1 次；触底立即锁 → 无 softDrop（E-SFX-02）', () => {
  const { g, events } = freshGame()
  g.start()
  const y0 = g.getSnapshot().piece.y
  assert.deepEqual(g.softDrop(), { ok: true })
  assert.equal(g.getSnapshot().piece.y, y0 + 1)
  assert.deepEqual(events.sfx, ['softDrop'])

  // 软降触底立即锁定（下移被拒）→ 不发射 softDrop；无消行 → 无其他音效
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  const r = g.softDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true)
  assert.deepEqual(events.sfx, ['softDrop'], '触底锁定路径不追加 softDrop')
})

test('onSfx: hardDrop 每次恰好 1 次（落点计算后、lockFlow 前）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.equal(g.hardDrop().ok, true)
  assert.deepEqual(events.sfx, ['hardDrop'])
  g.hardDrop() // 第二块（I）继续硬降
  assert.deepEqual(events.sfx, ['hardDrop', 'hardDrop'])
})

test('onSfx: 一次消 4 行 → clear 恰好 1 次（AC-09.2/E-SFX-03）', () => {
  const { g, events } = freshGame()
  g.start()
  const b = T.createBoard()
  for (let r = 16; r < 20; r++) b[r] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.cleared, 4)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], '一次消行恰好 1 次 clear')
})

test('onSfx: 升级 → levelUp 恰好 1 次，且与 onLevelUp 回调同栈（AC-09.4）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setLines(9)
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.levelUp, true)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'levelUp'])
  assert.deepEqual(events.levelUp, [2], 'onLevelUp 同栈触发')
})

test('onSfx: 出生碰撞自然结束 → gameOver 恰好 1 次（与 onGameOver 同栈）', () => {
  const { g, events } = freshGame()
  g.start()
  const b = T.createBoard()
  b[1][4] = 'J'
  b[1][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'O', rot: 0, x: 4, y: 18 })
  const r = g.hardDrop()
  assert.equal(r.gameOver, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.deepEqual(events.sfx, ['hardDrop', 'gameOver'])
  assert.equal(events.gameOver.length, 1)
})

test('onSfx: lose() 强制结束 → gameOver 恰好 1 次（E-SFX-06）', () => {
  const { g, events } = freshGame()
  g.start()
  assert.equal(g.lose().ok, true)
  assert.deepEqual(events.sfx, ['gameOver'])
  assert.equal(events.gameOver.length, 1)
  assert.deepEqual(g.lose(), { ok: false, reason: 'illegal-phase' }, 'OVER 态不再发声')
})

test('onSfx: 硬降同时消行+升级 → 顺序 hardDrop→clear→levelUp（E-SFX-04）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setLines(9)
  const b = T.createBoard()
  for (let r = 18; r < 20; r++) b[r] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.cleared, 2)
  assert.equal(r.levelUp, true)
  assert.equal(r.gameOver, false)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'levelUp'], '同栈顺序发射')
})

test('onSfx: start/restart/tick 不发射音效（PRD 未定义开始/重开音效）', () => {
  const { g, events } = freshGame()
  g.start()
  assert.deepEqual(events.sfx, [])
  g.tick(250)
  assert.deepEqual(events.sfx, [], '重力步不发声（非玩家事件）')
  g.restart()
  assert.deepEqual(events.sfx, [])
})

/* ---------- 9. 键盘映射 keyAction + 恢复节拍（v2.1，AC-11；TECHNICAL §2.1/§7.1） ---------- */

test('keyAction: 映射矩阵逐格断言（AC-11 + D-01 甲，TECHNICAL §2.1）', () => {
  // READY：空格/Enter=start，r=restart；P 无副作用（AC-11.6）
  assert.equal(T.keyAction('READY', ' '), 'start')
  assert.equal(T.keyAction('READY', 'Enter'), 'start')
  assert.equal(T.keyAction('READY', 'r'), 'restart')
  assert.equal(T.keyAction('READY', 'R'), 'restart')
  assert.equal(T.keyAction('READY', 'p'), null, 'READY 按 P 无副作用（AC-11.6）')
  assert.equal(T.keyAction('READY', 'P'), null)
  assert.equal(T.keyAction('READY', 'Escape'), null)
  assert.equal(T.keyAction('READY', 'ArrowLeft'), null)
  // RUNNING：空格=hardDrop 不变（AC-11.2 后半句）；方向键/DAS 键位保留
  assert.equal(T.keyAction('RUNNING', ' '), 'hardDrop', 'PLAYING 空格仍为硬降')
  assert.equal(T.keyAction('RUNNING', 'p'), 'togglePause')
  assert.equal(T.keyAction('RUNNING', 'P'), 'togglePause')
  assert.equal(T.keyAction('RUNNING', 'Escape'), 'togglePause')
  assert.equal(T.keyAction('RUNNING', 'r'), 'restart')
  assert.equal(T.keyAction('RUNNING', 'R'), 'restart')
  assert.equal(T.keyAction('RUNNING', 'ArrowLeft'), 'moveLeft')
  assert.equal(T.keyAction('RUNNING', 'ArrowRight'), 'moveRight')
  assert.equal(T.keyAction('RUNNING', 'ArrowDown'), 'softDrop')
  assert.equal(T.keyAction('RUNNING', 'ArrowUp'), 'rotate')
  assert.equal(T.keyAction('RUNNING', 'x'), 'rotate')
  assert.equal(T.keyAction('RUNNING', 'X'), 'rotate')
  assert.equal(T.keyAction('RUNNING', 'Enter'), null)
  // PAUSED：v2.1 空格=继续（AC-11.2 前半句）；方向键无效（AC-04.2）
  assert.equal(T.keyAction('PAUSED', ' '), 'togglePause', 'PAUSED 空格=继续（AC-11.2 前半句）')
  assert.equal(T.keyAction('PAUSED', 'p'), 'togglePause')
  assert.equal(T.keyAction('PAUSED', 'P'), 'togglePause')
  assert.equal(T.keyAction('PAUSED', 'Escape'), 'togglePause')
  assert.equal(T.keyAction('PAUSED', 'r'), 'restart')
  assert.equal(T.keyAction('PAUSED', 'R'), 'restart')
  assert.equal(T.keyAction('PAUSED', 'ArrowLeft'), null, '暂停期方向键无效（AC-04.2）')
  assert.equal(T.keyAction('PAUSED', 'ArrowUp'), null)
  assert.equal(T.keyAction('PAUSED', 'ArrowDown'), null)
  assert.equal(T.keyAction('PAUSED', 'Enter'), null)
  // OVER：空格=restart（D-01 甲）；P 无副作用（AC-11.6）
  assert.equal(T.keyAction('OVER', ' '), 'restart', 'GAME_OVER 空格=重开（D-01 甲）')
  assert.equal(T.keyAction('OVER', 'r'), 'restart')
  assert.equal(T.keyAction('OVER', 'R'), 'restart')
  assert.equal(T.keyAction('OVER', 'Enter'), 'restart')
  assert.equal(T.keyAction('OVER', 'p'), null, 'OVER 按 P 无副作用（AC-11.6）')
  assert.equal(T.keyAction('OVER', 'P'), null)
  assert.equal(T.keyAction('OVER', 'Escape'), null)
  assert.equal(T.keyAction('OVER', 'ArrowDown'), null)
  // 防御（E-11-09）：未知 phase / 非字符串 key → null
  assert.equal(T.keyAction('BOGUS', ' '), null)
  assert.equal(T.keyAction(null, ' '), null)
  assert.equal(T.keyAction('READY', null), null)
  assert.equal(T.keyAction('READY', undefined), null)
  assert.equal(T.keyAction('READY', 123), null)
})

test('恢复节拍差值续算：暂停不清计时，恢复后按暂停前剩余间隔续算（AC-11.4，E-11-08）', () => {
  const { g } = freshGame()
  g.start()
  g.tick(250)
  g.tick(250)
  g.tick(200) // gravityAcc = 700（L1 间隔 1000）
  const yPause = g.getSnapshot().piece.y
  assert.equal(g.togglePause().ok, true)
  g.tick(5000) // 暂停期 tick 无副作用（E-11-08）
  assert.equal(g.getSnapshot().piece.y, yPause, '暂停期不累积计时')
  assert.equal(g.togglePause().ok, true)
  g.tick(250) // 700 + 250 = 950 < 1000 → 不下落
  assert.equal(g.getSnapshot().piece.y, yPause, '恢复后 250ms 未到剩余间隔不下落')
  g.tick(50) // 950 + 50 = 1000 → 恰好下落 1 格（偏差 0）
  assert.equal(g.getSnapshot().piece.y, yPause + 1, '恢复后满 1000ms 恰好下落 1 格')
})

test('togglePause 不发射音效（AC-11.3 引擎层：暂停/继续无音效、恢复瞬间无硬降音效）', () => {
  const { g, events } = freshGame()
  g.start()
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.togglePause().ok, true)
  assert.deepEqual(events.sfx, [], '暂停/继续往返后音效事件序列仍为空')
  g.restart()
  assert.deepEqual(events.sfx, [], 'restart 亦不发声（既有语义保持，TECHNICAL §3.2）')
})

/* ---------- 10. 幽灵块 ghostY 落点计算（v2.2，AC-12；TECHNICAL §2.1/§7.1） ---------- */

test('ghostY: 纯函数导出 + 空板落板底（AC-12.1）', () => {
  assert.equal(typeof T.ghostY, 'function', 'ghostY 导出存在（window.TetrisGame.ghostY / module.exports.ghostY）')
  const board = T.createBoard()
  for (const t of T.TYPES) {
    for (let rot = 0; rot < 4; rot++) {
      const shape = T.SHAPES[t][rot]
      const bottom = bottomRowOf(shape)
      const expect = 19 - bottom // 空板：最低实心格落至 row 19
      const piece = { type: t, rot: rot, x: 3, y: 0 }
      const gy = T.ghostY(board, piece)
      assert.equal(typeof gy, 'number', t + '/' + rot + ' 应返回 number')
      assert.ok(gy >= piece.y, t + '/' + rot + ' 落点 ≥ piece.y（不向上）')
      // 落点处不碰撞、下一格必碰撞（= hardDrop 落点语义一致）
      assert.equal(T.collides(board, { type: t, rot: rot, x: 3, y: gy }), false, t + '/' + rot + ' 落点处不碰撞')
      assert.equal(T.collides(board, { type: t, rot: rot, x: 3, y: gy + 1 }), true, t + '/' + rot + ' 落点下一格必碰撞')
      assert.equal(gy, expect, t + ' rot' + rot + ' 空板落板底 = 19 - 最低实心行偏移')
    }
  }
})

test('ghostY: 与 hardDrop 落点偏差 0（AC-12.1 核心，E-12-01）', () => {
  // 对 7 型 × 多 x/rot（仅取 spawn 即合法的组合）：ghostY == hardDrop 实际固定 y（偏差 0）
  const xxs = [0, 2, 6, 9]
  for (const t of T.TYPES) {
    for (let rot = 0; rot < 4; rot++) {
      for (const x of xxs) {
        // spawn 合法（形状全部在 10×20 板内且不与固定块重叠）才参与偏差 0 断言
        const proto = { type: t, rot: rot, x: x, y: 0 }
        if (T.collides(T.createBoard(), proto)) continue
        const { g } = freshGame()
        g.start()
        g._debug.setPiece(proto)
        const s = g.getSnapshot()
        const g0 = T.ghostY(s.board, s.piece)
        assert.equal(g.hardDrop().ok, true)
        // hardDrop 已锁定并出生新块：以落点格是否被原块填充验证偏差 0
        const s2 = g.getSnapshot()
        const cells = T.pieceCells({ type: t, rot: rot, x: x, y: g0 })
        for (const c of cells) {
          assert.equal(s2.board[c.y] && s2.board[c.y][c.x], t, t + '/rot' + rot + ' x' + x + ' 落点格被原块以 y=' + g0 + ' 固定（偏差 0）')
        }
      }
    }
  }
})

test('ghostY: 遮挡/边界/旋转（AC-12.3/12.5，E-12-02/03/04）', () => {
  // 掩体：横条掩体（row 15，仅 col 0 空）阻塞 → 落点在掩体上一格
  const bObs = boardWithObstacle('X', 15, 0)
  for (const t of T.TYPES) {
    const bottom = bottomRowOf(T.SHAPES[t][0])
    const piece = { type: t, rot: 0, x: 4, y: 0 }
    const gy = T.ghostY(bObs, piece)
    // 掩体占 row 15 全部（仅 col0 空，x=4 下方必有掩体）→ 落点恰为 15 - bottom - 1
    assert.equal(gy, 15 - bottom - 1, t + ' 落点在掩体上一格（掩体 row15，col0 空、x=4 下方全覆盖）')
  }

  // 边界：贴边（左墙 x 最左合法位 / 右墙 x 最右合法位）不越界（AC-12.5，E-12-03）
  const b = T.createBoard()
  for (const t of T.TYPES) {
    for (let rot = 0; rot < 4; rot++) {
      // 求该形状该旋转的最左/最右合法 x（spawn 即不越界、不压块）
      let minX = -1
      let maxX = -1
      for (let x = 0; x < 10; x++) {
        if (!T.collides(b, { type: t, rot: rot, x: x, y: 0 })) {
          if (minX === -1) minX = x
          maxX = x
        }
      }
      for (const x of [minX, maxX]) {
        const gy = T.ghostY(b, { type: t, rot: rot, x: x, y: 0 })
        const cells = T.pieceCells({ type: t, rot: rot, x: x, y: gy })
        for (const c of cells) {
          assert.ok(c.x >= 0 && c.x < 10 && c.y < 20, t + ' rot' + rot + ' x' + x + ' 落点格不越界（贴边合法位）')
        }
      }
    }
  }

  // 旋转：I/S/Z 各旋转态落点按新轮廓变化且为合法底部（AC-12.3，E-12-04）
  for (const t of ['I', 'S', 'Z']) {
    const gys = new Set()
    for (let rot = 0; rot < 4; rot++) {
      const piece = { type: t, rot: rot, x: 3, y: 0 }
      const gy = T.ghostY(b, piece)
      gys.add(gy)
      assert.equal(T.collides(b, { type: t, rot: rot, x: 3, y: gy }), false)
      assert.equal(T.collides(b, { type: t, rot: rot, x: 3, y: gy + 1 }), true)
    }
    assert.ok(gys.size >= 2, t + ' 旋转后落点随轮廓变化（至少两种不同落点 y）')
  }
})

test('ghostY: 移动/软降同步（落点差不变）与无副作用（AC-12.2/12.4/12.6/12.7）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  const s0 = g.getSnapshot()
  const g0 = T.ghostY(s0.board, s0.piece)
  const drop0 = g0 - s0.piece.y // 初始剩余下落格数

  // 右移后：x 变、落点重算；softDrop 一格后落点同步上移，落点差不变
  assert.equal(g.move(1).ok, true)
  const s1 = g.getSnapshot()
  const g1 = T.ghostY(s1.board, s1.piece)
  assert.equal(s1.piece.y, s0.piece.y, '移动后 y 不变')
  assert.equal(g1 - s1.piece.y, drop0, '右移后落点差不变（AC-12.2）')

  assert.equal(g.softDrop().ok, true)
  const s2 = g.getSnapshot()
  const g2 = T.ghostY(s2.board, s2.piece)
  assert.equal(s2.piece.y, s1.piece.y + 1, '软降一格')
  // 软降/自动下落同步：board/x/rot 不变 → 绝对落点不变（幽灵随块下移），剩余距离 -1（AC-12.4）
  assert.equal(g2, g1, '软降后绝对落点不变（幽灵随块同步下移）')
  assert.equal(g2 - s2.piece.y, (g1 - s1.piece.y) - 1, '软降后剩余下落距离恰减 1')

  // 无副作用：调用 ghostY 前后快照/棋盘/音效均不变（AC-12.6/12.7）
  const snapBefore = g.getSnapshot()
  events.sfx.length = 0
  const gy = T.ghostY(snapBefore.board, snapBefore.piece)
  assert.equal(typeof gy, 'number')
  const snapAfter = g.getSnapshot()
  assert.equal(snapshotDeep(snapBefore, snapAfter), true, 'ghostY 调用不改快照（纯函数、零状态/音效副作用）')
  assert.deepEqual(events.sfx, [], 'ghostY 不触发任何 onSfx 事件')
})

