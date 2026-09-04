'use strict'
/*!
 * tetris/scripts/verify-persist.cjs — 持久化层自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-persist.cjs
 *
 * 背景（v2.6 技术驱动改造，变更单 docs/teamflow/technical/changes-persist.md §3）：
 * persist.js 是纯逻辑无 DOM 的独立 UMD 模块，可在 Node 直接 require 单测。
 * 本脚本覆盖变更单 §3 / §5 列出的全部持久化语义：
 *   1. 键读写往返（跨实例共享存储，模拟「刷新后恢复」）；
 *   2. available=false 内存降级（Node 无 localStorage → 会话内读写正常、刷新不清的场景）；
 *   3. 损坏 JSON / 版本不符 → 清键回默认（绝不 throw）；
 *   4. sanitize 边界（最高分负数/NaN/超界、音量越界、布尔非白名单回默认）；
 *   5. saveHighScore 只增不减；
 *   6. dispose 后不再写、load/save* 不抛错。
 * 作为持久化层回归锚点，独立于既有六套验证脚本。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../persist.js')

// —— 测试用「真实回写底层」：对齐 Storage API 子集的确定性共享容器（跨实例持久）——
function makeBacking(initial) {
  const m = Object.create(null)
  if (initial) for (const k of Object.keys(initial)) m[k] = String(initial[k])
  return {
    raw: m,
    get: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null },
    set: function (k, v) { m[k] = String(v) },
    remove: function (k) { if (Object.prototype.hasOwnProperty.call(m, k)) delete m[k] },
  }
}

// 直接在底层写入一段原始 JSON（用于伪造坏数据/版本不符）
function seedRaw(backing, key, raw) {
  backing.raw[key] = String(raw)
}

/* ============================================================================
 * 1. 模块导出面（装配审计亦依赖：persist 必须导出 UMD 双面 + 工厂/纯函数）
 * ========================================================================== */
test('persist: 导出契约齐全（VERSION/键/默认值/工厂/sanitize）', () => {
  assert.equal(typeof P.VERSION, 'string')
  assert.equal(typeof P.sanitize, 'function')
  assert.equal(typeof P.createStorage, 'function')
  assert.equal(typeof P.createPersistence, 'function')
  assert.equal(typeof P.TETRIS_PERSIST_KEY, 'string')
  assert.equal(typeof P.PAYLOAD_VERSION, 'number')
  assert.equal(typeof P.DEFAULT_HIGH_SCORE, 'number')
  assert.equal(typeof P.DEFAULT_SETTINGS, 'object')
  // 键名/默认值对齐变更单 §3 与 ui.js 现状语义
  assert.equal(P.TETRIS_PERSIST_KEY, 'tetris.v2')
  assert.equal(P.DEFAULT_SETTINGS.volume, 0.8)
  assert.equal(P.DEFAULT_SETTINGS.muted, false)
  assert.equal(P.DEFAULT_SETTINGS.ghostEnabled, true)
  assert.equal(P.DEFAULT_SETTINGS.bgmEnabled, false)
  assert.equal(P.DEFAULT_SETTINGS.wallKickEnabled, true) // v2.9：踢墙开关默认开（AC-19.1）
  assert.equal(P.DEFAULT_SETTINGS.holdEnabled, true) // v3.2：暂存方块开关默认开（AC-14）
  assert.equal(P.DEFAULT_SETTINGS.previewQueueEnabled, true) // v3.2：多格预览队列开关默认开（AC-8）
})

/* ============================================================================
 * 2. 键读写往返（注入共享存储 → 跨实例恢复，等价「刷新后恢复」）
 * ========================================================================== */
test('persist: 最高分/设置键读写往返（跨实例持久）', () => {
  const backing = makeBacking()
  const p1 = P.createPersistence({ storage: backing })
  const loaded1 = p1.load()
  assert.equal(loaded1.highScore, 0, '初始最高分默认 0')
  assert.deepEqual(loaded1.settings, P.DEFAULT_SETTINGS, '初始设置默认值')

  p1.saveHighScore(120)
  // r24 登记改写（唯一一处）：往返用例补 dockSkin 字段——新字段进入真实写/读往返覆盖
  p1.saveSettings({ volume: 0.5, muted: true, ghostEnabled: false, bgmEnabled: true, wallKickEnabled: false, holdEnabled: false, previewQueueEnabled: false, dockSkin: 'pod',
    keybindings: { moveLeft: 'a', moveRight: 'd', softDrop: 's', hardDrop: 'w', rotate: 'j', hold: 'h', togglePause: 'p', restart: 'r', mute: 'm' } })

  // 新实例（等价刷新重开）读回同一底层 → 恢复
  const p2 = P.createPersistence({ storage: backing })
  const loaded2 = p2.load()
  assert.equal(loaded2.highScore, 120, '最高分跨实例恢复')
  assert.deepEqual(loaded2.settings, {
    volume: 0.5,
    muted: true,
    ghostEnabled: false,
    bgmEnabled: true,
    wallKickEnabled: false,
    holdEnabled: false,
    previewQueueEnabled: false,
    dockSkin: 'pod',
    keybindings: { moveLeft: 'a', moveRight: 'd', softDrop: 's', hardDrop: 'w', rotate: 'j', hold: 'h', togglePause: 'p', restart: 'r', mute: 'm' },
  }, '九设置跨实例恢复（含 dockSkin + r31 keybindings）')
})

/* ============================================================================
 * 2b. 真实 Web Storage API 形状对抗（BUG-P1-1 回归锚点）
 * 原生 window.localStorage 只有 getItem/setItem/removeItem（无 get/set/remove）。
 * 注入完全等价于真实 localStorage 的形状，断言读写/落盘/跨实例恢复全链路正确，
 * 杜绝「探测过、调用炸」的适配器漂移再次出现（单测形状与真实适配形状必须一致）。
 * ========================================================================== */
test('persist: 真实 Web Storage 形状（仅 getItem/setItem/removeItem）全链路正确（BUG-P1-1）', () => {
  // 严格只暴露 Web Storage 三方法，故意不含 get/set/remove —— 正是 BUG-P1-1 的静默源
  const m = Object.create(null)
  const lsShaped = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null },
    setItem: function (k, v) { m[k] = String(v) },
    removeItem: function (k) { if (Object.prototype.hasOwnProperty.call(m, k)) delete m[k] },
  }

  const p1 = P.createPersistence({ storage: lsShaped })
  const initial = p1.load()
  assert.equal(initial.highScore, 0, '初始最高分默认 0')
  assert.deepEqual(initial.settings, P.DEFAULT_SETTINGS, '初始设置默认值')

  p1.saveHighScore(250)
  p1.saveSettings({ volume: 0.6, muted: true, ghostEnabled: false, bgmEnabled: true, wallKickEnabled: false })

  // 断言真实落盘（经 setItem/getItem 可读回，未走 get/set）
  const raw = lsShaped.getItem(P.TETRIS_PERSIST_KEY)
  assert.equal(typeof raw, 'string', '真实形状下值确实写入底层')
  assert.ok(raw.indexOf('"highScore":250') !== -1, '最高分已落盘')

  // 新实例（等价刷新重开）读回 —— 若适配器漂移此处必丢（BUG-P1-1 复现点）
  const p2 = P.createPersistence({ storage: lsShaped })
  const restored = p2.load()
  assert.equal(restored.highScore, 250, '真实形状跨实例恢复最高分')
  assert.equal(restored.settings.volume, 0.6, '恢复音量')
  assert.equal(restored.settings.muted, true, '恢复静音')
  assert.equal(restored.settings.ghostEnabled, false, '恢复幽灵开关')
  assert.equal(restored.settings.bgmEnabled, true, '恢复 BGM 开关')
  assert.equal(restored.settings.wallKickEnabled, false, '恢复踢墙开关（AC-19.6）')
  assert.equal(restored.settings.previewQueueEnabled, true, '缺省 previewQueueEnabled 字段 → 恢复默认开（AC-8）')
})

/* ============================================================================
 * 3. available=false 内存降级（Node 无 localStorage → 会话内读写正常）
 * ========================================================================== */
test('persist: createStorage 在无 localStorage 环境 available=false（内存降级）', () => {
  const storage = P.createStorage()
  assert.equal(storage.available, false, 'Node 无 window.localStorage → 降级内存')

  // 默认 createPersistence（内部用内存存储）：会话内 save→load 往返正常
  const p = P.createPersistence()
  p.saveHighScore(77)
  assert.equal(p.load().highScore, 77, '内存降级下会话内读写往返正常')
  p.saveSettings({ volume: 0.3 })
  assert.equal(p.load().settings.volume, 0.3)
})

/* ============================================================================
 * 4. 损坏 JSON / 版本不符 → 清键回默认（绝不 throw）
 * ========================================================================== */
test('persist: 坏 JSON 清键回默认且清掉键', () => {
  const backing = makeBacking()
  seedRaw(backing, P.TETRIS_PERSIST_KEY, '{ not valid json !!!')
  const p = P.createPersistence({ storage: backing })
  let loaded
  assert.doesNotThrow(() => { loaded = p.load() })
  assert.equal(loaded.highScore, 0, '坏 JSON → 最高分回默认 0')
  assert.deepEqual(loaded.settings, P.DEFAULT_SETTINGS, '坏 JSON → 设置回默认')
  assert.equal(backing.get(P.TETRIS_PERSIST_KEY), null, '坏 JSON 被清键')
})

test('persist: 版本不符清键回默认', () => {
  const backing = makeBacking()
  seedRaw(backing, P.TETRIS_PERSIST_KEY,
    JSON.stringify({ version: 999, highScore: 500, settings: { volume: 1 } }))
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.equal(loaded.highScore, 0, '版本不符 → 最高分回默认')
  assert.deepEqual(loaded.settings, P.DEFAULT_SETTINGS, '版本不符 → 设置回默认')
  assert.equal(backing.get(P.TETRIS_PERSIST_KEY), null, '版本不符被清键')
})

/* ============================================================================
 * 5. sanitize 边界（负数 / NaN / 非布尔 / 超界）
 * ========================================================================== */
test('persist: sanitize integer（最高分）边界', () => {
  const int = (v, def) => P.sanitize(v, { type: 'integer', min: 0, max: Infinity, def })
  assert.equal(int(-5, 0), 0, '负数 → 回默认 0')
  assert.equal(int(NaN, 0), 0, 'NaN → 回默认 0')
  assert.equal(int('abc', 0), 0, '非数值字符串 → 回默认 0')
  assert.equal(int(4.9, 0), 4, '浮点 → floor 取整')
  assert.equal(int('12', 0), 12, '数值字符串 → 归一')
  assert.equal(P.sanitize(10, { type: 'integer', min: 0, max: 8, def: 0 }), 8, '超界 → 收敛上界')
})

test('persist: sanitize float（音量）边界', () => {
  const vol = (v) => P.sanitize(v, { type: 'float', min: 0, max: 1, def: 0.8 })
  assert.equal(vol(-1), 0.8, '负数 → 回默认')
  assert.equal(vol(NaN), 0.8, 'NaN → 回默认')
  assert.equal(vol(5), 1, '超上界 → 收敛 1')
  assert.equal(vol(0.5), 0.5, '区间内保留')
})

test('persist: sanitize boolean（五设置白名单）边界', () => {
  const bool = (v, def) => P.sanitize(v, { type: 'boolean', def })
  assert.equal(bool(true, false), true, 'true 保留')
  assert.equal(bool(false, true), false, 'false 保留')
  assert.equal(bool('1', false), false, '字符串非白名单 → 回默认')
  assert.equal(bool(1, false), false, '数值 1 非布尔 → 回默认')
  assert.equal(bool(0, true), true, '数值 0 非布尔 → 回默认')
  assert.equal(bool(undefined, false), false, 'undefined → 回默认')
})

/* ============================================================================
 * 5b. holdEnabled sanitize 边界（AC-14：非布尔回默认 true）
 * ========================================================================== */
test('persist: holdEnabled sanitize 边界（非布尔回默认 true）', () => {
  const bool = (v) => P.sanitize(v, { type: 'boolean', def: P.DEFAULT_SETTINGS.holdEnabled })
  assert.equal(bool(true), true, 'true 保留')
  assert.equal(bool(false), false, 'false 保留')
  assert.equal(bool('1'), true, '字符串非白名单 → 回默认 true')
  assert.equal(bool(1), true, '数值 1 → 回默认 true')
  assert.equal(bool(0), true, '数值 0 → 回默认 true')
  assert.equal(bool(undefined), true, 'undefined → 回默认 true')
  assert.equal(bool(null), true, 'null → 回默认 true')
})

/* ============================================================================
 * 5c. 旧数据兼容（无 holdEnabled 字段 → 回默认 true）
 * ========================================================================== */
test('persist: 旧数据无 holdEnabled 字段 → 回默认 true（向后兼容）', () => {
  const backing = makeBacking()
  // 伪造一份不含 holdEnabled 的旧版载荷（v2.9 格式）
  const legacy = {
    version: P.PAYLOAD_VERSION,
    highScore: 300,
    settings: { volume: 0.7, muted: false, ghostEnabled: true, bgmEnabled: false, wallKickEnabled: true },
  }
  seedRaw(backing, P.TETRIS_PERSIST_KEY, JSON.stringify(legacy))
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.equal(loaded.highScore, 300, '旧载荷最高分恢复')
  assert.equal(loaded.settings.holdEnabled, true, '无 holdEnabled 字段 → 回默认 true')
  // 其他字段正常
  assert.equal(loaded.settings.volume, 0.7)
  assert.equal(loaded.settings.wallKickEnabled, true)
})

/* ============================================================================
 * 5d. previewQueueEnabled sanitize 边界（AC-8：非布尔回默认 true）
 * ========================================================================== */
test('persist: previewQueueEnabled sanitize 边界（非布尔回默认 true）', () => {
  const bool = (v) => P.sanitize(v, { type: 'boolean', def: P.DEFAULT_SETTINGS.previewQueueEnabled })
  assert.equal(bool(true), true, 'true 保留')
  assert.equal(bool(false), false, 'false 保留')
  assert.equal(bool('1'), true, '字符串非白名单 → 回默认 true')
  assert.equal(bool(1), true, '数值 1 → 回默认 true')
  assert.equal(bool(0), true, '数值 0 → 回默认 true')
  assert.equal(bool(undefined), true, 'undefined → 回默认 true')
  assert.equal(bool(null), true, 'null → 回默认 true')
})

/* ============================================================================
 * 5e. 旧数据兼容（无 previewQueueEnabled 字段 → 回默认 true，additive 不升版）
 * ========================================================================== */
test('persist: 旧数据无 previewQueueEnabled 字段 → 回默认 true（向后兼容）', () => {
  const backing = makeBacking()
  // 伪造一份不含 previewQueueEnabled 的旧版载荷（r14 格式）
  const legacy = {
    version: P.PAYLOAD_VERSION,
    highScore: 300,
    settings: { volume: 0.7, muted: false, ghostEnabled: true, bgmEnabled: false, wallKickEnabled: true, holdEnabled: false },
  }
  seedRaw(backing, P.TETRIS_PERSIST_KEY, JSON.stringify(legacy))
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.equal(loaded.highScore, 300, '旧载荷最高分恢复')
  assert.equal(loaded.settings.holdEnabled, false, '旧载荷 holdEnabled 恢复')
  assert.equal(loaded.settings.previewQueueEnabled, true, '无 previewQueueEnabled 字段 → 回默认 true')
  // 其他字段正常
  assert.equal(loaded.settings.volume, 0.7)
  assert.equal(loaded.settings.wallKickEnabled, true)
  // PAYLOAD_VERSION 不升（additive）：仍为 1
  assert.equal(P.PAYLOAD_VERSION, 1, 'additive 新增字段不升 PAYLOAD_VERSION')
})

/* ============================================================================
 * 6. 只增不减（saveHighScore）
 * ========================================================================== */
test('persist: saveHighScore 只增不减', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveHighScore(100)
  assert.equal(p.load().highScore, 100, '首写 100')

  p.saveHighScore(50)
  assert.equal(p.load().highScore, 100, '较小值不覆盖（只增不减）')

  p.saveHighScore(150)
  assert.equal(p.load().highScore, 150, '更大值正常更新')

  p.saveHighScore(-99)
  assert.equal(p.load().highScore, 150, '负值不清零不覆盖（只增不减）')
})

/* ============================================================================
 * 7. dispose 后不再写、load/save* 不抛错
 * ========================================================================== */
test('persist: dispose 后不再写、load/save* 不抛错', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveHighScore(100)
  p.saveSettings({ volume: 0.4 })

  p.dispose()

  let saveRet
  assert.doesNotThrow(() => { saveRet = p.saveHighScore(200) })
  assert.equal(saveRet, false, 'dispose 后 saveHighScore 返回 false（不写）')
  // dispose 后不再写：底层键值应仍为 dispose 前的载荷，未被 200 覆盖
  const stored = backing.get(P.TETRIS_PERSIST_KEY)
  assert.equal(typeof stored, 'string', 'dispose 不删既有键（留给会话内）')
  assert.ok(!stored.includes('"highScore":200'), 'dispose 后未把 200 写进底层')

  let loaded
  assert.doesNotThrow(() => { loaded = p.load() })
  assert.equal(loaded.highScore, 0, 'dispose 后 load 回默认（内存镜像已清）')

  let stRet
  assert.doesNotThrow(() => { stRet = p.saveSettings({ ghostEnabled: false }) })
  assert.equal(stRet, false, 'dispose 后 saveSettings 返回 false（不写）')
})

/* ============================================================================
 * 8. r24 操作区背景 dockSkin（纯追加段：AC-8 通道同源、additive 不升版）
 * ========================================================================== */
test('persist: DOCK_SKINS 枚举导出与默认值（r24）', () => {
  assert.deepEqual(P.DOCK_SKINS, ['glass', 'float', 'fade', 'pod'], 'DOCK_SKINS 四枚举单一事实来源')
  assert.equal(P.DEFAULT_SETTINGS.dockSkin, 'fade', 'DEFAULT_SETTINGS.dockSkin 默认 C 渐隐')
})

test('persist: sanitize string 枚举矩阵（白名单/非法/非字符串/def 缺省，r24）', () => {
  const skin = (v, def) => P.sanitize(v, { type: 'string', values: P.DOCK_SKINS, def })
  assert.equal(skin('glass', 'fade'), 'glass', '白名单命中保留')
  assert.equal(skin('pod', 'fade'), 'pod', '白名单命中保留')
  assert.equal(skin('opaque', 'fade'), 'fade', '枚举外非法值 → 回 def')
  assert.equal(skin('', 'fade'), 'fade', '空字符串非法 → 回 def')
  assert.equal(skin(42, 'fade'), 'fade', '非字符串 → 回 def')
  assert.equal(skin(null, 'fade'), 'fade', 'null → 回 def')
  assert.equal(skin(undefined, 'fade'), 'fade', 'undefined/缺失 → 回 def')
  assert.equal(skin('glass'), 'glass', 'def 缺省但值合法 → 返回原值（不 throw）')
  assert.equal(P.sanitize('glass', null), undefined, 'schema 非法 → 安全 undefined')
})

test('persist: 旧载荷缺 dockSkin 字段 → 恢复默认 fade（additive 向后兼容，r24）', () => {
  const backing = makeBacking()
  // 伪造一份不含 dockSkin 的 r23 载荷（四轴计分后格式）
  const legacy = {
    version: P.PAYLOAD_VERSION,
    highScore: 300,
    settings: { volume: 0.7, muted: false, ghostEnabled: true, bgmEnabled: false, wallKickEnabled: true, holdEnabled: false, previewQueueEnabled: true },
  }
  seedRaw(backing, P.TETRIS_PERSIST_KEY, JSON.stringify(legacy))
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.equal(loaded.highScore, 300, '旧载荷最高分恢复')
  assert.equal(loaded.settings.dockSkin, 'fade', '无 dockSkin 字段 → 回默认 fade')
  assert.equal(P.PAYLOAD_VERSION, 1, 'additive 新增字段不升 PAYLOAD_VERSION')
})

test('persist: 非法 dockSkin 值经 saveSettings/readState 清洗回默认 fade（AC-8 非法回退）', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveSettings({ volume: 0.5, dockSkin: 'neon' })
  const loaded = p.load()
  assert.equal(loaded.settings.dockSkin, 'fade', 'saveSettings 非法枚举 → 清洗回默认 fade')
  assert.equal(loaded.settings.volume, 0.5, '其余字段不受影响')
})

/* ============================================================================
 * 9. r31 自定义按键持久化（纯追加段：settings.keybindings 白名单清洗，additive 不升版）
 * ============================================================================ */
test('persist: r31 KEY_ACTIONS/DEFAULT_KEYBINDINGS 默认键表导出契约', () => {
  assert.deepEqual(P.KEY_ACTIONS,
    ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotate', 'hold', 'togglePause', 'restart', 'mute'],
    '9 动作固定序（move+soft+hard+rotate+hold+shift 系）')
  assert.deepEqual(P.DEFAULT_KEYBINDINGS, {
    moveLeft: 'arrowleft', moveRight: 'arrowright', softDrop: 'arrowdown',
    hardDrop: ' ', rotate: 'arrowup', hold: 'c', togglePause: 'p', restart: 'r', mute: 'm',
  }, '默认键表与 game.js DEFAULT_KEYBINDINGS 双声明')
  assert.equal(P.DEFAULT_SETTINGS.keybindings.moveLeft, 'arrowleft', 'DEFAULT_SETTINGS.keybindings 含默认表')
})

test('persist: r31 normalizeKey / isBindableKey 判定矩阵', () => {
  assert.equal(P.normalizeKey('ArrowLeft'), 'arrowleft', '大小写箭头归一')
  assert.equal(P.normalizeKey('M'), 'm', '大写字母归一')
  assert.equal(P.normalizeKey(' '), ' ', '空格保持')
  assert.equal(P.normalizeKey('  '), null, '空白 → null')
  assert.equal(P.normalizeKey(123), null, '非字符串 → null')
  assert.equal(P.normalizeKey(''), null, '空串 → null')
  assert.ok(P.isBindableKey('a') && P.isBindableKey('A') && P.isBindableKey('1') && P.isBindableKey('.') && P.isBindableKey(' '), '单字符可打印/空格准入')
  assert.ok(P.isBindableKey('ArrowLeft') && P.isBindableKey('arrowup'), '四方向键准入')
  assert.equal(P.isBindableKey('Escape'), false, 'Escape 黑名单')
  assert.equal(P.isBindableKey('Enter'), false, 'Enter 黑名单')
  assert.equal(P.isBindableKey('Shift'), false, 'Shift 黑名单')
  assert.equal(P.isBindableKey('Control'), false, 'Control 黑名单')
  assert.equal(P.isBindableKey('F1') || P.isBindableKey('f12'), false, 'F1–F12 黑名单')
  assert.equal(P.isBindableKey('CapsLock'), false, 'CapsLock 黑名单')
  assert.equal(P.isBindableKey('Insert'), false, 'Insert 黑名单')
  assert.equal(P.isBindableKey(''), false, '空串不可绑定')
})

test('persist: r31 sanitizeKeybindings 9 动作白名单清洗（非法/冲突回退默认，幂等）', () => {
  const def = P.DEFAULT_KEYBINDINGS
  const ok = P.sanitizeKeybindings(null)
  assert.deepEqual(ok, def, 'null → 全默认')
  // 单动作改键 + 其余回默认
  const partial = P.sanitizeKeybindings({ moveLeft: 'a' })
  assert.equal(partial.moveLeft, 'a', '部分表合法键生效')
  assert.equal(partial.mute, def.mute, '未给字段回默认')
  // 非法值回退默认
  const bad = P.sanitizeKeybindings({ hardDrop: 'Escape', rotate: 'Shift', mute: 'F5' })
  assert.equal(bad.hardDrop, def.hardDrop, '黑名单键回默认')
  assert.equal(bad.rotate, def.rotate, '修饰键回默认')
  assert.equal(bad.mute, def.mute, 'F 键回默认')
  // 冲突一对一：后位撞前位 → 回默认
  const conflict = P.sanitizeKeybindings({ moveLeft: 'c', hold: 'c' })
  assert.equal(conflict.hold, def.hold, 'hold 撞 moveLeft' + " 'c' → hold 回默认（一对一）")
  // 大写输入归一
  const upper = P.sanitizeKeybindings({ restart: 'R' })
  assert.equal(upper.restart, 'r', '大写 R 归一为小写 r')
})

test('persist: r31 keybindings 经真实写/读往返恢复 + 旧载荷缺字段回默认（additive 不升版）', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveSettings({ keybindings: { moveLeft: 'q', moveRight: 'e', softDrop: 's' } })
  const restored = P.createPersistence({ storage: backing }).load()
  assert.equal(restored.settings.keybindings.moveLeft, 'q', '改键跨实例恢复')
  assert.equal(restored.settings.keybindings.moveRight, 'e', '改键跨实例恢复')
  assert.equal(restored.settings.keybindings.softDrop, 's', '改键跨实例恢复')
  assert.equal(restored.settings.keybindings.hardDrop, P.DEFAULT_KEYBINDINGS.hardDrop, '未给字段回默认')
  assert.equal(P.PAYLOAD_VERSION, 1, 'additive 新增 keybindings 不升 PAYLOAD_VERSION')
  // 旧载荷（无 keybindings 字段）→ 添加默认表（backward compatible）
  const legacy = { version: P.PAYLOAD_VERSION, highScore: 5, settings: { volume: 0.7, muted: false } }
  const backing2 = makeBacking()
  seedRaw(backing2, P.TETRIS_PERSIST_KEY, JSON.stringify(legacy))
  const old = P.createPersistence({ storage: backing2 }).load()
  assert.deepEqual(old.settings.keybindings, P.DEFAULT_KEYBINDINGS, '旧载荷无 keybindings → 补默认表')
})

/* ============================================================================
 * 10. r34 全局统计持久化（纯追加段：saveStats 只增不减累加 / 旧载荷全 0 / 空增量 /
 *     降级 / dispose / 混合保留；PAYLOAD_VERSION 保持 1——additive 不升版）
 * ========================================================================== */
test('r34: DEFAULT_STATS 导出 + load 初始 stats 全 0（PAYLOAD_VERSION 仍 1）', () => {
  assert.deepEqual(P.DEFAULT_STATS, { placed: 0, lines: 0, timeMs: 0, games: 0 }, 'DEFAULT_STATS 四元组默认')
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.deepEqual(loaded.stats, { placed: 0, lines: 0, timeMs: 0, games: 0 }, '空库存初始 stats 全 0')
  assert.equal(P.PAYLOAD_VERSION, 1, 'r34 新增 stats 字段不升 PAYLOAD_VERSION（additive）')
})

test('r34: saveStats 写入→读出 roundtrip（跨实例恢复）', () => {
  const backing = makeBacking()
  const p1 = P.createPersistence({ storage: backing })
  p1.saveStats({ placed: 12, lines: 30, timeMs: 60000, games: 3 })
  const p2 = P.createPersistence({ storage: backing }) // 等价刷新重开
  const loaded2 = p2.load()
  assert.deepEqual(loaded2.stats, { placed: 12, lines: 30, timeMs: 60000, games: 3 }, '四字段跨实例恢复')
})

test('r34: 只增不减——负/NaN/非数增量清洗为 0 不叠加；浮点 floor；叠加单调递增', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveStats({ placed: 5, lines: 0, timeMs: 1000, games: 1 })
  p.saveStats({ placed: -3, lines: NaN, timeMs: 'x', games: -1 }) // 各字段非法 → 0
  let s = p.load().stats
  assert.deepEqual(s, { placed: 5, lines: 0, timeMs: 1000, games: 1 }, '非法增量零叠加（只增不减天然成立）')
  p.saveStats({ placed: 2.9, lines: 3.7, timeMs: 250.9, games: 0.9 }) // 浮点 → floor
  s = p.load().stats
  assert.equal(s.placed, 7, 'placed 5+2（floor 2.9）')
  assert.equal(s.lines, 3, 'lines 0+3（floor 3.7）')
  assert.equal(s.timeMs, 1250, 'timeMs 1000+250（floor 250.9）')
  assert.equal(s.games, 1, 'games 1+0（floor 0.9）')
  p.saveStats({ placed: 0, lines: 0, timeMs: 500, games: 0 })
  assert.equal(p.load().stats.timeMs, 1750, '部分字段增量单字段叠加')
})

test('r34: 空增量快路径——返回 true 且底层字符串不变（不写盘）', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveStats({ placed: 5, lines: 0, timeMs: 0, games: 0 })
  const before = backing.get(P.TETRIS_PERSIST_KEY)
  const ret = p.saveStats({ placed: 0, lines: 0, timeMs: 0, games: 0 })
  assert.equal(ret, true, '空增量按成功返回')
  assert.equal(backing.get(P.TETRIS_PERSIST_KEY), before, '空增量未写盘（幂等快路径）')
  assert.equal(p.saveStats(undefined), true, 'delta 缺失 → 空增量成功不写盘')
})

test('r34: 旧载荷（仅 highScore+settings）→ stats 全 0 且 highScore 原值保留（AC-3）', () => {
  const legacy = { version: P.PAYLOAD_VERSION, highScore: 300, settings: { volume: 0.7, muted: true } }
  const backing = makeBacking()
  seedRaw(backing, P.TETRIS_PERSIST_KEY, JSON.stringify(legacy))
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.equal(loaded.highScore, 300, '旧载荷最高分原值保留')
  assert.equal(loaded.settings.volume, 0.7, '旧载荷设置原值保留')
  assert.deepEqual(loaded.stats, { placed: 0, lines: 0, timeMs: 0, games: 0 }, '旧载荷无 stats → 全 0（AC-3）')
})

test('r34: 内存降级（无 localStorage）saveStats 不 throw 且成功；dispose 后 false', () => {
  const p = P.createPersistence() // 内存 Map
  let ret
  assert.doesNotThrow(() => { ret = p.saveStats({ placed: 7, lines: 1, timeMs: 500, games: 1 }) })
  assert.equal(ret, true, '内存降级 saveStats 静默成功')
  assert.deepEqual(p.load().stats, { placed: 7, lines: 1, timeMs: 500, games: 1 }, '降级下会话内往返')
  p.dispose()
  assert.equal(p.saveStats({ placed: 1, lines: 0, timeMs: 0, games: 0 }), false, 'dispose 后 saveStats 返回 false')
})

test('r34: 混合保留——saveStats 不改 highScore/settings；saveHighScore/saveSettings 不清 stats（单键顶端字段保全）', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveHighScore(120)
  p.saveSettings({ volume: 0.5, muted: true, ghostEnabled: false, bgmEnabled: true, wallKickEnabled: false, holdEnabled: false, previewQueueEnabled: false, dockSkin: 'pod', keybindings: { moveLeft: 'a' } })
  p.saveStats({ placed: 4, lines: 1, timeMs: 2000, games: 1 })
  let loaded = p.load()
  assert.equal(loaded.highScore, 120, 'saveStats 后 highScore 原值不变')
  assert.equal(loaded.settings.muted, true, 'saveStats 后 settings 原值不变')
  assert.deepEqual(loaded.stats, { placed: 4, lines: 1, timeMs: 2000, games: 1 }, 'stats 入账完毕')
  // 兜底红线：随后 saveHighScore/saveSettings 均整体写盘——不得清掉已入账 stats
  p.saveHighScore(150)
  loaded = p.load()
  assert.equal(loaded.highScore, 150, '更高分写入成功')
  assert.deepEqual(loaded.stats, { placed: 4, lines: 1, timeMs: 2000, games: 1 }, 'saveHighScore 后 stats 保留（单键顶端字段保全）')
  p.saveSettings({ volume: 0.3 })
  loaded = p.load()
  assert.equal(loaded.settings.volume, 0.3, '设置更新成功')
  assert.deepEqual(loaded.stats, { placed: 4, lines: 1, timeMs: 2000, games: 1 }, 'saveSettings 后 stats 保留（单键顶端字段保全）')
})
