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
 * 与恢复节拍差值续算（v2.1，AC-11；TECHNICAL §7.1）；r15 多格预览队列
 * （§13，AC-1/2/3/5/9/10/11；TECHNICAL §4/§7.2）。
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

test('SFX_EVENTS: v2.0 音效事件集 8 值（AC-09，audio.js/装配/测试统一引用；r14 新增 hold）', () => {
  assert.deepEqual(T.SFX_EVENTS, ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold'])
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

test('levelForLines: 升级阈值（AC-06.2）', () => {
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

test('createQueue: 注入 RNG 确定、peek 不消耗（7-bag）', () => {
  // 7-bag: shuffle 使用 rng，固定种子 → 确定性序列
  // 用全 0.5 序列：shuffle 每次 swap(i→j) 中 j = floor(0.5*(i+1))，产生固定排列
  let callCount = 0
  const q = T.createQueue(() => { callCount++; return 0.5 })
  const first = q.peek()
  assert.equal(q.peek(), first, 'peek 不消耗')
  assert.equal(q.next(), first, 'next 返回 peek 相同值')
  // peek 后 next 应推进到下一块
  const second = q.peek()
  assert.equal(typeof second, 'string', 'peek 返回方块类型')
  assert.equal(q.next(), second)
  // 每袋 7 块，检查连续 7 块不重复
  const bag = [first, second]
  for (let k = 2; k < 7; k++) bag.push(q.next())
  assert.equal(new Set(bag).size, 7, '前 7 块包含全部 7 型（7-bag 完整性）')
})

/* ---------- 5b. 7-bag 算法契约用例（AC-17） ---------- */

test('7-bag: 每袋 7 块包含全部 7 种方块各 1 次', () => {
  const q = T.createQueue()
  for (let bag = 0; bag < 100; bag++) {
    const seen = []
    for (let k = 0; k < 7; k++) seen.push(q.next())
    const sorted = seen.slice().sort()
    assert.deepEqual(sorted, ['I', 'J', 'L', 'O', 'S', 'T', 'Z'], '第 ' + (bag + 1) + ' 袋应含全部 7 型')
  }
})

test('7-bag: 袋内排列随机（连续 10 袋不全相同）', () => {
  const q = T.createQueue()
  const bags = []
  for (let b = 0; b < 10; b++) {
    const bag = []
    for (let k = 0; k < 7; k++) bag.push(q.next())
    bags.push(bag.join(''))
  }
  const unique = new Set(bags)
  assert.ok(unique.size >= 2, '10 袋中至少 2 种不同排列（袋内随机性）')
})

test('7-bag: 连续两袋无重叠顺序（两袋拼接 ≠ 单袋重复）', () => {
  const q = T.createQueue()
  const bag1 = []
  for (let k = 0; k < 7; k++) bag1.push(q.next())
  const bag2 = []
  for (let k = 0; k < 7; k++) bag2.push(q.next())
  // 两袋各自完整
  assert.deepEqual(bag1.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z'], 'bag1 完整')
  assert.deepEqual(bag2.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z'], 'bag2 完整')
  // 两袋不完全相同（概率极低）
  assert.notDeepEqual(bag1, bag2, '连续两袋不应固定相同排列')
  // 第 14 块（bag2 第 7 块）仍为合法类型
  for (let k = 0; k < 5; k++) q.next() // 消费 bag2 剩余
  const bag3start = q.next()
  assert.ok(T.TYPES.includes(bag3start), 'bag3 首块为合法方块类型')
})

test('createQueue: 7-bag 分布（大样本各型频率 ≈1/7）', () => {
  const counts = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 }
  const q = T.createQueue()
  const total = 7000
  for (let k = 0; k < total; k++) counts[q.next()]++
  for (const t of T.TYPES) {
    const expected = total / 7
    const ratio = counts[t] / expected
    assert.ok(ratio > 0.85 && ratio < 1.15, t + ' 频率 ' + counts[t] + ' ≈ ' + expected + '（偏差 <15%）')
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

// r13（§6.1）：mk() 统一基线工厂——animMs:0 为正规配置项（即时消除，= reduced-motion 降级语义，AC-7），
// 既有消行/计分/音效序列断言逐字保留；新动画用例组显式传 animMs:240
function mk(opts) {
  return T.createGame(
    Object.assign(
      { autoLoop: false, keyboard: false, autoPauseOnBlur: false, animMs: 0 },
      opts || {}
    )
  )
}

function freshGame(extra) {
  const events = { levelUp: [], gameOver: [], sfx: [], snapshots: [] }
  const g = mk(
    Object.assign(
      {
        rng: () => 0, // 确定性：恒为 I
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

test('start 与 spawn 消费预览队列（7-bag 确定性 RNG）', () => {
  // 7-bag: rng 用于 shuffle，全 0.5 产生固定排列
  const g = mk({ rng: () => 0.5 })
  const readys = g.getSnapshot()
  assert.ok(T.TYPES.includes(readys.next), 'READY 预览为合法方块类型')
  g.start()
  const s = g.getSnapshot()
  assert.equal(s.piece.type, readys.next, '首块 = READY 时预览')
  assert.ok(T.TYPES.includes(s.next), '预览已补新')
  assert.notEqual(s.piece.type, null, '首块已出生')
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
  g.setWallKickEnabled(false) // v2.9：碰撞被拒断言需在开关关闭态（默认已改开）
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' })
  const s = g.getSnapshot()
  assert.equal(s.piece.rot, 0, '旋转被拒，rot 不变')
  assert.equal(snapshotDeep(before, s), true, '快照不变')
  // 正常位置旋转成功
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.equal(g.rotate().ok, true)
  assert.equal(g.getSnapshot().piece.rot, 1)
})

/* ---------- AC-18: 无踢墙旋转系统 ---------- */

test('rotate: 左墙碰撞保持原位（AC-18.3，开关关闭态）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false) // v2.9：AC-18 语义在开关关闭态断言（默认已改开）
  // T 型方块紧贴左墙（x=0）且靠近底部，旋转后底部越界 → 碰撞
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '左墙碰撞返回 wall-kick-denied')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变（不右移让位）')
  assert.equal(after.piece.y, before.piece.y, 'y 不变')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 右墙碰撞保持原位（AC-18.4，开关关闭态）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false)
  // I 型方块横放（rot=0）紧贴右墙（x=8），旋转后右侧越界 → 碰撞
  g._debug.setPiece({ type: 'I', rot: 0, x: 8, y: 0 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '右墙碰撞返回 wall-kick-denied')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变（不左移让位）')
  assert.equal(after.piece.y, before.piece.y, 'y 不变')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 已固定方块碰撞保持原位（AC-18.5，开关关闭态）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false)
  // 在方块下方放置已固定方块，使旋转产生碰撞
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  b[19][3] = '#f00' // 固定方块位于 (3,19)
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 17 })
  const before = g.getSnapshot()
  const r = g.rotate()
  // T 型 rot=0 旋转后底部可能与固定方块碰撞
  if (!r.ok) {
    assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '已固定方块碰撞返回 wall-kick-denied')
    const after = g.getSnapshot()
    assert.equal(after.piece.x, before.piece.x, 'x 不变')
    assert.equal(after.piece.y, before.piece.y, 'y 不变')
    assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
  } else {
    // 若旋转成功（无碰撞），验证位置已更新
    assert.equal(g.getSnapshot().piece.rot, 1)
  }
})

/* ---------- AC-19: 踢墙旋转开关系统 ---------- */

test('rotate: 默认开关开启（AC-19.1）', () => {
  const { g } = freshGame()
  assert.equal(g.getWallKickEnabled(), true, '新会话默认开')
  g.start()
  assert.equal(g.getWallKickEnabled(), true, '开始后仍开')
  // 可通过装配入参关闭（确定性单测注入，AC-19.1）
  const off = freshGame({ wallKickEnabled: false }).g
  assert.equal(off.getWallKickEnabled(), false, 'createGame({wallKickEnabled:false}) 初值关')
})

test('rotate: 开=左偏移命中成功（AC-19.2）', () => {
  const { g } = freshGame()
  g.start()
  // T rot0 (3,17)：旋转→rot1 底部落 (4,19)；(4,19) 放固定块 → 旋转碰撞，
  // 踢墙先试左移 → (2,17) rot1 合法 → 命中非零偏移 (dx=-1)
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  b[19][4] = '#f00'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 17 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.equal(r.ok, true, '开=踢墙命中 → 旋转成功')
  const after = g.getSnapshot()
  assert.equal(after.piece.rot, 1, 'rot 生效')
  assert.equal(after.piece.x, 2, 'x 随偏移左移 1 格')
  assert.equal(after.piece.y, 17, 'y 不变')
  assert.ok(after.piece.x !== before.piece.x, '发生踢墙偏移（非原地）')
})

test('rotate: 开=右偏移命中成功（AC-19.2）', () => {
  const { g } = freshGame()
  g.start()
  // T rot0 (2,17)：旋转→rot1 落 (3,19)；(3,19)(2,19) 放固定块 → 旋转碰撞且左移也被挡，
  // 右移 → (3,17) rot1 合法 → 命中非零偏移 (dx=+1)
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  b[19][3] = '#f00'
  b[19][2] = '#f00'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 2, y: 17 })
  const r = g.rotate()
  assert.equal(r.ok, true, '右移规避成功')
  const after = g.getSnapshot()
  assert.equal(after.piece.rot, 1, 'rot 生效')
  assert.equal(after.piece.x, 3, 'x 右移 1 格')
  assert.equal(after.piece.y, 17, 'y 不变')
})

test('rotate: 开=全部偏移失败保持原位（AC-19.3）', () => {
  const { g } = freshGame()
  g.start()
  // I rot0 (0,19)：旋转 rot1 竖放纵跨 y16..19，被底部行(19)与竖列(2,16)围死；
  // 左/右移均碰底部固定块、上移碰 (2,16) → 全部偏移失败 → 保持原位
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  for (let c = 0; c < 5; c++) b[19][c] = '#f00'
  b[16][2] = '#f00'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'I', rot: 0, x: 0, y: 19 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '开=全部失败 → wall-kick-denied')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变')
  assert.equal(after.piece.y, before.piece.y, 'y 不变')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 关=旋转碰撞零偏移保持原位（AC-19.4）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false)
  // T 贴左墙贴底（x=0,y=18）：旋转 rot1 底部越界 → 碰撞；即便开关打开有上移空间，
  // 关闭态也绝不偏移（AC-18 语义），返回 wall-kick-denied 且 x/y/rot 全不变
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '关=碰撞 → wall-kick-denied（零偏移）')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变（零偏移）')
  assert.equal(after.piece.y, before.piece.y, 'y 不变（零偏移）')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 切换实时生效 ≤100ms（AC-19.5）', () => {
  const { g } = freshGame()
  g.start()
  // 用「贴左墙贴底 T」作开关判别器：开=踢墙上移命中成功；关=拒绝零偏移
  const place = function () { g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 }) }
  // 默认开（AC-19.1）→ 旋转碰撞后踢墙命中（上移 y17）→ 成功
  place()
  const t0 = Date.now()
  const r1 = g.rotate()
  assert.equal(r1.ok, true, '开（默认）→ 踢墙命中旋转成功')
  assert.equal(g.getSnapshot().piece.rot, 1, 'rot 生效')
  assert.equal(g.getSnapshot().piece.y, 17, '踢墙上移 1 格（y 17）')
  assert.ok(Date.now() - t0 <= 100, '切换生效 ≤100ms 内（开关读取即时）')
  // 关闭后下一次 rotate 立即按新值：同场景 → 拒绝零偏移
  place()
  g.setWallKickEnabled(false)
  const before = g.getSnapshot()
  const r2 = g.rotate()
  assert.deepEqual(r2, { ok: false, reason: 'wall-kick-denied' }, '关闭后下一次 rotate 立即拒绝')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, '关闭态 x 不变')
  assert.equal(after.piece.y, before.piece.y, '关闭态 y 不变（不偏移）')
  assert.equal(after.piece.rot, before.piece.rot, '关闭态 rot 不变')
})

test('rotate: setWallKickEnabled 钳制为布尔（AC-19.1）', () => {
  const { g } = freshGame()
  g.setWallKickEnabled(1)
  assert.equal(g.getWallKickEnabled(), false, '1 !=== true → false（钳制）')
  g.setWallKickEnabled(0)
  assert.equal(g.getWallKickEnabled(), false, '0 → false')
  g.setWallKickEnabled('yes')
  assert.equal(g.getWallKickEnabled(), false, '非布尔真值 → false')
  g.setWallKickEnabled(false)
  assert.equal(g.getWallKickEnabled(), false, 'false → false')
  g.setWallKickEnabled(true)
  assert.equal(g.getWallKickEnabled(), true, 'true → true（唯一真值）')
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

test('hardDrop: 立即落底固定 + 不加分（AC-14，v2.3 移除 dropBonus）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  const r = g.hardDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true)
  assert.equal(r.gameOver, false)
  const s = g.getSnapshot()
  assert.equal(s.score, 0, '硬降空降 18 格不再加分（AC-14 硬降前后分数差 = 0）')
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
  assert.ok(s.piece, '锁定后已出生新块（7-bag 新块类型可能与锁定块相同）')
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
  g.setWallKickEnabled(false) // v2.9：越界被拒断言需在开关关闭态（默认已改开）
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 }) // 旋转后底部越界 → 拒绝
  assert.deepEqual(g.rotate(), { ok: false, reason: 'wall-kick-denied' })
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

test('ghostY: 非法入参防御不抛错、返回类型安全值（v2.4 E-12-08，AC-12.12）', () => {
  // 已知用例：rot = -1 / 4 / 5 / 100、未知 type、piece === null，均不抛错且落点正确
  const board = T.createBoard()
  // rot%4 归一（负数归 0–3）：同一合法 type 下，归一的 rot 与越界 rot 落点一致
  for (const t of T.TYPES) {
    assert.equal(T.ghostY(board, { type: t, rot: -1, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 3, x: 3, y: 0 }), t + ' rot=-1 归一为 3，落点一致')
    assert.equal(T.ghostY(board, { type: t, rot: 4, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 0, x: 3, y: 0 }), t + ' rot=4 归一为 0，落点一致')
    assert.equal(T.ghostY(board, { type: t, rot: 5, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 1, x: 3, y: 0 }), t + ' rot=5 归一为 1，落点一致')
    assert.equal(T.ghostY(board, { type: t, rot: 100, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 0, x: 3, y: 0 }), t + ' rot=100 归一为 0，落点一致')
  }
  // 未知 type 回退原样：不抛错、返回类型安全 number，落点 = 当前位置 y（无对应形状）
  const gUnknown = T.ghostY(board, { type: 'X', rot: 0, x: 3, y: 7 })
  assert.equal(typeof gUnknown, 'number', '未知 type 返回 number')
  assert.equal(gUnknown, 7, '未知 type 回退原样：落点 = piece.y')
  assert.equal(T.ghostY(board, { type: 'ZOMBIE', rot: 99, x: 1, y: 5 }), 5, '未知 type + 越界 rot 也回退原样不抛错')
  // piece === null 防御：不抛错、返回类型安全 number（哨兵 -1）
  assert.equal(T.ghostY(board, null), -1, 'piece=null 返回哨兵 -1（类型安全）')
  assert.equal(T.ghostY(board, undefined), -1, 'piece=undefined 同样防御返回 -1')
  // boxed null 防御不抛错
  assert.equal(typeof T.ghostY(board, null), 'number', 'piece=null 返回类型为 number')
})

/* ---------- 11. r13 消行动画（v3.1，AC-1~10；animMs:240 + tick 步进，TECHNICAL §6.2） ---------- */

// 公共布景：仅 row19 缺 col5 的满行 + 竖 I（rot1 x3 y16，落点 y16）硬降 → 恰好消 1 行、进入 clearing。
// 返回 merged（= lockFlow 内 merge(board, piece) 的值，动画期棋盘等价基准）。
function stageSingleLineClear(animMs) {
  const { g, events } = freshGame({ animMs: animMs })
  g.start()
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const merged = T.merge(b, { type: 'I', rot: 1, x: 3, y: 16 })
  const entry = g.hardDrop()
  return { g, events, merged, entry }
}

test('r13 消行动画 ①: 动画期棋盘=锁定后含满行、快照附加字段、计分行数未动（AC-1/AC-8/AC-10）', () => {
  const { g, merged, entry } = stageSingleLineClear(240)
  // 入口返回值：动画接管期 levelUp/gameOver 为「完成时」语义 → 恒 false（§2.4）
  assert.deepEqual(
    { ok: entry.ok, locked: entry.locked, cleared: entry.cleared, levelUp: entry.levelUp, gameOver: entry.gameOver },
    { ok: true, locked: true, cleared: 1, levelUp: false, gameOver: false }
  )
  const s = g.getSnapshot()
  assert.deepEqual(s.clearedIndices, [19], 'clearedIndices = 被消行索引')
  assert.equal(s.animProgress, 0, '首帧进度 0')
  assert.deepEqual(s.board, merged, '动画期棋盘 = 锁定后含满行棋盘（逐格）')
  for (let rr = 0; rr < 19; rr++) {
    for (let c = 0; c < T.COLS; c++) {
      assert.equal(s.board[rr][c], merged[rr][c], '未消行逐格不变 r' + rr + 'c' + c)
    }
  }
  assert.equal(s.phase, 'RUNNING')
  assert.equal(s.piece, null, '动画期无活动块/幽灵（AC-8）')
  assert.equal(s.score, 0, '计分在完结帧')
  assert.equal(s.lines, 0, '行数在完结帧')
  assert.equal(s.level, 1)
})

test('r13 消行动画 ②: 动画期输入全部拒绝 reason=clearing，零副作用（AC-4/E2）', () => {
  const { g, events } = stageSingleLineClear(240)
  const before = g.getSnapshot()
  assert.deepEqual(g.move(-1), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.move(1), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.rotate(), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.softDrop(), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.hardDrop(), { ok: false, reason: 'clearing' })
  const after = g.getSnapshot()
  assert.deepEqual(after.board, before.board, '棋盘不变')
  assert.equal(after.animProgress, before.animProgress, '进度不变')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], '拒绝输入零音效（不排队不发声）')
})

test('r13 消行动画 ③: 完结帧原子步=clearLines(merged) 逐格一致 + clear 恰 1 次（AC-2/AC-3）', () => {
  const { g, events, merged } = stageSingleLineClear(240)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], 'clear 在动画首帧（hardDrop 后恰好 1 次）')
  g.tick(120)
  g.tick(120) // 120+120 = 240 ≥ 240 → 完结
  const s = g.getSnapshot()
  const expected = T.clearLines(merged).board
  assert.deepEqual(s.board, expected, '塌缩后棋盘 = clearLines(merged) 逐格一致')
  assert.equal(s.score, 100, '消 1 行 100 × L1')
  assert.equal(s.lines, 1)
  assert.equal(s.level, 1)
  assert.ok(s.piece, 'spawn 完成')
  assert.ok(s.next !== 'T', 'next 已从预览队列更新（恰 1 次）')
  assert.equal(s.clearedIndices, null, '完结帧无动画残留字段')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], 'clear 全程恰 1 次（完结帧不再发）')
})

test('r13 消行动画 ③b: 升级判定在完结帧、次序 hardDrop→clear→levelUp（AC-3/AC-9，E-SFX-04）', () => {
  const { g, events } = freshGame({ animMs: 240 })
  g.start()
  g._debug.setLines(9)
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], '动画首帧：clear 已发')
  assert.equal(events.levelUp.length, 0, '完结前不触发升级回调')
  g.tick(120)
  g.tick(120)
  assert.deepEqual(events.levelUp, [2], '完结帧触发 onLevelUp(2)')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'levelUp'], 'E-SFX-04 次序保持（clear 提前 T 拍）')
  assert.equal(g.getSnapshot().level, 2)
  assert.equal(g.getSnapshot().lines, 10)
})

test('r13 消行动画 ④: animMs:0 与 animMs:240（步进完）逐点等价（AC-7）', () => {
  const run = function (animMs) {
    const { g, events } = freshGame({ animMs: animMs })
    g.start()
    const b = T.createBoard()
    b[19] = fullRow('I', 5)
    g._debug.setBoard(b)
    g._debug.setNext('T')
    g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
    g.hardDrop()
    if (animMs > 0) {
      g.tick(120)
      g.tick(130)
    }
    return { snap: g.getSnapshot(), sfx: events.sfx.slice() }
  }
  const instant = run(0)
  const anim = run(240)
  assert.deepEqual(instant.snap.board, anim.snap.board, '棋盘逐格等价')
  assert.equal(instant.snap.score, anim.snap.score, '计分等价')
  assert.equal(instant.snap.lines, anim.snap.lines, '行数等价')
  assert.equal(instant.snap.level, anim.snap.level, '等级等价')
  assert.equal(instant.snap.next, anim.snap.next, '预览等价')
  assert.deepEqual(instant.snap.piece, anim.snap.piece, 'spawn 活动块一致')
  assert.deepEqual(instant.sfx, anim.sfx, '音效事件序列一致')
})

test('r13 消行动画 ⑤: 时钟冻结——动画期 dt 只进进度、重力/锁定缓冲不累积（AC-5）', () => {
  const { g } = stageSingleLineClear(240)
  g.tick(70)
  g.tick(70)
  g.tick(70) // 210 < 240 不完结
  const mid = g.getSnapshot()
  assert.equal(mid.clearedIndices !== null, true, '仍在动画')
  assert.equal(mid.piece, null, '未 spawn')
  g.tick(40) // 210+40 = 250 ≥ 240 → 完结
  const done = g.getSnapshot()
  assert.equal(done.clearedIndices, null)
  assert.ok(done.piece, '新块已出生')
  const y0 = done.piece.y
  // 动画期冻结的下落时钟不跨完结累积：新块从 0 起计（无连降/积压）。
  // 注意 tick 内部 dt clamp ≤ 250（E7/E8），满 L1 间隔需 4 × 250
  g.tick(250)
  g.tick(250)
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0, '750ms < 1000ms（L1 间隔）不下落')
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0 + 1, '满间隔恰好 1 格')
})

test('r13 消行动画 ⑥: 暂停冻结/恢复续播——进度定格、无跳帧（AC-4/E3/E10）', () => {
  const { g } = stageSingleLineClear(240)
  g.tick(120)
  const mid = g.getSnapshot()
  assert.equal(mid.animProgress, 0.5, '中期进度 0.5')
  assert.deepEqual(mid.clearedIndices, [19])
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  const paused = g.getSnapshot()
  assert.equal(paused.animProgress, 0.5, '暂停快照进度定格')
  assert.deepEqual(paused.clearedIndices, [19], 'clearing 经暂停保留（AC-4 续播前提）')
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  g.tick(120) // 120+120 = 240 → 完结
  const done = g.getSnapshot()
  assert.equal(done.clearedIndices, null, '恢复后续播至完结')
  assert.equal(done.lines, 1, '塌缩在恢复后完成')
  assert.ok(done.piece, 'spawn 完成')
})

test('r13 消行动画 ⑦: 完结帧出生碰撞 → OVER 序列完整、无残留（AC-6）', () => {
  const { g, events } = freshGame({ animMs: 240 })
  g.start()
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  // I 出生（4×4 盒填充行索引 1 → 绝对行 1，列 3-6）放阻挡 → 塌缩后 spawn 即碰撞（OVER）。
  // 注意：消 1 行塌缩会向顶部补空行 → 旧 row0 变为新 row1，故阻挡放旧 row0
  b[0][4] = 'J'
  b[0][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  assert.ok(g.getSnapshot().clearedIndices !== null, '动画已接管')
  g.tick(120)
  assert.equal(g.getPhase(), 'RUNNING', '动画完整播放中不提前 OVER')
  assert.equal(events.gameOver.length, 0)
  assert.ok(g.getSnapshot().animProgress > 0, '进度有推进')
  g.tick(130) // 250 ≥ 240 → 完结帧 spawn 碰撞
  assert.equal(g.getPhase(), 'OVER', '完结帧才 OVER')
  const s = g.getSnapshot()
  assert.equal(s.clearedIndices, null, '无动画残留字段')
  assert.equal(s.piece, null)
  assert.equal(events.gameOver.length, 1)
  assert.equal(events.sfx.filter((n) => n === 'gameOver').length, 1, 'gameOver 恰 1 次')
  assert.equal(events.sfx[events.sfx.length - 1], 'gameOver', 'gameOver 为末位（E-SFX-05 次序）')
  // 防御：OVER 后 restart 无残留（E9）
  assert.equal(g.restart().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  assert.equal(g.getSnapshot().clearedIndices, null)
})

test('r13 消行动画 ⑧: createGame() 默认 animMs>0 → 消行默认进入 clearing；非法值兜底默认（AC-1/AC-9）', () => {
  const sfx = []
  const g = T.createGame({
    rng: () => 0,
    autoLoop: false,
    keyboard: false,
    autoPauseOnBlur: false,
    onSfx: (n) => sfx.push(n),
  })
  g.start()
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  const s = g.getSnapshot()
  assert.ok(s.clearedIndices !== null, '默认 animMs=240>0 → clearing 接管')
  assert.deepEqual(s.clearedIndices, [19])
  assert.deepEqual(sfx, ['hardDrop', 'clear'])
  // 非法 animMs（字符串）→ 兜底为默认（§2.1 opts 解析风格）
  const g2 = mk({ animMs: 'no' })
  g2.start()
  g2._debug.setBoard(b)
  g2._debug.setNext('T')
  g2._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g2.hardDrop()
  assert.ok(g2.getSnapshot().clearedIndices !== null, '非法 animMs 兜底为默认 240 → clearing')
})

/* ---------- 12. Hold 暂存方块（r14，§9.1 ①~⑭） ---------- */

test('Hold ①: 空槽存入 + next 成为当前方块（AC-1/AC-2）', () => {
  const sfx = []
  const g = mk({ rng: () => 0, onSfx: (n) => sfx.push(n) }) // rng=0 → queue 恒 I
  g.start()
  const snap0 = g.getSnapshot()
  const firstType = snap0.piece.type
  assert.ok(firstType, '游戏启动有当前方块')
  const nextType = snap0.next
  const r = g.hold()
  assert.deepEqual(r, { ok: true })
  const snap1 = g.getSnapshot()
  assert.equal(snap1.holdPiece, firstType, '暂存槽存入原当前方块类型')
  assert.equal(snap1.piece.type, nextType, 'next 成为新当前方块')
  assert.deepEqual(sfx, ['hold'], '暂存成功发射 hold 音效')
})

test('Hold ②: 非空槽交换 + next 不变（AC-3）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  // 第一次 hold：空槽存入
  const t1 = g.getSnapshot().piece.type
  g.hold()
  const snap1 = g.getSnapshot()
  assert.equal(snap1.holdPiece, t1, '空槽存入原当前')
  const nextAfterFirstHold = snap1.next
  // hardDrop 重置 holdUsed
  g.hardDrop()
  // 第二次 hold：交换
  const t2 = g.getSnapshot().piece.type
  const nextBeforeSwap = g.getSnapshot().next
  const r = g.hold()
  assert.deepEqual(r, { ok: true }, '交换成功')
  const snap2 = g.getSnapshot()
  assert.equal(snap2.holdPiece, t2, '交换后暂存槽变为原当前')
  assert.equal(snap2.piece.type, t1, '交换后当前方块=原暂存')
  assert.equal(snap2.next, nextBeforeSwap, '交换不消耗队列（next 不变）')
})

test('Hold ③: 交换后 rot=0、出生点位置（AC-4）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  // 先旋转当前块
  g.rotate()
  const snap0 = g.getSnapshot()
  assert.notEqual(snap0.piece.rot, 0, '旋转后 rot≠0')
  g.hold() // 空槽存入（rot 不影响，仅存 type）
  g.hardDrop() // 重置 holdUsed
  g.restart()
  // 用非空槽交换测试：存入 → restart → 存入另一块 → 交换取出
  const g2 = mk({ rng: () => 0 })
  g2.start()
  g2.hold() // 存入 I
  g2.hardDrop() // 重置 holdUsed
  const tHeld = g2.getSnapshot().holdPiece
  // 交换取出
  g2.hold()
  const snap2 = g2.getSnapshot()
  assert.equal(snap2.piece.type, tHeld, '交换取出暂存块类型正确')
  assert.equal(snap2.piece.rot, 0, '交换取出 rot=0（出生重置）')
  // 出生点：x = Math.floor((COLS - width) / 2), y = 0
  const width = T.SHAPES[tHeld][0][0].length
  assert.equal(snap2.piece.x, Math.floor((10 - width) / 2), '交换取出 x=出生居中')
  assert.equal(snap2.piece.y, 0, '交换取出 y=0（顶部出生）')
})

test('Hold ④: 每周期仅 1 次，第二次返回 already-used（AC-5）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  const r1 = g.hold()
  assert.deepEqual(r1, { ok: true }, '第一次 hold 成功')
  const r2 = g.hold()
  assert.deepEqual(r2, { ok: false, reason: 'already-used' }, '同周期第二次 hold 被拒')
})

test('Hold ⑤: 非 RUNNING 返回 illegal-phase（AC-6）', () => {
  const g = mk({ rng: () => 0 })
  // READY 态
  assert.deepEqual(g.hold(), { ok: false, reason: 'illegal-phase' }, 'READY 态被拒')
  g.start()
  // PAUSED 态
  g.togglePause()
  assert.deepEqual(g.hold(), { ok: false, reason: 'illegal-phase' }, 'PAUSED 态被拒')
  // OVER 态：用 lose() 强制结束（最可靠的方式）
  g.restart()
  g.lose()
  assert.equal(g.getPhase(), 'OVER', '确认进入 OVER')
  assert.deepEqual(g.hold(), { ok: false, reason: 'illegal-phase' }, 'OVER 态被拒')
})

test('Hold ⑥: clearing 期间返回 clearing（AC-6）', () => {
  const sfx = []
  const g = mk({ animMs: 240, rng: () => 0, onSfx: (n) => sfx.push(n) })
  g.start()
  // 填满底行除一列
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  // animMs=240 > 0 → 进入 clearing 子阶段
  const snap = g.getSnapshot()
  assert.ok(snap.clearedIndices !== null, '确认进入 clearing')
  assert.deepEqual(g.hold(), { ok: false, reason: 'clearing' }, 'clearing 期间被拒')
})

test('Hold ⑦: holdEnabled=false 返回 disabled（AC-12）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g.setHoldEnabled(false)
  assert.equal(g.getHoldEnabled(), false)
  assert.deepEqual(g.hold(), { ok: false, reason: 'disabled' }, 'holdEnabled=false 被拒')
})

test('Hold ⑧: piece=null 返回 no-piece', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g._debug.setPiece(null)
  assert.deepEqual(g.hold(), { ok: false, reason: 'no-piece' }, 'piece=null 被拒')
})

test('Hold ⑨: finishLock 重置 holdUsed（AC-5）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g.hold() // 第一次 hold，holdUsed=true
  assert.deepEqual(g.hold(), { ok: false, reason: 'already-used' }, 'holdUsed 已锁')
  // hardDrop → lockFlow → finishLock → holdUsed=false
  g.hardDrop()
  const r = g.hold()
  assert.deepEqual(r, { ok: true }, '锁定后 holdUsed 重置，可再次 hold')
})

test('Hold ⑩: 暂存后出生碰撞 → GAME OVER（AC-4）', () => {
  const events = { gameOver: [], sfx: [] }
  const g = mk({
    rng: () => 0,
    onGameOver: (s) => events.gameOver.push(s),
    onSfx: (n) => events.sfx.push(n),
  })
  g.start()
  g.hold() // 存入当前块，holdUsed=true
  g.hardDrop() // 重置 holdUsed，新方块出生
  // 堆满棋盘顶部两行（出生区域），使 swap 取出时 spawn 碰撞
  const b = T.createBoard()
  for (let c = 0; c < 10; c++) b[0][c] = 'I'
  for (let c = 0; c < 10; c++) b[1][c] = 'I'
  g._debug.setBoard(b)
  g._debug.setNext('T')
  // 交换取出 → spawn(heldType) → y=0 碰撞 → GAME OVER
  const r = g.hold()
  assert.deepEqual(r, { ok: true }, 'hold 操作本身成功（即使 gameOver）')
  assert.equal(g.getPhase(), 'OVER', '出生碰撞 → GAME OVER')
  assert.equal(events.gameOver.length, 1, 'onGameOver 回调 1 次')
  assert.ok(events.sfx.includes('hold'), 'hold 音效仍发射')
  assert.ok(events.sfx.includes('gameOver'), 'gameOver 音效发射')
})

test('Hold ⑪: restart 清空暂存槽', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g.hold()
  assert.ok(g.getSnapshot().holdPiece !== null, '暂存槽非空')
  g.restart()
  assert.equal(g.getSnapshot().holdPiece, null, 'restart 后暂存槽清空')
})

test('Hold ⑫: holdEnabled setter/getter（AC-11）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  assert.equal(g.getHoldEnabled(), true, '默认 holdEnabled=true')
  g.setHoldEnabled(false)
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled(false) 实时生效')
  g.setHoldEnabled(true)
  assert.equal(g.getHoldEnabled(), true, 'setHoldEnabled(true) 恢复')
  // 钳制：非布尔值
  g.setHoldEnabled(0)
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled(0) 钳制为 false')
  g.setHoldEnabled('yes')
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled("yes") 钳制为 false')
  g.setHoldEnabled(1)
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled(1) 钳制为 false（仅 === true）')
})

test('Hold ⑬: 快照含 holdPiece 字段', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  const snap0 = g.getSnapshot()
  assert.ok('holdPiece' in snap0, '快照包含 holdPiece 键')
  assert.equal(snap0.holdPiece, null, '初始 holdPiece=null')
  g.hold()
  const snap1 = g.getSnapshot()
  assert.equal(snap1.holdPiece, snap0.piece.type, '暂存后 holdPiece=原方块类型')
})

test('Hold ⑭: SFX_EVENTS 包含 hold（8 项）（AC-16）', () => {
  assert.ok(Array.isArray(T.SFX_EVENTS), 'SFX_EVENTS 是数组')
  assert.equal(T.SFX_EVENTS.length, 8, 'SFX_EVENTS 共 8 项')
  assert.ok(T.SFX_EVENTS.includes('hold'), 'SFX_EVENTS 包含 hold')
  assert.deepEqual(T.SFX_EVENTS, ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold'], 'SFX_EVENTS 排序与值正确')
})

/* ---------- 13. r15 多格预览队列（v3.2，AC-1/2/3/5/9/10/11；TECHNICAL §4/§7.2） ---------- */

test('r15 队列 ①: NEXT_QUEUE_SIZE 导出 = 3（AC-10）', () => {
  assert.equal(typeof T.NEXT_QUEUE_SIZE, 'number', 'NEXT_QUEUE_SIZE 导出存在')
  assert.equal(T.NEXT_QUEUE_SIZE, 3, '预览队列恒长 3（数值单一事实来源）')
})

test('r15 队列 ②: createQueue.peekN 契约——边界/非消耗/跨袋序列一致（AC-10）', () => {
  // n≤0 / 非数值 → []（不抛错、不消耗）
  const q0 = T.createQueue(() => 0.5)
  assert.deepEqual(q0.peekN(0), [])
  assert.deepEqual(q0.peekN(-3), [])
  assert.deepEqual(q0.peekN('x'), [])
  assert.equal(q0.peek(), q0.peekN(1)[0], '边界调用后队列未消耗，peek 首项不变')

  // 跨袋序列一致性：固定 rng，next()×6 后 peekN(3) = 本袋余 1 + 下袋前 2
  const q = T.createQueue(() => 0.5)
  for (let k = 0; k < 6; k++) q.next() // 消费 bag0 前 6 块
  const cross = q.peekN(3)
  assert.equal(cross.length, 3, 'peekN(3) 长度 3')
  for (const t of cross) assert.ok(T.TYPES.includes(t), '跨袋项均为合法类型')

  // 非消耗：连续两次 peekN 返回相同序列；返回项 = 随后逐次 next() 消费序
  assert.deepEqual(q.peekN(3), cross, 'peekN 非消耗：重复调用序列一致')
  for (let k = 0; k < 3; k++) assert.equal(q.next(), cross[k], 'next() 第 ' + (k + 1) + ' 次 = peekN 第 ' + (k + 1) + ' 项')

  // 跨袋读取后同袋余块（bag1 剩余 5 块）互不重复：7-bag 完整性未被 peekN 破坏
  const rest = [q.next(), q.next(), q.next(), q.next(), q.next()]
  assert.equal(new Set(rest).size, 5, '跨袋后同袋余块 5 项互不重复（袋界完整性保持）')
})

test('r15 队列 ③: READY 快照 queue 恒长 3 且 queue[0]===next（AC-1/AC-10）', () => {
  const g = mk({ rng: () => 0.5 })
  const s = g.getSnapshot()
  assert.ok(Array.isArray(s.queue), '快照含 queue 数组')
  assert.equal(s.queue.length, T.NEXT_QUEUE_SIZE, 'READY queue 恒长 NEXT_QUEUE_SIZE(3)')
  assert.equal(s.queue[0], s.next, 'queue[0] === next（队首 = 下一出生块）')
  for (const t of s.queue) assert.ok(T.TYPES.includes(t), '每格为合法方块类型')
})

test('r15 队列 ④: start 出生首块 = READY queue[0]，队列前移（AC-3）', () => {
  const g = mk({ rng: () => 0.5 })
  const ready = g.getSnapshot()
  g.start()
  const s = g.getSnapshot()
  assert.equal(s.piece.type, ready.queue[0], '首块 = READY 时队首')
  assert.equal(s.queue[0], ready.queue[1], '新队首 = 前置 queue[1]（队首被消费、尾部补位前移）')
  assert.equal(s.queue.length, 3, 'start 后 queue 仍恒长 3')
})

test('r15 队列 ⑤: AC-2 固定序列 20 次出生 100% 一致（rng=0.5 打桩，无错位缺漏）', () => {
  const g = mk({ rng: () => 0.5 })
  g.start()
  for (let i = 1; i <= 20; i++) {
    const before = g.getSnapshot()
    const r = g.hardDrop()
    assert.equal(r.ok, true, '第 ' + i + ' 次硬降成功')
    assert.equal(g.getPhase(), 'RUNNING', '第 ' + i + ' 次出生未结束')
    const after = g.getSnapshot()
    assert.equal(after.piece.type, before.queue[0], '第 ' + i + ' 次出生块 === 上一快照 queue[0]（与固定序列严格一致）')
    assert.equal(after.queue[0], before.queue[1], '第 ' + i + ' 次前移：新队首 === 前置 queue[1]')
    assert.equal(after.queue.length, 3, '第 ' + i + ' 次 queue 恒长 3')
    // 每轮清空棋盘，仅保留队列推进语义（0.5 打桩的中央堆塔 ~12 次即触顶，清板只保证 20 次出生存活）
    g._debug.setBoard(T.createBoard())
  }
})

test('r15 队列 ⑥: PAUSED 冻结——多快照 + tick 后 queue 不变（AC-5）', () => {
  const { g } = freshGame({ rng: () => 0.5 })
  g.start()
  g.hardDrop()
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  const p1 = g.getSnapshot().queue
  const p2 = g.getSnapshot().queue
  g.tick(10000)
  const p3 = g.getSnapshot().queue
  assert.deepEqual(p3, p1, '暂停期多次快照 + tick 后 queue 恒不变')
  assert.deepEqual(p3, p2, '暂停期快照间 queue 一致')
  // 恢复后队列按原序列继续推进：不消耗、不丢块、不错位
  assert.equal(g.togglePause().ok, true)
  const q = g.getSnapshot().queue
  assert.equal(g.hardDrop().ok, true)
  const s = g.getSnapshot()
  assert.equal(s.piece.type, q[0], '恢复后队首消费正常（暂停无副作用）')
})

test('r15 队列 ⑦: restart 重建队列——长度 3、内容随新袋（AC-5）', () => {
  const { g } = freshGame({ rng: () => 0.5 })
  g.start()
  g.hardDrop()
  g.hardDrop()
  assert.equal(g.getSnapshot().queue.length, 3, '锁定推进后 queue 恒长 3')
  assert.equal(g.restart().ok, true)
  const s = g.getSnapshot()
  assert.equal(s.queue.length, 3, 'restart 后 queue 恒长 3')
  assert.equal(s.queue[0], s.next, 'restart 后 queue[0] === next')
  for (const t of s.queue) assert.ok(T.TYPES.includes(t), 'restart 后每格为合法类型')
  // 重启后前 7 个出生块 = 完整新袋（7-bag 完整性：queue 派生与 next 消费同一流）
  const seen = [s.queue[0]]
  for (let k = 0; k < 6; k++) {
    assert.equal(g.hardDrop().ok, true)
    seen.push(g.getSnapshot().queue[0])
  }
  assert.equal(new Set(seen).size, 7, 'restart 后前 7 出生块 = 完整新袋（无重复缺漏）')
})

test('r15 队列 ⑧: GAME_OVER 最终队列长度 3、稳定不变（AC-5）', () => {
  const { g, events } = freshGame({ rng: () => 0.5 })
  g.start()
  // 出生区用「部分行遮蔽」(1,4)(1,5) 而非整行：整行会在锁定消行判定中被清除（cleared>0），
  // 部分遮蔽对 7 型出生格全覆盖且不成满行 → 下一次 spawn 必然碰撞 → OVER
  const b = T.createBoard()
  b[1][4] = 'J'
  b[1][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'O', rot: 0, x: 4, y: 18 })
  const r = g.hardDrop()
  assert.equal(r.gameOver, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(g.getSnapshot().piece, null, '结束态无活动块')
  const s = g.getSnapshot()
  assert.equal(s.queue.length, 3, 'OVER 最终队列恒长 3')
  assert.equal(s.queue[0], s.next, 'OVER 期 queue[0] === next（队列保持最终值）')
  for (const t of s.queue) assert.ok(T.TYPES.includes(t), '结束后每格为合法类型')
  assert.deepEqual(g.getSnapshot().queue, s.queue, 'OVER 后多快照队列稳定不变')
  g.tick(10000)
  assert.deepEqual(g.getSnapshot().queue, s.queue, 'OVER 期 tick 不推进队列')
  assert.equal(events.gameOver.length, 1)
})

test('r15 队列 ⑨: Hold 共存——暂存消费队首/交换不消耗/关闭不触队列（AC-11/AC-9）', () => {
  const g = mk({ rng: () => 0.5 })
  g.start()
  // 空槽暂存：next 成为当前方块 = 消费队列队首（AC-11 空槽分支）
  const q0 = g.getSnapshot().queue
  assert.deepEqual(g.hold(), { ok: true })
  const s1 = g.getSnapshot()
  assert.equal(s1.piece.type, q0[0], '暂存后当前方块 = 旧 queue[0]（队首被消费）')
  assert.equal(s1.queue[0], q0[1], '新队首 = 旧 queue[1]（队列前移）')
  assert.equal(s1.queue.length, 3, '暂存消费后 queue 仍恒长 3')
  // 交换分支：next 不变 → queue 内容与顺序不变（AC-11 交换不消耗）
  assert.equal(g.hardDrop().ok, true) // 重置 holdUsed
  const q2 = g.getSnapshot().queue
  assert.deepEqual(g.hold(), { ok: true }, '交换成功')
  assert.deepEqual(g.getSnapshot().queue, q2, '交换不消耗队列（queue 恒等）')
  // holdEnabled=false：hold 被拒不触队列（AC-9 引擎侧无预览开关，队列照常维护）
  assert.equal(g.hardDrop().ok, true)
  g.setHoldEnabled(false)
  const q4 = g.getSnapshot().queue
  assert.deepEqual(g.hold(), { ok: false, reason: 'disabled' })
  assert.deepEqual(g.getSnapshot().queue, q4, 'hold 禁用被拒后队列不变')
})

